package core

import (
	"log"
	"math/bits"
	"net"
	"os"
	"sync/atomic"
	"time"
)

var EnableConnTelemetry = os.Getenv("ENGINE_CONN_TELEMETRY") == "true"

type connAgg struct {
	conns     atomic.Int64
	bytesIn   atomic.Int64
	bytesOut  atomic.Int64
	lifeNanos atomic.Int64
	hist      [24]atomic.Int64 // log2 buckets of (in+out) bytes
	_         [64]byte
}

// connAggs[cohort][isTLS]; cohort 0 = default, cohort 1 = classical key-share
var connAggs [2][2]connAgg

func (a *connAgg) record(in, out int64, life time.Duration) {
	a.conns.Add(1)
	a.bytesIn.Add(in)
	a.bytesOut.Add(out)
	a.lifeNanos.Add(int64(life))

	total := uint64(in + out)
	b := bits.Len64(total) - 1
	if b < 0 {
		b = 0
	}
	if b >= len(a.hist) {
		b = len(a.hist) - 1
	}
	a.hist[b].Add(1)
}

type telemetryConn struct {
	net.Conn
	in     atomic.Int64
	out    atomic.Int64
	seenW  atomic.Bool
	isTLS  atomic.Bool
	closed atomic.Bool
	cohort int
	opened time.Time
}

func newTelemetryConn(c net.Conn, cohort int) net.Conn {
	if !EnableConnTelemetry {
		return c
	}
	return &telemetryConn{
		Conn:   c,
		cohort: cohort,
		opened: time.Now(),
	}
}

func (c *telemetryConn) Read(p []byte) (int, error) {
	n, err := c.Conn.Read(p)
	if n > 0 {
		c.in.Add(int64(n))
	}
	return n, err
}

func (c *telemetryConn) Write(p []byte) (int, error) {
	if len(p) > 0 && c.seenW.CompareAndSwap(false, true) {
		// TLS handshake record (0x16) with TLS major version 3 (e.g. 0x03, 0x01/0x03)
		c.isTLS.Store(len(p) >= 2 && p[0] == 0x16 && p[1] == 0x03)
	}
	n, err := c.Conn.Write(p)
	if n > 0 {
		c.out.Add(int64(n))
	}
	return n, err
}

func (c *telemetryConn) Close() error {
	err := c.Conn.Close()
	// Skip connections closed without any write activity to prevent junk 0-byte entries
	if c.closed.CompareAndSwap(false, true) && c.seenW.Load() {
		t := 0
		if c.isTLS.Load() {
			t = 1
		}
		connAggs[c.cohort][t].record(c.in.Load(), c.out.Load(), time.Since(c.opened))
	}
	return err
}

func ResetConnStats() {
	for c := 0; c < 2; c++ {
		for t := 0; t < 2; t++ {
			a := &connAggs[c][t]
			a.conns.Store(0)
			a.bytesIn.Store(0)
			a.bytesOut.Store(0)
			a.lifeNanos.Store(0)
			for i := range a.hist {
				a.hist[i].Store(0)
			}
		}
	}
}

func LogConnStats() {
	if !EnableConnTelemetry {
		return
	}
	for c := 0; c < 2; c++ {
		for t := 0; t < 2; t++ {
			agg := &connAggs[c][t]
			cnt := agg.conns.Load()
			if cnt == 0 {
				continue
			}
			in := agg.bytesIn.Load()
			out := agg.bytesOut.Load()
			life := time.Duration(agg.lifeNanos.Load())
			avgIn := in / cnt
			avgOut := out / cnt
			avgLife := life / time.Duration(cnt)
			isTLSLabel := "plain"
			if t == 1 {
				isTLSLabel = "tls"
			}
			log.Printf("[CONN_STATS] cohort=%d proto=%s conns=%d avg_in=%d avg_out=%d avg_life=%v",
				c, isTLSLabel, cnt, avgIn, avgOut, avgLife)
		}
	}
}
