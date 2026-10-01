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
	httpJobs := make(chan *core.Monitor, 5000)

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

	httpWorkers := 2000
	if hwStr := os.Getenv("HTTP_WORKERS"); hwStr != "" {
		if hw, err := strconv.Atoi(hwStr); err == nil && hw > 0 {
			httpWorkers = hw
		}
	}

	// Configurable FastHTTP workers
	core.StartHTTPWorkers(ctx, &wg, httpWorkers, httpJobs)

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
	wg.Wait()
	db.DrainQueueToDeadLetter() // Final catch-all for events generated during shutdown
	pool.Close()
	log.Println("Shutdown complete.")
}
