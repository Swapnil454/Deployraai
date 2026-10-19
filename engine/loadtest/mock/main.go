package main

// Brutal Soak Mock Server — production-equivalent mock farm
// Serves HTTPS on :8443 with realistic failure injection:
//   /mock/up       — 200 OK, 50–500ms latency, 3% 5xx, idle-timeout mix
//   /mock/down     — 503 Internal Server Error
//   /mock/timeout  — hangs 15s (triggers timeout monitors)
//   /mock/keyword  — 200 with "HEALTHY" embedded in HTML body
//   /mock/405      — HEAD → 405, GET → 200 (tests ForceGET learning)
//   /mock/count    — returns total request count (JSON)
//   /mock/override — per-host override API
//
// Latency distribution (realistic):
//   - 60% fast: 50–150ms
//   - 30% medium: 150–400ms
//   - 10% slow: 400–900ms
//
// Failure injection (3% of /mock/up requests):
//   - 1.5% → 500 Internal Server Error
//   - 1.0% → 503 Service Unavailable
//   - 0.5% → connection close without response (simulates mid-body drop)
//
// Idle-timeout simulation:
//   The server closes keep-alive connections randomly after 1–5 requests,
//   mimicking the varied idle_timeout policies of real origins.
//   This drives the engine's warm-socket retry path at a realistic rate.

import (
	"compress/gzip"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	reqCount      int64
	gzipCount     int64
	errorCount    int64
	injectCount   int64 // 5xx injections
	tierCloses    [4]int64
	tierReqs      [4]int64
	closeClusters [5]int64 // 0:~5s, 1:~15s, 2:~60s, 3:~75s, 4:other
)

var idleTimeoutTiers = []time.Duration{
	5 * time.Second,
	15 * time.Second,
	60 * time.Second,
	75 * time.Second,
}

type connContextKey struct{}

type statusRecorder struct {
	http.ResponseWriter
	status      int
	wroteHeader bool
}

func (r *statusRecorder) WriteHeader(code int) {
	if !r.wroteHeader {
		r.status = code
		r.wroteHeader = true
	}
	r.ResponseWriter.WriteHeader(code)
}

// tierForHost hashes the hostname deterministically to one of the 4 idle timeout tiers.
// Real origin servers have a fixed keep-alive policy per host.
func tierForHost(host string) time.Duration {
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	var hash uint32 = 2166136261
	for i := 0; i < len(host); i++ {
		hash ^= uint32(host[i])
		hash *= 16777619
	}
	return idleTimeoutTiers[hash%uint32(len(idleTimeoutTiers))]
}

type idleTierListener struct {
	net.Listener
	tiers []time.Duration
}

func newIdleTierListener(inner net.Listener, tiers []time.Duration) *idleTierListener {
	return &idleTierListener{
		Listener: inner,
		tiers:    tiers,
	}
}

var listenerConnSeq atomic.Uint64

func (l *idleTierListener) Accept() (net.Conn, error) {
	c, err := l.Listener.Accept()
	if err != nil {
		return nil, err
	}
	tier := 15 * time.Second
	if len(l.tiers) > 0 {
		idx := listenerConnSeq.Add(1) - 1
		tier = l.tiers[idx%uint64(len(l.tiers))]
	}
	conn := newIdleTierConn(c, tier)
	conn.tierSet = true
	return conn, nil
}

type idleTierConn struct {
	net.Conn
	tier             time.Duration
	tierSet          bool
	host             string
	timer            *time.Timer
	timerMu          sync.Mutex
	isClosed         atomic.Bool
	lastActivityNano atomic.Int64
}

func newIdleTierConn(c net.Conn, tier time.Duration) *idleTierConn {
	conn := &idleTierConn{
		Conn: c,
		tier: tier,
	}
	conn.lastActivityNano.Store(time.Now().UnixNano())
	return conn
}

func (c *idleTierConn) setHost(host string) {
	c.timerMu.Lock()
	defer c.timerMu.Unlock()
	if host == "" {
		return
	}
	c.host = host
	c.tier = tierForHost(host)
	c.tierSet = true
}

func (c *idleTierConn) resetIdleTimer() {
	c.timerMu.Lock()
	defer c.timerMu.Unlock()
	if c.isClosed.Load() {
		return
	}
	if c.timer != nil {
		c.timer.Stop()
	}
	tier := c.tier
	if !c.tierSet || tier <= 0 {
		tier = 15 * time.Second
	}
	c.lastActivityNano.Store(time.Now().UnixNano())
	c.timer = time.AfterFunc(tier, func() {
		if c.isClosed.CompareAndSwap(false, true) {
			dur := time.Duration(time.Now().UnixNano() - c.lastActivityNano.Load())
			log.Printf("[CONN_TIMEOUT_CLOSE] host=%s tier=%v real_idle=%.2fs", c.host, tier, dur.Seconds())
			switch tier {
			case 5 * time.Second:
				atomic.AddInt64(&tierCloses[0], 1)
				atomic.AddInt64(&closeClusters[0], 1)
			case 15 * time.Second:
				atomic.AddInt64(&tierCloses[1], 1)
				atomic.AddInt64(&closeClusters[1], 1)
			case 60 * time.Second:
				atomic.AddInt64(&tierCloses[2], 1)
				atomic.AddInt64(&closeClusters[2], 1)
			case 75 * time.Second:
				atomic.AddInt64(&tierCloses[3], 1)
				atomic.AddInt64(&closeClusters[3], 1)
			}
			_ = c.Conn.Close()
		}
	})
}

func (c *idleTierConn) stopIdleTimer() {
	c.timerMu.Lock()
	defer c.timerMu.Unlock()
	if c.timer != nil {
		c.timer.Stop()
	}
}

func (c *idleTierConn) Read(b []byte) (int, error) {
	c.lastActivityNano.Store(time.Now().UnixNano())
	n, err := c.Conn.Read(b)
	if n > 0 {
		c.stopIdleTimer()
	}
	return n, err
}

func (c *idleTierConn) Write(b []byte) (int, error) {
	c.lastActivityNano.Store(time.Now().UnixNano())
	return c.Conn.Write(b)
}

func (c *idleTierConn) Close() error {
	c.stopIdleTimer()
	if c.isClosed.CompareAndSwap(false, true) {
		dur := time.Duration(time.Now().UnixNano() - c.lastActivityNano.Load())
		switch {
		case dur < 10*time.Second:
			atomic.AddInt64(&closeClusters[0], 1)
		case dur < 30*time.Second:
			atomic.AddInt64(&closeClusters[1], 1)
		case dur >= 50*time.Second && dur < 70*time.Second:
			atomic.AddInt64(&closeClusters[2], 1)
		case dur >= 70*time.Second && dur < 90*time.Second:
			atomic.AddInt64(&closeClusters[3], 1)
		default:
			atomic.AddInt64(&closeClusters[4], 1)
		}
	}
	return c.Conn.Close()
}

func latency(idx uint64) time.Duration {
	// Goal 2: 50-150 ms latency distribution
	return time.Duration(50+int((idx*37)%101)) * time.Millisecond
}

func acceptsGzip(r *http.Request) bool {
	return strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")
}

func writeGzip(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Encoding", "gzip")
	gz := gzip.NewWriter(w)
	gz.Write(body)
	gz.Close()
}

// injectFailure returns true ~3.5% of the time (within 2-5% Goal 2 requirement)
// with a mix of 500, 503, and timeouts.
func injectFailure(w http.ResponseWriter, idx uint64) bool {
	roll := idx % 200 // resolution of 0.5%
	switch {
	case roll < 4: // 2.0% → 500
		atomic.AddInt64(&injectCount, 1)
		atomic.AddInt64(&errorCount, 1)
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("500 Injected Internal Server Error"))
		return true
	case roll < 6: // 1.0% → 503
		atomic.AddInt64(&injectCount, 1)
		atomic.AddInt64(&errorCount, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("503 Injected Service Unavailable"))
		return true
	case roll < 7: // 0.5% → timeout (sleep 12s then 504)
		atomic.AddInt64(&injectCount, 1)
		atomic.AddInt64(&errorCount, 1)
		time.Sleep(12 * time.Second)
		w.WriteHeader(http.StatusGatewayTimeout)
		w.Write([]byte("504 Injected Gateway Timeout"))
		return true
	}
	return false
}

func main() {
	// Generate self-signed cert on the fly (wildcard *.mock.local + SANs)
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		log.Fatal(err)
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"Brutal Soak Mock Farm"},
		},
		DNSNames:              []string{"mock", "*.mock.local", "localhost"},
		NotBefore:             time.Now().Add(-time.Minute),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		log.Fatal(err)
	}

	certOut, _ := os.Create("cert.pem")
	pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	certOut.Close()

	keyOut, _ := os.Create("key.pem")
	privBytes, _ := x509.MarshalECPrivateKey(priv)
	pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: privBytes})
	keyOut.Close()

	var overrides sync.Map
	var reqIndex atomic.Uint64

	checkOverride := func(r *http.Request) string {
		host, _, _ := net.SplitHostPort(r.Host)
		if host == "" {
			host = r.Host
		}
		if val, ok := overrides.Load(host); ok {
			return val.(string)
		}
		return ""
	}

	mux := http.NewServeMux()

	// ── / (root handler for port checks) ──────────────────────────────────
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"status":"ok","path":"root"}`))
	})

	// ── /mock/override ────────────────────────────────────────────────────
	mux.HandleFunc("/mock/override", func(w http.ResponseWriter, r *http.Request) {
		host := r.URL.Query().Get("host")
		state := r.URL.Query().Get("state")
		if state == "clear" {
			overrides.Delete(host)
		} else {
			overrides.Store(host, state)
		}
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, `{"host":%q,"state":%q}`, host, state)
	})

	// ── /mock/up ──────────────────────────────────────────────────────────
	mux.HandleFunc("/mock/up", func(w http.ResponseWriter, r *http.Request) {
		idx := reqIndex.Add(1)

		if checkOverride(r) == "down" {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("503 Overridden"))
			return
		}

		// 3.5% failure injection before sleeping so the connection is dropped fast.
		if injectFailure(w, idx) {
			return
		}

		time.Sleep(latency(idx))

		body := []byte(`{"status":"ok","service":"uptime-engine-mock"}`)
		w.Header().Set("Content-Type", "application/json")
		if acceptsGzip(r) {
			atomic.AddInt64(&gzipCount, 1)
			w.Header().Set("Vary", "Accept-Encoding")
			writeGzip(w, body)
		} else {
			w.Write(body)
		}
	})

	// ── /mock/down ────────────────────────────────────────────────────────
	mux.HandleFunc("/mock/down", func(w http.ResponseWriter, r *http.Request) {
		if checkOverride(r) == "up" {
			time.Sleep(latency(reqIndex.Add(1)))
			w.Write([]byte(`{"status":"ok","note":"overridden"}`))
			return
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("503 Internal Server Error"))
	})

	// ── /mock/timeout ─────────────────────────────────────────────────────
	mux.HandleFunc("/mock/timeout", func(w http.ResponseWriter, r *http.Request) {
		if checkOverride(r) == "up" {
			time.Sleep(latency(reqIndex.Add(1)))
			w.Write([]byte(`{"status":"ok","note":"overridden"}`))
			return
		}
		time.Sleep(15 * time.Second)
		w.WriteHeader(http.StatusGatewayTimeout)
	})

	// ── /mock/keyword ─────────────────────────────────────────────────────
	mux.HandleFunc("/mock/keyword", func(w http.ResponseWriter, r *http.Request) {
		idx := reqIndex.Add(1)

		if injectFailure(w, idx) {
			return
		}
		time.Sleep(latency(idx))

		htmlBody := []byte(`<!DOCTYPE html>
<html>
<head><title>Service Status Page</title></head>
<body>
<h1>System Status</h1>
<p class="status">All systems: <strong>HEALTHY</strong></p>
<p>Uptime: 99.99% | Last checked: ` + time.Now().UTC().Format(time.RFC3339) + `</p>
<p>Service: uptime-engine-mock | Version: 1.0</p>
</body>
</html>`)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		if acceptsGzip(r) {
			atomic.AddInt64(&gzipCount, 1)
			w.Header().Set("Vary", "Accept-Encoding")
			writeGzip(w, htmlBody)
		} else {
			w.Write(htmlBody)
		}
	})

	// ── /mock/405 ─────────────────────────────────────────────────────────
	mux.HandleFunc("/mock/405", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		time.Sleep(latency(reqIndex.Add(1)))
		w.Write([]byte(`{"status":"ok","method":"GET"}`))
	})

	// ── /mock/count ───────────────────────────────────────────────────────
	mux.HandleFunc("/mock/count", func(w http.ResponseWriter, r *http.Request) {
		stats := map[string]interface{}{
			"total":         atomic.LoadInt64(&reqCount),
			"gzipped":       atomic.LoadInt64(&gzipCount),
			"errors":        atomic.LoadInt64(&errorCount),
			"inject":        atomic.LoadInt64(&injectCount),
			"tier_5s_idle":  atomic.LoadInt64(&tierCloses[0]),
			"tier_15s_idle": atomic.LoadInt64(&tierCloses[1]),
			"tier_60s_idle": atomic.LoadInt64(&tierCloses[2]),
			"tier_75s_idle": atomic.LoadInt64(&tierCloses[3]),
			"tier_5s_reqs":  atomic.LoadInt64(&tierReqs[0]),
			"tier_15s_reqs": atomic.LoadInt64(&tierReqs[1]),
			"tier_60s_reqs": atomic.LoadInt64(&tierReqs[2]),
			"tier_75s_reqs": atomic.LoadInt64(&tierReqs[3]),
			"close_cluster_5s":   atomic.LoadInt64(&closeClusters[0]),
			"close_cluster_15s":  atomic.LoadInt64(&closeClusters[1]),
			"close_cluster_60s":  atomic.LoadInt64(&closeClusters[2]),
			"close_cluster_75s":  atomic.LoadInt64(&closeClusters[3]),
			"close_cluster_other": atomic.LoadInt64(&closeClusters[4]),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	})

	// Periodic log
	go func() {
		for {
			time.Sleep(15 * time.Second)
			log.Printf("[MOCK] total=%d gzipped=%d errors=%d inject_5xx=%d idle_closes=[5s:%d, 15s:%d, 60s:%d, 75s:%d] reqs=[5s:%d, 15s:%d, 60s:%d, 75s:%d] close_clusters=[5s:%d, 15s:%d, 60s:%d, 75s:%d, other:%d]",
				atomic.LoadInt64(&reqCount),
				atomic.LoadInt64(&gzipCount),
				atomic.LoadInt64(&errorCount),
				atomic.LoadInt64(&injectCount),
				atomic.LoadInt64(&tierCloses[0]),
				atomic.LoadInt64(&tierCloses[1]),
				atomic.LoadInt64(&tierCloses[2]),
				atomic.LoadInt64(&tierCloses[3]),
				atomic.LoadInt64(&tierReqs[0]),
				atomic.LoadInt64(&tierReqs[1]),
				atomic.LoadInt64(&tierReqs[2]),
				atomic.LoadInt64(&tierReqs[3]),
				atomic.LoadInt64(&closeClusters[0]),
				atomic.LoadInt64(&closeClusters[1]),
				atomic.LoadInt64(&closeClusters[2]),
				atomic.LoadInt64(&closeClusters[3]),
				atomic.LoadInt64(&closeClusters[4]),
			)
		}
	}()


	var logMu sync.Mutex
	logFile, _ := os.OpenFile("mock_requests.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0644)

	wrappedHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if c, ok := r.Context().Value(connContextKey{}).(net.Conn); ok {
			if direct, ok := c.(*idleTierConn); ok {
				direct.setHost(r.Host)
			} else if tlsC, ok := c.(*tls.Conn); ok {
				if inner, ok := tlsC.NetConn().(*idleTierConn); ok {
					inner.setHost(r.Host)
				}
			}
		}
		atomic.AddInt64(&reqCount, 1)
		tier := tierForHost(r.Host)
		switch tier {
		case 5 * time.Second:
			atomic.AddInt64(&tierReqs[0], 1)
		case 15 * time.Second:
			atomic.AddInt64(&tierReqs[1], 1)
		case 60 * time.Second:
			atomic.AddInt64(&tierReqs[2], 1)
		case 75 * time.Second:
			atomic.AddInt64(&tierReqs[3], 1)
		}

		rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
		mux.ServeHTTP(rec, r)

		if c, ok := r.Context().Value(connContextKey{}).(net.Conn); ok {
			if direct, ok := c.(*idleTierConn); ok {
				direct.resetIdleTimer()
			} else if tlsC, ok := c.(*tls.Conn); ok {
				if inner, ok := tlsC.NetConn().(*idleTierConn); ok {
					inner.resetIdleTimer()
				}
			}
		}

		if rec.status >= 500 {
			atomic.AddInt64(&errorCount, 1)
		}

		if logFile != nil {
			reqID := r.Header.Get("X-Request-ID")
			line := fmt.Sprintf("%s\t%s\t%s\t%d\t%s\n",
				time.Now().UTC().Format(time.RFC3339Nano),
				r.Host, r.URL.Path, rec.status, reqID)
			logMu.Lock()
			logFile.WriteString(line)
			logMu.Unlock()
		}
	})

	cert, err := tls.LoadX509KeyPair("cert.pem", "key.pem")
	if err != nil {
		log.Fatal(err)
	}

	srv := &http.Server{
		Addr:         ":8443",
		Handler:      wrappedHandler,
		ReadTimeout:  120 * time.Second,
		WriteTimeout: 120 * time.Second,
		IdleTimeout:  120 * time.Second,
		ConnContext: func(ctx context.Context, c net.Conn) context.Context {
			return context.WithValue(ctx, connContextKey{}, c)
		},
		TLSConfig: &tls.Config{
			Certificates: []tls.Certificate{cert},
			GetConfigForClient: func(hello *tls.ClientHelloInfo) (*tls.Config, error) {
				if tc, ok := hello.Conn.(*idleTierConn); ok {
					tc.setHost(hello.ServerName)
				}
				return nil, nil
			},
		},
	}

	// Graceful shutdown on interrupt
	go func() {
		sigCh := make(chan os.Signal, 1)
		<-sigCh
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		srv.Shutdown(ctx)
	}()

	rawLn, err := net.Listen("tcp", ":8443")
	if err != nil {
		log.Fatal(err)
	}
	tierLn := newIdleTierListener(rawLn, idleTimeoutTiers)

	log.Printf("Brutal Soak Mock HTTPS server listening on :8443 (latency=50-150ms, per-host idle_timeouts=[5s,15s,60s,75s], injected_failures=3.5%%)")
	if err := srv.ServeTLS(tierLn, "", ""); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}
