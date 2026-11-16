package db

import (
	"context"
	"fmt"
	"log"
	"strings"
	"sync"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/your-org/uptime-engine/core"
)

// StartCheckLogWorkers consumes CheckLogQueue from core and flushes batch inserts into PostgreSQL uptime_checks_log.
func StartCheckLogWorkers(ctx context.Context, wg *sync.WaitGroup, pool *pgxpool.Pool) {
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(1 * time.Second)
		defer ticker.Stop()

		var batch []core.CheckLogEvent

		flush := func() {
			if len(batch) == 0 {
				return
			}
			toFlush := batch
			batch = nil
			go flushCheckLogs(pool, toFlush)
		}

		for {
			select {
			case <-ctx.Done():
				flush()
				return
			case evt := <-core.CheckLogQueue:
				batch = append(batch, evt)
				if len(batch) >= 100 {
					flush()
				}
			case <-ticker.C:
				flush()
			}
		}
	}()
}

func flushCheckLogs(pool *pgxpool.Pool, logs []core.CheckLogEvent) {
	if len(logs) == 0 {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var valueStrings []string
	var valueArgs []interface{}
	argIdx := 1

	for _, item := range logs {
		var statusVal *int
		if item.StatusCode > 0 {
			code := item.StatusCode
			statusVal = &code
		}
		var errVal *string
		if item.ErrorMessage != "" {
			msg := item.ErrorMessage
			errVal = &msg
		}

		valueStrings = append(valueStrings, fmt.Sprintf("($%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			argIdx, argIdx+1, argIdx+2, argIdx+3, argIdx+4, argIdx+5, argIdx+6, argIdx+7))
		valueArgs = append(valueArgs, item.MonitorID, item.CheckedAt, item.Success, statusVal, item.LatencyMs, errVal, item.Location, item.LatencyUs)
		argIdx += 8
	}

	query := fmt.Sprintf(`
		INSERT INTO uptime_checks_log (monitor_id, checked_at, success, status_code, response_time_ms, error_message, location, latency_us)
		VALUES %s
	`, strings.Join(valueStrings, ","))

	_, err := pool.Exec(ctx, query, valueArgs...)
	if err != nil {
		log.Printf("[CHECKLOG] Batch insert of %d checks failed: %v", len(logs), err)
	}
}
