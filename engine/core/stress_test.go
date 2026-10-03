package core

import (
	"bytes"
	"compress/gzip"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// TestStressConcurrencyChaos subjects the compression pipeline, admin auth,
// atomic metrics logging, and cohort hashing to intense multi-threaded chaos.
func TestStressConcurrencyChaos(t *testing.T) {
	origToken := os.Getenv("ADMIN_TOKEN")
	testToken := "chaos-stress-token-9999"
	os.Setenv("ADMIN_TOKEN", testToken)
	defer os.Setenv("ADMIN_TOKEN", origToken)

	// Build admin handler
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
			_ = old
			fmt.Fprintf(w, "ok: COMPRESSION_PERCENT=%d\n", p)
		default:
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		}
	})
	adminHandler := adminAuth(mux)

	var stopCh = make(chan struct{})
	var wg sync.WaitGroup

	// Routine Group 1: 50 Workers hammering RecordBody and compressionEnabledFor
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			encodings := []string{"identity", "gzip", "deflate", "br", "zstd", "corrupted", "unknown"}
			r := rand.New(rand.NewSource(int64(workerID)))

			for {
				select {
				case <-stopCh:
					return
				default:
					monID := fmt.Sprintf("mon-%d", r.Intn(10000))
					canary := compressionEnabledFor(monID)
					enc := encodings[r.Intn(len(encodings))]
					wire := int64(r.Intn(100000))
					decoded := r.Intn(65536)
					winFull := r.Float32() < 0.2
					failed := r.Float32() < 0.05

					RecordBody(canary, enc, wire, decoded, winFull, failed)
				}
			}
		}(i)
	}

	// Routine Group 2: 20 Workers hammering Admin API with random valid & invalid tokens
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			r := rand.New(rand.NewSource(int64(workerID + 100)))

			for {
				select {
				case <-stopCh:
					return
				default:
					validToken := r.Float32() < 0.5
					method := http.MethodGet
					if r.Float32() < 0.5 {
						method = http.MethodPost
					}

					pctVal := r.Intn(200) - 50 // includes out of range values (-50 to 150)
					url := fmt.Sprintf("/admin/compression?pct=%d", pctVal)
					if r.Float32() < 0.1 {
						url = "/admin/compression?pct=invalid_str"
					}

					req := httptest.NewRequest(method, url, nil)
					if validToken {
						req.Header.Set("Authorization", "Bearer "+testToken)
					} else {
						req.Header.Set("Authorization", "Bearer wrong-token-"+strconv.Itoa(r.Intn(1000)))
					}

					rec := httptest.NewRecorder()
					adminHandler.ServeHTTP(rec, req)

					// Validate invariant responses
					if !validToken && rec.Code != http.StatusUnauthorized {
						t.Errorf("expected 401 Unauthorized for bad token, got %d", rec.Code)
					}
				}
			}
		}(i)
	}

	// Routine Group 3: High-frequency Stats Flusher (Simulating concurrent log harvest)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-stopCh:
				return
			default:
				flushBodyStats()
				time.Sleep(2 * time.Millisecond)
			}
		}
	}()

	// Run stress simulation for 3 seconds under heavy parallelism
	time.Sleep(3 * time.Second)
	close(stopCh)
	wg.Wait()

	// Perform final integrity flush
	flushBodyStats()
}

// TestDecompressionChaosBombs validates that malformed, corrupted, outputless,
// and highly expansive zip bombs are safely contained without crashing or memory bloat.
func TestDecompressionChaosBombs(t *testing.T) {
	// Scenario 1: Generate a highly compressed zero-bomb (100MB of zeroes compressed into ~100KB)
	var bombBuf bytes.Buffer
	gw := gzip.NewWriter(&bombBuf)
	zeroes := make([]byte, 1024*1024) // 1MB buffer
	for i := 0; i < 100; i++ {        // 100MB uncompressed
		_, _ = gw.Write(zeroes)
	}
	_ = gw.Close()

	// Feed bomb to Keyword Body Reader via readBody
	br, wireErr := readBody(gzipStreamReader(bombBuf.Bytes()), "gzip", 65536)
	defer br.Release()

	if wireErr != nil && wireErr != errBodyTruncated {
		t.Fatalf("unexpected wire error on gzip bomb: %v", wireErr)
	}
	if !br.WindowFull {
		t.Errorf("expected WindowFull to be true for 100MB bomb, got false")
	}
	if len(br.Body) > 65536 {
		t.Errorf("prefix memory exceeded 64KB window cap: got %d bytes", len(br.Body))
	}

	// Scenario 2: Corrupted header streams
	corruptedPayloads := [][]byte{
		{},
		{0x1f, 0x8b}, // incomplete gzip header
		{0x28, 0xb5, 0x2f, 0xfd, 0x00}, // malformed zstd frame
		bytes.Repeat([]byte{0xFF}, 500),  // garbage data
	}

	for idx, payload := range corruptedPayloads {
		t.Run(fmt.Sprintf("Corrupted-%d", idx), func(t *testing.T) {
			res, derr := readBody(bytes.NewReader(payload), "gzip", 65536)
			defer res.Release()
			_ = derr
		})
	}
}

// Helper mock reader for gzip streams
func gzipStreamReader(b []byte) *bytes.Reader {
	return bytes.NewReader(b)
}

// TestCohortDistributionUniformity validates FNV hash bucket distribution across 100,000 monitors.
func TestCohortDistributionUniformity(t *testing.T) {
	CompressionPercent.Store(10) // 10% target canary

	var canaryCount atomic.Int64
	var totalMonitors int64 = 100000

	var wg sync.WaitGroup
	workers := 10
	perWorker := totalMonitors / int64(workers)

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(workerIdx int) {
			defer wg.Done()
			start := int64(workerIdx) * perWorker
			end := start + perWorker
			for i := start; i < end; i++ {
				monID := fmt.Sprintf("monitor-uuid-%d-production-check", i)
				if compressionEnabledFor(monID) {
					canaryCount.Add(1)
				}
			}
		}(w)
	}
	wg.Wait()

	pct := float64(canaryCount.Load()) / float64(totalMonitors) * 100.0
	t.Logf("Uniformity check: 100,000 monitors with COMPRESSION_PERCENT=10 -> %.2f%% allocated to canary", pct)

	// FNV hash uniformity across 100k monitors should fall strictly within 9.0% - 11.0%
	if pct < 9.0 || pct > 11.0 {
		t.Errorf("FNV cohort distribution skewed: expected ~10.0%%, got %.2f%%", pct)
	}
}

// TestEngineRampCapability simulates a live production rollout:
// Ramping 1% -> 10% -> 100% -> 0% via authenticated HTTP POST requests,
// verifying exact monitor allocation at each stage for 100,000 monitors.
func TestEngineRampCapability(t *testing.T) {
	token := "live-env-secret-token-12345"
	os.Setenv("ADMIN_TOKEN", token)

	mux := http.NewServeMux()
	mux.HandleFunc("/admin/compression", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			pStr := r.URL.Query().Get("pct")
			p, err := strconv.Atoi(pStr)
			if err != nil || p < 0 || p > 100 {
				http.Error(w, "pct must be 0-100", http.StatusBadRequest)
				return
			}
			CompressionPercent.Store(int32(p))
			fmt.Fprintf(w, "ok: COMPRESSION_PERCENT=%d\n", p)
		}
	})
	handler := adminAuth(mux)

	rampStages := []struct {
		targetPct int
		minExpect float64
		maxExpect float64
	}{
		{1, 0.7, 1.3},     // 1% canary (expect ~0.7% to 1.3%)
		{10, 9.0, 11.0},   // 10% canary (expect ~9.0% to 11.0%)
		{100, 100.0, 100.0},// 100% full rollout (expect exactly 100%)
		{0, 0.0, 0.0},     // 0% kill switch (expect exactly 0%)
	}

	const totalMonitors = 100000

	for _, stage := range rampStages {
		t.Run(fmt.Sprintf("RampTo-%d-Percent", stage.targetPct), func(t *testing.T) {
			// POST to HTTP Admin endpoint with Bearer token
			url := fmt.Sprintf("/admin/compression?pct=%d", stage.targetPct)
			req := httptest.NewRequest(http.MethodPost, url, nil)
			req.Header.Set("Authorization", "Bearer "+token)
			rec := httptest.NewRecorder()

			handler.ServeHTTP(rec, req)

			if rec.Code != http.StatusOK {
				t.Fatalf("Failed to ramp to %d%% via admin endpoint: status %d", stage.targetPct, rec.Code)
			}

			// Verify atomic store update
			if int(CompressionPercent.Load()) != stage.targetPct {
				t.Fatalf("CompressionPercent atomic mismatch: expected %d, got %d", stage.targetPct, CompressionPercent.Load())
			}

			// Evaluate 100,000 monitor cohort hashing
			var canaryHits int64
			for i := 0; i < totalMonitors; i++ {
				monID := fmt.Sprintf("fleet-monitor-%d-uuid", i)
				if compressionEnabledFor(monID) {
					canaryHits++
				}
			}

			actualPct := (float64(canaryHits) / float64(totalMonitors)) * 100.0
			t.Logf("Ramp Stage %d%% -> Actual Canary Cohort: %.2f%% (%d / %d monitors)",
				stage.targetPct, actualPct, canaryHits, totalMonitors)

			if actualPct < stage.minExpect || actualPct > stage.maxExpect {
				t.Errorf("Ramp stage %d%% out of bounds: expected [%.1f%% - %.1f%%], got %.2f%%",
					stage.targetPct, stage.minExpect, stage.maxExpect, actualPct)
			}
		})
	}
}
