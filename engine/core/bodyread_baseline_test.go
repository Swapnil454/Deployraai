package core

import (
	"bytes"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/valyala/fasthttp"
)

// TestBaseline0PercentErrorMix verifies the error-class mix at COMPRESSION_PERCENT=0.
// It ensures that under identity/uncompressed checks:
//   - KEYWORD errors only fire when the keyword is genuinely missing.
//   - BODY_TRUNCATED errors only fire on actual truncated/cut-off streams.
//   - BODY_DECODE errors are 0 on valid identity responses.
//   - NETWORK errors catch connection/timeout drops.
//
// A spike in BODY_TRUNCATED or BODY_DECODE at 0% would indicate a read path flaw
// unrelated to compression.
func TestBaseline0PercentErrorMix(t *testing.T) {
	// Force 0% compression baseline
	oldPct := CompressionPercent.Swap(0)
	defer CompressionPercent.Store(oldPct)

	if compressionEnabledFor("test-monitor-123") {
		t.Fatal("compressionEnabledFor returned true at 0% baseline!")
	}

	// Spin up 4 mock handlers representing the 4 error categories
	mux := http.NewServeMux()

	// 1. Successful keyword match
	mux.HandleFunc("/ok", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html><body>STATUS: OK - Uptime Engine Healthy</body></html>"))
	})

	// 2. Keyword missing
	mux.HandleFunc("/keyword_missing", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html><body>STATUS: MAINTENANCE MODE</body></html>"))
	})

	// 3. Truncated content-length
	mux.HandleFunc("/truncated", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000") // Promises 1000 bytes, sends only 30
		w.Write([]byte("<html><body>Partial"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	})






	srv := httptest.Server{
		Config: &http.Server{Handler: mux},
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("failed to listen: %v", err)
	}
	srv.Listener = ln
	srv.Start()
	defer srv.Close()

	var (
		countKeyword       atomic.Int64
		countBodyTruncated atomic.Int64
		countBodyDecode    atomic.Int64
		countNetwork       atomic.Int64
		countSuccess       atomic.Int64
	)

	client := &fasthttp.Client{
		StreamResponseBody: true,
		ReadTimeout:        2 * time.Second,
	}

	runCheck := func(endpoint string, keyword string, expectErrClass string) {
		req := fasthttp.AcquireRequest()
		res := fasthttp.AcquireResponse()
		defer fasthttp.ReleaseRequest(req)
		defer fasthttp.ReleaseResponse(res)

		req.SetRequestURI(srv.URL + endpoint)
		req.Header.SetMethod("GET")

		// Ensure 0% baseline behavior: no Accept-Encoding header injected
		if compressionEnabledFor("mon-0") {
			req.Header.Set("Accept-Encoding", AcceptEncoding)
		}

		err := client.DoTimeout(req, res, 2*time.Second)
		if err != nil && res.BodyStream() == nil && len(res.Body()) == 0 {
			countNetwork.Add(1)
			return
		}




		if keyword != "" {
			br, rerr := ReadKeywordBody(res, 65536)
			defer br.Release()

			// Check Content-Encoding header seen by client
			if br.Encoding != "identity" {
				t.Errorf("at 0%% baseline, expected identity encoding, got %q", br.Encoding)
			}

			switch {
			case bytes.Contains(br.Body, []byte(keyword)):
				countSuccess.Add(1)
			case rerr != nil:
				if errors.Is(rerr, errBodyTruncated) {
					countBodyTruncated.Add(1)
				} else if errors.Is(rerr, errBodyDecode) || errors.Is(rerr, errUnsupportedEncoding) {
					countBodyDecode.Add(1)
				} else {
					countNetwork.Add(1)
				}
			default:
				countKeyword.Add(1)
			}
		}
	}

	const iterationsPerCategory = 50
	var wg sync.WaitGroup

	// Category A: OK match (500 checks)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < iterationsPerCategory; i++ {
			runCheck("/ok", "STATUS: OK", "")
		}
	}()

	// Category B: Keyword missing (500 checks)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < iterationsPerCategory; i++ {
			runCheck("/keyword_missing", "STATUS: OK", "KEYWORD")
		}
	}()

	// Category C: Truncated stream (500 checks)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < iterationsPerCategory; i++ {
			runCheck("/truncated", "STATUS: OK", "BODY_TRUNCATED")
		}
	}()

	// Category D: Invalid host (500 network errors)
	wg.Add(1)
	go func() {
		defer wg.Done()
		for i := 0; i < iterationsPerCategory; i++ {
			req := fasthttp.AcquireRequest()
			res := fasthttp.AcquireResponse()
			req.SetRequestURI("http://127.0.0.1:1/invalid_port") // connection refused
			err := client.DoTimeout(req, res, 200*time.Millisecond)
			fasthttp.ReleaseRequest(req)
			fasthttp.ReleaseResponse(res)
			if err != nil {
				countNetwork.Add(1)
			}
		}
	}()

	wg.Wait()

	t.Logf("=== 0%% Baseline Error-Class Mix Summary (%d total checks) ===", iterationsPerCategory*4)
	t.Logf("  SUCCESS        : %d (expected %d)", countSuccess.Load(), iterationsPerCategory)
	t.Logf("  KEYWORD        : %d (expected %d)", countKeyword.Load(), iterationsPerCategory)
	t.Logf("  BODY_TRUNCATED : %d (expected %d)", countBodyTruncated.Load(), iterationsPerCategory)
	t.Logf("  BODY_DECODE    : %d (expected 0)", countBodyDecode.Load())
	t.Logf("  NETWORK        : %d (expected %d)", countNetwork.Load(), iterationsPerCategory)

	// Validations
	if countSuccess.Load() != iterationsPerCategory {
		t.Errorf("SUCCESS count mismatch: got %d, want %d", countSuccess.Load(), iterationsPerCategory)
	}
	if countKeyword.Load() != iterationsPerCategory {
		t.Errorf("KEYWORD error count mismatch: got %d, want %d", countKeyword.Load(), iterationsPerCategory)
	}
	if countBodyTruncated.Load() != iterationsPerCategory {
		t.Errorf("BODY_TRUNCATED error count mismatch: got %d, want %d", countBodyTruncated.Load(), iterationsPerCategory)
	}
	if countBodyDecode.Load() != 0 {
		t.Errorf("SPIKE DETECTED: BODY_DECODE count at 0%% baseline should be 0, got %d!", countBodyDecode.Load())
	}
	if countNetwork.Load() != iterationsPerCategory {
		t.Errorf("NETWORK error count mismatch: got %d, want %d", countNetwork.Load(), iterationsPerCategory)
	}
}
