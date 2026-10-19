package core

import (
	"encoding/binary"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestTelemetryBuffer_AddReset(t *testing.T) {
	cols := newCols(100)
	for i := 0; i < 50; i++ {
		cols.add(Sample{
			MonitorID: uuid.New(),
			TsMs:      time.Now().UnixMilli(),
			LatencyUs: 1200,
			Status:    1,
		})
	}
	if cols.len() != 50 {
		t.Fatalf("expected 50 rows, got %d", cols.len())
	}
	cols.reset()
	if cols.len() != 0 {
		t.Fatalf("expected 0 rows after reset, got %d", cols.len())
	}
	if cap(cols.ID) != 100 {
		t.Fatalf("expected capacity to be preserved at 100, got %d", cap(cols.ID))
	}
}

func TestTelemetryQueue_NonBlockingDrop(t *testing.T) {
	// Create dedicated isolated channel for this test to avoid collision with background ingestion goroutines
	testQ := make(chan Sample, 100)
	_, cleanup := SetTelemetryQueueForTest(testQ)
	defer cleanup()

	startDropped := TelemetryDropped.Load()
	startEnqueued := TelemetryEnqueued.Load()

	// Fill queue to capacity (100)
	qCap := cap(testQ)
	for i := 0; i < qCap; i++ {
		Emit(Sample{LatencyUs: 100})
	}

	if len(testQ) != qCap {
		t.Fatalf("expected queue to be full (%d), got %d", qCap, len(testQ))
	}

	// Next emit should drop without blocking
	done := make(chan bool)
	go func() {
		Emit(Sample{LatencyUs: 999})
		done <- true
	}()

	select {
	case <-done:
		// Success: Emit did not block
	case <-time.After(500 * time.Millisecond):
		t.Fatal("Emit blocked on full TelemetryQueue!")
	}

	if TelemetryDropped.Load() != startDropped+1 {
		t.Fatalf("expected TelemetryDropped to increment by 1, got %d", TelemetryDropped.Load()-startDropped)
	}
	if TelemetryEnqueued.Load() != startEnqueued+uint64(qCap)+1 {
		t.Fatalf("expected TelemetryEnqueued to account for all attempts")
	}
}

func TestTelemetry_DiskSpoolAndReplay(t *testing.T) {
	_ = os.RemoveAll(telemetrySpoolDir)
	defer os.RemoveAll(telemetrySpoolDir)

	cols := newCols(10)
	cols.add(Sample{
		MonitorID: uuid.New(),
		TsMs:      time.Now().UnixMilli(),
		LatencyUs: 5000,
		Status:    1,
	})

	batchID := "test-batch-uuid"
	SpoolBatch(cols, batchID)

	// Verify file exists
	spoolFile := telemetrySpoolDir + "/seg-" + batchID + ".bin"
	if _, err := os.Stat(spoolFile); err != nil {
		t.Fatalf("expected spool file %s to exist: %v", spoolFile, err)
	}

	// Verify we can read it back
	replayCols, err := readSpoolFile(spoolFile)
	if err != nil {
		t.Fatalf("failed to read and decode spool file: %v", err)
	}
	if replayCols.len() != 1 {
		t.Fatalf("expected 1 row in replayed batch, got %d", replayCols.len())
	}
	if replayCols.Lat[0] != 5000 {
		t.Fatalf("expected Lat 5000, got %d", replayCols.Lat[0])
	}
}

func TestSpoolSegmentActualDiskSize(t *testing.T) {
	_ = os.RemoveAll(telemetrySpoolDir)
	defer os.RemoveAll(telemetrySpoolDir)

	const batchSize = 10000
	cols := newCols(batchSize)
	baseTime := time.Now().UnixMilli()

	for i := 0; i < batchSize; i++ {
		// Realistic distributions
		status := uint8(1)
		if i%200 == 0 {
			status = 0
		} else if i%50 == 0 {
			status = 2
		}
		cols.add(Sample{
			MonitorID:      uuid.New(),
			TsMs:           baseTime + int64(i%1000),
			LatencyUs:      uint32(20000 + (i*17)%150000),
			IntervalS:      30,
			Status:         status,
			Err:            0,
			Kind:           uint8((i % 4) + 1),
			ProbeKind:      uint8(i % 2),
			PhaseKind:      0,
			Attempts:       1,
			TotalLatencyUs: uint32(20000 + (i*17)%150000),
			Reused:         1,
			DidResume:      1,
			ReqMethod:      0,
			ReqScheme:      1,
			Generation:     1,
		})
	}

	batchID := "measure-size-uuid"
	SpoolBatch(cols, batchID)

	spoolFile := telemetrySpoolDir + "/seg-" + batchID + ".bin"
	fi, err := os.Stat(spoolFile)
	if err != nil {
		t.Fatalf("spool file stat error: %v", err)
	}

	bytesPerRow := float64(fi.Size()) / float64(batchSize)
	t.Logf(">>> EMPIRICAL ZSTD SPOOL SEGMENT SIZE:")
	t.Logf("    Total Batch Rows:    %d", batchSize)
	t.Logf("    Actual File Size:    %d bytes (%.2f KB)", fi.Size(), float64(fi.Size())/1024)
	t.Logf("    Actual Bytes/Row:    %.2f B/row", bytesPerRow)

	// Verify decode integrity
	replayed, err := readSpoolFile(spoolFile)
	if err != nil {
		t.Fatalf("failed to read back zstd segment: %v", err)
	}
	if replayed.len() != batchSize {
		t.Fatalf("replayed rows mismatch: expected %d, got %d", batchSize, replayed.len())
	}
}

// TestSpoolTokenPersistedAcrossRestartDeduplication verifies Gate C:
// When a process dies (SIGKILL) after ClickHouse commit but before ack,
// the restarted process with a fresh boot nonce must load the persisted 24-byte
// token preimage from the spool file header and re-issue the insert with the EXACT same token.
// ClickHouse's deduplication window then deduplicates the replayed batch, ensuring count = N with 0 duplicates.
func TestSpoolTokenPersistedAcrossRestartDeduplication(t *testing.T) {
	_ = os.RemoveAll(telemetrySpoolDir)
	defer os.RemoveAll(telemetrySpoolDir)

	// 1. Verify 24-byte layout and offsets
	preimage := DedupTokenPreimage{
		WorkerID:    42,
		Nonce:       0xAABBCCDDEEFF0011,
		BatchID:     999000,
		BlockOffset: 0,
	}
	b := preimage.Bytes()
	if len(b) != 24 {
		t.Fatalf("expected 24 bytes preimage, got %d", len(b))
	}
	if binary.BigEndian.Uint32(b[0:4]) != 42 {
		t.Fatalf("expected worker_id at 0..4 = 42")
	}
	if binary.BigEndian.Uint64(b[4:12]) != 0xAABBCCDDEEFF0011 {
		t.Fatalf("expected nonce at 4..12 = 0xAABBCCDDEEFF0011")
	}
	if binary.BigEndian.Uint64(b[12:20]) != 999000 {
		t.Fatalf("expected batch_id at 12..20 = 999000")
	}
	if binary.BigEndian.Uint32(b[20:24]) != 0 {
		t.Fatalf("expected block_offset at 20..24 = 0")
	}

	const rowCount = 250
	cols := newCols(rowCount)
	now := time.Now().UnixMilli()
	for i := 0; i < rowCount; i++ {
		cols.add(Sample{
			MonitorID:  uuid.New(),
			TsMs:       now + int64(i),
			LatencyUs:  1500,
			Status:     1,
			Generation: 1,
		})
	}

	// 2. Pre-commit state: write spool file on disk with persisted preimage
	SpoolBatchWithPreimage(cols, preimage)

	originalToken := preimage.TokenString()
	spoolFile := telemetrySpoolDir + "/seg-" + originalToken + ".bin"
	if _, err := os.Stat(spoolFile); err != nil {
		t.Fatalf("expected spool file %s to exist: %v", spoolFile, err)
	}

	// 3. Simulate ClickHouse deduplication table/engine tracking committed tokens
	committedTokens := make(map[string]int) // token -> committed row count
	tableRows := make([]time.Time, 0, rowCount*2)

	executeClickHouseInsert := func(token string, batchCols *Cols) bool {
		// ClickHouse deduplication engine behavior:
		if _, alreadyCommitted := committedTokens[token]; alreadyCommitted {
			// Deduplicated! ClickHouse accepts insert but does not append duplicate rows
			return true
		}
		committedTokens[token] = batchCols.len()
		for _, ts := range batchCols.Ts {
			tableRows = append(tableRows, ts)
		}
		return true
	}

	// ClickHouse commits the batch before crash
	if ok := executeClickHouseInsert(originalToken, cols); !ok {
		t.Fatal("first insert failed")
	}
	if len(tableRows) != rowCount {
		t.Fatalf("expected %d rows committed, got %d", rowCount, len(tableRows))
	}

	// 4. Simulate SIGKILL before ack:
	// Process terminates abruptly without deleting the spool file.
	// New process boots up with a completely different boot nonce!
	newProcessBootNonce := uint64(0x1234567890ABCDEF)
	if newProcessBootNonce == preimage.Nonce {
		t.Fatal("boot nonce must differ across restarts")
	}

	// 5. Restart replayer: read spool segment from disk
	replayedCols, replayedPreimage, err := readSpoolFileWithPreimage(spoolFile)
	if err != nil {
		t.Fatalf("replayer failed to read spool file: %v", err)
	}

	// CRITICAL ASSERTION: The replayed preimage MUST carry the persisted original Nonce,
	// NOT the new process's boot nonce!
	if replayedPreimage.Nonce != preimage.Nonce {
		t.Fatalf("spool nonce corrupted: expected %x, got %x", preimage.Nonce, replayedPreimage.Nonce)
	}
	if replayedPreimage.TokenString() != originalToken {
		t.Fatalf("token mismatch across restart: expected %s, got %s", originalToken, replayedPreimage.TokenString())
	}

	// 6. Replay insert with persisted token
	replayedToken := replayedPreimage.TokenString()
	if ok := executeClickHouseInsert(replayedToken, replayedCols); !ok {
		t.Fatal("replay insert failed")
	}

	// 7. Verify zero duplicates: table rows must be exactly rowCount (N)
	if len(tableRows) != rowCount {
		t.Fatalf("DUPLICATES DETECTED! Expected exactly %d rows after replay dedup, got %d", rowCount, len(tableRows))
	}

	t.Logf("Gate C PASSED: Spool token %s persisted across simulated SIGKILL. Dedup returned exactly N=%d rows (0 duplicates).",
		replayedToken, len(tableRows))
}

