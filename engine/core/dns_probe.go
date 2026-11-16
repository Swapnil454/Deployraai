package core

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/miekg/dns"
	"github.com/your-org/uptime-engine/netsec"
)

// DNSProbeResult encapsulates the outcome of a DNS monitor probe.
type DNSProbeResult struct {
	Success      bool
	Latency      time.Duration
	ErrClass     ErrClass
	ErrorMessage string
	Rcode        int
}

var udpBufferPool = sync.Pool{
	New: func() any {
		b := make([]byte, 2048)
		return &b
	},
}

// DNSProbeConfig configures options for direct RFC 1035 nameserver checks.
type DNSProbeConfig struct {
	Timeout       time.Duration
	BlockedIPFunc func(netip.Addr) bool
}

// resolveTargetHost resolves a host string via GlobalDNSCache or IP parse,
// filtering all returned addresses against SSRF controls.
func resolveTargetHost(ctx context.Context, host string, blockedFn func(netip.Addr) bool) (netip.Addr, error) {
	if blockedFn == nil {
		blockedFn = netsec.IsBlocked
	}
	if ip, err := netip.ParseAddr(host); err == nil {
		if blockedFn(ip.Unmap()) {
			return netip.Addr{}, netsec.ErrSSRFBlocked
		}
		return ip, nil
	}

	addrs, err := GlobalDNSCache.Lookup(ctx, host, false)
	if err != nil {
		return netip.Addr{}, err
	}

	var safeAddrs []netip.Addr
	for _, a := range addrs {
		if !blockedFn(a.Unmap()) {
			safeAddrs = append(safeAddrs, a)
		}
	}

	if len(safeAddrs) == 0 {
		return netip.Addr{}, netsec.ErrSSRFBlocked
	}

	monitorID := MonitorIDFromContext(ctx)
	primary := PickRendezvousIP(monitorID, safeAddrs)
	return primary, nil
}

// ProbeDNS executes a direct RFC 1035 check against a target nameserver (host:port).
// Nameserver hostnames are resolved through GlobalDNSCache with production SSRF validation.
func ProbeDNS(ctx context.Context, targetNameserver, queryDomain string, qType uint16, timeout time.Duration) DNSProbeResult {
	return ProbeDNSWithConfig(ctx, targetNameserver, queryDomain, qType, DNSProbeConfig{
		Timeout:       timeout,
		BlockedIPFunc: netsec.IsBlocked,
	})
}

// ProbeDNSWithConfig executes a direct RFC 1035 check with explicit configuration.
func ProbeDNSWithConfig(ctx context.Context, targetNameserver, queryDomain string, qType uint16, cfg DNSProbeConfig) DNSProbeResult {
	start := time.Now()
	timeout := cfg.Timeout
	blockedFn := cfg.BlockedIPFunc
	if blockedFn == nil {
		blockedFn = netsec.IsBlocked
	}

	target := strings.TrimSpace(targetNameserver)
	target = strings.TrimPrefix(target, "dns://")
	if !strings.Contains(target, ":") {
		target = net.JoinHostPort(target, "53")
	}
	host, port, err := net.SplitHostPort(target)
	if err != nil {
		return DNSProbeResult{
			Latency:      time.Since(start),
			ErrClass:     ErrConfig,
			ErrorMessage: fmt.Sprintf("invalid dns target: %v", err),
		}
	}

	targetIP, err := resolveTargetHost(ctx, host, blockedFn)
	if err != nil {
		return DNSProbeResult{
			Latency:      time.Since(start),
			ErrClass:     classifyNetError(err, false),
			ErrorMessage: err.Error(),
		}
	}

	dialer := netsec.NewDialerWith(blockedFn)
	dialer.Timeout = timeout

	rawConn, err := dialer.DialContext(ctx, "udp", net.JoinHostPort(targetIP.String(), port))
	if err != nil {
		return DNSProbeResult{
			Latency:      time.Since(start),
			ErrClass:     classifyNetError(err, false),
			ErrorMessage: err.Error(),
		}
	}
	defer rawConn.Close()

	conn := &dns.Conn{Conn: rawConn, UDPSize: 1232}
	if dl, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(dl)
	} else if timeout > 0 {
		_ = conn.SetDeadline(time.Now().Add(timeout))
	}

	if queryDomain == "" {
		queryDomain = "."
	}
	if qType == 0 {
		qType = dns.TypeA
	}

	msg := new(dns.Msg)
	msg.SetQuestion(dns.Fqdn(queryDomain), qType)
	msg.RecursionDesired = true
	msg.SetEdns0(1232, false)

	client := &dns.Client{
		Net:     "udp",
		Timeout: 0,
		UDPSize: 1232,
	}

	in, _, err := client.ExchangeWithConnContext(ctx, msg, conn)
	latency := time.Since(start)
	if err != nil {
		return DNSProbeResult{
			Latency:      latency,
			ErrClass:     classifyNetError(err, false),
			ErrorMessage: err.Error(),
		}
	}

	if in.Rcode != dns.RcodeSuccess && in.Rcode != dns.RcodeNameError {
		return DNSProbeResult{
			Success:      false,
			Latency:      latency,
			Rcode:        in.Rcode,
			ErrClass:     ErrDNS,
			ErrorMessage: fmt.Sprintf("dns server returned rcode %s", dns.RcodeToString[in.Rcode]),
		}
	}

	return DNSProbeResult{
		Success: true,
		Latency: latency,
		Rcode:   in.Rcode,
	}
}

// ProbeDNSMonitor executes a full DNS check for a monitor, validating DNS records against expected values.
func ProbeDNSMonitor(ctx context.Context, m *Monitor, timeout time.Duration) DNSProbeResult {
	start := time.Now()
	hostname := strings.TrimSpace(m.DNSHostname)
	if hostname == "" {
		hostname = strings.TrimSpace(m.URL)
		hostname = strings.TrimPrefix(hostname, "http://")
		hostname = strings.TrimPrefix(hostname, "https://")
		hostname = strings.TrimPrefix(hostname, "dns://")
		if idx := strings.Index(hostname, "/"); idx != -1 {
			hostname = hostname[:idx]
		}
		if idx := strings.Index(hostname, ":"); idx != -1 {
			hostname = hostname[:idx]
		}
	}
	if hostname == "" {
		return DNSProbeResult{
			Success:      false,
			Latency:      time.Since(start),
			ErrClass:     ErrConfig,
			ErrorMessage: "missing dns hostname",
		}
	}

	recordType := strings.ToUpper(strings.TrimSpace(m.DNSRecordType))
	if recordType == "" {
		recordType = "A"
	}

	var qType uint16
	switch recordType {
	case "A":
		qType = dns.TypeA
	case "AAAA":
		qType = dns.TypeAAAA
	case "CNAME":
		qType = dns.TypeCNAME
	case "MX":
		qType = dns.TypeMX
	case "NS":
		qType = dns.TypeNS
	case "TXT":
		qType = dns.TypeTXT
	case "SOA":
		qType = dns.TypeSOA
	case "PTR":
		qType = dns.TypePTR
	case "SRV":
		qType = dns.TypeSRV
	default:
		qType = dns.TypeA
	}

	resolverAddr := "8.8.8.8:53"
	if m.DNSResolverMode == "public_resolver" && strings.TrimSpace(m.DNSCustomResolverIP) != "" {
		ip := strings.TrimSpace(m.DNSCustomResolverIP)
		if !strings.Contains(ip, ":") {
			ip = net.JoinHostPort(ip, "53")
		}
		resolverAddr = ip
	}

	msg := new(dns.Msg)
	msg.SetQuestion(dns.Fqdn(hostname), qType)
	msg.RecursionDesired = true

	client := &dns.Client{
		Timeout: timeout,
		Net:     "udp",
	}

	in, rtt, err := client.ExchangeContext(ctx, msg, resolverAddr)
	if err != nil {
		if resolverAddr == "8.8.8.8:53" {
			in, rtt, err = client.ExchangeContext(ctx, msg, "1.1.1.1:53")
		}
		if err != nil {
			return DNSProbeResult{
				Success:      false,
				Latency:      time.Since(start),
				ErrClass:     classifyNetError(err, false),
				ErrorMessage: err.Error(),
			}
		}
	}

	if in.Rcode != dns.RcodeSuccess {
		return DNSProbeResult{
			Success:      false,
			Latency:      rtt,
			Rcode:        in.Rcode,
			ErrClass:     ErrDNS,
			ErrorMessage: fmt.Sprintf("dns server returned rcode %s", dns.RcodeToString[in.Rcode]),
		}
	}

	var returned []string
	for _, ans := range in.Answer {
		switch t := ans.(type) {
		case *dns.A:
			returned = append(returned, t.A.String())
		case *dns.AAAA:
			returned = append(returned, t.AAAA.String())
		case *dns.CNAME:
			returned = append(returned, strings.ToLower(strings.TrimSuffix(t.Target, ".")))
		case *dns.NS:
			returned = append(returned, strings.ToLower(strings.TrimSuffix(t.Ns, ".")))
		case *dns.MX:
			returned = append(returned, fmt.Sprintf("%d %s", t.Preference, strings.ToLower(strings.TrimSuffix(t.Mx, "."))))
		case *dns.TXT:
			returned = append(returned, strings.Join(t.Txt, ""))
		case *dns.SOA:
			returned = append(returned, strings.ToLower(strings.TrimSuffix(t.Ns, ".")))
		case *dns.PTR:
			returned = append(returned, strings.ToLower(strings.TrimSuffix(t.Ptr, ".")))
		}
	}
	if len(returned) == 0 && qType == dns.TypeNS {
		for _, ans := range in.Ns {
			if t, ok := ans.(*dns.NS); ok {
				returned = append(returned, strings.ToLower(strings.TrimSuffix(t.Ns, ".")))
			}
		}
	}

	if len(m.DNSExpectedValues) == 0 {
		if len(returned) == 0 {
			return DNSProbeResult{
				Success:      false,
				Latency:      rtt,
				ErrClass:     ErrDNS,
				ErrorMessage: fmt.Sprintf("no %s records found for %s", recordType, hostname),
			}
		}
		return DNSProbeResult{
			Success: true,
			Latency: rtt,
			Rcode:   in.Rcode,
		}
	}

	normReturned := make([]string, len(returned))
	for i, v := range returned {
		normReturned[i] = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(v), "."))
	}

	normExpected := make([]string, len(m.DNSExpectedValues))
	for i, v := range m.DNSExpectedValues {
		normExpected[i] = strings.ToLower(strings.TrimSuffix(strings.TrimSpace(v), "."))
	}

	matchMode := m.DNSMatchMode
	if matchMode == "" {
		matchMode = "exact_set"
	}

	match := false
	switch matchMode {
	case "exact_set":
		if len(normReturned) == len(normExpected) {
			sort.Strings(normReturned)
			sort.Strings(normExpected)
			match = true
			for i := range normReturned {
				if normReturned[i] != normExpected[i] {
					match = false
					break
				}
			}
		}
	case "contains":
		match = true
		for _, exp := range normExpected {
			found := false
			for _, ret := range normReturned {
				if ret == exp {
					found = true
					break
				}
			}
			if !found {
				match = false
				break
			}
		}
	case "any_match":
		for _, exp := range normExpected {
			for _, ret := range normReturned {
				if ret == exp {
					match = true
					break
				}
			}
			if match {
				break
			}
		}
	default:
		match = len(normReturned) > 0
	}

	if !match {
		return DNSProbeResult{
			Success:      false,
			Latency:      rtt,
			ErrClass:     ErrDNS,
			ErrorMessage: fmt.Sprintf("records mismatch: got %v, expected %v", normReturned, normExpected),
		}
	}

	return DNSProbeResult{
		Success: true,
		Latency: rtt,
		Rcode:   in.Rcode,
	}
}

// UDPProbeResult encapsulates the outcome of a UDP port check.
type UDPProbeResult struct {
	Success      bool
	Latency      time.Duration
	ErrClass     ErrClass
	ErrorMessage string
	Received     []byte
}

// ProbeUDP executes a UDP probe against a target host:port with SSRFControl,
// cached DNS resolution, and pooled buffer reuse.
func ProbeUDP(ctx context.Context, target string, payload []byte, timeout time.Duration) UDPProbeResult {
	start := time.Now()
	target = strings.TrimSpace(target)
	target = strings.TrimPrefix(target, "udp://")
	host, port, err := net.SplitHostPort(target)
	if err != nil {
		return UDPProbeResult{
			Latency:      time.Since(start),
			ErrClass:     ErrConfig,
			ErrorMessage: fmt.Sprintf("invalid udp target: %v", err),
		}
	}

	targetIP, err := resolveTargetHost(ctx, host, netsec.IsBlocked)
	if err != nil {
		return UDPProbeResult{
			Latency:      time.Since(start),
			ErrClass:     classifyNetError(err, false),
			ErrorMessage: err.Error(),
		}
	}

	dialer := netsec.NewDialer()
	dialer.Timeout = timeout

	conn, err := dialer.DialContext(ctx, "udp", net.JoinHostPort(targetIP.String(), port))
	if err != nil {
		return UDPProbeResult{
			Latency:      time.Since(start),
			ErrClass:     classifyNetError(err, false),
			ErrorMessage: err.Error(),
		}
	}
	defer conn.Close()

	if dl, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(dl)
	} else if timeout > 0 {
		_ = conn.SetDeadline(time.Now().Add(timeout))
	}

	if len(payload) > 0 {
		if _, werr := conn.Write(payload); werr != nil {
			return UDPProbeResult{
				Latency:      time.Since(start),
				ErrClass:     classifyNetError(werr, false),
				ErrorMessage: werr.Error(),
			}
		}
	} else {
		return UDPProbeResult{
			Success: true,
			Latency: time.Since(start),
		}
	}

	bufPtr := udpBufferPool.Get().(*[]byte)
	defer udpBufferPool.Put(bufPtr)
	buf := *bufPtr

	n, rerr := conn.Read(buf)
	if rerr != nil {
		// For UDP, if no response is expected or port answered without payload, write success is sufficient
		if len(payload) == 0 {
			return UDPProbeResult{
				Success: true,
				Latency: time.Since(start),
			}
		}
		return UDPProbeResult{
			Latency:      time.Since(start),
			ErrClass:     classifyNetError(rerr, false),
			ErrorMessage: rerr.Error(),
		}
	}

	rec := make([]byte, n)
	copy(rec, buf[:n])

	return UDPProbeResult{
		Success:  true,
		Latency:  time.Since(start),
		Received: rec,
	}
}
