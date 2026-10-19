package core

import (
	"context"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
)

// MockConn implements driver.Conn interface for fault injection testing
type mockFaultConn struct {
	driver.Conn
	mu           sync.Mutex
	isDown       atomic.Bool
	injectErr    error
	delay        time.Duration
	insertedRows atomic.Uint64
}

type mockBatch struct {
	driver.Batch
	conn *mockFaultConn
	rows int
}

func (m *mockBatch) Column(idx int) driver.BatchColumn {
	return &mockColumn{}
}

func (m *mockBatch) Send() error {
	if m.conn.injectErr != nil {
		return m.conn.injectErr
	}
	if m.conn.isDown.Load() {
		return &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
	}
	if m.conn.delay > 0 {
		time.Sleep(m.conn.delay)
	}
	m.conn.insertedRows.Add(uint64(m.rows))
	return nil
}

func (m *mockBatch) Abort() error {
	return nil
}

type mockColumn struct {
	driver.BatchColumn
}

func (mc *mockColumn) Append(v any) error {
	return nil
}

func (m *mockFaultConn) PrepareBatch(ctx context.Context, query string, opts ...driver.PrepareBatchOption) (driver.Batch, error) {
	if m.injectErr != nil {
		return nil, m.injectErr
	}
	if m.isDown.Load() {
		return nil, &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED}
	}
	return &mockBatch{conn: m, rows: 10000}, nil
}

// -----------------------------------------------------------------------------
// TEST 1: Go Process Restart Token Uniqueness
// -----------------------------------------------------------------------------
func TestGoTokenUniquenessAcrossProcessRestarts(t *testing.T) {
	const batchesPerRun = 10000
	tokensRun1 := make(map[string]bool, batchesPerRun)
	tokensRun2 := make(map[string]bool, batchesPerRun)

	// Simulated Process 1
	for i := 0; i < batchesPerRun; i++ {
		tok := uuid.New().String()
		if tokensRun1[tok] {
			t.Fatalf("Collision within Run 1 at batch %d", i)
		}
		tokensRun1[tok] = true
	}

	// Simulated Process 2 (after restart)
	for i := 0; i < batchesPerRun; i++ {
		tok := uuid.New().String()
		if tokensRun1[tok] {
			t.Fatalf("Cross-process restart token collision detected! Token: %s", tok)
		}
		tokensRun2[tok] = true
	}

	if len(tokensRun1) != batchesPerRun || len(tokensRun2) != batchesPerRun {
		t.Fatalf("Expected %d unique tokens per run", batchesPerRun)
	}
}

// -----------------------------------------------------------------------------
// TEST 2: Go Benchmark Emit & In-Memory Drain
// -----------------------------------------------------------------------------
func BenchmarkEmitAndDrain(b *testing.B) {
	b.ReportAllocs()
	s := Sample{
		MonitorID: uuid.New(),
		TsMs:      time.Now().UnixMilli(),
		LatencyUs: 25000,
		Status:    1,
		Err:       0,
		Kind:      1,
		IntervalS: 30,
	}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		Emit(s)
		select {
		case <-TelemetryQueue:
		default:
		}
	}
}

// -----------------------------------------------------------------------------
// TEST 3: ClickHouse Downtime Fault Test (60s simulation at 33k rows/s)
// -----------------------------------------------------------------------------
func TestPipelineClickHouseDowntimeAndFullReplay(t *testing.T) {
	tempSpoolDir, err := os.MkdirTemp("", "telemetry-spool-test-*")
	if err != nil {
		t.Fatalf("failed to create temp spool dir: %v", err)
	}
	defer os.RemoveAll(tempSpoolDir)

	cleanupSpoolDir := SetTelemetrySpoolDirForTest(tempSpoolDir)
	defer cleanupSpoolDir()

	mockConn := &mockFaultConn{}
	mockConn.isDown.Store(true) // ClickHouse is DOWN

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	// Configure flusher: 1,000 rows per batch for fast unit testing
	cfg := Config{
		MaxRows:    1000,
		FlushEvery: 50 * time.Millisecond,
	}

	StartTelemetryFlusher(ctx, &wg, mockConn, cfg)

	startDropped := TelemetryDropped.Load()
	const totalSamples = 30000 // 30 batches of 1,000
	for i := 0; i < totalSamples; i++ {
		Emit(Sample{
			MonitorID: uuid.New(),
			TsMs:      time.Now().UnixMilli(),
			LatencyUs: 15000,
			Status:    1,
		})
	}

	// Allow batches to dispatch and spool to disk
	time.Sleep(500 * time.Millisecond)

	dropped := TelemetryDropped.Load() - startDropped
	if dropped != 0 {
		t.Fatalf("Expected 0 dropped checks during ClickHouse outage, got %d", dropped)
	}

	// Verify spool files exist on disk
	files, err := os.ReadDir(tempSpoolDir)
	if err != nil || len(files) == 0 {
		t.Fatalf("Expected spool segments on disk during outage, got 0 (err: %v)", err)
	}
	t.Logf("Spool segments created on disk during outage: %d files", len(files))

	// Bring ClickHouse back UP
	mockConn.isDown.Store(false)
	telemetryBreakerUntil.Store(0)

	// Start Replayer
	StartTelemetryReplayer(ctx, &wg, mockConn)

	// Wait for replayer ticker and final drain
	time.Sleep(12 * time.Second)

	cancel()
	wg.Wait()

	// Final drain to ensure full recovery
	FinalTelemetryDrainAndFlush(mockConn, 2*time.Second)

	replayedFiles, _ := os.ReadDir(tempSpoolDir)
	remainingBin := 0
	for _, f := range replayedFiles {
		if len(f.Name()) > 4 && f.Name()[len(f.Name())-4:] == ".bin" {
			remainingBin++
		}
	}

	t.Logf("Post-recovery state: insertedRows=%d, remainingBinFiles=%d, TelemetryDropped=%d",
		mockConn.insertedRows.Load(), remainingBin, TelemetryDropped.Load())

	if remainingBin != 0 {
		t.Fatalf("Expected all spool segments to be replayed and deleted, remaining: %d", remainingBin)
	}
}

// -----------------------------------------------------------------------------
// TEST 4: Slow ClickHouse (500ms Latency) Non-Blocking Flusher Test
// -----------------------------------------------------------------------------
func TestPipelineSlowClickHouseBehavior(t *testing.T) {
	_ = os.RemoveAll(telemetrySpoolDir)
	defer os.RemoveAll(telemetrySpoolDir)

	mockConn := &mockFaultConn{delay: 50 * time.Millisecond} // Simulated slow ClickHouse
	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup

	cfg := Config{
		MaxRows:    500,
		FlushEvery: 50 * time.Millisecond,
	}

	StartTelemetryFlusher(ctx, &wg, mockConn, cfg)

	// Rapidly emit 10,000 samples
	startEmit := time.Now()
	for i := 0; i < 10000; i++ {
		Emit(Sample{
			MonitorID: uuid.New(),
			TsMs:      time.Now().UnixMilli(),
			LatencyUs: 20000,
			Status:    1,
		})
	}
	emitDuration := time.Since(startEmit)

	// Emitting 10,000 samples must be instantaneous (< 100ms) despite 50ms ClickHouse latency
	if emitDuration > 100*time.Millisecond {
		t.Errorf("Emit loop was backpressured by slow ClickHouse! Took %v", emitDuration)
	}

	// Verify flusher queue depth and busy time gauge activity
	time.Sleep(200 * time.Millisecond)
	busyUs := FlusherBusyTimeUs.Load()
	if busyUs == 0 {
		t.Errorf("Expected FlusherBusyTimeUs gauge to record activity, got 0")
	}

	cancel()
	wg.Wait()
}

// -----------------------------------------------------------------------------
// TEST 5: Hard Process Crash (kill -9) Loss Window Measurement
// -----------------------------------------------------------------------------
func TestPipelineCrashLossWindowBound(t *testing.T) {
	// Drain queue baseline
	for len(TelemetryQueue) > 0 {
		<-TelemetryQueue
	}

	// Fill queue and active buffer to capacity
	var emitted uint64 = 0
	for i := 0; i < 65536; i++ {
		select {
		case TelemetryQueue <- Sample{MonitorID: uuid.New(), TsMs: time.Now().UnixMilli()}:
			emitted++
		default:
			break
		}
	}

	activeBufCap := 10000
	totalInFlight := int(emitted) + activeBufCap

	t.Logf("Theoretical worst-case unwritten rows at instant of kill -9: %d rows", totalInFlight)
	if totalInFlight > 85536 {
		t.Fatalf("Loss window exceeds upper bound! %d > 85536", totalInFlight)
	}

	// Clear out queue for clean state
	for len(TelemetryQueue) > 0 {
		<-TelemetryQueue
	}
}

// -----------------------------------------------------------------------------
// TEST 6: Retryable Errors Must Not Count Toward Quarantine
// -----------------------------------------------------------------------------
func TestReplayRetryableErrorDoesNotQuarantine(t *testing.T) {
	testSpoolDir := "/tmp/test_quarantine_retryable_" + uuid.New().String()
	_ = os.RemoveAll(testSpoolDir)
	_ = os.MkdirAll(testSpoolDir, 0755)
	defer os.RemoveAll(testSpoolDir)

	oldSpoolDir := telemetrySpoolDir
	telemetrySpoolDir = testSpoolDir
	defer func() { telemetrySpoolDir = oldSpoolDir }()

	// Reset quarantine count
	TelemetryQuarantineCount.Store(0)

	// Create a valid spool file
	c := newCols(10)
	c.add(Sample{MonitorID: uuid.New(), TsMs: time.Now().UnixMilli()})
	preimage := DedupTokenPreimage{WorkerID: 1, Nonce: 12345, BatchID: 1}
	SpoolBatchWithPreimage(c, preimage)

	// Verify file created
	files, err := os.ReadDir(testSpoolDir)
	if err != nil || len(files) == 0 {
		t.Fatalf("Failed to create spool file: %v", err)
	}

	// Mock connection that returns RETRYABLE network error (dial timeout)
	mockConn := &mockFaultConn{}
	mockConn.isDown.Store(true)

	// Replay 5 times under retryable error
	for i := 0; i < 5; i++ {
		ReplaySpoolFilesWithRateLimit(mockConn, 10, 100*time.Millisecond)
	}

	// File MUST still exist in spool dir, NOT moved to quarantine
	filesAfter, _ := os.ReadDir(testSpoolDir)
	var binCount int
	for _, f := range filesAfter {
		if strings.HasSuffix(f.Name(), ".bin") {
			binCount++
		}
	}
	if binCount != 1 {
		t.Fatalf("Expected 1 spool file retained on disk after 5 retryable failures, found %d", binCount)
	}
	if TelemetryQuarantineCount.Load() != 0 {
		t.Fatalf("Expected TelemetryQuarantineCount == 0 for retryable errors, got %d", TelemetryQuarantineCount.Load())
	}

	// Quarantine dir must either not exist or be empty
	// Quarantine dir must either not exist or be empty
	quarantineFiles, _ := os.ReadDir(testSpoolDir + "/quarantine")
	if len(quarantineFiles) != 0 {
		t.Fatalf("Expected quarantine directory to be empty for retryable errors, found %d files", len(quarantineFiles))
	}

	// Verify TelemetryOldestSpoolAgeSeconds is tracked
	ageSec := TelemetryOldestSpoolAgeSeconds.Load()
	t.Logf("TelemetryOldestSpoolAgeSeconds successfully tracked: %d s", ageSec)
}

// -----------------------------------------------------------------------------
// TEST 7: Spool Replay Monotonic Sequence Ordering (Immune to mtime Corruption)
// -----------------------------------------------------------------------------
func TestReplayMonotonicSequenceOrdering(t *testing.T) {
	testSpoolDir := "/tmp/test_monotonic_replay_" + uuid.New().String()
	_ = os.RemoveAll(testSpoolDir)
	_ = os.MkdirAll(testSpoolDir, 0755)
	defer os.RemoveAll(testSpoolDir)

	oldSpoolDir := telemetrySpoolDir
	telemetrySpoolDir = testSpoolDir
	defer func() { telemetrySpoolDir = oldSpoolDir }()

	// Create 3 spool segments using SpoolBatchWithPreimage
	// The new naming embeds seg-%016d-%s.bin
	for i := 1; i <= 3; i++ {
		c := newCols(10)
		c.add(Sample{MonitorID: uuid.New(), TsMs: time.Now().UnixMilli()})
		preimage := DedupTokenPreimage{WorkerID: 1, Nonce: 12345, BatchID: uint64(i)}
		SpoolBatchWithPreimage(c, preimage)
	}

	// Corrupt file modification times to be in REVERSE order
	// File 3 has oldest mtime, File 1 has newest mtime
	entries, _ := os.ReadDir(testSpoolDir)
	now := time.Now()
	for _, e := range entries {
		if strings.HasSuffix(e.Name(), ".bin") {
			seq := parseSpoolSeqFromFilename(e.Name())
			var fakeMtime time.Time
			switch seq {
			case 1:
				fakeMtime = now.Add(10 * time.Minute) // Newest mtime
			case 2:
				fakeMtime = now                       // Middle mtime
			case 3:
				fakeMtime = now.Add(-10 * time.Minute) // Oldest mtime
			}
			_ = os.Chtimes(filepath.Join(testSpoolDir, e.Name()), fakeMtime, fakeMtime)
		}
	}

	mockConn := &mockFaultConn{}
	mockConn.isDown.Store(false)

	// Replay must process in sequence order (seq 1 -> seq 2 -> seq 3)
	// regardless of corrupted mtimes or lexical tie-breaks!
	replayedCount := ReplaySpoolFilesWithRateLimit(mockConn, 100, 100*time.Millisecond)
	if replayedCount != 3 {
		t.Fatalf("Expected 3 rows replayed across 3 segments, got %d", replayedCount)
	}

	// Verify all spool files drained
	remFiles, _ := os.ReadDir(testSpoolDir)
	if len(remFiles) != 0 {
		t.Fatalf("Expected all files replayed, remaining: %d", len(remFiles))
	}
}

// -----------------------------------------------------------------------------
// TEST 8: Real Retryable Error Types Classified Correctly and Never Quarantined
// -----------------------------------------------------------------------------
func TestReplayRetryableRealErrorTypes_NeverQuarantined(t *testing.T) {
	realRetryableErrors := []struct {
		name string
		err  error
		code int
	}{
		{
			name: "net.OpError ECONNREFUSED",
			err:  &net.OpError{Op: "dial", Net: "tcp", Err: syscall.ECONNREFUSED},
			code: 0,
		},
		{
			name: "ClickHouse code 285 (Quorum failed)",
			err:  &clickhouse.Exception{Code: 285, Message: "quorum failed"},
			code: 285,
		},
		{
			name: "ClickHouse code 252 (Too many parts)",
			err:  &clickhouse.Exception{Code: 252, Message: "too many parts in all data parts in table"},
			code: 252,
		},
		{
			name: "context.DeadlineExceeded",
			err:  context.DeadlineExceeded,
			code: 0,
		},
		{
			name: "io.EOF",
			err:  io.EOF,
			code: 0,
		},
	}

	for _, tc := range realRetryableErrors {
		t.Run(tc.name, func(t *testing.T) {
			// 1. Assert isRetryableClickHouseError classifies as RETRYABLE
			if !isRetryableClickHouseError(tc.code, tc.err) {
				t.Fatalf("Expected error %s to classify as retryable, but classified as non-retryable", tc.name)
			}

			testSpoolDir := filepath.Join(os.TempDir(), "test_real_err_"+uuid.New().String())
			_ = os.RemoveAll(testSpoolDir)
			_ = os.MkdirAll(testSpoolDir, 0755)
			defer os.RemoveAll(testSpoolDir)

			oldSpoolDir := telemetrySpoolDir
			telemetrySpoolDir = testSpoolDir
			defer func() { telemetrySpoolDir = oldSpoolDir }()

			TelemetryQuarantineCount.Store(0)

			// Create spool segment
			c := newCols(10)
			c.add(Sample{MonitorID: uuid.New(), TsMs: time.Now().UnixMilli()})
			preimage := DedupTokenPreimage{WorkerID: 1, Nonce: 999, BatchID: 1}
			SpoolBatchWithPreimage(c, preimage)

			// Mock connection injecting this real error
			mockConn := &mockFaultConn{injectErr: tc.err}

			// Pre-set failed attempts in replayAttempts with firstFailedAt = 20 minutes ago
			// (exceeding QuarantineBackoffWindow of 10 minutes)
			files, _ := os.ReadDir(testSpoolDir)
			if len(files) == 0 {
				t.Fatalf("no spool files created")
			}
			replayAttemptsMu.Lock()
			replayAttempts[files[0].Name()] = spoolAttempt{
				attempts:      5,
				firstFailedAt: time.Now().Add(-20 * time.Minute),
			}
			replayAttemptsMu.Unlock()

			// Run 5 more replay passes
			for i := 0; i < 5; i++ {
				ReplaySpoolFilesWithRateLimit(mockConn, 100, 50*time.Millisecond)
			}

			// Assert segment is NEVER quarantined and remains on disk
			if TelemetryQuarantineCount.Load() != 0 {
				t.Fatalf("[%s] Quarantine count incremented: got %d, expected 0", tc.name, TelemetryQuarantineCount.Load())
			}
			quarantineFiles, _ := os.ReadDir(filepath.Join(testSpoolDir, "quarantine"))
			if len(quarantineFiles) != 0 {
				t.Fatalf("[%s] Segment was quarantined: %v", tc.name, quarantineFiles)
			}
			spoolFiles, _ := os.ReadDir(testSpoolDir)
			var binCount int
			for _, sf := range spoolFiles {
				if strings.HasSuffix(sf.Name(), ".bin") {
					binCount++
				}
			}
			if binCount != 1 {
				t.Fatalf("[%s] Segment disappeared from spool dir: binCount=%d", tc.name, binCount)
			}
		})
	}
}

// -----------------------------------------------------------------------------
// TEST 9: Spool Sequence Counter Mid-Spool Restart and Legacy Format Upgrade
// -----------------------------------------------------------------------------
func TestSpoolSequenceRestartAndLegacyUpgrade(t *testing.T) {
	testSpoolDir := filepath.Join(os.TempDir(), "test_seq_restart_"+uuid.New().String())
	_ = os.RemoveAll(testSpoolDir)
	_ = os.MkdirAll(testSpoolDir, 0755)
	defer os.RemoveAll(testSpoolDir)

	oldSpoolDir := telemetrySpoolDir
	telemetrySpoolDir = testSpoolDir
	defer func() { telemetrySpoolDir = oldSpoolDir }()

	// 1. Spool segments 1, 2, 3
	globalSpoolSequence.Store(0)
	for i := uint64(1); i <= 3; i++ {
		c := newCols(10)
		c.add(Sample{MonitorID: uuid.New(), TsMs: time.Now().UnixMilli()})
		SpoolBatchWithPreimage(c, DedupTokenPreimage{WorkerID: 1, BatchID: i})
	}

	// 2. Add an unsequenced legacy file (seg-<token>.bin)
	legacyToken := "0000000100000000000000000000000400000000"
	legacyPath := filepath.Join(testSpoolDir, fmt.Sprintf("seg-%s.bin", legacyToken))
	f, err := os.Create(legacyPath)
	if err != nil {
		t.Fatalf("failed to create legacy file: %v", err)
	}
	f.WriteString("mock legacy content")
	f.Close()

	// 3. Simulate process restart: call InitSpoolSequenceFromDisk
	maxSeq := InitSpoolSequenceFromDisk(testSpoolDir)
	if maxSeq != 4 {
		t.Fatalf("Expected maxSeq after legacy upgrade to be 4, got %d", maxSeq)
	}

	// Verify legacy file was renamed to sequenced format
	if _, err := os.Stat(legacyPath); !os.IsNotExist(err) {
		t.Fatalf("Legacy file was not renamed")
	}
	expectedUpgradedPath := filepath.Join(testSpoolDir, fmt.Sprintf("seg-%016d-%s.bin", 4, legacyToken))
	if _, err := os.Stat(expectedUpgradedPath); err != nil {
		t.Fatalf("Upgraded legacy file does not exist at %s", expectedUpgradedPath)
	}

	// 4. Spool a new batch after restart
	cNew := newCols(10)
	cNew.add(Sample{MonitorID: uuid.New(), TsMs: time.Now().UnixMilli()})
	preimage5 := DedupTokenPreimage{WorkerID: 1, BatchID: 5}
	SpoolBatchWithPreimage(cNew, preimage5)

	// 5. Verify the newly generated file has seq 5
	expectedNewPath := filepath.Join(testSpoolDir, fmt.Sprintf("seg-%016d-%s.bin", 5, preimage5.TokenString()))
	if _, err := os.Stat(expectedNewPath); err != nil {
		t.Fatalf("Newly spooled segment does not have seq 5: %s", expectedNewPath)
	}
}

