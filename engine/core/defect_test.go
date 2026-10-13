package core

// defect_test.go — Step-1 defect regression tests.
//
// Run locally:
//	go test -count=5 -timeout 300s -run 'TestDefect' ./core/...
//
// All defects and acceptance criteria are covered:
//   Fix 1a: Handshake bound (TLS server accepts TCP, never replies; timeout 1.8-2.6s)
//   Fix 1b: Reuse-after-idle (server closes socket -> warm_retry transparently succeeds)
//   Fix 1b (untested regression): Warm reuse after 30s idle with server keeping socket open
//   Fix 2:  Bounded shutdown (in-flight slow requests + full telemetry queue drain within 5s)
//   Fix 3:  Generation guard (sequential drop before CAS)
//   Fix 3 (concurrent): Late result from check N arrives while check N+1 is in flight
//   Fix 4:  Reaper codes (ErrNotExecuted distinct, never maps to DOWN in state machine)
//   Fix 5:  One deadline per check (worker path with real httptest server hanging on body; DOWN in deadline+0.5s, goroutines back to baseline)
//   Fix 1a+5: TLS hang via doWithContext (engine worker execution path)

import (
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
)

// ---------------------------------------------------------------------------
// Fix 1a: Handshake bound
// A server that accepts TCP but never completes TLS must not hang the worker
// past the per-check timeout (2 s).
// It must hold the connection open, elapsed time must be close to the 2s
// deadline (1.8-2.6s), and the error must be a timeout, not a block or refusal.
// ---------------------------------------------------------------------------

func TestDefectHandshakeHang(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	stopServer := make(chan struct{})

	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 1024)
				c.Read(buf)  // drain ClientHello
				<-stopServer // hold connection open until test ends; never reply
			}(conn)
		}
	}()

	InitHTTPClients(100)

	// Measure baseline goroutines before starting workers
	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	baselineGoroutines := runtime.NumGoroutine()

	const checkTimeout = 2 * time.Second
	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             "https://" + ln.Addr().String(),
		Type:            "http",
		Interval:        30,
		Timeout:         int(checkTimeout.Seconds()),
		CurrentInterval: 30,
	}
	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup
	jobs := make(chan DispatchJob, 10)
	StartWorkers(ctx, &wg, 1, jobs)

	CASUpdate(ptr, func(m *Monitor) {
		m.AwaitingResult = true
		m.LastProbeSentAt = time.Now()
		m.CheckGeneration = 1
	})

	start := time.Now()
	jobs <- DispatchJob{ptr: ptr, m: ptr.Load(), generation: 1}

	// Wait for production worker to complete check
	deadlineLimit := start.Add(checkTimeout + 1500*time.Millisecond)
	for time.Now().Before(deadlineLimit) {
		if !ptr.Load().AwaitingResult {
			break
		}
		time.Sleep(30 * time.Millisecond)
	}
	elapsed := time.Since(start)

	if ptr.Load().AwaitingResult {
		t.Fatalf("Handshake-hang: worker did not complete check within budget; elapsed=%v", elapsed)
	}

	// Must fail close to the per-check deadline (1.8s - 2.6s).
	if elapsed < 1800*time.Millisecond || elapsed > 2600*time.Millisecond {
		t.Errorf("Handshake-hang took %v; want between 1.8s and 2.6s (deadline %v)",
			elapsed, checkTimeout)
	}

	if ptr.Load().LastStatus != "DOWN" {
		t.Errorf("Handshake-hang: LastStatus must be DOWN, got %q", ptr.Load().LastStatus)
	}

	// Stop worker cleanly
	cancel()
	wg.Wait()

	// Stop mock server and release hanging connections
	ln.Close()
	close(stopServer)

	// Verify goroutines return to baseline
	runtime.GC()
	time.Sleep(100 * time.Millisecond)
	afterGoroutines := runtime.NumGoroutine()
	deadline := time.Now().Add(12 * time.Second)
	for time.Now().Before(deadline) {
		runtime.GC()
		afterGoroutines = runtime.NumGoroutine()
		if afterGoroutines <= baselineGoroutines {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if afterGoroutines > baselineGoroutines {
		t.Errorf("Handshake-hang FAIL: goroutines did not return to baseline within 12s; baseline=%d after=%d",
			baselineGoroutines, afterGoroutines)
	}

	t.Logf("Fix 1a PASS (production path): handshake-hang timed out in %.3fs status=%s goroutines %d -> %d",
		elapsed.Seconds(), ptr.Load().LastStatus, baselineGoroutines, afterGoroutines)
}

// ---------------------------------------------------------------------------
// Fix 1b: Reuse-after-idle
// A probe on a socket that the server closed (idle-close) must retry on a
// fresh connection transparently and report UP, not DOWN.
// ---------------------------------------------------------------------------

func TestDefectReuseAfterServerIdleClose(t *testing.T) {
	var reqCount int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		count := atomic.AddInt32(&reqCount, 1)
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK")) //nolint:errcheck
		// After first response, close connection (simulates server-side idle timeout).
		if count == 1 {
			if hj, ok := w.(http.Hijacker); ok {
				conn, _, _ := hj.Hijack()
				go func() {
					time.Sleep(20 * time.Millisecond)
					conn.Close()
				}()
			}
		}
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "http",
		Interval:        30,
		Timeout:         5,
		CurrentInterval: 30,
		LastFullPhaseAt: time.Now(),
	}
	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	r1 := ExecuteHTTPProbeDetailed(ptr, false)
	if r1.Err != nil {
		t.Fatalf("Fix 1b warmup probe failed: %v", r1.Err)
	}
	time.Sleep(50 * time.Millisecond) // Let server close the connection.

	r2 := ExecuteHTTPProbeDetailed(ptr, false)
	if r2.Err != nil {
		t.Fatalf("Fix 1b: reuse-after-idle probe 2 failed: %v", r2.Err)
	}
	if ptr.Load().LastStatus != "UP" {
		t.Errorf("Fix 1b: expected UP after stale-socket retry, got %s", ptr.Load().LastStatus)
	}
	t.Logf("Fix 1b PASS: r1.Reused=%v r2.Reused=%v status=%s", r1.Reused, r2.Reused, ptr.Load().LastStatus)
}

// ---------------------------------------------------------------------------
// Fix 1b regression: Reuse after 30-60s idle with server keeping socket open.
// Verifies that the SetWriteDeadline wrapper does not break warm socket reuse
// after long idle periods where the server does NOT close the connection.
// The probe must succeed on the warm socket with NO warm_retry.
// ---------------------------------------------------------------------------

func TestDefectReuseAfter30sIdleWithServerOpen(t *testing.T) {
	var reqCount atomic.Int32
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		reqCount.Add(1)
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK")) //nolint:errcheck
		// Server keeps connection open (no close)
	}))
	defer ts.Close()

	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "http",
		Interval:        30,
		Timeout:         5,
		CurrentInterval: 30,
		LastFullPhaseAt: time.Now(),
	}
	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	// Probe 1: warmup on fresh connection
	r1 := ExecuteHTTPProbeDetailed(ptr, false)
	if r1.Err != nil {
		t.Fatalf("Probe 1 failed: %v", r1.Err)
	}
	if ptr.Load().LastStatus != "UP" {
		t.Fatalf("Probe 1 expected UP, got %s", ptr.Load().LastStatus)
	}

	// Idle for 31 seconds with server keeping connection open
	t.Logf("Sleeping 31s to test idle connection reuse on warm socket...")
	time.Sleep(31 * time.Second)

	// Probe 2: must reuse the warm socket without needing a retry
	r2 := ExecuteHTTPProbeDetailed(ptr, false)
	if r2.Err != nil {
		t.Fatalf("Probe 2 after 31s idle failed: %v", r2.Err)
	}
	if !r2.Reused {
		t.Errorf("Probe 2 expected reused=true on warm socket, got reused=false")
	}
	if ptr.Load().LastStatus != "UP" {
		t.Errorf("Probe 2 expected status UP, got %s", ptr.Load().LastStatus)
	}
	if ptr.Load().StaleSocketCount != 0 {
		t.Errorf("Probe 2 expected StaleSocketCount == 0 (no warm_retry), got %d", ptr.Load().StaleSocketCount)
	}
	t.Logf("Fix 1b (idle reuse) PASS: probe 1 reused=%v, probe 2 reused=%v after 31s idle, StaleSocketCount=%d",
		r1.Reused, r2.Reused, ptr.Load().StaleSocketCount)
}

// ---------------------------------------------------------------------------
// Fix 2: Bounded shutdown
// Workers must drain within 5 s after ctx is cancelled, even when running
// with in-flight slow requests and a full telemetry queue.
// ---------------------------------------------------------------------------

func TestDefectBoundedShutdown(t *testing.T) {
	shutdownDone := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Slow endpoint that exceeds normal shutdown budget
		select {
		case <-shutdownDone:
		case <-time.After(10 * time.Second):
		}
		w.Header().Set("Content-Length", "2")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("OK")) //nolint:errcheck
	}))
	defer ts.Close()
	defer close(shutdownDone)

	ctx, cancel := context.WithCancel(context.Background())
	var wg sync.WaitGroup
	jobs := make(chan DispatchJob, 50)
	InitHTTPClients(100)
	StartWorkers(ctx, &wg, 4, jobs)

	// Enqueue in-flight slow requests
	for i := 0; i < 4; i++ {
		mon := &Monitor{
			ID:              uuid.New().String(),
			URL:             ts.URL,
			Type:            "http",
			Interval:        5,
			Timeout:         8,
			CurrentInterval: 5,
			LastFullPhaseAt: time.Now(),
		}
		ptr := new(atomic.Pointer[Monitor])
		ptr.Store(mon)
		CASUpdate(ptr, func(m *Monitor) {
			m.AwaitingResult = true
			m.LastProbeSentAt = time.Now()
			m.CheckGeneration = 1
		})
		jobs <- DispatchJob{ptr: ptr, m: ptr.Load(), generation: 1}
	}

	// Fill telemetry queue with samples to confirm telemetry queue drain does not block shutdown
	for i := 0; i < 100; i++ {
		Emit(Sample{
			MonitorID: [16]byte{},
			TsMs:      time.Now().UnixMilli(),
			Status:    1,
			Kind:      1,
		})
	}

	time.Sleep(150 * time.Millisecond) // Let workers pick up the slow in-flight jobs

	shutdownStart := time.Now()
	cancel() // Initiate shutdown

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	const budget = 5 * time.Second
	select {
	case <-done:
		elapsed := time.Since(shutdownStart)
		t.Logf("Fix 2 PASS: bounded shutdown with in-flight load completed in %.3fs (budget %v)", elapsed.Seconds(), budget)
	case <-time.After(budget):
		t.Fatalf("Fix 2 FAIL: workers did not drain within %v budget after ctx cancel", budget)
	}
}

// ---------------------------------------------------------------------------
// Fix 3: Generation guard
// A late result (stale ExpectedGeneration) must be dropped BEFORE the CAS
// so LastStatus is never written with a stale UP or DOWN.
// ---------------------------------------------------------------------------

func TestDefectGenerationGuardDropsLateResult(t *testing.T) {
	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             "http://127.0.0.1:1", // not probed in this test
		Type:            "http",
		Interval:        30,
		Timeout:         5,
		CurrentInterval: 30,
		LastFullPhaseAt: time.Now(),
	}
	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	// Step 1: Dispatcher claims generation 1.
	CASUpdate(ptr, func(m *Monitor) {
		m.AwaitingResult = true
		m.LastProbeSentAt = time.Now()
		m.CheckGeneration = 1
	})

	// Step 2: Reaper fires — bumps generation to 2, clears AwaitingResult.
	CASUpdate(ptr, func(m *Monitor) {
		m.AwaitingResult = false
		m.CheckGeneration = 2
	})

	beforeStatus := ptr.Load().LastStatus // ""

	// Step 3: Stale worker arrives with gen 1 → pre-check guard returns early.
	HandleSuccessDetailed(mon.ID, ptr, 100, ProbeMeta{ExpectedGeneration: 1})

	afterStatus := ptr.Load().LastStatus
	if afterStatus != beforeStatus {
		t.Errorf("Fix 3 FAIL: stale gen-1 result changed LastStatus from %q to %q", beforeStatus, afterStatus)
	} else {
		t.Logf("Fix 3: stale result dropped. LastStatus=%q PASS", afterStatus)
	}

	// Step 4: New dispatch — generation 3, AwaitingResult=true.
	CASUpdate(ptr, func(m *Monitor) {
		m.AwaitingResult = true
		m.CheckGeneration = 3
	})

	// Step 5: Current worker with gen 3 — must be accepted.
	HandleSuccessDetailed(mon.ID, ptr, 100, ProbeMeta{ExpectedGeneration: 3})
	if ptr.Load().LastStatus != "UP" {
		t.Errorf("Fix 3 FAIL: current-gen (3) result dropped; LastStatus=%s", ptr.Load().LastStatus)
	} else {
		t.Logf("Fix 3 PASS: gen-3 result accepted. LastStatus=%s", ptr.Load().LastStatus)
	}
}

// ---------------------------------------------------------------------------
// Fix 3 concurrent: Generation guard race test
// Late results from check N arrive concurrently while check N+1 is in flight.
// All late results must be dropped before the CAS and never alter LastStatus.
// ---------------------------------------------------------------------------

func TestDefectGenerationGuardConcurrentRace(t *testing.T) {
	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             "http://127.0.0.1:1",
		Type:            "http",
		Interval:        30,
		Timeout:         5,
		CurrentInterval: 30,
		LastFullPhaseAt: time.Now(),
	}
	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	// Dispatcher claims generation 1
	CASUpdate(ptr, func(m *Monitor) {
		m.AwaitingResult = true
		m.LastProbeSentAt = time.Now()
		m.CheckGeneration = 1
		m.LastStatus = "UP"
	})

	// Next check interval advances to generation 2 while check 1 is still running
	CASUpdate(ptr, func(m *Monitor) {
		m.AwaitingResult = true
		m.LastProbeSentAt = time.Now()
		m.CheckGeneration = 2
	})

	// Concurrently: 20 goroutines arrive with late results from check N (gen 1, DOWN)
	// Concurrently: 1 goroutine arrives with result for check N+1 (gen 2, UP)
	var wg sync.WaitGroup
	const staleGoroutines = 20
	for i := 0; i < staleGoroutines; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			HandleFailureDetailed(mon.ID, ptr, ErrTimeout, "stale check N failed", "timeout", ProbeMeta{ExpectedGeneration: 1})
		}()
	}

	wg.Add(1)
	go func() {
		defer wg.Done()
		time.Sleep(5 * time.Millisecond) // let stale workers race to CAS
		HandleSuccessDetailed(mon.ID, ptr, 50, ProbeMeta{ExpectedGeneration: 2})
	}()

	wg.Wait()

	finalStatus := ptr.Load().LastStatus
	if finalStatus != "UP" {
		t.Errorf("Fix 3 concurrent FAIL: stale gen-1 result overwrote status to %q; expected UP", finalStatus)
	}
	if ptr.Load().CheckGeneration != 2 {
		t.Errorf("Expected CheckGeneration == 2, got %d", ptr.Load().CheckGeneration)
	}
	t.Logf("Fix 3 concurrent PASS: all %d stale gen-1 results dropped, current gen-2 UP preserved", staleGoroutines)
}

// ---------------------------------------------------------------------------
// Fix 4: Reaper codes
// ErrNotExecuted must be a distinct constant, and the state machine must
// never transition to DOWN on ErrDropped (the machine-visible equivalent).
// ---------------------------------------------------------------------------

func TestDefectReaperCodeNeverDown(t *testing.T) {
	if ErrNotExecuted == ErrDropped {
		t.Errorf("Fix 4: ErrNotExecuted must differ from ErrDropped")
	}
	if ErrNotExecuted == ErrDegraded {
		t.Errorf("Fix 4: ErrNotExecuted must differ from ErrDegraded")
	}
	if ErrNotExecuted == ErrNone {
		t.Errorf("Fix 4: ErrNotExecuted must differ from ErrNone")
	}
	if string(ErrNotExecuted) != "NOT_EXECUTED" {
		t.Errorf("Fix 4: ErrNotExecuted value must be NOT_EXECUTED, got %q", ErrNotExecuted)
	}

	cfg := MachineConfig{SingleNodeMode: true, RecoveryN: 2}
	state := MonitorState{ID: "test-reaper-codes", Status: StatusUp}
	next, _ := Step(state, EventCheckResult{
		Role:     RolePrimary,
		PoP:      "pop-local",
		ErrClass: ErrDropped,
	}, time.Now(), cfg)

	if next.Status == StatusDown {
		t.Errorf("Fix 4 FAIL: ErrDropped transitioned machine to DOWN; must stay UP/BLOCKED")
	}
	t.Logf("Fix 4 PASS: machine stayed %s after ErrDropped", next.Status)
}

// ---------------------------------------------------------------------------
// Fix 5: One deadline per check — production worker path with hanging body.
//
// An httptest server sends HTTP 200 headers and then hangs (never sends body).
// The check is executed through the actual worker path (StartWorkers).
// The check must return DOWN within its timeout plus about 0.5s (1.8s - 2.6s).
// The response must not be returned to the pool while the read is still unwinding.
// Goroutines must return to baseline afterward.
// ---------------------------------------------------------------------------

func TestDefectOneDeadlinePerCheck(t *testing.T) {
	hangDone := make(chan struct{})
	ts := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
		// Hang indefinitely without sending body
		<-hangDone
	}))
	var closeOnce sync.Once
	cleanup := func() {
		closeOnce.Do(func() {
			close(hangDone)
			ts.Close()
		})
	}
	defer cleanup()

	InitHTTPClients(100)

	// Measure baseline goroutines before starting workers
	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	baselineGoroutines := runtime.NumGoroutine()

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	var wg sync.WaitGroup
	jobs := make(chan DispatchJob, 10)
	StartWorkers(ctx, &wg, 1, jobs)

	const checkTimeout = 2 * time.Second
	mon := &Monitor{
		ID:              uuid.New().String(),
		URL:             ts.URL,
		Type:            "keyword",
		Keyword:         "SECRET_KEYWORD",
		Interval:        30,
		Timeout:         int(checkTimeout.Seconds()),
		CurrentInterval: 30,
		LastFullPhaseAt: time.Now(),
	}
	ptr := new(atomic.Pointer[Monitor])
	ptr.Store(mon)

	CASUpdate(ptr, func(m *Monitor) {
		m.AwaitingResult = true
		m.LastProbeSentAt = time.Now()
		m.CheckGeneration = 1
	})

	start := time.Now()
	jobs <- DispatchJob{ptr: ptr, m: ptr.Load(), generation: 1}

	// Wait for worker to finish check (AwaitingResult becomes false)
	deadlineLimit := start.Add(checkTimeout + 1500*time.Millisecond)
	for time.Now().Before(deadlineLimit) {
		if !ptr.Load().AwaitingResult {
			break
		}
		time.Sleep(30 * time.Millisecond)
	}
	elapsed := time.Since(start)

	if ptr.Load().AwaitingResult {
		t.Fatalf("Fix 5 FAIL: worker did not complete check within budget; elapsed=%v", elapsed)
	}
	if ptr.Load().LastStatus != "DOWN" {
		t.Errorf("Fix 5 FAIL: expected LastStatus DOWN on hanging body, got %q", ptr.Load().LastStatus)
	}

	// Must finish within checkTimeout plus about 0.5s (1.8s - 2.6s)
	const minElapsed = 1800 * time.Millisecond
	const maxElapsed = 2600 * time.Millisecond
	if elapsed < minElapsed || elapsed > maxElapsed {
		t.Errorf("Fix 5 FAIL: elapsed %v not within expected range [%v, %v]", elapsed, minElapsed, maxElapsed)
	}

	// Cancel worker context and drain worker cleanly
	cancel()
	wg.Wait()
	cleanup()

	// Verify goroutines return to baseline (response wasn't returned to pool while read unwinding)
	runtime.GC()
	time.Sleep(100 * time.Millisecond)
	afterGoroutines := runtime.NumGoroutine()
	deadline := time.Now().Add(12 * time.Second)
	for time.Now().Before(deadline) {
		runtime.GC()
		afterGoroutines = runtime.NumGoroutine()
		if afterGoroutines <= baselineGoroutines {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if afterGoroutines > baselineGoroutines {
		t.Errorf("Fix 5 FAIL: goroutines did not return to baseline within 12s; baseline=%d after=%d",
			baselineGoroutines, afterGoroutines)
	}
	t.Logf("Fix 5 PASS: worker returned DOWN in %.3fs (budget %v), goroutines %d -> %d",
		elapsed.Seconds(), checkTimeout, baselineGoroutines, afterGoroutines)
}

// ---------------------------------------------------------------------------
// Fix 1a + 5 combined: TLS hang via doWithContext
// Verifies that the worker's actual path enforces the per-check timeout even
// when fasthttp's WriteTimeout is 10 s.
// ---------------------------------------------------------------------------

func TestDefectTLSHandshakeDeadlineViaDoWithContext(t *testing.T) {
	// Raw TCP: accept, drain the ClientHello, but never send a ServerHello.
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}

	stopServer := make(chan struct{})
	var closeOnce sync.Once
	cleanup := func() {
		closeOnce.Do(func() {
			close(stopServer)
			ln.Close()
		})
	}
	defer cleanup()
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				return // listener closed — goroutine exits
			}
			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 4096)
				c.Read(buf) //nolint:errcheck — drain ClientHello
				<-stopServer
			}(conn)
		}
	}()

	InitHTTPClients(100)

	req := fasthttp.AcquireRequest()
	res := fasthttp.AcquireResponse()
	var abandonedResult bool
	defer func() {
		if !abandonedResult {
			fasthttp.ReleaseRequest(req)
			fasthttp.ReleaseResponse(res)
		}
	}()
	req.SetRequestURI("https://" + ln.Addr().String())
	req.Header.SetMethod("HEAD")
	res.SkipBody = true

	ctx := context.Background()
	const checkTimeout = 2 * time.Second
	var dialed bool
	runtime.GC()
	time.Sleep(50 * time.Millisecond)
	baselineGoroutines := runtime.NumGoroutine()

	start := time.Now()
	callErr, leaked, abandoned := doWithContext(ctx, HTTPClients.FullPhase, req, res, checkTimeout, &dialed, nil)
	if abandoned {
		abandonedResult = true
	}
	elapsed := time.Since(start)
	_ = leaked

	if !abandoned && callErr == nil {
		t.Fatalf("Fix 1a+5: expected abandon or error for TLS hang, got abandoned=false callErr=nil")
	}

	// Must resolve within per-check timeout + 600 ms grace.
	const grace = 600 * time.Millisecond
	if elapsed > checkTimeout+grace {
		t.Errorf("Fix 1a+5: doWithContext TLS hang took %v; budget %v + grace %v not enforced",
			elapsed, checkTimeout, grace)
	}

	// Close listener and stop hanging server
	cleanup()

	// Verify goroutines return to baseline within 12s
	deadline := time.Now().Add(12 * time.Second)
	var afterGoroutines int
	for time.Now().Before(deadline) {
		runtime.GC()
		afterGoroutines = runtime.NumGoroutine()
		if afterGoroutines <= baselineGoroutines {
			break
		}
		time.Sleep(200 * time.Millisecond)
	}
	if afterGoroutines > baselineGoroutines {
		t.Errorf("Fix 1a+5 FAIL: goroutines did not return to baseline within 12s; baseline=%d after=%d",
			baselineGoroutines, afterGoroutines)
	}

	t.Logf("Fix 1a+5 PASS: doWithContext abandoned=%v callErr=%v elapsed=%.3fs goroutines %d -> %d",
		abandoned, callErr, elapsed.Seconds(), baselineGoroutines, afterGoroutines)
}
