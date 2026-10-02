package core

import (
	"bytes"
	"context"
	"net"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"testing/iotest"
	"time"
)

// Helper to provide NewTestExecutor inline for tests
func NewTestExecutor() *Executor {
	d := &net.Dialer{}
	s, c := NewTransports(d, nil)
	return &Executor{
		Dialer:          d,
		SteadyTransport: s,
		ColdTransport:   c,
		PoP:             "test-pop",
	}
}

func TestHashCheckID(t *testing.T) {
	id1 := HashCheckID("mon1", 100, RolePrimary, "popA")
	id2 := HashCheckID("mon1", 100, RolePrimary, "popA")
	id3 := HashCheckID("mon1", 101, RolePrimary, "popA")

	if id1 != id2 {
		t.Errorf("CheckID must be deterministic")
	}
	if id1 == id3 {
		t.Errorf("CheckID must differ for different slots")
	}
}

func TestProbePhase3Constraints(t *testing.T) {
	ex := NewTestExecutor()

	// C8: Keyword Streaming (and one-byte reads)
	t.Run("C8-Keywords", func(t *testing.T) {
		// Use streamSearch directly to test one-byte readers
		reader := iotest.OneByteReader(bytes.NewReader([]byte("start of file. keyword is here")))
		found, _ := streamSearch(reader, "keyword", 1024)
		if !found {
			t.Errorf("Expected keyword to be found with one-byte reader")
		}

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Write([]byte("start of file. key"))
			w.(http.Flusher).Flush()
			w.Write([]byte("word is here"))
		}))
		defer srv.Close()

		mon := &Monitor{URL: srv.URL, TimeoutMs: 3000, Keyword: "keyword"}
		res := ex.RunCheck(context.Background(), mon, ModeSteady, RolePrimary, 0)
		
		if res.ErrClass != ErrNone {
			t.Errorf("Expected keyword to be found, got %s", res.ErrClass)
		}
	})

	// C9: Range Headers for Cold Checks
	t.Run("C9-Range", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Header.Get("Range") != "bytes=0-0" {
				t.Errorf("Expected Range header bytes=0-0, got %s", r.Header.Get("Range"))
			}
			w.WriteHeader(206)
		}))
		defer srv.Close()

		mon := &Monitor{URL: srv.URL, TimeoutMs: 3000, ExpectedStatus: []int{200}}
		res := ex.RunCheck(context.Background(), mon, ModeCold, RolePrimary, 0)
		
		if res.ErrClass != ErrNone {
			t.Errorf("Expected pass even with ExpectedStatus:200, got %s", res.ErrClass)
		}
		if !res.RangeHonored {
			t.Errorf("Expected RangeHonored true")
		}
	})

	// C7: BLOCKED (WAF Handling)
	t.Run("C7-Blocked", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(429)
		}))
		defer srv.Close()

		mon := &Monitor{URL: srv.URL, TimeoutMs: 3000}
		res := ex.RunCheck(context.Background(), mon, ModeSteady, RolePrimary, 0)
		
		if res.ErrClass != ErrBlocked {
			t.Errorf("Expected ErrBlocked, got %s", res.ErrClass)
		}

		monExpected := &Monitor{URL: srv.URL, TimeoutMs: 3000, ExpectedStatus: []int{429}}
		resExpected := ex.RunCheck(context.Background(), monExpected, ModeSteady, RolePrimary, 0)
		
		if resExpected.ErrClass != ErrNone {
			t.Errorf("Expected ErrNone (status 429 expected), got %s", resExpected.ErrClass)
		}
	})

	// C10: IP/DEGRADED (Real Dial)
	t.Run("C10-IP-Degraded", func(t *testing.T) {
		// Only run if localhost resolves to both IPv4 and IPv6 to test fallback
		ips, _ := net.DefaultResolver.LookupIP(context.Background(), "ip", "localhost")
		if len(ips) < 2 {
			t.Skip("Skipping C10: localhost does not resolve to multiple IPs")
		}

		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
		}))
		defer srv.Close()

		// Server listens on IPv4 loopback (127.0.0.1). Dialing "localhost" will try ::1 first, fail, and fallback to 127.0.0.1.
		_, port, _ := net.SplitHostPort(srv.Listener.Addr().String())
		mon := &Monitor{URL: "http://localhost:" + port, TimeoutMs: 3000}
		res := ex.RunCheck(context.Background(), mon, ModeSteady, RolePrimary, 0)
		
		if res.ErrClass != ErrDegraded {
			t.Errorf("Expected ErrDegraded due to IPv6 fallback, got %s", res.ErrClass)
		}
	})

	// C11: Redirects (5 pass, 6 fail)
	t.Run("C11-Redirects", func(t *testing.T) {
		chain := func(n int) *httptest.Server {
			return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				i, _ := strconv.Atoi(r.URL.Query().Get("i"))
				if i < n { 
					http.Redirect(w, r, "/?i="+strconv.Itoa(i+1), 302)
					return 
				}
				w.WriteHeader(200)
			}))
		}

		// 5 passes
		srv5 := chain(5)
		defer srv5.Close()
		mon5 := &Monitor{URL: srv5.URL, TimeoutMs: 3000}
		res5 := ex.RunCheck(context.Background(), mon5, ModeSteady, RolePrimary, 0)
		if res5.ErrClass != ErrNone {
			t.Errorf("Expected ErrNone for 5 redirects, got %s", res5.ErrClass)
		}

		// 6 fails
		srv6 := chain(6)
		defer srv6.Close()
		mon6 := &Monitor{URL: srv6.URL, TimeoutMs: 3000}
		res6 := ex.RunCheck(context.Background(), mon6, ModeSteady, RolePrimary, 0)
		if res6.ErrClass != ErrRedirect {
			t.Errorf("Expected ErrRedirect for 6 redirects, got %s", res6.ErrClass)
		}
	})

	// S8: SSRF proper (Header Cap & Slow-drip body)
	t.Run("S8-Header-Cap", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			// Write massive headers
			for i := 0; i < 70000; i++ {
				w.Header().Add("X-Massive", "a")
			}
			w.WriteHeader(200)
		}))
		defer srv.Close()
		mon := &Monitor{URL: srv.URL, TimeoutMs: 3000}
		res := ex.RunCheck(context.Background(), mon, ModeSteady, RolePrimary, 0)
		if res.ErrClass != ErrNet { // HTTP client fails on giant headers
			t.Errorf("Expected ErrNet (header cap), got %s", res.ErrClass)
		}
	})

	t.Run("S8-Slow-Drip", func(t *testing.T) {
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.WriteHeader(200)
			w.(http.Flusher).Flush()
			time.Sleep(2 * time.Second)
			w.Write([]byte("done"))
		}))
		defer srv.Close()
		mon := &Monitor{URL: srv.URL, TimeoutMs: 1000} // 1s timeout
		res := ex.RunCheck(context.Background(), mon, ModeSteady, RolePrimary, 0)
		if res.ErrClass != ErrSlow {
			t.Errorf("Expected ErrSlow, got %s", res.ErrClass)
		}
	})

	// S8 SSRF Zone & Loopback
	t.Run("S8-SSRF-Protection", func(t *testing.T) {
		prodEx := NewExecutor(nil, "pop1")
		mon := &Monitor{URL: "http://127.0.0.1:22", TimeoutMs: 3000}
		res := prodEx.RunCheck(context.Background(), mon, ModeSteady, RolePrimary, 0)
		if res.ErrClass != ErrConfig {
			t.Errorf("Expected ErrConfig for SSRF probe, got %s", res.ErrClass)
		}
	})

	// S6: HTTP_PROXY bypass
	t.Run("S6-Proxy-Bypass", func(t *testing.T) {
		listener, err := net.Listen("tcp", "127.0.0.1:0")
		if err != nil {
			t.Fatal(err)
		}
		defer listener.Close()

		accepted := make(chan bool, 1)
		go func() {
			conn, err := listener.Accept()
			if err == nil {
				conn.Close()
				accepted <- true
			}
		}()

		t.Setenv("HTTP_PROXY", "http://"+listener.Addr().String())
		prodEx := NewTestExecutor() // uses NewTransports which should ignore HTTP_PROXY
		
		// Attempt to request an invalid host
		mon := &Monitor{URL: "http://target.invalid", TimeoutMs: 1000}
		prodEx.RunCheck(context.Background(), mon, ModeSteady, RolePrimary, 0)
		
		select {
		case <-accepted:
			t.Errorf("Expected proxy listener to never accept connection, but it did")
		case <-time.After(100 * time.Millisecond):
			// Passed
		}
	})
	
	// S5: ICMP pre-check
	// Checked via netsec blocklist in RunCheck ICMP mode.
	t.Run("S5-ICMP-Blocked", func(t *testing.T) {
		prodEx := NewTestExecutor()
		mon := &Monitor{URL: "127.0.0.1", TimeoutMs: 3000, Type: "icmp"}
		res := prodEx.RunCheck(context.Background(), mon, ModeSteady, RolePrimary, 0)
		if res.ErrClass != ErrConfig {
			t.Errorf("Expected ErrConfig for loopback ICMP, got %s", res.ErrClass)
		}
	})

	t.Run("ToEvent-Mappings", func(t *testing.T) {
		tests := []struct {
			class ErrClass
			ok    bool
		}{
			{ErrNone, true},
			{ErrDegraded, true},
			{ErrBlocked, false},
			{ErrTimeout, false},
			{ErrStatus, false},
		}

		for _, tc := range tests {
			res := CheckResult{ErrClass: tc.class, CheckRole: RolePrimary, PoP: "pop1"}
			ev := res.ToEvent("asn1")
			if ev.Ok != tc.ok {
				t.Errorf("Class %s: expected Ok=%v, got %v", tc.class, tc.ok, ev.Ok)
			}
			if ev.ErrClass != tc.class {
				t.Errorf("Class %s: expected mapped class to match, got %s", tc.class, ev.ErrClass)
			}
			if ev.ASN != "asn1" {
				t.Errorf("Expected ASN to be mapped")
			}
		}
	})
}
