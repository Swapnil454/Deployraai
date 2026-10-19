//go:build killhook

package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
	"github.com/your-org/uptime-engine/core"
)

func main() {
	mode := flag.String("mode", "hook", "execution mode: hook, proxy, stream")
	chAddr := flag.String("ch-addr", "ch_node1:9000", "ClickHouse native protocol address")
	runIDStr := flag.String("run-id", "", "UUID run identifier")
	count := flag.Int("count", 5000, "number of checks to emit")
	spoolDir := flag.String("spool-dir", "/tmp/gate31c_spool", "spool directory path")
	ackLog := flag.String("ack-log", "/tmp/gate31c_acked.log", "path to fsync'd ack log")
	flag.Parse()

	if *runIDStr == "" {
		log.Fatalf("run-id is required")
	}
	runID, err := uuid.Parse(*runIDStr)
	if err != nil {
		log.Fatalf("invalid run-id: %v", err)
	}

	_ = os.MkdirAll(*spoolDir, 0755)
	core.SetTelemetrySpoolDirForHarness(*spoolDir)
	core.SetTelemetryTableForTest("uptime_checks_telemetry_harness")

	opts, err := clickhouse.ParseDSN(fmt.Sprintf("clickhouse://engine:password@%s/default", *chAddr))
	if err != nil {
		log.Fatalf("ClickHouse parse error: %v", err)
	}
	conn, err := clickhouse.Open(opts)
	if err != nil {
		log.Fatalf("ClickHouse open error: %v", err)
	}
	defer conn.Close()

	switch *mode {
	case "hook":
		runHookMode(conn, runID, *count)
	case "proxy":
		runProxyMode(conn, runID, *count)
	case "stream":
		runStreamMode(conn, runID, *ackLog, *spoolDir)
	default:
		log.Fatalf("unknown mode: %s", *mode)
	}
}

func runHookMode(conn driver.Conn, runID uuid.UUID, count int) {
	log.Printf("[WORKER_HOOK] Starting pre-ack hook mode: %d rows, run_id=%s", count, runID)
	buf := core.NewColsForHarness(count)
	now := time.Now().UTC()

	for i := 1; i <= count; i++ {
		buf.AddForHarness(core.Sample{
			MonitorID:      runID,
			TsMs:           now.UnixMilli(),
			LatencyUs:      25000,
			Status:         1,
			Err:            0,
			Kind:           1,
			ProbeKind:      0,
			IntervalS:      30,
			PhaseKind:      0,
			Attempts:       1,
			TotalLatencyUs: 25000,
			Reused:         1,
			DidResume:      1,
			ReqMethod:      0,
			ReqScheme:      1,
			Generation:     uint64(i), // probe_seq
		})
	}

	// Persist to spool segment file first using SpoolAndGetToken with runID
	batchID := core.SpoolAndGetToken(buf, runID, 1, 1)
	log.Printf("[WORKER_HOOK] Spooled batch of %d rows to disk with token %s", count, batchID)

	// Install the SIGKILL hook to execute immediately after Send() completes
	core.SigkillHook = func() {
		log.Printf("[WORKER_HOOK] >>> EXECUTING SIGKILL HOOK: Terminating process before spool ack/deletion!")
		_ = syscall.Kill(syscall.Getpid(), syscall.SIGKILL)
	}

	// Flush batch to ClickHouse. The hook will trigger inside flush() right after Send() returns
	_ = core.FlushBatchForHarness(context.Background(), conn, buf, batchID)

	// If we reached here, hook didn't fire
	log.Fatalf("[WORKER_HOOK] ERROR: Process survived flush without SIGKILL!")
}

func runProxyMode(conn driver.Conn, runID uuid.UUID, count int) {
	log.Printf("[WORKER_PROXY] Starting proxy-delay mode: %d rows, run_id=%s", count, runID)
	buf := core.NewColsForHarness(count)
	now := time.Now().UTC()

	for i := 1; i <= count; i++ {
		buf.AddForHarness(core.Sample{
			MonitorID:      runID,
			TsMs:           now.UnixMilli(),
			LatencyUs:      25000,
			Status:         1,
			Err:            0,
			Kind:           1,
			ProbeKind:      0,
			IntervalS:      30,
			PhaseKind:      0,
			Attempts:       1,
			TotalLatencyUs: 25000,
			Reused:         1,
			DidResume:      1,
			ReqMethod:      0,
			ReqScheme:      1,
			Generation:     uint64(i), // probe_seq
		})
	}

	batchID := core.SpoolAndGetToken(buf, runID, 1, 1)
	log.Printf("[WORKER_PROXY] Spooled %d rows to disk with token %s, sending through proxy...", count, batchID)

	// Flush through proxy. The proxy holds the return ACK; parent will kill this process while held.
	_ = core.FlushBatchForHarness(context.Background(), conn, buf, batchID)
}

func runStreamMode(conn driver.Conn, runID uuid.UUID, ackLogPath, spoolDir string) {
	log.Printf("[WORKER_STREAM] Starting 33k/s streaming mode with 2 flush workers, run_id=%s", runID)

	ackFile, err := os.OpenFile(ackLogPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		log.Fatalf("failed to open ack log: %v", err)
	}
	defer ackFile.Close()

	var emitted atomic.Uint64
	var batchSeq atomic.Uint64
	var ackMu sync.Mutex

	producedFile := spoolDir + "/produced.txt"
	go func() {
		for {
			time.Sleep(10 * time.Millisecond)
			val := emitted.Load()
			if val > 0 {
				_ = os.WriteFile(producedFile, []byte(strconv.FormatUint(val, 10)), 0644)
			}
		}
	}()

	// Ingestion loop: 1,000 checks every 30ms = 33,333 checks/s
	ticker := time.NewTicker(30 * time.Millisecond)
	defer ticker.Stop()

	type flushItem struct {
		buf      *core.Cols
		startSeq uint64
		endSeq   uint64
	}
	flushChan := make(chan flushItem, 64)

	// 2 parallel flush workers (can finish out of order)
	for w := uint32(1); w <= 2; w++ {
		workerID := w
		go func() {
			for item := range flushChan {
				seq := batchSeq.Add(1)
				token := core.SpoolAndGetToken(item.buf, runID, workerID, seq)
				spoolFile := fmt.Sprintf("%s/seg-%s.bin", spoolDir, token)

				if core.FlushBatchForHarness(context.Background(), conn, item.buf, token) {
					_ = os.Remove(spoolFile)
					ackMu.Lock()
					_, _ = ackFile.WriteString(fmt.Sprintf("%d,%d\n", item.startSeq, item.endSeq))
					_ = ackFile.Sync()
					ackMu.Unlock()
				}
			}
		}()
	}

	batchSize := 5000
	currentBatch := core.NewColsForHarness(batchSize)
	var currentStartSeq uint64 = 1

	for {
		<-ticker.C
		for k := 0; k < 1000; k++ {
			seq := emitted.Add(1)
			s := core.Sample{
				MonitorID:      runID,
				TsMs:           time.Now().UnixMilli(),
				LatencyUs:      25000,
				Status:         1,
				Err:            0,
				Kind:           1,
				ProbeKind:      0,
				IntervalS:      30,
				PhaseKind:      0,
				Attempts:       1,
				TotalLatencyUs: 25000,
				Reused:         1,
				DidResume:      1,
				ReqMethod:      0,
				ReqScheme:      1,
				Generation:     seq,
			}
			currentBatch.AddForHarness(s)
			if currentBatch.LenForHarness() >= batchSize {
				toFlush := currentBatch
				startSeq := currentStartSeq
				endSeq := seq
				currentBatch = core.NewColsForHarness(batchSize)
				currentStartSeq = seq + 1

				flushChan <- flushItem{
					buf:      toFlush,
					startSeq: startSeq,
					endSeq:   endSeq,
				}
			}
		}
	}
}
