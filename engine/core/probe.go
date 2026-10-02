package core

import (
	"bytes"
	"context"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/httptrace"
	"net/netip"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/your-org/uptime-engine/netsec"
)

type CheckMode string

const (
	ModeSteady CheckMode = "steady"
	ModeCold   CheckMode = "cold"
)

type HopTelemetry struct {
	IPUsed    string
	ConnectMs int
	TTFBMs    int
	DidResume bool
	Reused    bool
}

type CheckResult struct {
	MonitorID     string
	PoP           string
	Timestamp     time.Time
	ScheduledSlot int64
	CheckID       string

	CheckRole    Role
	CheckMode    CheckMode
	Ok           bool
	ErrClass     ErrClass
	HTTPStatus   int
	HopCount     int
	RangeHonored bool

	// Primary hop telemetry (for the final successful connection)
	DidResume bool
	Reused    bool
	IPUsed    string

	ConnectMs    int
	TTFBMs       int
	TotalMs      int
	WireBytesIn  int
	WireBytesOut int

	Hops []HopTelemetry
}

func (r CheckResult) ToEvent(asn string) EventCheckResult {
	return EventCheckResult{
		Role:     r.CheckRole,
		PoP:      r.PoP,
		ASN:      asn,
		Ok:       r.ErrClass.ToOk(),
		ErrClass: r.ErrClass,
	}
}

type Executor struct {
	SteadyTransport *http.Transport
	ColdTransport   *http.Transport
	Dialer          *net.Dialer
	PoP             string
}

func NewExecutor(opts *TransportOptions, pop string) *Executor {
	d := netsec.NewDialer()
	s, c := NewTransports(d, opts)
	return &Executor{
		Dialer:          d,
		SteadyTransport: s,
		ColdTransport:   c,
		PoP:             pop,
	}
}

func HashCheckID(monitorID string, slot int64, role Role, pop string) string {
	sum := sha256.Sum256([]byte(fmt.Sprintf("%s|%d|%s|%s", monitorID, slot, role, pop)))
	return hex.EncodeToString(sum[:8])
}

func (e *Executor) RunCheck(ctx context.Context, monitor *Monitor, mode CheckMode, role Role, slot int64) CheckResult {
	start := time.Now()
	res := CheckResult{
		MonitorID:     monitor.ID,
		PoP:           e.PoP,
		Timestamp:     start,
		ScheduledSlot: slot,
		CheckID:       HashCheckID(monitor.ID, slot, role, e.PoP),
		CheckRole:     role,
		CheckMode:     mode,
		ErrClass:      ErrNone,
	}

	var mu sync.Mutex
	var connectStart time.Time
	var ttfb time.Time
	var failedIPs = make(map[string]bool)
	var activeConn net.Conn
	var currentHop HopTelemetry
	var hops []HopTelemetry
	var totalIn, totalOut int
	var tcpConnected bool

	trace := &httptrace.ClientTrace{
		ConnectStart: func(network, addr string) {
			mu.Lock()
			connectStart = time.Now()
			tcpConnected = false
			mu.Unlock()
		},
		ConnectDone: func(network, addr string, err error) {
			mu.Lock()
			if err == nil {
				currentHop.ConnectMs = int(time.Since(connectStart).Milliseconds())
				tcpConnected = true
			} else {
				if !errors.Is(err, context.Canceled) && !strings.Contains(err.Error(), "canceled") && !strings.Contains(err.Error(), "unreachable") && !strings.Contains(err.Error(), "no route") {
					failedIPs[addr] = true
				}
			}
			mu.Unlock()
		},
		GotFirstResponseByte: func() {
			mu.Lock()
			ttfb = time.Now()
			if len(hops) > 0 {
				hops[len(hops)-1].TTFBMs = int(ttfb.Sub(start).Milliseconds())
			} else {
				currentHop.TTFBMs = int(ttfb.Sub(start).Milliseconds())
			}
			mu.Unlock()
		},
		GotConn: func(info httptrace.GotConnInfo) {
			mu.Lock()
			currentHop.Reused = info.Reused
			currentHop.IPUsed = info.Conn.RemoteAddr().String()
			// Reused connections skip ConnectStart/ConnectDone, so set
			// tcpConnected here so a slow reused connection is ErrSlow not ErrTimeout.
			if info.Reused {
				tcpConnected = true
			}

			// Accumulate bytes from the previous connection if there was one (redirects)
			if activeConn != nil {
				if tc := unwrapConn(activeConn); tc != nil {
					in, out := tc.GetBytes()
					totalIn += in
					totalOut += out
				}
			}
			activeConn = info.Conn

			hops = append(hops, currentHop)
			currentHop = HopTelemetry{} // reset for next hop
			mu.Unlock()
		},
		TLSHandshakeDone: func(state tls.ConnectionState, err error) {
			mu.Lock()
			if err == nil {
				currentHop.DidResume = state.DidResume
			}
			mu.Unlock()
		},
	}

	if monitor.Type == "icmp" {
		host := monitor.URL
		if addr, ok := netip.AddrFromSlice(net.ParseIP(host)); ok && netsec.IsBlocked(addr.Unmap()) {
			res.ErrClass = ErrConfig
			res.Ok = false
			return res
		}
		// ICMP logic not implemented
		res.ErrClass = ErrConfig
		res.Ok = false
		return res
	}

	timeoutMs := monitor.TimeoutMs
	if timeoutMs <= 0 {
		timeoutMs = 5000 // default 5s
	}
	if timeoutMs > 30000 {
		timeoutMs = 30000 // max 30s
	}

	ctx, cancel := context.WithTimeout(ctx, time.Duration(timeoutMs)*time.Millisecond)
	defer cancel()

	req, err := http.NewRequestWithContext(httptrace.WithClientTrace(ctx, trace), "GET", monitor.URL, nil)
	if err != nil {
		res.ErrClass = ErrNet
		res.Ok = res.ErrClass.ToOk()
		res.TotalMs = int(time.Since(start).Milliseconds())
		return res
	}
	req.Header.Set("User-Agent", "Engine/1.0")

	// C8: Range optimization for status checks
	if monitor.Keyword == "" {
		req.Header.Set("Range", "bytes=0-0")
	}

	client := &http.Client{
		Timeout:       time.Duration(timeoutMs) * time.Millisecond,
		CheckRedirect: netsec.SafeRedirectPolicy,
	}

	if mode == ModeCold {
		client.Transport = e.ColdTransport
	} else {
		client.Transport = e.SteadyTransport
	}

	resp, err := client.Do(req)

	mu.Lock()
	didConnect := tcpConnected
	mu.Unlock()

	if err != nil {
		res.ErrClass = classifyNetError(err, didConnect)
		res.Ok = res.ErrClass.ToOk()
		res.TotalMs = int(time.Since(start).Milliseconds())

		mu.Lock()
		if len(hops) > 0 {
			lastHop := hops[len(hops)-1]
			res.IPUsed = lastHop.IPUsed
			res.Reused = lastHop.Reused
			res.DidResume = lastHop.DidResume
			res.ConnectMs = lastHop.ConnectMs
			res.TTFBMs = lastHop.TTFBMs
		}
		res.Hops = hops
		res.HopCount = len(hops)
		if activeConn != nil {
			if tc := unwrapConn(activeConn); tc != nil {
				in, out := tc.GetBytes()
				totalIn += in
				totalOut += out
			}
		}
		res.WireBytesIn = totalIn
		res.WireBytesOut = totalOut
		mu.Unlock()
		return res
	}
	defer resp.Body.Close()

	mu.Lock()
	if len(hops) > 0 {
		lastHop := hops[len(hops)-1]
		res.IPUsed = lastHop.IPUsed
		res.Reused = lastHop.Reused
		res.DidResume = lastHop.DidResume
		res.ConnectMs = lastHop.ConnectMs
		res.TTFBMs = lastHop.TTFBMs
	}
	res.Hops = hops
	res.HopCount = len(hops)
	mu.Unlock()

	res.HTTPStatus = resp.StatusCode

	// Check ExpectedStatus first
	isExpected := false
	if len(monitor.ExpectedStatus) > 0 {
		for _, s := range monitor.ExpectedStatus {
			if resp.StatusCode == s {
				isExpected = true
				break
			}
			// C9: Range accepting 206 as 200
			if s == 200 && req.Header.Get("Range") != "" && resp.StatusCode == 206 {
				isExpected = true
				break
			}
		}
	} else {
		if resp.StatusCode >= 200 && resp.StatusCode < 300 {
			isExpected = true
		} else if req.Header.Get("Range") != "" && resp.StatusCode == 416 {
			isExpected = true
		}
	}

	if req.Header.Get("Range") != "" && (resp.StatusCode == 200 || resp.StatusCode == 206 || resp.StatusCode == 416) {
		res.RangeHonored = (resp.StatusCode == 206)
		if isExpected {
			res.ErrClass = ErrNone
		}
	}

	if !isExpected {
		// C10: WAF classification
		if resp.StatusCode == 403 || resp.StatusCode == 429 {
			res.ErrClass = ErrBlocked // Only if it wasn't expected
		} else {
			res.ErrClass = ErrStatus
		}
	} else {
		res.ErrClass = ErrNone
	}

	// C7: Keyword search across chunk boundaries
	if monitor.Keyword != "" && res.ErrClass == ErrNone {
		limit := monitor.KeywordMaxBytes
		if limit <= 0 {
			limit = 65536 // Default 64KB cap
		}
		found, readErr := streamSearch(resp.Body, monitor.Keyword, limit)
		if readErr != nil && !found {
			res.ErrClass = classifyNetError(readErr, didConnect)
		} else if !found {
			res.ErrClass = ErrKeyword
		}
	} else if res.ErrClass == ErrNone {
		// Drain a small amount to allow keep-alive, but cap tightly to save bandwidth
		_, readErr := io.Copy(io.Discard, io.LimitReader(resp.Body, 4096))
		if readErr != nil && readErr != io.EOF {
			res.ErrClass = classifyNetError(readErr, didConnect)
		}
	}

	mu.Lock()
	if len(failedIPs) > 0 && res.ErrClass == ErrNone {
		// Verify we failed on a different IP
		for failedIP := range failedIPs {
			// strip port for comparison
			failedHost, _, err := net.SplitHostPort(failedIP)
			if err == nil {
				usedHost, _, _ := net.SplitHostPort(res.IPUsed)
				if failedHost != usedHost {
					res.ErrClass = ErrDegraded
					break
				}
			}
		}
	}

	if activeConn != nil {
		if tc := unwrapConn(activeConn); tc != nil {
			in, out := tc.GetBytes()
			totalIn += in
			totalOut += out
		}
	}
	res.WireBytesIn = totalIn
	res.WireBytesOut = totalOut
	mu.Unlock()

	res.Ok = res.ErrClass.ToOk()
	res.TotalMs = int(time.Since(start).Milliseconds())
	return res
}

func classifyNetError(err error, didConnect bool) ErrClass {
	if errors.Is(err, netsec.ErrSSRFBlocked) {
		return ErrConfig
	}
	if errors.Is(err, netsec.ErrTooManyRedirects) {
		return ErrRedirect
	}

	// Check DNS errors FIRST. *net.DNSError implements net.Error.Timeout(),
	// so a DNS resolution timeout would be misclassified as ErrTimeout/ErrSlow
	// if we check the timeout branch first.
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		if dnsErr.IsNotFound {
			return ErrNet // NXDOMAIN is a target failure, not local resolver failure
		}
		return ErrDNS // includes DNS timeouts, SERVFAIL, etc.
	}
	if strings.Contains(err.Error(), "no such host") {
		return ErrNet
	}

	isTimeout := false
	if errors.Is(err, context.DeadlineExceeded) {
		isTimeout = true
	} else {
		// Use errors.As to see wrapped net.Error (plain type assertion misses wrapped errors).
		// Note: TLS handshake timeouts reach here with didConnect=true (TCP succeeded),
		// so they correctly return ErrSlow rather than ErrTimeout.
		var netErr net.Error
		if errors.As(err, &netErr) && netErr.Timeout() {
			isTimeout = true
		}
	}
	if isTimeout {
		if didConnect {
			return ErrSlow
		}
		return ErrTimeout
	}

	if errors.Is(err, context.Canceled) {
		return ErrCanceled
	}

	// TLS errors
	var certErr *tls.CertificateVerificationError
	var x509Err x509.UnknownAuthorityError
	var recErr tls.RecordHeaderError
	if errors.As(err, &certErr) || errors.As(err, &x509Err) || errors.As(err, &recErr) {
		return ErrTLS
	}
	if strings.Contains(err.Error(), "tls:") {
		return ErrTLS
	}


	if errors.Is(err, syscall.ECONNREFUSED) {
		return ErrRefused
	}
	// Fallback for Windows where ECONNREFUSED might not unwrap perfectly
	if strings.Contains(err.Error(), "connection refused") || strings.Contains(err.Error(), "No connection could be made") {
		return ErrRefused
	}

	return ErrNet
}

func streamSearch(r io.Reader, keyword string, limit int64) (bool, error) {
	kw := []byte(keyword)
	overlap := len(kw) - 1
	if overlap < 0 {
		return true, nil // empty keyword
	}
	buf := make([]byte, 4096)
	var trailing []byte
	var bytesRead int64

	for {
		n, err := r.Read(buf)
		if n > 0 {
			bytesRead += int64(n)
			chunk := buf[:n]
			var searchBuf []byte
			if len(trailing) > 0 {
				searchBuf = append(trailing, chunk...)
			} else {
				searchBuf = chunk
			}

			if bytes.Contains(searchBuf, kw) {
				return true, nil
			}
			if bytesRead >= limit {
				return false, nil
			}

			if len(searchBuf) > overlap {
				trailing = append(trailing[:0], searchBuf[len(searchBuf)-overlap:]...)
			} else {
				trailing = append(trailing[:0], searchBuf...)
			}
		}
		if err != nil {
			if err == io.EOF {
				return false, nil
			}
			return false, err
		}
	}
}
func unwrapConn(c net.Conn) *TrackedConn {
	if tlsConn, ok := c.(*tls.Conn); ok {
		c = tlsConn.NetConn()
	}
	if tc, ok := c.(*TrackedConn); ok {
		return tc
	}
	return nil
}
