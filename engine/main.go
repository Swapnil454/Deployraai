//go:debug tlsmlkem=0
package main

import (
	"context"
	"log"
	"net/http"
	_ "net/http/pprof"
	"os"
	"os/signal"
	"runtime"
	"runtime/metrics"
	"runtime/pprof"
	"strconv"
	"sync"
	"sync/atomic"
	"strings"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/your-org/uptime-engine/core"
	"github.com/your-org/uptime-engine/db"
	"github.com/your-org/uptime-engine/ebpf"
)

func readCgroupCPU() (usageUsec int64, userUsec int64, sysUsec int64) {
	data, err := os.ReadFile("/sys/fs/cgroup/cpu.stat")
	if err != nil {
		return 0, 0, 0
	}
	for _, line := range strings.Split(string(data), "\n") {
		fields := strings.Fields(line)
		if len(fields) == 2 {
			val, _ := strconv.ParseInt(fields[1], 10, 64)
			switch fields[0] {
			case "usage_usec":
				usageUsec = val
			case "user_usec":
				userUsec = val
			case "system_usec":
				sysUsec = val
			}
		}
	}
	return
}

func readGCMetrics() (gcSec float64, userSec float64, totalSec float64, gcSharePct float64) {
	const (
		gcCPU   = "/cpu/classes/gc/total:cpu-seconds"
		userCPU = "/cpu/classes/user:cpu-seconds"
		totCPU  = "/cpu/classes/total:cpu-seconds"
	)
	samples := []metrics.Sample{
		{Name: gcCPU},
		{Name: userCPU},
		{Name: totCPU},
	}
	metrics.Read(samples)
	if samples[0].Value.Kind() == metrics.KindFloat64 {
		gcSec = samples[0].Value.Float64()
	}
	if samples[1].Value.Kind() == metrics.KindFloat64 {
		userSec = samples[1].Value.Float64()
	}
	if samples[2].Value.Kind() == metrics.KindFloat64 {
		totalSec = samples[2].Value.Float64()
	}
	activeCPU := userSec + gcSec
	if activeCPU > 0 {
		gcSharePct = (gcSec / activeCPU) * 100.0
	} else if totalSec > 0 {
		gcSharePct = (gcSec / totalSec) * 100.0
	}
	return
}

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	// pprof HTTP server on port 6060
	go func() {
		pprofAddr := os.Getenv("PPROF_ADDR")
		if pprofAddr == "" {
			pprofAddr = "0.0.0.0:6060"
		}
		if err := http.ListenAndServe(pprofAddr, nil); err != nil && err != http.ErrServerClosed {
			log.Printf("pprof HTTP server failed: %v", err)
		}
	}()

	// Automatic file-based CPU profiling if CPU_PROFILE is set
	var cpuProfFile *os.File
	if cpuProfPath := os.Getenv("CPU_PROFILE"); cpuProfPath != "" {
		f, err := os.Create(cpuProfPath)
		if err != nil {
			log.Fatalf("failed to create CPU profile %s: %v", cpuProfPath, err)
		}
		if err := pprof.StartCPUProfile(f); err != nil {
			log.Fatalf("failed to start CPU profile: %v", err)
		}
		cpuProfFile = f
		log.Printf("CPU profiling enabled, writing to %s", cpuProfPath)
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

	var pingCount int
	for _, p := range core.Store.Monitors {
		mType := p.Load().Type
		if mType == "ping" {
			pingCount++
		}
		if mType != "http" {
			skippedCount++
		}
	}
	core.Store.Mu.RUnlock()
	if ok, icmpErr := core.CheckICMPCapability(); !ok {
		atomic.StoreUint32(&core.MetricICMPCapabilityDenied, 1)
		if pingCount > 0 || os.Getenv("REQUIRE_ICMP") == "true" {
			log.Fatalf("FATAL: %d ping monitors configured but unprivileged ICMP sockets are denied by kernel: %v. Set sysctl net.ipv4.ping_group_range='0 2147483647' or grant CAP_NET_RAW", pingCount, icmpErr)
		} else {
			log.Printf("STARTUP WARNING: ICMP ping capability not permitted by kernel: %v", icmpErr)
		}
	} else {
		atomic.StoreUint32(&core.MetricICMPCapabilityDenied, 0)
		log.Printf("ICMP capability verified: unprivileged non-root datagram sockets enabled")
	}

	if !core.EnableEngineB && skippedCount > 0 {
		log.Printf("INFO: %d non-HTTP monitors loaded into store (%d ping).", skippedCount, pingCount)
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
				gcSec, userSec, totSec, gcShare := readGCMetrics()
				log.Printf("[PROCESS_STATS] goroutines=%d open_fds=%d heap_sys_mb=%d heap_alloc_mb=%d no_keepalive_monitors=%d mock_net_bytes=%d checks_completed=%d checks_late=%d checks_dropped=%d gc_share=%.2f%% (gc_sec=%.3f/user_sec=%.3f/tot_sec=%.3f)",
					runtime.NumGoroutine(), fds, m.Sys/(1024*1024), m.Alloc/(1024*1024), noKeepAlive,
					core.MockNetBytesIn.Load()+core.MockNetBytesOut.Load(),
					core.ChecksCompleted.Load(), core.ChecksLate.Load(), core.QueueFull.Load(),
					gcShare, gcSec, userSec, totSec)
			}
		}
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
	case <-time.After(func() time.Duration {
		if d := 5*time.Second - time.Since(shutdownStart); d > 1500*time.Millisecond {
			return d
		}
		return 1500 * time.Millisecond
	}()):
		log.Printf("[SHUTDOWN_TIMING] Core routines wait timed out after %.3fs", time.Since(shutdownStart).Seconds())
	}

	inFlight := uint64(len(core.TelemetryQueue)) + uint64(core.ActiveBufRows.Load())
	finalGCSec, finalUserSec, finalTotSec, finalGCShare := readGCMetrics()
	usageUsec, userUsec, sysUsec := readCgroupCPU()
	cpuPerCheckUs := float64(0)
	if core.ChecksCompleted.Load() > 0 && usageUsec > 0 {
		cpuPerCheckUs = float64(usageUsec) / float64(core.ChecksCompleted.Load())
	}
	log.Printf("[RUN_COUNTERS] telemetry_enqueued=%d telemetry_flushed=%d telemetry_failed=%d telemetry_dropped=%d telemetry_in_flight=%d checks_in_flight=%d invariant_delta=%d queue_full=%d force_get_learned=%d checks_completed=%d checks_late=%d checks_dropped=%d cpu_per_check_us=%.1f cgroup_usage_usec=%d cgroup_user_usec=%d cgroup_sys_usec=%d gc_share=%.2f%% (gc_sec=%.3f/user_sec=%.3f/tot_sec=%.3f)",
		core.TelemetryEnqueued.Load(), core.TelemetryFlushed.Load(), core.TelemetryFailed.Load(), core.TelemetryDropped.Load(),
		inFlight, core.ChecksInFlight.Load(),
		int64(core.TelemetryEnqueued.Load())-int64(core.TelemetryFlushed.Load()+core.TelemetryFailed.Load()+core.TelemetryDropped.Load()+inFlight),
		core.QueueFull.Load(), atomic.LoadInt64(&core.ForceGETLearned),
		core.ChecksCompleted.Load(), core.ChecksLate.Load(), core.QueueFull.Load(),
		cpuPerCheckUs, usageUsec, userUsec, sysUsec,
		finalGCShare, finalGCSec, finalUserSec, finalTotSec)

	db.DrainQueueToDeadLetter() // Final catch-all for events generated during shutdown
	pool.Close()
	if chConn != nil {
		chConn.Close()
	}
	if cpuProfFile != nil {
		pprof.StopCPUProfile()
		cpuProfFile.Close()
		log.Println("[PGO] CPU profile successfully flushed and closed.")
	}
	log.Printf("[SHUTDOWN_TIMING] Clean shutdown completed in %.3fs with exit code 0", time.Since(shutdownStart).Seconds())
	os.Exit(0)
}
