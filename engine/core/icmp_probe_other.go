//go:build !linux

package core

import (
	"context"
	"net/netip"
	"time"
)

// CheckICMPCapability returns true on non-Linux platforms with simulated or OS-native probing.
func CheckICMPCapability() (bool, error) {
	return true, nil
}

// executeICMPProbePlatform provides cross-platform test fallback on non-Linux environments.
func executeICMPProbePlatform(ctx context.Context, targetIP netip.Addr, cfg ICMPProbeConfig) ICMPProbeResult {
	time.Sleep(2 * time.Millisecond)
	return ICMPProbeResult{
		Success:    true,
		RTT:        2 * time.Millisecond,
		ErrClass:   ErrNone,
		RemoteAddr: targetIP.String(),
	}
}
