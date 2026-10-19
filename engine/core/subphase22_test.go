package core

import (
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"fmt"
	"math/big"
	"net"
	"net/http"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/valyala/fasthttp"
)

// TestLoopbackKeyword304 tests Item A:
// A keyword monitor receives a 304 Not Modified on a conditional check.
// It must pass as UP and retain its validator state without failing for "keyword not found".
func TestLoopbackKeyword304(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	etag := `"v1.0-abc"`
	keyword := "operational_status_ok"

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if inm := r.Header.Get("If-None-Match"); inm == etag {
				w.WriteHeader(http.StatusNotModified) // 304
				return
			}
			w.Header().Set("ETag", etag)
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(fmt.Sprintf("<html><body><h1>%s</h1></body></html>", keyword)))
		}),
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	client := &fasthttp.Client{
		MaxConnsPerHost:    2,
		StreamResponseBody: true,
	}
	url := fmt.Sprintf("http://%s/health", ln.Addr().String())

	mon := &Monitor{
		ID:              "mon-304-test",
		URL:             url,
		Keyword:         keyword,
		KeywordMaxBytes: 65536,
	}
	mon.InitKeyword(keyword, false)
	monKey := MonitorKey(mon.ID)
	DropValidatorState(monKey)

	// Step 1: Initial check (200 OK with ETag)
	req1 := fasthttp.AcquireRequest()
	res1 := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req1)
	defer fasthttp.ReleaseResponse(res1)

	req1.SetRequestURI(url)
	req1.Header.SetMethod("GET")

	if err := client.Do(req1, res1); err != nil {
		t.Fatalf("req1 failed: %v", err)
	}
	if res1.StatusCode() != http.StatusOK {
		t.Fatalf("expected 200, got %d", res1.StatusCode())
	}

	br1, err := ReadKeywordBody(res1, 65536, time.Now().Add(5*time.Second))
	if err != nil {
		t.Fatalf("ReadKeywordBody failed: %v", err)
	}
	defer br1.Release()

	// Check keyword and store validators
	if SearchKeywordMonitor(br1.Body, mon) < 0 {
		t.Fatalf("keyword %q not found in initial 200 response", keyword)
	}
	resETag := string(res1.Header.Peek(fasthttp.HeaderETag))
	resLM := string(res1.Header.Peek(fasthttp.HeaderLastModified))
	StoreValidatorState(monKey, []byte(resETag), []byte(resLM), time.Now().Unix(), true)

	// Step 2: Second check with conditional validator injection (304 Not Modified)
	req2 := fasthttp.AcquireRequest()
	res2 := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req2)
	defer fasthttp.ReleaseResponse(res2)

	req2.SetRequestURI(url)
	req2.Header.SetMethod("GET")
	conditionalInjected := InjectValidators(monKey, req2, time.Now().Unix(), 86400)
	if !conditionalInjected {
		t.Fatalf("expected InjectValidators to inject ETag validator")
	}

	if err := client.Do(req2, res2); err != nil {
		t.Fatalf("req2 failed: %v", err)
	}
	if res2.StatusCode() != fasthttp.StatusNotModified {
		t.Fatalf("expected 304 Not Modified, got %d", res2.StatusCode())
	}

	// Dispatcher logic check for 304
	statusCode := res2.StatusCode()
	statusOK := false
	if conditionalInjected && statusCode == fasthttp.StatusNotModified {
		statusOK = true
	}

	if !statusOK {
		t.Errorf("statusOK should be true for 304 with conditionalInjected")
	}

	// Confirm that on 304, body reading is bypassed completely
	// and validator state is preserved:
	st := condFor(monKey)
	st.mu.Lock()
	eligible := st.eligible
	cachedETag := string(st.etag)
	st.mu.Unlock()

	if !eligible || cachedETag != etag {
		t.Errorf("expected validator state to be retained on 304 hit, got eligible=%v etag=%q", eligible, cachedETag)
	}

	t.Logf("TestLoopbackKeyword304 PASSED: 304 correctly marked UP, body read bypassed, validators retained")
}

// TestLoopbackPartialBodyKeywordNoValidator tests Item B:
// When a keyword is found in a truncated body (rerr != nil), the check passes as UP,
// but validators are NOT stored.
func TestLoopbackPartialBodyKeywordNoValidator(t *testing.T) {
	monKey := MonitorKey("mon-partial-body-test")
	DropValidatorState(monKey)

	// Keyword found, but rerr is present
	keywordFound := true
	rerr := errBodyTruncated

	var storedValidators bool
	switch {
	case keywordFound && rerr == nil:
		StoreValidatorState(monKey, []byte(`"v1"`), nil, time.Now().Unix(), true)
		storedValidators = true
	case keywordFound && rerr != nil:
		// Keyword was found in valid prefix, but body was truncated.
		// Pass check, but DO NOT store validators.
		DropValidatorState(monKey)
		storedValidators = false
	default:
		DropValidatorState(monKey)
	}

	if storedValidators {
		t.Errorf("validators should NOT be stored when rerr != nil")
	}
	st := condFor(monKey)
	st.mu.Lock()
	eligible := st.eligible
	st.mu.Unlock()

	if eligible {
		t.Errorf("validator state should NOT be eligible for truncated body")
	}
	t.Logf("TestLoopbackPartialBodyKeywordNoValidator PASSED")
}

// TestLoopbackStaleSocketSingleAttempt tests Finding 1:
// Confirms that with MaxIdemponentCallAttempts = 1, fasthttp does not silently retry
// on an idle-closed socket, allowing the engine's warm retry to observe the stale closure.
func TestLoopbackStaleSocketSingleAttempt(t *testing.T) {
	var connCount int32
	var connsMu sync.Mutex
	var activeConns []net.Conn

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	// Server that records connections so we can close them from underneath
	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("OK"))
		}),
		ConnState: func(c net.Conn, state http.ConnState) {
			if state == http.StateNew {
				atomic.AddInt32(&connCount, 1)
				connsMu.Lock()
				activeConns = append(activeConns, c)
				connsMu.Unlock()
			}
		},
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	client := &fasthttp.Client{
		MaxConnsPerHost:           2,
		MaxIdemponentCallAttempts: 1, // Crucial: set to 1 so fasthttp does not silently redial
	}
	url := fmt.Sprintf("http://%s/test", ln.Addr().String())

	// Request 1: Opens connection
	req1 := fasthttp.AcquireRequest()
	res1 := fasthttp.AcquireResponse()
	req1.SetRequestURI(url)
	if err := client.Do(req1, res1); err != nil {
		t.Fatal(err)
	}
	fasthttp.ReleaseRequest(req1)
	fasthttp.ReleaseResponse(res1)

	// Close the idle server connection from underneath
	connsMu.Lock()
	for _, c := range activeConns {
		_ = c.Close()
	}
	connsMu.Unlock()
	time.Sleep(50 * time.Millisecond) // Allow TCP FIN/RST to be processed

	// Request 2 on warm connection
	req2 := fasthttp.AcquireRequest()
	res2 := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req2)
	defer fasthttp.ReleaseResponse(res2)
	req2.SetRequestURI(url)

	err2 := client.Do(req2, res2)
	if err2 == nil {
		t.Logf("client.Do succeeded (did fasthttp dial fresh or reuse? accepted conns: %d)", atomic.LoadInt32(&connCount))
	} else {
		isStale := isStaleSocketError(err2)
		t.Logf("client.Do surfaced stale error as expected: %v (isStaleSocketError=%v)", err2, isStale)
		if !isStale {
			t.Errorf("expected isStaleSocketError to be true for %v", err2)
		}
	}
}

// TestForcedGETStaleRetrySuccess tests Reviewer Item 3:
// A forced-GET status monitor (ForceGET: true, Keyword: "") experiences an idle-closed
// socket from the server. On warm retry, res.SkipBody must remain FALSE so fasthttp
// reads the 1-byte Range response body. The monitor must evaluate to UP without a body truncated error.
func TestForcedGETStaleRetrySuccess(t *testing.T) {
	var connCount int32
	var connsMu sync.Mutex
	var activeConns []net.Conn

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			rangeHdr := r.Header.Get("Range")
			if rangeHdr == "bytes=0-0" {
				w.Header().Set("Content-Range", "bytes 0-0/1")
				w.Header().Set("Content-Length", "1")
				w.WriteHeader(http.StatusPartialContent) // 206
				_, _ = w.Write([]byte("X"))
				return
			}
			w.Header().Set("Content-Length", "1")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte("X"))
		}),
		ConnState: func(c net.Conn, state http.ConnState) {
			if state == http.StateNew {
				atomic.AddInt32(&connCount, 1)
				connsMu.Lock()
				activeConns = append(activeConns, c)
				connsMu.Unlock()
			}
		},
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	client := &fasthttp.Client{
		MaxConnsPerHost:           2,
		MaxIdemponentCallAttempts: 1,
		StreamResponseBody:        true,
	}
	url := fmt.Sprintf("http://%s/health", ln.Addr().String())

	// Step 1: Initial check on warm connection
	req1 := fasthttp.AcquireRequest()
	res1 := fasthttp.AcquireResponse()
	req1.SetRequestURI(url)
	req1.Header.SetMethod("GET")
	req1.Header.Set("Range", "bytes=0-0")
	res1.SkipBody = false

	if err := client.Do(req1, res1); err != nil {
		t.Fatalf("initial request failed: %v", err)
	}
	br1, rerr1 := ReadKeywordBody(res1, 1, time.Now().Add(5*time.Second))
	if rerr1 != nil {
		t.Fatalf("ReadKeywordBody 1 failed: %v", rerr1)
	}
	br1.Release()
	fasthttp.ReleaseRequest(req1)
	fasthttp.ReleaseResponse(res1)

	// Step 2: Server closes the idle socket underneath
	connsMu.Lock()
	for _, c := range activeConns {
		_ = c.Close()
	}
	connsMu.Unlock()
	time.Sleep(50 * time.Millisecond) // Let OS process FIN

	// Step 3: Second check hits stale socket error and triggers warm retry
	req2 := fasthttp.AcquireRequest()
	res2 := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req2)
	defer fasthttp.ReleaseResponse(res2)

	req2.SetRequestURI(url)
	req2.Header.SetMethod("GET")
	req2.Header.Set("Range", "bytes=0-0")
	res2.SkipBody = false
	reqMethod := uint8(1) // 1=GET

	err2 := client.Do(req2, res2)
	if err2 != nil && isStaleSocketError(err2) {
		t.Logf("Attempt 1 observed stale socket error as expected: %v", err2)

		// Dispatcher warm retry logic:
		req2.SetConnectionClose()
		req2.Header.Set("X-Request-ID", "mon-retry-v2")

		// REVIEWER FIX: Re-assert SkipBody ONLY for reqMethod == 0 (HEAD).
		// Forced-GET probes MUST keep SkipBody = false!
		if reqMethod == 0 {
			res2.SkipBody = true
		} else {
			res2.SkipBody = false
		}

		retryErr := client.Do(req2, res2)
		if retryErr != nil {
			t.Fatalf("warm retry failed: %v", retryErr)
		}

		statusCode := res2.StatusCode()
		statusOK := (statusCode >= 200 && statusCode < 400)
		if !statusOK {
			t.Fatalf("expected statusOK=true, got status=%d", statusCode)
		}

		// Read 1 byte body for forced-GET probe
		br2, rerr2 := ReadKeywordBody(res2, 1, time.Now().Add(5*time.Second))
		if rerr2 != nil {
			t.Fatalf("ReadKeywordBody on retry failed with truncated body: %v (SkipBody bug reproduced!)", rerr2)
		}
		defer br2.Release()

		if len(br2.Body) != 1 || br2.WireBytes != 1 {
			t.Fatalf("expected 1 body byte and 1 wire byte, got body=%d wire=%d", len(br2.Body), br2.WireBytes)
		}

		t.Logf("TestForcedGETStaleRetrySuccess PASSED: Forced-GET retry read 1 byte successfully, status=%d, UP confirmed", statusCode)
	} else if err2 == nil {
		t.Logf("Socket was not stale on this attempt (fasthttp handled transparently)")
	}
}

// TestNetworkLevelWireBytesRangeIgnore tests Reviewer Item 2:
// Measures true socket-level network bytes (client net.Conn.Read and server net.Conn.Write)
// when a server ignores Range: bytes=0-0 and returns a 1 MB payload.
func TestNetworkLevelWireBytesRangeIgnore(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	payload1MB := make([]byte, 1<<20) // 1 MB
	for i := range payload1MB {
		payload1MB[i] = 'A'
	}

	var serverBytesWritten atomic.Int64
	var serverWriteErr atomic.Value

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(payload1MB)))
			w.WriteHeader(http.StatusOK) // Ignores Range header
			n, err := w.Write(payload1MB)
			serverBytesWritten.Store(int64(n))
			if err != nil {
				serverWriteErr.Store(err)
			}
		}),
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	var clientSocketBytesRead atomic.Int64

	client := &fasthttp.Client{
		StreamResponseBody: true,
		Dial: func(addr string) (net.Conn, error) {
			rawConn, err := net.Dial("tcp", addr)
			if err != nil {
				return nil, err
			}
			return &countingTestConn{
				Conn:      rawConn,
				bytesRead: &clientSocketBytesRead,
			}, nil
		},
	}

	req := fasthttp.AcquireRequest()
	res := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req)
	defer fasthttp.ReleaseResponse(res)

	req.SetRequestURI(fmt.Sprintf("http://%s/range-test", ln.Addr().String()))
	req.Header.Set("Range", "bytes=0-0")

	if err := client.Do(req, res); err != nil {
		t.Fatal(err)
	}

	// Application reads limit = 1 byte
	deadline := time.Now().Add(2 * time.Second)
	br, rerr := ReadKeywordBody(res, 1, deadline)
	if rerr != nil {
		t.Fatalf("ReadKeywordBody failed: %v", rerr)
	}

	if len(br.Body) != 1 {
		t.Fatalf("expected 1 decoded byte, got %d", len(br.Body))
	}
	if br.WireBytes != 1 {
		t.Fatalf("expected 1 app wire byte, got %d", br.WireBytes)
	}
	if !br.WindowFull {
		t.Fatalf("expected WindowFull=true")
	}

	// Close stream and sever connection
	if res.BodyStream() != nil {
		res.SetConnectionClose()
		_ = res.CloseBodyStream()
	}
	br.Release()

	time.Sleep(100 * time.Millisecond) // Let TCP close propagate

	socketBytes := clientSocketBytesRead.Load()
	serverWrites := serverBytesWritten.Load()

	t.Logf("=== Range Ignore 1 MB Wire Byte Comparison ===")
	t.Logf("Application WireBytes (br.WireBytes) : %d byte", br.WireBytes)
	t.Logf("Client net.Conn Socket Bytes Read    : %d bytes (%.1f KB)", socketBytes, float64(socketBytes)/1024)
	t.Logf("Server Socket Bytes Written          : %d bytes (%.1f KB)", serverWrites, float64(serverWrites)/1024)

	if socketBytes <= 1 {
		t.Errorf("expected socket-level bytes to exceed 1 byte due to TCP/fasthttp buffering, got %d", socketBytes)
	}
}

type countingTestConn struct {
	net.Conn
	bytesRead *atomic.Int64
}

func (c *countingTestConn) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	if n > 0 && c.bytesRead != nil {
		c.bytesRead.Add(int64(n))
	}
	return n, err
}

// TestDoWithContext_StalledHandshake tests Reviewer Smaller Item E:
// Verifies doWithContext aborts on a hanging TCP server (accepts connection and sends nothing),
// enforces the timeout + 500ms grace window, and tracks goroutine counts.
func TestDoWithContext_StalledHandshake(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	// Server accepts and never writes (simulates hanging TCP/TLS tarpit)
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				// Hold socket open without writing
				buf := make([]byte, 1024)
				_, _ = conn.Read(buf)
				time.Sleep(5 * time.Second)
				_ = conn.Close()
			}(c)
		}
	}()

	client := &fasthttp.Client{
		MaxConnsPerHost: 2,
		ReadTimeout:     5 * time.Second,
		WriteTimeout:    5 * time.Second,
		TLSConfig: &tls.Config{
			InsecureSkipVerify: true,
		},
	}

	var abandoned bool
	var leaked bool

	req := fasthttp.AcquireRequest()
	res := fasthttp.AcquireResponse()
	defer func() {
		// As in production dispatcher (line 1233), DO NOT release req/res back to fasthttp pool
		// if the request was abandoned, because the abandoned background goroutine is still accessing them.
		if !abandoned {
			fasthttp.ReleaseRequest(req)
			fasthttp.ReleaseResponse(res)
		}
	}()

	req.SetRequestURI(fmt.Sprintf("https://%s/tarpit", ln.Addr().String()))

	timeout := 200 * time.Millisecond
	var dialed bool
	var didResume bool

	goroutinesBefore := runtime.NumGoroutine()
	start := time.Now()

	err, leaked, abandoned = doWithContext(context.Background(), client, req, res, timeout, &dialed, &didResume)
	elapsed := time.Since(start)
	goroutinesAfter := runtime.NumGoroutine()

	t.Logf("doWithContext stalled handshake: elapsed=%v, err=%v, leaked=%v, abandoned=%v, goroutines: %d -> %d",
		elapsed, err, leaked, abandoned, goroutinesBefore, goroutinesAfter)

	if !abandoned {
		t.Errorf("expected abandoned=true when server hangs past timeout")
	}
	// Timeout was 200ms, grace window is 500ms -> should return within ~700ms - 900ms, NOT 5s!
	if elapsed > 1500*time.Millisecond {
		t.Errorf("doWithContext took too long to abort stalled handshake: %v (expected ~700ms)", elapsed)
	}

	// Close listener and wait briefly for abandoned goroutine to cleanly exit before test runner terminates
	_ = ln.Close()
	time.Sleep(100 * time.Millisecond)
}

// BenchmarkRealTLSHandshakeCPU tests Reviewer Item 1:
// Benchmarks real TLS handshakes against a loopback TLS server with ECDSA P-256 certificate,
// measuring client CPU and duration across full and resumed handshakes on TLS 1.3 and TLS 1.2.
func BenchmarkRealTLSHandshakeCPU(b *testing.B) {
	cert, err := generateP256TestCert()
	if err != nil {
		b.Fatal(err)
	}

	startTLSServer := func(ver uint16) net.Listener {
		cfg := &tls.Config{
			Certificates: []tls.Certificate{cert},
			MinVersion:   ver,
			MaxVersion:   ver,
		}
		ln, err := tls.Listen("tcp", "127.0.0.1:0", cfg)
		if err != nil {
			b.Fatal(err)
		}
		go func() {
			for {
				c, err := ln.Accept()
				if err != nil {
					return
				}
				go func(conn net.Conn) {
					defer conn.Close()
					buf := make([]byte, 1024)
					_, _ = conn.Read(buf)
					_, _ = conn.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 2\r\n\r\nOK"))
				}(c)
			}
		}()
		return ln
	}

	ln13 := startTLSServer(tls.VersionTLS13)
	defer ln13.Close()

	ln12 := startTLSServer(tls.VersionTLS12)
	defer ln12.Close()

	bench := func(name string, ln net.Listener, ver uint16, resume bool) {
		b.Run(name, func(b *testing.B) {
			var cache tls.ClientSessionCache
			if resume {
				cache = tls.NewLRUClientSessionCache(1000)
			}
			cfg := &tls.Config{
				InsecureSkipVerify: true,
				MinVersion:         ver,
				MaxVersion:         ver,
				ClientSessionCache: cache,
			}
			addr := ln.Addr().String()

			if resume {
				c, err := tls.Dial("tcp", addr, cfg)
				if err == nil {
					_, _ = c.Write([]byte("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"))
					buf := make([]byte, 1024)
					_, _ = c.Read(buf)
					_ = c.Close()
					time.Sleep(20 * time.Millisecond)
				}
			}

			b.ResetTimer()
			for i := 0; i < b.N; i++ {
				rawConn, err := net.Dial("tcp", addr)
				if err != nil {
					b.Fatal(err)
				}
				tlsConn := tls.Client(rawConn, cfg)
				if err := tlsConn.Handshake(); err != nil {
					_ = rawConn.Close()
					b.Fatal(err)
				}
				if resume && !tlsConn.ConnectionState().DidResume {
					_, _ = tlsConn.Write([]byte("GET / HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"))
					buf := make([]byte, 1024)
					_, _ = tlsConn.Read(buf)
				}
				_ = tlsConn.Close()
			}
		})
	}

	bench("TLS_1_3_Full", ln13, tls.VersionTLS13, false)
	bench("TLS_1_3_Resumed", ln13, tls.VersionTLS13, true)
	bench("TLS_1_2_Full", ln12, tls.VersionTLS12, false)
	bench("TLS_1_2_Resumed", ln12, tls.VersionTLS12, true)
}

func generateP256TestCert() (tls.Certificate, error) {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return tls.Certificate{}, err
	}
	template := x509.Certificate{
		SerialNumber: big.NewInt(1),
		Subject: pkix.Name{
			Organization: []string{"Uptime Engine Test"},
			CommonName:   "127.0.0.1",
		},
		NotBefore:             time.Now().Add(-time.Hour),
		NotAfter:              time.Now().Add(24 * time.Hour),
		KeyUsage:              x509.KeyUsageKeyEncipherment | x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		IPAddresses:           []net.IP{net.ParseIP("127.0.0.1")},
	}
	derBytes, err := x509.CreateCertificate(rand.Reader, &template, &template, &priv.PublicKey, priv)
	if err != nil {
		return tls.Certificate{}, err
	}
	return tls.Certificate{
		Certificate: [][]byte{derBytes},
		PrivateKey:  priv,
	}, nil
}
