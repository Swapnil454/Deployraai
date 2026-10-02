package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/pem"
	"fmt"
	"log"
	"math/big"
	mrand "math/rand"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

var reqCount int64

func main() {
	// Generate self-signed cert on the fly
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		log.Fatal(err)
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"Mock Farm"},
		},
		NotBefore: time.Now(),
		NotAfter:  time.Now().Add(time.Hour * 24),
		KeyUsage:  x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage: []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
	}
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		log.Fatal(err)
	}
	certOut, err := os.Create("cert.pem")
	if err != nil {
		log.Fatal(err)
	}
	pem.Encode(certOut, &pem.Block{Type: "CERTIFICATE", Bytes: derBytes})
	certOut.Close()

	keyOut, err := os.Create("key.pem")
	if err != nil {
		log.Fatal(err)
	}
	privBytes, err := x509.MarshalECPrivateKey(priv)
	if err != nil {
		log.Fatal(err)
	}
	pem.Encode(keyOut, &pem.Block{Type: "EC PRIVATE KEY", Bytes: privBytes})
	keyOut.Close()

	var overrides sync.Map

	http.HandleFunc("/mock/override", func(w http.ResponseWriter, r *http.Request) {
		host := r.URL.Query().Get("host")
		state := r.URL.Query().Get("state")
		if state == "clear" {
			overrides.Delete(host)
		} else {
			overrides.Store(host, state)
		}
		w.WriteHeader(200)
	})

	checkOverride := func(r *http.Request) string {
		if val, ok := overrides.Load(r.Host); ok {
			return val.(string)
		}
		return ""
	}

	http.HandleFunc("/mock/up", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		time.Sleep(time.Duration(50 + mrand.Intn(450)) * time.Millisecond) // realistic average latency
		if checkOverride(r) == "down" {
			w.WriteHeader(http.StatusInternalServerError)
			w.Write([]byte("500 Internal Server Error (Overridden)"))
			return
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	http.HandleFunc("/mock/down", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		if checkOverride(r) == "up" {
			time.Sleep(time.Duration(50 + mrand.Intn(450)) * time.Millisecond)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("OK (Overridden)"))
			return
		}
		w.WriteHeader(http.StatusInternalServerError)
		w.Write([]byte("500 Internal Server Error"))
	})

	http.HandleFunc("/mock/timeout", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		if checkOverride(r) == "up" {
			time.Sleep(time.Duration(50 + mrand.Intn(450)) * time.Millisecond)
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("OK (Overridden)"))
			return
		}
		time.Sleep(15 * time.Second)
	})

	http.HandleFunc("/mock/405", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		if r.Method == http.MethodHead {
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		time.Sleep(50 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	})

	// Keyword monitor endpoint: returns a body with "HEALTHY" embedded.
	// Simulates real pages where monitors scan for a status string.
	http.HandleFunc("/mock/keyword", func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt64(&reqCount, 1)
		time.Sleep(time.Duration(50+mrand.Intn(200)) * time.Millisecond)
		w.Header().Set("Content-Type", "text/html")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`<!DOCTYPE html><html><head><title>Status</title></head><body>
<h1>Service Status</h1><p class="status">System: <strong>HEALTHY</strong></p>
<p>All systems operational. Uptime: 99.99%%</p>
</body></html>`))
	})

	http.HandleFunc("/mock/count", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(fmt.Sprintf("%d", atomic.LoadInt64(&reqCount))))
	})

	go func() {
		for {
			time.Sleep(10 * time.Second)
			log.Printf("Mock requests served: %d\n", atomic.LoadInt64(&reqCount))
		}
	}()

	log.Println("Mock HTTPS server listening on :8443")
	if err := http.ListenAndServeTLS(":8443", "cert.pem", "key.pem", nil); err != nil {
		log.Fatal(err)
	}
}
