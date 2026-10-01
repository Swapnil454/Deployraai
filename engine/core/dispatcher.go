package core

import (
	"context"
	"crypto/tls"
	"fmt"
	"log"
	"net"
	"os"
	"slices"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/valyala/fasthttp"
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
		if !isRestrictedIP(ip) {
			okIPs = append(okIPs, ip)
		}
	}
	if len(okIPs) == 0 {
		return nil, fmt.Errorf("SSRF blocked: %s has no public IPs", host)
	}
	dnsCache.Store(host, dnsEntry{okIPs, time.Now().Add(5 * time.Minute)})
	return okIPs, nil
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
	MaxConnsPerHost:     100,
	MaxIdleConnDuration: 2 * time.Second, // 2s is enough for trailing ticket, minimizes idle RAM cost
	TLSConfig:           globalTLSConfig,
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
		for _, ip := range ips {
			safeAddr := net.JoinHostPort(ip.String(), port)
			conn, err := fasthttp.DialTimeout(safeAddr, 3*time.Second)
			if err == nil {
				if port == "443" || port == "8443" {
					cfg := globalTLSConfig.Clone()
					cfg.ServerName = host
					tlsConn := tls.Client(conn, cfg)
					if err := tlsConn.Handshake(); err != nil {
						conn.Close()
						continue
					}
					return tlsConn, nil
				}
				return conn, nil
			}
		}
		return nil, fmt.Errorf("failed to dial any safe IP for %s", host)
	},
}

var EnableEngineB = os.Getenv("ENABLE_ENGINE_B") == "true"

type IncidentEvent struct {
	EventID           string
	ID                string
	OldStatus         string
	NewStatus         string
	OccurredAt        time.Time
	Cause             string
	FirstErrorMessage string
}

var IncidentQueue = make(chan IncidentEvent, 5000)
var OnIncidentOverflow func(IncidentEvent)

func recordIncidentSafe(id, oldStatus, newStatus, cause, firstError string) {
	evt := IncidentEvent{
		EventID:           uuid.New().String(),
		ID:                id,
		OldStatus:         oldStatus,
		NewStatus:         newStatus,
		OccurredAt:        time.Now(),
		Cause:             cause,
		FirstErrorMessage: firstError,
	}
	select {
	case IncidentQueue <- evt:
	default:
		log.Printf("ALERT: Incident queue full! Dropping alert for %s to local dead-letter log.", id)
		if OnIncidentOverflow != nil {
			OnIncidentOverflow(evt)
		}
	}
}

func HandleFailure(id string, cause string, firstError string) {
	old, updated, ok := Store.UpdateRuntime(id, func(m *Monitor) {
		if !m.AwaitingResult {
			return // Already resolved since snapshot. Idempotency lock.
		}
		m.AwaitingResult = false
		m.ConsecutiveFails++
		m.ChecksTotal++

		if m.ConsecutiveFails == 1 {
			// Soft Failure: A packet dropped or a timeout occurred. Fast-Retry in 5s.
			m.NextCheckAt = time.Now().Add(5 * time.Second)
			m.ConfidenceScore -= 1.0
			if m.ConfidenceScore < 0 { m.ConfidenceScore = 0 }
			m.CurrentInterval = m.Interval + int((m.ConfidenceScore/100.0)*float64(m.Interval*3))
		} else {
			// Hard Failure: Validated outage.
			if m.LastStatus == "UP" {
				m.LastStatus = "DOWN"
			}
			m.ConfidenceScore /= 2.0 // Halving reset
			m.CurrentInterval = m.Interval + int((m.ConfidenceScore/100.0)*float64(m.Interval*3))
			m.NextCheckAt = time.Now().Add(time.Duration(m.CurrentInterval) * time.Second)
		}
	})

	if ok && old.LastStatus != updated.LastStatus {
		recordIncidentSafe(id, old.LastStatus, updated.LastStatus, cause, firstError)
	}
	if ok {
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
	old, updated, ok := Store.UpdateRuntime(id, func(m *Monitor) {
		if !m.AwaitingResult {
			return
		}
		m.AwaitingResult = false
		m.ChecksTotal++
		m.ChecksOK++
		m.LatencySumMs += latencyMs
		
		if m.LastStatus == "DOWN" {
			m.LastStatus = "UP"
		}
		m.ConsecutiveFails = 0
		if m.ConfidenceScore < 100.0 {
			m.ConfidenceScore += 1.0 // Earn trust
			if m.ConfidenceScore > 100.0 { m.ConfidenceScore = 100.0 }
		}
		m.CurrentInterval = m.Interval + int((m.ConfidenceScore/100.0)*float64(m.Interval*3))
		m.NextCheckAt = time.Now().Add(time.Duration(m.CurrentInterval) * time.Second)
	})

	if ok && old.LastStatus != updated.LastStatus {
		recordIncidentSafe(id, old.LastStatus, updated.LastStatus, "", "")
	}
	if ok {
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

func StartHTTPWorkers(ctx context.Context, wg *sync.WaitGroup, workerCount int, jobs <-chan *Monitor) {
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

				req := fasthttp.AcquireRequest()
				res := fasthttp.AcquireResponse()

					req.SetRequestURI(m.URL)
					req.Header.SetMethod("HEAD") // Save bandwidth
					// Removed SetConnectionClose() to allow tickets to arrive and enable connection pooling
					req.Header.Set("User-Agent", "Uptime-Engine/1.0")

					// Note: AwaitingResult and LastProbeSentAt are securely claimed
					// by the MasterDispatcher BEFORE enqueueing to close the queueing-gap race.

					// Per-monitor timeout bound, capped at 10s for safety
					timeoutDuration := time.Duration(m.Timeout) * time.Second
					if timeoutDuration > 10*time.Second {
						timeoutDuration = 10 * time.Second
					}
					start := time.Now()
					err := httpClient.DoTimeout(req, res, timeoutDuration)
					latency := uint64(time.Since(start).Milliseconds())
					statusCode := res.StatusCode()

					if err == nil && (statusCode == 405 || statusCode == 501) {
						req.Header.SetMethod("GET")
						res.SkipBody = true
						start = time.Now()
						err = httpClient.DoTimeout(req, res, timeoutDuration)
						latency = uint64(time.Since(start).Milliseconds())
						statusCode = res.StatusCode()
					}

					fasthttp.ReleaseRequest(req)
					fasthttp.ReleaseResponse(res)

					dispatchLag := time.Since(m.NextCheckAt)
					select {
					case lagChan <- dispatchLag:
					default:
					}

					if err == nil && statusCode >= 200 && statusCode < 400 {
						HandleSuccess(m.ID, latency)
					} else {
						cause := "HTTP Check Failed"
						msg := "Unknown error"
						if err != nil {
							msg = err.Error()
						} else {
							msg = fmt.Sprintf("HTTP %d", statusCode)
						}
						HandleFailure(m.ID, cause, msg)
					}
				}
			}
		}()
	}
}

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
					timeoutDuration := time.Duration(m.Timeout) * time.Second
					if timeoutDuration > 10*time.Second {
						timeoutDuration = 10 * time.Second
					}
					// Add 2s grace period to reaper above HTTP timeout
					if time.Since(m.LastProbeSentAt) > timeoutDuration+2*time.Second {
						expired = append(expired, id)
					}
				}
			}
			Store.Mu.RUnlock()

			for _, id := range expired {
				HandleFailure(id, "Engine Probe Failed", "Probe timed out before returning a result")
			}
		}
	}
}

// Temporary stubs
// (eBPF functions will go here in Phase 3)

func dispatchEBPFPing(m *Monitor, p *atomic.Pointer[Monitor]) {
	if m.TargetIP == "" {
		log.Printf("Cannot dispatch ping for %s, TargetIP not yet resolved", m.ID)
		CASUpdate(p, func(mon *Monitor) { 
			mon.AwaitingResult = false
			mon.NextCheckAt = time.Now().Add(30 * time.Second) // A5: Back off on local skips
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
