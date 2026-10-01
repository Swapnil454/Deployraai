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
			flushMetrics(context.Background(), pool)
			return
		case <-ticker.C:
			flushMetrics(ctx, pool)
		}
	}
}

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
			SET last_checked_at = NOW(), current_interval_seconds = t.interval 
			FROM unnest($1::uuid[], $2::int[]) AS t(id, interval) 
			WHERE uptime_monitors.id = t.id
		`
		_, err2 := pool.Exec(ctx, updateQuery, ids, currentIntervals)
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
