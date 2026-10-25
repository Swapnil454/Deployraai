package db

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/your-org/uptime-engine/core"
)

func StartMetricsFlushLoop(ctx context.Context, wg *sync.WaitGroup, pool *pgxpool.Pool) {
	defer wg.Done()
	ticker := time.NewTicker(60 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			fctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
			flushMetrics(fctx, pool)
			cancel()
			return
		case <-ticker.C:
			// A flush that is already running when shutdown starts gets 3s to finish instead of
			// being cancelled: cancelling rolls the whole statement back and loses a minute of counts.
			pctx, pcancel := context.WithTimeout(context.WithoutCancel(ctx), 30*time.Second)
			stopGrace := context.AfterFunc(ctx, func() { time.AfterFunc(3*time.Second, pcancel) })
			flushMetrics(pctx, pool)
			stopGrace()
			pcancel()
		}
	}
}

// flushChunkSize bounds each INSERT/UPDATE pair. Chunks that complete before a deadline stay
// persisted; the rest keep their counts in memory for the next flush.
const flushChunkSize = 5000

func flushMetrics(ctx context.Context, pool *pgxpool.Pool) {
	core.Store.Mu.RLock()
	var ptrs []*atomic.Pointer[core.Monitor]
	for _, p := range core.Store.Monitors {
		ptrs = append(ptrs, p)
	}
	core.Store.Mu.RUnlock()

	var ids []string
	var dates []time.Time
	var totals []int
	var oks []int
	var latencies []int64
	var currentIntervals []int

	now := time.Now().UTC().Truncate(24 * time.Hour) // Date only

	for _, p := range ptrs {
		if p.Load().ChecksTotal == 0 {
			continue
		}
		old, _, ok := core.CASUpdateReturning(p, func(m *core.Monitor) {
			m.ChecksTotal = 0
			m.ChecksOK = 0
			m.LatencySumMs = 0
		})
		if !ok || old.ChecksTotal == 0 {
			continue
		}

		ids = append(ids, old.ID)
		dates = append(dates, now)
		totals = append(totals, int(old.ChecksTotal))
		oks = append(oks, int(old.ChecksOK))
		latencies = append(latencies, int64(old.LatencySumMs))
		currentIntervals = append(currentIntervals, old.CurrentInterval)
	}

	if len(ids) == 0 {
		return
	}

	t0 := time.Now()
	skipped := 0
	for start := 0; start < len(ids); start += flushChunkSize {
		end := start + flushChunkSize
		if end > len(ids) {
			end = len(ids)
		}
		if ctx.Err() != nil {
			restoreCounts(ids[start:end], totals[start:end], oks[start:end], latencies[start:end])
			skipped += end - start
			continue
		}
		flushChunk(ctx, pool, ids[start:end], dates[start:end], totals[start:end], oks[start:end], latencies[start:end], currentIntervals[start:end])
	}
	log.Printf("[METRICS_FLUSH] rows=%d chunks=%d skipped_rows=%d elapsed=%s", len(ids), (len(ids)+flushChunkSize-1)/flushChunkSize, skipped, time.Since(t0).Round(time.Millisecond))
}

// restoreCounts puts counts that were taken for a flush back into the in-memory monitors.
func restoreCounts(ids []string, totals []int, oks []int, latencies []int64) {
	for i, id := range ids {
		core.Store.Mu.RLock()
		p, ok := core.Store.Monitors[id]
		core.Store.Mu.RUnlock()
		if ok {
			core.CASUpdate(p, func(m *core.Monitor) {
				m.ChecksTotal += uint64(totals[i])
				m.ChecksOK += uint64(oks[i])
				m.LatencySumMs += uint64(latencies[i])
			})
		}
	}
}

func flushChunk(ctx context.Context, pool *pgxpool.Pool, ids []string, dates []time.Time, totals []int, oks []int, latencies []int64, currentIntervals []int) {
	query := `
		INSERT INTO uptime_daily_metrics (monitor_id, date, total_checks, successful_checks, total_response_time_ms)
		SELECT * FROM unnest($1::uuid[], $2::date[], $3::int[], $4::int[], $5::bigint[])
		ON CONFLICT (monitor_id, date) DO UPDATE SET 
			total_checks = uptime_daily_metrics.total_checks + EXCLUDED.total_checks,
			successful_checks = uptime_daily_metrics.successful_checks + EXCLUDED.successful_checks,
			total_response_time_ms = uptime_daily_metrics.total_response_time_ms + EXCLUDED.total_response_time_ms
	`

	_, err := pool.Exec(ctx, query, ids, dates, totals, oks, latencies)
	if err == nil {
		updateQuery := `
			UPDATE uptime_monitors 
			SET last_checked_at = NOW(), current_interval_seconds = t.interval,
				status = CASE WHEN uptime_monitors.status = 'pending' AND t.ok > 0 THEN 'up' ELSE uptime_monitors.status END 
			FROM unnest($1::uuid[], $2::int[], $3::int[]) AS t(id, interval, ok) 
			WHERE uptime_monitors.id = t.id
		`
		_, err2 := pool.Exec(ctx, updateQuery, ids, currentIntervals, oks)
		if err2 != nil {
			log.Printf("Failed to flush last_checked_at for %d monitors: %v", len(ids), err2)
		}
	} else {
		log.Printf("Failed to flush %d metrics: %v", len(ids), err)
		// Rollback add
		for i, id := range ids {
			core.Store.Mu.RLock()
			p, ok := core.Store.Monitors[id]
			core.Store.Mu.RUnlock()
			if ok {
				core.CASUpdate(p, func(m *core.Monitor) {
					m.ChecksTotal += uint64(totals[i])
					m.ChecksOK += uint64(oks[i])
					m.LatencySumMs += uint64(latencies[i])
				})
			}
		}
	}
}
