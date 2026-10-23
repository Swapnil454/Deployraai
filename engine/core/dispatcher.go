package core

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log"
	"net"
	"net/netip"
	"os"
	"runtime"
	"slices"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"syscall"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/your-org/uptime-engine/netsec"
)

var (
	sessionCacheHits             int64
	sessionCacheMisses           int64
	sessionCachePuts             int64
	LocalResourceExhaustionCount uint64
	LocalRoutingFailureCount     uint64
	DNSTemporaryCount            uint64
	consecutiveDNSTemporary      sync.Map // monitorID -> *int32
)

// CleanupMonitorState removes any transient tracking state for a removed monitor.
func CleanupMonitorState(monitorID string) {
	consecutiveDNSTemporary.Delete(monitorID)
}

type dnsTemporaryState struct {
	count     int32
	lastUpdAt int64 // Unix nano
}

const dnsTemporaryCounterMaxAge = 10 * time.Minute

// GetDNSTemporaryCount returns the current count of consecutive DNS temporary failures for a monitor.
func GetDNSTemporaryCount(monitorID string) int32 {
	if val, ok := consecutiveDNSTemporary.Load(monitorID); ok {
		st := val.(*dnsTemporaryState)
		if time.Now().UnixNano()-st.lastUpdAt > int64(dnsTemporaryCounterMaxAge) {
			consecutiveDNSTemporary.Delete(monitorID)
			return 0
		}
		return st.count
	}
	return 0
}

// ResetDNSTemporaryCount explicitly resets the consecutive DNS temporary failures for a monitor.
func ResetDNSTemporaryCount(monitorID string) {
	consecutiveDNSTemporary.Delete(monitorID)
}

// PackDNSTempState packs count (8 bits, bits 56..63) and timestamp in milliseconds (56 bits, bits 0..55).
func PackDNSTempState(count uint8, tsMs int64) uint64 {
	return (uint64(count) << 56) | (uint64(tsMs) & 0x00FFFFFFFFFFFFFF)
}

// UnpackDNSTempState unpacks count (8 bits, bits 56..63) and timestamp in milliseconds (56 bits, bits 0..55).
func UnpackDNSTempState(v uint64) (uint8, int64) {
	return uint8(v >> 56), int64(v & 0x00FFFFFFFFFFFFFF)
}

func packDNSTempState(count uint8, tsMs int64) uint64 {
	return PackDNSTempState(count, tsMs)
}

func unpackDNSTempState(v uint64) (uint8, int64) {
	return UnpackDNSTempState(v)
}

// StepDNSTemporaryEvaluationOnMonitor updates the consecutive DNS temporary failure counter directly on *Monitor.
// Zero heap allocations on the success path (ErrNone) and zero CAS when already zero.
// Inconclusive errors (ErrLocalResource, ErrUnsupported, ErrSlow) HOLD the counter without resetting or incrementing.
// Consecutive ErrDNSTemporary failures increment the counter; upon reaching 5, it saturates at 5 and escalates to true.
// The counter remains saturated at 5 until an ErrNone (or non-DNS definitive failure) resets it to 0, preventing flapping.
func StepDNSTemporaryEvaluationOnMonitor(m *Monitor, intervalSec int, errClass ErrClass) (currentCount int32, escalated bool) {
	if m == nil {
		return 0, false
	}

	// 1. Success fast-path: Zero allocations, zero writes, and zero time.Now() calls if already 0 (or unallocated)
	if errClass == ErrNone {
		if m.DNSTempCell == nil {
			return 0, false
		}
		cur := m.DNSTempCell.State.Load()
		if cur == 0 {
			return 0, false
		}
		m.DNSTempCell.State.Store(0)
		return 0, false
	}

	if intervalSec <= 0 {
		intervalSec = 60
	}
	maxAge := dnsTemporaryCounterMaxAge
	if limit := 3 * time.Duration(intervalSec) * time.Second; limit > maxAge {
		maxAge = limit
	}
	maxAgeMs := maxAge.Milliseconds()
	nowMs := time.Now().UnixMilli()

	cell := m.DNSTempCell
	if cell == nil {
		cell = &DNSTempCell{}
		m.DNSTempCell = cell
	}

	// 2. Inconclusive hold path (ErrLocalResource, ErrUnsupported, ErrSlow)
	if errClass == ErrLocalResource || errClass == ErrUnsupported || errClass == ErrSlow {
		cur := cell.State.Load()
		if cur == 0 {
			return 0, false
		}
		cnt, ts := unpackDNSTempState(cur)
		if nowMs-ts > maxAgeMs {
			// Stale count expired, reset to 0
			cell.State.CompareAndSwap(cur, 0)
			return 0, false
		}
		// Hold current count
		return int32(cnt), cnt >= 5
	}

	// 3. DNS Temporary failure path (ErrDNSTemporary)
	if errClass == ErrDNSTemporary {
		for {
			cur := cell.State.Load()
			cnt, ts := unpackDNSTempState(cur)
			var nextCnt uint8
			if cnt > 0 {
				if nowMs-ts > maxAgeMs {
					nextCnt = 1
				} else {
					nextCnt = cnt + 1
					if nextCnt >= 5 {
						nextCnt = 5 // Saturated at 5! Never flap back to 0!
					}
				}
			} else {
				nextCnt = 1
			}
			nextVal := packDNSTempState(nextCnt, nowMs)
			if cell.State.CompareAndSwap(cur, nextVal) {
				return int32(nextCnt), nextCnt >= 5
			}
		}
	}

	// 4. Definitive non-DNS failure resets the counter
	cur := cell.State.Load()
	if cur == 0 {
		return 0, false
	}
	cell.State.Store(0)
	return 0, false
}

// StepDNSTemporaryEvaluation evaluates DNS temporary failures for monitorID.
// If the monitor is resident in Store, it performs the atomic evaluation directly on the Monitor struct with zero heap allocations.
func StepDNSTemporaryEvaluation(monitorID string, intervalSec int, errClass ErrClass) (currentCount int32, escalated bool) {
	ptr := Store.GetPointer(monitorID)
	if ptr != nil {
		m := ptr.Load()
		if m != nil {
			return StepDNSTemporaryEvaluationOnMonitor(m, intervalSec, errClass)
		}
	}

	// Fallback strictly for isolated tests where Store is unpopulated
	return stepDNSTemporaryEvaluationFallback(monitorID, intervalSec, errClass)
}

func stepDNSTemporaryEvaluationFallback(monitorID string, intervalSec int, errClass ErrClass) (int32, bool) {
	if intervalSec <= 0 {
		intervalSec = 60
	}
	maxAge := dnsTemporaryCounterMaxAge
	if limit := 3 * time.Duration(intervalSec) * time.Second; limit > maxAge {
		maxAge = limit
	}
	now := time.Now().UnixNano()

	if errClass == ErrNone {
		consecutiveDNSTemporary.Delete(monitorID)
		return 0, false
	}
	if errClass == ErrLocalResource || errClass == ErrUnsupported || errClass == ErrSlow {
		if val, ok := consecutiveDNSTemporary.Load(monitorID); ok {
			st := val.(*dnsTemporaryState)
			if now-st.lastUpdAt > int64(maxAge) {
				consecutiveDNSTemporary.Delete(monitorID)
				return 0, false
			}
			return st.count, st.count >= 5
		}
		return 0, false
	}
	if errClass == ErrDNSTemporary {
		var st *dnsTemporaryState
		val, loaded := consecutiveDNSTemporary.Load(monitorID)
		if loaded {
			existing := val.(*dnsTemporaryState)
			if now-existing.lastUpdAt > int64(maxAge) {
				st = &dnsTemporaryState{count: 1, lastUpdAt: now}
			} else {
				nextCount := existing.count + 1
				if nextCount >= 5 {
					nextCount = 5 // Saturated at 5!
				}
				st = &dnsTemporaryState{count: nextCount, lastUpdAt: now}
			}
		} else {
			st = &dnsTemporaryState{count: 1, lastUpdAt: now}
		}
		consecutiveDNSTemporary.Store(monitorID, st)
		return st.count, st.count >= 5
	}
	// Definitive non-DNS failure resets the counter
	consecutiveDNSTemporary.Delete(monitorID)
	return 0, false
}

func getGID() uint64 {
	var buf [64]byte
	n := runtime.Stack(buf[:], false)
	str := strings.TrimPrefix(string(buf[:n]), "goroutine ")
	idx := strings.IndexByte(str, ' ')
	if idx > 0 {
		id, _ := strconv.ParseUint(str[:idx], 10, 64)
		return id
	}
	return 0
}

type dialGoroutineInfo struct {
	dialed    *bool
	didResume *bool
	deadline  time.Time
}

var dialingGoroutines sync.Map // gid -> *dialGoroutineInfo

func setGoroutineDialing(dialed *bool, didResume *bool, deadline time.Time) uint64 {
	gid := getGID()
	dialingGoroutines.Store(gid, &dialGoroutineInfo{dialed: dialed, didResume: didResume, deadline: deadline})
	return gid
}

func clearGoroutineDialing(gid uint64) {
	dialingGoroutines.Delete(gid)
}

func recordGoroutineTLSResume(didResume bool) {
	gid := getGID()
	if v, ok := dialingGoroutines.Load(gid); ok {
		info := v.(*dialGoroutineInfo)
		if info.didResume != nil {
			*info.didResume = didResume
		}
	}
}

func markGoroutineDialed() *dialGoroutineInfo {
	gid := getGID()
	if v, ok := dialingGoroutines.Load(gid); ok {
		info := v.(*dialGoroutineInfo)
		if info.dialed != nil {
			*info.dialed = true
		}
		return info
	}
	return nil
}

type instrumentedSessionCache struct {
	cache tls.ClientSessionCache
}

func (c *instrumentedSessionCache) Get(sessionKey string) (*tls.ClientSessionState, bool) {
	state, ok := c.cache.Get(sessionKey)
	if ok && state != nil {
		atomic.AddInt64(&sessionCacheHits, 1)
	} else {
		atomic.AddInt64(&sessionCacheMisses, 1)
	}
	return state, ok
}

func (c *instrumentedSessionCache) Put(sessionKey string, cs *tls.ClientSessionState) {
	atomic.AddInt64(&sessionCachePuts, 1)
	c.cache.Put(sessionKey, cs)
}

var globalDNSSem = make(chan struct{}, 20)

func resolveHostForDNSCache(ctx context.Context, host string) ([]netip.Addr, error) {
	if !strings.HasSuffix(host, ".mock.local") {
		select {
		case globalDNSSem <- struct{}{}:
			defer func() { <-globalDNSSem }()
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}

	ips, err := resolveHost(ctx, host)
	if err != nil {
		return nil, err
	}
	var res []netip.Addr
	for _, ip := range ips {
		if addr, ok := netip.AddrFromSlice(ip); ok {
			if !isBlockedIP(addr.Unmap()) {
				res = append(res, addr.Unmap())
			}
		}
	}
	if len(res) == 0 {
		return nil, netsec.ErrSSRFBlocked
	}
	return res, nil
}

var GlobalDNSCache = NewDNSCache(DNSCacheConfig{Capacity: 50000}, resolveHostForDNSCache)

var globalCachedDialer = &CachedDialer{
	Cache:          GlobalDNSCache,
	Bypass:         false,
	ConnectTimeout: 3 * time.Second,
	Cohort:         0,
}

var globalTLSConfig = &tls.Config{
	ClientSessionCache: &instrumentedSessionCache{cache: tls.NewLRUClientSessionCache(50000)}, // Default, overridden in init
	InsecureSkipVerify: TLSInsecureSkipVerify,
}

var freshDialer = &CachedDialer{Cache: GlobalDNSCache, Bypass: true, ConnectTimeout: 3 * time.Second, Cohort: 0}
var shadowDialer = &CachedDialer{Cache: GlobalDNSCache, Shadow: true, ConnectTimeout: 3 * time.Second, Cohort: 0}
var cachedDialerClassical = &CachedDialer{Cache: GlobalDNSCache, Bypass: false, ConnectTimeout: 3 * time.Second, Cohort: 1}
var freshDialerClassical = &CachedDialer{Cache: GlobalDNSCache, Bypass: true, ConnectTimeout: 3 * time.Second, Cohort: 1}

var (
	tlsConfigClassical *tls.Config
	HTTPClients        struct {
		Cached          *fasthttp.Client
		Fresh           *fasthttp.Client
		Shadow          *fasthttp.Client
		CachedClassical *fasthttp.Client
		FreshClassical  *fasthttp.Client
		FullPhase       *fasthttp.Client
	}
	tlsInitOnce sync.Once
)

func InitTLSConfig(monitorCount int) {
	InitHTTPClients(monitorCount)
}

var (
	MockNetBytesIn   atomic.Uint64
	MockNetBytesOut  atomic.Uint64
	WarmRetryEOF     atomic.Uint64
	WarmRetryReset   atomic.Uint64
	WarmRetryTimeout atomic.Uint64
	WarmRetryOther   atomic.Uint64
)

type countingConn struct {
	net.Conn
}

func (c *countingConn) Read(b []byte) (int, error) {
	n, err := c.Conn.Read(b)
	if n > 0 {
		MockNetBytesIn.Add(uint64(n))
	}
	return n, err
}

func (c *countingConn) Write(b []byte) (int, error) {
	n, err := c.Conn.Write(b)
	if n > 0 {
		MockNetBytesOut.Add(uint64(n))
	}
	return n, err
}

func guardedDial(d *CachedDialer) fasthttp.DialFunc {
	return func(addr string) (net.Conn, error) {
		info := markGoroutineDialed()
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		isBlocked := netsec.IsBlocked
		if d != nil && d.cfg.BlockedIPFunc != nil {
			isBlocked = d.cfg.BlockedIPFunc
		}
		if ip, perr := netip.ParseAddr(host); perr == nil && isBlocked(ip.Unmap()) {
			return nil, netsec.ErrSSRFBlocked
		}
		conn, err := d.Dial(addr)
		if err != nil {
			return nil, err
		}
		if info != nil && !info.deadline.IsZero() {
			conn.SetDeadline(info.deadline)
		}
		return &countingConn{Conn: conn}, nil
	}
}

var dnsCacheMode = os.Getenv("ENGINE_DNS_CACHE") // "off", "shadow", "on"

func newHTTPClient(d *CachedDialer, tlsCfg *tls.Config) *fasthttp.Client {
	idleSecs := 90
	if val := os.Getenv("MAX_IDLE_CONN_DURATION_S"); val != "" {
		if parsed, err := strconv.Atoi(val); err == nil {
			idleSecs = parsed
		}
	}
	return &fasthttp.Client{
		MaxConnsPerHost:           10000,
		MaxIdleConnDuration:       time.Duration(idleSecs) * time.Second, // 90s window enables keep-alive reuse across 30s check cycles
		MaxIdemponentCallAttempts: 1,                                     // Explicit retry managed by engine to track warm vs fresh failures
		ReadTimeout:               10 * time.Second,                      // Tie to max monitor timeout to prevent 5s goroutine leak
		WriteTimeout:              10 * time.Second,                      // Tie to max monitor timeout
		ReadBufferSize:            16384,                                 // Support large headers up to 16KB without error
		WriteBufferSize:           8192,
		StreamResponseBody:        true,
		TLSConfig:                 tlsCfg,
		Dial:                      guardedDial(d),
	}
}

func isTimeoutError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(err, fasthttp.ErrTimeout) {
		return true
	}
	return strings.Contains(strings.ToLower(err.Error()), "timeout")
}

// isStaleSocketError returns true if an HTTP check failed due to a server-side idle socket closure.
func isStaleSocketError(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, io.EOF) || errors.Is(err, net.ErrClosed) || errors.Is(err, syscall.ECONNRESET) || errors.Is(err, fasthttp.ErrConnectionClosed) {
		return true
	}
	errStr := strings.ToLower(err.Error())
	return strings.Contains(errStr, "connection reset by peer") ||
		strings.Contains(errStr, "forcibly closed by the remote host") ||
		strings.Contains(errStr, "use of closed network connection") ||
		strings.Contains(errStr, "closed connection") ||
		strings.Contains(errStr, "broken pipe") ||
		strings.Contains(errStr, "wsarecv") ||
		strings.Contains(errStr, "wsasend")
}

func InitHTTPClients(monitorCount int) {
	tlsInitOnce.Do(func() {
		if monitorCount <= 0 {
			Store.Mu.RLock()
			monitorCount = len(Store.Monitors)
			Store.Mu.RUnlock()
		}
		if monitorCount < 100000 {
			monitorCount = 100000
		}
		cacheSize := monitorCount + (monitorCount / 10) // 10% headroom to prevent thrashing while saving RAM
		if tcStr := os.Getenv("TLS_CACHE_SIZE"); tcStr != "" {
			if tc, err := strconv.Atoi(tcStr); err == nil && tc > 0 {
				cacheSize = tc
			}
		}
		cache := &instrumentedSessionCache{cache: tls.NewLRUClientSessionCache(cacheSize)}

		// Cohort 0 (Default)
		globalTLSConfig.ClientSessionCache = cache
		installTLSObserver(globalTLSConfig, 0)

		// Cohort 1 (Classical key-share)
		cc := globalTLSConfig.Clone()
		cc.VerifyConnection = nil // Clear cloned cohort-0 observer callback
		installTLSObserver(cc, 1)
		cc.CurvePreferences = []tls.CurveID{tls.X25519, tls.CurveP256}
		cc.ClientSessionCache = cache
		tlsConfigClassical = cc

		HTTPClients.Cached = newHTTPClient(globalCachedDialer, globalTLSConfig)
		HTTPClients.Fresh = newHTTPClient(freshDialer, globalTLSConfig)
		HTTPClients.Shadow = newHTTPClient(shadowDialer, globalTLSConfig)
		HTTPClients.CachedClassical = newHTTPClient(cachedDialerClassical, cc)
		HTTPClients.FreshClassical = newHTTPClient(freshDialerClassical, cc)

		fullPhaseTLSConfig := &tls.Config{
			ClientSessionCache: nil, // Force full handshake to extract peer certs without ticket resumption
			InsecureSkipVerify: TLSInsecureSkipVerify,
		}
		HTTPClients.FullPhase = &fasthttp.Client{
			MaxConnsPerHost:     10000,
			MaxIdleConnDuration: 1 * time.Nanosecond, // Explicit short idle duration so sockets are never pooled
			ReadTimeout:         10 * time.Second,
			WriteTimeout:        10 * time.Second, // Prevents TLS handshakes from blocking forever
			ReadBufferSize:      16384,
			WriteBufferSize:     8192,
			StreamResponseBody:  true,
			TLSConfig:           fullPhaseTLSConfig,
			Dial:                guardedDial(freshDialer),
		}
	})
}

func isFullPhaseNeeded(m *Monitor, now time.Time) bool {
	monKey := MonitorKey(m.ID)
	if m.FullPhaseInterval <= 0 {
		m.FullPhaseInterval = GetFullPhaseInterval(monKey, m.FullPhaseCount)
	}
	if m.LastFullPhaseAt.IsZero() {
		h64 := Splitmix64(monKey ^ 0x9e3779b97f4a7c15)
		offsetSec := time.Duration(h64%uint64(m.FullPhaseInterval.Seconds())) * time.Second
		m.LastFullPhaseAt = now.Add(-offsetSec)
	}
	return !now.Before(m.LastFullPhaseAt.Add(m.FullPhaseInterval))
}

func GetHTTPClient(m *Monitor, monKey uint64) *fasthttp.Client {
	InitHTTPClients(0)

	useClassical := isClassicalCohortEnabled(monKey) && !hasCredentials(m)
	useFresh := (m.ConsecutiveFails > 0) || dnsCacheMode == "off"

	switch {
	case useFresh && useClassical:
		return HTTPClients.FreshClassical
	case useFresh:
		return HTTPClients.Fresh
	case useClassical:
		return HTTPClients.CachedClassical
	case dnsCacheMode == "shadow":
		return HTTPClients.Shadow
	default:
		return HTTPClients.Cached
	}
}

func hasCredentials(m *Monitor) bool {
	if m.Headers != nil {
		if _, ok := m.Headers["Authorization"]; ok {
			return true
		}
		if _, ok := m.Headers["Cookie"]; ok {
			return true
		}
		if _, ok := m.Headers["X-Api-Key"]; ok {
			return true
		}
	}
	return false
}

var tlsClassicalPercentInt = parsePercent(os.Getenv("ENGINE_TLS_CLASSICAL_PERCENT"))

func parsePercent(s string) int {
	if s == "" {
		return 0
	}
	var target int
	fmt.Sscanf(s, "%d", &target)
	return target
}

func isClassicalCohortEnabled(monKey uint64) bool {
	if tlsClassicalPercentInt <= 0 {
		return false
	}
	return int(monKey%100) < tlsClassicalPercentInt
}

func SetTLSClassicalPercentForTest(pct int) {
	tlsClassicalPercentInt = pct
}

var EnableEngineB = os.Getenv("ENABLE_ENGINE_B") == "true"

type IncidentEvent struct {
	EventID           string
	IdempotencyKey    string
	ID                string
	OldStatus         string
	NewStatus         string
	OccurredAt        time.Time
	IncidentEnd       time.Time
	Cause             string
	FirstErrorMessage string
}

var IncidentQueue = make(chan IncidentEvent, 5000)
var OnIncidentOverflow func(IncidentEvent)

func recordIncidentSafe(id, idempotencyKey, oldStatus, newStatus, cause, firstError string, occurredAt, incidentEnd time.Time) error {
	evt := buildIncidentEvent(id, idempotencyKey, oldStatus, newStatus, cause, firstError, occurredAt, incidentEnd)
	select {
	case IncidentQueue <- evt:
		return nil
	default:
		log.Printf("ALERT: Incident queue full! Dropping alert for %s to local dead-letter log.", id)
		if OnIncidentOverflow != nil {
			OnIncidentOverflow(evt)
		}
		return fmt.Errorf("IncidentQueue full")
	}
}

// buildIncidentEvent creates an IncidentEvent with a fresh EventID.
func buildIncidentEvent(id, idempotencyKey, oldStatus, newStatus, cause, firstError string, occurredAt, incidentEnd time.Time) IncidentEvent {
	return IncidentEvent{
		EventID:           uuid.New().String(),
		IdempotencyKey:    idempotencyKey,
		ID:                id,
		OldStatus:         oldStatus,
		NewStatus:         newStatus,
		OccurredAt:        occurredAt,
		IncidentEnd:       incidentEnd,
		Cause:             cause,
		FirstErrorMessage: firstError,
	}
}

// deliverOrSpool pushes evt to IncidentQueue (non-blocking).
// FIFO contract: if the spool already has entries, we append rather than
// bypass, so that a later UP cannot overtake an earlier DOWN in the queue.
// Cap: if the spool reaches maxSpoolSize, the event goes to OnIncidentOverflow.
func deliverOrSpool(evt IncidentEvent) {
	incidentSpoolMu.Lock()
	spoolLen := len(incidentSpool)
	incidentSpoolMu.Unlock()

	if spoolLen == 0 {
		// Fast path: spool is empty, try the queue directly.
		select {
		case IncidentQueue <- evt:
			return
		default:
		}
	}

	// Queue full, or spool non-empty: append to spool to preserve FIFO.
	incidentSpoolMu.Lock()
	defer incidentSpoolMu.Unlock()
	if len(incidentSpool) >= maxSpoolSize {
		log.Printf("[CRIT] incident spool at cap (%d), dropping event for %s", maxSpoolSize, evt.ID)
		if OnIncidentOverflow != nil {
			OnIncidentOverflow(evt)
		}
		return
	}
	incidentSpool = append(incidentSpool, evt)
	log.Printf("[WARN] IncidentQueue full, spooling event for %s (spool size: %d)", evt.ID, len(incidentSpool))
}

type ProbeMeta struct {
	ProbeKind          uint8 // 0=scheduled, 1=verification (5s recheck)
	PhaseKind          uint8 // 0=warm, 1=full, 2=warm_retry
	Attempts           uint8 // 1 or 2
	TotalLatencyUs     uint32
	Reused             uint8 // 0=new, 1=reused
	DidResume          uint8 // 0=full, 1=resumed
	ReqMethod          uint8
	ReqScheme          uint8
	ExpectedGeneration uint64 // CheckGeneration at dispatch; 0 = generation guard disabled
	DispatchTimeMs     int64  // Wall-clock time (Unix ms) when probe was initiated
}

func HandleInconclusiveDetailed(id string, p *atomic.Pointer[Monitor], meta ProbeMeta) {
	mutate := func(m *Monitor) {
		m.AwaitingResult = false
		m.ChecksTotal++
		// Preserve LastStatus and ConsecutiveFails - do not transition state
		m.CurrentInterval = m.Interval
		intervalDur := time.Duration(m.CurrentInterval) * time.Second
		next := m.LastProbeSentAt.Add(intervalDur)
		if next.Before(time.Now()) {
			next = time.Now()
		}
		m.NextCheckAt = next
	}
	if p != nil {
		CASUpdate(p, mutate)
	}
}

func HandleFailure(id string, p *atomic.Pointer[Monitor], errClass ErrClass, cause string, firstError string) {
	HandleFailureDetailed(id, p, errClass, cause, firstError, ProbeMeta{})
}

func HandleFailureDetailed(id string, p *atomic.Pointer[Monitor], errClass ErrClass, cause string, firstError string, meta ProbeMeta) {
	var old, updated *Monitor
	var ok bool
	mutate := func(m *Monitor) {
		m.AwaitingResult = false
		m.ChecksTotal++

		// Confidence decay
		m.ConfidenceScore -= 1.0
		if m.ConfidenceScore < 0 {
			m.ConfidenceScore = 0
		}

		m.ConsecutiveFails++

		// Fast 5s verification recheck on first failure from UP (avoids false-DOWN on transient 5xx)
		if m.ConsecutiveFails == 1 && meta.ProbeKind == 0 && m.LastStatus == "UP" {
			m.IsVerification = true
			m.NextCheckAt = time.Now().Add(5 * time.Second)
			return
		}

		// Confirmed DOWN after verification probe fails or persistent failure
		m.LastStatus = "DOWN"
		m.IsVerification = false
		m.CurrentInterval = m.Interval
		intervalDur := time.Duration(m.CurrentInterval) * time.Second
		next := m.LastProbeSentAt.Add(intervalDur)
		if next.Before(time.Now()) {
			next = time.Now()
		}
		m.NextCheckAt = next
	}

	// Generation guard (Fix 3): pre-check generation BEFORE applying the CAS mutation.
	// If the result is stale (from a previous check interval), drop it entirely so
	// LastStatus is never written. The guard must run before the CAS, not after.
	if meta.ExpectedGeneration != 0 {
		var current *Monitor
		if p != nil {
			current = p.Load()
		} else {
			current = Store.Get(id)
		}
		if current != nil && current.CheckGeneration != meta.ExpectedGeneration {
			return // stale: generation advanced by reaper or next dispatch
		}
		if current != nil && !current.AwaitingResult {
			return // reaper already cleared the slot; not our result to write
		}
	}

	if p != nil {
		old, updated, ok = CASUpdateReturning(p, mutate)
	} else {
		old, updated, ok = Store.UpdateRuntime(id, mutate)
	}

	// Post-CAS guard: if another goroutine raced us to the same slot,
	// the old state will reveal the collision.
	if ok && meta.ExpectedGeneration != 0 && old != nil &&
		old.CheckGeneration != meta.ExpectedGeneration {
		// Undo: restore AwaitingResult so the monitor doesn't get stuck.
		if p != nil {
			CASUpdate(p, func(m *Monitor) { m.AwaitingResult = true })
		}
		return
	}
	if ok && old != nil && !old.AwaitingResult {
		return
	}

	if ok {
		SubmitCheckResult(id, EventCheckResult{
			Role:     RolePrimary,
			PoP:      "pop-local",
			ASN:      "asn-local",
			Ok:       false,
			ErrClass: errClass,
		})

		tsMs := meta.DispatchTimeMs
		if tsMs == 0 {
			tsMs = time.Now().UnixMilli()
		}
		Emit(Sample{
			MonitorID:      updated.ParsedUUID,
			TsMs:           tsMs,
			LatencyUs:      0,
			IntervalS:      uint16(updated.CurrentInterval),
			Status:         0,
			Err:            1, // Timeout/Failure
			Kind:           typeToKind(updated.Type),
			ProbeKind:      meta.ProbeKind,
			PhaseKind:      meta.PhaseKind,
			Attempts:       meta.Attempts,
			TotalLatencyUs: meta.TotalLatencyUs,
			Reused:         meta.Reused,
			DidResume:      meta.DidResume,
			ReqMethod:      meta.ReqMethod,
			ReqScheme:      meta.ReqScheme,
			Generation:     meta.ExpectedGeneration,
		})
	}
}

// typeToKind maps monitor string type to integer kind for telemetry.
func typeToKind(mType string) uint8 {
	switch mType {
	case "http":
		return 1
	case "keyword":
		return 2
	case "ping":
		return 3
	case "port":
		return 4
	case "heartbeat":
		return 5
	case "dns":
		return 6
	case "api":
		return 7
	case "udp":
		return 8
	default:
		return 0
	}
}

func HandleSuccess(id string, p *atomic.Pointer[Monitor], latencyUs uint32) {
	HandleSuccessDetailed(id, p, latencyUs, ProbeMeta{})
}

func HandleSuccessDetailed(id string, p *atomic.Pointer[Monitor], latencyUs uint32, meta ProbeMeta) {
	var old, updated *Monitor
	var ok bool
	mutate := func(m *Monitor) {
		m.AwaitingResult = false
		m.LastStatus = "UP"
		m.ChecksTotal++
		m.ChecksOK++
		m.LatencySumMs += uint64(latencyUs / 1000)

		if m.ConfidenceScore < 100.0 {
			m.ConfidenceScore += 1.0 // Earn trust
			if m.ConfidenceScore > 100.0 {
				m.ConfidenceScore = 100.0
			}
		}
		m.ConsecutiveFails = 0
		m.IsVerification = false
		m.CurrentInterval = m.Interval
		intervalDur := time.Duration(m.CurrentInterval) * time.Second
		next := m.LastProbeSentAt.Add(intervalDur)
		if next.Before(time.Now()) {
			next = time.Now()
		}
		m.NextCheckAt = next
	}

	// Generation guard (Fix 3): pre-check generation BEFORE applying the CAS mutation.
	// If the result is stale (from a previous check interval), drop it entirely so
	// LastStatus is never written with a stale UP.
	if meta.ExpectedGeneration != 0 {
		var current *Monitor
		if p != nil {
			current = p.Load()
		} else {
			current = Store.Get(id)
		}
		if current != nil && current.CheckGeneration != meta.ExpectedGeneration {
			return // stale: generation advanced by reaper or next dispatch
		}
		if current != nil && !current.AwaitingResult {
			return // reaper already cleared the slot; not our result to write
		}
	}

	if p != nil {
		old, updated, ok = CASUpdateReturning(p, mutate)
	} else {
		old, updated, ok = Store.UpdateRuntime(id, mutate)
	}

	// Post-CAS guard catches any race between the pre-check and the CAS.
	if ok && meta.ExpectedGeneration != 0 && old != nil &&
		old.CheckGeneration != meta.ExpectedGeneration {
		// Undo: restore AwaitingResult so the monitor is not stuck waiting.
		if p != nil {
			CASUpdate(p, func(m *Monitor) { m.AwaitingResult = true })
		}
		return
	}
	if ok && old != nil && !old.AwaitingResult {
		return
	}

	if ok {
		SubmitCheckResult(id, EventCheckResult{
			Role:     RolePrimary,
			PoP:      "pop-local",
			ASN:      "asn-local",
			Ok:       true,
			ErrClass: ErrNone,
		})

		totLatUs := meta.TotalLatencyUs
		if totLatUs == 0 {
			totLatUs = latencyUs
		}
		attempts := meta.Attempts
		if attempts == 0 {
			attempts = 1
		}

		tsMs := meta.DispatchTimeMs
		if tsMs == 0 {
			tsMs = time.Now().UnixMilli()
		}
		Emit(Sample{
			MonitorID:      updated.ParsedUUID,
			TsMs:           tsMs,
			LatencyUs:      latencyUs,
			IntervalS:      uint16(updated.CurrentInterval),
			Status:         1,
			Err:            0,
			Kind:           typeToKind(updated.Type),
			ProbeKind:      meta.ProbeKind,
			PhaseKind:      meta.PhaseKind,
			Attempts:       attempts,
			TotalLatencyUs: totLatUs,
			Reused:         meta.Reused,
			DidResume:      meta.DidResume,
			ReqMethod:      meta.ReqMethod,
			ReqScheme:      meta.ReqScheme,
			Generation:     meta.ExpectedGeneration,
		})
	}
}

var lagChan = make(chan time.Duration, 100000)

// engineStartTime is used to suppress the TLS cache miss alert during the
// expected cold-start warm-up window. Setting it at package init means it
// resets correctly on each process restart.
var engineStartTime = time.Now()

// lastAlertTime rate-limits [ALERT] log lines to at most once per minute
// during steady-state operation. Zero value means no alert has fired yet.
var lastAlertTime time.Time

var (
	CurrentP50LagUs atomic.Uint64
	CurrentP99LagUs atomic.Uint64
)

func init() {
	go func() {
		ticker := time.NewTicker(5 * time.Second)
		var lags []time.Duration
		for {
			select {
			case lag := <-lagChan:
				lags = append(lags, lag)
			case <-ticker.C:
				if len(lags) == 0 {
					continue
				}
				printLagStats(lags)
				lags = make([]time.Duration, 0)
			}
		}
	}()
}

func LogEffectiveConfig(workers int) {
	arm := "C-on"
	idleDur := os.Getenv("MAX_IDLE_CONN_DURATION_S")
	if idleDur == "" {
		idleDur = "90"
	}
	if idleDur == "2" {
		arm = "C-off"
	}
	dnsCache := os.Getenv("ENGINE_DNS_CACHE")
	if dnsCache == "" {
		dnsCache = "off"
	}
	log.Printf("[EFFECTIVE_CONFIG] arm=%s commit=%s build_tag=%s workers=%d enable_engine_b=%v idle_conn_dur_s=%s dns_cache=%s rechecks=on tier_model=per_host compression_pct=%d",
		arm, buildCommit(), buildTags(), workers, EnableEngineB, idleDur, dnsCache, CompressionPercent.Load())
}

var lastHits int64
var lastMisses int64

func printLagStats(lags []time.Duration) {
	slices.Sort(lags)
	n := len(lags)
	p50 := lags[n/2]
	p95 := lags[(n*95)/100]
	p99 := lags[(n*99)/100]
	max := lags[n-1]

	CurrentP50LagUs.Store(uint64(p50.Microseconds()))
	CurrentP99LagUs.Store(uint64(p99.Microseconds()))

	hits := atomic.LoadInt64(&sessionCacheHits)
	misses := atomic.LoadInt64(&sessionCacheMisses)
	puts := atomic.LoadInt64(&sessionCachePuts)

	deltaHits := hits - lastHits
	deltaMisses := misses - lastMisses
	lastHits = hits
	lastMisses = misses

	totalDelta := deltaHits + deltaMisses
	if totalDelta > 1000 {
		hitRate := float64(deltaHits) / float64(totalDelta)
		if hitRate < 0.90 {
			now := time.Now()
			// Suppress during the first 120s post-restart: cold-start misses are
			// expected and the alert itself was measured at ~10% CPU overhead
			// (feedback loop: alert logging slows handshake completion, which
			// prolongs low hit rate, which fires more alerts).
			// After warm-up, rate-limit to once per minute to avoid similar storms
			// during transient churns (fleet additions, DNS refresh cycles, etc.).
			if now.Sub(engineStartTime) > 120*time.Second && now.Sub(lastAlertTime) > 60*time.Second {
				log.Printf("[ALERT] TLS Cache steady-state hit rate dropped to %.1f%%! Check LRU eviction thrashing.", hitRate*100)
				lastAlertTime = now
			}
		}
	}

	log.Printf("[LAG STATS] %d dispatches | p50: %v | p95: %v | p99: %v | max: %v | TLS Cache: Hits=%d Misses=%d Puts=%d", n, p50, p95, p99, max, hits, misses, puts)

	snap := SnapshotValidators(time.Now())
	if snap.Checked > 0 {
		saveablePct := pct(snap.BytesSaveable, snap.Bytes)
		log.Printf("[BODY_STATS] checked=%d etag=%d lm=%d lm_usable=%d stable=%d changed=%d bytes=%d saveable=%d (%.1f%%) eligible=%d verdict=%s",
			snap.Checked, snap.ETag, snap.LM, snap.LMUsable, snap.StablePairs, snap.ChangedPairs, snap.Bytes, snap.BytesSaveable, saveablePct, snap.EligibleMonitors, snap.Verdict())
	}
	LogTLSStats()
	LogConnStats()
}

type DispatchJob struct {
	ptr            *atomic.Pointer[Monitor]
	m              *Monitor
	generation     uint64 // CheckGeneration at dispatch time; guards ABA late-result
	isVerification bool
	dispatchedAt   time.Time
}

func doWithContext(ctx context.Context, client *fasthttp.Client, req *fasthttp.Request, res *fasthttp.Response, timeout time.Duration, dialedPtr *bool, didResumePtr *bool) (error, bool, bool) {
	deadline := time.Now().Add(timeout)
	doneCh := make(chan error, 1)
	go func() {
		gid := setGoroutineDialing(dialedPtr, didResumePtr, deadline)
		defer clearGoroutineDialing(gid)
		doneCh <- client.DoTimeout(req, res, timeout)
	}()
	select {
	case <-ctx.Done():
		return ctx.Err(), true, false
	case err := <-doneCh:
		return err, false, false
	case <-time.After(timeout + 500*time.Millisecond):
		// Enforce strict probe budget. fasthttp uses ReadTimeout+WriteTimeout (20s)
		// for TLS handshakes, ignoring the request timeout. We abandon the request
		// to prevent the worker from hanging, returning false so the worker isn't killed.
		return fasthttp.ErrTimeout, false, true
	}
}

func StartWorkers(ctx context.Context, wg *sync.WaitGroup, workerCount int, jobs <-chan DispatchJob) {
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case job := <-jobs:
					if ctx.Err() != nil {
						return
					}
					ChecksInFlight.Add(1)
					m := job.m
					p := job.ptr
					// Note: AwaitingResult and LastProbeSentAt are already set by
					// MasterDispatcher BEFORE the channel send (queueing-gap fix).
					// Do NOT re-stamp LastProbeSentAt here — that would silently reset
					// the reaper's timeout clock to dequeue time, granting queued monitors
					// a free extra window equal to their queue wait.

					var errClass ErrClass = ErrNone
					var customMsg string
					var latency uint64
					var err error

					timeoutDuration := 10 * time.Second
					if m.TimeoutMs > 0 {
						timeoutDuration = time.Duration(m.TimeoutMs) * time.Millisecond
					} else if m.Timeout > 0 {
						timeoutDuration = time.Duration(m.Timeout) * time.Second
					}
					if timeoutDuration > 10*time.Second {
						timeoutDuration = 10 * time.Second
					}

					start := time.Now()
					dispatchLag := start.Sub(m.NextCheckAt)
					if dispatchLag < 0 {
						dispatchLag = 0
					}
					if dispatchLag > 2*time.Second {
						ChecksLate.Add(1)
					}
					select {
					case lagChan <- dispatchLag:
					default:
					}

					statusCode := 0

					var probeKind = "warm"
					var reused bool
					var didResumeVal uint8
					var reqMethod uint8 = 2 // 2=OTHER
					var reqScheme uint8 = 0

					// Protocol multiplexer
					if m.Type == "http" || m.Type == "keyword" || m.Type == "api" {
						req := fasthttp.AcquireRequest()
						res := fasthttp.AcquireResponse()
						req.SetRequestURI(m.URL)

						if strings.HasPrefix(m.URL, "https://") {
							reqScheme = 1 // 1=HTTPS
						}

						// HEAD for plain http/api (no keyword, no ForceGET).
						// GET only when body is needed (keyword match) or learned (ForceGET).
						if m.Keyword != "" {
							req.Header.SetMethod("GET")
							res.SkipBody = false
							reqMethod = 1 // 1=GET
						} else if m.ForceGET {
							req.Header.SetMethod("GET")
							req.Header.Set("Range", "bytes=0-0") // Learned-GET status check: request 1 byte to avoid downloading full body
							res.SkipBody = false
							reqMethod = 1 // 1=GET
						} else {
							req.Header.SetMethod("HEAD") // Save bandwidth
							res.SkipBody = true
							reqMethod = 0 // 0=HEAD
						}
						req.Header.Set("User-Agent", "Uptime-Engine/1.0")
						initReqID := fmt.Sprintf("%s-%d-1", m.ID, job.generation)
						if job.isVerification {
							initReqID = fmt.Sprintf("%s-%d-v1", m.ID, job.generation)
						}
						req.Header.Set("X-Request-ID", initReqID)
						if m.Keyword != "" && compressionEnabledFor(m.ID) {
							req.Header.Set("Accept-Encoding", "gzip")
						}

						var timeoutDuration time.Duration
						if m.TimeoutMs > 0 {
							timeoutDuration = time.Duration(m.TimeoutMs) * time.Millisecond
						} else if m.Timeout > 0 {
							timeoutDuration = time.Duration(m.Timeout) * time.Second
						} else {
							timeoutDuration = 10 * time.Second // safe default
						}
						if timeoutDuration > 10*time.Second {
							timeoutDuration = 10 * time.Second
						}
						monKey := MonitorKey(m.ID)
						nowS := start.Unix()
						conditionalInjected := false
						if m.Keyword != "" && !m.ForceGET && m.ConsecutiveFails == 0 {
							conditionalInjected = InjectValidators(monKey, req, nowS, floorSeconds)
						}

						client := GetHTTPClient(m, monKey)
						parsedHost := ExtractHost(m.URL)
						if isFullPhaseNeeded(m, time.Now()) {
							go executeFullPhaseProbe(ctx, p, m, monKey)
						}
						if globalHostReconnectTracker.ShouldForceReconnect(parsedHost) || m.NoKeepAlive || m.LatchedNoKeepAlive {
							req.SetConnectionClose()
						}

						var dialed bool
						var didResume bool
						deadline := start.Add(timeoutDuration)

						var leaked, abandoned bool
						err, leaked, abandoned = doWithContext(ctx, client, req, res, time.Until(deadline), &dialed, &didResume)
						if leaked {
							ChecksInFlight.Add(-1)
							return
						}
						if abandoned {
							errClass = ErrTimeout
							customMsg = "fasthttp hung, request abandoned to save worker"
							goto httpDone
						}
						elapsed := time.Since(start)
						latency = uint64(elapsed.Microseconds())
						statusCode = res.StatusCode()
						reused = !dialed
						if didResume {
							didResumeVal = 1
						} else {
							didResumeVal = 0
						}

						// HEAD→405/501: server doesn't support HEAD. Learn it per-monitor so
						// we don't retry HEAD every interval. Use Range to avoid downloading
						// a full body for the learned-GET path.
						if err == nil && !m.ForceGET && m.Keyword == "" && (statusCode == 405 || statusCode == 501) {
							Store.UpdateRuntime(m.ID, func(mon *Monitor) { mon.ForceGET = true })
							atomic.AddInt64(&ForceGETLearned, 1)
							req.Header.SetMethod("GET")
							reqMethod = 1                        // 1=GET
							req.Header.Set("Range", "bytes=0-0") // avoid body download on learned-GET
							res.SkipBody = true
							var rDialed bool
							var rDidResume bool
							var leaked2 bool

							rem := time.Until(deadline)
							if rem <= 0 {
								err = fasthttp.ErrTimeout
							} else {
								var abandoned2 bool
								err, leaked2, abandoned2 = doWithContext(ctx, client, req, res, rem, &rDialed, &rDidResume)
								if abandoned2 {
									errClass = ErrTimeout
									customMsg = "fasthttp hung on GET retry, abandoned"
									abandoned = true
									goto httpDone
								}
							}
							if leaked2 {
								ChecksInFlight.Add(-1)
								return
							}
							latency = uint64(time.Since(start).Microseconds())
							statusCode = res.StatusCode()
							if rDidResume {
								didResumeVal = 1
							}
						}

						// Explicit single retry on fresh connection ONLY when failure occurs on a warm reused socket
						// AND remaining budget > 200ms (never retry timeouts: timeouts are genuine failures)
						remainingBudget := time.Until(deadline)
						if err != nil && reused && remainingBudget > 200*time.Millisecond && isStaleSocketError(err) {
							probeKind = "warm_retry"
							reused = false      // retry is always executed on a fresh connection
							didResumeVal = 0    // observed from TLS handshake on fresh dial
							if errors.Is(err, io.EOF) || errors.Is(err, fasthttp.ErrConnectionClosed) {
								WarmRetryEOF.Add(1)
							} else if strings.Contains(strings.ToLower(err.Error()), "reset") {
								WarmRetryReset.Add(1)
							} else {
								WarmRetryOther.Add(1)
							}

							req.SetConnectionClose()
							retryReqID := fmt.Sprintf("%s-%d-2", m.ID, job.generation)
							if job.isVerification {
								retryReqID = fmt.Sprintf("%s-%d-v2", m.ID, job.generation)
							}
							req.Header.Set("X-Request-ID", retryReqID)

							// Preserve SkipBody across retry strictly for HEAD status probes.
							// Forced-GET probes require res.SkipBody = false to read their 1-byte Range response.
							if reqMethod == 0 {
								res.SkipBody = true
							}

							var retryDialed bool
							var retryDidResume bool
							rstart := time.Now()
							var leaked3, abandoned3 bool
							retryErr, leaked3, abandoned3 := doWithContext(ctx, client, req, res, remainingBudget, &retryDialed, &retryDidResume)
							if leaked3 {
								ChecksInFlight.Add(-1)
								return
							}
							if abandoned3 {
								errClass = ErrTimeout
								customMsg = "fasthttp hung on warm retry, abandoned"
								abandoned = true
								break
							}
							rElapsed := time.Since(rstart)
							latency = uint64((elapsed + rElapsed).Microseconds())

							if retryDidResume {
								didResumeVal = 1
							} else {
								didResumeVal = 0
							}

							if retryErr == nil {
								err = nil
								statusCode = res.StatusCode()
								reused = false // retry occurred on fresh dial; prevent line 1030 from resetting StaleSocketCount
								CASUpdate(p, func(mon *Monitor) {
									mon.StaleSocketCount++
									if mon.StaleSocketCount >= 3 {
										// Latch into non-keep-alive after 3 consecutive stale socket events
										mon.LatchedNoKeepAlive = true
									}
								})
							} else {
								err = fmt.Errorf("warm_err: %v | retry_err: %v", err, retryErr)
								if res.StatusCode() > 0 {
									statusCode = res.StatusCode()
								}
							}
						}

						cc := atomic.AddUint32(&m.CheckCounter, 1)
						if m.LatchedNoKeepAlive && cc%60 == 0 {
							// Periodic keep-alive re-probe: allow socket reuse to be re-evaluated every 60 checks
							// strictly for monitors that were temporarily latched by consecutive stale socket errors.
							CASUpdate(p, func(mon *Monitor) {
								mon.LatchedNoKeepAlive = false
								mon.StaleSocketCount = 0
							})
						} else if err == nil && reused && statusCode >= 200 && statusCode < 400 && m.StaleSocketCount > 0 {
							// Reset stale socket count on successful reuse
							CASUpdate(p, func(mon *Monitor) {
								mon.StaleSocketCount = 0
							})
						}


						if err != nil {
							errClass = classifyNetError(err, false)
							if errClass != ErrTimeout {
								log.Printf("HTTP error for %s: %v", m.URL, err)
							}
							DropValidatorState(monKey)
						} else {
							statusOK := false
							if conditionalInjected && statusCode == fasthttp.StatusNotModified {
								// Conditional hit: pass 304 without ExpectedStatus check or body download
								statusOK = true
							} else if len(m.ExpectedStatus) > 0 {
								for _, s := range m.ExpectedStatus {
									if statusCode == s {
										statusOK = true
										break
									}
								}
							} else {
								statusOK = (statusCode >= 200 && statusCode < 400)
								if !statusOK && statusCode == fasthttp.StatusRequestedRangeNotSatisfiable && m.ForceGET && m.Keyword == "" {
									// RFC 9110 §14.4: Range: bytes=0-0 on an empty resource returns 416 (Range Not Satisfiable).
									// For a learned-GET status probe, 416 proves the server is reachable and responsive.
									statusOK = true
								}
							}

							if !statusOK {
								errClass = ErrStatus
								DropValidatorState(monKey)
							} else if conditionalInjected && statusCode == fasthttp.StatusNotModified {
								// 304 conditional hit: pass check cleanly without body read
							} else if reqMethod == 1 {
								limit := 65536
								if m.Keyword != "" {
									limit = int(m.KeywordMaxBytes)
									if limit <= 0 {
										limit = 65536
									}
								} else if m.ForceGET {
									// Learned-GET without keyword: status-only probe with Range: bytes=0-0.
									// Cap limit at 1 byte to prevent downloading up to 64 KB of body.
									limit = 1
								}

								br, rerr := ReadKeywordBody(res, limit, deadline)
								canary := compressionEnabledFor(m.ID)
								RecordBody(canary, br.Encoding, br.WireBytes, len(br.Body), br.WindowFull, rerr != nil)
								ObserveValidators(monKey, res, int(br.WireBytes), time.Now())

								if m.Keyword != "" {
									keywordFound := SearchKeywordMonitor(br.Body, m) >= 0
									switch {
									case keywordFound && rerr == nil:
										etag := res.Header.Peek(fasthttp.HeaderETag)
										lm := res.Header.Peek(fasthttp.HeaderLastModified)
										StoreValidatorState(monKey, etag, lm, nowS, !conditionalInjected)
									case keywordFound && rerr != nil:
										// Keyword found in prefix, but response errored/truncated.
										// Pass the check, but DO NOT store validators for incomplete response.
										DropValidatorState(monKey)
									case rerr != nil:
										errClass = classifyBodyErr(rerr)
										customMsg = fmt.Sprintf("body read error: %v", rerr)
										DropValidatorState(monKey)
									default:
										errClass = ErrKeyword
										customMsg = fmt.Sprintf("keyword %q not found in first %d bytes", m.Keyword, len(br.Body))
										DropValidatorState(monKey)
									}
								} else if rerr != nil {
									if errClass == "" {
										errClass = classifyBodyErr(rerr)
										customMsg = fmt.Sprintf("body drain error: %v", rerr)
									}
								}

								if br.WindowFull || rerr != nil {
									req.SetConnectionClose()
									res.SetConnectionClose()
								}
								br.Release()
							}
						}

						// MUST force close the stream. If we didn't fully consume it,
						// SetConnectionClose ensures the pool drops it.
						if res.BodyStream() != nil {
							if res.ConnectionClose() || req.ConnectionClose() {
								res.SetConnectionClose()
							}
							_ = res.CloseBodyStream()
						}

						if !abandoned {
							fasthttp.ReleaseRequest(req)
							fasthttp.ReleaseResponse(res)
						}

					} else if m.Type == "port" {
						// Subphase 2.3: Non-blocking TCP Port Prober with SO_LINGER{1, 0}
						res := ProbeTCPPort(ctx, m.URL, timeoutDuration)
						latency = uint64(res.Latency.Microseconds())
						errClass = res.ErrClass
						customMsg = res.ErrorMessage
					} else if m.Type == "ping" {
						// Subphase 2.4: Unprivileged Non-Root ICMP Ping Engine
						res := ProbeICMPPing(ctx, m.URL, timeoutDuration)
						latency = uint64(res.RTT.Microseconds())
						errClass = res.ErrClass
						customMsg = res.ErrorMessage
					} else if m.Type == "dns" {
						res := ProbeDNS(ctx, m.URL, "", 0, timeoutDuration)
						latency = uint64(res.Latency.Microseconds())
						errClass = res.ErrClass
						customMsg = res.ErrorMessage
					} else if m.Type == "udp" {
						res := ProbeUDP(ctx, m.URL, nil, timeoutDuration)
						latency = uint64(res.Latency.Microseconds())
						errClass = res.ErrClass
						customMsg = res.ErrorMessage
					} else {
						// Remaining Non-HTTP Protocols (Heartbeat)
						time.Sleep(2 * time.Millisecond) // loadtest: reduced from 50ms to free CPU
						latency = uint64(time.Since(start).Microseconds())
						errClass = ErrNone
					}

				httpDone:
					probeKindVal := uint8(0)
					if job.isVerification {
						probeKindVal = 1
					}

					phaseKindVal := uint8(0)
					if probeKind == "warm_retry" {
						phaseKindVal = 2
					}

					attemptsVal := uint8(1)
					if probeKind == "warm_retry" {
						attemptsVal = 2
					}

					reusedVal := uint8(0)
					if reused {
						reusedVal = 1
					}

					dispatchTime := job.dispatchedAt
					if dispatchTime.IsZero() {
						dispatchTime = start
					}
					meta := ProbeMeta{
						ProbeKind:          probeKindVal,
						PhaseKind:          phaseKindVal,
						Attempts:           attemptsVal,
						TotalLatencyUs:     uint32(latency),
						Reused:             reusedVal,
						DidResume:          didResumeVal,
						ReqMethod:          reqMethod,
						ReqScheme:          reqScheme,
						ExpectedGeneration: job.generation,
						DispatchTimeMs:     dispatchTime.UnixMilli(),
					}
					ChecksCompleted.Add(1)

					if errClass == ErrNone {
						StepDNSTemporaryEvaluationOnMonitor(m, m.Interval, errClass)
						HandleSuccessDetailed(m.ID, p, uint32(latency), meta)
					} else if errClass == ErrUnsupported || errClass == ErrLocalResource || errClass == ErrDNSTemporary || errClass == ErrSlow {
						// Inconclusive check:
						// 1. ErrUnsupported: unsupported compression window > 2MB.
						// 2. ErrLocalResource: local exhaustion (EMFILE, EADDRNOTAVAIL, ENOBUFS, ENOMEM, EPERM).
						// 3. ErrDNSTemporary: resolver timeout or temporary failure (not an NXDOMAIN / host not found).
						// 4. ErrSlow: rate limiter cooldown / singleflight safety valve.
						// Inconclusive checks HOLD any pending DNS temporary failure counter without incrementing.
						StepDNSTemporaryEvaluationOnMonitor(m, m.Interval, errClass)
						if errClass == ErrLocalResource {
							cnt := atomic.AddUint64(&LocalResourceExhaustionCount, 1)
							if cnt%100 == 1 {
								log.Printf("ALERT: high rate of local resource exhaustion (EMFILE/EADDRNOTAVAIL): count=%d", cnt)
							}
						} else if errClass == ErrDNSTemporary {
							atomic.AddUint64(&DNSTemporaryCount, 1)
							_, escalated := StepDNSTemporaryEvaluationOnMonitor(m, m.Interval, errClass)
							if escalated {
								// Escalate to definitive failure: 5 consecutive SERVFAILs indicate broken authoritative DNS!
								cause := "DNS Outage (Escalated after 5 consecutive SERVFAIL/temporary failures)"
								msg := customMsg
								if msg == "" {
									msg = "persistent DNS resolver failure"
								}
								HandleFailureDetailed(m.ID, p, ErrDNS, cause, msg, meta)
								ChecksInFlight.Add(-1)
								continue
							}
						}
						HandleInconclusiveDetailed(m.ID, p, meta)
					} else {
						StepDNSTemporaryEvaluationOnMonitor(m, m.Interval, errClass)
						if m.Keyword != "" {
							ResetValidatorBaseline(MonitorKey(m.ID))
						}
						cause := "HTTP Check Failed"
						msg := "Unknown error"
						if customMsg != "" {
							msg = customMsg
						} else if err != nil {
							msg = err.Error()
						} else {
							msg = fmt.Sprintf("HTTP %d", statusCode)
						}

						// Debug: log first 20 HTTP errors
						if atomic.AddInt32(&httpErrorCount, 1) <= 20 {
							log.Printf("[DEBUG] HTTP Check Failed for %s: %s", m.URL, msg)
						}

						HandleFailureDetailed(m.ID, p, errClass, cause, msg, meta)
					}
					ChecksInFlight.Add(-1)
				}
			}
		}()
	}
}

var httpErrorCount int32

// ForceGETLearned counts the number of HEAD→GET upgrades learned at runtime
// (server returned 405/501 on HEAD). This quantifies bandwidth model deviation
// from the HEAD-only assumption.
var ForceGETLearned int64

// QueueFull records dispatches rejected because a worker queue was saturated.
// A nonzero value invalidates a soak comparison; it is not merely a warning.
var QueueFull atomic.Uint64

// ChecksLate records checks whose dispatch lag exceeded 2 seconds.
var ChecksLate atomic.Uint64

// ChecksCompleted records total probes completed by workers.
var ChecksCompleted atomic.Uint64

func MasterDispatcher(ctx context.Context, wg *sync.WaitGroup, httpJobs chan<- DispatchJob, netJobs chan<- DispatchJob) {
	defer wg.Done()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	due := make([]DispatchJob, 0, 1000)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			due = due[:0] // Reuse slice memory
			now := time.Now()
			Store.Mu.RLock()
			for _, ptr := range Store.Monitors {
				m := ptr.Load()
				if !m.IsPaused && !m.AwaitingResult && !now.Before(m.NextCheckAt) {
					due = append(due, DispatchJob{ptr: ptr, m: m})
				}
			}
			Store.Mu.RUnlock()

			for _, item := range due {
				// Claim it BEFORE it touches the channel to close the queueing gap.
				// Increment CheckGeneration atomically so any late result from the
				// previous check (check N-1) arriving during check N is rejected.
				var gen uint64
				var isVerif bool
				CASUpdate(item.ptr, func(mon *Monitor) {
					mon.AwaitingResult = true
					mon.LastProbeSentAt = now
					mon.CheckGeneration++
					gen = mon.CheckGeneration
					isVerif = mon.IsVerification
					mon.IsVerification = false
				})
				item.generation = gen
				item.isVerification = isVerif
				item.dispatchedAt = now

				if item.m.Type != "http" && item.m.Type != "keyword" && item.m.Type != "api" {
					if EnableEngineB {
						dispatchEBPFPing(item.m, item.ptr)
						continue
					}
					// If Engine B is disabled, let it fall through to Engine A (StartWorkers)
				}

				if item.m.Type == "http" || item.m.Type == "keyword" || item.m.Type == "api" {
					select {
					case httpJobs <- item:
					default:
						QueueFull.Add(1)
						// Queue saturated. Revert claim so we don't trigger a false timeout.
						CASUpdate(item.ptr, func(mon *Monitor) {
							mon.AwaitingResult = false
						})
						log.Printf("HTTP queue full, skipping %s this tick", item.m.ID)
					}
				} else {
					select {
					case netJobs <- item:
					default:
						QueueFull.Add(1)
						CASUpdate(item.ptr, func(mon *Monitor) {
							mon.AwaitingResult = false
						})
						log.Printf("Net queue full, skipping %s this tick", item.m.ID)
					}
				}
			}
		}
	}
}

func StartReaper(ctx context.Context, wg *sync.WaitGroup) {
	defer wg.Done()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	expired := make([]string, 0, 1000)
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			expired = expired[:0] // Reuse slice memory
			now := time.Now()
			Store.Mu.RLock()
			for id, ptr := range Store.Monitors {
				m := ptr.Load()
				if m.AwaitingResult {
					// Derive the effective probe timeout using the same fallback logic as the workers.
					var effectiveTimeout time.Duration
					if m.TimeoutMs > 0 {
						effectiveTimeout = time.Duration(m.TimeoutMs) * time.Millisecond
					} else if m.Timeout > 0 {
						effectiveTimeout = time.Duration(m.Timeout) * time.Second
					} else {
						effectiveTimeout = 10 * time.Second
					}
					if effectiveTimeout > 30*time.Second {
						effectiveTimeout = 30 * time.Second
					}
					// 2s grace period so the worker has time to return before reaper fires
					if now.Sub(m.LastProbeSentAt) > effectiveTimeout+2*time.Second {
						expired = append(expired, id)
					}
				}
			}
			Store.Mu.RUnlock()

			for _, id := range expired {
				Store.UpdateRuntime(id, func(m *Monitor) {
					m.AwaitingResult = false
					m.NextCheckAt = time.Now().Add(time.Duration(m.Interval) * time.Second)
					m.CheckGeneration++ // advance generation so any in-flight worker is rejected

					// ErrNotExecuted: the reaper fires because the check deadline expired before
					// the worker completed. MUST NOT call HandleFailure -- that converts engine
					// overload into a false DOWN (Goal 1, Req 6). Non-zero reaper rows
					// invalidate any benchmark run (Goal 2).
					Emit(Sample{
						MonitorID:      m.ParsedUUID,
						TsMs:           time.Now().UnixMilli(),
						LatencyUs:      0,
						Status:         3,   // 3 = Reaped / ErrNotExecuted (never DOWN, never UP)
						Err:            255, // ErrNotExecuted sentinel -- never maps to DOWN state
						Kind:           typeToKind(m.Type),
						ProbeKind:      0,
						IntervalS:      uint16(m.Interval),
						PhaseKind:      0,
						Attempts:       uint8(m.ConsecutiveFails),
						TotalLatencyUs: 0,
						Reused:         0,
						DidResume:      0,
						ReqMethod:      3, // 3=REAPER (distinct from 0=HEAD, 1=GET, 2=OTHER)
						ReqScheme:      0,
						Generation:     m.CheckGeneration,
					})
				})
			}
		}
	}
}

// Temporary stubs
// (eBPF functions will go here in Phase 3)

func dispatchEBPFPing(m *Monitor, p *atomic.Pointer[Monitor]) {
	if m.TargetIP == "" {
		// DO NOT call HandleFailure. Reset AwaitingResult so it retries at normal interval
		CASUpdate(p, func(mon *Monitor) {
			mon.AwaitingResult = false
			mon.NextCheckAt = time.Now().Add(time.Duration(mon.CurrentInterval) * time.Second)
		})
		return
	}

	nonce, ok := Store.NextNonce(m.ID)
	if !ok {
		return // Monitor deleted mid-dispatch
	}

	hash := CalculateHash(m.TargetIP, m.ID, nonce)
	sendRawSocket(m, p, nonce, hash)
}

func executeFullPhaseProbe(ctx context.Context, p *atomic.Pointer[Monitor], m *Monitor, monKey uint64) {
	InitHTTPClients(0)
	req := fasthttp.AcquireRequest()
	res := fasthttp.AcquireResponse()
	defer func() {
		fasthttp.ReleaseRequest(req)
		fasthttp.ReleaseResponse(res)
	}()

	req.SetRequestURI(m.URL)
	req.Header.SetMethod("HEAD")
	req.Header.Set("User-Agent", "Uptime-Engine/1.0")
	req.Header.Set("X-Request-ID", fmt.Sprintf("%s-%d-3", m.ID, m.CheckGeneration))
	req.SetConnectionClose()
	res.SkipBody = true

	timeout := 5 * time.Second
	if m.Timeout > 0 {
		timeout = time.Duration(m.Timeout) * time.Second
	}
	if timeout > 10*time.Second {
		timeout = 10 * time.Second
	}

	start := time.Now()
	var dialed bool
	var didResume bool
	err, _, abandoned := doWithContext(ctx, HTTPClients.FullPhase, req, res, timeout, &dialed, &didResume)
	if abandoned {
		return
	}
	elapsed := time.Since(start)

	CASUpdate(p, func(mon *Monitor) {
		mon.FullPhaseCount++
		mon.LastFullPhaseAt = time.Now()
		mon.FullPhaseInterval = GetFullPhaseInterval(monKey, mon.FullPhaseCount)
	})

	statusCode := res.StatusCode()
	statusVal := uint8(0)
	errVal := uint8(0)
	if err == nil && statusCode >= 200 && statusCode < 400 {
		statusVal = 1
	} else {
		errVal = 1
	}

	// Emit sample to ClickHouse with ProbeKind=1 (diagnostic/verification, filtered from scheduled lag detector)
	// and PhaseKind=1, Attempts=3 to keep mock join 1-to-1 without mutating monitor operational state
	Emit(Sample{
		MonitorID:      m.ParsedUUID,
		TsMs:           start.UnixMilli(),
		LatencyUs:      uint32(elapsed.Microseconds()),
		IntervalS:      uint16(m.Interval),
		Status:         statusVal,
		Err:            errVal,
		Kind:           typeToKind(m.Type),
		ProbeKind:      2, // Dedicated 2 = Full-phase cert probe (0=scheduled, 1=verification)
		PhaseKind:      1, // Full-phase probe
		Attempts:       3, // Dedicated attempt suffix 3 to keep mock join 1-to-1
		TotalLatencyUs: uint32(elapsed.Microseconds()),
		Reused:         0,
		DidResume:      0,
		ReqMethod:      0,
		ReqScheme:      1,
		Generation:     m.CheckGeneration,
	})
}

