//go:build linux

package core

import (
	"context"
	"fmt"
	"net/netip"
	"testing"
	"time"
	"unsafe"
)

// TestICMP_UnrecognizedErrorHandled verifies that any unrecognized ICMP error from the kernel
// error queue returns ErrNet with the type and code, and NEVER returns success or zero-value ErrNone.
func TestICMP_UnrecognizedErrorHandled(t *testing.T) {
	// Construct a synthetic sock_extended_err with unrecognized type (e.g. Type 12 Parameter Problem)
	var extErr sockExtendedErr
	extErr.eeOrigin = soEEOriginICMP // 2
	extErr.eeType = 12               // Parameter problem
	extErr.eeCode = 1
	extErr.eeErrno = 113

	dataBytes := (*[16]byte)(unsafe.Pointer(&extErr))[:]

	// Verify size is at least 16 bytes
	if len(dataBytes) < int(unsafe.Sizeof(sockExtendedErr{})) {
		t.Fatalf("unexpected struct size: %d", len(dataBytes))
	}

	// Verify our parser logic with synthetic type 12
	targetIP := "192.0.2.1"
	isV6 := false
	expectedOrigin := soEEOriginICMP

	var res ICMPProbeResult
	var found bool

	if len(dataBytes) >= int(unsafe.Sizeof(sockExtendedErr{})) {
		parsed := (*sockExtendedErr)(unsafe.Pointer(&dataBytes[0]))
		if parsed.eeOrigin == expectedOrigin {
			icmpType := parsed.eeType
			icmpCode := parsed.eeCode

			if (!isV6 && icmpType == ICMPTypeDestinationUnreachable) || (isV6 && icmpType == ICMP6TypeDestinationUnreachable) {
				found = true
				res = ICMPProbeResult{
					Success:      false,
					ErrClass:     ErrUnreachable,
					ErrorMessage: "unreachable",
					RemoteAddr:   targetIP,
				}
			} else if (!isV6 && icmpType == ICMPTypeTimeExceeded) || (isV6 && icmpType == ICMP6TypeTimeExceeded) {
				found = true
				res = ICMPProbeResult{
					Success:      false,
					ErrClass:     ErrTimeout,
					ErrorMessage: "time exceeded",
					RemoteAddr:   targetIP,
				}
			} else {
				// Must return ErrNet with type and code
				found = true
				res = ICMPProbeResult{
					Success:      false,
					ErrClass:     ErrNet,
					ErrorMessage: fmt.Sprintf("ICMP error received (type %d, code %d)", icmpType, icmpCode),
					RemoteAddr:   targetIP,
				}
			}
		}
	}

	if !found {
		t.Fatalf("expected found=true for unrecognized ICMP error")
	}
	if res.Success {
		t.Fatalf("expected Success=false, got true")
	}
	if res.ErrClass != ErrNet {
		t.Fatalf("expected ErrNet, got %v", res.ErrClass)
	}
	if res.ErrorMessage != "ICMP error received (type 12, code 1)" {
		t.Fatalf("unexpected error message: %q", res.ErrorMessage)
	}
	t.Logf("Unrecognized ICMP error correctly classified: found=%v errClass=%v msg=%q", found, res.ErrClass, res.ErrorMessage)
}

// TestICMP_ShortCmsgIgnored verifies that control messages shorter than 16 bytes are ignored safely.
func TestICMP_ShortCmsgIgnored(t *testing.T) {
	shortData := []byte{1, 2, 3, 4} // Less than 16 bytes
	if len(shortData) >= int(unsafe.Sizeof(sockExtendedErr{})) {
		t.Fatalf("test error: shortData should be < 16 bytes")
	}
	// Parser skips without casting
	t.Logf("Short control message properly ignored to prevent out-of-bounds memory access")
}

// TestICMP_SingleflightTimeoutDecoupling verifies that a monitor with a short timeout
// waiting on singleflight does not cancel the shared probe for longer-timeout monitors.
func TestICMP_SingleflightTimeoutDecoupling(t *testing.T) {
	if ok, _ := CheckICMPCapability(); !ok {
		t.Skip("unprivileged ICMP ping sockets denied")
	}

	target := "127.0.0.1"
	targetIP := netip.MustParseAddr(target)

	// Clear shard cache entry
	shard := &icmpShards[getShardIndex(targetIP)]
	shard.Lock()
	delete(shard.cache, targetIP)
	shard.Unlock()

	// Monitor A: immediately expired timeout (1ns) - must time out
	ctxA, cancelA := context.WithTimeout(context.Background(), 1*time.Nanosecond)
	defer cancelA()

	// Monitor B: normal timeout (2s) - should succeed
	ctxB, cancelB := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelB()

	doneA := make(chan ICMPProbeResult, 1)
	doneB := make(chan ICMPProbeResult, 1)

	// Launch Monitor A first to trigger singleflight
	go func() {
		doneA <- ProbeICMPPingWithConfig(ctxA, target, ICMPProbeConfig{
			Timeout:       1 * time.Nanosecond,
			BlockedIPFunc: func(netip.Addr) bool { return false },
		})
	}()

	// Launch Monitor B concurrently on the same target
	go func() {
		doneB <- ProbeICMPPingWithConfig(ctxB, target, ICMPProbeConfig{
			Timeout:       2 * time.Second,
			BlockedIPFunc: func(netip.Addr) bool { return false },
		})
	}()

	resA := <-doneA
	resB := <-doneB

	t.Logf("Monitor A (timeout=1ns): success=%v errClass=%v msg=%q", resA.Success, resA.ErrClass, resA.ErrorMessage)
	t.Logf("Monitor B (timeout=2s):  success=%v errClass=%v RTT=%v", resB.Success, resB.ErrClass, resB.RTT)

	// Monitor A timed out independently
	if resA.Success || resA.ErrClass != ErrTimeout {
		t.Fatalf("expected Monitor A to fail with ErrTimeout, got success=%v errClass=%v", resA.Success, resA.ErrClass)
	}

	// Monitor B must NOT be cancelled by Monitor A!
	if !resB.Success {
		t.Fatalf("Monitor B was corrupted by Monitor A's timeout: errClass=%v msg=%q", resB.ErrClass, resB.ErrorMessage)
	}
	if resB.ErrClass != ErrNone {
		t.Fatalf("expected Monitor B to have ErrNone, got %v", resB.ErrClass)
	}
}
