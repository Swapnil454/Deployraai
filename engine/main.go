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
	channelSize := monitorCount + monitorCount/10 + 1000 // +10% headroom
	if channelSize < 5000 { channelSize = 5000 }
	httpJobs := make(chan *core.Monitor, channelSize)

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

	// Default worker count: 1 worker per 20 monitors, capped at 5000.
	// At 35k monitors this gives 1750 workers which is plenty to drain
	// the queue within the 30s check interval.
	httpWorkers := monitorCount / 20
	if httpWorkers < 500 { httpWorkers = 500 }
	if httpWorkers > 5000 { httpWorkers = 5000 }
	if hwStr := os.Getenv("HTTP_WORKERS"); hwStr != "" {
		if hw, err := strconv.Atoi(hwStr); err == nil && hw > 0 {
			httpWorkers = hw
		}
	}

	// Configurable FastHTTP workers
	core.StartWorkers(ctx, &wg, httpWorkers, httpJobs)

	// Quorum State Machine Dispatcher (Shell)
	core.StartConfirmationDispatcher(ctx, &wg, 10)

	// eBPF Reader (Ping events)
	ebpf.StartEBPFReader(ctx, &wg)

	// Master Dispatcher (evaluates NextCheckAt and AwaitingResult)
	wg.Add(1)
	go core.MasterDispatcher(ctx, &wg, httpJobs)

	// Reaper (Safety net for missed timeouts)
	wg.Add(1)
	go core.StartReaper(ctx, &wg)

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
