//go:debug tlsmlkem=0
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"runtime"
	"runtime/pprof"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/your-org/uptime-engine/core"
	"github.com/your-org/uptime-engine/db"
	"github.com/your-org/uptime-engine/ebpf"
	"github.com/your-org/uptime-engine/netsec"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	if os.Getenv("DISABLE_SSRF_BLOCKER") == "true" {
		netsec.DisableSSRFBlocker = true
		log.Println("WARNING: SSRF Blocker is DISABLED via environment variable")
	}

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
	if csStr := os.Getenv("CHANNEL_SIZE"); csStr != "" {
		if cs, err := strconv.Atoi(csStr); err == nil && cs > 0 {
			channelSize = cs
		}
	}
	httpJobs := make(chan core.DispatchJob, channelSize)
	netJobs := make(chan core.DispatchJob, channelSize)

	// 10 Postgres incident workers to prevent connection stampedes
	db.StartIncidentWorkers(ctx, &wg, pool, 10)

	wg.Add(1)
	go db.StartMetricsFlushLoop(ctx, &wg, pool)

	var chConn clickhouse.Conn
	if chURL := os.Getenv("UPTIMER_CLICKHOUSE_URL"); chURL != "" {
		if opts, err := clickhouse.ParseDSN(chURL); err == nil {
			opts.MaxOpenConns = 10
			opts.MaxIdleConns = 1
			opts.ConnMaxLifetime = 1 * time.Minute
			opts.DialTimeout = 2 * time.Second
			opts.ReadTimeout = 2 * time.Second
			if conn, err := clickhouse.Open(opts); err == nil {
				chConn = conn
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

	core.LogEffectiveConfig(httpWorkers)

	// Workers tracked on workerWg so shutdown can bound their drain to 1.5s
	// and abandon in-flight slow handshakes without blocking exit 0.
	var workerWg sync.WaitGroup
	core.StartWorkers(ctx, &workerWg, httpWorkers, httpJobs)
	core.StartWorkers(ctx, &workerWg, 500, netJobs)

	// Quorum State Machine Dispatcher (Shell)
	core.StartConfirmationDispatcher(ctx, &wg, 10)

	// eBPF Reader (Ping events)
	if err := ebpf.StartEBPFReader(ctx, &wg); err != nil {
		log.Printf("Warning: eBPF reader not started: %v (skipping kernel XDP ping interception)", err)
	}

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

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				var m runtime.MemStats
				runtime.ReadMemStats(&m)
				fds := 0
				if entries, err := os.ReadDir("/proc/self/fd"); err == nil {
					fds = len(entries)
				}
				noKeepAlive := 0
				core.Store.Mu.RLock()
				for _, ptr := range core.Store.Monitors {
					if ptr.Load().NoKeepAlive {
						noKeepAlive++
					}
				}
				core.Store.Mu.RUnlock()
				log.Printf("[PROCESS_STATS] goroutines=%d open_fds=%d heap_sys_mb=%d heap_alloc_mb=%d no_keepalive_monitors=%d mock_net_bytes=%d",
					runtime.NumGoroutine(), fds, m.Sys/(1024*1024), m.Alloc/(1024*1024), noKeepAlive,
					core.MockNetBytesIn.Load()+core.MockNetBytesOut.Load())
			}
		}
	}()

	go func() {
		time.Sleep(120 * time.Second)
		log.Println("=== START GOROUTINE PROFILE (120s) ===")
		pprof.Lookup("goroutine").WriteTo(os.Stdout, 2)
		log.Println("=== END GOROUTINE PROFILE ===")
	}()

	<-ctx.Done()
	shutdownStart := time.Now()
	// --- Bounded shutdown (Goal 1, Requirement 5) ---
	// 1. ctx cancelled: MasterDispatcher immediately stops dispatching new jobs.
	// 2. Wait up to 1.5s for workers to complete in-flight checks cleanly.
	//    Remaining workers are abandoned (their fasthttp req/res stay isolated and are not returned to pools).
	// 3. Final telemetry drain & flush with short timeout + replay spool to ClickHouse.
	// 4. Exit 0 in under 5s.
	log.Println("[SHUTDOWN] ctx cancelled — dispatcher stopped, draining workers...")

	workerDone := make(chan struct{})
	go func() {
		workerWg.Wait()
		close(workerDone)
	}()

	select {
	case <-workerDone:
		log.Printf("[SHUTDOWN_TIMING] Workers drained cleanly in %.3fs", time.Since(shutdownStart).Seconds())
	case <-time.After(1500 * time.Millisecond):
		log.Printf("[SHUTDOWN_TIMING] Worker drain budget (1.5s) reached — abandoning remaining in-flight requests")
	}

	// Phase 3: Final telemetry drain & flush to ClickHouse
	if chConn != nil {
		core.FinalTelemetryDrainAndFlush(chConn, 2*time.Second)
	}

	// Drain core service routines
	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		log.Printf("[SHUTDOWN_TIMING] All core routines exited cleanly in %.3fs", time.Since(shutdownStart).Seconds())
	case <-time.After(1500 * time.Millisecond):
		log.Printf("[SHUTDOWN_TIMING] Core routines wait timed out after %.3fs", time.Since(shutdownStart).Seconds())
	}

	inFlight := uint64(len(core.TelemetryQueue)) + uint64(core.ActiveBufRows.Load())
	log.Printf("[RUN_COUNTERS] telemetry_enqueued=%d telemetry_flushed=%d telemetry_failed=%d telemetry_dropped=%d telemetry_in_flight=%d checks_in_flight=%d invariant_delta=%d queue_full=%d force_get_learned=%d",
		core.TelemetryEnqueued.Load(), core.TelemetryFlushed.Load(), core.TelemetryFailed.Load(), core.TelemetryDropped.Load(),
		inFlight, core.ChecksInFlight.Load(),
		int64(core.TelemetryEnqueued.Load())-int64(core.TelemetryFlushed.Load()+core.TelemetryFailed.Load()+core.TelemetryDropped.Load()+inFlight),
		core.QueueFull.Load(), atomic.LoadInt64(&core.ForceGETLearned))

	db.DrainQueueToDeadLetter() // Final catch-all for events generated during shutdown
	pool.Close()
	if chConn != nil {
		chConn.Close()
	}
	log.Printf("[SHUTDOWN_TIMING] Clean shutdown completed in %.3fs with exit code 0", time.Since(shutdownStart).Seconds())
	os.Exit(0)
}
