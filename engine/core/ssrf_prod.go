//go:build !loadtest

package core

import (
	"context"
	"net"
)

var TLSInsecureSkipVerify bool = false

func resolveHost(ctx context.Context, host string) ([]net.IP, error) {
	return net.DefaultResolver.LookupIP(ctx, "ip", host)
}

func isRestrictedIP(ip net.IP) bool {
	if ip == nil {
		return true
	}
	if ip.IsLoopback() || ip.IsPrivate() || ip.IsLinkLocalUnicast() || ip.IsLinkLocalMulticast() || ip.IsMulticast() || ip.IsUnspecified() {
		return true
	}
	// Cloud metadata and CGNAT
	if ip.Equal(net.ParseIP("169.254.169.254")) || ip.Equal(net.ParseIP("100.100.100.200")) {
		return true
	}
	// 100.64.0.0/10 (CGNAT), 0.0.0.0/8 (Current network)
	if ip4 := ip.To4(); ip4 != nil {
		if ip4[0] == 0 {
			return true
		}
		if ip4[0] == 100 && (ip4[1] >= 64 && ip4[1] < 128) {
			return true
		}
	}
	return false
}
