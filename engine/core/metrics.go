package core

import (
	"context"
	"encoding/gob"
	"fmt"
	"log"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
	"github.com/google/uuid"
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
}

var (
	TelemetryQueue   = make(chan Sample, 65536)
	TelemetryDropped atomic.Uint64
)

// Emit pushes a latency sample into the non-blocking channel.
func Emit(s Sample) {
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
	ID        []uuid.UUID
	Ts        []time.Time
	Lat       []uint32
	St        []uint8
	Er        []uint8
	Kd        []uint8
	Iv        []uint16
	ProbeKind []uint8
	PhaseKind []uint8
	Attempts  []uint8
	TotalLat  []uint32
	Reused    []uint8
	DidResume []uint8
	ReqMethod []uint8
	ReqScheme []uint8
}

func newCols(cap int) *Cols {
	return &Cols{
		ID:        make([]uuid.UUID, 0, cap),
		Ts:        make([]time.Time, 0, cap),
		Lat:       make([]uint32, 0, cap),
		St:        make([]uint8, 0, cap),
		Er:        make([]uint8, 0, cap),
		Kd:        make([]uint8, 0, cap),
		Iv:        make([]uint16, 0, cap),
		ProbeKind: make([]uint8, 0, cap),
		PhaseKind: make([]uint8, 0, cap),
		Attempts:  make([]uint8, 0, cap),
		TotalLat:  make([]uint32, 0, cap),
		Reused:    make([]uint8, 0, cap),
		DidResume: make([]uint8, 0, cap),
		ReqMethod: make([]uint8, 0, cap),
		ReqScheme: make([]uint8, 0, cap),
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
}

var telemetryBreakerUntil atomic.Int64
var TelemetrySpoolEvicted atomic.Uint64
const telemetrySpoolDir = "telemetry-spool"

func flush(ctx context.Context, conn driver.Conn, c *Cols) bool {
	if c.len() == 0 {
		return true
	}

	var batch driver.Batch
	var err error
	for attempt := 1; attempt <= 3; attempt++ {
		batch, err = conn.PrepareBatch(ctx, "INSERT INTO uptime_telemetry (monitor_id, ts, latency_us, status, err_code, probe_kind, interval_s, phase_kind, attempts, total_latency_us, reused, did_resume, req_method, req_scheme)")
		if err == nil {
			break
		}
		time.Sleep(time.Duration(attempt) * 500 * time.Millisecond)
	}
	
	if err != nil {
		log.Printf("ClickHouse PrepareBatch error after 3 attempts: %v", err)
		return false
	}

	if err := batch.Column(0).Append(c.ID); err != nil { return false }
	if err := batch.Column(1).Append(c.Ts); err != nil { return false }
	if err := batch.Column(2).Append(c.Lat); err != nil { return false }
	if err := batch.Column(3).Append(c.St); err != nil { return false }
	if err := batch.Column(4).Append(c.Er); err != nil { return false }
	if err := batch.Column(5).Append(c.ProbeKind); err != nil { return false }
	if err := batch.Column(6).Append(c.Iv); err != nil { return false }
	if err := batch.Column(7).Append(c.PhaseKind); err != nil { return false }
	if err := batch.Column(8).Append(c.Attempts); err != nil { return false }
	if err := batch.Column(9).Append(c.TotalLat); err != nil { return false }
	if err := batch.Column(10).Append(c.Reused); err != nil { return false }
	if err := batch.Column(11).Append(c.DidResume); err != nil { return false }
	if err := batch.Column(12).Append(c.ReqMethod); err != nil { return false }
	if err := batch.Column(13).Append(c.ReqScheme); err != nil { return false }
	
	if err := batch.Send(); err != nil {
		log.Printf("ClickHouse batch Send error: %v", err)
		return false
	}
	
	return true
}

func StartTelemetryFlusher(ctx context.Context, wg *sync.WaitGroup, conn driver.Conn, cfg Config) {
	if cfg.MaxRows == 0 {
		cfg.MaxRows = 10000
	}
	if cfg.FlushEvery == 0 {
		cfg.FlushEvery = 5 * time.Second
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		activeBuf := newCols(cfg.MaxRows)
		tick := time.NewTicker(cfg.FlushEvery)
		defer tick.Stop()

		flushChan := make(chan *Cols, 2)
		
		// Async flusher goroutine
		wg.Add(1)
		go func() {
			defer wg.Done()
			for b := range flushChan {
				attemptFlush(ctx, conn, b)
			}
		}()

		for {
			select {
			case s := <-TelemetryQueue:
				activeBuf.add(s)
				if activeBuf.len() >= cfg.MaxRows {
					flushChan <- activeBuf
					activeBuf = newCols(cfg.MaxRows)
				}
			case <-tick.C:
				if activeBuf.len() > 0 {
					flushChan <- activeBuf
					activeBuf = newCols(cfg.MaxRows)
				}
			case <-ctx.Done():
				// Non-blocking read of what is queued
				drain(activeBuf)
				if activeBuf.len() > 0 {
					fctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
					attemptFlush(fctx, conn, activeBuf)
					cancel()
				}
				close(flushChan)
				return
			}
		}
	}()
}

func attemptFlush(ctx context.Context, conn driver.Conn, buf *Cols) {
	if time.Now().UnixNano() < telemetryBreakerUntil.Load() {
		SpoolBatch(buf)
		buf.reset()
		return
	}

	if success := flush(ctx, conn, buf); success {
		buf.reset()
	} else {
		// Circuit break for 30s
		telemetryBreakerUntil.Store(time.Now().Add(30 * time.Second).UnixNano())
		SpoolBatch(buf)
		buf.reset()
	}
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

func SpoolBatch(c *Cols) {
	os.MkdirAll(telemetrySpoolDir, 0755)
	
	f, err := os.OpenFile(fmt.Sprintf("%s/seg-%d.bin", telemetrySpoolDir, time.Now().UnixNano()), os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("Failed to create spool file: %v", err)
		return
	}
	defer f.Close()

	enc := gob.NewEncoder(f)
	if err := enc.Encode(c); err != nil {
		log.Printf("Failed to encode spool batch: %v", err)
	}
}

func StartTelemetryReplayer(ctx context.Context, wg *sync.WaitGroup, conn driver.Conn) {
	wg.Add(1)
	go func() {
		defer wg.Done()
		ticker := time.NewTicker(60 * time.Second)
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

				// Replay the oldest file
				file := files[0]
				filePath := fmt.Sprintf("%s/%s", telemetrySpoolDir, file.Name())

				f, err := os.Open(filePath)
				if err != nil {
					continue
				}

				var replayCols Cols
				dec := gob.NewDecoder(f)
				if err := dec.Decode(&replayCols); err == nil {
					f.Close()
					
					// Re-use the existing flush (without recursive attemptFlush)
					if success := flush(ctx, conn, &replayCols); success {
						os.Remove(filePath)
						log.Printf("Replayed and removed telemetry spool segment: %s", file.Name())
					}
				} else {
					f.Close()
					os.Remove(filePath) // Corrupted
				}
			}
		}
	}()
}
