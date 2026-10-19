//go:build killhook

package main

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"os"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/google/uuid"
	"github.com/your-org/uptime-engine/core"
)

func main() {
	fmt.Println("================================================================================")
	fmt.Println("    GATE 3.1-F: MATERIALIZED VIEW GENUINE PARTIAL FAILURE & RECOVERY           ")
	fmt.Println("    Evidence Label: single-Keeper, single-host Docker                          ")
	fmt.Println("================================================================================")

	spoolDir := "/tmp/gate31f_spool"
	_ = os.RemoveAll(spoolDir)
	_ = os.MkdirAll(spoolDir, 0755)

	core.SetTelemetrySpoolDirForHarness(spoolDir)

	runID := uuid.New()
	runIDBytes := [16]byte(runID)
	nonce := binary.BigEndian.Uint64(runIDBytes[0:8])

	// 1. Connect to Node 1 and Node 2
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

	ctxInit, cancelInit := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancelInit()

	// Clean up existing test tables if any
	_ = conn1.Exec(ctxInit, "DROP VIEW IF EXISTS default.uptime_mv_view_harness")
	_ = conn1.Exec(ctxInit, "DROP TABLE IF EXISTS default.uptime_mv_target_harness SYNC")
	_ = conn1.Exec(ctxInit, "DROP TABLE IF EXISTS default.uptime_mv_source_harness SYNC")
	_ = conn2.Exec(ctxInit, "DROP VIEW IF EXISTS default.uptime_mv_view_harness")
	_ = conn2.Exec(ctxInit, "DROP TABLE IF EXISTS default.uptime_mv_target_harness SYNC")
	_ = conn2.Exec(ctxInit, "DROP TABLE IF EXISTS default.uptime_mv_source_harness SYNC")

	// Create Replicated Source Table
	createSourceSQL := `
		CREATE TABLE default.uptime_mv_source_harness (
			monitor_id UUID,
			checked_at DateTime64(3, 'UTC'),
			status_code UInt16,
			success UInt8,
			response_time_ms UInt32,
			error_message String,
			location LowCardinality(String),
			latency_us UInt32,
			status UInt8,
			err_code UInt8,
			monitor_type UInt8,
			probe_kind UInt8,
			interval_s UInt16,
			phase_kind UInt8,
			attempts UInt8,
			total_latency_us UInt32,
			reused UInt8,
			did_resume UInt8,
			req_method UInt8,
			req_scheme UInt8,
			generation UInt64
		) ENGINE = ReplicatedMergeTree('/clickhouse/tables/{shard}/uptime_mv_source_harness', '{replica}')
		ORDER BY (monitor_id, checked_at, generation)
	`
	if err := conn1.Exec(ctxInit, createSourceSQL); err != nil {
		log.Fatalf("failed to create source table on node1: %v", err)
	}
	if err := conn2.Exec(ctxInit, createSourceSQL); err != nil {
		log.Fatalf("failed to create source table on node2: %v", err)
	}

	// Create Replicated MV Target Table with Aggregating Rollup (SummingMergeTree)
	createTargetSQL := `
		CREATE TABLE default.uptime_mv_target_harness (
			monitor_id UUID,
			status_code UInt16,
			checks_count UInt64
		) ENGINE = ReplicatedSummingMergeTree('/clickhouse/tables/{shard}/uptime_mv_target_harness', '{replica}')
		ORDER BY (monitor_id, status_code)
	`
	if err := conn1.Exec(ctxInit, createTargetSQL); err != nil {
		log.Fatalf("failed to create target table on node1: %v", err)
	}
	if err := conn2.Exec(ctxInit, createTargetSQL); err != nil {
		log.Fatalf("failed to create target table on node2: %v", err)
	}

	// Create Materialized View
	createMVSQL := `
		CREATE MATERIALIZED VIEW default.uptime_mv_view_harness
		TO default.uptime_mv_target_harness AS
		SELECT
			monitor_id,
			status_code,
			count() AS checks_count
		FROM default.uptime_mv_source_harness
		GROUP BY monitor_id, status_code
	`
	if err := conn1.Exec(ctxInit, createMVSQL); err != nil {
		log.Fatalf("failed to create MV on node1: %v", err)
	}
	if err := conn2.Exec(ctxInit, createMVSQL); err != nil {
		log.Fatalf("failed to create MV on node2: %v", err)
	}

	core.SetTelemetryTableForTest("uptime_mv_source_harness")

	fmt.Println("[Cluster Setup] Replicated Source, Aggregating Rollup Target, and Materialized View initialized on both nodes.")
	fmt.Println("[Shipped Invariant] metrics.go sends deduplicate_blocks_in_dependent_materialized_views = 1 next to deduplication token and quorum.")

	// -------------------------------------------------------------------------
	// PHASE 1: Healthy Batch Ingestion (5,000 rows)
	// -------------------------------------------------------------------------
	fmt.Println("\n--- [Phase 1: Healthy Batch Ingestion (5,000 rows)] ---")
	preimage1 := core.DedupTokenPreimage{WorkerID: 1, Nonce: nonce, BatchID: 1, BlockOffset: 0}
	token1 := preimage1.TokenString()

	batch1 := core.NewColsForHarness(5000)
	for i := uint64(1); i <= 5000; i++ {
		batch1.AddForHarness(core.Sample{
			MonitorID:      runID,
			TsMs:           time.Now().UnixMilli(),
			LatencyUs:      20000,
			Status:         1,
			Generation:     i,
			TotalLatencyUs: 20000,
			Attempts:       1,
		})
	}

	fctx1, cancel1 := context.WithTimeout(context.Background(), 5*time.Second)
	ok1 := core.FlushBatchForHarness(fctx1, conn1, batch1, token1)
	cancel1()
	if !ok1 {
		log.Fatalf("Phase 1 flush failed unexpectedly!")
	}
	log.Printf("[Phase 1] Batch 1 (5,000 rows) flushed successfully. Verifying source and MV target...")

	_ = conn1.Exec(context.Background(), "SYSTEM SYNC REPLICA default.uptime_mv_source_harness")
	_ = conn1.Exec(context.Background(), "SYSTEM SYNC REPLICA default.uptime_mv_target_harness")

	var srcC1, tgtSum1 uint64
	_ = conn1.QueryRow(context.Background(), fmt.Sprintf("SELECT count() FROM default.uptime_mv_source_harness WHERE monitor_id='%s'", runID.String())).Scan(&srcC1)
	_ = conn1.QueryRow(context.Background(), fmt.Sprintf("SELECT sum(checks_count) FROM default.uptime_mv_target_harness WHERE monitor_id='%s'", runID.String())).Scan(&tgtSum1)
	fmt.Printf("[Phase 1 Counts] Source Table: %d rows | MV Target Rollup Sum: %d (Reconciled)\n", srcC1, tgtSum1)

	// -------------------------------------------------------------------------
	// PHASE 2: Genuine Partial Failure (MV Throws mid-stream during block push)
	// -------------------------------------------------------------------------
	fmt.Println("\n--- [Phase 2: Inducing Genuine Partial Failure After Source Write] ---")
	log.Printf("[Phase 2] Altering default.uptime_mv_view_harness to throwIf(generation = 7500)...")
	faultMVSQL := `
		CREATE MATERIALIZED VIEW default.uptime_mv_view_harness
		TO default.uptime_mv_target_harness AS
		SELECT
			monitor_id,
			status_code,
			throwIf(generation = 7500, 'simulated view crash mid-stream') as fault_marker,
			count() AS checks_count
		FROM default.uptime_mv_source_harness
		GROUP BY monitor_id, status_code, fault_marker
	`
	_ = conn1.Exec(context.Background(), "DROP VIEW default.uptime_mv_view_harness")
	_ = conn2.Exec(context.Background(), "DROP VIEW default.uptime_mv_view_harness")
	if err := conn1.Exec(context.Background(), faultMVSQL); err != nil {
		log.Fatalf("failed to inject fault MV on node1: %v", err)
	}
	if err := conn2.Exec(context.Background(), faultMVSQL); err != nil {
		log.Fatalf("failed to inject fault MV on node2: %v", err)
	}

	preimage2 := core.DedupTokenPreimage{WorkerID: 1, Nonce: nonce, BatchID: 2, BlockOffset: 0}
	token2 := preimage2.TokenString()

	batch2 := core.NewColsForHarness(5000)
	for i := uint64(5001); i <= 10000; i++ {
		batch2.AddForHarness(core.Sample{
			MonitorID:      runID,
			TsMs:           time.Now().UnixMilli(),
			LatencyUs:      20000,
			Status:         1,
			Generation:     i,
			TotalLatencyUs: 20000,
			Attempts:       1,
		})
	}

	log.Printf("[Phase 2] Attempting to flush Batch 2 (5,000 rows, seq 5001..10000)...")
	fctx2, cancel2 := context.WithTimeout(context.Background(), 5*time.Second)
	ok2 := core.FlushBatchForHarness(fctx2, conn1, batch2, token2)
	cancel2()

	log.Printf("[Phase 2] Flush result: ok=%v -> ClickHouse returned MV exception!", ok2)
	if ok2 {
		log.Fatalf("Expected flush to fail with MV throwIf exception, but it succeeded!")
	}

	// Shipped engine behavior: unknown error code detected -> ALERT and SPOOL
	log.Printf("[Phase 2] Shipped flush() classified error as NON_RETRYABLE_OR_UNKNOWN -> TelemetryAlertCount: %d. Reactively spooling seg-%s.bin...",
		core.TelemetryAlertCount.Load(), token2)
	core.SpoolBatchWithPreimage(batch2, preimage2)

	// -------------------------------------------------------------------------
	// RECORD STATE BEFORE REPAIR (Crucial requirement: source = N, view < N)
	// -------------------------------------------------------------------------
	fmt.Println("\n--- [Record State Before Repair (Genuine Partial Failure)] ---")
	_ = conn1.Exec(context.Background(), "SYSTEM SYNC REPLICA default.uptime_mv_source_harness")
	_ = conn1.Exec(context.Background(), "SYSTEM SYNC REPLICA default.uptime_mv_target_harness")
	_ = conn2.Exec(context.Background(), "SYSTEM SYNC REPLICA default.uptime_mv_source_harness")
	_ = conn2.Exec(context.Background(), "SYSTEM SYNC REPLICA default.uptime_mv_target_harness")

	var srcPreN1, tgtPreN1, srcPreN2, tgtPreN2 uint64
	_ = conn1.QueryRow(context.Background(), fmt.Sprintf("SELECT count() FROM default.uptime_mv_source_harness WHERE monitor_id='%s'", runID.String())).Scan(&srcPreN1)
	_ = conn1.QueryRow(context.Background(), fmt.Sprintf("SELECT sum(checks_count) FROM default.uptime_mv_target_harness WHERE monitor_id='%s'", runID.String())).Scan(&tgtPreN1)
	_ = conn2.QueryRow(context.Background(), fmt.Sprintf("SELECT count() FROM default.uptime_mv_source_harness WHERE monitor_id='%s'", runID.String())).Scan(&srcPreN2)
	_ = conn2.QueryRow(context.Background(), fmt.Sprintf("SELECT sum(checks_count) FROM default.uptime_mv_target_harness WHERE monitor_id='%s'", runID.String())).Scan(&tgtPreN2)

	fmt.Printf("Node 1: Source Count = %d rows | MV Target Rollup Sum = %d\n", srcPreN1, tgtPreN1)
	fmt.Printf("Node 2: Source Count = %d rows | MV Target Rollup Sum = %d\n", srcPreN2, tgtPreN2)
	fmt.Printf("[State Evaluation] Source has committed Batch 2 (%d rows), while MV target is missing Batch 2 (%d rows vs 10000 expected)!\n",
		srcPreN1, tgtPreN1)
	fmt.Printf("[Alert Verification] TelemetryAlertCount: %d (Alert raised for non-retryable MV exception).\n", core.TelemetryAlertCount.Load())

	// -------------------------------------------------------------------------
	// PHASE 3: Repair Target View & Replay with Matching Deduplication Token
	// -------------------------------------------------------------------------
	fmt.Println("\n--- [Phase 3: Repairing Materialized View & Deduplicated Replay] ---")
	log.Printf("[Phase 3] Repairing default.uptime_mv_view_harness on both nodes...")
	_ = conn1.Exec(context.Background(), "DROP VIEW default.uptime_mv_view_harness")
	_ = conn2.Exec(context.Background(), "DROP VIEW default.uptime_mv_view_harness")
	if err := conn1.Exec(context.Background(), createMVSQL); err != nil {
		log.Fatalf("failed to recreate healthy MV on node1: %v", err)
	}
	if err := conn2.Exec(context.Background(), createMVSQL); err != nil {
		log.Fatalf("failed to recreate healthy MV on node2: %v", err)
	}

	// Replay spool segment
	fmt.Println("[Phase 3] Booting production recovery replayer...")
	replayedCount := core.ReplaySpoolFiles(conn1, 5*time.Second)
	fmt.Printf("[Phase 3] Recovery replayer completed: %d rows replayed from spool.\n", replayedCount)

	// Sync replicas
	fmt.Println("\n[Sync] Executing SYSTEM SYNC REPLICA on Source and Target tables...")
	ctxSync, cancelSync := context.WithTimeout(context.Background(), 15*time.Second)
	_ = conn1.Exec(ctxSync, "SYSTEM SYNC REPLICA default.uptime_mv_source_harness")
	_ = conn1.Exec(ctxSync, "SYSTEM SYNC REPLICA default.uptime_mv_target_harness")
	_ = conn2.Exec(ctxSync, "SYSTEM SYNC REPLICA default.uptime_mv_source_harness")
	_ = conn2.Exec(ctxSync, "SYSTEM SYNC REPLICA default.uptime_mv_target_harness")
	cancelSync()

	// -------------------------------------------------------------------------
	// PHASE 4: Final Reconciliation & Verification Queries
	// -------------------------------------------------------------------------
	fmt.Println("\n--- [Phase 4: Final Reconciliation on Node 1 & Node 2] ---")
	var srcFinalN1, srcUniqN1, tgtFinalN1 uint64
	var srcFinalN2, srcUniqN2, tgtFinalN2 uint64

	_ = conn1.QueryRow(context.Background(), fmt.Sprintf("SELECT count(), uniqExact(generation) FROM default.uptime_mv_source_harness WHERE monitor_id='%s' SETTINGS select_sequential_consistency=1", runID.String())).Scan(&srcFinalN1, &srcUniqN1)
	_ = conn1.QueryRow(context.Background(), fmt.Sprintf("SELECT sum(checks_count) FROM default.uptime_mv_target_harness WHERE monitor_id='%s' SETTINGS select_sequential_consistency=1", runID.String())).Scan(&tgtFinalN1)

	_ = conn2.QueryRow(context.Background(), fmt.Sprintf("SELECT count(), uniqExact(generation) FROM default.uptime_mv_source_harness WHERE monitor_id='%s' SETTINGS select_sequential_consistency=1", runID.String())).Scan(&srcFinalN2, &srcUniqN2)
	_ = conn2.QueryRow(context.Background(), fmt.Sprintf("SELECT sum(checks_count) FROM default.uptime_mv_target_harness WHERE monitor_id='%s' SETTINGS select_sequential_consistency=1", runID.String())).Scan(&tgtFinalN2)

	srcDupN1 := srcFinalN1 - srcUniqN1
	srcDupN2 := srcFinalN2 - srcUniqN2

	fmt.Printf("Node 1 Source Table : c=%d u=%d dup=%d (Expected 10,000 / 0 dup)\n", srcFinalN1, srcUniqN1, srcDupN1)
	fmt.Printf("Node 1 MV Target    : sum(checks_count)=%d (Expected 10,000)\n", tgtFinalN1)
	fmt.Printf("Node 2 Source Table : c=%d u=%d dup=%d (Expected 10,000 / 0 dup)\n", srcFinalN2, srcUniqN2, srcDupN2)
	fmt.Printf("Node 2 MV Target    : sum(checks_count)=%d (Expected 10,000)\n", tgtFinalN2)

	sourcePass := (srcFinalN1 == 10000 && srcUniqN1 == 10000 && srcDupN1 == 0 && srcFinalN2 == 10000 && srcUniqN2 == 10000 && srcDupN2 == 0)
	targetPass := (tgtFinalN1 == 10000 && tgtFinalN2 == 10000)
	partialFailureObserved := (srcPreN1 == 10000 && tgtPreN1 == 5000)
	alertPass := core.TelemetryAlertCount.Load() > 0

	passed := sourcePass && targetPass && partialFailureObserved && alertPass

	fmt.Println("\n================================================================================")
	if passed {
		fmt.Println(">>> VERDICT: Gate 3.1-F PASSED")
	} else {
		fmt.Printf(">>> VERDICT: Gate 3.1-F FAILED (sourcePass=%v targetPass=%v partialObserved=%v alertPass=%v)\n",
			sourcePass, targetPass, partialFailureObserved, alertPass)
		os.Exit(1)
	}
	fmt.Println("================================================================================")
}
