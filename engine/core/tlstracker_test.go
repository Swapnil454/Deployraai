package core

import (
	"crypto/tls"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestTLSResumptionTracker(t *testing.T) {
	ResetTLSStats()

	// TLS test server
	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer ts.Close()

	// Shared session cache for cohort 0
	cache := tls.NewLRUClientSessionCache(100)
	cfg := ts.Client().Transport.(*http.Transport).TLSClientConfig.Clone()
	cfg.ClientSessionCache = cache
	installTLSObserver(cfg, 0)

	tr := &http.Transport{
		TLSClientConfig:   cfg,
		DisableKeepAlives: true, // Force fresh connections
	}
	client := &http.Client{Transport: tr}

	// First request (Full Handshake)
	resp1, err := client.Get(ts.URL)
	if err != nil {
		t.Fatalf("request 1 failed: %v", err)
	}
	io.ReadAll(resp1.Body)
	resp1.Body.Close()

	// Second request (Resumed Handshake via session ticket)
	resp2, err := client.Get(ts.URL)
	if err != nil {
		t.Fatalf("request 2 failed: %v", err)
	}
	io.ReadAll(resp2.Body)
	resp2.Body.Close()

	s := GetTLSStats(0)
	// Expect 2 total handshakes: 1 full, 1 resumed
	if s.Total.Load() != 2 {
		t.Errorf("expected Total handshakes == 2, got %d", s.Total.Load())
	}
	if s.Full.Load() != 1 {
		t.Errorf("expected Full handshakes == 1, got %d", s.Full.Load())
	}
	if s.Resumed.Load() != 1 {
		t.Errorf("expected Resumed handshakes == 1, got %d", s.Resumed.Load())
	}
}

func TestTLSObserverDoesNotWeakenVerification(t *testing.T) {
	ResetTLSStats()

	// Server with self-signed certificate
	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	// Client config with InsecureSkipVerify = false and custom RootCAs (empty pool)
	cfg := &tls.Config{
		InsecureSkipVerify: false,
		RootCAs:            nil, // Default system pool will not trust self-signed test cert
	}
	installTLSObserver(cfg, 0)

	client := &http.Client{
		Transport: &http.Transport{TLSClientConfig: cfg},
	}

	_, err := client.Get(ts.URL)
	if err == nil {
		t.Fatalf("expected x509 verification error for untrusted cert, but request succeeded")
	}
	if !strings.Contains(err.Error(), "certificate") && !strings.Contains(err.Error(), "x509") && !strings.Contains(err.Error(), "unknown authority") {
		t.Errorf("expected TLS certificate error, got: %v", err)
	}
}

func TestTLSObserverCohortSeparation(t *testing.T) {
	ResetTLSStats()

	ts := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer ts.Close()

	// Cohort 1 Observer
	cfg1 := ts.Client().Transport.(*http.Transport).TLSClientConfig.Clone()
	installTLSObserver(cfg1, 1)

	client1 := &http.Client{Transport: &http.Transport{TLSClientConfig: cfg1, DisableKeepAlives: true}}
	resp, err := client1.Get(ts.URL)
	if err != nil {
		t.Fatalf("cohort 1 request failed: %v", err)
	}
	resp.Body.Close()

	s0 := GetTLSStats(0)
	s1 := GetTLSStats(1)

	if s0.Total.Load() != 0 {
		t.Errorf("expected Cohort 0 Total == 0, got %d", s0.Total.Load())
	}
	if s1.Total.Load() != 1 {
		t.Errorf("expected Cohort 1 Total == 1, got %d", s1.Total.Load())
	}
}
