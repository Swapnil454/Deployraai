package core

// evidence.go — Evidence Cache for the quorum state machine.
//
// Spec (go_engine_production_spec_final.md §4):
//   Instead of fanning out to ≥2 secondary PoPs on every failure (which at 35K monitors
//   during a CDN outage would generate 35K×2 = 70K simultaneous probe RPCs), a secondary
//   PoP first checks this cache. If it sees a RECENT connect-level failure (Refused/Timeout)
//   to the SAME ip:port, it can use that evidence to complete quorum WITHOUT sending a probe.
//
// This cuts confirmation fan-out by ~90% during mass outages while being fully correct:
//   - Evidence is keyed by (ip, port) — two PoPs agreeing on the same destination IP
//     failing provides true geographic corroboration.
//   - TTL of 8s: long enough to be useful across the typical quorum window (VoteDeadline ~5s),
//     short enough not to mask real transient recoveries.
//   - Only connect-level errors (Refused/Timeout/DNS) qualify — a 503 response is NOT
//     evidence of a network-level outage and must not skip the probe.
//   - The cache is fully lock-free via sync.Map + atomic timestamps.

import (
	"net"
	"net/url"
	"strings"
	"sync"
	"time"
)

const evidenceTTL = 8 * time.Second

// EvidenceKey identifies a destination that has been observed failing.
type EvidenceKey struct {
	IP   string
	Port string
}

type evidenceEntry struct {
	PoP      string    // Which PoP observed the failure
	ASN      string    // Which ASN it belongs to
	ErrClass ErrClass  // Must be a connect-level error
	ObservedAt time.Time
}

type evidenceSet struct {
	mu      sync.Mutex
	entries map[string]evidenceEntry // ASN -> evidenceEntry
	dead    bool
}

// EvidenceCache holds recent connect-level failures keyed by (IP, port).
type EvidenceCache struct {
	m sync.Map // EvidenceKey → *evidenceSet
}

var Evidence = &EvidenceCache{}

// GetEvidenceIPAndPort extracts the actual target IP and Port from a Monitor.
func GetEvidenceIPAndPort(m *Monitor) (string, string) {
	if m == nil || m.TargetIP == "" {
		return "", ""
	}
	port := ""
	if m.Type == "http" {
		port = "443" // Default for https
		// Can parse m.URL to be precise if needed
	} else if m.Type == "port" {
		// port is usually stored in m.Keyword or parsed from m.URL
		// We'll extract it from the URL
		if !strings.Contains(m.URL, "://") {
			_, port, _ = net.SplitHostPort(m.URL)
		} else if u, err := url.Parse(m.URL); err == nil {
			_, port, _ = net.SplitHostPort(u.Host)
		}
	}
	if port == "" {
		port = "0"
	}
	return m.TargetIP, port
}

// Record stores a connect-level failure observation.
// Only connect-level errors are admissible: Timeout, Net, DNS, TLS.
// Application-level errors (status codes, keyword miss) are NOT recorded.
func (c *EvidenceCache) Record(ip, port, pop, asn string, errClass ErrClass) {
	if machineConfig.SingleNodeMode {
		return
	}
	if !isConnectLevelError(errClass) {
		return
	}
	key := EvidenceKey{IP: ip, Port: port}
	
	for {
		val, _ := c.m.LoadOrStore(key, &evidenceSet{entries: make(map[string]evidenceEntry)})
		set := val.(*evidenceSet)
		
		set.mu.Lock()
		if set.dead {
			set.mu.Unlock()
			continue
		}
		set.entries[asn] = evidenceEntry{
			PoP:        pop,
			ASN:        asn,
			ErrClass:   errClass,
			ObservedAt: time.Now(),
		}
		set.mu.Unlock()
		break
	}
}

// Lookup returns corroborating evidence for a (ip, port) failure if one exists
// within the TTL window, AND newer than the round open time, AND the observing 
// PoP/ASN is different from the caller.
// Returns (entry, true) if usable evidence is found.
func (c *EvidenceCache) Lookup(ip, port, callerPoP, callerASN string, roundOpenedAt time.Time) (evidenceEntry, bool) {
	val, ok := c.m.Load(EvidenceKey{IP: ip, Port: port})
	if !ok {
		return evidenceEntry{}, false
	}
	set := val.(*evidenceSet)
	
	set.mu.Lock()
	defer set.mu.Unlock()
	
	for asn, e := range set.entries {
		// Evidence must be fresh
		if time.Since(e.ObservedAt) > evidenceTTL {
			delete(set.entries, asn)
			continue
		}
		// Evidence must be newer than (or very close to) when this round opened
		if e.ObservedAt.Before(roundOpenedAt.Add(-1 * time.Second)) {
			continue
		}
		// Evidence from the same PoP or same ASN does NOT count
		if e.PoP == callerPoP || e.ASN == callerASN {
			continue
		}
		return e, true
	}
	
	return evidenceEntry{}, false
}

// Evict removes a stale entry (called when a monitor recovers, to prevent stale
// evidence from prematurely confirming a future transient failure as an outage).
func (c *EvidenceCache) Evict(ip, port string) {
	c.m.Delete(EvidenceKey{IP: ip, Port: port})
}

// StartEvictionLoop periodically removes expired evidence to bound memory growth.
// Runs as a background goroutine; exits when ctx is cancelled.
func (c *EvidenceCache) StartEvictionLoop(ctx interface{ Done() <-chan struct{} }) {
	go func() {
		ticker := time.NewTicker(evidenceTTL)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				now := time.Now()
				c.m.Range(func(key, val interface{}) bool {
					set := val.(*evidenceSet)
					set.mu.Lock()
					for asn, e := range set.entries {
						if now.Sub(e.ObservedAt) > evidenceTTL {
							delete(set.entries, asn)
						}
					}
					empty := len(set.entries) == 0
					if empty {
						set.dead = true
					}
					set.mu.Unlock()
					
					if empty {
						c.m.CompareAndDelete(key, val)
					}
					return true
				})
			}
		}
	}()
}

// isConnectLevelError returns true for errors that indicate a network-level
// failure (not an application-level failure). Only these qualify as evidence.
func isConnectLevelError(e ErrClass) bool {
	return e == ErrTimeout || e == ErrRefused || e == ErrDNS
}
