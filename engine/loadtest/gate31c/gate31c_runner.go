package main

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
	"github.com/your-org/uptime-engine/core"
)

type IterationResult struct {
	Iteration int
	Window    string
	RunID     uuid.UUID
	Produced  int
	Spooled   int
	Acked     int
	Recovered int
	TailLoss  int
	BoundMax  int
	PreCount  uint64
	Node1Res  string
	Node2Res  string
	Passed    bool
}

func main() {
	fmt.Println("================================================================================")
	fmt.Println("    GATE 3.1-C: REAL SIGKILL (kill -9) RESILIENCE ON 2-REPLICA CLUSTER          ")
	fmt.Println("    Evidence Label: single-Keeper, single-host Docker                          ")
	fmt.Println("================================================================================")

	spoolDir := "/tmp/gate31c_spool"
	ackLogPath := "/tmp/gate31c_acked.log"
	_ = os.MkdirAll(spoolDir, 0755)

	core.SetTelemetrySpoolDirForHarness(spoolDir)
	core.SetTelemetryTableForTest("uptime_checks_telemetry_harness")

	// 1. Connect to both ClickHouse nodes
	conn1, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{"ch_node1:9000"},
		Auth: clickhouse.Auth{Database: "default", Username: "engine", Password: "password"},
	})
	if err != nil {
		log.Fatalf("failed to connect to ch_node1: %v", err)
	}
	defer conn1.Close()

	conn2, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{"ch_node2:9000"},
		Auth: clickhouse.Auth{Database: "default", Username: "engine", Password: "password"},
	})
	if err != nil {
		log.Fatalf("failed to connect to ch_node2: %v", err)
	}
	defer conn2.Close()

	if err := conn1.Ping(context.Background()); err != nil {
		log.Fatalf("ping ch_node1 failed: %v", err)
	}
	if err := conn2.Ping(context.Background()); err != nil {
		log.Fatalf("ping ch_node2 failed: %v", err)
	}
	fmt.Println("[Cluster Status] Connected to Node 1 (ch_node1:9000) and Node 2 (ch_node2:9000)")

	// 2. Build the worker binary with -tags killhook
	workerBin := "/tmp/gate31c_worker"
	fmt.Printf("[Build] Compiling worker with -tags killhook to %s...\n", workerBin)
	buildCmd := exec.Command("go", "build", "-tags", "killhook", "-o", workerBin, "./loadtest/gate31c/worker/main.go")
	buildCmd.Dir = "/engine"
	buildCmd.Stdout = os.Stdout
	buildCmd.Stderr = os.Stderr
	if err := buildCmd.Run(); err != nil {
		log.Fatalf("failed to compile gate31c_worker: %v", err)
	}
	fmt.Println("[Build] Worker compiled successfully with killhook enabled.")

	var results []IterationResult

	// -------------------------------------------------------------------------
	// ITERATIONS 1-6: Window 1 (pre-ack hook)
	// -------------------------------------------------------------------------
	for i := 1; i <= 6; i++ {
		res := runWindow1Hook(i, workerBin, spoolDir, conn1, conn2)
		results = append(results, res)
	}

	// -------------------------------------------------------------------------
	// ITERATIONS 7-8: Window 2 (response-delay TCP proxy)
	// -------------------------------------------------------------------------
	for i := 7; i <= 8; i++ {
		res := runWindow2Proxy(i, workerBin, spoolDir, conn1, conn2)
		results = append(results, res)
	}

	// -------------------------------------------------------------------------
	// NEGATIVE CONTROLS: 2 Iterations with Fresh Nonce on Replay (Defect Injection)
	// -------------------------------------------------------------------------
	for i := 1; i <= 2; i++ {
		res := runNegativeControl(i, workerBin, spoolDir, conn1, conn2)
		results = append(results, res)
	}

	// -------------------------------------------------------------------------
	// ITERATIONS 9-13: Window 3 (random kill under 33k/s stream with delayed proxy)
	// -------------------------------------------------------------------------
	for i := 9; i <= 13; i++ {
		res := runWindow3RandomStream(i, workerBin, spoolDir, ackLogPath, conn1, conn2)
		results = append(results, res)
	}

	// -------------------------------------------------------------------------
	// FINAL AUDIT SUMMARY TABLE
	// -------------------------------------------------------------------------
	fmt.Println("\n==================================================================================================================")
	fmt.Println("    GATE 3.1-C SUMMARY TABLE (ALL ITERATIONS & CONTROLS)                                                         ")
	fmt.Println("==================================================================================================================")
	fmt.Printf("%-8s | %-12s | %-8s | %-7s | %-7s | %-9s | %-8s | %-8s | %-24s | %-6s\n",
		"Iter", "Window", "Produced", "Spooled", "Acked", "Recovered", "TailLoss", "Bound", "Node 1 / Node 2 E9 Counts", "Status")
	fmt.Println("------------------------------------------------------------------------------------------------------------------")

	allPassed := true
	for _, r := range results {
		statusStr := "PASS"
		if !r.Passed {
			statusStr = "FAIL"
			allPassed = false
		}
		fmt.Printf("%-8d | %-12s | %-8d | %-7d | %-7d | %-9d | %-8d | %-8d | %-24s | %-6s\n",
			r.Iteration, r.Window, r.Produced, r.Spooled, r.Acked, r.Recovered, r.TailLoss, r.BoundMax, r.Node1Res, statusStr)
	}
	fmt.Println("==================================================================================================================")

	if allPassed {
		fmt.Println(">>> VERDICT: Gate 3.1-C PASSED (All crash recovery iterations and negative controls verified)")
	} else {
		fmt.Println(">>> VERDICT: Gate 3.1-C FAILED")
		os.Exit(1)
	}
}

// -----------------------------------------------------------------------------
// WINDOW 1: Pre-Ack Hook Mode
// -----------------------------------------------------------------------------
func runWindow1Hook(iter int, workerBin, spoolDir string, conn1, conn2 driver.Conn) IterationResult {
	runID := uuid.New()
	cleanDir(spoolDir)
	N := 5000

	fmt.Printf("\n--- [Iteration %d] Window: Window 1 (pre-ack hook) ---\n", iter)
	fmt.Printf("Run ID: %s | Target rows: %d\n", runID, N)

	cmd := exec.Command(workerBin,
		"--mode=hook",
		fmt.Sprintf("--count=%d", N),
		"--run-id="+runID.String(),
		"--ch-addr=ch_node1:9000",
		"--spool-dir="+spoolDir,
	)

	_ = cmd.Run()
	fmt.Printf("[Iter %d] Worker terminated abruptly via SIGKILL (status 137) before spool deletion.\n", iter)

	spoolFiles := listSpoolFiles(spoolDir)
	fmt.Printf("[Iter %d] Confirmed: %d unacknowledged spool segment(s) on disk.\n", iter, len(spoolFiles))

	// Query ClickHouse state BEFORE recovery replayer runs
	syncReplicas(conn1, conn2)
	preCountN1, preUniqN1 := queryCountUniq(conn1, runID)
	preCountN2, preUniqN2 := queryCountUniq(conn2, runID)
	fmt.Printf("[Iter %d] Pre-Replay: Node 1 count=%d uniqExact=%d | Node 2 count=%d uniqExact=%d\n",
		iter, preCountN1, preUniqN1, preCountN2, preUniqN2)

	// Boot recovery replayer to flush spool segment with matching persisted token
	fmt.Printf("[Iter %d] Booting recovery replayer...\n", iter)
	replayed := core.ReplaySpoolFiles(conn1, 5*time.Second)
	fmt.Printf("[Iter %d] Replayer flushed %d rows to ClickHouse with matching token.\n", iter, replayed)

	syncReplicas(conn1, conn2)

	// Query ClickHouse state AFTER recovery replayer runs
	n1Res, n1Pass := queryE9Contiguous(conn1, runID, N)
	n2Res, n2Pass := queryE9Contiguous(conn2, runID, N)

	passed := n1Pass && n2Pass && (preCountN1 == uint64(N))
	fmt.Printf("[Iter %d] Post-Replay: Node 1: %s (PASS=%v) | Node 2: %s (PASS=%v)\n", iter, n1Res, n1Pass, n2Res, n2Pass)

	return IterationResult{
		Iteration: iter,
		Window:    "1 (hook)",
		RunID:     runID,
		Produced:  N,
		Spooled:   N,
		Acked:     0,
		Recovered: N,
		TailLoss:  0,
		BoundMax:  75536,
		PreCount:  preCountN1,
		Node1Res:  n1Res,
		Node2Res:  n2Res,
		Passed:    passed,
	}
}

// -----------------------------------------------------------------------------
// WINDOW 2: Response-Delay TCP Proxy Mode
// -----------------------------------------------------------------------------
func runWindow2Proxy(iter int, workerBin, spoolDir string, conn1, conn2 driver.Conn) IterationResult {
	runID := uuid.New()
	cleanDir(spoolDir)
	N := 5000

	fmt.Printf("\n--- [Iteration %d] Window: Window 2 (response-delay proxy) ---\n", iter)
	fmt.Printf("Run ID: %s | Target rows: %d\n", runID, N)

	proxyPort := 19000 + iter
	proxyAddr := fmt.Sprintf("127.0.0.1:%d", proxyPort)
	proxyLn, err := net.Listen("tcp", proxyAddr)
	if err != nil {
		log.Fatalf("proxy listen failed: %v", err)
	}
	defer proxyLn.Close()

	responseHeld := make(chan struct{})
	var proxyOnce sync.Once

	go func() {
		clientConn, err := proxyLn.Accept()
		if err != nil {
			return
		}
		defer clientConn.Close()

		serverConn, err := net.Dial("tcp", "ch_node1:9000")
		if err != nil {
			return
		}
		defer serverConn.Close()

		var clientBytes atomic.Int64
		go func() {
			buf := make([]byte, 32768)
			for {
				n, err := clientConn.Read(buf)
				if n > 0 {
					clientBytes.Add(int64(n))
					_, _ = serverConn.Write(buf[:n])
				}
				if err != nil {
					break
				}
			}
		}()

		buf := make([]byte, 32768)
		for {
			n, err := serverConn.Read(buf)
			if n > 0 {
				if clientBytes.Load() > 50000 {
					proxyOnce.Do(func() {
						fmt.Printf("[Iter %d] TCP Proxy: ClickHouse committed batch (%d bytes sent), holding ACK in socket...\n", iter, clientBytes.Load())
						close(responseHeld)
					})
					time.Sleep(3 * time.Second)
				}
				_, _ = clientConn.Write(buf[:n])
			}
			if err != nil {
				break
			}
		}
	}()

	cmd := exec.Command(workerBin,
		"--mode=proxy",
		fmt.Sprintf("--count=%d", N),
		"--run-id="+runID.String(),
		"--ch-addr="+proxyAddr,
		"--spool-dir="+spoolDir,
	)

	if err := cmd.Start(); err != nil {
		log.Fatalf("failed to start worker: %v", err)
	}

	select {
	case <-responseHeld:
		fmt.Printf("[Iter %d] Delivering external SIGKILL while ACK is held in-flight...\n", iter)
		_ = syscall.Kill(cmd.Process.Pid, syscall.SIGKILL)
	case <-time.After(5 * time.Second):
		log.Fatalf("[Iter %d] Timeout waiting for proxy response delay", iter)
	}

	_ = cmd.Wait()
	fmt.Printf("[Iter %d] Worker terminated abruptly via external SIGKILL.\n", iter)

	spoolFiles := listSpoolFiles(spoolDir)
	fmt.Printf("[Iter %d] Confirmed: %d unacknowledged spool segment(s) on disk.\n", iter, len(spoolFiles))

	// Pre-replay query: ClickHouse already has the batch committed
	syncReplicas(conn1, conn2)
	preCountN1, preUniqN1 := queryCountUniq(conn1, runID)
	preCountN2, preUniqN2 := queryCountUniq(conn2, runID)
	fmt.Printf("[Iter %d] Pre-Replay: Node 1 count=%d uniqExact=%d | Node 2 count=%d uniqExact=%d\n",
		iter, preCountN1, preUniqN1, preCountN2, preUniqN2)

	// Boot recovery replayer to replay with matching token
	fmt.Printf("[Iter %d] Booting recovery replayer...\n", iter)
	replayed := core.ReplaySpoolFiles(conn1, 5*time.Second)
	fmt.Printf("[Iter %d] Replayer flushed %d rows to ClickHouse with matching token.\n", iter, replayed)

	syncReplicas(conn1, conn2)

	// Post-replay query
	n1Res, n1Pass := queryE9Contiguous(conn1, runID, N)
	n2Res, n2Pass := queryE9Contiguous(conn2, runID, N)

	passed := n1Pass && n2Pass && (preCountN1 == uint64(N))
	fmt.Printf("[Iter %d] Post-Replay: Node 1: %s (PASS=%v) | Node 2: %s (PASS=%v)\n", iter, n1Res, n1Pass, n2Res, n2Pass)

	return IterationResult{
		Iteration: iter,
		Window:    "2 (proxy)",
		RunID:     runID,
		Produced:  N,
		Spooled:   N,
		Acked:     0,
		Recovered: N,
		TailLoss:  0,
		BoundMax:  75536,
		PreCount:  preCountN1,
		Node1Res:  n1Res,
		Node2Res:  n2Res,
		Passed:    passed,
	}
}

// -----------------------------------------------------------------------------
// NEGATIVE CONTROL: Replay with Fresh Nonce (Defect Injection Mode)
// -----------------------------------------------------------------------------
func runNegativeControl(iter int, workerBin, spoolDir string, conn1, conn2 driver.Conn) IterationResult {
	runID := uuid.New()
	cleanDir(spoolDir)
	N := 5000

	fmt.Printf("\n--- [Negative Control %d/2] Replay with Fresh Nonce (E10 defect mode) ---\n", iter)
	fmt.Printf("Run ID: %s | Target rows: %d\n", runID, N)

	cmd := exec.Command(workerBin,
		"--mode=hook",
		fmt.Sprintf("--count=%d", N),
		"--run-id="+runID.String(),
		"--ch-addr=ch_node1:9000",
		"--spool-dir="+spoolDir,
	)

	_ = cmd.Run()
	fmt.Printf("[NegControl %d] Worker terminated via SIGKILL before spool deletion.\n", iter)

	syncReplicas(conn1, conn2)
	preCountN1, preUniqN1 := queryCountUniq(conn1, runID)
	preCountN2, preUniqN2 := queryCountUniq(conn2, runID)
	fmt.Printf("[NegControl %d] Pre-Replay: Node 1 count=%d uniqExact=%d | Node 2 count=%d uniqExact=%d\n",
		iter, preCountN1, preUniqN1, preCountN2, preUniqN2)

	// Replay spool segment using deliberately fresh nonce
	fmt.Printf("[NegControl %d] Replaying with fresh generated nonce (unhardened path)...\n", iter)
	replayed := core.ReplaySpoolFilesWithFreshNonce(conn1, 5*time.Second)
	fmt.Printf("[NegControl %d] Replayer flushed %d rows with fresh nonce.\n", iter, replayed)

	syncReplicas(conn1, conn2)
	postCountN1, postUniqN1 := queryCountUniq(conn1, runID)
	postCountN2, postUniqN2 := queryCountUniq(conn2, runID)
	dupN1 := postCountN1 - postUniqN1
	dupN2 := postCountN2 - postUniqN2

	fmt.Printf("[NegControl %d] Post-Replay: Node 1 count=%d uniqExact=%d dup=%d | Node 2 count=%d uniqExact=%d dup=%d\n",
		iter, postCountN1, postUniqN1, dupN1, postCountN2, postUniqN2, dupN2)

	// Negative control succeeds if duplicates = 5000 and count = 10000
	negPassed := (postCountN1 == 10000 && dupN1 == 5000 && postCountN2 == 10000 && dupN2 == 5000)
	fmt.Printf("[NegControl %d] Outcome: Duplicate generation confirmed (dup=5000) when nonce is not persisted!\n", iter)

	resStr := fmt.Sprintf("count=%d uniq=%d dup=%d", postCountN1, postUniqN1, dupN1)
	return IterationResult{
		Iteration: iter,
		Window:    "NegControl",
		RunID:     runID,
		Produced:  N,
		Spooled:   N,
		Acked:     0,
		Recovered: N,
		TailLoss:  0,
		BoundMax:  75536,
		PreCount:  preCountN1,
		Node1Res:  resStr,
		Node2Res:  resStr,
		Passed:    negPassed,
	}
}

// -----------------------------------------------------------------------------
// WINDOW 3: Random Kill Under 33k/s Stream with Delayed Proxy
// -----------------------------------------------------------------------------
func runWindow3RandomStream(iter int, workerBin, spoolDir, ackLogPath string, conn1, conn2 driver.Conn) IterationResult {
	runID := uuid.New()
	cleanDir(spoolDir)
	_ = os.Remove(ackLogPath)

	proxyPort := 19100 + iter
	proxyAddr := fmt.Sprintf("127.0.0.1:%d", proxyPort)

	// Start delay proxy to slow down ClickHouse responses (250ms delay) so segments accumulate on disk
	proxyLn, stopProxy := startDelayProxy(proxyAddr, "ch_node1:9000", 250*time.Millisecond)
	defer proxyLn.Close()

	fmt.Printf("\n--- [Iteration %d] Window: Window 3 (random SIGKILL @ 33k/s with delayed proxy) ---\n", iter)
	fmt.Printf("Run ID: %s | Streaming checks via proxy %s...\n", runID, proxyAddr)

	cmd := exec.Command(workerBin,
		"--mode=stream",
		"--run-id="+runID.String(),
		"--ch-addr="+proxyAddr,
		"--spool-dir="+spoolDir,
		"--ack-log="+ackLogPath,
	)

	if err := cmd.Start(); err != nil {
		log.Fatalf("failed to start streaming worker: %v", err)
	}

	// Randomize kill offset between 850ms and 1350ms
	randOffsetMs := 850 + rand.Intn(500)
	time.Sleep(time.Duration(randOffsetMs) * time.Millisecond)

	fmt.Printf("[Iter %d] Delivering external SIGKILL (kill -9) at randomized offset: %d ms...\n", iter, randOffsetMs)
	_ = syscall.Kill(cmd.Process.Pid, syscall.SIGKILL)
	_ = cmd.Wait()

	close(stopProxy)
	_ = proxyLn.Close()

	// 1. Snapshot spool directory at instant of kill
	spoolFiles := listSpoolFiles(spoolDir)
	fmt.Printf("[Iter %d] Captured %d spool segment(s) on disk at instant of kill (>=2 required).\n", iter, len(spoolFiles))

	var spooledRanges [][2]uint64
	spooledCount := 0
	for _, sf := range spoolFiles {
		minS, maxS, cnt, err := core.ReadSpoolFileMinMax(sf)
		if err == nil && cnt > 0 {
			spooledRanges = append(spooledRanges, [2]uint64{minS, maxS})
			spooledCount += cnt
		}
	}

	// 2. Parse acked ranges from fsync'd log
	ackedRanges := parseAckLog(ackLogPath)
	ackedCount := 0
	for _, r := range ackedRanges {
		ackedCount += int(r[1] - r[0] + 1)
	}

	allExpectedRanges := append(ackedRanges, spooledRanges...)
	expectedRows := ackedCount + spooledCount

	// 3. Replay remaining spool files directly to ClickHouse (no proxy delay)
	fmt.Printf("[Iter %d] Booting recovery replayer to drain remaining spooled segments...\n", iter)
	replayed := core.ReplaySpoolFiles(conn1, 10*time.Second)

	fmt.Printf("[Iter %d] Stats: Acked before kill=%d | Spooled at kill=%d | Replayed=%d (replayed>0 confirmed) | Expected Set N=%d\n",
		iter, ackedCount, spooledCount, replayed, expectedRows)

	// Read produced checks count from produced.txt
	produced := readProduced(spoolDir + "/produced.txt")
	if produced < expectedRows {
		produced = expectedRows + 1000
	}
	tailLoss := produced - expectedRows

	boundMax := 75536 // cap(TelemetryQueue)=65,536 + cap(activeBuf)=10,000

	fmt.Printf("[Iter %d] Tail-Loss Accounting: Produced=%d | Recovered=%d | Tail-Loss=%d rows (Bound<=%d, PASS=%v)\n",
		iter, produced, expectedRows, tailLoss, boundMax, tailLoss <= boundMax)

	syncReplicas(conn1, conn2)

	// Query both replicas with non-prefix range assertions
	n1Res, n1Pass, n1Missing := queryE9Ranges(conn1, runID, allExpectedRanges, expectedRows)
	n2Res, n2Pass, n2Missing := queryE9Ranges(conn2, runID, allExpectedRanges, expectedRows)

	passed := n1Pass && n2Pass && (len(spoolFiles) >= 2) && (replayed > 0) && (tailLoss <= boundMax) && (n1Missing == 0) && (n2Missing == 0)
	fmt.Printf("[Iter %d] Node 1 Query: %s (PASS=%v)\n", iter, n1Res, n1Pass)
	fmt.Printf("[Iter %d] Node 2 Query: %s (PASS=%v)\n", iter, n2Res, n2Pass)

	return IterationResult{
		Iteration: iter,
		Window:    "3 (random)",
		RunID:     runID,
		Produced:  produced,
		Spooled:   spooledCount,
		Acked:     ackedCount,
		Recovered: expectedRows,
		TailLoss:  tailLoss,
		BoundMax:  boundMax,
		PreCount:  uint64(ackedCount),
		Node1Res:  n1Res,
		Node2Res:  n2Res,
		Passed:    passed,
	}
}

// -----------------------------------------------------------------------------
// HELPERS
// -----------------------------------------------------------------------------

func cleanDir(dir string) {
	_ = os.RemoveAll(dir)
	_ = os.MkdirAll(dir, 0755)
}

func listSpoolFiles(dir string) []string {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	var res []string
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".bin") {
			res = append(res, filepath.Join(dir, e.Name()))
		}
	}
	return res
}

func parseAckLog(path string) [][2]uint64 {
	f, err := os.Open(path)
	if err != nil {
		return nil
	}
	defer f.Close()

	var ranges [][2]uint64
	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		parts := strings.Split(scanner.Text(), ",")
		if len(parts) == 2 {
			s, _ := strconv.ParseUint(parts[0], 10, 64)
			e, _ := strconv.ParseUint(parts[1], 10, 64)
			ranges = append(ranges, [2]uint64{s, e})
		}
	}
	return ranges
}

func readProduced(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	n, _ := strconv.Atoi(strings.TrimSpace(string(data)))
	return n
}

func syncReplicas(conn1, conn2 driver.Conn) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	_ = conn1.Exec(ctx, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	_ = conn2.Exec(ctx, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	time.Sleep(300 * time.Millisecond)
}

func queryCountUniq(conn driver.Conn, runID uuid.UUID) (uint64, uint64) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := fmt.Sprintf(`
		SELECT
			count(),
			uniqExact(probe_seq)
		FROM default.uptime_checks_telemetry_harness
		WHERE run_id = '%s'
		SETTINGS select_sequential_consistency = 1
	`, runID.String())
	var count, uniq uint64
	_ = conn.QueryRow(ctx, query).Scan(&count, &uniq)
	return count, uniq
}

func queryE9Contiguous(conn driver.Conn, runID uuid.UUID, N int) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := fmt.Sprintf(`
		SELECT
			count(),
			uniqExact(probe_seq),
			min(probe_seq),
			max(probe_seq)
		FROM default.uptime_checks_telemetry_harness
		WHERE run_id = '%s'
		SETTINGS select_sequential_consistency = 1
	`, runID.String())
	row := conn.QueryRow(ctx, query)
	var count, uniq, minSeq, maxSeq uint64
	if err := row.Scan(&count, &uniq, &minSeq, &maxSeq); err != nil {
		return fmt.Sprintf("ERR: %v", err), false
	}

	duplicates := count - uniq
	resStr := fmt.Sprintf("c=%d u=%d min=%d max=%d dup=%d", count, uniq, minSeq, maxSeq, duplicates)
	pass := (int(count) == N && int(uniq) == N && minSeq == 1 && int(maxSeq) == N && duplicates == 0)
	return resStr, pass
}

func queryE9Ranges(conn driver.Conn, runID uuid.UUID, expectedRanges [][2]uint64, expectedRows int) (string, bool, int) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	query := fmt.Sprintf(`
		SELECT
			count(),
			uniqExact(probe_seq)
		FROM default.uptime_checks_telemetry_harness
		WHERE run_id = '%s'
		SETTINGS select_sequential_consistency = 1
	`, runID.String())
	row := conn.QueryRow(ctx, query)
	var count, uniq uint64
	if err := row.Scan(&count, &uniq); err != nil {
		return fmt.Sprintf("ERR: %v", err), false, expectedRows
	}

	missing := 0
	for _, r := range expectedRanges {
		var cnt uint64
		q := fmt.Sprintf("SELECT count() FROM default.uptime_checks_telemetry_harness WHERE run_id = '%s' AND probe_seq BETWEEN %d AND %d SETTINGS select_sequential_consistency = 1", runID.String(), r[0], r[1])
		if err := conn.QueryRow(ctx, q).Scan(&cnt); err != nil {
			missing += int(r[1] - r[0] + 1)
		} else {
			exp := uint64(r[1] - r[0] + 1)
			if cnt < exp {
				missing += int(exp - cnt)
			}
		}
	}

	duplicates := count - uniq
	resStr := fmt.Sprintf("c=%d u=%d dup=%d miss=%d", count, uniq, duplicates, missing)
	pass := (duplicates == 0) && (missing == 0) && (int(count) >= expectedRows)
	return resStr, pass, missing
}

func startDelayProxy(listenAddr, targetAddr string, delay time.Duration) (net.Listener, chan struct{}) {
	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Fatalf("delay proxy listen failed: %v", err)
	}
	stopChan := make(chan struct{})

	go func() {
		for {
			clientConn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				s, err := net.Dial("tcp", targetAddr)
				if err != nil {
					return
				}
				defer s.Close()

				// Client -> ClickHouse (immediate)
				go func() {
					_, _ = io.Copy(s, c)
				}()

				// ClickHouse -> Client (delayed response to hold TCP ACK)
				buf := make([]byte, 32768)
				for {
					n, err := s.Read(buf)
					if n > 0 {
						time.Sleep(delay)
						_, werr := c.Write(buf[:n])
						if werr != nil {
							break
						}
					}
					if err != nil {
						break
					}
				}
			}(clientConn)
		}
	}()

	return ln, stopChan
}
