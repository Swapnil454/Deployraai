package netsec

import (
	"errors"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"syscall"
)

var (
	ErrSSRFBlocked      = errors.New("ssrf: blocked destination IP")
	ErrTooManyRedirects = errors.New("too many redirects")
)

const MaxRedirects = 5

var blockedNetworks []netip.Prefix

var engineHeaders = map[string]bool{
	"User-Agent":      true,
	"Accept":          true,
	"Accept-Encoding": true,
	"Range":           true,
}

func init() {
	cidrs := []string{
		"169.254.0.0/16", // Link-local / AWS metadata
		"10.0.0.0/8",     // RFC1918
		"172.16.0.0/12",  // RFC1918
		"192.168.0.0/16", // RFC1918
		"127.0.0.0/8",    // Loopback
		"100.64.0.0/10",  // CGNAT
		"0.0.0.0/8",      // Zero
		"192.0.0.0/24",   // IETF Protocol Assignments
		"198.18.0.0/15",  // Benchmarking
		"240.0.0.0/4",    // Reserved
		"fc00::/7",       // ULA IPv6
		"fe80::/10",      // Link-local IPv6
		"64:ff9b::/96",   // NAT64
		"2002::/16",      // 6to4
		"::ffff:0:0/96",  // IPv4-mapped IPv6
		"192.0.2.0/24",   // TEST-NET-1
		"198.51.100.0/24",// TEST-NET-2
		"203.0.113.0/24", // TEST-NET-3
		"2001:db8::/32",  // Documentation
		"2001::/32",      // Teredo
		"64:ff9b:1::/48", // NAT64 Local
		"100::/64",       // Discard-Only
	}

	for _, cidr := range cidrs {
		blockedNetworks = append(blockedNetworks, netip.MustParsePrefix(cidr))
	}
}

// IsBlocked returns true if the IP address is prohibited.
func IsBlocked(ip netip.Addr) bool {
	if !ip.IsValid() {
		return true // fail closed
	}
	ip = ip.WithZone("").Unmap()
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() ||
		ip.IsMulticast() || ip.IsUnspecified() || ip.IsInterfaceLocalMulticast() || ip.IsLinkLocalMulticast() {
		return true
	}
	for _, p := range blockedNetworks {
		if p.Contains(ip) {
			return true
		}
	}
	return false
}

// controlWith allows injecting a custom block function for testing (e.g. allowing loopback)
func controlWith(blocked func(netip.Addr) bool) func(string, string, syscall.RawConn) error {
	return func(network, address string, _ syscall.RawConn) error {
		ap, err := netip.ParseAddrPort(address)
		if err != nil {
			return errors.New("ssrf: unparseable address in control hook")
		}
		if blocked(ap.Addr()) {
			return ErrSSRFBlocked
		}
		return nil
	}
}

// SSRFControl is the production hook for net.Dialer's Control function.
var SSRFControl = controlWith(IsBlocked)

// NewDialer creates a secure net.Dialer with the SSRF control hook automatically injected.
func NewDialer() *net.Dialer {
	return &net.Dialer{
		Control: SSRFControl,
	}
}

// SafeRedirectPolicy ensures that customer headers are stripped if a redirect
// crosses a domain, drops to HTTP, or changes ports.
func SafeRedirectPolicy(req *http.Request, via []*http.Request) error {
	if len(via) > MaxRedirects {
		return ErrTooManyRedirects
	}
	if len(via) == 0 {
		return nil
	}
	
	origin := via[0].URL
	crossBoundary := !strings.EqualFold(req.URL.Hostname(), origin.Hostname()) ||
		req.URL.Port() != origin.Port() ||
		(origin.Scheme == "https" && req.URL.Scheme == "http")
		
	if crossBoundary {
		for k := range req.Header {
			if !engineHeaders[http.CanonicalHeaderKey(k)] {
				req.Header.Del(k)
			}
		}
	}
	return nil
}
