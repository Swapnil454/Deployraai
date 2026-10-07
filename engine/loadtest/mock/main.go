package main

// Brutal Soak Mock Server — production-equivalent mock farm
// Serves HTTPS on :8443 with:
//   /mock/up       — 200 OK, realistic 50–500ms latency, optional gzip
//   /mock/down     — 503 Internal Server Error
//   /mock/timeout  — hangs for 15s (triggers timeout monitors)
//   /mock/keyword  — 200 with "HEALTHY" embedded in HTML body (gzip if requested)
//   /mock/405      — HEAD → 405, GET → 200 (tests ForceGET learning)
//   /mock/count    — returns total request count (JSON)
//   /mock/override — per-host override API
//
// Latency distribution (realistic):
//   - 60% fast: 50–150ms
//   - 30% medium: 150–400ms
//   - 10% slow: 400–900ms

import (
	"compress/gzip"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	mrand "math/rand"
	"net/http"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"time"
)

var (
	reqCount   int64
	gzipCount  int64
	errorCount int64
)

func realisticLatency(rng *mrand.Rand) time.Duration {
	roll := rng.Intn(100)
	switch {
	case roll < 60: // fast
		return time.Duration(50+rng.Intn(100)) * time.Millisecond
	case roll < 90: // medium
		return time.Duration(150+rng.Intn(250)) * time.Millisecond
	default: // slow
		return time.Duration(400+rng.Intn(500)) * time.Millisecond
	}
}

func acceptsGzip(r *http.Request) bool {
	ae := r.Header.Get("Accept-Encoding")
	return strings.Contains(ae, "gzip")
}

func writeGzip(w http.ResponseWriter, body []byte) {
	w.Header().Set("Content-Encoding", "gzip")
	gz := gzip.NewWriter(w)
	gz.Write(body)
	gz.Close()
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
			Organization:       []string{"Brutal Soak Mock Farm"},
			OrganizationalUnit: []string{"Test Infrastructure"},
		},
		DNSNames:  []string{"mock", "*.mock.local", "localhost"},
		NotBefore: time.Now().Add(-time.Minute),
		NotAfter:  time.Now().Add(24 * time.Hour),
		KeyUsage:  x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{
			x509.ExtKeyUsageServerAuth,
		},
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
	rng := mrand.New(mrand.NewSource(time.Now().UnixNano()))
	var rngMu sync.Mutex

	latency := func() time.Duration {
		rngMu.Lock()
		d := realisticLatency(rng)
		rngMu.Unlock()
		return d
	}

	// ── /mock/override: per-host dynamic state injection ──────────────────
	http.HandleFunc("/mock/override", func(w http.ResponseWriter, r *http.Request) {
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

	checkOverride := func(r *http.Request) string {
		if val, ok := overrides.Load(r.Host); ok {
			return val.(string)
		}
		return ""
	}

	// ── /mock/up: healthy endpoint (all 7 non-keyword types) ──────────────
	http.HandleFunc("/mock/up", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		if checkOverride(r) == "down" {
			atomic.AddInt64(&errorCount, 1)
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte("503 Overridden"))
			return
		}
		time.Sleep(latency())
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

	// ── /mock/down: always 503 ────────────────────────────────────────────
	http.HandleFunc("/mock/down", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		if checkOverride(r) == "up" {
			time.Sleep(latency())
			w.Write([]byte(`{"status":"ok","note":"overridden"}`))
			return
		}
		atomic.AddInt64(&errorCount, 1)
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("503 Internal Server Error"))
	})

	// ── /mock/timeout: sleeps 15s to trigger timeout monitors ─────────────
	http.HandleFunc("/mock/timeout", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		if checkOverride(r) == "up" {
			time.Sleep(latency())
			w.Write([]byte(`{"status":"ok","note":"overridden"}`))
			return
		}
		time.Sleep(15 * time.Second)
		// Request cancelled by now; write is best-effort
		w.WriteHeader(http.StatusGatewayTimeout)
	})

	// ── /mock/keyword: HTML with "HEALTHY" embedded ───────────────────────
	http.HandleFunc("/mock/keyword", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		time.Sleep(latency())
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

	// ── /mock/405: HEAD returns 405 to test ForceGET learning ─────────────
	http.HandleFunc("/mock/405", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		time.Sleep(latency())
		w.Write([]byte(`{"status":"ok","method":"GET"}`))
	})

	// ── /mock/count: stats endpoint ───────────────────────────────────────
	http.HandleFunc("/mock/count", func(w http.ResponseWriter, r *http.Request) {
		stats := map[string]int64{
			"total":   atomic.LoadInt64(&reqCount),
			"gzipped": atomic.LoadInt64(&gzipCount),
			"errors":  atomic.LoadInt64(&errorCount),
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(stats)
	})

	// Periodic log
	go func() {
		for {
			time.Sleep(15 * time.Second)
			log.Printf("[MOCK] total=%d gzipped=%d errors=%d",
				atomic.LoadInt64(&reqCount),
				atomic.LoadInt64(&gzipCount),
				atomic.LoadInt64(&errorCount),
			)
		}
	}()

	log.Println("Brutal Soak Mock HTTPS server listening on :8443")
	if err := http.ListenAndServeTLS(":8443", "cert.pem", "key.pem", nil); err != nil {
		log.Fatal(err)
	}
}
