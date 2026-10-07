package core

import (
	"fmt"
	"hash/fnv"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync/atomic"
	"time"
)

// CompressionPercent is the share (0-100) of keyword monitors that negotiate
// compression. Selection is sticky per monitor ID so canary and control cohorts
// stay stable and comparable across check intervals.
//
// Set via COMPRESSION_PERCENT env var (e.g. COMPRESSION_PERCENT=1 for 1%
// canary). Safe to store at runtime via CompressionPercent.Store(n).
var CompressionPercent atomic.Int32

func init() {
	if v, err := strconv.Atoi(os.Getenv("COMPRESSION_PERCENT")); err == nil && v >= 0 && v <= 100 {
		CompressionPercent.Store(int32(v))
	}
}

// compressionEnabledFor returns true if this monitor ID falls in the active
// canary cohort. The FNV hash is stable (same input → same bucket every call),
// so a monitor's cohort membership does not change between checks.
func compressionEnabledFor(monitorID string) bool {
	p := CompressionPercent.Load()
	if p <= 0 {
		return false
	}
	if p >= 100 {
		return true
	}
	h := fnv.New32a()
	_, _ = h.Write([]byte(monitorID))
	return int32(h.Sum32()%100) < p
}

// encStats holds per-cohort, per-encoding counters. All fields are atomics so
// RecordBody is allocation-free and safe on the hot path without locks.
type encStats struct {
	checks, wire, decoded, windowFull, failures atomic.Int64
}

var bodyEncodings = []string{"identity", "gzip", "deflate", "br", "zstd", "other"}

// bodyStats is [cohort][encoding]: [0]=control, [1]=canary.
// The map is populated once at init and is read-only thereafter, so map lookups
// are race-free.
var bodyStats = func() [2]map[string]*encStats {
	var m [2]map[string]*encStats
	for i := range m {
		m[i] = make(map[string]*encStats, len(bodyEncodings))
		for _, e := range bodyEncodings {
			m[i][e] = &encStats{}
		}
	}
	return m
}()

// RecordBody is allocation-free and lock-free; safe to call in the check
// hot-path. Unknown Content-Encoding values collapse into "other".
func RecordBody(canary bool, enc string, wireBytes int64, decodedBytes int, windowFull, failed bool) {
	idx := 0
	if canary {
		idx = 1
	}
	s := bodyStats[idx][enc]
	if s == nil {
		s = bodyStats[idx]["other"]
	}
	s.checks.Add(1)
	s.wire.Add(wireBytes)
	s.decoded.Add(int64(decodedBytes))
	if windowFull {
		s.windowFull.Add(1)
	}
	if failed {
		s.failures.Add(1)
	}
}

// StartBodyStatsLogger emits one aggregated [BODY_STATS] line per active
// cohort+encoding combination per interval. Stop the goroutine by closing stop.
// Call once from main, e.g.:
//
//	stop := make(chan struct{})
//	StartBodyStatsLogger(time.Minute, stop)
func StartBodyStatsLogger(interval time.Duration, stop <-chan struct{}) {
	go func() {
		t := time.NewTicker(interval)
		defer t.Stop()
		for {
			select {
			case <-stop:
				return
			case <-t.C:
				flushBodyStats()
			}
		}
	}()
}

func flushBodyStats() {
	for idx, cohort := range [2]string{"control", "canary"} {
		for _, enc := range bodyEncodings {
			s := bodyStats[idx][enc]
			n := s.checks.Swap(0)
			if n == 0 {
				continue
			}
			log.Printf("[BODY_STATS] cohort=%s enc=%s checks=%d wire_bytes=%d decoded_bytes=%d window_full=%d failures=%d",
				cohort, enc, n,
				s.wire.Swap(0),
				s.decoded.Swap(0),
				s.windowFull.Swap(0),
				s.failures.Swap(0),
			)
		}
	}
	snap := SnapshotValidators(time.Now())
	pairs := snap.StablePairs + snap.ChangedPairs
	log.Printf("[BODY_STATS] validators n=%d | ETag %.1f%% (weak %.1f%%) | LM %.1f%% (usable %.1f%%) | stable-pairs %.1f%% (of %d pairs) | projected-byte-savings %.1f%% | eligible-monitors %d/%d | window %v | Stage4 gate: %s",
		snap.Checked,
		pct(snap.ETag, snap.Checked),
		pct(snap.ETagWeak, snap.Checked),
		pct(snap.LM, snap.Checked),
		pct(snap.LMUsable, snap.Checked),
		pct(snap.StablePairs, pairs),
		pairs,
		pct(snap.BytesSaveable, snap.Bytes),
		snap.EligibleMonitors,
		snap.Monitors,
		snap.Window.Round(time.Second),
		snap.Verdict(),
	)
}

// StartAdminServer binds a hardened HTTP server on addr for runtime config.
// Endpoints:
//
//	GET  /admin/compression       → current CompressionPercent
//	POST /admin/compression?pct=N → atomically set CompressionPercent (0-100)
//
// Access requires Authorization: Bearer $ADMIN_TOKEN. If ADMIN_TOKEN is unset,
// requests are rejected with 403 Forbidden.
// The server is intentionally not wired into the engine's WaitGroup: it is
// advisory and its goroutine can be left to exit with the process.
func StartAdminServer(addr string) {
	mux := http.NewServeMux()
	mux.HandleFunc("/admin/compression", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			fmt.Fprintf(w, "COMPRESSION_PERCENT=%d\n", CompressionPercent.Load())
		case http.MethodPost:
			pStr := r.URL.Query().Get("pct")
			p, err := strconv.Atoi(pStr)
			if err != nil || p < 0 || p > 100 {
				http.Error(w, "pct must be 0-100", http.StatusBadRequest)
				return
			}
			old := CompressionPercent.Swap(int32(p))
			log.Printf("[ADMIN] CompressionPercent changed %d → %d", old, p)
			fmt.Fprintf(w, "ok: COMPRESSION_PERCENT=%d\n", p)
		default:
			http.Error(w, "use GET or POST", http.StatusMethodNotAllowed)
		}
	})
	go func() {
		if !adminAddrIsLoopback(addr) {
			log.Printf("[ADMIN] WARNING: binding to non-loopback address %s", addr)
		}
		log.Printf("[ADMIN] server listening on %s", addr)
		srv := newAdminServer(addr, mux)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("[ADMIN] server exited: %v", err)
		}
	}()
}
