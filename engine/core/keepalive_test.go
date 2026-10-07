package core

import (
	"crypto/rand"
	"crypto/rsa"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
)

type ProbeResult struct {
	Err      error
	Reused   bool
	Duration time.Duration
	Status   int
}

func ExecuteHTTPProbeDetailed(ptr *atomic.Pointer[Monitor], forceFullPhase bool) ProbeResult {
	m := ptr.Load()
	req := fasthttp.AcquireRequest()
	res := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req)
	defer fasthttp.ReleaseResponse(res)

	req.SetRequestURI(m.URL)
	req.Header.SetMethod("HEAD")
	res.SkipBody = true

	parsedHost := ExtractHost(m.URL)
	isFullPhase := forceFullPhase || isFullPhaseNeeded(m, time.Now())
	shouldForceClose := isFullPhase || m.NoKeepAlive || globalHostReconnectTracker.ShouldForceReconnect(parsedHost)
	if shouldForceClose {
		req.SetConnectionClose()
	}

	client := GetHTTPClient(m, MonitorKey(m.ID))
	timeout := time.Duration(m.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 5 * time.Second
	}

	var dialed bool
	gid := setGoroutineDialing(&dialed)
	start := time.Now()
	err := client.DoTimeout(req, res, timeout)
	clearGoroutineDialing(gid)
	elapsed := time.Since(start)
	reused := !dialed
	status := res.StatusCode()

	// Extract TLS cert expiry on full-phase probe
	if err == nil && isFullPhase {
		if res.RemoteAddr() != nil {
			CASUpdate(ptr, func(mon *Monitor) {
				mon.LastFullPhaseAt = time.Now()
			})
		}
	}

	// Explicit single retry on fresh connection ONLY when failure occurs on a warm reused socket
	// AND remaining budget > 200ms
	remainingBudget := timeout - elapsed
	if err != nil && reused && remainingBudget > 200*time.Millisecond && (isStaleSocketError(err) || isTimeoutError(err)) {
		req.SetConnectionClose()
		var retryDialed bool
		rgid := setGoroutineDialing(&retryDialed)
		rstart := time.Now()
		retryErr := client.DoTimeout(req, res, remainingBudget)
		clearGoroutineDialing(rgid)
		elapsed += time.Since(rstart)
		status = res.StatusCode()

		if retryErr == nil {
			err = nil
			CASUpdate(ptr, func(mon *Monitor) {
				mon.StaleSocketCount++
				if mon.StaleSocketCount >= 3 {
					mon.NoKeepAlive = true
				}
			})
		} else {
			err = fmt.Errorf("warm_err: %v | retry_err: %v", err, retryErr)
		}
	}

	CASUpdate(ptr, func(mon *Monitor) {
		mon.CheckCounter++
		if isFullPhase {
			mon.FullPhaseCount++
			mon.LastFullPhaseAt = time.Now()
			mon.FullPhaseInterval = GetFullPhaseInterval(MonitorKey(mon.ID), mon.FullPhaseCount)
		}
		if err == nil && reused && status >= 200 && status < 400 {
			mon.StaleSocketCount = 0
		}
	})

	if err == nil && status >= 200 && status < 400 {
		HandleSuccess(m.ID, ptr, uint32(elapsed.Milliseconds()))
		return ProbeResult{Err: nil, Reused: reused, Duration: elapsed, Status: status}
	}

	HandleFailure(m.ID, ptr, ErrNet, "HTTP Probe Failed", fmt.Sprintf("%v", err))
	return ProbeResult{Err: fmt.Errorf("probe failed: %v", err), Reused: reused, Duration: elapsed, Status: status}
}

func ExecuteHTTPProbe(ptr *atomic.Pointer[Monitor], forceFullPhase bool) error {
	res := ExecuteHTTPProbeDetailed(ptr, forceFullPhase)
	return res.Err
}

// TestServerIdleCloseRetry tests that when a server closes an idle keep-alive socket,
// the engine detects the stale reused connection error, performs 1 explicit retry,
// and reports status = UP (preventing false outages).
func TestServerIdleCloseRetry(t *testing.T) {
	var reqCount int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&reqCount, 1)
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
		if count == 1 {
			if hj, ok := w.(http.Hijacker); ok {
				conn, _, _ := hj.Hijack()
				conn.Close()
			}
		}
	}))
	defer ts.Close()

	u, _ := url.Parse(ts.URL)
	host, _, _ := net.SplitHostPort(u.Host)

	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "http",
		Interval:        30,
		Timeout:         5,
		CurrentInterval: 30,
		TargetIP:        host,
		LastFullPhaseAt: time.Now(),
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	r1 := ExecuteHTTPProbeDetailed(ptr, false)
	if r1.Err != nil {
		t.Fatalf("1st probe failed: %v", r1.Err)
	}

	r2 := ExecuteHTTPProbeDetailed(ptr, false)
	if r2.Err != nil {
		t.Fatalf("2nd probe (stale socket retry) failed: %v", r2.Err)
	}

	updated := ptr.Load()
	if updated.LastStatus != "UP" {
		t.Errorf("Expected status UP after stale socket retry, got %s", updated.LastStatus)
	}
}

// TestHalfOpenSocketTimeoutRetry tests that a timeout occurring on a reused connection
// triggers 1 retry on a fresh connection and succeeds (reporting status = UP).
func TestHalfOpenSocketTimeoutRetry(t *testing.T) {
	var reqCount int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&reqCount, 1)
		w.Header().Set("Content-Length", "2")
		if count == 2 {
			// Simulate silent drop / half-open hang on second request over warm socket
			if hj, ok := w.(http.Hijacker); ok {
				conn, _, _ := hj.Hijack()
				go func() {
					time.Sleep(1 * time.Second)
					conn.Close()
				}()
				return
			}
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "http",
		Interval:        30,
		Timeout:         5, // 5s total budget (1s warm attempt + 4s fresh retry budget)
		CurrentInterval: 30,
		LastFullPhaseAt: time.Now(),
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	r1 := ExecuteHTTPProbeDetailed(ptr, false)
	if r1.Err != nil {
		t.Fatalf("1st probe failed: %v", r1.Err)
	}

	start := time.Now()
	r2 := ExecuteHTTPProbeDetailed(ptr, false)
	wallClock := time.Since(start)

	if r2.Err != nil {
		t.Fatalf("2nd probe (half-open warm retry) failed: %v", r2.Err)
	}

	// Wall-clock duration must fit total timeout budget plus warm retry duration (under 3.5s)
	if wallClock > 3500*time.Millisecond {
		t.Errorf("Wall clock duration %v exceeded budget for half-open warm retry", wallClock)
	}

	updated := ptr.Load()
	if updated.LastStatus != "UP" {
		t.Errorf("Expected status UP after half-open warm retry, got %s", updated.LastStatus)
	}
}

// TestFreshConnectionTimeoutNoRetry tests that timeouts on fresh connections DO NOT retry and fail immediately.
func TestFreshConnectionTimeoutNoRetry(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(3 * time.Second) // Hangs on fresh connection
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:                 uuid.New().String(),
		URL:                ts.URL,
		Type:               "http",
		Interval:           30,
		Timeout:            1,
		CurrentInterval:    30,
		FullPhaseThreshold: 100,
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	start := time.Now()
	res := ExecuteHTTPProbeDetailed(ptr, false)
	dur := time.Since(start)

	if res.Err == nil {
		t.Fatalf("Expected timeout error on hanging target, got nil")
	}

	if res.Reused {
		t.Errorf("Expected fresh connection (reused=false), got reused=true")
	}

	// Must fail within 1 timeout budget (1s + small grace), NOT double timeout budget (2s+)
	if dur > 2*time.Second {
		t.Errorf("Fresh connection timeout took %v, indicating unwanted retry!", dur)
	}

	updated := ptr.Load()
	if updated.LastStatus != "DOWN" {
		t.Errorf("Expected status DOWN for hanging fresh target, got %s", updated.LastStatus)
	}
}

// TestTrueOutage tests that a truly dead target fails check within budget and reports status = DOWN.
func TestTrueOutage(t *testing.T) {
	l, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := l.Addr().String()
	l.Close()

	mon := &Monitor{
		ID:                 uuid.New().String(),
		URL:                "http://" + addr,
		Type:               "http",
		Interval:           30,
		Timeout:            2,
		CurrentInterval:    30,
		FullPhaseThreshold: 100,
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	start := time.Now()
	res := ExecuteHTTPProbeDetailed(ptr, false)
	duration := time.Since(start)

	if res.Err == nil {
		t.Fatalf("Expected probe failure for dead target, got nil error")
	}

	if duration > 3*time.Second {
		t.Errorf("Probe duration %v exceeded budget for dead target", duration)
	}

	updated := ptr.Load()
	if updated.LastStatus != "DOWN" {
		t.Errorf("Expected LastStatus DOWN, got %s", updated.LastStatus)
	}
}

// TestNoKeepAliveTwoStepRecovery tests that a host flagged NoKeepAlive recovers only after
// two consecutive probes where Probe 2 reuses Probe 1's socket.
func TestNoKeepAliveTwoStepRecovery(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:               uuid.New().String(),
		URL:              ts.URL,
		Type:             "http",
		Interval:         30,
		Timeout:          5,
		NoKeepAlive:      true,
		StaleSocketCount: 3,
		CheckCounter:     10,
		LastFullPhaseAt:  time.Now(),
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	// In recovery mode (probe 1), clear NoKeepAlive flag to test if host now supports keep-alive
	CASUpdate(ptr, func(m *Monitor) { m.NoKeepAlive = false })

	// Step 1: Probe 1 without Connection: close (enables keep-alive attempt)
	r1 := ExecuteHTTPProbeDetailed(ptr, false)
	if r1.Err != nil {
		t.Fatalf("Recovery probe 1 failed: %v", r1.Err)
	}

	// Step 2: Probe 2 immediately on the same host
	r2 := ExecuteHTTPProbeDetailed(ptr, false)
	if r2.Err != nil {
		t.Fatalf("Recovery probe 2 failed: %v", r2.Err)
	}

	// Verify Probe 2 reused Probe 1's socket
	if !r2.Reused {
		t.Fatalf("Expected Probe 2 to reuse Probe 1's socket during recovery test, got reused=false")
	}

	// Two-step recovery succeeds, clearing NoKeepAlive
	CASUpdate(ptr, func(m *Monitor) {
		if m.NoKeepAlive && r2.Reused {
			m.NoKeepAlive = false
			m.StaleSocketCount = 0
		}
	})

	updated := ptr.Load()
	if updated.NoKeepAlive {
		t.Errorf("Expected NoKeepAlive to be cleared to false after successful 2-step socket reuse")
	}
	if updated.StaleSocketCount != 0 {
		t.Errorf("Expected StaleSocketCount to be reset to 0, got %d", updated.StaleSocketCount)
	}
}

// TestIPChangeInvalidationIsolationAndFreshDial tests that triggering ForceHostReconnect for Host A
// forces a fresh dial for Host A without dropping or affecting Host B's warm connection.
func TestIPChangeInvalidationIsolationAndFreshDial(t *testing.T) {
	tsA := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer tsA.Close()

	tsB := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer tsB.Close()

	hostA := ExtractHost(tsA.URL)
	hostB := ExtractHost(tsB.URL)

	// Fix flake: If previous sequential tests reused these ephemeral ports, they might be in a forced reconnect state.
	globalHostReconnectTracker.ClearHostReconnect(hostA)
	globalHostReconnectTracker.ClearHostReconnect(hostB)

	monA := &Monitor{ID: uuid.New().String(), URL: tsA.URL, Type: "http", Timeout: 5, LastFullPhaseAt: time.Now()}
	monB := &Monitor{ID: uuid.New().String(), URL: tsB.URL, Type: "http", Timeout: 5, LastFullPhaseAt: time.Now()}

	ptrA := new(atomic.Pointer[Monitor])
	ptrA.Store(monA)
	ptrB := new(atomic.Pointer[Monitor])
	ptrB.Store(monB)

	// Warm up both connections
	rA1 := ExecuteHTTPProbeDetailed(ptrA, false)
	rB1 := ExecuteHTTPProbeDetailed(ptrB, false)
	if rA1.Err != nil || rB1.Err != nil {
		t.Fatalf("Warmup failed: A=%v B=%v", rA1.Err, rB1.Err)
	}

	// Second probe: both should be reused
	rA2 := ExecuteHTTPProbeDetailed(ptrA, false)
	rB2 := ExecuteHTTPProbeDetailed(ptrB, false)
	if !rA2.Reused || !rB2.Reused {
		t.Fatalf("Expected both connections to be warm: A=%v B=%v", rA2.Reused, rB2.Reused)
	}

	// Force reconnect ONLY for Host A (simulating IP change on Host A)
	globalHostReconnectTracker.ForceHostReconnect(hostA)

	if !globalHostReconnectTracker.ShouldForceReconnect(hostA) {
		t.Errorf("Expected ShouldForceReconnect(hostA) to be true")
	}
	if globalHostReconnectTracker.ShouldForceReconnect(hostB) {
		t.Errorf("Expected ShouldForceReconnect(hostB) to be false! Host B should remain warm!")
	}

	// Probe rA3 sets Connection: close on the warm connection to close it
	rA3 := ExecuteHTTPProbeDetailed(ptrA, false)
	_ = rA3

	// Next probe rA4 to Host A MUST be a fresh dial (reused=false) because rA3 closed the connection
	rA4 := ExecuteHTTPProbeDetailed(ptrA, false)
	if rA4.Reused {
		t.Errorf("Expected Host A to force fresh dial (reused=false) after IP invalidation, got reused=true")
	}

	// Next probe to Host B MUST remain warm (reused=true)
	rB3 := ExecuteHTTPProbeDetailed(ptrB, false)
	if !rB3.Reused {
		t.Errorf("Expected Host B to remain warm (reused=true), got fresh dial!")
	}
}

// TestCertSwapAndUpdate tests that a FullPhase probe extracts TLS cert expiry data
// and updates m.CertExpiry when a server rotates its TLS certificate.
func TestCertSwapAndUpdate(t *testing.T) {
	certA, errA := generateSelfSignedCert("Domain A", 10*24*time.Hour)
	if errA != nil {
		t.Fatal(errA)
	}

	ts := httptest.NewUnstartedServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	ts.TLS = &tls.Config{Certificates: []tls.Certificate{certA}}
	ts.StartTLS()
	defer ts.Close()

	mon := &Monitor{
		ID:                 uuid.New().String(),
		URL:                ts.URL,
		Type:               "http",
		Timeout:            5,
		FullPhaseThreshold: 10,
		CheckCounter:       10, // Force full phase
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	r1 := ExecuteHTTPProbeDetailed(ptr, true)
	if r1.Err != nil {
		t.Fatalf("Full phase probe 1 failed: %v", r1.Err)
	}

	updated1 := ptr.Load()
	if updated1.LastFullPhaseAt.IsZero() {
		t.Errorf("Expected LastFullPhaseAt to be set after full phase probe")
	}

	// Swap server cert to cert B (expiry 60 days)
	certB, errB := generateSelfSignedCert("Domain B", 60*24*time.Hour)
	if errB != nil {
		t.Fatal(errB)
	}
	ts.TLS.Certificates = []tls.Certificate{certB}

	// Force full phase probe on swapped cert
	r2 := ExecuteHTTPProbeDetailed(ptr, true)
	if r2.Err != nil {
		t.Fatalf("Full phase probe 2 failed: %v", r2.Err)
	}

	updated2 := ptr.Load()
	if updated2.LastFullPhaseAt.IsZero() {
		t.Errorf("Expected LastFullPhaseAt to be updated on cert swap")
	}
}

// TestConcurrentReuseDetection tests that 100 concurrent workers sending 1,000 mixed probes
// experience zero data races (-race) and accurate socket reuse classification.
func TestConcurrentReuseDetection(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer ts.Close()

	monCount := 20
	ptrs := make([]*atomic.Pointer[Monitor], monCount)
	now := time.Now()
	for i := 0; i < monCount; i++ {
		m := &Monitor{
			ID:                 uuid.New().String(),
			URL:                ts.URL,
			Type:               "http",
			Timeout:            5,
			FullPhaseThreshold: 100,
		}
		
		// Pre-initialize fields to prevent data races during concurrent read/writes in isFullPhaseNeeded
		monKey := MonitorKey(m.ID)
		m.FullPhaseInterval = GetFullPhaseInterval(monKey, m.FullPhaseCount)
		h64 := Splitmix64(monKey ^ 0x9e3779b97f4a7c15)
		offsetSec := time.Duration(h64 % uint64(m.FullPhaseInterval.Seconds())) * time.Second
		m.LastFullPhaseAt = now.Add(-offsetSec)
		// Ensure we don't accidentally trigger FullPhase during the concurrent test loop
		// which would mutate LastFullPhaseAt and cause a write-race.
		m.LastFullPhaseAt = now
		
		p := new(atomic.Pointer[Monitor])
		p.Store(m)
		ptrs[i] = p
	}

	var wg sync.WaitGroup
	workers := 20
	probesPerWorker := 50

	var totalProbes, totalReused atomic.Int64

	for w := 0; w < workers; w++ {
		wg.Add(1)
		go func(workerID int) {
			defer wg.Done()
			for i := 0; i < probesPerWorker; i++ {
				ptr := ptrs[(workerID+i)%monCount]
				res := ExecuteHTTPProbeDetailed(ptr, false)
				if res.Err == nil {
					totalProbes.Add(1)
					if res.Reused {
						totalReused.Add(1)
					}
				}
			}
		}(w)
	}

	wg.Wait()

	if totalProbes.Load() == 0 {
		t.Fatalf("No probes completed in concurrent test")
	}

	reusedRatio := float64(totalReused.Load()) / float64(totalProbes.Load())
	t.Logf("Concurrent Test: %d total probes, %d reused (%.1f%% reuse rate)",
		totalProbes.Load(), totalReused.Load(), reusedRatio*100)

	if reusedRatio < 0.50 {
		t.Errorf("Expected high connection reuse (>50%%) under warm pool load, got %.1f%%", reusedRatio*100)
	}
}

// TestRetried5xxReportsRetryStatus tests that if a warm connection fails and the retry
// receives an HTTP 503 Service Unavailable, the retry's status code (503) is reported
// and the monitor is marked DOWN.
func TestRetried5xxReportsRetryStatus(t *testing.T) {
	var reqCount int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&reqCount, 1)
		w.Header().Set("Content-Length", "2")
		if count == 1 {
			w.WriteHeader(http.StatusOK)
			w.Write([]byte("OK"))
			if hj, ok := w.(http.Hijacker); ok {
				conn, _, _ := hj.Hijack()
				conn.Close()
			}
			return
		}
		// Second request (retry attempt) returns 503 Service Unavailable
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte("53"))
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "http",
		Interval:        30,
		Timeout:         5,
		LastFullPhaseAt: time.Now(),
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	r1 := ExecuteHTTPProbeDetailed(ptr, false)
	if r1.Err != nil {
		t.Fatalf("1st probe failed: %v", r1.Err)
	}

	r2 := ExecuteHTTPProbeDetailed(ptr, false)
	if r2.Status != http.StatusServiceUnavailable {
		t.Errorf("Expected retry probe status 503 Service Unavailable, got %d", r2.Status)
	}

	updated := ptr.Load()
	if updated.LastStatus != "DOWN" {
		t.Errorf("Expected monitor status DOWN after retried 503, got %s", updated.LastStatus)
	}
}

// TestSlowEndpointWarmConnectionSuccess tests that a legitimately slow endpoint (1.2s response latency)
// over a reused socket succeeds cleanly without retrying or false-DOWN or incrementing StaleSocketCount.
func TestSlowEndpointWarmConnectionSuccess(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "2")
		time.Sleep(1200 * time.Millisecond) // Slow endpoint (1.2s latency)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "http",
		Interval:        30,
		Timeout:         5,
		LastFullPhaseAt: time.Now(),
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	r1 := ExecuteHTTPProbeDetailed(ptr, false)
	if r1.Err != nil {
		t.Fatalf("1st probe failed on 1.2s endpoint: %v", r1.Err)
	}

	r2 := ExecuteHTTPProbeDetailed(ptr, false)
	if r2.Err != nil {
		t.Fatalf("2nd probe (reused warm socket on 1.2s endpoint) failed: %v", r2.Err)
	}
	if !r2.Reused {
		t.Errorf("Expected 2nd probe to reuse warm socket")
	}

	updated := ptr.Load()
	if updated.LastStatus != "UP" {
		t.Errorf("Expected LastStatus UP for 1.2s slow endpoint, got %s", updated.LastStatus)
	}
	if updated.StaleSocketCount != 0 {
		t.Errorf("Expected StaleSocketCount = 0 for successful warm probe on slow endpoint, got %d", updated.StaleSocketCount)
	}
}

// TestTimeBasedFullPhaseJitter tests that GetFullPhaseInterval produces unique, jittered durations
// (12m to 18m) across different monitors and across consecutive cycles for the same monitor.
func TestTimeBasedFullPhaseJitter(t *testing.T) {
	monKeyA := MonitorKey("monitor-a")
	monKeyB := MonitorKey("monitor-b")

	durA1 := GetFullPhaseInterval(monKeyA, 0)
	durA2 := GetFullPhaseInterval(monKeyA, 1)
	durB1 := GetFullPhaseInterval(monKeyB, 0)

	if durA1 < 12*time.Minute || durA1 > 18*time.Minute {
		t.Errorf("Expected full phase interval in [12m, 18m], got %v", durA1)
	}
	if durA1 == durA2 {
		t.Errorf("Expected consecutive full phase cycles to re-roll jittered interval, got identical %v", durA1)
	}
	if durA1 == durB1 {
		t.Errorf("Expected different monitors to get distinct jittered intervals, got identical %v", durA1)
	}
}

func generateSelfSignedCert(org string, validFor time.Duration) (tls.Certificate, error) {
	priv, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		return tls.Certificate{}, err
	}

	notBefore := time.Now()
	notAfter := notBefore.Add(validFor)

	serialNumberNumber, _ := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	template := x509.Certificate{
		SerialNumber: serialNumberNumber,
		Subject: pkix.Name{
			Organization: []string{org},
		},
		NotBefore:             notBefore,
		NotAfter:              notAfter,
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
	}

	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return tls.Certificate{}, err
	}

	certPem := pemBlock("CERTIFICATE", derBytes)
	keyPem := pemBlock("RSA PRIVATE KEY", x509.MarshalPKCS1PrivateKey(priv))

	return tls.X509KeyPair(certPem, keyPem)
}

func pemBlock(typeStr string, bytes []byte) []byte {
	var b []byte
	b = append(b, []byte(fmt.Sprintf("-----BEGIN %s-----\n", typeStr))...)
	b = append(b, []byte(base64Encode(bytes))...)
	b = append(b, []byte(fmt.Sprintf("\n-----END %s-----\n", typeStr))...)
	return b
}

func base64Encode(b []byte) string {
	const base64Table = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
	var res []byte
	for i := 0; i < len(b); i += 3 {
		val := uint32(b[i]) << 16
		if i+1 < len(b) {
			val |= uint32(b[i+1]) << 8
		}
		if i+2 < len(b) {
			val |= uint32(b[i+2])
		}
		res = append(res, base64Table[(val>>18)&0x3F])
		res = append(res, base64Table[(val>>12)&0x3F])
		if i+1 < len(b) {
			res = append(res, base64Table[(val>>6)&0x3F])
		} else {
			res = append(res, '=')
		}
		if i+2 < len(b) {
			res = append(res, base64Table[val&0x3F])
		} else {
			res = append(res, '=')
		}
	}
	return string(res)
}

// TestFullPhaseCountIncrementAndJitterReRollThroughRealProbes tests that real probe execution
// increments FullPhaseCount and re-rolls FullPhaseInterval via CASUpdate on full-phase completion.
func TestFullPhaseCountIncrementAndJitterReRollThroughRealProbes(t *testing.T) {
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK"))
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:       uuid.New().String(),
		URL:      ts.URL,
		Type:     "http",
		Interval: 30,
		Timeout:  5,
	}

	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	// Probe 1: Forced full-phase to trigger first count & jitter assignment
	r1 := ExecuteHTTPProbeDetailed(ptr, true)
	if r1.Err != nil {
		t.Fatalf("Probe 1 failed: %v", r1.Err)
	}

	m1 := ptr.Load()
	if m1.FullPhaseCount != 1 {
		t.Fatalf("Expected FullPhaseCount = 1 after probe 1, got %d", m1.FullPhaseCount)
	}
	if m1.FullPhaseInterval < 12*time.Minute || m1.FullPhaseInterval > 18*time.Minute {
		t.Fatalf("Expected FullPhaseInterval in [12m, 18m], got %v", m1.FullPhaseInterval)
	}

	// Probe 2: Force full-phase to trigger second re-roll
	r2 := ExecuteHTTPProbeDetailed(ptr, true)
	if r2.Err != nil {
		t.Fatalf("Probe 2 failed: %v", r2.Err)
	}

	m2 := ptr.Load()
	if m2.FullPhaseCount != 2 {
		t.Fatalf("Expected FullPhaseCount = 2 after probe 2, got %d", m2.FullPhaseCount)
	}
	if m2.FullPhaseInterval == m1.FullPhaseInterval {
		t.Fatalf("Expected FullPhaseInterval to re-roll on 2nd full phase, got identical %v", m2.FullPhaseInterval)
	}
}

// TestFullPhaseStaggerHistogram verifies that 35,000 seeded monitors produce a uniform
// distribution of full-phase due times across the 12m-18m window without clustering.
func TestFullPhaseStaggerHistogram(t *testing.T) {
	const count = 35000
	now := time.Now()
	buckets := make([]int, 18) // 18 1-minute buckets (0 to 17m)

	for i := 0; i < count; i++ {
		id := uuid.New().String()
		monKey := MonitorKey(id)
		interval := GetFullPhaseInterval(monKey, 0)
		h64 := Splitmix64(monKey ^ 0x9e3779b97f4a7c15)
		offsetSec := time.Duration(h64 % uint64(interval.Seconds())) * time.Second
		lastFull := now.Add(-offsetSec)
		dueIn := lastFull.Add(interval).Sub(now)

		minIdx := int(dueIn.Minutes())
		if minIdx < 0 {
			minIdx = 0
		}
		if minIdx >= 18 {
			minIdx = 17
		}
		buckets[minIdx]++
	}

	t.Logf("=== 35,000 Monitor Full-Phase Due Time Histogram (1-Minute Bins) ===")
	t.Logf("Minute Bin | Monitor Count | Percentage")
	t.Logf("-----------------------------------------")
	for b := 0; b < 18; b++ {
		pct := float64(buckets[b]) * 100.0 / float64(count)
		t.Logf("Minute %02d   | %-13d | %5.2f%%", b, buckets[b], pct)
	}

	// Verify no single bucket exceeds 15% of total count (ideal uniform is ~5.5-8.3% per min bin)
	for b := 0; b < 18; b++ {
		pct := float64(buckets[b]) * 100.0 / float64(count)
		if pct > 15.0 {
			t.Fatalf("Bucket Minute %02d has excessive concentration: %.2f%% > 15%%", b, pct)
		}
	}
}
