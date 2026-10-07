//go:debug tlsmlkem=0
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/your-org/uptime-engine/core"
	"github.com/your-org/uptime-engine/db"
	"github.com/your-org/uptime-engine/ebpf"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	cfg, err := pgxpool.ParseConfig(os.Getenv("DATABASE_URL_POOLED"))
	if err != nil {
		log.Fatalf("Parse config failed: %v", err)
	}
	cfg.ConnConfig.DefaultQueryExecMode = pgx.QueryExecModeSimpleProtocol

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		log.Fatalf("Pool init failed: %v", err)
	}

	db.ReplayDeadLetters(ctx, pool)
	db.HydrateWithRetry(ctx, pool, 10)

	var skippedCount int
	core.Store.Mu.RLock()
	monitorCount := len(core.Store.Monitors)
	core.InitTLSConfig(monitorCount)

	for _, p := range core.Store.Monitors {
		if p.Load().Type != "http" {
			skippedCount++
		}
	}
	core.Store.Mu.RUnlock()
	if !core.EnableEngineB && skippedCount > 0 {
		log.Printf("WARNING: Engine B is gated. %d non-HTTP monitors will be silently skipped.", skippedCount)
	}

	var wg sync.WaitGroup
	wg.Add(2)

	go db.StartReconciliationLoop(ctx, pool, 5*time.Minute, &wg)
	go db.StartListener(ctx, os.Getenv("DATABASE_URL_DIRECT"), pool, &wg) // Port 5432 (Session Required)

	if core.EnableEngineB {
		wg.Add(1)
		go db.StartDNSRefreshLoop(ctx, &wg)
	}

	// --- Phase 2: Start Dual-Engine Prober ---
	// Channel must hold at least one slot per monitor so the first-tick
	// burst (all 35k monitors due simultaneously after boot jitter) never
	// causes the dispatcher to skip monitors and print "HTTP queue full".
	// We use separate channels to prevent HTTP workers blocked on DNS/tarpits from starving ping/port/dns monitors.
	channelSize := 500000 // Hardcoded to 500k to support dynamic DB seeding without queue full drops
	httpJobs := make(chan core.DispatchJob, channelSize)
	netJobs := make(chan core.DispatchJob, channelSize)

	// 10 Postgres incident workers to prevent connection stampedes
	db.StartIncidentWorkers(ctx, &wg, pool, 10)

	wg.Add(1)
	go db.StartMetricsFlushLoop(ctx, &wg, pool)

	if chURL := os.Getenv("UPTIMER_CLICKHOUSE_URL"); chURL != "" {
		if opts, err := clickhouse.ParseDSN(chURL); err == nil {
			opts.MaxOpenConns = 2
			opts.DialTimeout = 5 * time.Second
			opts.ReadTimeout = 30 * time.Second
			if conn, err := clickhouse.Open(opts); err == nil {
				core.StartTelemetryFlusher(ctx, &wg, conn, core.Config{MaxRows: 10000, FlushEvery: 5 * time.Second})
				core.StartTelemetryReplayer(ctx, &wg, conn)
				log.Println("ClickHouse telemetry flusher started")
			} else {
				log.Printf("Failed to open ClickHouse connection: %v", err)
			}
		} else {
			log.Printf("Failed to parse ClickHouse DSN: %v", err)
		}
	} else {
		log.Println("UPTIMER_CLICKHOUSE_URL not set, telemetry disabled")
	}

	// Default worker count: 1 worker per 20 monitors.
	// We no longer cap this at 5000, ensuring we have enough concurrent workers
	// to drain the queue even when thousands of real-world targets tarpit or timeout.
	httpWorkers := monitorCount / 20
	if httpWorkers < 500 {
		httpWorkers = 500
	}
	if hwStr := os.Getenv("HTTP_WORKERS"); hwStr != "" {
		if hw, err := strconv.Atoi(hwStr); err == nil && hw > 0 {
			httpWorkers = hw
		}
	}

	// Configurable FastHTTP workers
	core.StartWorkers(ctx, &wg, httpWorkers, httpJobs)
	
	// Fast network workers for ping, port, dns
	core.StartWorkers(ctx, &wg, 500, netJobs)

	// Quorum State Machine Dispatcher (Shell)
	core.StartConfirmationDispatcher(ctx, &wg, 10)

	// eBPF Reader (Ping events)
	ebpf.StartEBPFReader(ctx, &wg)

	// Master Dispatcher (evaluates NextCheckAt and AwaitingResult)
	wg.Add(1)
	go core.MasterDispatcher(ctx, &wg, httpJobs, netJobs)

	// Reaper (Safety net for missed timeouts)
	wg.Add(1)
	go core.StartReaper(ctx, &wg)

	// Body-stats logger: one [BODY_STATS] line per minute per cohort+encoding.
	// stopStats is closed when ctx is cancelled so the goroutine exits cleanly.
	stopStats := make(chan struct{})
	go func() {
		<-ctx.Done()
		close(stopStats)
	}()
	core.StartBodyStatsLogger(time.Minute, stopStats)

	// Admin server: runtime config without redeploy.
	// POST /admin/compression?pct=N  → sets CompressionPercent atomically (0-100).
	// GET  /admin/compression        → returns current value.
	adminAddr := os.Getenv("ADMIN_ADDR")
	if adminAddr == "" {
		adminAddr = "127.0.0.1:9101"
	}
	core.StartAdminServer(adminAddr)

	<-ctx.Done()
	log.Println("Shutting down cleanly... waiting for routines to exit")

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		log.Println("All routines exited gracefully")
	case <-time.After(15 * time.Second):
		log.Println("WARNING: Shutdown timeout exceeded, some routines may have leaked! Forcing dead-letter drain.")
	}

	db.DrainQueueToDeadLetter() // Final catch-all for events generated during shutdown
	pool.Close()
	log.Println("Shutdown complete.")
}
