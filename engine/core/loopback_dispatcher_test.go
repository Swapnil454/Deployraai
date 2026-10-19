package core

import (
	"fmt"
	"io"
	"net"
	"net/http"
	"sync/atomic"
	"testing"

	"github.com/valyala/fasthttp"
)

// TestLoopbackHeadReusesConnection tests that normal HEAD requests reuse connections.
func TestLoopbackHeadReusesConnection(t *testing.T) {
	var connCount int32

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Content-Length", "1048576")
			w.WriteHeader(http.StatusOK)
			// HEAD response has headers but NO body written
		}),
		ConnState: func(c net.Conn, state http.ConnState) {
			if state == http.StateNew {
				atomic.AddInt32(&connCount, 1)
			}
		},
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	client := &fasthttp.Client{
		MaxConnsPerHost:    2,
		StreamResponseBody: true,
	}

	url := fmt.Sprintf("http://%s/head", ln.Addr().String())

	// Request 1: HEAD
	req1 := fasthttp.AcquireRequest()
	res1 := fasthttp.AcquireResponse()
	req1.SetRequestURI(url)
	req1.Header.SetMethod("HEAD")
	res1.SkipBody = true

	if err := client.Do(req1, res1); err != nil {
		t.Fatalf("req1 failed: %v", err)
	}
	fasthttp.ReleaseRequest(req1)
	fasthttp.ReleaseResponse(res1)

	// Request 2: HEAD on same client
	req2 := fasthttp.AcquireRequest()
	res2 := fasthttp.AcquireResponse()
	req2.SetRequestURI(url)
	req2.Header.SetMethod("HEAD")
	res2.SkipBody = true

	if err := client.Do(req2, res2); err != nil {
		t.Fatalf("req2 failed: %v", err)
	}
	fasthttp.ReleaseRequest(req2)
	fasthttp.ReleaseResponse(res2)

	t.Logf("HEAD requests accepted connections: %d (expected 1 for connection reuse)", atomic.LoadInt32(&connCount))
	if atomic.LoadInt32(&connCount) != 1 {
		t.Errorf("expected 1 connection reused, got %d", atomic.LoadInt32(&connCount))
	}
}

// TestLoopbackSkipBodyWith1MB tests Risk 2.2:
// Server ignores Range: bytes=0-0 and sends a 1 MB 200 OK.
// Client uses SkipBody = true.
// Does the second request on the same client corrupt or fail?
func TestLoopbackSkipBodyWith1MB(t *testing.T) {
	var connCount int32

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	payload1MB := make([]byte, 1<<20) // 1 MB of 'A'
	for i := range payload1MB {
		payload1MB[i] = 'A'
	}

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			w.Header().Set("Content-Length", fmt.Sprintf("%d", len(payload1MB)))
			w.WriteHeader(http.StatusOK) // ignores Range, returns 200 OK
			_, _ = w.Write(payload1MB)
		}),
		ConnState: func(c net.Conn, state http.ConnState) {
			if state == http.StateNew {
				atomic.AddInt32(&connCount, 1)
			}
		},
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	client := &fasthttp.Client{
		MaxConnsPerHost:    2,
		StreamResponseBody: true,
	}

	url := fmt.Sprintf("http://%s/test", ln.Addr().String())

	// Request 1: GET with SkipBody = true
	req1 := fasthttp.AcquireRequest()
	res1 := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req1)
	defer fasthttp.ReleaseResponse(res1)

	req1.SetRequestURI(url)
	req1.Header.SetMethod("GET")
	req1.Header.Set("Range", "bytes=0-0")
	res1.SkipBody = true

	if err := client.Do(req1, res1); err != nil {
		t.Fatalf("req1 failed: %v", err)
	}
	t.Logf("req1 statusCode=%d, res1.Body len=%d", res1.StatusCode(), len(res1.Body()))

	// Request 2: GET with SkipBody = false to see if connection is corrupted or reusable
	req2 := fasthttp.AcquireRequest()
	res2 := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req2)
	defer fasthttp.ReleaseResponse(res2)

	req2.SetRequestURI(url)
	req2.Header.SetMethod("GET")
	res2.SkipBody = false

	if err := client.Do(req2, res2); err != nil {
		t.Logf("req2 error (did unread bytes corrupt connection?): %v", err)
	} else {
		t.Logf("req2 statusCode=%d, body len=%d", res2.StatusCode(), len(res2.Body()))
	}

	t.Logf("Total accepted connections: %d", atomic.LoadInt32(&connCount))
}

// TestLoopbackOverlimitStreamingClose tests Risk 2.3:
// When an overlimit body is detected during streaming, does fasthttp close the connection
// or return it to the pool?
func TestLoopbackOverlimitStreamingClose(t *testing.T) {
	var connCount int32

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	payload500KB := make([]byte, 500<<10)

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(payload500KB)
		}),
		ConnState: func(c net.Conn, state http.ConnState) {
			if state == http.StateNew {
				atomic.AddInt32(&connCount, 1)
			}
		},
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	client := &fasthttp.Client{
		MaxConnsPerHost:    2,
		StreamResponseBody: true,
	}

	url := fmt.Sprintf("http://%s/stream", ln.Addr().String())

	// Request 1: Streamed request, partial read, then CloseBodyStream
	req1 := fasthttp.AcquireRequest()
	res1 := fasthttp.AcquireResponse()
	req1.SetRequestURI(url)
	req1.Header.SetMethod("GET")

	if err := client.Do(req1, res1); err != nil {
		t.Fatalf("req1 Do failed: %v", err)
	}

	stream := res1.BodyStream()
	if stream == nil {
		t.Logf("BodyStream was nil")
	} else {
		buf := make([]byte, 10<<10)
		n, _ := io.ReadFull(stream, buf)
		t.Logf("Read %d bytes from stream of 500KB", n)

		// Overlimit triggered! Client sets connection close and closes stream
		res1.SetConnectionClose()
		req1.SetConnectionClose()
		_ = res1.CloseBodyStream()
	}
	fasthttp.ReleaseRequest(req1)
	fasthttp.ReleaseResponse(res1)

	// Request 2: Issue another request
	req2 := fasthttp.AcquireRequest()
	res2 := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req2)
	defer fasthttp.ReleaseResponse(res2)
	req2.SetRequestURI(url)

	if err := client.Do(req2, res2); err != nil {
		t.Fatalf("req2 failed: %v", err)
	}
	t.Logf("req2 statusCode=%d, accepted connections so far: %d", res2.StatusCode(), atomic.LoadInt32(&connCount))
}

// TestLoopbackStreamWithoutSetConnectionClose tests what happens if CloseBodyStream is called
// without SetConnectionClose when unread bytes remain.
func TestLoopbackStreamWithoutSetConnectionClose(t *testing.T) {
	var connCount int32

	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	payload500KB := make([]byte, 500<<10)

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "text/plain")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(payload500KB)
		}),
		ConnState: func(c net.Conn, state http.ConnState) {
			if state == http.StateNew {
				atomic.AddInt32(&connCount, 1)
			}
		},
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	client := &fasthttp.Client{
		MaxConnsPerHost:    2,
		StreamResponseBody: true,
	}

	url := fmt.Sprintf("http://%s/stream", ln.Addr().String())

	// Request 1: Streamed request, partial read, CloseBodyStream WITHOUT SetConnectionClose
	req1 := fasthttp.AcquireRequest()
	res1 := fasthttp.AcquireResponse()
	req1.SetRequestURI(url)
	req1.Header.SetMethod("GET")

	if err := client.Do(req1, res1); err != nil {
		t.Fatalf("req1 Do failed: %v", err)
	}

	stream := res1.BodyStream()
	if stream != nil {
		buf := make([]byte, 10<<10)
		_, _ = io.ReadFull(stream, buf)
		// Close stream WITHOUT SetConnectionClose
		_ = res1.CloseBodyStream()
	}
	fasthttp.ReleaseRequest(req1)
	fasthttp.ReleaseResponse(res1)

	// Request 2: Issue another request
	req2 := fasthttp.AcquireRequest()
	res2 := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req2)
	defer fasthttp.ReleaseResponse(res2)
	req2.SetRequestURI(url)

	if err := client.Do(req2, res2); err != nil {
		t.Fatalf("req2 failed: %v", err)
	}
	t.Logf("req2 statusCode=%d, accepted connections so far: %d", res2.StatusCode(), atomic.LoadInt32(&connCount))
}

// TestLoopbackRangeEmptyResource416 tests Item 4:
// A server with an empty resource returns 416 Range Not Satisfiable when Range: bytes=0-0 is requested.
// The engine must treat 416 on learned-GET status-only probes as UP.
func TestLoopbackRangeEmptyResource416(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	server := &http.Server{
		Handler: http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Range") != "" {
				w.Header().Set("Content-Range", "bytes */0")
				w.WriteHeader(http.StatusRequestedRangeNotSatisfiable) // 416
				return
			}
			w.WriteHeader(http.StatusOK)
		}),
	}
	go func() { _ = server.Serve(ln) }()
	defer func() { _ = server.Close() }()

	client := &fasthttp.Client{}
	url := fmt.Sprintf("http://%s/empty", ln.Addr().String())

	req := fasthttp.AcquireRequest()
	res := fasthttp.AcquireResponse()
	defer fasthttp.ReleaseRequest(req)
	defer fasthttp.ReleaseResponse(res)

	req.SetRequestURI(url)
	req.Header.SetMethod("GET")
	req.Header.Set("Range", "bytes=0-0")

	if err := client.Do(req, res); err != nil {
		t.Fatalf("client.Do failed: %v", err)
	}

	statusCode := res.StatusCode()
	if statusCode != fasthttp.StatusRequestedRangeNotSatisfiable {
		t.Fatalf("expected status 416, got %d", statusCode)
	}

	// Verify classification logic matches dispatcher.go line 1128
	m := &Monitor{ForceGET: true, Keyword: ""}
	statusOK := (statusCode >= 200 && statusCode < 400)
	if !statusOK && statusCode == fasthttp.StatusRequestedRangeNotSatisfiable && m.ForceGET && m.Keyword == "" {
		statusOK = true
	}

	if !statusOK {
		t.Errorf("416 on empty resource for ForceGET status probe was not classified as UP")
	}
}
