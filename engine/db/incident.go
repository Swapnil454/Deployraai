package db

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"log"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/your-org/uptime-engine/core"
)

const deadLetterFile = "incidents.jsonl"
var dlMu sync.Mutex

func isPermanent(err error) bool {
	var pg *pgconn.PgError
	return errors.As(err, &pg) && (strings.HasPrefix(pg.Code, "23") || strings.HasPrefix(pg.Code, "22"))
}

func StartIncidentWorkers(ctx context.Context, wg *sync.WaitGroup, pool *pgxpool.Pool, workerCount int) {
	core.OnIncidentOverflow = appendDeadLetter

	var breakerUntil atomic.Int64

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					DrainQueueToDeadLetter()
					return
				case evt := <-core.IncidentQueue:
					if time.Now().UnixNano() < breakerUntil.Load() {
						appendDeadLetter(evt)
						continue
					}

					dbErr, rowsAffected := executeIncidentWrite(ctx, pool, evt)
					switch {
					case dbErr == nil:
						if evt.NewStatus == "UP" && rowsAffected == 0 && time.Since(evt.OccurredAt) <= 24*time.Hour {
							// Phantom UP arrived before DOWN. Store in dead-letter to replay after DOWN.
							appendDeadLetter(evt)
						}
					case isPermanent(dbErr):
						log.Printf("Dropping unwritable incident %s: %v", evt.EventID, dbErr)
					default:
						breakerUntil.Store(time.Now().Add(30 * time.Second).UnixNano())
						appendDeadLetter(evt)
					}
				}
			}
		}()
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		ReplayDeadLetters(ctx, pool) // On boot
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				ReplayDeadLetters(ctx, pool)
			}
		}
	}()
}

func executeIncidentWrite(ctx context.Context, pool *pgxpool.Pool, evt core.IncidentEvent) (error, int64) {
	if evt.NewStatus == "UP" && time.Since(evt.OccurredAt) > 24*time.Hour {
		return nil, 1 // Discard old UPs
	}

	var finalErr error
	var finalRows int64

	for attempt := 1; attempt <= 3; attempt++ {
		if attempt > 1 {
			select {
			case <-time.After(time.Duration(attempt) * time.Second):
			case <-ctx.Done():
				return context.Canceled, 0
			}
		}

		queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		tx, err := pool.Begin(queryCtx)
		if err != nil {
			cancel()
			finalErr = err
			continue
		}

		if evt.NewStatus == "DOWN" {
			query := `
				INSERT INTO uptime_incidents (id, monitor_id, cause, first_error_message, started_at)
				VALUES ($1, $2, $3, $4, $5)
				ON CONFLICT DO NOTHING
			`
			cause := "Engine Probe Failed"
			if evt.Cause != "" {
				cause = evt.Cause
			}
			firstError := "Engine probe detected failure"
			if evt.FirstErrorMessage != "" {
				firstError = evt.FirstErrorMessage
			}
			_, finalErr = tx.Exec(queryCtx, query, evt.EventID, evt.ID, cause, firstError, evt.OccurredAt)
			if finalErr == nil {
				_, finalErr = tx.Exec(queryCtx, "UPDATE uptime_monitors SET status='down' WHERE id=$1", evt.ID)
			}
			finalRows = 1
		} else {
			query := `
				UPDATE uptime_incidents 
				SET resolved_at = $2 
				WHERE monitor_id = $1 AND resolved_at IS NULL
			`
			var res pgconn.CommandTag
			res, err = tx.Exec(queryCtx, query, evt.ID, evt.OccurredAt)
			finalErr = err
			if err == nil {
				finalRows = res.RowsAffected()
				_, finalErr = tx.Exec(queryCtx, "UPDATE uptime_monitors SET status='up' WHERE id=$1", evt.ID)
			}
		}

		if finalErr == nil {
			finalErr = tx.Commit(queryCtx)
		} else {
			tx.Rollback(queryCtx)
		}
		cancel()

		if finalErr == nil {
			return nil, finalRows
		}
		if isPermanent(finalErr) {
			return finalErr, 0 // Don't retry permanent errors
		}
		log.Printf("Incident write failed (attempt %d/3) for %s: %v", attempt, evt.ID, finalErr)
	}
	return finalErr, 0
}

func appendDeadLetter(evt core.IncidentEvent) {
	dlMu.Lock()
	defer dlMu.Unlock()

	f, err := os.OpenFile(deadLetterFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("CRITICAL: Failed to open dead-letter file: %v", err)
		return
	}
	defer f.Close()

	b, err := json.Marshal(evt)
	if err == nil {
		f.Write(append(b, '\n'))
	}
}

func DrainQueueToDeadLetter() {
	for {
		select {
		case evt := <-core.IncidentQueue:
			appendDeadLetter(evt)
		default:
			return
		}
	}
}

func ReplayDeadLetters(ctx context.Context, pool *pgxpool.Pool) {
	if len(core.IncidentQueue) > 4000 {
		return
	}

	processReplayingFile(ctx, pool, deadLetterFile+".replaying")

	dlMu.Lock()
	err := os.Rename(deadLetterFile, deadLetterFile+".replaying")
	dlMu.Unlock()

	if err == nil {
		processReplayingFile(ctx, pool, deadLetterFile+".replaying")
	}
}

func processReplayingFile(ctx context.Context, pool *pgxpool.Pool, filename string) {
	f, err := os.Open(filename)
	if err != nil {
		return
	}

	var pending []core.IncidentEvent
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var evt core.IncidentEvent
		if err := json.Unmarshal(line, &evt); err == nil {
			pending = append(pending, evt)
		}
	}
	f.Close()

	if len(pending) == 0 {
		os.Remove(filename)
		return
	}

	log.Printf("Replaying %d dead-letter incidents from %s...", len(pending), filename)
	var remaining []core.IncidentEvent

	for i, evt := range pending {
		dbErr, rowsAffected := executeIncidentWrite(ctx, pool, evt)
		if dbErr != nil {
			if isPermanent(dbErr) {
				log.Printf("Dropping unwritable incident during replay %s: %v", evt.EventID, dbErr)
				continue
			}
			// Stop burning time if DB is down
			remaining = append(remaining, pending[i:]...)
			break
		}
		if evt.NewStatus == "UP" && rowsAffected == 0 && time.Since(evt.OccurredAt) <= 24*time.Hour {
			// Still phantom, keep in queue
			remaining = append(remaining, evt)
		}
	}

	if len(remaining) == 0 {
		os.Remove(filename)
	} else {
		// Rewrite remaining + current deadLetterFile to a temp file
		dlMu.Lock()
		defer dlMu.Unlock()

		tempFile := deadLetterFile + ".tmp"
		tf, err := os.Create(tempFile)
		if err != nil {
			return
		}

		for _, evt := range remaining {
			if b, err := json.Marshal(evt); err == nil {
				tf.Write(append(b, '\n'))
			}
		}

		// Append any new events that arrived in deadLetterFile while we were replaying
		cf, err := os.Open(deadLetterFile)
		if err == nil {
			cScanner := bufio.NewScanner(cf)
			for cScanner.Scan() {
				tf.Write(append(cScanner.Bytes(), '\n'))
			}
			cf.Close()
		}
		tf.Close()

		os.Rename(tempFile, deadLetterFile)
		os.Remove(filename)
	}
}
