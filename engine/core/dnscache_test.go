package core

import (
	"context"
	"fmt"
	"net"
	"net/netip"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func mockResolver(addrs []string, err error) func(context.Context, string) ([]netip.Addr, error) {
	return func(ctx context.Context, host string) ([]netip.Addr, error) {
		if err != nil {
			return nil, err
		}
		var res []netip.Addr
		for _, a := range addrs {
			res = append(res, netip.MustParseAddr(a))
		}
		return res, nil
	}
}

func TestDNSCacheBasic(t *testing.T) {
	mockAddrs := []string{"192.0.2.1", "192.0.2.2"}
	cache := NewDNSCache(DNSCacheConfig{
		Capacity:    100,
		PositiveTTL: 10 * time.Second,
		NegativeTTL: 5 * time.Second,
	}, mockResolver(mockAddrs, nil))

	// First lookup (miss)
	addrs, cached, err := cache.Lookup("example.com", false)
	if err != nil || cached {
		t.Fatalf("expected miss with addrs, got cached=%v err=%v", cached, err)
	}
	if len(addrs) != 2 {
		t.Fatalf("expected 2 addrs, got %d", len(addrs))
	}

	// Second lookup (hit)
	addrs2, cached2, err2 := cache.Lookup("example.com", false)
	if err2 != nil || !cached2 {
		t.Fatalf("expected hit, got cached=%v err=%v", cached2, err2)
	}
	if len(addrs2) != 2 {
		t.Fatalf("expected 2 addrs on hit, got %d", len(addrs2))
	}

	// Bypass lookup
	_, cachedBypass, errBypass := cache.Lookup("example.com", true)
	if errBypass != nil || cachedBypass {
		t.Fatalf("expected bypass to ignore cache, got cached=%v", cachedBypass)
	}

	// Invalidation
	cache.Invalidate("example.com")
	_, cachedAfterInv, _ := cache.Lookup("example.com", false)
	if cachedAfterInv {
		t.Fatalf("expected miss after invalidation, got cached=%v", cachedAfterInv)
	}
}

func TestDNSCacheTTLExpiryInjectedClock(t *testing.T) {
	mockAddrs := []string{"192.0.2.1"}
	var currentTime int64 = 1000000000000 // fixed unix nanos

	cache := NewDNSCache(DNSCacheConfig{
		Capacity:    100,
		PositiveTTL: 10 * time.Second,
		NegativeTTL: 5 * time.Second,
	}, mockResolver(mockAddrs, nil))

	// Inject custom clock
	cache.now = func() int64 { return currentTime }

	// Initial lookup (miss)
	_, cached, err := cache.Lookup("ttl-test.com", false)
	if err != nil || cached {
		t.Fatalf("expected initial miss, got cached=%v err=%v", cached, err)
	}

	// Warm lookup at t=0s (hit)
	_, cachedHit, _ := cache.Lookup("ttl-test.com", false)
	if !cachedHit {
		t.Fatalf("expected cache hit at t=0s")
	}

	// Advance time by 5 seconds (< 10s TTL) (still hit)
	currentTime += int64(5 * time.Second)
	_, cachedHit5s, _ := cache.Lookup("ttl-test.com", false)
	if !cachedHit5s {
		t.Fatalf("expected cache hit at t=5s")
	}

	// Advance time by 6 seconds (total 11s > 10s TTL) (expiry miss)
	currentTime += int64(6 * time.Second)
	_, cachedHit11s, _ := cache.Lookup("ttl-test.com", false)
	if cachedHit11s {
		t.Fatalf("expected cache miss due to TTL expiry at t=11s, got hit")
	}

	if cache.Stats.Expired.Load() < 1 {
		t.Fatalf("expected Expired metric >= 1, got %d", cache.Stats.Expired.Load())
	}
}

func TestDNSCacheSingleflight(t *testing.T) {
	var resolverCalls atomic.Int64
	slowResolver := func(ctx context.Context, host string) ([]netip.Addr, error) {
		resolverCalls.Add(1)
		time.Sleep(50 * time.Millisecond)
		return []netip.Addr{netip.MustParseAddr("192.0.2.100")}, nil
	}

	cache := NewDNSCache(DNSCacheConfig{Capacity: 100}, slowResolver)

	var wg sync.WaitGroup
	workers := 200
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			addrs, _, err := cache.Lookup("singleflight-host.com", false)
			if err != nil || len(addrs) != 1 {
				t.Errorf("lookup failed: %v", err)
			}
		}()
	}
	wg.Wait()

	if calls := resolverCalls.Load(); calls != 1 {
		t.Fatalf("expected exactly 1 resolver call across %d workers, got %d", workers, calls)
	}
}

func TestDNSCacheNegativeCaching(t *testing.T) {
	nxdomainErr := &net.DNSError{Err: "no such host", Name: "nx.invalid", IsNotFound: true}
	cache := NewDNSCache(DNSCacheConfig{Capacity: 100}, mockResolver(nil, nxdomainErr))

	// Cold lookup (miss)
	_, cached1, err1 := cache.Lookup("nx.invalid", false)
	if err1 == nil || cached1 {
		t.Fatalf("expected cold miss with error, got cached=%v", cached1)
	}

	// Warm lookup (negative hit)
	_, cached2, err2 := cache.Lookup("nx.invalid", false)
	if err2 == nil || !cached2 {
		t.Fatalf("expected negative cache hit, got cached=%v err=%v", cached2, err2)
	}

	if cache.Stats.NegHits.Load() < 1 {
		t.Fatalf("expected NegHits metric >= 1, got %d", cache.Stats.NegHits.Load())
	}
}

func TestDNSCacheEviction(t *testing.T) {
	cache := NewDNSCache(DNSCacheConfig{Capacity: 64}, mockResolver([]string{"192.0.2.1"}, nil))

	// Insert 200 domains into 64-capacity cache
	for i := 0; i < 200; i++ {
		domain := fmt.Sprintf("domain-%d.com", i)
		cache.Lookup(domain, false)
	}

	if cache.Stats.Evictions.Load() == 0 {
		t.Fatalf("expected evictions under capacity pressure, got %d", cache.Stats.Evictions.Load())
	}
}

func BenchmarkDNSCacheLookup(b *testing.B) {
	cache := NewDNSCache(DNSCacheConfig{Capacity: 1000}, mockResolver([]string{"192.0.2.1"}, nil))
	cache.Lookup("benchmark.com", false) // Warm up cache

	b.ResetTimer()
	b.ReportAllocs()

	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			cache.Lookup("benchmark.com", false)
		}
	})
}

func TestGuardedDialSSRF(t *testing.T) {
	blockedAddrs := []string{
		"127.0.0.1:80",
		"169.254.169.254:80",
		"[::1]:80",
		"[::ffff:10.0.0.1]:80",
	}

	dialer := guardedDial(globalCachedDialer)
	for _, addr := range blockedAddrs {
		_, err := dialer(addr)
		if err == nil {
			t.Fatalf("expected SSRF error for %s, got nil", addr)
		}
	}
}
