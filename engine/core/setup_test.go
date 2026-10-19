package core

import (
	"net/netip"

	"github.com/your-org/uptime-engine/netsec"
)

var testAllowLoopback = func(addr netip.Addr) bool {
	if addr.IsLoopback() {
		return false
	}
	return netsec.IsBlocked(addr)
}

func init() {
	TLSInsecureSkipVerify = true
	if globalTLSConfig != nil {
		globalTLSConfig.InsecureSkipVerify = true
	}
	freshDialer.cfg.BlockedIPFunc = testAllowLoopback
	shadowDialer.cfg.BlockedIPFunc = testAllowLoopback
	cachedDialerClassical.cfg.BlockedIPFunc = testAllowLoopback
	freshDialerClassical.cfg.BlockedIPFunc = testAllowLoopback
	if globalCachedDialer != nil {
		globalCachedDialer.cfg.BlockedIPFunc = testAllowLoopback
	}
}

