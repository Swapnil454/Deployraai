//go:build !loadtest

package core

import (
	"context"
	"github.com/your-org/uptime-engine/netsec"
	"net"
	"net/netip"
)

var TLSInsecureSkipVerify bool = false

func resolveHost(ctx context.Context, host string) ([]net.IP, error) {
	return net.DefaultResolver.LookupIP(ctx, "ip", host)
}

func isBlockedIP(addr netip.Addr) bool {
	return netsec.IsBlocked(addr)
}
