package main

import (
	"context"
	"crypto/tls"
	"net"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

func TestMockIdleTiers200Connections(t *testing.T) {
	// 4 test tiers: 100ms, 250ms, 500ms, 800ms
	testTiers := []time.Duration{
		100 * time.Millisecond,
		250 * time.Millisecond,
		500 * time.Millisecond,
		800 * time.Millisecond,
	}

	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		if c, ok := r.Context().Value(connContextKey{}).(net.Conn); ok {
			if direct, ok := c.(*idleTierConn); ok {
				direct.resetIdleTimer()
			} else if tlsC, ok := c.(*tls.Conn); ok {
				if inner, ok := tlsC.NetConn().(*idleTierConn); ok {
					inner.resetIdleTimer()
				}
			}
		}
	})

	rawLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	defer rawLn.Close()

	tierLn := newIdleTierListener(rawLn, testTiers)

	ts := httptest.NewUnstartedServer(handler)
	ts.Listener = tierLn
	ts.Config.ConnContext = func(ctx context.Context, c net.Conn) context.Context {
		return context.WithValue(ctx, connContextKey{}, c)
	}
	ts.StartTLS()
	defer ts.Close()

	const totalConns = 200
	var wg sync.WaitGroup
	var mu sync.Mutex
	durations := make([]time.Duration, 0, totalConns)

	tlsCfg := &tls.Config{InsecureSkipVerify: true}

	for i := 0; i < totalConns; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			conn, err := tls.Dial("tcp", ts.Listener.Addr().String(), tlsCfg)
			if err != nil {
				return
			}
			defer conn.Close()

			// Send HTTP request
			req := "GET / HTTP/1.1\r\nHost: localhost\r\nConnection: keep-alive\r\n\r\n"
			if _, err := conn.Write([]byte(req)); err != nil {
				return
			}

			// Read response until empty line
			buf := make([]byte, 1024)
			n, err := conn.Read(buf)
			if err != nil || n == 0 {
				return
			}

			// Start idle clock
			startIdle := time.Now()
			// Wait for server to close connection on idle timeout
			drainBuf := make([]byte, 128)
			for {
				_, rerr := conn.Read(drainBuf)
				if rerr != nil {
					// Connection closed by server
					elapsed := time.Since(startIdle)
					mu.Lock()
					durations = append(durations, elapsed)
					mu.Unlock()
					return
				}
			}
		}()
	}

	wg.Wait()

	if len(durations) < totalConns*9/10 {
		t.Fatalf("expected at least 90%% successful connections, got %d/%d", len(durations), totalConns)
	}

	// Tally into 4 clusters:
	// Cluster 0: < 175ms (~100ms tier)
	// Cluster 1: 175ms - 375ms (~250ms tier)
	// Cluster 2: 375ms - 650ms (~500ms tier)
	// Cluster 3: > 650ms (~800ms tier)
	buckets := [4]int{}
	for _, d := range durations {
		switch {
		case d < 175*time.Millisecond:
			buckets[0]++
		case d < 375*time.Millisecond:
			buckets[1]++
		case d < 650*time.Millisecond:
			buckets[2]++
		default:
			buckets[3]++
		}
	}

	t.Logf("200 keep-alive idle close distribution:")
	t.Logf("  Tier 1 (~100ms): %d connections (%.1f%%)", buckets[0], float64(buckets[0])*100/float64(len(durations)))
	t.Logf("  Tier 2 (~250ms): %d connections (%.1f%%)", buckets[1], float64(buckets[1])*100/float64(len(durations)))
	t.Logf("  Tier 3 (~500ms): %d connections (%.1f%%)", buckets[2], float64(buckets[2])*100/float64(len(durations)))
	t.Logf("  Tier 4 (~800ms): %d connections (%.1f%%)", buckets[3], float64(buckets[3])*100/float64(len(durations)))

	for i, count := range buckets {
		if count < 15 {
			t.Errorf("Cluster %d had only %d connections; expected ~25%% (>= 15)", i, count)
		}
	}
	t.Logf("PASS: All 4 idle tiers demonstrated over %d real TLS keep-alive connections", len(durations))
}
