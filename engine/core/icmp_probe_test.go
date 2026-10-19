package core

import (
	"context"
	"encoding/binary"
	"net/netip"
	"testing"
	"time"
)

func TestNormalizeICMPTarget(t *testing.T) {
	cases := []struct {
		input string
		want  string
	}{
		{"1.1.1.1", "1.1.1.1"},
		{"icmp://8.8.8.8", "8.8.8.8"},
		{"8.8.8.8:80", "8.8.8.8"},
		{"example.com/status", "example.com"},
		{"  9.9.9.9  ", "9.9.9.9"},
	}
	for _, tc := range cases {
		got := NormalizeICMPTarget(tc.input)
		if got != tc.want {
			t.Errorf("NormalizeICMPTarget(%q) = %q; want %q", tc.input, got, tc.want)
		}
	}
}

func TestCalculateICMPChecksum(t *testing.T) {
	// Standard RFC 792 Echo Request: 8 bytes
	// Type 8, Code 0, Checksum 0, ID 0x1234, Seq 0x0001
	pkt := []byte{
		0x08, 0x00, 0x00, 0x00,
		0x12, 0x34, 0x00, 0x01,
	}
	cs := CalculateICMPChecksum(pkt)
	binary.BigEndian.PutUint16(pkt[2:4], cs)

	// Verifying packet with its checksum gives 0 in one's complement
	verify := CalculateICMPChecksum(pkt)
	if verify != 0 {
		t.Fatalf("checksum verification failed: got 0x%04x, want 0", verify)
	}
}

func TestEnforcePerTargetRateLimit(t *testing.T) {
	addr := netip.MustParseAddr("192.0.2.1")
	minInterval := 200 * time.Millisecond

	// First ping must pass
	if !EnforcePerTargetRateLimit(addr, minInterval) {
		t.Fatalf("first ping to %s should be permitted", addr)
	}

	// Immediate second ping must be rejected by rate limiter
	if EnforcePerTargetRateLimit(addr, minInterval) {
		t.Fatalf("immediate second ping to %s should be blocked by rate limiter", addr)
	}

	// Ping to a different IP must pass independently (shard isolation)
	otherAddr := netip.MustParseAddr("192.0.2.2")
	if !EnforcePerTargetRateLimit(otherAddr, minInterval) {
		t.Fatalf("ping to different target %s should be permitted", otherAddr)
	}

	// Wait for cooldown
	time.Sleep(minInterval + 20*time.Millisecond)
	if !EnforcePerTargetRateLimit(addr, minInterval) {
		t.Fatalf("ping after cooldown to %s should be permitted", addr)
	}
}

func TestCheckICMPCapability(t *testing.T) {
	ok, err := CheckICMPCapability()
	t.Logf("CheckICMPCapability: permitted=%v err=%v", ok, err)
}

func TestICMP_SingleflightCoalescing(t *testing.T) {
	ctx := context.Background()
	target := "127.0.0.1"
	targetIP := netip.MustParseAddr(target)

	// Clear shard cache entry for test
	shard := &icmpShards[getShardIndex(targetIP)]
	shard.Lock()
	delete(shard.cache, targetIP)
	shard.Unlock()

	const concurrency = 10
	results := make([]ICMPProbeResult, concurrency)
	done := make(chan int, concurrency)

	for i := 0; i < concurrency; i++ {
		go func(idx int) {
			results[idx] = ProbeICMPPing(ctx, target, 2*time.Second)
			done <- idx
		}(i)
	}

	for i := 0; i < concurrency; i++ {
		<-done
	}

	// Verify all returned same success
	firstSuccess := results[0].Success
	for i := 1; i < concurrency; i++ {
		if results[i].Success != firstSuccess {
			t.Fatalf("goroutine %d got success=%v, want %v", i, results[i].Success, firstSuccess)
		}
	}
}

