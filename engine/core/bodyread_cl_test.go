package core

// Regression tests for the Content-Length truncation check.
//
// A body larger than the keyword window is read only partially BY DESIGN and
// must NOT be reported as truncated. These tests fail against the naive
// `if cl > 0 && br.WireBytes < int64(cl)` check and pass against the fixed
// `if err == nil && !br.WindowFull && br.Encoding == "identity"` version.
//
// Run the failing version first to prove the bug:
//
//	go test ./core -run 'TestLargeIdentity|TestLargeCompressed|TestSmallIdentity' -v -count=1

import (
	"fmt"
	"net"
	"testing"
	"time"
)

// btServeBody spins up a raw TCP server that serves a single response with the
// given Content-Encoding header and body. Reuses btServe from
// bodyread_integration_test.go (same package).
func btServeBody(t *testing.T, encoding string, body []byte) string {
	t.Helper()
	hdr := fmt.Sprintf("HTTP/1.1 200 OK\r\nContent-Length: %d\r\n", len(body))
	if encoding != "" {
		hdr += "Content-Encoding: " + encoding + "\r\n"
	}
	hdr += "\r\n"
	raw := append([]byte(hdr), body...)
	return btServe(t, func(c net.Conn, _ <-chan struct{}) {
		c.Write(raw) //nolint:errcheck // connection close flushes remaining bytes
	})
}

// TestLargeIdentityBodyIsNotTruncated: a 300 KB identity page with a 64 KB
// window should return WindowFull=true and no error. The naive CL check fires
// here because WireBytes (64 KB) < ContentLength (300 KB).
func TestLargeIdentityBodyIsNotTruncated(t *testing.T) {
	body := btRandom(300 << 10) // 300 KB > 64 KB window
	res, err := btDo(btServeBody(t, "", body), 3*time.Second)
	if err != nil {
		t.Fatalf("unexpected transport error: %v", err)
	}
	defer res.Body() // ensure fasthttp flushes the response

	br, rerr := ReadKeywordBody(res, 64<<10)
	defer br.Release()
	if rerr != nil {
		t.Fatalf("large identity body (window-capped) was incorrectly flagged as error: %v", rerr)
	}
	if !br.WindowFull {
		t.Fatalf("expected WindowFull=true for 300 KB body with 64 KB window, got WindowFull=false len=%d", len(br.Body))
	}
	if len(br.Body) != 64<<10 {
		t.Fatalf("expected exactly 64 KB decoded, got %d", len(br.Body))
	}
}

// TestLargeCompressedBodyIsNotTruncated: a gzip-compressed 300 KB body served
// with its full compressed Content-Length should not be flagged as truncated
// when the decoded window fills. The old check never applied to compressed
// bodies (the fix guards on Encoding=="identity"), but this documents the
// intent explicitly.
func TestLargeCompressedBodyIsNotTruncated(t *testing.T) {
	wire := btCompress(t, "gzip", btRandom(300<<10))
	res, err := btDo(btServeBody(t, "gzip", wire), 3*time.Second)
	if err != nil {
		t.Fatalf("unexpected transport error: %v", err)
	}

	br, rerr := ReadKeywordBody(res, 64<<10)
	defer br.Release()
	if rerr != nil {
		t.Fatalf("compressed large body flagged as error: %v", rerr)
	}
	if !br.WindowFull {
		t.Fatalf("expected WindowFull=true for compressed 300 KB body, got len=%d", len(br.Body))
	}
}

// TestSmallIdentityBodyCompleteIsClean: a body smaller than the window that is
// sent in full should return no error and the complete body.
func TestSmallIdentityBodyCompleteIsClean(t *testing.T) {
	body := []byte("<html>HEALTHY</html>")
	res, err := btDo(btServeBody(t, "", body), 3*time.Second)
	if err != nil {
		t.Fatalf("unexpected transport error: %v", err)
	}

	br, rerr := ReadKeywordBody(res, 64<<10)
	defer br.Release()
	if rerr != nil {
		t.Fatalf("small complete body returned error: %v", rerr)
	}
	if string(br.Body) != string(body) {
		t.Fatalf("body mismatch: got %q want %q", br.Body, body)
	}
	if br.WindowFull {
		t.Fatal("expected WindowFull=false for small body, got true")
	}
}
