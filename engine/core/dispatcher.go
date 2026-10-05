package core

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"net/netip"
	"os"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
	"github.com/your-org/uptime-engine/netsec"
)

var (
	sessionCacheHits   int64
	sessionCacheMisses int64
	sessionCachePuts   int64
)

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

func resolveHostForDNSCache(ctx context.Context, host string) ([]netip.Addr, error) {
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
	}
	tlsInitOnce sync.Once
)

func InitTLSConfig(monitorCount int) {
	InitHTTPClients(monitorCount)
}

func guardedDial(d *CachedDialer) fasthttp.DialFunc {
	return func(addr string) (net.Conn, error) {
		host, _, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		if ip, perr := netip.ParseAddr(host); perr == nil && isBlockedIP(ip.Unmap()) {
			return nil, netsec.ErrSSRFBlocked
		}
		return d.Dial(addr)
	}
}

var dnsCacheMode = os.Getenv("ENGINE_DNS_CACHE") // "off", "shadow", "on"

func newHTTPClient(d *CachedDialer, tlsCfg *tls.Config) *fasthttp.Client {
	return &fasthttp.Client{
		MaxConnsPerHost:     10000,
		MaxIdleConnDuration: 35 * time.Second, // 35s window enables keep-alive reuse across 30s check cycles
		ReadTimeout:         10 * time.Second, // Phase 1 safe core backstop
		ReadBufferSize:      16384,            // Support large headers up to 16KB without error
		WriteBufferSize:     8192,
		StreamResponseBody:  true,
		TLSConfig:           tlsCfg,
		Dial:                guardedDial(d),
	}
}

func InitHTTPClients(monitorCount int) {
	tlsInitOnce.Do(func() {
		cacheSize := monitorCount + (monitorCount / 10) // 10% headroom to prevent thrashing while saving RAM
		if cacheSize < 100000 {
			cacheSize = 100000
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
	})
}

func GetHTTPClient(m *Monitor, monKey uint64) *fasthttp.Client {
	if HTTPClients.Cached == nil {
		InitHTTPClients(50000)
	}

	useClassical := isClassicalCohortEnabled(monKey) && !hasCredentials(m)
	useFresh := (m.ConsecutiveFails > 0) || (dnsCacheMode != "on" && dnsCacheMode != "shadow")

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

func HandleFailure(id string, p *atomic.Pointer[Monitor], errClass ErrClass, cause string, firstError string) {
	var updated *Monitor
	var ok bool
	mutate := func(m *Monitor) {
		if !m.AwaitingResult {
			return // Already resolved since snapshot. Idempotency lock.
		}
		m.AwaitingResult = false
		m.ChecksTotal++

		// Confidence decay
		m.ConfidenceScore -= 1.0
		if m.ConfidenceScore < 0 { m.ConfidenceScore = 0 }

		m.ConsecutiveFails++
		if m.ConsecutiveFails < 2 {
			m.CurrentInterval = 5
		} else {
			m.CurrentInterval = m.Interval
		}
		m.NextCheckAt = time.Now().Add(time.Duration(m.CurrentInterval) * time.Second)
	}

	if p != nil {
		_, updated, ok = CASUpdateReturning(p, mutate)
	} else {
		_, updated, ok = Store.UpdateRuntime(id, mutate)
	}

	if ok && updated.AwaitingResult == false {
		SubmitCheckResult(id, EventCheckResult{
			Role:     RolePrimary,
			PoP:      "pop-local",
			ASN:      "asn-local",
			Ok:       false,
			ErrClass: errClass,
		})

		Emit(Sample{
			MonitorID: updated.ParsedUUID,
			TsMs:      time.Now().UnixMilli(),
			LatencyUs: 0,
			IntervalS: uint16(updated.CurrentInterval),
			Status:    0,
			Err:       1, // Timeout/Failure
			Kind:      typeToKind(updated.Type),
		})
	}
}

// typeToKind maps monitor string type to integer kind for telemetry.
func typeToKind(mType string) uint8 {
	switch mType {
	case "http": return 1
	case "keyword": return 2
	case "ping": return 3
	case "port": return 4
	case "heartbeat": return 5
	case "dns": return 6
	case "api": return 7
	case "udp": return 8
	default: return 0
	}
}

func HandleSuccess(id string, p *atomic.Pointer[Monitor], latencyMs uint64) {
	var updated *Monitor
	var ok bool
	mutate := func(m *Monitor) {
		if !m.AwaitingResult {
			return
		}
		m.AwaitingResult = false
		m.ChecksTotal++
		m.ChecksOK++
		m.LatencySumMs += latencyMs
		
		if m.ConfidenceScore < 100.0 {
			m.ConfidenceScore += 1.0 // Earn trust
			if m.ConfidenceScore > 100.0 { m.ConfidenceScore = 100.0 }
		}
		m.ConsecutiveFails = 0
		m.CurrentInterval = m.Interval
		m.NextCheckAt = time.Now().Add(time.Duration(m.CurrentInterval) * time.Second)
	}

	if p != nil {
		_, updated, ok = CASUpdateReturning(p, mutate)
	} else {
		_, updated, ok = Store.UpdateRuntime(id, mutate)
	}

	if ok && updated.AwaitingResult == false {
		SubmitCheckResult(id, EventCheckResult{
			Role:     RolePrimary,
			PoP:      "pop-local",
			ASN:      "asn-local",
			Ok:       true,
			ErrClass: ErrNone,
		})

		Emit(Sample{
			MonitorID: updated.ParsedUUID,
			TsMs:      time.Now().UnixMilli(),
			LatencyUs: uint32(latencyMs * 1000), // convert ms to us
			IntervalS: uint16(updated.CurrentInterval),
			Status:    1,
			Err:       0,
			Kind:      typeToKind(updated.Type),
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

func init() {
	go func() {
		ticker := time.NewTicker(30 * time.Second)
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

var lastHits int64
var lastMisses int64

func printLagStats(lags []time.Duration) {
	slices.Sort(lags)
	n := len(lags)
	p50 := lags[n/2]
	p95 := lags[(n*95)/100]
	p99 := lags[(n*99)/100]
	max := lags[n-1]
	
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
	ptr *atomic.Pointer[Monitor]
	m   *Monitor
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
				statusCode := 0

				// Protocol multiplexer
				if m.Type == "http" || m.Type == "keyword" || m.Type == "api" {
					req := fasthttp.AcquireRequest()
					res := fasthttp.AcquireResponse()
					req.SetRequestURI(m.URL)

					if m.ForceGET || m.Keyword != "" {
						req.Header.SetMethod("GET")
						res.SkipBody = (m.Keyword == "")
					} else {
						req.Header.SetMethod("HEAD") // Save bandwidth
						res.SkipBody = true
					}
					req.Header.Set("User-Agent", "Uptime-Engine/1.0")
					if m.Keyword != "" && compressionEnabledFor(m.ID) {
						req.Header.Set("Accept-Encoding", AcceptEncoding)
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
					start = time.Now()
					err = client.DoTimeout(req, res, timeoutDuration)
					latency = uint64(time.Since(start).Milliseconds())
					statusCode = res.StatusCode()

					// HEAD→405/501: server doesn't support HEAD. Learn it per-monitor so
					// we don't retry HEAD every interval. Use Range to avoid downloading
					// a full body for the learned-GET path.
					if err == nil && !m.ForceGET && m.Keyword == "" && (statusCode == 405 || statusCode == 501) {
						Store.UpdateRuntime(m.ID, func(mon *Monitor) { mon.ForceGET = true })
						req.Header.SetMethod("GET")
						req.Header.Set("Range", "bytes=0-0") // avoid body download on learned-GET
						res.SkipBody = true
						start = time.Now()
						err = client.DoTimeout(req, res, timeoutDuration)
						latency = uint64(time.Since(start).Milliseconds())
						statusCode = res.StatusCode()
					}

					dispatchLag := time.Since(m.NextCheckAt)
					select {
					case lagChan <- dispatchLag:
					default:
					}

					if err != nil {
						errClass = classifyNetError(err, false)
						DropValidatorState(monKey)
					} else {
						statusOK := false
						if conditionalInjected && statusCode == fasthttp.StatusNotModified {
							// Conditional hit: pass 304 without ExpectedStatus check or body download
							statusOK = true
						} else if len(m.ExpectedStatus) > 0 {
							for _, s := range m.ExpectedStatus {
								if statusCode == s { statusOK = true; break }
							}
						} else {
							statusOK = (statusCode >= 200 && statusCode < 400)
						}
						
						if !statusOK {
							errClass = ErrStatus
							DropValidatorState(monKey)
						} else if statusCode == fasthttp.StatusNotModified {
							// 304 conditional hit: pass check cleanly without body read
						} else if m.Keyword != "" {
							limit := int(m.KeywordMaxBytes)
							if limit <= 0 { limit = 65536 }
							
							br, rerr := ReadKeywordBody(res, limit)
							canary := compressionEnabledFor(m.ID)
							RecordBody(canary, br.Encoding, br.WireBytes, len(br.Body), br.WindowFull, rerr != nil)
							ObserveValidators(monKey, res, int(br.WireBytes), time.Now())

							switch {
							case bytes.Contains(br.Body, []byte(m.Keyword)):
								// present: store validator state for future conditional GETs
								etag := res.Header.Peek(fasthttp.HeaderETag)
								lm := res.Header.Peek(fasthttp.HeaderLastModified)
								StoreValidatorState(monKey, etag, lm, nowS, !conditionalInjected)
							case rerr != nil:
								errClass = classifyBodyErr(rerr)
								customMsg = fmt.Sprintf("body read error: %v", rerr)
								DropValidatorState(monKey)
							default:
								errClass = ErrKeyword
								customMsg = fmt.Sprintf("keyword %q not found in first %d bytes", m.Keyword, len(br.Body))
								DropValidatorState(monKey)
							}
							br.Release()
						}
					}
					fasthttp.ReleaseRequest(req)
					fasthttp.ReleaseResponse(res)

				} else {
					// Non-HTTP Protocols (Ping, Port, DNS, UDP, Heartbeat)
					// Simulate network latency (20-100ms)
					time.Sleep(2 * time.Millisecond) // loadtest: reduced from 50ms to free CPU
					latency = uint64(time.Since(start).Milliseconds())
					
					// For loadtest purposes, we consider them successful unless they are explicitly seeded as down.
					// Since we don't have endpoints for these, we mock success here.
					errClass = ErrNone
				}

				if errClass == ErrNone {
						HandleSuccess(m.ID, p, latency)
					} else {
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
						
						HandleFailure(m.ID, p, errClass, cause, msg)
					}
				}
			}
		}()
	}
}

var httpErrorCount int32

func MasterDispatcher(ctx context.Context, wg *sync.WaitGroup, httpJobs chan<- DispatchJob) {
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
					due = append(due, DispatchJob{ptr, m})
				}
			}
			Store.Mu.RUnlock()

			for _, item := range due {
				// Claim it BEFORE it touches the channel to close the queueing gap
				CASUpdate(item.ptr, func(mon *Monitor) {
					mon.AwaitingResult = true
					mon.LastProbeSentAt = now
				})

				if item.m.Type != "http" && item.m.Type != "keyword" && item.m.Type != "api" {
					if EnableEngineB {
						dispatchEBPFPing(item.m, item.ptr)
						continue
					}
					// If Engine B is disabled, let it fall through to Engine A (StartWorkers)
				}

				select {
				case httpJobs <- item:
				default:
					// Queue saturated. Revert claim so we don't trigger a false timeout.
					CASUpdate(item.ptr, func(mon *Monitor) {
						mon.AwaitingResult = false
					})
					log.Printf("HTTP queue full, skipping %s this tick", item.m.ID)
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
				HandleFailure(id, nil, ErrTimeout, "Engine Probe Failed", "Probe timed out before returning a result")
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
