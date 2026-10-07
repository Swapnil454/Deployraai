package core

import (
	"context"
	"errors"
	"fmt"
	"hash/maphash"
	"math"
	"net"
	"net/netip"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"golang.org/x/sync/singleflight"
)

type HostReconnectTracker struct {
	hosts sync.Map // map[string]time.Time
}

var globalHostReconnectTracker HostReconnectTracker

func (t *HostReconnectTracker) ForceHostReconnect(host string) {
	host = strings.ToLower(host)
	t.hosts.Store(host, time.Now().Add(120*time.Second))
}

func (t *HostReconnectTracker) ShouldForceReconnect(host string) bool {
	host = strings.ToLower(host)
	v, ok := t.hosts.Load(host)
	if !ok {
		return false
	}
	exp := v.(time.Time)
	if time.Now().After(exp) {
		t.hosts.Delete(host)
		return false
	}
	return true
}

func (t *HostReconnectTracker) ClearHostReconnect(host string) {
	host = strings.ToLower(host)
	t.hosts.Delete(host)
}

func (t *HostReconnectTracker) StartJanitor(ctx context.Context, every time.Duration) {
	go func() {
		ticker := time.NewTicker(every)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				now := time.Now()
				t.hosts.Range(func(key, value any) bool {
					if exp, ok := value.(time.Time); ok && now.After(exp) {
						t.hosts.Delete(key)
					}
					return true
				})
			}
		}
	}()
}

const dnsShards = 64

type DNSCacheConfig struct {
	Capacity      int           // total entries, default 50_000
	PositiveTTL   time.Duration // default 60s
	NegativeTTL   time.Duration // default 10s
	LookupTimeout time.Duration // default 3s
}

type dnsEntry struct {
	addrs      []netip.Addr // immutable once published
	negative   bool
	expiresAt  int64 // unix nanos
	lastAccess atomic.Int64
}

type dnsShard struct {
	mu sync.RWMutex
	m  map[string]*dnsEntry
	_  [64]byte
}

type DNSCacheStats struct {
	Hits, NegHits, Misses, Expired, Lookups, LookupErrors atomic.Int64
	LookupNanos, Evictions, Pruned, Invalidations         atomic.Int64
}

type DNSCache struct {
	shards   [dnsShards]dnsShard
	perShard int
	seed     maphash.Seed
	cfg      DNSCacheConfig
	now      func() int64 // unix nanos; injectable in tests
	resolve  func(ctx context.Context, host string) ([]netip.Addr, error)
	sf       singleflight.Group
	Stats    DNSCacheStats
}

func NewDNSCache(cfg DNSCacheConfig, resolve func(context.Context, string) ([]netip.Addr, error)) *DNSCache {
	if cfg.Capacity <= 0 {
		cfg.Capacity = 50_000
	}
	if cfg.PositiveTTL <= 0 {
		cfg.PositiveTTL = 60 * time.Second
	}
	if cfg.NegativeTTL <= 0 {
		cfg.NegativeTTL = 10 * time.Second
	}
	if cfg.LookupTimeout <= 0 {
		cfg.LookupTimeout = 3 * time.Second
	}
	if resolve == nil {
		resolve = func(ctx context.Context, h string) ([]netip.Addr, error) {
			return net.DefaultResolver.LookupNetIP(ctx, "ip", h)
		}
	}
	c := &DNSCache{
		perShard: max(cfg.Capacity/dnsShards, 1),
		seed:     maphash.MakeSeed(),
		cfg:      cfg,
		now:      func() int64 { return time.Now().UnixNano() },
		resolve:  resolve,
	}
	for i := range c.shards {
		c.shards[i].m = make(map[string]*dnsEntry, c.perShard/4)
	}
	return c
}

func (c *DNSCache) shardFor(host string) *dnsShard {
	return &c.shards[maphash.String(c.seed, host)%dnsShards]
}

// Lookup returns addrs, whether it was served from cache, and an error.
// The returned slice is READ-ONLY.
func (c *DNSCache) Lookup(host string, bypass bool) ([]netip.Addr, bool, error) {
	host = strings.ToLower(host)
	sh := c.shardFor(host)

	if !bypass {
		now := c.now()
		sh.mu.RLock()
		e := sh.m[host]
		sh.mu.RUnlock()
		if e != nil && now < e.expiresAt {
			e.lastAccess.Store(now)
			if e.negative {
				c.Stats.NegHits.Add(1)
				return nil, true, &net.DNSError{Err: "no such host (cached)", Name: host, IsNotFound: true}
			}
			c.Stats.Hits.Add(1)
			return e.addrs, true, nil
		}
		if e != nil {
			c.Stats.Expired.Add(1)
		}
	}

	c.Stats.Misses.Add(1)
	v, err, _ := c.sf.Do(host, func() (any, error) { return c.fill(host, sh) })
	if err != nil {
		return nil, false, err
	}
	return v.([]netip.Addr), false, nil
}

func (c *DNSCache) fill(host string, sh *dnsShard) ([]netip.Addr, error) {
	ctx, cancel := context.WithTimeout(context.Background(), c.cfg.LookupTimeout)
	defer cancel()

	start := c.now()
	addrs, err := c.resolve(ctx, host)
	c.Stats.Lookups.Add(1)
	c.Stats.LookupNanos.Add(c.now() - start)

	if err != nil {
		c.Stats.LookupErrors.Add(1)
		var de *net.DNSError
		if errors.As(err, &de) && de.IsNotFound { // NXDOMAIN only; never cache timeouts/SERVFAIL
			c.put(sh, host, &dnsEntry{negative: true, expiresAt: c.now() + int64(c.cfg.NegativeTTL)})
		}
		return nil, err
	}
	if len(addrs) == 0 {
		return nil, fmt.Errorf("dns: no addresses for %s", host)
	}
	c.put(sh, host, &dnsEntry{addrs: addrs, expiresAt: c.now() + int64(c.cfg.PositiveTTL)})
	return addrs, nil
}

func (c *DNSCache) put(sh *dnsShard, host string, e *dnsEntry) {
	now := c.now()
	e.lastAccess.Store(now)
	sh.mu.Lock()
	if _, exists := sh.m[host]; !exists && len(sh.m) >= c.perShard {
		c.evictLocked(sh, now)
	}
	sh.m[host] = e
	sh.mu.Unlock()
}

// Expired-first, else evict the least-recently-used of 8 sampled entries.
func (c *DNSCache) evictLocked(sh *dnsShard, now int64) {
	var victim string
	oldest := int64(math.MaxInt64)
	n := 0
	for k, e := range sh.m { // Go randomizes iteration start => a random sample
		if now >= e.expiresAt {
			delete(sh.m, k)
			c.Stats.Evictions.Add(1)
			return
		}
		if a := e.lastAccess.Load(); a < oldest {
			oldest, victim = a, k
		}
		if n++; n >= 8 {
			break
		}
	}
	if victim != "" {
		delete(sh.m, victim)
		c.Stats.Evictions.Add(1)
	}
}

func (c *DNSCache) Invalidate(host string) {
	host = strings.ToLower(host)
	sh := c.shardFor(host)
	sh.mu.Lock()
	delete(sh.m, host)
	sh.mu.Unlock()
	c.Stats.Invalidations.Add(1)
	globalHostReconnectTracker.ForceHostReconnect(host)
}

// StartJanitor sweeps one shard per tick (full sweep = 64 ticks).
func (c *DNSCache) StartJanitor(ctx context.Context, every time.Duration) {
	go func() {
		t := time.NewTicker(every)
		defer t.Stop()
		for i := 0; ; i++ {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				sh := &c.shards[i%dnsShards]
				now := c.now()
				sh.mu.Lock()
				for k, e := range sh.m {
					if now >= e.expiresAt {
						delete(sh.m, k)
						c.Stats.Pruned.Add(1)
					}
				}
				sh.mu.Unlock()
			}
		}
	}()
}

// ---- Dialer ----------------------------------------------------------------

type CachedDialer struct {
	Cache          *DNSCache
	Bypass         bool // true => always fresh lookup (retry / DNS-monitor client)
	Shadow         bool // true => perform shadow cache lookup, but dial fresh IP
	ConnectTimeout time.Duration
	Cohort         int  // 0 = default, 1 = classical key-share
}

func (d *CachedDialer) Dial(addr string) (net.Conn, error) {
	host, port, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}
	if _, perr := netip.ParseAddr(host); perr == nil { // IP literal
		conn, err := net.DialTimeout("tcp", addr, d.ConnectTimeout)
		if err != nil {
			return nil, err
		}
		return newTelemetryConn(conn, d.Cohort), nil
	}

	if d.Shadow {
		// Shadow mode: perform cached lookup for metrics, but dial fresh IP set
		cachedAddrs, cachedHit, _ := d.Cache.Lookup(host, false)
		freshAddrs, _, err := d.Cache.Lookup(host, true)
		if err != nil {
			return nil, err
		}
		if cachedHit && !sameAddrSet(cachedAddrs, freshAddrs) {
			d.Cache.Stats.Invalidations.Add(1) // Shadow disagreement count
		}
		return d.dialAny(freshAddrs, port)
	}

	addrs, _, err := d.Cache.Lookup(host, d.Bypass)
	if err != nil {
		return nil, err
	}
	conn, derr := d.dialAny(addrs, port)
	if derr == nil || d.Bypass {
		return conn, derr
	}
	// Cached IPs may be stale: re-resolve once, retry only if the set changed.
	d.Cache.Invalidate(host)
	fresh, _, lerr := d.Cache.Lookup(host, true)
	if lerr != nil || sameAddrSet(fresh, addrs) {
		return nil, derr
	}
	return d.dialAny(fresh, port)
}

func (d *CachedDialer) dialAny(addrs []netip.Addr, port string) (net.Conn, error) {
	n := min(len(addrs), 3)
	per := d.ConnectTimeout
	if n > 1 {
		per = d.ConnectTimeout / 2
	}
	var last error
	for i := 0; i < n; i++ {
		a := addrs[i]
		conn, err := net.DialTimeout("tcp", net.JoinHostPort(a.String(), port), per)
		if err == nil {
			return newTelemetryConn(conn, d.Cohort), nil
		}
		last = err
	}
	return nil, last
}

func sameAddrSet(a, b []netip.Addr) bool {
	if len(a) != len(b) {
		return false
	}
outer:
	for _, x := range a {
		for _, y := range b {
			if x == y {
				continue outer
			}
		}
		return false
	}
	return true
}
