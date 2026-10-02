package netsec

import (
	"context"
	"errors"
	"net"
	"net/http"
	"net/http/httptest"
	"net/netip"
	"testing"
	"time"
)

func TestIsBlocked(t *testing.T) {
	tests := []struct {
		ip      string
		blocked bool
	}{
		{"8.8.8.8", false},
		{"1.1.1.1", false},
		{"2606:4700:4700::1111", false},
		
		// Boundaries (should be false)
		{"172.15.255.255", false},
		{"172.32.0.1", false},
		{"100.63.255.255", false},
		{"100.128.0.1", false},
		{"198.17.255.255", false},
		{"198.20.0.1", false},
		{"169.253.255.255", false},
		{"192.0.1.1", false},
		
		// Explicit Blocks
		{"169.254.169.254", true}, // AWS metadata
		{"10.0.0.1", true},        // RFC1918
		{"172.16.0.1", true},      // RFC1918
		{"192.168.1.1", true},     // RFC1918
		{"127.0.0.1", true},       // Loopback
		{"::1", true},             // Loopback IPv6
		{"100.64.0.1", true},      // CGNAT
		{"0.0.0.0", true},         // Zero
		{"192.0.0.1", true},       // IETF
		{"198.18.0.1", true},      // Benchmarking
		{"240.0.0.1", true},       // Reserved
		{"fc00::1", true},         // ULA
		{"fe80::1", true},         // Link-local IPv6
		{"64:ff9b::1", true},      // NAT64
		{"2002::1", true},         // 6to4
		
		// Tricky Mappings
		{"::ffff:169.254.169.254", true},
		{"::ffff:10.0.0.1", true},
		
		// Multicast & Others
		{"224.0.0.1", true},
		{"ff02::1", true},
		{"255.255.255.255", true},
		{"::", true},
		
		// Zoned
		{"fe80::1%eth0", true},
		{"fc00::1%eth0", true},
	}

	for _, tc := range tests {
		ip, err := netip.ParseAddr(tc.ip)
		if err != nil {
			t.Fatalf("Failed to parse IP %s: %v", tc.ip, err)
		}
		if got := IsBlocked(ip); got != tc.blocked {
			t.Errorf("IsBlocked(%s) = %v; want %v", tc.ip, got, tc.blocked)
		}
	}
	
	// Test Zero Addr (Fail Open Fix)
	if !IsBlocked(netip.Addr{}) {
		t.Errorf("IsBlocked(netip.Addr{}) = false; want true")
	}
}

func TestControlBlocksReachableLoopback(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		t.Error("connection reached the server")
	}))
	defer srv.Close()
	
	_, port, _ := net.SplitHostPort(srv.Listener.Addr().String())
	d := &net.Dialer{Control: SSRFControl}
	
	for _, host := range []string{"127.0.0.1", "localhost", "::1"} {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		_, err := d.DialContext(ctx, "tcp", net.JoinHostPort(host, port))
		cancel()
		
		if !errors.Is(err, ErrSSRFBlocked) {
			t.Errorf("%s: want ErrSSRFBlocked, got %v", host, err)
		}
	}
}

func TestRedirectToBlockedIPRefused(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, "http://169.254.169.254/latest/meta-data/", http.StatusFound)
	}))
	defer srv.Close()
	
	allowLoopback := func(ip netip.Addr) bool { return !ip.Unmap().IsLoopback() && IsBlocked(ip) }
	
	c := &http.Client{
		Timeout:       3 * time.Second,
		CheckRedirect: SafeRedirectPolicy,
		Transport: &http.Transport{DialContext: (&net.Dialer{Control: controlWith(allowLoopback)}).DialContext},
	}
	
	_, err := c.Get(srv.URL)
	if !errors.Is(err, ErrSSRFBlocked) {
		t.Fatalf("want ErrSSRFBlocked, got %v", err)
	}
}

func TestSafeRedirectPolicy(t *testing.T) {
	// A -> B (Cross domain) -> B (Same domain, different path)
	req3, _ := http.NewRequest("GET", "https://site-b.com/path", nil)
	req3.Header.Set("Zzz-Whatever", "secret")
	req3.Header.Set("User-Agent", "Engine/1.0")

	req2, _ := http.NewRequest("GET", "https://site-b.com", nil)
	req1, _ := http.NewRequest("GET", "https://site-a.com", nil)

	// Test cross-domain (Hop 2 compared to Hop 1 origin)
	err := SafeRedirectPolicy(req3, []*http.Request{req1, req2})
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}

	if req3.Header.Get("Zzz-Whatever") != "" {
		t.Errorf("Expected Zzz-Whatever to be stripped on cross-domain redirect")
	}
	if req3.Header.Get("User-Agent") != "Engine/1.0" {
		t.Errorf("Expected User-Agent to be retained")
	}

	// Test same-origin retention
	reqSame, _ := http.NewRequest("GET", "https://site-a.com/path2", nil)
	reqSame.Header.Set("Zzz-Whatever", "secret2")
	reqSame.Header.Set("User-Agent", "Engine/1.0")
	
	err = SafeRedirectPolicy(reqSame, []*http.Request{req1})
	if err != nil {
		t.Fatalf("Unexpected error: %v", err)
	}
	if reqSame.Header.Get("Zzz-Whatever") != "secret2" {
		t.Errorf("Expected Zzz-Whatever to be retained on same-origin redirect")
	}
	
	// The hop cap is tested via a real server chain in TestSafeRedirectPolicyChain
}

func TestSafeRedirectPolicyChain(t *testing.T) {
	redirects := 0
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		redirects++
		http.Redirect(w, r, r.URL.Path, http.StatusFound)
	}))
	defer srv.Close()

	c := &http.Client{
		Timeout:       3 * time.Second,
		CheckRedirect: SafeRedirectPolicy,
	}

	_, err := c.Get(srv.URL)
	if err == nil {
		t.Fatalf("Expected error, got nil")
	}
	if !errors.Is(err, ErrTooManyRedirects) {
		t.Errorf("Expected ErrTooManyRedirects, got %v", err)
	}
	// The first request is redirects=1, then 5 more redirects before failing on the 6th
	// Wait, SafeRedirectPolicy is called *before* making the redirect. 
	// The 5th redirect (via len = 5) is allowed, it responds with a redirect.
	// The 6th redirect (via len = 6) is blocked by CheckRedirect.
	// So the server sees 6 requests in total (initial + 5 successful redirects).
	if redirects != 6 {
		t.Errorf("Expected exactly 6 requests (initial + 5 redirects), got %d", redirects)
	}
}

func TestHTTPProxyBypass(t *testing.T) {
	// Moved to transport_test.go
}
