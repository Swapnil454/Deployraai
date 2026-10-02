//go:build !loadtest

package core

import (
	"context"
	"net"
	"net/netip"
	"github.com/your-org/uptime-engine/netsec"
)

var TLSInsecureSkipVerify bool = false

func resolveHost(ctx context.Context, host string) ([]net.IP, error) {
	return net.DefaultResolver.LookupIP(ctx, "ip", host)
}

func isBlockedIP(addr netip.Addr) bool {
	return netsec.IsBlocked(addr)
}
