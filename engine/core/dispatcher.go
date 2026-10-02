package core

import (
	"bytes"
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"slices"
	"sync"
	"sync/atomic"
	"time"
	"net/netip"

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

type dnsEntry struct {
	ips []net.IP
	exp time.Time
}

var dnsCache sync.Map // host -> dnsEntry

func safeIPs(host string) ([]net.IP, error) {
	if v, ok := dnsCache.Load(host); ok && time.Now().Before(v.(dnsEntry).exp) {
		return v.(dnsEntry).ips, nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	all, err := resolveHost(ctx, host)
	if err != nil {
		return nil, err
	}
	var okIPs []net.IP
	for _, ip := range all {
		if addr, ok := netip.AddrFromSlice(ip); ok {
			if !isBlockedIP(addr.Unmap()) {
				okIPs = append(okIPs, ip)
			}
		}
	}
	if len(okIPs) == 0 {
		return nil, netsec.ErrSSRFBlocked
	}
	dnsCache.Store(host, dnsEntry{okIPs, time.Now().Add(5 * time.Minute)})
	return okIPs, nil
}

func init() {
	go func() {
		for {
			time.Sleep(5 * time.Minute)
			now := time.Now()
			dnsCache.Range(func(key, value any) bool {
				if now.After(value.(dnsEntry).exp) {
					dnsCache.Delete(key)
				}
				return true
			})
		}
	}()
}

var globalTLSConfig = &tls.Config{
	ClientSessionCache: &instrumentedSessionCache{cache: tls.NewLRUClientSessionCache(50000)}, // Default, overridden in init
	InsecureSkipVerify: TLSInsecureSkipVerify,
}

func InitTLSConfig(monitorCount int) {
	cacheSize := monitorCount + (monitorCount / 10) // 10% headroom to prevent thrashing while saving RAM
	if cacheSize < 50000 {
		cacheSize = 50000
	}
	globalTLSConfig.ClientSessionCache = &instrumentedSessionCache{cache: tls.NewLRUClientSessionCache(cacheSize)}
}

var httpClient = &fasthttp.Client{
	MaxConnsPerHost:     10000,
	MaxIdleConnDuration: 2 * time.Second, // 2s trailing-ticket window, minimizes idle RAM
	// StreamResponseBody avoids buffering the full response before returning.
	// Keyword monitors read from BodyStream() up to KeywordMaxBytes.
	// Non-keyword monitors use HEAD/Range so SkipBody=true and no body is read.
	// This replaces the previous MaxResponseBodySize approach, which returned
	// ErrBodyTooLarge on overflow and caused false DOWNs for pages > 128 KB.
	StreamResponseBody: true,
	TLSConfig:          globalTLSConfig,
	Dial: func(addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			host = addr
			port = "80"
		}

		ips, err := safeIPs(host)
		if err != nil {
			return nil, err
		}

		// Try each IP with a timeout
		var lastErr error
		for _, ip := range ips {
			safeAddr := net.JoinHostPort(ip.String(), port)
			conn, err := fasthttp.DialTimeout(safeAddr, 3*time.Second)
			if err == nil {
				return conn, nil
			}
			lastErr = err
		}
		if lastErr != nil {
			return nil, fmt.Errorf("failed to dial %s: %w", host, lastErr)
		}
		return nil, fmt.Errorf("no IPs found for %s", host)
	},
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

func HandleFailure(id string, errClass ErrClass, cause string, firstError string) {
	_, updated, ok := Store.UpdateRuntime(id, func(m *Monitor) {
		if !m.AwaitingResult {
			return // Already resolved since snapshot. Idempotency lock.
		}
		m.AwaitingResult = false
		m.ChecksTotal++

		// Confidence decay
		m.ConfidenceScore -= 1.0
		if m.ConfidenceScore < 0 { m.ConfidenceScore = 0 }

		// Recheck interval:
		//   - While still deciding (ConsecutiveFails < 2): 5 s fast recheck so the
		//     second failure arrives quickly and the machine can decide DOWN.
		//   - Once DOWN is confirmed (ConsecutiveFails >= 2): return to normal interval
		//     so a mass outage doesn't triple check-rate to ~3,000/s.
		if m.ConsecutiveFails < 2 {
			m.CurrentInterval = 5
		} else {
			m.CurrentInterval = m.Interval
		}
		m.NextCheckAt = time.Now().Add(time.Duration(m.CurrentInterval) * time.Second)
	})

	if ok {
		// Route to Quorum State Machine
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
			Kind:      0, // Will implement kind later
		})
	}
}

func HandleSuccess(id string, latencyMs uint64) {
	_, updated, ok := Store.UpdateRuntime(id, func(m *Monitor) {
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
		m.CurrentInterval = m.Interval
		m.NextCheckAt = time.Now().Add(time.Duration(m.CurrentInterval) * time.Second)
	})

	if ok {
		// Route to Quorum State Machine
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
			Kind:      0,
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
}

func StartWorkers(ctx context.Context, wg *sync.WaitGroup, workerCount int, jobs <-chan *Monitor) {
	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				select {
				case <-ctx.Done():
					return
				case m := <-jobs:
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
					start := time.Now()
					err = httpClient.DoTimeout(req, res, timeoutDuration)
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
						err = httpClient.DoTimeout(req, res, timeoutDuration)
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
					} else {
						statusOK := false
						if len(m.ExpectedStatus) > 0 {
							for _, s := range m.ExpectedStatus {
								if statusCode == s { statusOK = true; break }
							}
						} else {
							statusOK = (statusCode >= 200 && statusCode < 400)
						}
						
						if !statusOK {
							errClass = ErrStatus
						} else if m.Keyword != "" {
							limit := int(m.KeywordMaxBytes)
							if limit <= 0 { limit = 65536 }
							
							var body []byte
							if stream := res.BodyStream(); stream != nil {
								buf := make([]byte, limit)
								n, _ := io.ReadFull(stream, buf)
								body = buf[:n]
								// We don't drain the rest; fasthttp will close the underlying
								// connection on ReleaseResponse if the stream isn't fully consumed.
							} else {
								body = res.Body()
								if len(body) > limit { body = body[:limit] }
							}
							
							if !bytes.Contains(body, []byte(m.Keyword)) {
								errClass = ErrKeyword
								customMsg = fmt.Sprintf("keyword %q not found in first %d bytes", m.Keyword, len(body))
							}
						}
					}
					fasthttp.ReleaseRequest(req)
					fasthttp.ReleaseResponse(res)

				} else {
					// Non-HTTP Protocols (Ping, Port, DNS, UDP, Heartbeat)
					// Simulate network latency (20-100ms)
					time.Sleep(50 * time.Millisecond)
					latency = uint64(time.Since(start).Milliseconds())
					
					// For loadtest purposes, we consider them successful unless they are explicitly seeded as down.
					// Since we don't have endpoints for these, we mock success here.
					errClass = ErrNone
				}

				if errClass == ErrNone {
						HandleSuccess(m.ID, latency)
					} else {
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
						
						HandleFailure(m.ID, errClass, cause, msg)
					}
				}
			}
		}()
	}
}

var httpErrorCount int32

func MasterDispatcher(ctx context.Context, wg *sync.WaitGroup, httpJobs chan<- *Monitor) {
	defer wg.Done()
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()
	type dueItem struct {
		ptr *atomic.Pointer[Monitor]
		m   *Monitor
	}
	due := make([]dueItem, 0, 1000)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			due = due[:0] // Reuse slice memory
			Store.Mu.RLock()
			for _, ptr := range Store.Monitors {
				m := ptr.Load()
				if !m.IsPaused && !m.AwaitingResult && !time.Now().Before(m.NextCheckAt) {
					due = append(due, dueItem{ptr, m})
				}
			}
			Store.Mu.RUnlock()

			for _, item := range due {
				// Claim it BEFORE it touches the channel to close the queueing gap
				CASUpdate(item.ptr, func(mon *Monitor) {
					mon.AwaitingResult = true
					mon.LastProbeSentAt = time.Now()
				})

				if item.m.Type != "http" {
					if !EnableEngineB {
						// Gate Engine B: skip it entirely
						CASUpdate(item.ptr, func(mon *Monitor) {
							mon.AwaitingResult = false
							mon.NextCheckAt = time.Now().Add(time.Duration(mon.CurrentInterval) * time.Second)
						})
						continue
					}
					dispatchEBPFPing(item.m, item.ptr)
					continue
				}

				select {
				case httpJobs <- item.m:
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
					if time.Since(m.LastProbeSentAt) > effectiveTimeout+2*time.Second {
						expired = append(expired, id)
					}
				}
			}
			Store.Mu.RUnlock()

			for _, id := range expired {
				HandleFailure(id, ErrTimeout, "Engine Probe Failed", "Probe timed out before returning a result")
			}
		}
	}
}

// Temporary stubs
// (eBPF functions will go here in Phase 3)

func dispatchEBPFPing(m *Monitor, p *atomic.Pointer[Monitor]) {
	if m.TargetIP == "" {
		log.Printf("Cannot dispatch ping for %s, TargetIP not yet resolved", m.ID)
		// Leave AwaitingResult=true for HandleFailure so it can process it.
		HandleFailure(m.ID, ErrConfig, "DNS Configuration Error", "Target IP unresolved or restricted")
		return
	}
	
	nonce, ok := Store.NextNonce(m.ID)
	if !ok {
		return // Monitor deleted mid-dispatch
	}
	
	hash := CalculateHash(m.TargetIP, m.ID, nonce)
	sendRawSocket(m, p, nonce, hash)
}
