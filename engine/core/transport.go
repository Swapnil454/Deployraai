package core

import (
	"context"
	"crypto/tls"
	"fmt"
	"net"
	"net/http"
	"sync"
	"syscall"
	"time"
)

var engineCurves = []tls.CurveID{tls.X25519, tls.CurveP256}

var SteadyTLSConfig = &tls.Config{
	MinVersion:         tls.VersionTLS12,
	CurvePreferences:   engineCurves,
	ClientSessionCache: tls.NewLRUClientSessionCache(40000),
}

var ColdTLSConfig = &tls.Config{
	MinVersion:         tls.VersionTLS12,
	CurvePreferences:   engineCurves,
	ClientSessionCache: nil,
}

// TransportOptions allows injecting root CAs specifically for testing.
type TransportOptions struct {
	RootCAs *tls.Config // Just to borrow the RootCAs pool
}

// NewTransports creates the tightly bound transports for Steady and Cold checks.
// It accepts a netsec Dialer to enforce SSRF protections globally.
func NewTransports(dialer *net.Dialer, opts *TransportOptions) (*http.Transport, *http.Transport) {
	sTls := SteadyTLSConfig.Clone()
	cTls := ColdTLSConfig.Clone()

	if opts != nil && opts.RootCAs != nil {
		sTls.RootCAs = opts.RootCAs.RootCAs
		cTls.RootCAs = opts.RootCAs.RootCAs
	}

	dialCtx := func(ctx context.Context, network, addr string) (net.Conn, error) {
		c, err := dialer.DialContext(ctx, network, addr)
		if err != nil {
			return nil, err
		}
		return &TrackedConn{Conn: c}, nil
	}

	steady := &http.Transport{
		Proxy:                  nil,
		DialContext:            dialCtx,
		TLSClientConfig:        sTls,
		ForceAttemptHTTP2:      false,
		DisableKeepAlives:      false, // Steady transport reuses connections for TLS resumption
		MaxIdleConnsPerHost:    4,     // Per-host pool for high-fan-out monitor fleet
		IdleConnTimeout:        90 * time.Second,
		TLSHandshakeTimeout:    5 * time.Second,
		ResponseHeaderTimeout:  8 * time.Second,
		MaxResponseHeaderBytes: 64 << 10,
	}

	cold := steady.Clone()
	cold.TLSClientConfig = cTls
	cold.DisableKeepAlives = true // Cold transport always opens a fresh connection
	cold.MaxIdleConnsPerHost = 0

	return steady, cold
}

type TrackedConn struct {
	net.Conn
	mu       sync.Mutex
	closed   bool
	bytesIn  int
	bytesOut int
}

func (t *TrackedConn) Close() error {
	t.mu.Lock()
	if !t.closed {
		t.bytesIn, t.bytesOut = getTCPBytes(t.Conn)
		t.closed = true
	}
	t.mu.Unlock()
	return t.Conn.Close()
}

func (t *TrackedConn) GetBytes() (int, int) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.closed {
		return t.bytesIn, t.bytesOut
	}
	return getTCPBytes(t.Conn)
}

// SyscallConn implements syscall.Conn so that getTCPBytes can access the underlying fd.
func (t *TrackedConn) SyscallConn() (syscall.RawConn, error) {
	if sc, ok := t.Conn.(syscall.Conn); ok {
		return sc.SyscallConn()
	}
	return nil, fmt.Errorf("underlying connection does not implement syscall.Conn")
}
