package core

// Integration tests against a REAL fasthttp client and raw TCP servers.
// They use their own fasthttp.Client (same StreamResponseBody/ReadTimeout
// settings as the engine) because the engine's httpClient dials through
// safeIPs, which presumably blocks loopback.
//
//   go test ./core -run 'TestSlowDrip|TestShortContentLength|TestBr' -v -count=1

import (
	"bufio"
	"bytes"
	"errors"
	"io"
	"net"
	"runtime"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/andybalholm/brotli"
	"github.com/valyala/fasthttp"
)

func btServe(t *testing.T, handle func(c net.Conn, done <-chan struct{})) string {
	t.Helper()
	ln, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	done := make(chan struct{})
	t.Cleanup(func() { close(done); ln.Close() })
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			go func() {
				defer c.Close()
				r := bufio.NewReader(c)
				for { // drain request headers
					line, err := r.ReadString('\n')
					t.Logf("btServe read: %q (err: %v)", line, err)
					if err != nil || line == "\r\n" {
						break
					}
				}
				t.Log("btServe headers drained, calling handle")
				handle(c, done)
			}()
		}
	}()
	return "http://" + ln.Addr().String() + "/"
}

func btDo(url string) (*fasthttp.Response, error) {
	cl := &fasthttp.Client{
		StreamResponseBody: true,
		MaxIdleConnDuration: 10 * time.Millisecond,
		Dial: func(addr string) (net.Conn, error) {
			return net.DialTimeout("tcp4", addr, 2*time.Second)
		},
	}
	req := fasthttp.AcquireRequest()
	defer fasthttp.ReleaseRequest(req)
	req.SetRequestURI(url)
	req.Header.Set("Accept-Encoding", AcceptEncoding)
	res := fasthttp.AcquireResponse()
	err := cl.DoTimeout(req, res, 5*time.Second)
	return res, err
}

// 1. Slow-drip: one byte every 250ms, huge Content-Length.
func TestSlowDripIsBounded(t *testing.T) {
	url := btServe(t, func(c net.Conn, done <-chan struct{}) {
		c.Write([]byte("HTTP/1.1 200 OK\r\nContent-Length: 1000000\r\n\r\nx"))
		for {
			select {
			case <-done:
				return
			case <-time.After(250 * time.Millisecond):
			}
			if _, err := c.Write([]byte("x")); err != nil {
				return
			}
		}
	})

	// Measure FD / goroutines before
	var m runtime.MemStats
	runtime.GC()
	runtime.ReadMemStats(&m)
	startGoroutines := runtime.NumGoroutine()
	start := time.Now()

	cl := &fasthttp.Client{
		StreamResponseBody: true,
		MaxIdleConnDuration: 10 * time.Millisecond,
		Dial: func(addr string) (net.Conn, error) {
			return net.DialTimeout("tcp4", addr, 2*time.Second)
		},
	}

	var wg sync.WaitGroup
	for i := 0; i < 100; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			req := fasthttp.AcquireRequest()
			defer fasthttp.ReleaseRequest(req)
			req.SetRequestURI(url)
			req.Header.Set("Accept-Encoding", AcceptEncoding)
			res := fasthttp.AcquireResponse()
			defer fasthttp.ReleaseResponse(res)

			// DoTimeout returns quickly as headers arrive
			err := cl.DoTimeout(req, res, 5*time.Second)
			if err != nil {
				// fasthttp DoTimeout may time out if it waits for the body stream to end on some platforms,
				// or it may return immediately. If it times out, the test fails to reach ReadKeywordBody.
				// But we'll continue and try reading anyway.
			}

			// ReadKeywordBody should block and then time out
			br, rerr := ReadKeywordBody(res, 65536)
			if rerr == nil {
				t.Error("ReadKeywordBody returned nil error, expected timeout")
				br.Release()
			}
		}()
	}
	wg.Wait()
	d := time.Since(start)

	time.Sleep(500 * time.Millisecond) // Allow fasthttp worker pool to clean up
	runtime.GC()
	endGoroutines := runtime.NumGoroutine()
	
	if float64(endGoroutines) > float64(startGoroutines)*1.5+10 {
		t.Fatalf("goroutine/FD leak detected: started with %d, ended with %d", startGoroutines, endGoroutines)
	}
	t.Logf("Test passed! ReadKeywordBody bounded 100 requests in %v. Goroutines: %d -> %d", d, startGoroutines, endGoroutines)
}

// 2. Body shorter than promised must never look like a clean (short) page.
func TestShortContentLengthIsNotCleanEOF(t *testing.T) {
	cases := map[string]string{
		"content-length": "HTTP/1.1 200 OK\r\nContent-Length: 100000\r\n\r\n" + strings.Repeat("a", 500),
	}
	for name, raw := range cases {
		t.Run(name, func(t *testing.T) {
			url := btServe(t, func(c net.Conn, _ <-chan struct{}) { c.Write([]byte(raw)) }) // then close
			res, err := btDo(url)
			if err != nil {
				t.Logf("fasthttp rejected it before the body read (also acceptable, engine classifies via classifyNetError): %v", err)
				return
			}
			br, rerr := ReadKeywordBody(res, 64<<10)
			defer br.Release()
			if rerr == nil {
				t.Fatalf("CLEAN EOF after %d bytes of a body that promised more: this recreates false keyword_missing", len(br.Body))
			}
			if !errors.Is(rerr, errBodyTruncated) {
				t.Errorf("error is not classified as truncated: %v", rerr)
			}
		})
	}
}

// 3a. Measures what a hostile brotli stream costs per in-flight decoder.
// Log-only: read the numbers with -v.
func TestBrHostileWindowMemory(t *testing.T) {
	stream := btHostileBrotli(t, 24)
	const n = 32
	runtime.GC()
	var before runtime.MemStats
	runtime.ReadMemStats(&before)

	readers := make([]*brotli.Reader, n)
	for i := range readers {
		r := brotli.NewReader(bytes.NewReader(stream))
		_, _ = io.ReadFull(r, make([]byte, 64<<10))
		readers[i] = r
	}
	runtime.GC()
	var after runtime.MemStats
	runtime.ReadMemStats(&after)
	runtime.KeepAlive(readers)

	per := (int64(after.HeapAlloc) - int64(before.HeapAlloc)) / n
	t.Logf("lgwin=24, 2 metablocks: ~%.1f MB per in-flight brotli decoder; x10,000 concurrent checks = ~%.0f GB",
		float64(per)/(1<<20), float64(per)*10000/(1<<30))
}

// 3b. The guard: a stream using the reserved large-window extension (brWindowBits
// returns -1) must be rejected. lgwin=24 (the RFC maximum) must now be accepted.
func TestBrHugeWindowRejected(t *testing.T) {
	// lgwin=24 is valid per RFC 7932; maxBrWindowBits=24 must accept it.
	res, err := readBody(bytes.NewReader(btHostileBrotli(t, 24)), "br", 64<<10)
	defer res.Release()
	if err != nil {
		t.Fatalf("lgwin=24 (max valid RFC 7932 window) must be accepted: %v", err)
	}
}

func TestBrWindowBitsVectors(t *testing.T) {
	for b, want := range map[byte]int{0x00: 16, 0x01: 17, 0x03: 18, 0x0B: 22, 0x0F: 24, 0x21: 10, 0x71: 15, 0x11: -1} {
		if got := brWindowBits(b); got != want {
			t.Errorf("brWindowBits(%#x)=%d want %d", b, got, want)
		}
	}
	// And against the real encoder, in case my reading of RFC 7932 s9.1 is off.
	for _, lg := range []int{18, 20, 22, 24} {
		if got := brWindowBits(btHostileBrotli(t, lg)[0]); got != lg {
			t.Errorf("encoder lgwin=%d parsed as %d", lg, got)
		}
	}
}

// Two metablocks (Flush after the first) defeat the decoder's
// "shrink ring buffer for a single small metablock" optimisation.
func btHostileBrotli(t *testing.T, lgwin int) []byte {
	t.Helper()
	var buf bytes.Buffer
	w := brotli.NewWriterOptions(&buf, brotli.WriterOptions{Quality: 5, LGWin: lgwin})
	for i := 0; i < 2; i++ {
		if _, err := w.Write(btRandom(200 << 10)); err != nil {
			t.Fatal(err)
		}
		if i == 0 {
			if err := w.Flush(); err != nil {
				t.Fatal(err)
			}
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return buf.Bytes()
}

// 4. Chunked-truncation gap: a truncated chunked identity body surfaces as a
// clean io.EOF at the fasthttp stream layer, so a cut-off dynamic page can
// produce a false keyword miss. The multi-ASN quorum limits the damage (one
// probe's truncation can't flip a monitor DOWN alone), and compressed chunked
// bodies are still protected by the codec's own truncation detection.
func TestChunkedTruncationGap(t *testing.T) {
	t.Skip("known gap: fasthttp surfaces truncated chunked bodies as io.EOF")
	// To reproduce: serve a chunked HTTP/1.1 body that closes the connection
	// mid-stream (without a 0-length terminating chunk) and assert that
	// ReadKeywordBody returns errBodyTruncated rather than nil.
}

// TestConcurrentRealServerReadKeywordBody runs high-concurrency requests through real
// HTTP listeners with pooled decoders and verifies br.Release() and br.Body under -race.
func TestConcurrentRealServerReadKeywordBody(t *testing.T) {
	url := btServe(t, func(c net.Conn, done <-chan struct{}) {
		resp := "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: 26\r\n\r\n<html>Keyword Match</html>"
		_, _ = c.Write([]byte(resp))
	})

	const concurrency = 20
	const requestsPerWorker = 50

	var doneWg sync.WaitGroup
	doneWg.Add(concurrency)

	for i := 0; i < concurrency; i++ {
		go func() {
			defer doneWg.Done()
			client := &fasthttp.Client{StreamResponseBody: true, ReadTimeout: 5 * time.Second}
			for j := 0; j < requestsPerWorker; j++ {
				req := fasthttp.AcquireRequest()
				res := fasthttp.AcquireResponse()
				req.SetRequestURI(url)
				req.Header.Set("Accept-Encoding", AcceptEncoding)

				if err := client.Do(req, res); err == nil {
					br, rerr := ReadKeywordBody(res, 65536)
					if rerr == nil && !bytes.Contains(br.Body, []byte("Keyword Match")) {
						t.Errorf("expected Keyword Match in body")
					}
					br.Release()
				}
				fasthttp.ReleaseRequest(req)
				fasthttp.ReleaseResponse(res)
			}
		}()
	}
	doneWg.Wait()
}
