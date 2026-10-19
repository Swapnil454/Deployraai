package core

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/netip"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/your-org/uptime-engine/netsec"
)

// Reusable single dialer to eliminate per-call allocation overhead.
var portDialer = &net.Dialer{
	Control: netsec.SSRFControl,
}

// LingerErrorCount tracks any silent failures when setting SO_LINGER{1, 0}.
var LingerErrorCount uint64

// PortProbeConfig configures options for a TCP port check.
type PortProbeConfig struct {
	Timeout       time.Duration
	GracefulClose bool                  // If true, closes via standard FIN. If false (default), forces instant RST via SO_LINGER{1, 0}.
	BlockedIPFunc func(netip.Addr) bool // defaults to netsec.IsBlocked if nil
}

// PortProbeResult encapsulates the outcome of a TCP port probe.
type PortProbeResult struct {
	Success      bool
	Latency      time.Duration
	ErrClass     ErrClass
	ErrorMessage string
	RemoteAddr   string
}

// NormalizeTCPTarget parses URLs or raw host:port targets into a clean host and port.
// Validates that port is an integer in the 1-65535 range to avoid /etc/services overhead.
func NormalizeTCPTarget(target string) (host, port string, err error) {
	target = strings.TrimSpace(target)
	if strings.HasPrefix(target, "tcp://") {
		target = strings.TrimPrefix(target, "tcp://")
	} else if strings.HasPrefix(target, "http://") {
		target = strings.TrimPrefix(target, "http://")
	} else if strings.HasPrefix(target, "https://") {
		target = strings.TrimPrefix(target, "https://")
	}
	// Strip trailing path/slash if present
	if idx := strings.Index(target, "/"); idx != -1 {
		target = target[:idx]
	}

	h, p, err := net.SplitHostPort(target)
	if err != nil {
		return "", "", fmt.Errorf("invalid target %q: must specify host:port (%w)", target, err)
	}

	portNum, err := strconv.Atoi(p)
	if err != nil || portNum < 1 || portNum > 65535 {
		return "", "", fmt.Errorf("invalid port %q: must be integer between 1 and 65535", p)
	}

	return h, p, nil
}

// ProbeTCPPort executes a TCP port probe with default zero-linger settings.
func ProbeTCPPort(ctx context.Context, rawTarget string, timeout time.Duration) PortProbeResult {
	return ProbeTCPPortWithConfig(ctx, rawTarget, PortProbeConfig{
		Timeout:       timeout,
		GracefulClose: false,
	})
}

// ProbeTCPPortWithConfig executes a high-performance non-blocking TCP port probe.
// Features:
// 1. SSRF Protection: Private, loopback, link-local, and multicast addresses are blocked.
// 2. Dual-Stack DNS & Fallback: Resolves both A and AAAA records; tries candidate IPs within deadline.
// 3. Latency Decoupling: Pure TCP handshake connect latency is measured (DNS lookup is decoupled).
// 4. Zero-Linger Teardown (Default): Sets SO_LINGER{1, 0} to send an immediate RST on Close(),
//    completely bypassing the 60s TIME_WAIT state to prevent client port exhaustion.
// 5. Graceful Close Option: Supports standard FIN teardown per-monitor when servers penalize resets.
// 6. Strict Error Classification: Distinguishes local resource exhaustion (EMFILE, EADDRNOTAVAIL, ENOBUFS),
//    temporary DNS failures (ErrDNSTemporary), and remote target errors (Refused, Timeout, Unreachable).
func ProbeTCPPortWithConfig(ctx context.Context, rawTarget string, cfg PortProbeConfig) PortProbeResult {
	host, port, err := NormalizeTCPTarget(rawTarget)
	if err != nil {
		return PortProbeResult{
			Success:      false,
			ErrClass:     ErrConfig,
			ErrorMessage: err.Error(),
		}
	}

	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	ctxTimeout, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Step 1: Resolve target IPs (dual-stack: A + AAAA) and filter out blocked SSRF addresses
	blockedFn := cfg.BlockedIPFunc
	if blockedFn == nil {
		blockedFn = netsec.IsBlocked
	}
	var candidateIPs []netip.Addr
	if ip, parseErr := netip.ParseAddr(host); parseErr == nil {
		if !blockedFn(ip) {
			candidateIPs = append(candidateIPs, ip)
		}
	} else {
		// Dual-stack DNS lookup through GlobalDNSCache (falls back to DefaultResolver if uninitialized)
		var ips []netip.Addr
		var lookupErr error
		if GlobalDNSCache != nil {
			ips, lookupErr = GlobalDNSCache.Lookup(ctxTimeout, host, false)
		} else {
			ips, lookupErr = net.DefaultResolver.LookupNetIP(ctxTimeout, "ip", host)
		}
		if lookupErr != nil {
			errClass, errMsg := ClassifyTCPError(lookupErr)
			return PortProbeResult{
				Success:      false,
				ErrClass:     errClass,
				ErrorMessage: errMsg,
			}
		}
		if len(ips) == 0 {
			return PortProbeResult{
				Success:      false,
				ErrClass:     ErrDNS,
				ErrorMessage: fmt.Sprintf("DNS resolution returned no records for %s", host),
			}
		}

		// Prefer IPv4 candidates, fall back to IPv6
		var v4List, v6List []netip.Addr
		for _, candidate := range ips {
			if !netsec.IsBlocked(candidate) {
				if candidate.Is4() {
					v4List = append(v4List, candidate)
				} else {
					v6List = append(v6List, candidate)
				}
			}
		}
		candidateIPs = append(candidateIPs, v4List...)
		candidateIPs = append(candidateIPs, v6List...)
	}

	if len(candidateIPs) == 0 {
		return PortProbeResult{
			Success:      false,
			ErrClass:     ErrSSRF,
			ErrorMessage: "SSRF: all resolved IP addresses are blocked",
		}
	}

	// Step 2: Try each candidate IP within partitioned sub-timeouts
	var lastErr error
	var lastDialAddr string
	var lastLatency time.Duration
	var activeConn net.Conn

	remainingCandidates := len(candidateIPs)
	for _, targetIP := range candidateIPs {
		dialAddr := net.JoinHostPort(targetIP.String(), port)
		lastDialAddr = dialAddr

		// Divide remaining budget fairly among remaining candidate IPs
		var candTimeout time.Duration
		if deadline, hasDeadline := ctxTimeout.Deadline(); hasDeadline {
			remaining := time.Until(deadline)
			if remaining <= 0 {
				break
			}
			candTimeout = remaining / time.Duration(remainingCandidates)
			if candTimeout < 250*time.Millisecond {
				candTimeout = remaining
			}
		} else {
			candTimeout = timeout
		}
		remainingCandidates--

		candCtx, candCancel := context.WithTimeout(ctxTimeout, candTimeout)
		connectStart := time.Now()
		dialer := &net.Dialer{
			Control: netsec.ControlWith(blockedFn),
		}
		conn, dialErr := dialer.DialContext(candCtx, "tcp", dialAddr)
		candCancel()
		lastLatency = time.Since(connectStart)

		if dialErr == nil {
			activeConn = conn
			lastErr = nil
			break
		}
		lastErr = dialErr
	}

	if lastErr != nil {
		errClass, errMsg := ClassifyTCPError(lastErr)
		return PortProbeResult{
			Success:      false,
			Latency:      lastLatency,
			ErrClass:     errClass,
			ErrorMessage: errMsg,
			RemoteAddr:   lastDialAddr,
		}
	}

	var remoteAddr string
	if activeConn != nil {
		if r := activeConn.RemoteAddr(); r != nil {
			remoteAddr = r.String()
		}

		if lastLatency <= 0 {
			lastLatency = 1 * time.Microsecond
		}

		if !cfg.GracefulClose {
			// SO_LINGER{1, 0}: Force instant RST packet generation on Close().
			// Bypasses the 60s TIME_WAIT state, preventing ephemeral port exhaustion.
			if tcpConn, ok := activeConn.(*net.TCPConn); ok {
				if lingerErr := tcpConn.SetLinger(0); lingerErr != nil {
					atomic.AddUint64(&LingerErrorCount, 1)
				}
			}
		}
		_ = activeConn.Close()
	}

	return PortProbeResult{
		Success:    true,
		Latency:    lastLatency,
		ErrClass:   ErrNone,
		RemoteAddr: remoteAddr,
	}
}

// ClassifyTCPError categorizes TCP dial errors into local resource exhaustion, DNS (temporary vs permanent), Refused, Timeout, Unreachable, and Network.
func ClassifyTCPError(err error) (ErrClass, string) {
	if err == nil {
		return ErrNone, ""
	}

	// 0. Check typed DNS sentinels: local recursor degradation / semaphore saturation is inconclusive
	if errors.Is(err, ErrDNSUnsupportedIPv6) {
		return ErrUnsupported, "host has only IPv6 records but engine lacks IPv6 route"
	}
	if errors.Is(err, ErrRecursorUnavailable) || errors.Is(err, ErrDNSLocalResource) {
		return ErrLocalResource, "local DNS recursor unavailable or semaphore saturated"
	}
	if errors.Is(err, ErrDNSDeadlineExceeded) {
		return ErrDNSTemporary, "DNS lookup deadline exceeded (authoritative timeout)"
	}

	// 1. Check DNS errors first: isolate temporary resolver failures (inconclusive) from NXDOMAIN (target error)
	var dnsErr *net.DNSError
	if errors.As(err, &dnsErr) {
		if dnsErr.IsTimeout || dnsErr.IsTemporary {
			return ErrDNSTemporary, fmt.Sprintf("DNS resolver timeout/temporary failure: %v", dnsErr)
		}
		if dnsErr.IsNotFound {
			return ErrDNS, fmt.Sprintf("DNS resolution failed (host not found): %v", dnsErr)
		}
		return ErrDNSTemporary, fmt.Sprintf("DNS resolution error: %v", dnsErr)
	}

	// 2. Check SSRF blocked error
	if errors.Is(err, netsec.ErrSSRFBlocked) {
		return ErrSSRF, "SSRF: connection to private/internal network prohibited"
	}

	// 3. Check for Local Resource Exhaustion / System errors (must never mark target DOWN)
	var sysErr syscall.Errno
	if errors.As(err, &sysErr) {
		switch sysErr {
		case syscall.EMFILE, syscall.ENFILE, syscall.EADDRNOTAVAIL, syscall.ENOBUFS, syscall.ENOMEM, syscall.EPERM, syscall.ENETUNREACH:
			return ErrLocalResource, fmt.Sprintf("local resource/routing failure (%v)", sysErr)

		// Target / Remote network errors
		case syscall.ECONNREFUSED:
			return ErrRefused, "connection refused (port closed)"
		case syscall.EHOSTUNREACH:
			return ErrUnreachable, "remote host unreachable"
		case syscall.ETIMEDOUT:
			return ErrTimeout, "connection timed out (SYN dropped or host unresponsive)"
		case syscall.ECONNRESET:
			return ErrNet, "connection reset by peer during handshake (ECONNRESET)"
		}
	}

	// 4. Check for Context / net.Error timeouts
	if errors.Is(err, context.DeadlineExceeded) || os.IsTimeout(err) {
		return ErrTimeout, "connection timed out (SYN dropped or host unresponsive)"
	}

	var netErr net.Error
	if errors.As(err, &netErr) && netErr.Timeout() {
		return ErrTimeout, "connection timed out"
	}

	// 5. Fallback string matching for wrapped OS error strings
	errMsg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(errMsg, "refused"):
		return ErrRefused, "connection refused (port closed)"
	case strings.Contains(errMsg, "timeout") || strings.Contains(errMsg, "deadline exceeded"):
		return ErrTimeout, "connection timed out"
	case strings.Contains(errMsg, "network is unreachable") || strings.Contains(errMsg, "network unreachable"):
		return ErrLocalResource, "local network unreachable"
	case strings.Contains(errMsg, "unreachable") || strings.Contains(errMsg, "no route to host"):
		return ErrUnreachable, "network or host unreachable"
	case strings.Contains(errMsg, "too many open files") || strings.Contains(errMsg, "cannot assign requested address"):
		return ErrLocalResource, fmt.Sprintf("local resource exhaustion: %v", err)
	default:
		return ErrNet, fmt.Sprintf("TCP dial error: %v", err)
	}
}
