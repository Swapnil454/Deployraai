package core

import (
	"context"
	"errors"
	"io"
	"net"
	"os"
	"sync/atomic"
	"syscall"
	"testing"
	"time"

	"github.com/your-org/uptime-engine/netsec"
)

func TestPortProbe_Success(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	var acceptedCount atomic.Int32
	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			acceptedCount.Add(1)
			_ = c.Close()
		}
	}()

	addr := ln.Addr().String()
	ctx := context.Background()

	res := ProbeTCPPortWithConfig(ctx, addr, PortProbeConfig{
		Timeout:       2 * time.Second,
		BlockedIPFunc: testAllowLoopback,
	})
	if !res.Success {
		t.Fatalf("expected success=true, got errClass=%s msg=%s", res.ErrClass, res.ErrorMessage)
	}
	if res.ErrClass != ErrNone {
		t.Fatalf("expected ErrNone, got %s", res.ErrClass)
	}
	if res.Latency <= 0 {
		t.Fatalf("expected positive latency, got %v", res.Latency)
	}
	time.Sleep(20 * time.Millisecond)
}

func TestPortProbe_ZeroLingerRST(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	serverConnCh := make(chan net.Conn, 1)
	go func() {
		c, err := ln.Accept()
		if err == nil {
			serverConnCh <- c
		}
	}()

	addr := ln.Addr().String()
	ctx := context.Background()

	// Probe with ZeroLinger (default)
	res := ProbeTCPPortWithConfig(ctx, addr, PortProbeConfig{
		Timeout:       2 * time.Second,
		GracefulClose: false,
		BlockedIPFunc: testAllowLoopback,
	})
	if !res.Success {
		t.Fatalf("expected probe success, got %v", res.ErrClass)
	}

	serverConn := <-serverConnCh
	defer serverConn.Close()

	// Server reads: since client set SO_LINGER{1, 0} and closed, client kernel transmitted an RST packet.
	// Server must receive an error (ECONNRESET or EOF) immediately without hanging.
	buf := make([]byte, 1024)
	_ = serverConn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, readErr := serverConn.Read(buf)
	t.Logf("Zero-Linger Server Read() return: err=%v", readErr)
	if readErr == nil {
		t.Fatalf("expected read error on reset socket, got nil")
	}
}

func TestPortProbe_GracefulClose(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()

	serverConnCh := make(chan net.Conn, 1)
	go func() {
		c, err := ln.Accept()
		if err == nil {
			serverConnCh <- c
		}
	}()

	addr := ln.Addr().String()
	ctx := context.Background()

	// Probe with GracefulClose: true
	res := ProbeTCPPortWithConfig(ctx, addr, PortProbeConfig{
		Timeout:       2 * time.Second,
		GracefulClose: true,
		BlockedIPFunc: testAllowLoopback,
	})
	if !res.Success {
		t.Fatalf("expected probe success, got %v", res.ErrClass)
	}

	serverConn := <-serverConnCh
	defer serverConn.Close()

	buf := make([]byte, 1024)
	_ = serverConn.SetReadDeadline(time.Now().Add(500 * time.Millisecond))
	_, readErr := serverConn.Read(buf)
	t.Logf("Graceful Close Server Read() return: err=%v", readErr)
	if readErr != io.EOF && !errors.Is(readErr, io.EOF) {
		t.Logf("Graceful FIN produced: %v (EOF expected)", readErr)
	}
}

func TestPortProbe_ConnectionRefused(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	addr := ln.Addr().String()
	_ = ln.Close()

	ctx := context.Background()
	res := ProbeTCPPortWithConfig(ctx, addr, PortProbeConfig{
		Timeout:       2 * time.Second,
		BlockedIPFunc: testAllowLoopback,
	})

	if res.Success {
		t.Fatalf("expected success=false for closed port")
	}
	if res.ErrClass != ErrRefused {
		t.Fatalf("expected ErrRefused, got %s (msg: %s)", res.ErrClass, res.ErrorMessage)
	}
}

func TestPortProbe_SSRFBlocked(t *testing.T) {
	ctx := context.Background()

	// Test loopback target (uses default netsec.IsBlocked)
	res := ProbeTCPPort(ctx, "127.0.0.1:80", 1*time.Second)
	if res.Success {
		t.Fatalf("expected loopback to be blocked by SSRF blocker")
	}
	if res.ErrClass != ErrSSRF {
		t.Fatalf("expected ErrSSRF for loopback target, got %s", res.ErrClass)
	}

	// Test private RFC1918 target
	resPrivate := ProbeTCPPort(ctx, "10.0.0.1:22", 1*time.Second)
	if resPrivate.Success {
		t.Fatalf("expected 10.0.0.1 to be blocked by SSRF blocker")
	}
	if resPrivate.ErrClass != ErrSSRF {
		t.Fatalf("expected ErrSSRF for private target, got %s", resPrivate.ErrClass)
	}

	// Test AWS link-local metadata
	resMetadata := ProbeTCPPort(ctx, "169.254.169.254:80", 1*time.Second)
	if resMetadata.Success {
		t.Fatalf("expected 169.254.169.254 to be blocked by SSRF blocker")
	}
	if resMetadata.ErrClass != ErrSSRF {
		t.Fatalf("expected ErrSSRF for metadata target, got %s", resMetadata.ErrClass)
	}
}

func TestNormalizeTCPTarget_Validation(t *testing.T) {
	valid := []struct {
		input    string
		wantHost string
		wantPort string
	}{
		{"example.com:80", "example.com", "80"},
		{"tcp://1.2.3.4:443", "1.2.3.4", "443"},
		{"http://test.com:8080/status", "test.com", "8080"},
		{"[::1]:9000", "::1", "9000"},
	}
	for _, tc := range valid {
		h, p, err := NormalizeTCPTarget(tc.input)
		if err != nil {
			t.Fatalf("NormalizeTCPTarget(%q) unexpected err: %v", tc.input, err)
		}
		if h != tc.wantHost || p != tc.wantPort {
			t.Fatalf("NormalizeTCPTarget(%q) = (%q, %q), want (%q, %q)", tc.input, h, p, tc.wantHost, tc.wantPort)
		}
	}

	invalid := []string{
		"example.com:http",  // non-integer port
		"example.com:0",     // out of range (0)
		"example.com:65536", // out of range (> 65535)
		"example.com:-1",    // negative
		"example.com",       // missing port
		"",
	}
	for _, in := range invalid {
		_, _, err := NormalizeTCPTarget(in)
		if err == nil {
			t.Fatalf("NormalizeTCPTarget(%q) expected error for invalid port, got nil", in)
		}
	}
}

func TestClassifyTCPError_ComprehensiveTable(t *testing.T) {
	cases := []struct {
		name            string
		err             error
		expectedClass   ErrClass
		mustBeInconclus bool
	}{
		// Typed DNS Sentinels -> Inconclusive / Local Resource
		{"ErrDNSLocalResource (semaphore saturation)", ErrDNSLocalResource, ErrLocalResource, true},
		{"ErrRecursorUnavailable (canary down / recursor outage)", ErrRecursorUnavailable, ErrLocalResource, true},
		{"ErrDNSDeadlineExceeded (lookup deadline exceeded)", ErrDNSDeadlineExceeded, ErrDNSTemporary, true},
		{"ErrDNSUnsupportedIPv6 (IPv6 only without route)", ErrDNSUnsupportedIPv6, ErrUnsupported, true},

		// Local Resource Exhaustion -> Must be ErrLocalResource (Inconclusive, never false DOWN!)
		{"EMFILE (too many open files)", syscall.EMFILE, ErrLocalResource, true},
		{"ENFILE (file table overflow)", syscall.ENFILE, ErrLocalResource, true},
		{"EADDRNOTAVAIL (ephemeral port exhaustion)", syscall.EADDRNOTAVAIL, ErrLocalResource, true},
		{"ENOBUFS (kernel socket buffers full)", syscall.ENOBUFS, ErrLocalResource, true},
		{"ENOMEM (out of memory)", syscall.ENOMEM, ErrLocalResource, true},
		{"EPERM (operation not permitted by firewall)", syscall.EPERM, ErrLocalResource, true},

		// DNS Errors -> Checked FIRST: separate temporary resolver timeout from NXDOMAIN
		{
			"DNS resolver timeout",
			&net.DNSError{IsTimeout: true, Err: "i/o timeout", Name: "example.com"},
			ErrDNSTemporary,
			true,
		},
		{
			"DNS temporary failure",
			&net.DNSError{IsTemporary: true, Err: "server failure", Name: "example.com"},
			ErrDNSTemporary,
			true,
		},
		{
			"DNS host not found (NXDOMAIN)",
			&net.DNSError{IsNotFound: true, Err: "no such host", Name: "notfound.invalid"},
			ErrDNS,
			false, // NXDOMAIN routes to failure/DOWN
		},

		// Target / Remote Network Errors
		{"ECONNREFUSED (port closed)", syscall.ECONNREFUSED, ErrRefused, false},
		{"EHOSTUNREACH (host unreachable)", syscall.EHOSTUNREACH, ErrUnreachable, false},
		{"ENETUNREACH (network unreachable - local default route missing)", syscall.ENETUNREACH, ErrLocalResource, true},
		{"ETIMEDOUT (SYN dropped by firewall)", syscall.ETIMEDOUT, ErrTimeout, false},
		{"context.DeadlineExceeded", context.DeadlineExceeded, ErrTimeout, false},
		{"os.ErrDeadlineExceeded", os.ErrDeadlineExceeded, ErrTimeout, false},
		{"ECONNRESET during handshake", syscall.ECONNRESET, ErrNet, false},
		{"SSRF Blocked", netsec.ErrSSRFBlocked, ErrSSRF, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			gotClass, msg := ClassifyTCPError(tc.err)
			if gotClass != tc.expectedClass {
				t.Fatalf("ClassifyTCPError(%v) = %s, expected %s (msg: %s)", tc.err, gotClass, tc.expectedClass, msg)
			}
			isInconclusive := (gotClass == ErrLocalResource || gotClass == ErrUnsupported || gotClass == ErrDNSTemporary)
			if tc.mustBeInconclus && !isInconclusive {
				t.Fatalf("expected error %s to be treated as inconclusive (never false DOWN), but isInconclusive=false", tc.name)
			}
		})
	}
}

func BenchmarkPortProbe_ZeroLinger(b *testing.B) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		b.Fatal(err)
	}
	defer ln.Close()

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()

	addr := ln.Addr().String()
	ctx := context.Background()

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		res := ProbeTCPPortWithConfig(ctx, addr, PortProbeConfig{
			Timeout:       2 * time.Second,
			GracefulClose: false,
		})
		if !res.Success {
			b.Fatalf("probe failed: %v", res.ErrClass)
		}
	}
}

func BenchmarkPortProbe_Parallel_ZeroLinger(b *testing.B) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		b.Fatal(err)
	}
	defer ln.Close()

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()

	addr := ln.Addr().String()

	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		ctx := context.Background()
		for pb.Next() {
			res := ProbeTCPPortWithConfig(ctx, addr, PortProbeConfig{
				Timeout:       2 * time.Second,
				GracefulClose: false,
			})
			if !res.Success {
				b.Fatalf("probe failed: %v", res.ErrClass)
			}
		}
	})
}

func BenchmarkPortProbe_GracefulClose(b *testing.B) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		b.Fatal(err)
	}
	defer ln.Close()

	go func() {
		for {
			c, err := ln.Accept()
			if err != nil {
				return
			}
			_ = c.Close()
		}
	}()

	addr := ln.Addr().String()
	ctx := context.Background()

	b.ResetTimer()
	b.ReportAllocs()

	for i := 0; i < b.N; i++ {
		res := ProbeTCPPortWithConfig(ctx, addr, PortProbeConfig{
			Timeout:       2 * time.Second,
			GracefulClose: true,
		})
		if !res.Success {
			b.Fatalf("probe failed: %v", res.ErrClass)
		}
	}
}
