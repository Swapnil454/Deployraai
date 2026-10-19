package core

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"hash/maphash"
	"math"
	"net"
	"net/netip"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/miekg/dns"
	"github.com/your-org/uptime-engine/netsec"
	"golang.org/x/sync/singleflight"
)

// ---- Host Reconnect Tracker (Backward Compatibility) ----------------------

type HostReconnectTracker struct {
	hosts sync.Map
}

var globalHostReconnectTracker HostReconnectTracker

func init() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			now := time.Now()
			globalHostReconnectTracker.hosts.Range(func(key, value any) bool {
				if exp, ok := value.(time.Time); ok && now.After(exp) {
					globalHostReconnectTracker.hosts.Delete(key)
				}
				return true
			})
		}
	}()
}

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

// ---- IP Quarantine with Comparable Key & Janitor ---------------------------

const defaultQuarantineDuration = 60 * time.Second

type quarantineKey struct {
	host string
	ip   netip.Addr
	port uint16
}

func parsePort(portStr string) uint16 {
	p, err := strconv.ParseUint(portStr, 10, 16)
	if err != nil {
		return 80
	}
	return uint16(p)
}

type quarantineSlot struct {
	key quarantineKey
	seq uint64
}

type ipQuarantineEntry struct {
	quarantinedUntil int64  // Unix nanos
	seq              uint64 // Global monotonic sequence counter
}

type IPQuarantine struct {
	mu            sync.RWMutex
	entries       map[quarantineKey]ipQuarantineEntry
	deque         []quarantineSlot
	dequeHead     int
	maxEntries    int
	duration      time.Duration
	nowNano       func() int64
	seq           uint64
	fallbackDrops uint64
}

var GlobalIPQuarantine = NewIPQuarantine(defaultQuarantineDuration)

func NewIPQuarantine(duration time.Duration) *IPQuarantine {
	if duration <= 0 {
		duration = defaultQuarantineDuration
	}
	const maxCap = 10000
	q := &IPQuarantine{
		entries:    make(map[quarantineKey]ipQuarantineEntry, 256),
		deque:      make([]quarantineSlot, 0, 512),
		dequeHead:  0,
		maxEntries: maxCap,
		duration:   duration,
		nowNano:    func() int64 { return time.Now().UnixNano() },
	}
	return q
}

func (q *IPQuarantine) StartJanitor(ctx context.Context, every time.Duration) {
	go func() {
		ticker := time.NewTicker(every)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				q.SweepExpired()
			}
		}
	}()
}

func (q *IPQuarantine) maybeCompact() {
	if len(q.deque) > 2*q.maxEntries {
		n := 0
		for i := q.dequeHead; i < len(q.deque); i++ {
			slot := q.deque[i]
			if cur, found := q.entries[slot.key]; found && cur.seq == slot.seq {
				q.deque[n] = slot
				n++
			}
		}
		for j := n; j < len(q.deque); j++ {
			q.deque[j] = quarantineSlot{}
		}
		q.deque = q.deque[:n]
		q.dequeHead = 0
	}
}

func (q *IPQuarantine) Quarantine(host string, ip netip.Addr, portStr string) {
	q.mu.Lock()
	defer q.mu.Unlock()

	now := q.nowNano()
	k := quarantineKey{host: strings.ToLower(host), ip: ip, port: parsePort(portStr)}
	until := now + int64(q.duration)

	q.seq++
	curSeq := q.seq

	if _, exists := q.entries[k]; exists {
		q.entries[k] = ipQuarantineEntry{quarantinedUntil: until, seq: curSeq}
		q.deque = append(q.deque, quarantineSlot{key: k, seq: curSeq})
		q.maybeCompact()
		return
	}

	// At cap: evict oldest valid matching slot from dequeHead
	for len(q.entries) >= q.maxEntries && q.dequeHead < len(q.deque) {
		slot := q.deque[q.dequeHead]
		q.dequeHead++
		if curEntry, found := q.entries[slot.key]; found && curEntry.seq == slot.seq {
			delete(q.entries, slot.key)
			break
		}
	}

	// Fail-safe: if deque had only stale slots and map is still at cap, evict an entry
	if len(q.entries) >= q.maxEntries {
		q.fallbackDrops++
		for staleK := range q.entries {
			delete(q.entries, staleK)
			break
		}
	}

	q.entries[k] = ipQuarantineEntry{quarantinedUntil: until, seq: curSeq}
	q.deque = append(q.deque, quarantineSlot{key: k, seq: curSeq})
	q.maybeCompact()
}

func (q *IPQuarantine) FilterUsable(host string, candidates []netip.Addr, portStr string, nowNano int64) []netip.Addr {
	q.mu.RLock()
	defer q.mu.RUnlock()

	host = strings.ToLower(host)
	port := parsePort(portStr)

	usable := make([]netip.Addr, 0, len(candidates))
	for _, ip := range candidates {
		k := quarantineKey{host: host, ip: ip, port: port}
		if entry, found := q.entries[k]; found {
			if nowNano < entry.quarantinedUntil {
				continue
			}
		}
		usable = append(usable, ip)
	}

	if len(usable) == 0 {
		return candidates
	}
	return usable
}

func (q *IPQuarantine) IsQuarantined(host string, ip netip.Addr, portStr string) bool {
	q.mu.RLock()
	defer q.mu.RUnlock()
	k := quarantineKey{host: strings.ToLower(host), ip: ip, port: parsePort(portStr)}
	entry, found := q.entries[k]
	if !found {
		return false
	}
	return q.nowNano() < entry.quarantinedUntil
}

func (q *IPQuarantine) SweepExpired() int {
	q.mu.Lock()
	defer q.mu.Unlock()
	now := q.nowNano()
	removed := 0
	for k, entry := range q.entries {
		if now >= entry.quarantinedUntil {
			delete(q.entries, k)
			removed++
		}
	}
	return removed
}

// ---- Typed Context Key for Monitor ID --------------------------------------

type monitorIDContextKeyType struct{}

var monitorIDContextKey = monitorIDContextKeyType{}

func WithMonitorID(ctx context.Context, id string) context.Context {
	return context.WithValue(ctx, monitorIDContextKey, id)
}

func MonitorIDFromContext(ctx context.Context) string {
	if v, ok := ctx.Value(monitorIDContextKey).(string); ok {
		return v
	}
	return ""
}

// ---- Zero-Alloc Stateless Rendezvous (HRW) Hashing -------------------------

func hashMonitorIP(monitorID string, ip netip.Addr) uint64 {
	var h uint64 = 14695981039346656037
	for i := 0; i < len(monitorID); i++ {
		h ^= uint64(monitorID[i])
		h *= 1099511628211
	}
	if ip.Is4() {
		b := ip.As4()
		for _, v := range b {
			h ^= uint64(v)
			h *= 1099511628211
		}
	} else {
		b := ip.As16()
		for _, v := range b {
			h ^= uint64(v)
			h *= 1099511628211
		}
	}
	return splitmix64(h)
}

func splitmix64(x uint64) uint64 {
	x += 0x9e3779b97f4a7c15
	x = (x ^ (x >> 30)) * 0xbf58476d1ce4e5b9
	x = (x ^ (x >> 27)) * 0x94d049bb133111eb
	x = x ^ (x >> 31)
	return x
}

func PickRendezvousIP(monitorID string, candidates []netip.Addr) netip.Addr {
	if len(candidates) == 0 {
		return netip.Addr{}
	}
	if len(candidates) == 1 || monitorID == "" {
		return candidates[0]
	}

	var bestIP netip.Addr
	var maxWeight uint64
	first := true

	for _, ip := range candidates {
		w := hashMonitorIP(monitorID, ip)
		if first || w > maxWeight || (w == maxWeight && ip.Compare(bestIP) > 0) {
			maxWeight = w
			bestIP = ip
			first = false
		}
	}
	return bestIP
}

func SelectStickyIP(monitorID, host, portStr string, candidates []netip.Addr, q *IPQuarantine) (netip.Addr, []netip.Addr) {
	if len(candidates) == 0 {
		return netip.Addr{}, nil
	}
	if q == nil {
		q = GlobalIPQuarantine
	}
	usable := q.FilterUsable(host, candidates, portStr, time.Now().UnixNano())
	primary := PickRendezvousIP(monitorID, usable)
	return primary, usable
}

// ---- Bounded UDP Socket Channel Pool ---------------------------------------

type udpSocketPool struct {
	server string
	conns  chan *dns.Conn
}

func newUDPSocketPool(server string, capacity int) *udpSocketPool {
	if capacity <= 0 {
		capacity = 64
	}
	return &udpSocketPool{
		server: server,
		conns:  make(chan *dns.Conn, capacity),
	}
}

func (p *udpSocketPool) get(ctx context.Context, client *dns.Client) (*dns.Conn, error) {
	select {
	case conn := <-p.conns:
		conn.UDPSize = 1232
		return conn, nil
	default:
		var d net.Dialer
		if deadline, ok := ctx.Deadline(); ok {
			d.Deadline = deadline
		} else if client.Timeout > 0 {
			d.Timeout = client.Timeout
		}
		rawConn, err := d.DialContext(ctx, "udp", p.server)
		if err != nil {
			return nil, err
		}
		return &dns.Conn{Conn: rawConn, UDPSize: 1232}, nil
	}
}

func (p *udpSocketPool) put(conn *dns.Conn) {
	if conn == nil {
		return
	}
	_ = conn.SetDeadline(time.Time{})
	conn.UDPSize = 1232
	select {
	case p.conns <- conn:
	default:
		_ = conn.Close()
	}
}

func (p *udpSocketPool) discard(conn *dns.Conn) {
	if conn != nil {
		_ = conn.Close()
	}
}

func (p *udpSocketPool) close() {
	for {
		select {
		case conn := <-p.conns:
			_ = conn.Close()
		default:
			return
		}
	}
}

// ---- Miekg DNS Resolver with Canary & Failover -----------------------------

var (
	ErrDNSLocalResource    = errors.New("dns: local concurrency semaphore saturated")
	ErrDNSUnsupportedIPv6  = errors.New("dns: host has only IPv6 AAAA records but engine host lacks IPv6 route")
	ErrRecursorUnavailable = errors.New("dns: recursor unavailable or refusing queries")
	ErrDNSDeadlineExceeded = errors.New("dns: lookup context deadline exceeded")
)

type MiekgResolverConfig struct {
	Servers             []string
	Timeout             time.Duration
	MinTTL              time.Duration
	MaxTTL              time.Duration
	NegativeNXDOMAINTTL time.Duration
	NegativeSERVFAILTTL time.Duration
	SemConcurrency      int
	DisableIPv6         bool
	CanaryDomains       []string
	CanaryInterval      time.Duration
}

type serverState struct {
	fails     atomic.Int32
	downUntil atomic.Int64
}

type recursorCanary struct {
	domains              []string
	healthy              atomic.Bool
	lastCheckedAt        atomic.Int64
	interval             time.Duration
	stopCh               chan struct{}
	nonce                atomic.Uint64
	consecutiveFails     atomic.Int32
	consecutiveSuccesses atomic.Int32
}

type MiekgResolver struct {
	cfg                  MiekgResolverConfig
	udpClient            *dns.Client
	tcpClient            *dns.Client
	sem                  chan struct{}
	pools                []*udpSocketPool
	serverStates         []serverState
	hasIPv6Cached        atomic.Bool
	lastIPv6RouteCheckAt atomic.Int64
	canary               recursorCanary
}

func NewMiekgResolver(cfg MiekgResolverConfig) *MiekgResolver {
	if len(cfg.Servers) == 0 {
		cfg.Servers = []string{"127.0.0.1:53", "127.0.0.53:53"}
	}
	if cfg.Timeout <= 0 {
		cfg.Timeout = 2 * time.Second
	}
	if cfg.MinTTL <= 0 {
		cfg.MinTTL = 30 * time.Second
	}
	if cfg.MaxTTL <= 0 {
		cfg.MaxTTL = 300 * time.Second
	}
	if cfg.NegativeNXDOMAINTTL <= 0 {
		cfg.NegativeNXDOMAINTTL = 30 * time.Second
	}
	if cfg.NegativeSERVFAILTTL <= 0 {
		cfg.NegativeSERVFAILTTL = 10 * time.Second
	}
	if cfg.SemConcurrency <= 0 {
		cfg.SemConcurrency = 500
	}
	defaultCanaries := []string{"canary-ns1.checkuptime.org.", "canary-ns2.checkuptime.org."}
	var validDomains []string
	for _, d := range cfg.CanaryDomains {
		d = strings.TrimSpace(d)
		if d != "" {
			validDomains = append(validDomains, d)
		}
	}
	if len(validDomains) == 0 {
		validDomains = defaultCanaries
	}
	cfg.CanaryDomains = validDomains

	if cfg.CanaryInterval <= 0 {
		cfg.CanaryInterval = 5 * time.Second
	}

	pools := make([]*udpSocketPool, len(cfg.Servers))
	for i, s := range cfg.Servers {
		pools[i] = newUDPSocketPool(s, 64)
	}

	r := &MiekgResolver{
		cfg: cfg,
		udpClient: &dns.Client{
			Net:     "udp",
			Timeout: 0,
			UDPSize: 1232,
		},
		tcpClient: &dns.Client{
			Net:     "tcp",
			Timeout: cfg.Timeout,
		},
		sem:          make(chan struct{}, cfg.SemConcurrency),
		pools:        pools,
		serverStates: make([]serverState, len(cfg.Servers)),
		canary: recursorCanary{
			domains:  validDomains,
			interval: cfg.CanaryInterval,
			stopCh:   make(chan struct{}),
		},
	}

	r.canary.healthy.Store(true)
	r.canary.consecutiveSuccesses.Store(2)
	r.canary.consecutiveFails.Store(0)
	r.canary.lastCheckedAt.Store(time.Now().UnixNano())

	hasRoute := !cfg.DisableIPv6 && checkIPv6Route()
	r.hasIPv6Cached.Store(hasRoute)
	r.lastIPv6RouteCheckAt.Store(time.Now().UnixNano())

	go r.canaryLoop()
	return r
}

func (r *MiekgResolver) SetCanaryHealthy(healthy bool) {
	r.canary.healthy.Store(healthy)
	if healthy {
		r.canary.consecutiveFails.Store(0)
		r.canary.consecutiveSuccesses.Store(2)
	} else {
		r.canary.consecutiveSuccesses.Store(0)
		r.canary.consecutiveFails.Store(2)
	}
}

func (r *MiekgResolver) isCanaryHealthy() bool {
	return r.canary.healthy.Load()
}

func (r *MiekgResolver) Close() {
	select {
	case <-r.canary.stopCh:
	default:
		close(r.canary.stopCh)
	}
	for _, p := range r.pools {
		p.close()
	}
}

func (r *MiekgResolver) canaryLoop() {
	ticker := time.NewTicker(r.canary.interval)
	defer ticker.Stop()

	for {
		select {
		case <-r.canary.stopCh:
			return
		case <-ticker.C:
			r.checkCanary()
		}
	}
}

func (r *MiekgResolver) checkCanary() {
	ctx, cancel := context.WithTimeout(context.Background(), 1*time.Second)
	defer cancel()

	nonce := r.canary.nonce.Add(1)
	domain := r.canary.domains[int(nonce)%len(r.canary.domains)]
	nowNano := time.Now().UnixNano()
	qName := fmt.Sprintf("c%d-%x.%s", nowNano, nonce, domain)

	msg := new(dns.Msg)
	msg.SetQuestion(dns.Fqdn(qName), dns.TypeA)
	msg.RecursionDesired = true
	msg.SetEdns0(1232, false)

	in, err := r.exchangeWithFailover(ctx, msg)
	r.canary.lastCheckedAt.Store(nowNano)

	if err == nil && in != nil && (in.Rcode == dns.RcodeSuccess || in.Rcode == dns.RcodeNameError) {
		r.canary.consecutiveFails.Store(0)
		if r.canary.consecutiveSuccesses.Add(1) >= 2 {
			r.canary.healthy.Store(true)
		}
	} else if err != nil || (in != nil && (in.Rcode == dns.RcodeServerFailure || in.Rcode == dns.RcodeRefused)) {
		r.canary.consecutiveSuccesses.Store(0)
		if r.canary.consecutiveFails.Add(1) >= 2 {
			r.canary.healthy.Store(false)
		}
	}
}

func (r *MiekgResolver) checkIPv6Active() bool {
	if r.cfg.DisableIPv6 {
		return false
	}
	now := time.Now().UnixNano()
	last := r.lastIPv6RouteCheckAt.Load()
	if now-last > int64(60*time.Second) {
		if r.lastIPv6RouteCheckAt.CompareAndSwap(last, now) {
			r.hasIPv6Cached.Store(checkIPv6Route())
		}
	}
	return r.hasIPv6Cached.Load()
}

func checkIPv6Route() bool {
	c, err := net.DialTimeout("udp6", "[2001:4860:4860::8888]:53", 100*time.Millisecond)
	if err == nil {
		_ = c.Close()
		return true
	}
	return false
}

func (r *MiekgResolver) Resolve(ctx context.Context, host string) ([]netip.Addr, time.Duration, error) {
	select {
	case r.sem <- struct{}{}:
		defer func() { <-r.sem }()
	case <-ctx.Done():
		return nil, 0, ErrDNSLocalResource
	}

	hasIPv6 := r.checkIPv6Active()

	queryCtx, queryCancel := context.WithCancel(ctx)
	defer queryCancel()

	var aAddrs, aaaaAddrs []netip.Addr
	var aMinTTL, aaaaMinTTL uint32 = math.MaxUint32, math.MaxUint32
	var aErr, aaaaErr error

	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		aAddrs, aMinTTL, aErr = r.queryRR(queryCtx, host, dns.TypeA)
		var de *net.DNSError
		if aErr != nil && errors.As(aErr, &de) && de.IsNotFound {
			queryCancel()
		}
	}()

	if hasIPv6 {
		wg.Add(1)
		go func() {
			defer wg.Done()
			aaaaAddrs, aaaaMinTTL, aaaaErr = r.queryRR(queryCtx, host, dns.TypeAAAA)
		}()
	}
	wg.Wait()

	var de *net.DNSError
	if aErr != nil && errors.As(aErr, &de) && de.IsNotFound {
		return nil, r.cfg.NegativeNXDOMAINTTL, aErr
	}

	if !hasIPv6 && len(aAddrs) == 0 && aErr == nil {
		aaaaAddrs, aaaaMinTTL, aaaaErr = r.queryRR(ctx, host, dns.TypeAAAA)
		if len(aaaaAddrs) > 0 {
			return nil, r.cfg.NegativeNXDOMAINTTL, ErrDNSUnsupportedIPv6
		}
	}

	if len(aAddrs) > 0 {
		allAddrs := aAddrs
		if len(aaaaAddrs) > 0 {
			allAddrs = append(allAddrs, aaaaAddrs...)
		}
		minChainTTL := aMinTTL
		if len(aaaaAddrs) > 0 && aaaaMinTTL < minChainTTL {
			minChainTTL = aaaaMinTTL
		}
		effectiveTTL := time.Duration(minChainTTL) * time.Second
		if effectiveTTL < r.cfg.MinTTL {
			effectiveTTL = r.cfg.MinTTL
		}
		if effectiveTTL > r.cfg.MaxTTL {
			effectiveTTL = r.cfg.MaxTTL
		}
		return allAddrs, effectiveTTL, nil
	}

	if len(aaaaAddrs) > 0 {
		effectiveTTL := time.Duration(aaaaMinTTL) * time.Second
		if effectiveTTL < r.cfg.MinTTL {
			effectiveTTL = r.cfg.MinTTL
		}
		if effectiveTTL > r.cfg.MaxTTL {
			effectiveTTL = r.cfg.MaxTTL
		}
		return aaaaAddrs, effectiveTTL, nil
	}

	if errors.Is(aErr, ErrRecursorUnavailable) || (hasIPv6 && errors.Is(aaaaErr, ErrRecursorUnavailable)) {
		return nil, 0, ErrRecursorUnavailable
	}

	if aErr != nil {
		return nil, r.cfg.NegativeSERVFAILTTL, aErr
	}
	if aaaaErr != nil {
		return nil, r.cfg.NegativeSERVFAILTTL, aaaaErr
	}
	return nil, r.cfg.NegativeNXDOMAINTTL, &net.DNSError{
		Err:        "no addresses returned for host",
		Name:       host,
		IsNotFound: true,
	}
}

func isLocalSystemResourceError(err error) bool {
	if err == nil {
		return false
	}
	var sysErr syscall.Errno
	if errors.As(err, &sysErr) {
		switch sysErr {
		case syscall.EMFILE, syscall.ENFILE, syscall.EADDRNOTAVAIL, syscall.ENOBUFS, syscall.ENOMEM, syscall.EPERM:
			return true
		}
	}
	var opErr *net.OpError
	if errors.As(err, &opErr) && opErr.Err != nil {
		return isLocalSystemResourceError(opErr.Err)
	}
	return false
}

func (r *MiekgResolver) queryRR(ctx context.Context, host string, qType uint16) ([]netip.Addr, uint32, error) {
	msg := new(dns.Msg)
	msg.SetQuestion(dns.Fqdn(host), qType)
	msg.RecursionDesired = true
	msg.SetEdns0(1232, false)

	in, err := r.exchangeWithFailover(ctx, msg)
	if err != nil {
		if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
			return nil, math.MaxUint32, err
		}
		// 1. Classify local system errors FIRST (EMFILE, ENOBUFS, ENFILE, etc.)
		if isLocalSystemResourceError(err) {
			return nil, math.MaxUint32, ErrDNSLocalResource
		}
		// 2. If canary is healthy, transport/timeout failure for this host is authoritative
		if r.isCanaryHealthy() {
			return nil, math.MaxUint32, &net.DNSError{
				Err:         "i/o timeout (authoritative)",
				Name:        host,
				IsTemporary: true,
			}
		}
		return nil, math.MaxUint32, ErrRecursorUnavailable
	}

	if in.Rcode == dns.RcodeNameError {
		return nil, math.MaxUint32, &net.DNSError{
			Err:        "no such host",
			Name:       host,
			IsNotFound: true,
		}
	}
	if in.Rcode == dns.RcodeRefused {
		return nil, math.MaxUint32, ErrRecursorUnavailable
	}
	if in.Rcode == dns.RcodeServerFailure {
		if !r.isCanaryHealthy() {
			return nil, math.MaxUint32, ErrRecursorUnavailable
		}
		return nil, math.MaxUint32, &net.DNSError{
			Err:         "dns server returned rcode SERVFAIL",
			Name:        host,
			IsTemporary: true,
		}
	}
	if in.Rcode != dns.RcodeSuccess {
		return nil, math.MaxUint32, &net.DNSError{
			Err:         fmt.Sprintf("dns server returned rcode %s", dns.RcodeToString[in.Rcode]),
			Name:        host,
			IsTemporary: true,
		}
	}

	var addrs []netip.Addr
	minTTL := uint32(math.MaxUint32)

	for _, rr := range in.Answer {
		hdr := rr.Header()
		if hdr.Ttl < minTTL {
			minTTL = hdr.Ttl
		}
		switch rec := rr.(type) {
		case *dns.A:
			if ip, ok := netip.AddrFromSlice(rec.A); ok {
				addrs = append(addrs, ip.Unmap())
			}
		case *dns.AAAA:
			if ip, ok := netip.AddrFromSlice(rec.AAAA); ok {
				addrs = append(addrs, ip.Unmap())
			}
		}
	}
	return addrs, minTTL, nil
}

func (r *MiekgResolver) exchangeWithFailover(ctx context.Context, msg *dns.Msg) (*dns.Msg, error) {
	var lastErr error
	now := time.Now().UnixNano()
	nServers := len(r.cfg.Servers)
	perServerBudget := r.cfg.Timeout / time.Duration(nServers)
	if perServerBudget < 200*time.Millisecond {
		perServerBudget = 200 * time.Millisecond
	}

	bestCooldownIdx := -1
	earliestDownUntil := int64(math.MaxInt64)

	for i, server := range r.cfg.Servers {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		downUntil := r.serverStates[i].downUntil.Load()
		if now < downUntil {
			if downUntil < earliestDownUntil {
				earliestDownUntil = downUntil
				bestCooldownIdx = i
			}
			continue
		}

		attemptTimeout := perServerBudget
		if dl, ok := ctx.Deadline(); ok {
			rem := time.Until(dl)
			if rem <= 0 {
				return nil, ctx.Err()
			}
			if rem < attemptTimeout {
				attemptTimeout = rem
			}
		}

		serverCtx, serverCancel := context.WithTimeout(ctx, attemptTimeout)
		pool := r.pools[i]
		in, err := r.exchangeOnServer(serverCtx, msg, server, pool)
		serverCancel()

		if err == nil && in != nil {
			r.serverStates[i].fails.Store(0)
			return in, nil
		}

		lastErr = err

		if ctx.Err() != nil || errors.Is(err, context.Canceled) {
			return nil, err
		}

		fails := r.serverStates[i].fails.Add(1)
		if fails >= 2 {
			r.serverStates[i].downUntil.Store(time.Now().UnixNano() + int64(5*time.Second))
		}
	}

	if lastErr == nil && bestCooldownIdx >= 0 {
		pool := r.pools[bestCooldownIdx]
		return r.exchangeOnServer(ctx, msg, r.cfg.Servers[bestCooldownIdx], pool)
	}

	return nil, fmt.Errorf("%w: %v", ErrRecursorUnavailable, lastErr)
}

func (r *MiekgResolver) exchangeOnServer(ctx context.Context, msg *dns.Msg, server string, pool *udpSocketPool) (*dns.Msg, error) {
	if err := ctx.Err(); err != nil {
		return nil, err
	}

	conn, err := pool.get(ctx, r.udpClient)
	if err != nil {
		return nil, err
	}

	in, _, err := r.udpClient.ExchangeWithConnContext(ctx, msg, conn)
	if err != nil {
		pool.discard(conn)
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		if dl, ok := ctx.Deadline(); !ok || time.Until(dl) > 10*time.Millisecond {
			tcpIn, _, tcpErr := r.tcpClient.ExchangeContext(ctx, msg, server)
			if tcpErr == nil && tcpIn != nil {
				return tcpIn, nil
			}
		}
		return nil, err
	}

	pool.put(conn)

	if in != nil && in.Truncated {
		tcpIn, _, tcpErr := r.tcpClient.ExchangeContext(ctx, msg, server)
		if tcpErr == nil && tcpIn != nil {
			return tcpIn, nil
		}
	}
	return in, nil
}

// ---- DNS Cache with Seeded Maphash & Collision Protection ------------------

const dnsShards = 64

type DNSCacheConfig struct {
	Capacity      int
	PositiveTTL   time.Duration
	NegativeTTL   time.Duration
	LookupTimeout time.Duration
	MinTTL        time.Duration
	MaxTTL        time.Duration
}

type dnsEntryKind uint8

const (
	entryPositive dnsEntryKind = iota
	entryNXDOMAIN
	entrySERVFAIL
	entryUnsupportedIPv6
)

type dnsEntry struct {
	addrs     []netip.Addr
	kind      dnsEntryKind
	expiresAt int64
}

type dnsShard struct {
	mu sync.RWMutex
	m  map[string]*dnsEntry
	_  [64]byte
}

type DNSCacheStats struct {
	Hits           int64
	Misses         int64
	Evictions      int64
	NegativeHits   int64
	CoalescedLoads int64
}

type DNSCache struct {
	cfg               DNSCacheConfig
	shards            [dnsShards]dnsShard
	seed              maphash.Seed
	resolver          DNSResolver
	sf                singleflight.Group
	hits              atomic.Int64
	misses            atomic.Int64
	evictions         atomic.Int64
	negativeHits      atomic.Int64
	coalescedLoads    atomic.Int64
	stopSweep         chan struct{}
	sweepDone         chan struct{}
	nowNano           func() int64
	lastInvalidations sync.Map
}

type DNSResolver interface {
	Resolve(ctx context.Context, host string) ([]netip.Addr, time.Duration, error)
}

type DNSResolverFunc func(ctx context.Context, host string) ([]netip.Addr, error)

func (f DNSResolverFunc) Resolve(ctx context.Context, host string) ([]netip.Addr, time.Duration, error) {
	addrs, err := f(ctx, host)
	return addrs, 0, err
}

func (c *DNSCache) shardFor(host string) *dnsShard {
	var h maphash.Hash
	h.SetSeed(c.seed)
	h.WriteString(host)
	idx := h.Sum64() % dnsShards
	return &c.shards[idx]
}

func NewDNSCache(cfg DNSCacheConfig, resolver any) *DNSCache {
	if cfg.Capacity <= 0 {
		cfg.Capacity = 1000000
	}
	if cfg.PositiveTTL <= 0 {
		cfg.PositiveTTL = 30 * time.Second
	}
	if cfg.NegativeTTL <= 0 {
		cfg.NegativeTTL = 10 * time.Second
	}
	if cfg.LookupTimeout <= 0 {
		cfg.LookupTimeout = 2 * time.Second
	}
	if cfg.MinTTL <= 0 {
		cfg.MinTTL = 30 * time.Second
	}
	if cfg.MaxTTL <= 0 {
		cfg.MaxTTL = 300 * time.Second
	}

	var res DNSResolver
	if r, ok := resolver.(DNSResolver); ok {
		res = r
	} else if f, ok := resolver.(func(context.Context, string) ([]netip.Addr, error)); ok {
		res = DNSResolverFunc(f)
	}

	c := &DNSCache{
		cfg:       cfg,
		seed:      maphash.MakeSeed(),
		resolver:  res,
		stopSweep: make(chan struct{}),
		sweepDone: make(chan struct{}),
		nowNano:   func() int64 { return time.Now().UnixNano() },
	}

	shardCap := (cfg.Capacity / dnsShards) * 11 / 10
	for i := range c.shards {
		c.shards[i].m = make(map[string]*dnsEntry, shardCap)
	}

	go c.sweepLoop()
	return c
}

func (c *DNSCache) Close() {
	close(c.stopSweep)
	<-c.sweepDone
	if closer, ok := c.resolver.(interface{ Close() }); ok {
		closer.Close()
	}
}

func (c *DNSCache) isCanaryHealthy() bool {
	if cc, ok := c.resolver.(interface{ isCanaryHealthy() bool }); ok {
		return cc.isCanaryHealthy()
	}
	// If the resolver is wrapped in a decorator or unasserted, fail safely toward
	// inconclusive (false) so timeouts hold the counter instead of causing false DOWN alerts.
	return false
}

func (c *DNSCache) Lookup(ctx context.Context, host string, bypass bool) ([]netip.Addr, error) {
	if err := ctx.Err(); err != nil {
		if !c.isCanaryHealthy() {
			return nil, fmt.Errorf("%w: %w", ErrDNSLocalResource, err)
		}
		return nil, fmt.Errorf("%w: %w", ErrDNSDeadlineExceeded, err)
	}

	if bypass {
		addrs, _, err := c.fill(ctx, host)
		if err != nil && ctx.Err() != nil {
			if !c.isCanaryHealthy() {
				return nil, fmt.Errorf("%w: %w", ErrDNSLocalResource, ctx.Err())
			}
			return nil, fmt.Errorf("%w: %w", ErrDNSDeadlineExceeded, ctx.Err())
		}
		return addrs, err
	}

	now := c.nowNano()
	shard := c.shardFor(host)

	shard.mu.RLock()
	entry, found := shard.m[host]
	if found && now < entry.expiresAt {
		shard.mu.RUnlock()
		switch entry.kind {
		case entryPositive:
			c.hits.Add(1)
			return entry.addrs, nil
		case entryNXDOMAIN:
			c.negativeHits.Add(1)
			return nil, &net.DNSError{
				Err:        "no such host",
				Name:       host,
				IsNotFound: true,
			}
		case entryUnsupportedIPv6:
			c.negativeHits.Add(1)
			return nil, ErrDNSUnsupportedIPv6
		case entrySERVFAIL:
			c.negativeHits.Add(1)
			return nil, &net.DNSError{
				Err:         "dns temporary failure (cached)",
				Name:        host,
				IsTemporary: true,
			}
		}
	}
	shard.mu.RUnlock()

	c.misses.Add(1)

	ch := c.sf.DoChan(host, func() (interface{}, error) {
		c.coalescedLoads.Add(1)
		fillCtx, fillCancel := context.WithTimeout(context.WithoutCancel(ctx), c.cfg.LookupTimeout)
		defer fillCancel()
		addrs, _, err := c.fill(fillCtx, host)
		return addrs, err
	})

	select {
	case <-ctx.Done():
		if !c.isCanaryHealthy() {
			return nil, fmt.Errorf("%w: %w", ErrDNSLocalResource, ctx.Err())
		}
		return nil, fmt.Errorf("%w: %w", ErrDNSDeadlineExceeded, ctx.Err())
	case res := <-ch:
		if res.Err != nil {
			return nil, res.Err
		}
		return res.Val.([]netip.Addr), nil
	}
}

func (c *DNSCache) fill(ctx context.Context, host string) ([]netip.Addr, time.Duration, error) {
	addrs, ttl, err := c.resolver.Resolve(ctx, host)
	now := c.nowNano()
	shard := c.shardFor(host)

	var entry *dnsEntry

	if err != nil {
		var de *net.DNSError
		if errors.As(err, &de) && de.IsNotFound {
			negTTL := ttl
			if negTTL <= 0 {
				negTTL = c.cfg.NegativeTTL
			}
			entry = &dnsEntry{
				kind:      entryNXDOMAIN,
				expiresAt: now + int64(negTTL),
			}
		} else if errors.Is(err, ErrDNSUnsupportedIPv6) {
			negTTL := ttl
			if negTTL <= 0 {
				negTTL = c.cfg.NegativeTTL
			}
			entry = &dnsEntry{
				kind:      entryUnsupportedIPv6,
				expiresAt: now + int64(negTTL),
			}
		} else if de != nil && de.IsTemporary {
			negTTL := ttl
			if negTTL <= 0 {
				negTTL = c.cfg.NegativeTTL
			}
			entry = &dnsEntry{
				kind:      entrySERVFAIL,
				expiresAt: now + int64(negTTL),
			}
		} else {
			return nil, 0, err
		}

		shard.mu.Lock()
		shard.m[host] = entry
		shard.mu.Unlock()
		return nil, ttl, err
	}

	if len(addrs) == 0 {
		return nil, 0, &net.DNSError{
			Err:        "no addresses returned for host",
			Name:       host,
			IsNotFound: true,
		}
	}

	posTTL := ttl
	if posTTL <= 0 {
		posTTL = c.cfg.PositiveTTL
	}
	if c.cfg.MinTTL > 0 && posTTL < c.cfg.MinTTL {
		posTTL = c.cfg.MinTTL
	}
	if c.cfg.MaxTTL > 0 && posTTL > c.cfg.MaxTTL {
		posTTL = c.cfg.MaxTTL
	}
	entry = &dnsEntry{
		addrs:     addrs,
		kind:      entryPositive,
		expiresAt: now + int64(posTTL),
	}

	shard.mu.Lock()
	shard.m[host] = entry
	shard.mu.Unlock()

	return addrs, posTTL, nil
}

var (
	globalInvalidationTokens = atomic.Int64{}
	lastTokenRefillSec       = atomic.Int64{}
)

func allowGlobalInvalidation() bool {
	nowSec := time.Now().Unix()
	lastSec := lastTokenRefillSec.Load()
	if nowSec != lastSec {
		if lastTokenRefillSec.CompareAndSwap(lastSec, nowSec) {
			globalInvalidationTokens.Store(50)
		}
	}
	return globalInvalidationTokens.Add(-1) >= 0
}

func (c *DNSCache) Invalidate(host string) {
	now := c.nowNano()
	if lastVal, found := c.lastInvalidations.Load(host); found {
		if now-lastVal.(int64) < int64(30*time.Second) {
			return
		}
	}
	if !allowGlobalInvalidation() {
		return
	}
	c.lastInvalidations.Store(host, now)

	shard := c.shardFor(host)
	shard.mu.Lock()
	delete(shard.m, host)
	shard.mu.Unlock()
}

func (c *DNSCache) sweepLoop() {
	defer close(c.sweepDone)
	ticker := time.NewTicker(100 * time.Millisecond)
	defer ticker.Stop()

	currentShard := 0
	for {
		select {
		case <-c.stopSweep:
			return
		case <-ticker.C:
			c.sweepShard(currentShard)
			currentShard = (currentShard + 1) % dnsShards
		}
	}
}

func (c *DNSCache) sweepShard(idx int) {
	shard := &c.shards[idx]
	now := c.nowNano()

	shard.mu.Lock()
	for k, entry := range shard.m {
		if now >= entry.expiresAt {
			delete(shard.m, k)
			c.evictions.Add(1)
		}
	}
	shard.mu.Unlock()

	if idx == 0 {
		GlobalIPQuarantine.SweepExpired()
		c.lastInvalidations.Range(func(key, val interface{}) bool {
			if now-val.(int64) > int64(60*time.Second) {
				c.lastInvalidations.Delete(key)
			}
			return true
		})
	}
}

func (c *DNSCache) Stats() DNSCacheStats {
	return DNSCacheStats{
		Hits:           c.hits.Load(),
		Misses:         c.misses.Load(),
		Evictions:      c.evictions.Load(),
		NegativeHits:   c.negativeHits.Load(),
		CoalescedLoads: c.coalescedLoads.Load(),
	}
}

// ---- Cached Dialer with Multi-IP Rotation & Sliced Budgets ------------------

type DialStats struct {
	Attempts          int
	PartialIPFailures int
	ConnectedIP       netip.Addr
}

type CachedDialerConfig struct {
	ConnectTimeout time.Duration
	KeepAlive      time.Duration
	Quarantine     *IPQuarantine
	BlockedIPFunc  func(netip.Addr) bool
	DialContextFn  func(ctx context.Context, network, addr string) (net.Conn, error)
}

type CachedDialer struct {
	Cache          *DNSCache
	cache          *DNSCache
	Bypass         bool
	Shadow         bool
	ConnectTimeout time.Duration
	Cohort         int
	Quarantine     *IPQuarantine
	quarantine     *IPQuarantine
	cfg            CachedDialerConfig
}

func NewCachedDialer(cache *DNSCache, cfg CachedDialerConfig) *CachedDialer {
	if cfg.ConnectTimeout <= 0 {
		cfg.ConnectTimeout = 2 * time.Second
	}
	if cfg.KeepAlive <= 0 {
		cfg.KeepAlive = 30 * time.Second
	}
	if cfg.Quarantine == nil {
		cfg.Quarantine = GlobalIPQuarantine
	}
	return &CachedDialer{
		Cache:          cache,
		cache:          cache,
		ConnectTimeout: cfg.ConnectTimeout,
		Quarantine:     cfg.Quarantine,
		quarantine:     cfg.Quarantine,
		cfg:            cfg,
	}
}

func (cd *CachedDialer) Dial(addr string) (net.Conn, error) {
	return cd.DialContext(context.Background(), "tcp", addr)
}

func (cd *CachedDialer) DialTLSWithSNI(ctx context.Context, network, addr string, tlsConfig *tls.Config) (net.Conn, error) {
	conn, err := cd.DialContext(ctx, network, addr)
	if err != nil {
		return nil, err
	}
	host, _, _ := net.SplitHostPort(addr)
	cfg := tlsConfig.Clone()
	if cfg.ServerName == "" {
		cfg.ServerName = host
	}
	tlsConn := tls.Client(conn, cfg)
	if err := tlsConn.HandshakeContext(ctx); err != nil {
		conn.Close()
		return nil, err
	}
	return tlsConn, nil
}

func isClassifiedLocalResourceError(err error) bool {
	if err == nil {
		return false
	}
	class, _ := ClassifyTCPError(err)
	return class == ErrLocalResource || class == ErrUnsupported
}

type fleetBucket struct {
	sec   int64
	total int64
	fails int64
}

type fleetBreaker struct {
	mu      sync.Mutex
	buckets [10]fleetBucket
}

var globalFleetBreaker fleetBreaker

func recordFleetDial(failed bool) {
	nowSec := time.Now().Unix()
	idx := nowSec % 10
	globalFleetBreaker.mu.Lock()
	b := &globalFleetBreaker.buckets[idx]
	if b.sec != nowSec {
		b.sec = nowSec
		b.total = 0
		b.fails = 0
	}
	b.total++
	if failed {
		b.fails++
	}
	globalFleetBreaker.mu.Unlock()
}

func isFleetNetworkDegraded() bool {
	nowSec := time.Now().Unix()
	globalFleetBreaker.mu.Lock()
	defer globalFleetBreaker.mu.Unlock()

	var total, fails int64
	for i := 0; i < 10; i++ {
		b := &globalFleetBreaker.buckets[i]
		if nowSec-b.sec >= 0 && nowSec-b.sec < 10 {
			total += b.total
			fails += b.fails
		}
	}
	if total >= 40 && (fails*100)/total >= 35 {
		return true
	}
	return false
}

func (cd *CachedDialer) DialContext(ctx context.Context, network, addr string) (net.Conn, error) {
	host, portStr, err := net.SplitHostPort(addr)
	if err != nil {
		return nil, err
	}

	cache := cd.Cache
	if cache == nil {
		cache = cd.cache
	}
	quarantine := cd.Quarantine
	if quarantine == nil {
		quarantine = cd.quarantine
	}
	if quarantine == nil {
		quarantine = GlobalIPQuarantine
	}

	isBlocked := netsec.IsBlockedIP
	if cd.cfg.BlockedIPFunc != nil {
		isBlocked = cd.cfg.BlockedIPFunc
	}
	controlHook := netsec.SSRFControl
	if cd.cfg.BlockedIPFunc != nil {
		controlHook = netsec.ControlWith(isBlocked)
	}

	if ip := net.ParseIP(host); ip != nil {
		netipAddr, ok := netip.AddrFromSlice(ip)
		if !ok || isBlocked(netipAddr) {
			return nil, netsec.ErrSSRFBlocked
		}
		var conn net.Conn
		var dialErr error
		if cd.cfg.DialContextFn != nil {
			conn, dialErr = cd.cfg.DialContextFn(ctx, network, addr)
		} else {
			var d net.Dialer
			d.Timeout = cd.cfg.ConnectTimeout
			if cd.ConnectTimeout > 0 {
				d.Timeout = cd.ConnectTimeout
			}
			d.KeepAlive = cd.cfg.KeepAlive
			d.Control = controlHook
			conn, dialErr = d.DialContext(ctx, network, addr)
		}
		if dialErr == nil && conn != nil {
			_ = conn.SetDeadline(time.Time{})
			return &telemetryConn{
				Conn:   conn,
				cohort: cd.Cohort,
				stats: DialStats{
					Attempts:          1,
					PartialIPFailures: 0,
					ConnectedIP:       netipAddr,
				},
			}, nil
		}
		return nil, dialErr
	}

	candidates, err := cache.Lookup(ctx, host, cd.Bypass)
	if err != nil {
		return nil, err
	}

	var safeCandidates []netip.Addr
	for _, ip := range candidates {
		if !isBlocked(ip) {
			safeCandidates = append(safeCandidates, ip)
		}
	}
	if len(safeCandidates) == 0 {
		return nil, netsec.ErrSSRFBlocked
	}

	monitorID := MonitorIDFromContext(ctx)
	primaryIP, usable := SelectStickyIP(monitorID, host, portStr, safeCandidates, cd.quarantine)

	dialList := make([]netip.Addr, 0, len(usable))
	dialList = append(dialList, primaryIP)
	for _, ip := range usable {
		if ip != primaryIP {
			dialList = append(dialList, ip)
		}
	}

	var totalTimeout time.Duration
	if dl, ok := ctx.Deadline(); ok {
		totalTimeout = time.Until(dl)
		if totalTimeout <= 0 {
			return nil, ctx.Err()
		}
	} else {
		totalTimeout = cd.cfg.ConnectTimeout
	}

	numAttempts := len(dialList)
	if numAttempts > 3 {
		numAttempts = 3
	}

	perAttemptBudget := totalTimeout / time.Duration(numAttempts)
	if perAttemptBudget < 100*time.Millisecond {
		perAttemptBudget = 100 * time.Millisecond
	}

	var lastErr error
	for attemptIdx, ip := range dialList[:numAttempts] {
		if err := ctx.Err(); err != nil {
			return nil, err
		}

		attemptTimeout := perAttemptBudget
		if dl, ok := ctx.Deadline(); ok {
			rem := time.Until(dl)
			if rem <= 0 {
				return nil, ctx.Err()
			}
			if rem < attemptTimeout {
				attemptTimeout = rem
			}
		}

		attemptCtx, attemptCancel := context.WithTimeout(ctx, attemptTimeout)
		targetAddr := net.JoinHostPort(ip.String(), portStr)
		var conn net.Conn
		var dialErr error
		if cd.cfg.DialContextFn != nil {
			conn, dialErr = cd.cfg.DialContextFn(attemptCtx, network, targetAddr)
		} else {
			var d net.Dialer
			d.Timeout = attemptTimeout
			d.KeepAlive = cd.cfg.KeepAlive
			d.Control = controlHook
			conn, dialErr = d.DialContext(attemptCtx, network, targetAddr)
		}
		attemptCancel()

		if dialErr == nil {
			recordFleetDial(false)
			if conn != nil {
				_ = conn.SetDeadline(time.Time{})
			}
			return &telemetryConn{
				Conn:   conn,
				cohort: cd.Cohort,
				stats: DialStats{
					Attempts:          attemptIdx + 1,
					PartialIPFailures: attemptIdx,
					ConnectedIP:       ip,
				},
			}, nil
		}

		lastErr = dialErr
		isLocalErr := isClassifiedLocalResourceError(dialErr)
		if !errors.Is(dialErr, context.Canceled) {
			recordFleetDial(true)
		}

		if ctx.Err() != nil {
			return nil, ctx.Err()
		}

		if isLocalErr || isFleetNetworkDegraded() {
			continue
		}

		if len(safeCandidates) > 1 && attemptIdx < len(dialList)-1 {
			quarantine.Quarantine(host, ip, portStr)
		}
	}

	if lastErr != nil && !isClassifiedLocalResourceError(lastErr) && !isFleetNetworkDegraded() {
		cache.Invalidate(host)
	}

	return nil, lastErr
}
