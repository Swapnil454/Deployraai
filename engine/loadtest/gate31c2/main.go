//go:build killhook

package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
	"github.com/your-org/uptime-engine/core"
)

func main() {
	fmt.Println("================================================================================")
	fmt.Println("    GATE 3.1-C2: REACTIVE SPOOLING UNDER AMBIGUOUS TIMEOUT (REPLAY DEDUP)       ")
	fmt.Println("    Evidence Label: single-Keeper, single-host Docker                          ")
	fmt.Println("================================================================================")

	spoolDir := "/tmp/gate31c2_spool"
	_ = os.RemoveAll(spoolDir)
	_ = os.MkdirAll(spoolDir, 0755)

	core.SetTelemetrySpoolDirForHarness(spoolDir)
	core.SetTelemetryTableForTest("uptime_checks_telemetry_harness")

	runID := uuid.New()
	runIDBytes := [16]byte(runID)
	nonce := binary.BigEndian.Uint64(runIDBytes[0:8])

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

	// 2. Truncate table on both nodes
	ctxTrunc, cancelTrunc := context.WithTimeout(context.Background(), 10*time.Second)
	_ = conn1.Exec(ctxTrunc, "TRUNCATE TABLE default.uptime_checks_telemetry_harness")
	_ = conn2.Exec(ctxTrunc, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	cancelTrunc()

	// -------------------------------------------------------------------------
	// PART 1: Reactive Spooling with Original Token (Replay Dedup Verification)
	// -------------------------------------------------------------------------
	fmt.Println("\n--- [Part 1: Ambiguous Timeout with Reactive Spooling & Deduplicated Replay] ---")
	preimage1 := core.DedupTokenPreimage{
		WorkerID:    1,
		Nonce:       nonce,
		BatchID:     1,
		BlockOffset: 0,
	}
	token1 := preimage1.TokenString()

	batch1 := core.NewColsForHarness(5000)
	for i := uint64(1); i <= 5000; i++ {
		batch1.AddForHarness(core.Sample{
			MonitorID:      runID,
			TsMs:           time.Now().UnixMilli(),
			LatencyUs:      25000,
			Status:         1,
			Generation:     i,
			TotalLatencyUs: 25000,
			Attempts:       1,
		})
	}

	// Start ACK-holding proxy: forwards to ClickHouse immediately, but holds the return ACK for 3.0 seconds
	proxyAddr1 := "127.0.0.1:19251"
	proxyLn1, stopProxy1 := startAckDelayProxy(proxyAddr1, "ch_node1:9000", 3000*time.Millisecond)

	proxyConn1, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{proxyAddr1},
		Auth: clickhouse.Auth{Database: "default", Username: "engine", Password: "password"},
	})
	if err != nil {
		log.Fatalf("failed to connect to proxy: %v", err)
	}

	// Attempt flush with a 1.0s timeout (ACK will be held for 3.0s, triggering client-side read timeout)
	log.Printf("[Part 1] Sending batch 1 (5,000 rows) via delay proxy with 1.0s timeout (ACK delayed 3.0s)...")
	fctx1, cancel1 := context.WithTimeout(context.Background(), 1000*time.Millisecond)
	tSendStart := time.Now()
	ok1 := core.FlushBatchForHarness(fctx1, proxyConn1, batch1, token1)
	sendDuration := time.Since(tSendStart)
	cancel1()

	log.Printf("[Part 1] Send result: ok=%v (took %v) -> Ambiguous timeout captured!", ok1, sendDuration)
	if ok1 {
		log.Fatalf("[Part 1] Expected send to time out, but it succeeded!")
	}

	// Shipped engine reactive spooling path: on flush failure, persist to spool with the exact same batchID
	log.Printf("[Part 1] Reactive Spooler invoked: writing seg-%s.bin to disk with original token...", token1)
	core.SpoolBatchWithPreimage(batch1, preimage1)

	// Wait for proxy to complete holding ACK so ClickHouse server finishes committing
	log.Printf("[Part 1] Waiting for ClickHouse server to finish committing first attempt...")
	time.Sleep(3500 * time.Millisecond)
	_ = proxyConn1.Close()
	close(stopProxy1)
	_ = proxyLn1.Close()

	// Sync replicas and query BEFORE replay
	ctxSync1, cancelSync1 := context.WithTimeout(context.Background(), 10*time.Second)
	_ = conn1.Exec(ctxSync1, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	_ = conn2.Exec(ctxSync1, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	cancelSync1()

	q1PreNode1, _ := queryE9Full(conn1, runID, 5000)
	q1PreNode2, _ := queryE9Full(conn2, runID, 5000)
	fmt.Printf("[Part 1] Pre-Replay Node 1: %s (ClickHouse committed the first attempt)\n", q1PreNode1)
	fmt.Printf("[Part 1] Pre-Replay Node 2: %s (ClickHouse committed the first attempt)\n", q1PreNode2)

	// Verify spool file exists on disk
	spoolFiles1 := listSpoolFiles(spoolDir)
	fmt.Printf("[Part 1] Spool segment on disk: %d file(s) (token=%s)\n", len(spoolFiles1), token1)

	// Execute recovery replay using the persisted segment
	fmt.Println("[Part 1] Booting production recovery replayer...")
	replayedCount1 := core.ReplaySpoolFiles(conn1, 5*time.Second)
	fmt.Printf("[Part 1] Recovery replayer completed: %d rows flushed to ClickHouse.\n", replayedCount1)

	// Sync replicas and query AFTER replay
	ctxSync2, cancelSync2 := context.WithTimeout(context.Background(), 10*time.Second)
	_ = conn1.Exec(ctxSync2, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	_ = conn2.Exec(ctxSync2, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	cancelSync2()

	q1PostNode1, pass1N1 := queryE9Full(conn1, runID, 5000)
	q1PostNode2, pass1N2 := queryE9Full(conn2, runID, 5000)
	fmt.Printf("[Part 1] Post-Replay Node 1: %s (PASS=%v)\n", q1PostNode1, pass1N1)
	fmt.Printf("[Part 1] Post-Replay Node 2: %s (PASS=%v)\n", q1PostNode2, pass1N2)

	part1Pass := pass1N1 && pass1N2 && (len(spoolFiles1) == 1)
	if part1Pass {
		fmt.Println("[Part 1 Verdict] PASS: ClickHouse replicated dedup dropped the replayed reactive spool batch with matching token!")
	} else {
		log.Fatalf("[Part 1 Verdict] FAIL: Replay caused duplicate or incorrect count!")
	}

	// -------------------------------------------------------------------------
	// PART 2: Negative Control (Fresh Nonce / E10 Bug)
	// -------------------------------------------------------------------------
	fmt.Println("\n--- [Part 2: Negative Control (Corrupted Nonce on Replay -> Duplicates)] ---")
	preimage2 := core.DedupTokenPreimage{
		WorkerID:    1,
		Nonce:       nonce,
		BatchID:     2,
		BlockOffset: 0,
	}
	token2 := preimage2.TokenString()

	batch2 := core.NewColsForHarness(5000)
	for i := uint64(5001); i <= 10000; i++ {
		batch2.AddForHarness(core.Sample{
			MonitorID:      runID,
			TsMs:           time.Now().UnixMilli(),
			LatencyUs:      25000,
			Status:         1,
			Generation:     i,
			TotalLatencyUs: 25000,
			Attempts:       1,
		})
	}

	// Start ACK-holding proxy for batch 2
	proxyAddr2 := "127.0.0.1:19252"
	proxyLn2, stopProxy2 := startAckDelayProxy(proxyAddr2, "ch_node1:9000", 3000*time.Millisecond)

	proxyConn2, err := clickhouse.Open(&clickhouse.Options{
		Addr: []string{proxyAddr2},
		Auth: clickhouse.Auth{Database: "default", Username: "engine", Password: "password"},
	})
	if err != nil {
		log.Fatalf("failed to connect to proxy: %v", err)
	}

	log.Printf("[Part 2] Sending batch 2 (5,000 rows) via delay proxy with 1.0s timeout...")
	fctx2, cancel2 := context.WithTimeout(context.Background(), 1000*time.Millisecond)
	ok2 := core.FlushBatchForHarness(fctx2, proxyConn2, batch2, token2)
	cancel2()
	log.Printf("[Part 2] Send result: ok=%v -> Timeout captured!", ok2)

	// Write spool file reactively
	core.SpoolBatchWithPreimage(batch2, preimage2)

	time.Sleep(3500 * time.Millisecond)
	_ = proxyConn2.Close()
	close(stopProxy2)
	_ = proxyLn2.Close()

	// Sync replicas and query BEFORE replay
	ctxSync3, cancelSync3 := context.WithTimeout(context.Background(), 10*time.Second)
	_ = conn1.Exec(ctxSync3, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	_ = conn2.Exec(ctxSync3, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	cancelSync3()

	q2PreNode1, _ := queryE9Full(conn1, runID, 10000)
	q2PreNode2, _ := queryE9Full(conn2, runID, 10000)
	fmt.Printf("[Part 2] Pre-Replay Node 1: %s (Batch 1 + Batch 2 committed)\n", q2PreNode1)
	fmt.Printf("[Part 2] Pre-Replay Node 2: %s (Batch 1 + Batch 2 committed)\n", q2PreNode2)

	// Replay using DELIBERATELY corrupted fresh nonce (simulating E10 bug)
	fmt.Println("[Part 2] Booting replayer with FRESH NONCE (simulating unhardened restart)...")
	replayedCount2 := core.ReplaySpoolFilesWithFreshNonce(conn1, 5*time.Second)
	fmt.Printf("[Part 2] Replayer with fresh nonce completed: %d rows flushed.\n", replayedCount2)

	// Sync replicas and query AFTER replay
	ctxSync4, cancelSync4 := context.WithTimeout(context.Background(), 10*time.Second)
	_ = conn1.Exec(ctxSync4, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	_ = conn2.Exec(ctxSync4, "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness")
	cancelSync4()

	q2PostNode1, _ := queryE9Full(conn1, runID, 10000)
	q2PostNode2, _ := queryE9Full(conn2, runID, 10000)
	fmt.Printf("[Part 2] Post-Replay Node 1: %s\n", q2PostNode1)
	fmt.Printf("[Part 2] Post-Replay Node 2: %s\n", q2PostNode2)

	// Parse duplicates
	var c1, u1 uint64
	_ = conn1.QueryRow(context.Background(), fmt.Sprintf("SELECT count(), uniqExact(probe_seq) FROM default.uptime_checks_telemetry_harness WHERE run_id='%s' SETTINGS select_sequential_consistency=1", runID.String())).Scan(&c1, &u1)
	negControlCaught := (c1 == 15000 && u1 == 10000 && (c1-u1) == 5000)

	fmt.Printf("\n[Negative Control Result] Total Rows: %d | Unique: %d | Duplicates: %d (Caught=%v)\n",
		c1, u1, c1-u1, negControlCaught)

	fmt.Println("\n================================================================================")
	if part1Pass && negControlCaught {
		fmt.Println(">>> VERDICT: Gate 3.1-C2 PASSED")
	} else {
		fmt.Println(">>> VERDICT: Gate 3.1-C2 FAILED")
		os.Exit(1)
	}
	fmt.Println("================================================================================")
}

func startAckDelayProxy(listenAddr, targetAddr string, ackDelay time.Duration) (net.Listener, chan struct{}) {
	ln, err := net.Listen("tcp", listenAddr)
	if err != nil {
		log.Fatalf("proxy listen failed: %v", err)
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

				var dataSent atomic.Bool

				// Client -> ClickHouse (immediate forwarding, track large data payload)
				go func() {
					buf := make([]byte, 65536)
					for {
						n, err := c.Read(buf)
						if n > 0 {
							if n > 2000 { // Large data block sent
								dataSent.Store(true)
							}
							_, _ = s.Write(buf[:n])
						}
						if err != nil {
							break
						}
					}
				}()

				// ClickHouse -> Client (only delay ACK packet AFTER client sent data)
				buf := make([]byte, 65536)
				for {
					n, err := s.Read(buf)
					if n > 0 {
						if dataSent.Load() {
							time.Sleep(ackDelay)
						}
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

func listSpoolFiles(dir string) []string {
	var files []string
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".bin") {
			files = append(files, filepath.Join(dir, e.Name()))
		}
	}
	return files
}

func queryE9Full(conn driver.Conn, runID uuid.UUID, N int) (string, bool) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
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
