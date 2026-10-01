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
	MonitorID uuid.UUID
	TsMs      int64
	LatencyUs uint32
	IntervalS uint16
	Status    uint8
	Err       uint8
	Kind      uint8
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

type cols struct {
	ID  []uuid.UUID
	Ts  []time.Time
	Lat []uint32
	St  []uint8
	Er  []uint8
	Kd  []uint8
	Iv  []uint16
}

func newCols(cap int) *cols {
	return &cols{
		ID:  make([]uuid.UUID, 0, cap),
		Ts:  make([]time.Time, 0, cap),
		Lat: make([]uint32, 0, cap),
		St:  make([]uint8, 0, cap),
		Er:  make([]uint8, 0, cap),
		Kd:  make([]uint8, 0, cap),
		Iv:  make([]uint16, 0, cap),
	}
}

func (c *cols) add(s Sample) {
	c.ID = append(c.ID, s.MonitorID)
	c.Ts = append(c.Ts, time.UnixMilli(s.TsMs).UTC())
	c.Lat = append(c.Lat, s.LatencyUs)
	c.St = append(c.St, s.Status)
	c.Er = append(c.Er, s.Err)
	c.Kd = append(c.Kd, s.Kind)
	c.Iv = append(c.Iv, s.IntervalS)
}

func (c *cols) len() int {
	return len(c.ID)
}

func (c *cols) reset() {
	c.ID = c.ID[:0]
	c.Ts = c.Ts[:0]
	c.Lat = c.Lat[:0]
	c.St = c.St[:0]
	c.Er = c.Er[:0]
	c.Kd = c.Kd[:0]
	c.Iv = c.Iv[:0]
}

var telemetryBreakerUntil atomic.Int64
var TelemetrySpoolEvicted atomic.Uint64
const telemetrySpoolDir = "telemetry-spool"

func flush(ctx context.Context, conn driver.Conn, c *cols) bool {
	if c.len() == 0 {
		return true
	}

	var batch driver.Batch
	var err error
	for attempt := 1; attempt <= 3; attempt++ {
		batch, err = conn.PrepareBatch(ctx, "INSERT INTO uptime_telemetry")
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
	if err := batch.Column(5).Append(c.Kd); err != nil { return false }
	if err := batch.Column(6).Append(c.Iv); err != nil { return false }
	
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
		buf := newCols(cfg.MaxRows)
		tick := time.NewTicker(cfg.FlushEvery)
		defer tick.Stop()

		for {
			select {
			case s := <-TelemetryQueue:
				buf.add(s)
				if buf.len() >= cfg.MaxRows {
					attemptFlush(ctx, conn, buf)
				}
			case <-tick.C:
				if buf.len() > 0 {
					attemptFlush(ctx, conn, buf)
				}
			case <-ctx.Done():
				// Non-blocking read of what is queued
				drain(buf)
				fctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
				attemptFlush(fctx, conn, buf)
				cancel()
				return
			}
		}
	}()
}

func attemptFlush(ctx context.Context, conn driver.Conn, buf *cols) {
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

func drain(buf *cols) {
	for {
		select {
		case s := <-TelemetryQueue:
			buf.add(s)
		default:
			return
		}
	}
}

func SpoolBatch(c *cols) {
	os.MkdirAll(telemetrySpoolDir, 0755)
	
	f, err := os.OpenFile(fmt.Sprintf("%s/seg-%d.bin", telemetrySpoolDir, time.Now().UnixNano()), os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		log.Printf("Failed to create spool file: %v", err)
		return
	}
	defer f.Close()

	var samples []Sample
	for i := 0; i < c.len(); i++ {
		samples = append(samples, Sample{
			MonitorID: c.ID[i],
			TsMs:      c.Ts[i].UnixMilli(),
			LatencyUs: c.Lat[i],
			Status:    c.St[i],
			Err:       c.Er[i],
			Kind:      c.Kd[i],
			IntervalS: c.Iv[i],
		})
	}

	enc := gob.NewEncoder(f)
	if err := enc.Encode(samples); err != nil {
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

				var samples []Sample
				dec := gob.NewDecoder(f)
				if err := dec.Decode(&samples); err == nil {
					// We successfully decoded, now try to flush it
					replayCols := newCols(len(samples))
					for _, s := range samples {
						replayCols.add(s)
					}
					
					f.Close()
					
					// Re-use the existing flush (without recursive attemptFlush)
					if success := flush(ctx, conn, replayCols); success {
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
