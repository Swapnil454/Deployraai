package core

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/gob"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
	"github.com/klauspost/compress/zstd"
)

type Sample struct {
	MonitorID      uuid.UUID
	TsMs           int64
	LatencyUs      uint32
	IntervalS      uint16
	Status         uint8
	Err            uint8
	Kind           uint8
	ProbeKind      uint8  // 0=scheduled, 1=verification
	PhaseKind      uint8  // 0=warm, 1=full, 2=warm_retry
	Attempts       uint8  // 1 or 2
	TotalLatencyUs uint32 // total latency across attempts
	Reused         uint8  // 0=new connection, 1=reused connection
	DidResume      uint8  // 0=full handshake, 1=TLS session resumed
	ReqMethod      uint8  // 0=HEAD, 1=GET
	ReqScheme      uint8  // 0=HTTP, 1=HTTPS
	Generation     uint64 // CheckGeneration for unambiguous full-ID join
}

var (
	TelemetryQueue           = make(chan Sample, 65536)
	TelemetryDropped         atomic.Uint64
	TelemetryEnqueued        atomic.Uint64
	TelemetryFlushed         atomic.Uint64
	TelemetryFailed          atomic.Uint64
	TelemetryAlertCount      atomic.Uint64
	TelemetryQuarantineCount atomic.Uint64
	ActiveBufRows            atomic.Int32
	FlusherBusyTimeUs        atomic.Uint64
	FlushQueueDepth          atomic.Int64
	SpoolQueueDepth          atomic.Int64
	FlushLatencyHook         func(time.Duration, bool)
)

func SetTelemetryQueueForTest(q chan Sample) (chan Sample, func()) {
	old := TelemetryQueue
	TelemetryQueue = q
	return old, func() {
		TelemetryQueue = old
	}
}

// Emit accounts every attempted enqueue. The counters obey:
// enqueued = flushed + failed + dropped + in_flight.
func Emit(s Sample) {
	TelemetryEnqueued.Add(1)
	select {
	case TelemetryQueue <- s:
	default:
		TelemetryDropped.Add(1)
	}
}

type Config struct {
	MaxRows    int
	FlushEvery time.Duration
}

type Cols struct {
	ID         []uuid.UUID
	Ts         []time.Time
	Lat        []uint32
	St         []uint8
	Er         []uint8
	Kd         []uint8
	Iv         []uint16
	ProbeKind  []uint8
	PhaseKind  []uint8
	Attempts   []uint8
	TotalLat   []uint32
	Reused     []uint8
	DidResume  []uint8
	ReqMethod  []uint8
	ReqScheme  []uint8
	Gen        []uint64
	StatusCode []uint16
	Success    []uint8
	RespMs     []uint32
	ErrMsg     []string
	Loc        []string
}

func newCols(cap int) *Cols {
	return &Cols{
		ID:         make([]uuid.UUID, 0, cap),
		Ts:         make([]time.Time, 0, cap),
		Lat:        make([]uint32, 0, cap),
		St:         make([]uint8, 0, cap),
		Er:         make([]uint8, 0, cap),
		Kd:         make([]uint8, 0, cap),
		Iv:         make([]uint16, 0, cap),
		ProbeKind:  make([]uint8, 0, cap),
		PhaseKind:  make([]uint8, 0, cap),
		Attempts:   make([]uint8, 0, cap),
		TotalLat:   make([]uint32, 0, cap),
		Reused:     make([]uint8, 0, cap),
		DidResume:  make([]uint8, 0, cap),
		ReqMethod:  make([]uint8, 0, cap),
		ReqScheme:  make([]uint8, 0, cap),
		Gen:        make([]uint64, 0, cap),
		StatusCode: make([]uint16, 0, cap),
		Success:    make([]uint8, 0, cap),
		RespMs:     make([]uint32, 0, cap),
		ErrMsg:     make([]string, 0, cap),
		Loc:        make([]string, 0, cap),
	}
}

func (c *Cols) add(s Sample) {
	c.ID = append(c.ID, s.MonitorID)
	c.Ts = append(c.Ts, time.UnixMilli(s.TsMs).UTC())
	c.Lat = append(c.Lat, s.LatencyUs)
	c.St = append(c.St, s.Status)
	c.Er = append(c.Er, s.Err)
	c.Kd = append(c.Kd, s.Kind)
	c.Iv = append(c.Iv, s.IntervalS)
	c.ProbeKind = append(c.ProbeKind, s.ProbeKind)
	c.PhaseKind = append(c.PhaseKind, s.PhaseKind)
	c.Attempts = append(c.Attempts, s.Attempts)
	c.TotalLat = append(c.TotalLat, s.TotalLatencyUs)
	c.Reused = append(c.Reused, s.Reused)
	c.DidResume = append(c.DidResume, s.DidResume)
	c.ReqMethod = append(c.ReqMethod, s.ReqMethod)
	c.ReqScheme = append(c.ReqScheme, s.ReqScheme)
	c.Gen = append(c.Gen, s.Generation)

	var sc uint16 = 500
	var succ uint8 = 0
	if s.Status == 1 {
		sc = 200
		succ = 1
	} else if s.Status == 2 {
		sc = 503
	}
	c.StatusCode = append(c.StatusCode, sc)
	c.Success = append(c.Success, succ)
	c.RespMs = append(c.RespMs, s.LatencyUs/1000)
	c.ErrMsg = append(c.ErrMsg, "")
	c.Loc = append(c.Loc, "default")
}

func (c *Cols) len() int {
	return len(c.ID)
}

func (c *Cols) reset() {
	c.ID = c.ID[:0]
	c.Ts = c.Ts[:0]
	c.Lat = c.Lat[:0]
	c.St = c.St[:0]
	c.Er = c.Er[:0]
	c.Kd = c.Kd[:0]
	c.Iv = c.Iv[:0]
	c.ProbeKind = c.ProbeKind[:0]
	c.PhaseKind = c.PhaseKind[:0]
	c.Attempts = c.Attempts[:0]
	c.TotalLat = c.TotalLat[:0]
	c.Reused = c.Reused[:0]
	c.DidResume = c.DidResume[:0]
	c.ReqMethod = c.ReqMethod[:0]
	c.ReqScheme = c.ReqScheme[:0]
	c.Gen = c.Gen[:0]
	c.StatusCode = c.StatusCode[:0]
	c.Success = c.Success[:0]
	c.RespMs = c.RespMs[:0]
	c.ErrMsg = c.ErrMsg[:0]
	c.Loc = c.Loc[:0]
}

var telemetryBreakerUntil atomic.Int64
var TelemetrySpoolEvicted atomic.Uint64
var TelemetryOldestSpoolAgeSeconds atomic.Uint64
var globalSpoolSequence atomic.Uint64

const (
	ClickHouseFlushTimeout = 2 * time.Second
	ClickHouseProbeTimeout = ClickHouseFlushTimeout // Aligned: probe bound matches flush deadline
)

var defaultTelemetrySpoolDir = func() string {
	if env := os.Getenv("TELEMETRY_SPOOL_DIR"); env != "" {
		return env
	}
	return "/var/lib/uptime-engine/spool" // Dedicated 250 GB NVMe partition mount
}()

var telemetrySpoolDir = defaultTelemetrySpoolDir

func GetTelemetrySpoolDir() string {
	return telemetrySpoolDir
}

func parseSpoolSeqFromFilename(name string) uint64 {
	trimmed := strings.TrimPrefix(name, "seg-")
	parts := strings.SplitN(trimmed, "-", 2)
	if len(parts) >= 2 && len(parts[0]) == 16 {
		if s, err := strconv.ParseUint(parts[0], 10, 64); err == nil {
			return s
		}
	}
	return 0
}

// CheckSpoolMount verifies that the telemetry spool directory is hosted on a
// persistent, non-volatile mount and errors if it resides on tmpfs or ramfs.
func CheckSpoolMount(spoolDir string) error {
	if os.Getenv("ALLOW_TMPFS_SPOOL") == "1" {
		return nil
	}
	data, err := os.ReadFile("/proc/mounts")
	if err != nil {
		// Non-linux host (e.g. Windows dev) or container without /proc
		return nil
	}
	abs, err := filepath.Abs(spoolDir)
	if err != nil {
		return err
	}

	lines := strings.Split(string(data), "\n")
	var longestMatchMount string
	var longestMatchFSType string
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 3 {
			mountPoint := fields[1]
			fsType := fields[2]
			if strings.HasPrefix(abs, mountPoint) && len(mountPoint) > len(longestMatchMount) {
				longestMatchMount = mountPoint
				longestMatchFSType = fsType
			}
		}
	}
	if longestMatchFSType == "tmpfs" || longestMatchFSType == "ramfs" {
		return fmt.Errorf("spool directory %s is on volatile %s filesystem (mount: %s); dedicated persistent NVMe partition required (set TELEMETRY_SPOOL_DIR or ALLOW_TMPFS_SPOOL=1 to override)",
			abs, longestMatchFSType, longestMatchMount)
	}
	return nil
}

// InitSpoolSequenceFromDisk scans telemetrySpoolDir for existing spool files,
// discovers the highest existing 16-digit sequence number, and migrates any
// unsequenced legacy files (seg-<token>.bin) to ordered sequence names.
// This guarantees that after engine restart, newly generated sequences are
// strictly greater than all segments currently on disk, preventing interleaving.
func InitSpoolSequenceFromDisk(spoolDir string) uint64 {
	entries, err := os.ReadDir(spoolDir)
	if err != nil {
		return 0
	}
	var maxSeq uint64
	var legacyFiles []os.DirEntry

	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasSuffix(name, ".bin") || !strings.HasPrefix(name, "seg-") {
			continue
		}
		seq := parseSpoolSeqFromFilename(name)
		if seq > maxSeq {
			maxSeq = seq
		} else if seq == 0 {
			legacyFiles = append(legacyFiles, entry)
		}
	}

	// Upgrade/migrate legacy unsequenced files in order of their modTime
	if len(legacyFiles) > 0 {
		sort.Slice(legacyFiles, func(i, j int) bool {
			infoI, errI := legacyFiles[i].Info()
			infoJ, errJ := legacyFiles[j].Info()
			if errI == nil && errJ == nil {
				return infoI.ModTime().Before(infoJ.ModTime())
			}
			return legacyFiles[i].Name() < legacyFiles[j].Name()
		})
		for _, entry := range legacyFiles {
			maxSeq++
			oldPath := filepath.Join(spoolDir, entry.Name())
			token := strings.TrimSuffix(strings.TrimPrefix(entry.Name(), "seg-"), ".bin")
			newName := fmt.Sprintf("seg-%016d-%s.bin", maxSeq, token)
			newPath := filepath.Join(spoolDir, newName)
			_ = os.Rename(oldPath, newPath)
			log.Printf("[SPOOL UPGRADE] Migrated legacy unsequenced segment %s -> %s (seq=%d)", entry.Name(), newName, maxSeq)
		}
	}

	globalSpoolSequence.Store(maxSeq)
	log.Printf("[SPOOL INIT] Initialized globalSpoolSequence from disk to %d", maxSeq)
	return maxSeq
}

func SetTelemetrySpoolDirForTest(dir string) func() {
	old := telemetrySpoolDir
	telemetrySpoolDir = dir
	return func() {
		telemetrySpoolDir = old
	}
}

var telemetryTable = "uptime_checks_telemetry"

func SetTelemetryTableForTest(table string) func() {
	old := telemetryTable
	telemetryTable = table
	return func() {
		telemetryTable = old
	}
}

func isRetryableClickHouseError(code int, err error) bool {
	switch code {
	case 159, 252, 285, 319:
		return true
	}
	if err == nil {
		return false
	}
	var chErr *clickhouse.Exception
	if errors.As(err, &chErr) {
		switch chErr.Code {
		case 159, 252, 285, 319:
			return true
		}
	}
	var netErr net.Error
	if errors.As(err, &netErr) {
		return true
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		return true
	}
	var sysErr *os.SyscallError
	if errors.As(err, &sysErr) {
		return true
	}
	if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) ||
		errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) ||
		errors.Is(err, syscall.ECONNREFUSED) || errors.Is(err, syscall.ECONNRESET) ||
		errors.Is(err, syscall.EPIPE) {
		return true
	}
	// Fallback substring check on low-level socket and transport errors
	msg := strings.ToLower(err.Error())
	if strings.Contains(msg, "connection refused") ||
		strings.Contains(msg, "connection reset") ||
		strings.Contains(msg, "broken pipe") ||
		strings.Contains(msg, "i/o timeout") ||
		strings.Contains(msg, "timeout") ||
		strings.Contains(msg, "eof") ||
		strings.Contains(msg, "no route to host") ||
		strings.Contains(msg, "network is unreachable") {
		return true
	}
	return false
}

// ProbeClickHouseHealth executes a lightweight Ping under read/context timeout.
// This ensures that slow or merge-stalled servers that accept TCP connections
// but fail query deadlines are caught before worker batches are pinned.
func ProbeClickHouseHealth(ctx context.Context, conn driver.Conn, timeout time.Duration) error {
	pCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()
	return conn.Ping(pCtx)
}

func flushInternal(ctx context.Context, conn driver.Conn, c *Cols, batchID string) (bool, bool) {
	if c.len() == 0 {
		return true, false
	}

	var batch driver.Batch
	var err error
	query := "INSERT INTO " + telemetryTable + " (" +
		"monitor_id, checked_at, status_code, success, response_time_ms, " +
		"error_message, location, latency_us, status, err_code, " +
		"monitor_type, probe_kind, interval_s, phase_kind, attempts, " +
		"total_latency_us, reused, did_resume, req_method, req_scheme, generation" +
		")"

	bCtx := clickhouse.Context(ctx, clickhouse.WithSettings(clickhouse.Settings{
		"async_insert":                                      0,
		"deduplicate_blocks_in_dependent_materialized_views": 1,
		"insert_deduplication_token":                         batchID,
		"insert_quorum":                                      2,
	}))

	batch, err = conn.PrepareBatch(bCtx, query)
	if err != nil {
		code := 0
		var chErr *clickhouse.Exception
		if errors.As(err, &chErr) {
			code = int(chErr.Code)
		}
		retryable := isRetryableClickHouseError(code, err)
		if retryable {
			log.Printf("[TELEMETRY] ClickHouse PrepareBatch error (code=%d): %v -> CLASSIFIED: RETRYABLE (spooling)", code, err)
		} else {
			TelemetryAlertCount.Add(1)
			log.Printf("[TELEMETRY ALERT] ClickHouse PrepareBatch error (code=%d): %v -> CLASSIFIED: NON_RETRYABLE_OR_UNKNOWN (raising alert, spooling to disk)", code, err)
		}
		return false, retryable
	}
	defer func() {
		if batch != nil {
			_ = batch.Abort()
		}
	}()

	if err := batch.Column(0).Append(c.ID); err != nil {
		log.Printf("ClickHouse append error col 0 (ID): %v", err)
		return false, false
	}
	if err := batch.Column(1).Append(c.Ts); err != nil {
		log.Printf("ClickHouse append error col 1 (Ts): %v", err)
		return false, false
	}
	if err := batch.Column(2).Append(c.StatusCode); err != nil {
		log.Printf("ClickHouse append error col 2 (StatusCode): %v", err)
		return false, false
	}
	if err := batch.Column(3).Append(c.Success); err != nil {
		log.Printf("ClickHouse append error col 3 (Success): %v", err)
		return false, false
	}
	if err := batch.Column(4).Append(c.RespMs); err != nil {
		log.Printf("ClickHouse append error col 4 (RespMs): %v", err)
		return false, false
	}
	if err := batch.Column(5).Append(c.ErrMsg); err != nil {
		log.Printf("ClickHouse append error col 5 (ErrMsg): %v", err)
		return false, false
	}
	if err := batch.Column(6).Append(c.Loc); err != nil {
		log.Printf("ClickHouse append error col 6 (Loc): %v", err)
		return false, false
	}
	if err := batch.Column(7).Append(c.Lat); err != nil {
		log.Printf("ClickHouse append error col 7 (Lat): %v", err)
		return false, false
	}
	if err := batch.Column(8).Append(c.St); err != nil {
		log.Printf("ClickHouse append error col 8 (St): %v", err)
		return false, false
	}
	if err := batch.Column(9).Append(c.Er); err != nil {
		log.Printf("ClickHouse append error col 9 (Er): %v", err)
		return false, false
	}
	if err := batch.Column(10).Append(c.Kd); err != nil {
		log.Printf("ClickHouse append error col 10 (MonitorType): %v", err)
		return false, false
	}
	if err := batch.Column(11).Append(c.ProbeKind); err != nil {
		log.Printf("ClickHouse append error col 11 (ProbeKind): %v", err)
		return false, false
	}
	if err := batch.Column(12).Append(c.Iv); err != nil {
		log.Printf("ClickHouse append error col 12 (Iv): %v", err)
		return false, false
	}
	if err := batch.Column(13).Append(c.PhaseKind); err != nil {
		log.Printf("ClickHouse append error col 13 (PhaseKind): %v", err)
		return false, false
	}
	if err := batch.Column(14).Append(c.Attempts); err != nil {
		log.Printf("ClickHouse append error col 14 (Attempts): %v", err)
		return false, false
	}
	if err := batch.Column(15).Append(c.TotalLat); err != nil {
		log.Printf("ClickHouse append error col 15 (TotalLat): %v", err)
		return false, false
	}
	if err := batch.Column(16).Append(c.Reused); err != nil {
		log.Printf("ClickHouse append error col 16 (Reused): %v", err)
		return false, false
	}
	if err := batch.Column(17).Append(c.DidResume); err != nil {
		log.Printf("ClickHouse append error col 17 (DidResume): %v", err)
		return false, false
	}
	if err := batch.Column(18).Append(c.ReqMethod); err != nil {
		log.Printf("ClickHouse append error col 18 (ReqMethod): %v", err)
		return false, false
	}
	if err := batch.Column(19).Append(c.ReqScheme); err != nil {
		log.Printf("ClickHouse append error col 19 (ReqScheme): %v", err)
		return false, false
	}
	if err := batch.Column(20).Append(c.Gen); err != nil {
		log.Printf("ClickHouse append error col 20 (Generation): %v", err)
		return false, false
	}

	if err := batch.Send(); err != nil {
		code := 0
		var chErr *clickhouse.Exception
		if errors.As(err, &chErr) {
			code = int(chErr.Code)
		}
		retryable := isRetryableClickHouseError(code, err)
		if retryable {
			log.Printf("[TELEMETRY] ClickHouse batch Send error (code=%d): %v -> CLASSIFIED: RETRYABLE (spooling)", code, err)
		} else {
			TelemetryAlertCount.Add(1)
			log.Printf("[TELEMETRY ALERT] ClickHouse batch Send error (code=%d): %v -> CLASSIFIED: NON_RETRYABLE_OR_UNKNOWN (raising alert, spooling to disk)", code, err)
		}
		return false, retryable
	}

	triggerSigkillHook()

	return true, false
}

func flush(ctx context.Context, conn driver.Conn, c *Cols, batchID string) bool {
	ok, _ := flushInternal(ctx, conn, c, batchID)
	return ok
}

type flushJob struct {
	buf     *Cols
	batchID string
}

type spoolJob struct {
	buf     *Cols
	batchID string
}

func StartTelemetryFlusher(ctx context.Context, wg *sync.WaitGroup, conn driver.Conn, cfg Config) {
	if cfg.MaxRows == 0 {
		cfg.MaxRows = 10000
	}
	if cfg.FlushEvery == 0 {
		cfg.FlushEvery = 1 * time.Second
	}

	sparePool := make(chan *Cols, 16)
	for i := 0; i < 8; i++ {
		sparePool <- newCols(cfg.MaxRows)
	}

	flushQueue := make(chan flushJob, 4)
	spoolQueue := make(chan spoolJob, 64)

	// Dedicated Spooler Worker: handles disk writes, fsync, and atomic rename off both consumer and flusher paths
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				for len(spoolQueue) > 0 {
					job := <-spoolQueue
					SpoolBatch(job.buf, job.batchID)
					TelemetryFailed.Add(uint64(job.buf.len()))
					job.buf.reset()
					select {
					case sparePool <- job.buf:
					default:
					}
				}
				return
			case job := <-spoolQueue:
				SpoolQueueDepth.Store(int64(len(spoolQueue)))
				SpoolBatch(job.buf, job.batchID)
				TelemetryFailed.Add(uint64(job.buf.len()))
				job.buf.reset()
				select {
				case sparePool <- job.buf:
				default:
				}
			}
		}
	}()

	// Dedicated Flusher Worker: handles ClickHouse I/O, retries, and failure routing off the consumer path
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-ctx.Done():
				// Drain remaining flushQueue items before exiting
				for len(flushQueue) > 0 {
					job := <-flushQueue
					fctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					t0 := time.Now()
					ok := flush(fctx, conn, job.buf, job.batchID)
					FlusherBusyTimeUs.Add(uint64(time.Since(t0).Microseconds()))
					cancel()
					if ok {
						TelemetryFlushed.Add(uint64(job.buf.len()))
						job.buf.reset()
						select {
						case sparePool <- job.buf:
						default:
						}
					} else {
						SpoolBatch(job.buf, job.batchID)
						TelemetryFailed.Add(uint64(job.buf.len()))
						job.buf.reset()
					}
				}
				return
			case job := <-flushQueue:
				FlushQueueDepth.Store(int64(len(flushQueue)))
				t0 := time.Now()
				fctx, cancel := context.WithTimeout(ctx, 2*time.Second)
				ok := flush(fctx, conn, job.buf, job.batchID)
				elapsed := time.Since(t0)
				FlusherBusyTimeUs.Add(uint64(elapsed.Microseconds()))
				cancel()
				if FlushLatencyHook != nil {
					FlushLatencyHook(elapsed, ok)
				}
				if ok {
					TelemetryFlushed.Add(uint64(job.buf.len()))
					job.buf.reset()
					select {
					case sparePool <- job.buf:
					default:
					}
				} else {
					log.Printf("[TELEMETRY] Flush failed! Tripping breaker 5s and routing to spool (batchID=%s)", job.batchID)
					telemetryBreakerUntil.Store(time.Now().Add(5 * time.Second).UnixNano())
					select {
					case spoolQueue <- spoolJob{buf: job.buf, batchID: job.batchID}:
					default:
						SpoolBatch(job.buf, job.batchID)
						TelemetryFailed.Add(uint64(job.buf.len()))
						job.buf.reset()
						select {
						case sparePool <- job.buf:
						default:
						}
					}
				}
			}
		}
	}()

	// Consumer Goroutine: strictly in-memory drain, buffer swap, and zero-blocking dispatch
	wg.Add(1)
	go func() {
		defer wg.Done()
		activeBuf := newCols(cfg.MaxRows)
		tick := time.NewTicker(cfg.FlushEvery)
		defer tick.Stop()

		dispatchBatch := func() {
			if activeBuf.len() == 0 {
				return
			}
			batchID := uuid.New().String()
			fullBuf := activeBuf
			select {
			case activeBuf = <-sparePool:
			default:
				activeBuf = newCols(cfg.MaxRows)
			}
			ActiveBufRows.Store(0)

			// If circuit breaker is open, check if timer expired.
			breakerUntil := telemetryBreakerUntil.Load()
			if time.Now().UnixNano() < breakerUntil {
				// Breaker actively open: divert to spool
				select {
				case spoolQueue <- spoolJob{buf: fullBuf, batchID: batchID}:
				default:
					SpoolBatch(fullBuf, batchID)
					TelemetryFailed.Add(uint64(fullBuf.len()))
					fullBuf.reset()
					select {
					case sparePool <- fullBuf:
					default:
					}
				}
				return
			} else if breakerUntil > 0 {
				// Breaker timer elapsed! Re-probe server health before unblocking flusher.
				// Bounded to ClickHouseProbeTimeout (2,000 ms, strictly aligned with flush deadline).
				if err := ProbeClickHouseHealth(ctx, conn, ClickHouseProbeTimeout); err != nil {
					log.Printf("[BREAKER RE-PROBE] ClickHouse probe failed (%v) -> extending breaker 5s", err)
					telemetryBreakerUntil.Store(time.Now().Add(5 * time.Second).UnixNano())
					select {
					case spoolQueue <- spoolJob{buf: fullBuf, batchID: batchID}:
					default:
						SpoolBatch(fullBuf, batchID)
						TelemetryFailed.Add(uint64(fullBuf.len()))
						fullBuf.reset()
						select {
						case sparePool <- fullBuf:
						default:
						}
					}
					return
				}
				// Probe succeeded! Server is responsive; reset breaker and resume normal flushes.
				log.Printf("[BREAKER RE-PROBE] ClickHouse probe succeeded -> breaker closed, direct flushes resumed")
				telemetryBreakerUntil.Store(0)
			}

			// Breaker is closed: dispatch to flusher worker
			select {
			case flushQueue <- flushJob{buf: fullBuf, batchID: batchID}:
			default:
				// Flusher queue saturated: spool directly via spool worker to prevent probe queue backpressure
				select {
				case spoolQueue <- spoolJob{buf: fullBuf, batchID: batchID}:
				default:
					SpoolBatch(fullBuf, batchID)
					TelemetryFailed.Add(uint64(fullBuf.len()))
					fullBuf.reset()
					select {
					case sparePool <- fullBuf:
					default:
					}
				}
			}
		}

		for {
			select {
			case <-ctx.Done():
				if activeBuf.len() > 0 {
					fctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
					if ok := flush(fctx, conn, activeBuf, uuid.New().String()); ok {
						TelemetryFlushed.Add(uint64(activeBuf.len()))
					} else {
						SpoolBatch(activeBuf, uuid.New().String())
						TelemetryFailed.Add(uint64(activeBuf.len()))
					}
					cancel()
					ActiveBufRows.Store(0)
				}
				return
			case s := <-TelemetryQueue:
				activeBuf.add(s)
				ActiveBufRows.Store(int32(activeBuf.len()))
				if activeBuf.len() >= cfg.MaxRows {
					dispatchBatch()
				}
			case <-tick.C:
				if activeBuf.len() > 0 {
					dispatchBatch()
				}
			}
		}
	}()
}

func drain(buf *Cols) {
	for {
		select {
		case s := <-TelemetryQueue:
			buf.add(s)
		default:
			return
		}
	}
}

const maxSpoolBytes = 5 * 1024 * 1024 * 1024 // 5 GB max disk spool (~1.5 hours of downtime at 33k rows/s)

func enforceSpoolSizeLimit() {
	files, err := os.ReadDir(telemetrySpoolDir)
	if err != nil || len(files) == 0 {
		return
	}
	var totalBytes int64
	for _, fi := range files {
		info, err := fi.Info()
		if err == nil {
			totalBytes += info.Size()
		}
	}
	if totalBytes > maxSpoolBytes {
		// Evict oldest files first
		sort.Slice(files, func(i, j int) bool {
			iInfo, _ := files[i].Info()
			jInfo, _ := files[j].Info()
			if iInfo == nil || jInfo == nil {
				return false
			}
			return iInfo.ModTime().Before(jInfo.ModTime())
		})
		for _, fi := range files {
			if totalBytes <= maxSpoolBytes {
				break
			}
			info, err := fi.Info()
			if err == nil {
				totalBytes -= info.Size()
			}
			_ = os.Remove(filepath.Join(telemetrySpoolDir, fi.Name()))
			TelemetrySpoolEvicted.Add(1)
			log.Printf("[SPOOL] Spool quota exceeded (>5GB). Evicted oldest spool segment: %s", fi.Name())
		}
	}
}

const (
	SpoolFileMagic             = "AGYS"
	SpoolFileVersion1          = uint16(1)
	SpoolFileVersion2          = uint16(2)
	SpoolFileVersion3          = uint16(3)
	SpoolFileVersion           = SpoolFileVersion3
	DefaultReplayBatchesPerSec = 10
)

// DedupTokenPreimage specifies the canonical 24-byte layout:
// [worker_id (4B)][nonce (8B)][batch_id (8B)][block_offset (4B)]
// Offsets:
// - worker_id:    bytes  0..4  (uint32)
// - nonce:        bytes  4..12 (uint64)
// - batch_id:     bytes 12..20 (uint64)
// - block_offset: bytes 20..24 (uint32)
// Total: 24 bytes.
type DedupTokenPreimage struct {
	WorkerID    uint32
	Nonce       uint64
	BatchID     uint64
	BlockOffset uint32
}

func (p DedupTokenPreimage) Bytes() [24]byte {
	var buf [24]byte
	binary.BigEndian.PutUint32(buf[0:4], p.WorkerID)
	binary.BigEndian.PutUint64(buf[4:12], p.Nonce)
	binary.BigEndian.PutUint64(buf[12:20], p.BatchID)
	binary.BigEndian.PutUint32(buf[20:24], p.BlockOffset)
	return buf
}

func (p DedupTokenPreimage) TokenString() string {
	b := p.Bytes()
	return hex.EncodeToString(b[:])
}

func ParseDedupTokenPreimage(token string) (DedupTokenPreimage, error) {
	b, err := hex.DecodeString(token)
	if err != nil || len(b) != 24 {
		return DedupTokenPreimage{}, fmt.Errorf("invalid token: expected 24 bytes hex, got %d bytes (%v)", len(b), err)
	}
	return DedupTokenPreimage{
		WorkerID:    binary.BigEndian.Uint32(b[0:4]),
		Nonce:       binary.BigEndian.Uint64(b[4:12]),
		BatchID:     binary.BigEndian.Uint64(b[12:20]),
		BlockOffset: binary.BigEndian.Uint32(b[20:24]),
	}, nil
}

func SpoolBatch(c *Cols, batchID string) {
	var preimage DedupTokenPreimage
	if p, err := ParseDedupTokenPreimage(batchID); err == nil {
		preimage = p
	} else {
		// Fallback for non-hex/UUID batchID strings: hash into 24-byte layout
		h := sha256.Sum256([]byte(batchID))
		preimage = DedupTokenPreimage{
			WorkerID:    binary.BigEndian.Uint32(h[0:4]),
			Nonce:       binary.BigEndian.Uint64(h[4:12]),
			BatchID:     binary.BigEndian.Uint64(h[12:20]),
			BlockOffset: binary.BigEndian.Uint32(h[20:24]),
		}
	}
	SpoolBatchWithPreimageAndName(c, preimage, batchID)
}

func SpoolBatchWithPreimage(c *Cols, preimage DedupTokenPreimage) {
	SpoolBatchWithPreimageAndName(c, preimage, preimage.TokenString())
}

func SpoolBatchWithPreimageAndName(c *Cols, preimage DedupTokenPreimage, segName string) {
	if err := os.MkdirAll(telemetrySpoolDir, 0755); err != nil {
		log.Printf("[ERROR] telemetry spool dir %s cannot be created: %v", telemetrySpoolDir, err)
	}
	enforceSpoolSizeLimit()

	seq := globalSpoolSequence.Add(1)
	tmpPath := fmt.Sprintf("%s/seg-%016d-%s.bin.tmp", telemetrySpoolDir, seq, segName)
	finalPath := fmt.Sprintf("%s/seg-%016d-%s.bin", telemetrySpoolDir, seq, segName)

	f, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)
	if err != nil {
		log.Printf("[SPOOL] Failed to create temp spool file: %v", err)
		return
	}

	// 1. Write Header: 4-byte Magic + 2-byte Version + 8-byte SpoolTimestampMs + 24-byte Preimage (Total 38 bytes)
	if _, err := f.Write([]byte(SpoolFileMagic)); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return
	}
	var verBuf [2]byte
	binary.BigEndian.PutUint16(verBuf[:], SpoolFileVersion3)
	if _, err := f.Write(verBuf[:]); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return
	}
	var tsBuf [8]byte
	binary.BigEndian.PutUint64(tsBuf[:], uint64(time.Now().UTC().UnixMilli()))
	if _, err := f.Write(tsBuf[:]); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return
	}
	preimageBytes := preimage.Bytes()
	if _, err := f.Write(preimageBytes[:]); err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		return
	}

	// 2. Wrap file with fast zstd stream encoder
	zw, err := zstd.NewWriter(f, zstd.WithEncoderLevel(zstd.SpeedFastest))
	if err != nil {
		_ = f.Close()
		_ = os.Remove(tmpPath)
		log.Printf("[SPOOL] Failed to create zstd writer: %v", err)
		return
	}

	// 3. Encode GOB stream through zstd
	enc := gob.NewEncoder(zw)
	if err := enc.Encode(c); err != nil {
		_ = zw.Close()
		_ = f.Close()
		_ = os.Remove(tmpPath)
		log.Printf("[SPOOL] Failed to encode spool batch: %v", err)
		return
	}
	_ = zw.Close()
	_ = f.Sync()
	_ = f.Close()

	if err := os.Rename(tmpPath, finalPath); err != nil {
		log.Printf("[SPOOL] Failed to atomically rename spool file: %v", err)
		_ = os.Remove(tmpPath)
		return
	}

	// Fsync parent directory for full crash durability across sudden power loss
	if dir, err := os.Open(telemetrySpoolDir); err == nil {
		_ = dir.Sync()
		_ = dir.Close()
	}
}

func peekSpoolFileTimestampAndSeq(filePath string) (time.Time, uint64, error) {
	seq := parseSpoolSeqFromFilename(filepath.Base(filePath))
	f, err := os.Open(filePath)
	if err != nil {
		return time.Time{}, seq, err
	}
	defer f.Close()

	var hdr [38]byte
	n, err := io.ReadFull(f, hdr[:])
	if err != nil && n < 6 {
		return time.Time{}, seq, err
	}
	if string(hdr[0:4]) != SpoolFileMagic {
		return time.Time{}, seq, fmt.Errorf("invalid magic")
	}
	version := binary.BigEndian.Uint16(hdr[4:6])
	if version == SpoolFileVersion3 && n >= 14 {
		tsMs := int64(binary.BigEndian.Uint64(hdr[6:14]))
		return time.UnixMilli(tsMs).UTC(), seq, nil
	}
	// Fallback for v1/v2: inspect file mtime
	if fi, err := f.Stat(); err == nil {
		return fi.ModTime().UTC(), seq, nil
	}
	return time.Time{}, seq, nil
}

func readSpoolFileWithPreimage(filePath string) (*Cols, DedupTokenPreimage, error) {
	f, err := os.Open(filePath)
	if err != nil {
		return nil, DedupTokenPreimage{}, err
	}
	defer f.Close()

	var magic [4]byte
	if _, err := io.ReadFull(f, magic[:]); err != nil || string(magic[:]) != SpoolFileMagic {
		return nil, DedupTokenPreimage{}, fmt.Errorf("invalid spool magic header: %v", magic)
	}

	var verBuf [2]byte
	if _, err := io.ReadFull(f, verBuf[:]); err != nil {
		return nil, DedupTokenPreimage{}, fmt.Errorf("failed to read spool version: %v", err)
	}
	version := binary.BigEndian.Uint16(verBuf[:])

	var preimage DedupTokenPreimage
	if version == SpoolFileVersion3 {
		var tsBuf [8]byte
		if _, err := io.ReadFull(f, tsBuf[:]); err != nil {
			return nil, DedupTokenPreimage{}, fmt.Errorf("failed to read 8-byte spool timestamp: %v", err)
		}
		var pBuf [24]byte
		if _, err := io.ReadFull(f, pBuf[:]); err != nil {
			return nil, DedupTokenPreimage{}, fmt.Errorf("failed to read 24-byte token preimage: %v", err)
		}
		preimage = DedupTokenPreimage{
			WorkerID:    binary.BigEndian.Uint32(pBuf[0:4]),
			Nonce:       binary.BigEndian.Uint64(pBuf[4:12]),
			BatchID:     binary.BigEndian.Uint64(pBuf[12:20]),
			BlockOffset: binary.BigEndian.Uint32(pBuf[20:24]),
		}
	} else if version == SpoolFileVersion2 {
		var pBuf [24]byte
		if _, err := io.ReadFull(f, pBuf[:]); err != nil {
			return nil, DedupTokenPreimage{}, fmt.Errorf("failed to read 24-byte token preimage: %v", err)
		}
		preimage = DedupTokenPreimage{
			WorkerID:    binary.BigEndian.Uint32(pBuf[0:4]),
			Nonce:       binary.BigEndian.Uint64(pBuf[4:12]),
			BatchID:     binary.BigEndian.Uint64(pBuf[12:20]),
			BlockOffset: binary.BigEndian.Uint32(pBuf[20:24]),
		}
	} else if version == SpoolFileVersion1 {
		base := filepath.Base(filePath)
		token := strings.TrimSuffix(strings.TrimPrefix(base, "seg-"), ".bin")
		if p, err := ParseDedupTokenPreimage(token); err == nil {
			preimage = p
		}
	} else {
		return nil, DedupTokenPreimage{}, fmt.Errorf("incompatible spool version: got %d, expected %d", version, SpoolFileVersion3)
	}

	zr, err := zstd.NewReader(f)
	if err != nil {
		return nil, preimage, fmt.Errorf("failed to initialize zstd reader: %v", err)
	}
	defer zr.Close()

	var cols Cols
	dec := gob.NewDecoder(zr)
	if err := dec.Decode(&cols); err != nil {
		return nil, preimage, fmt.Errorf("gob decode failure: %v", err)
	}
	return &cols, preimage, nil
}

func readSpoolFile(filePath string) (*Cols, error) {
	cols, _, err := readSpoolFileWithPreimage(filePath)
	return cols, err
}

func StartTelemetryReplayer(ctx context.Context, wg *sync.WaitGroup, conn driver.Conn) {
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				if time.Now().UnixNano() < telemetryBreakerUntil.Load() {
					continue
				}

				files, err := os.ReadDir(telemetrySpoolDir)
				if err != nil || len(files) == 0 {
					continue
				}

				// Replay the oldest file rate-limited to <= 10 batches/s (100ms per batch)
				replayTicker := time.NewTicker(100 * time.Millisecond)
				for _, file := range files {
					if !strings.HasSuffix(file.Name(), ".bin") {
						continue
					}
					select {
					case <-ctx.Done():
						replayTicker.Stop()
						return
					case <-replayTicker.C:
					}

					filePath := fmt.Sprintf("%s/%s", telemetrySpoolDir, file.Name())

					replayCols, preimage, err := readSpoolFileWithPreimage(filePath)
					if err == nil {
						// Re-use the existing flush with the exact original persisted token
						fctx, cancel := context.WithTimeout(ctx, 2*time.Second)
						token := preimage.TokenString()
						success := flush(fctx, conn, replayCols, token)
						cancel()

						if success {
							TelemetryFailed.Add(^uint64(replayCols.len() - 1))
							TelemetryFlushed.Add(uint64(replayCols.len()))
							os.Remove(filePath)
							log.Printf("[TELEMETRY] Replayed and removed spool segment: %s (%d rows)", file.Name(), replayCols.len())
						} else {
							// Flush failed; break out and wait for next ticker
							break
						}
					} else {
						// Corrupted segment or version mismatch: quarantine to prevent infinite replay loop
						quarantinePath := fmt.Sprintf("%s/corrupt-%s", telemetrySpoolDir, file.Name())
						os.Rename(filePath, quarantinePath)
						log.Printf("[SPOOL] Quarantined corrupted spool segment: %s (err: %v)", file.Name(), err)
					}
				}
				replayTicker.Stop()
			}
		}
	}()
}

// FinalTelemetryDrainAndFlush is called during engine shutdown after workers have drained/abandoned.
// It drains remaining in-flight queue items and attempts to replay any spooled files.
func FinalTelemetryDrainAndFlush(conn driver.Conn, timeout time.Duration) {
	if conn == nil {
		return
	}

	// 1. Drain TelemetryQueue and flush to ClickHouse
	buf := newCols(10000)
	drain(buf)
	if buf.len() > 0 {
		fctx, cancel := context.WithTimeout(context.Background(), timeout)
		batchID := uuid.New().String()
		if ok := flush(fctx, conn, buf, batchID); ok {
			TelemetryFlushed.Add(uint64(buf.len()))
		} else {
			SpoolBatch(buf, batchID)
			TelemetryFailed.Add(uint64(buf.len()))
		}
		cancel()
	}
	ActiveBufRows.Store(0)

	// 2. Replay all remaining spool files in telemetrySpoolDir using sequence-ordered replayer
	ReplaySpoolFiles(conn, timeout)
}

// ReplaySpoolFiles synchronously drains and replays all pending spool segments in telemetrySpoolDir.
func ReplaySpoolFiles(conn driver.Conn, timeout time.Duration) int {
	return ReplaySpoolFilesWithRateLimit(conn, DefaultReplayBatchesPerSec, timeout)
}

type spoolAttempt struct {
	attempts      int
	firstFailedAt time.Time
}

var (
	replayAttemptsMu        sync.Mutex
	replayAttempts          = make(map[string]spoolAttempt)
	QuarantineBackoffWindow = 10 * time.Minute
)

// ReplaySpoolFilesWithRateLimit drains and replays all pending spool segments rate-limited to maxBatchesPerSec.
// Files are sorted and replayed strictly in chronological sequence order (lowest seq first) to maintain deduplication invariants.
func ReplaySpoolFilesWithRateLimit(conn driver.Conn, maxBatchesPerSec int, timeout time.Duration) int {
	files, err := os.ReadDir(telemetrySpoolDir)
	if err != nil {
		return 0
	}
	replayed := 0
	delay := 100 * time.Millisecond
	if maxBatchesPerSec > 0 {
		delay = time.Second / time.Duration(maxBatchesPerSec)
	}

	type fileWithMeta struct {
		entry     os.DirEntry
		seq       uint64
		spoolTime time.Time
		name      string
	}
	var validFiles []fileWithMeta

	for _, file := range files {
		if strings.HasSuffix(file.Name(), ".bin") {
			fullPath := filepath.Join(telemetrySpoolDir, file.Name())
			ts, seq, _ := peekSpoolFileTimestampAndSeq(fullPath)
			validFiles = append(validFiles, fileWithMeta{
				entry:     file,
				seq:       seq,
				spoolTime: ts,
				name:      file.Name(),
			})
		}
	}

	// Sort strictly by monotonic sequence (with filename as deterministic tie-break)
	// Completely immune to coarse filesystem mtime granularity or cp/tar restore mtime reset!
	sort.Slice(validFiles, func(i, j int) bool {
		if validFiles[i].seq != validFiles[j].seq {
			return validFiles[i].seq < validFiles[j].seq
		}
		return validFiles[i].name < validFiles[j].name
	})

	// The chronologically oldest segment in sequence is validFiles[0]!
	if len(validFiles) > 0 {
		oldest := validFiles[0]
		if !oldest.spoolTime.IsZero() {
			age := time.Since(oldest.spoolTime)
			TelemetryOldestSpoolAgeSeconds.Store(uint64(age.Seconds()))
			if age > 10*time.Minute {
				TelemetryAlertCount.Add(1)
				log.Printf("[TELEMETRY ALERT] Oldest spool segment %s (seq=%d, spooled at %s) has been un-replayed for %v (exceeds 10m SLA)",
					oldest.name, oldest.seq, oldest.spoolTime.Format(time.RFC3339), age)
			}
		}
	} else {
		TelemetryOldestSpoolAgeSeconds.Store(0)
	}

	for _, item := range validFiles {
		file := item.entry
		filePath := fmt.Sprintf("%s/%s", telemetrySpoolDir, file.Name())
		replayCols, preimage, err := readSpoolFileWithPreimage(filePath)
		if err == nil {
			fctx, cancel := context.WithTimeout(context.Background(), timeout)
			token := preimage.TokenString()
			t0 := time.Now()
			success, retryable := flushInternal(fctx, conn, replayCols, token)
			cancel()
			if success {
				os.Remove(filePath)
				replayed += replayCols.len()
				replayAttemptsMu.Lock()
				delete(replayAttempts, file.Name())
				replayAttemptsMu.Unlock()
				log.Printf("[REPLAY] Replayed spool segment %s (%d rows) in %v [rate-limited <= %d batches/s]",
					file.Name(), replayCols.len(), time.Since(t0), maxBatchesPerSec)
			} else {
				if !retryable {
					replayAttemptsMu.Lock()
					att := replayAttempts[file.Name()]
					if att.firstFailedAt.IsZero() {
						att.firstFailedAt = time.Now()
					}
					att.attempts++
					replayAttempts[file.Name()] = att
					attCount := att.attempts
					firstFail := att.firstFailedAt
					replayAttemptsMu.Unlock()

					// Quarantine only after >= 3 attempts spaced across QuarantineBackoffWindow
					if attCount >= 3 && time.Since(firstFail) >= QuarantineBackoffWindow {
						quarantineDir := filepath.Join(telemetrySpoolDir, "quarantine")
						_ = os.MkdirAll(quarantineDir, 0755)
						targetPath := filepath.Join(quarantineDir, file.Name())
						_ = os.Rename(filePath, targetPath)
						TelemetryQuarantineCount.Add(1)
						log.Printf("[TELEMETRY QUARANTINE] Spool segment %s failed %d non-retryable attempts over %v -> QUARANTINED to %s",
							file.Name(), attCount, time.Since(firstFail), targetPath)
					}
				} else {
					log.Printf("[REPLAY] Spool segment %s failed with RETRYABLE error -> retained on disk without incrementing quarantine", file.Name())
				}
			}
			time.Sleep(delay)
		}
	}
	return replayed
}

