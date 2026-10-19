package core

import (
	"context"
	"encoding/binary"
	"fmt"
	"net"
	"net/netip"
	"strings"
	"sync"
	"time"

	"github.com/your-org/uptime-engine/netsec"
	"golang.org/x/sync/singleflight"
)

// ICMP Constants (RFC 792 for IPv4, RFC 4443 for IPv6)
const (
	// IPv4 ICMP Types
	ICMPTypeEchoReply              uint8 = 0
	ICMPTypeDestinationUnreachable uint8 = 3
	ICMPTypeEchoRequest            uint8 = 8
	ICMPTypeTimeExceeded           uint8 = 11

	// IPv6 ICMPv6 Types
	ICMP6TypeDestinationUnreachable uint8 = 1
	ICMP6TypeTimeExceeded           uint8 = 3
	ICMP6TypeEchoRequest            uint8 = 128
	ICMP6TypeEchoReply              uint8 = 129

	// Destination Unreachable codes
	ICMPCodeNetUnreachable   uint8 = 0
	ICMPCodeHostUnreachable  uint8 = 1
	ICMPCodeProtoUnreachable uint8 = 2
	ICMPCodePortUnreachable  uint8 = 3
	ICMPCodeFragNeeded       uint8 = 4

	// Time Exceeded codes
	ICMPCodeTTLExceeded     uint8 = 0
	ICMPCodeFragReasmExceed uint8 = 1
)

type icmpCacheItem struct {
	result    ICMPProbeResult
	expiresAt time.Time
}

const (
	numICMPCacheShards = 64
	StandardPingBudget = 3 * time.Second
)

type icmpShard struct {
	sync.RWMutex
	cache    map[netip.Addr]icmpCacheItem
	lastPing map[netip.Addr]time.Time
}

var (
	icmpGlobalSeq   uint32
	icmpFlight      singleflight.Group
	icmpShards      [numICMPCacheShards]icmpShard
	icmpSweeperOnce sync.Once

	// MetricICMPCapabilityDenied is set to 1 if unprivileged ICMP is denied by kernel
	MetricICMPCapabilityDenied uint32
)

func init() {
	for i := 0; i < numICMPCacheShards; i++ {
		icmpShards[i].cache = make(map[netip.Addr]icmpCacheItem)
		icmpShards[i].lastPing = make(map[netip.Addr]time.Time)
	}
	startAmortizedICMPEviction()
}

func getShardIndex(addr netip.Addr) uint32 {
	b := addr.As16()
	var h uint32 = 2166136261
	for _, byteVal := range b {
		h ^= uint32(byteVal)
		h *= 16777619
	}
	return h % numICMPCacheShards
}

// ICMPProbeConfig configures options for an ICMP ping check.
type ICMPProbeConfig struct {
	Timeout       time.Duration
	TTL           int
	BlockedIPFunc func(netip.Addr) bool
}

// ICMPProbeResult encapsulates the outcome of an ICMP ping probe.
type ICMPProbeResult struct {
	Success      bool
	RTT          time.Duration
	Retried      bool
	ErrClass     ErrClass
	ErrorMessage string
	RemoteAddr   string
}

// getCachedICMP checks if a recent ping probe result exists for this target IP without heap allocations.
func getCachedICMP(addr netip.Addr) (ICMPProbeResult, bool) {
	shard := &icmpShards[getShardIndex(addr)]
	shard.RLock()
	item, ok := shard.cache[addr]
	shard.RUnlock()
	if ok && time.Now().Before(item.expiresAt) {
		return item.result, true
	}
	return ICMPProbeResult{}, false
}

// setCachedICMP saves an ICMP probe result in shard cache with zero allocations.
func setCachedICMP(addr netip.Addr, res ICMPProbeResult, ttl time.Duration) {
	shard := &icmpShards[getShardIndex(addr)]
	now := time.Now()
	shard.Lock()
	shard.cache[addr] = icmpCacheItem{
		result:    res,
		expiresAt: now.Add(ttl),
	}
	shard.Unlock()
}

// EnforcePerTargetRateLimit provides a safety valve to prevent flooding a single IP without unbounded memory growth.
func EnforcePerTargetRateLimit(addr netip.Addr, minInterval time.Duration) bool {
	shard := &icmpShards[getShardIndex(addr)]
	now := time.Now()
	shard.Lock()
	defer shard.Unlock()
	if lastTime, exists := shard.lastPing[addr]; exists {
		if now.Sub(lastTime) < minInterval {
			return false
		}
	}
	shard.lastPing[addr] = now
	return true
}

func startAmortizedICMPEviction() {
	icmpSweeperOnce.Do(func() {
		go func() {
			ticker := time.NewTicker(1 * time.Second)
			defer ticker.Stop()
			shardCursor := 0
			for range ticker.C {
				now := time.Now()
				// Sweep 8 shards per tick (all 64 shards swept every 8 seconds)
				for i := 0; i < 8; i++ {
					idx := (shardCursor + i) % numICMPCacheShards
					shard := &icmpShards[idx]
					shard.Lock()
					for k, v := range shard.cache {
						if now.After(v.expiresAt) {
							delete(shard.cache, k)
						}
					}
					for k, lastTime := range shard.lastPing {
						if now.Sub(lastTime) > 10*time.Second {
							delete(shard.lastPing, k)
						}
					}
					shard.Unlock()
				}
				shardCursor = (shardCursor + 8) % numICMPCacheShards
			}
		}()
	})
}

// CalculateICMPChecksum computes the 16-bit Internet Checksum (RFC 1071).
func CalculateICMPChecksum(data []byte) uint16 {
	var sum uint32
	length := len(data)
	for i := 0; i < length-1; i += 2 {
		sum += uint32(binary.BigEndian.Uint16(data[i : i+2]))
	}
	if length%2 == 1 {
		sum += uint32(data[length-1]) << 8
	}
	for sum > 0xffff {
		sum = (sum >> 16) + (sum & 0xffff)
	}
	return ^uint16(sum)
}

// NormalizeICMPTarget extracts a clean IP or hostname from a target string.
func NormalizeICMPTarget(rawTarget string) string {
	target := strings.TrimSpace(rawTarget)
	if strings.HasPrefix(target, "icmp://") {
		target = strings.TrimPrefix(target, "icmp://")
	}
	if idx := strings.Index(target, "/"); idx != -1 {
		target = target[:idx]
	}
	if idx := strings.Index(target, ":"); idx != -1 {
		// If IPv6 with brackets "[::1]:port", strip brackets and port
		if strings.HasPrefix(target, "[") && strings.Contains(target, "]") {
			end := strings.Index(target, "]")
			target = target[1:end]
		} else if strings.Count(target, ":") == 1 {
			target = target[:idx] // IPv4 host:port
		}
	}
	return target
}

// ResolveICMPTarget resolves target host to an unblocked IP and applies SSRF protection.
func ResolveICMPTarget(ctx context.Context, host string) (netip.Addr, *ICMPProbeResult) {
	return ResolveICMPTargetWithBlockedFunc(ctx, host, nil)
}

// ResolveICMPTargetWithBlockedFunc resolves target host to an unblocked IP with custom or default SSRF policy.
func ResolveICMPTargetWithBlockedFunc(ctx context.Context, host string, isBlocked func(netip.Addr) bool) (netip.Addr, *ICMPProbeResult) {
	if isBlocked == nil {
		isBlocked = netsec.IsBlocked
	}
	if ip, parseErr := netip.ParseAddr(host); parseErr == nil {
		if isBlocked(ip) {
			return netip.Addr{}, &ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrSSRF,
				ErrorMessage: fmt.Sprintf("SSRF: target IP %s is prohibited", ip.String()),
			}
		}
		return ip, nil
	}

	ips, lookupErr := net.DefaultResolver.LookupNetIP(ctx, "ip", host)
	if lookupErr != nil {
		errClass, errMsg := ClassifyTCPError(lookupErr)
		return netip.Addr{}, &ICMPProbeResult{
			Success:      false,
			ErrClass:     errClass,
			ErrorMessage: errMsg,
		}
	}

	// Prefer IPv4 unblocked, fall back to IPv6 unblocked
	var v4, v6 netip.Addr
	for _, candidate := range ips {
		candidate = candidate.Unmap()
		if !isBlocked(candidate) {
			if candidate.Is4() && !v4.IsValid() {
				v4 = candidate
			} else if candidate.Is6() && !v6.IsValid() {
				v6 = candidate
			}
		}
	}
	if v4.IsValid() {
		return v4, nil
	}
	if v6.IsValid() {
		return v6, nil
	}

	return netip.Addr{}, &ICMPProbeResult{
		Success:      false,
		ErrClass:     ErrSSRF,
		ErrorMessage: "SSRF: all resolved IP addresses are blocked",
	}
}

// ProbeICMPPing executes an unprivileged non-root ICMP Echo probe with Singleflight coalescing and short TTL cache.
func ProbeICMPPing(ctx context.Context, target string, timeout time.Duration) ICMPProbeResult {
	return ProbeICMPPingWithConfig(ctx, target, ICMPProbeConfig{
		Timeout: timeout,
		TTL:     64,
	})
}

// ProbeICMPPingWithConfig executes a robust, non-blocking ICMP Echo probe.
// For shared in-flight probes across concurrent monitors targeting the same IP,
// the probe flight budget is strictly capped to min(max(3s, timeout), 10s)
// (StandardPingBudget to 10s). This prevents a monitor with an extended timeout (e.g. 60s)
// from locking subsequent monitors into a prolonged, stale in-flight probe while ensuring adequate
// time for a full 2-echo retry sequence.
func ProbeICMPPingWithConfig(ctx context.Context, rawTarget string, cfg ICMPProbeConfig) ICMPProbeResult {
	target := NormalizeICMPTarget(rawTarget)

	timeout := cfg.Timeout
	if timeout <= 0 {
		timeout = 2 * time.Second
	}

	ctxTimeout, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	// Step 1: Resolve target IP with SSRF protection
	targetIP, failRes := ResolveICMPTargetWithBlockedFunc(ctxTimeout, target, cfg.BlockedIPFunc)
	if failRes != nil {
		return *failRes
	}
	ipStr := targetIP.String()

	// Step 2: Check short TTL cache (1.5s) using zero-allocation netip.Addr
	if cached, ok := getCachedICMP(targetIP); ok {
		return cached
	}

	// Step 3: Singleflight coalescing across all concurrent monitors targeting this IP.
	// We run the shared probe on a detached context with a budget capped to min(max(3s, timeout), 10s),
	// so a short-timeout monitor does not cancel or corrupt the probe for longer-timeout monitors,
	// while a long-timeout monitor cannot hold subsequent monitors in a stale flight.
	resCh := icmpFlight.DoChan(ipStr, func() (interface{}, error) {
		// Safety-valve rate limit: max 1 real ping per 100ms per target IP (sharded with TTL)
		if !EnforcePerTargetRateLimit(targetIP, 100*time.Millisecond) {
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrSlow,
				ErrorMessage: fmt.Sprintf("ICMP rate limit active for target %s (coalesced)", ipStr),
			}, nil
		}

		// Cap shared flight probe budget: min(max(3s, timeout), 10s).
		// This prevents a monitor with a large timeout (e.g. 60s) from starting an excessively long
		// flight that holds subsequent monitors targeting the same IP.
		probeBudget := cfg.Timeout
		if probeBudget < StandardPingBudget {
			probeBudget = StandardPingBudget
		} else if probeBudget > 10*time.Second {
			probeBudget = 10 * time.Second
		}

		sharedCtx, sharedCancel := context.WithTimeout(context.Background(), probeBudget)
		defer sharedCancel()

		sharedCfg := cfg
		sharedCfg.Timeout = probeBudget

		res := executeICMPProbePlatform(sharedCtx, targetIP, sharedCfg)
		// Cache success or definitive target errors for 1.5s
		if res.ErrClass == ErrNone || res.ErrClass == ErrUnreachable || res.ErrClass == ErrTimeout {
			setCachedICMP(targetIP, res, 1500*time.Millisecond)
		}
		return res, nil
	})

	select {
	case <-ctxTimeout.Done():
		return ICMPProbeResult{
			Success:      false,
			ErrClass:     ErrTimeout,
			ErrorMessage: "ICMP echo probe timed out waiting for in-flight response",
			RemoteAddr:   ipStr,
		}
	case r := <-resCh:
		if r.Err != nil {
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrNet,
				ErrorMessage: r.Err.Error(),
				RemoteAddr:   ipStr,
			}
		}
		res := r.Val.(ICMPProbeResult)
		// If probe RTT exceeded this specific caller's timeout, return ErrTimeout for this caller
		if res.Success && res.RTT > timeout {
			return ICMPProbeResult{
				Success:      false,
				ErrClass:     ErrTimeout,
				ErrorMessage: fmt.Sprintf("ICMP echo RTT (%v) exceeded caller timeout (%v)", res.RTT, timeout),
				RemoteAddr:   ipStr,
			}
		}
		return res
	}
}
