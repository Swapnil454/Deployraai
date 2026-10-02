package core

import (
	"context"
	"log"
	"net"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
	"time"
	"net/netip"

	"github.com/google/uuid"
)

type Monitor struct {
    ID               string
    ParsedUUID       uuid.UUID
    URL              string
    Interval         int
    Timeout          int
    Type             string
    IsPaused         bool
    ConfigSyncedAt   time.Time // Guarantees we never purge a monitor mid-sync
    
    // Runtime State (Owned purely by eBPF engine)
    LastStatus       string  
    ConfidenceScore  float64 
    CurrentInterval  int
    ConsecutiveFails int
    NextCheckAt      time.Time
    LastProbeSentAt  time.Time
    AwaitingResult     bool
    AssignedPort       int
    CurrentNonce       uint64
    TargetIP           string
    TargetIPResolvedAt time.Time

    // Metrics for batch flushing
    ChecksTotal        uint64
    ChecksOK           uint64
    LatencySumMs       uint64
    
    // HTTP specific
    TimeoutMs          int
    Keyword            string
    KeywordMaxBytes    int64
    ExpectedStatus     []int
    ForceGET           bool
}

type MonitorStore struct {
    Mu       sync.RWMutex // Guards MAP STRUCTURE (keys), not the structs
    Monitors map[string]*atomic.Pointer[Monitor]
}

var Store = &MonitorStore{
    Monitors: make(map[string]*atomic.Pointer[Monitor]),
}

// Get is the hot path for the eBPF engine. Uses RLock, incredibly fast.
func (s *MonitorStore) Get(id string) *Monitor {
    s.Mu.RLock()
    p, ok := s.Monitors[id]
    s.Mu.RUnlock()
    if !ok {
        return nil
    }
    return p.Load()
}

// CASUpdate is the unified mutation helper. Every writer must use this.
// Retries are expected to be rare in practice, since writes to any single 
// monitor happen at most a few times per interval — but the loop is unbounded 
// specifically so it is always correct, not just usually correct.
func CASUpdate(p *atomic.Pointer[Monitor], apply func(*Monitor)) {
    for {
        old := p.Load()
        updated := *old
        apply(&updated)
        
        if p.CompareAndSwap(old, &updated) {
            return
        }
    }
}

// UpdateRuntime allows Phase 2 to safely update ping results and returns state for safe side-effects.
func (s *MonitorStore) UpdateRuntime(id string, mutate func(*Monitor)) (old, updated *Monitor, ok bool) {
    s.Mu.RLock()
    p, exists := s.Monitors[id]
    s.Mu.RUnlock()
    if !exists {
        return nil, nil, false
    }
    for {
        o := p.Load()
        u := *o
        mutate(&u)
        
        if p.CompareAndSwap(o, &u) {
            return o, &u, true
        }
    }
}

// CASUpdateReturning exposes the before-and-after states for mutation decisions.
func CASUpdateReturning(p *atomic.Pointer[Monitor], apply func(*Monitor)) (old, updated *Monitor, ok bool) {
    for {
        o := p.Load()
        u := *o
        apply(&u)
        
        if p.CompareAndSwap(o, &u) {
            return o, &u, true
        }
    }
}

// NextNonce safely increments and retrieves the nonce for outbound packet validation.
func (s *MonitorStore) NextNonce(id string) (uint64, bool) {
    _, updated, ok := s.UpdateRuntime(id, func(m *Monitor) {
        m.CurrentNonce++
    })
    if !ok {
        return 0, false
    }
    return updated.CurrentNonce, true
}

// ResolveTargetIP refreshes the DNS resolution for a ping/port monitor.
func ResolveTargetIP(ptr *atomic.Pointer[Monitor]) {
    mon := ptr.Load()
    
    var host string
    if strings.Contains(mon.URL, "://") {
        if u, err := url.Parse(mon.URL); err == nil {
            host = u.Hostname()
        }
    } else {
        host = mon.URL
        if strings.Contains(host, ":") {
            if h, _, err := net.SplitHostPort(host); err == nil {
                host = h
            }
        }
    }
    if host == "" {
        host = mon.URL
    }

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
    defer cancel()
    
    ips, err := resolveHost(ctx, host)
    if err != nil || len(ips) == 0 {
        log.Printf("DNS resolution failed for %s (URL: %s): %v", mon.ID, mon.URL, err)
        CASUpdate(ptr, func(m *Monitor) {
            m.TargetIP = "" // Clear so dispatchEBPFPing fails immediately
            m.TargetIPResolvedAt = time.Now()
        })
        return
    }

    // Prefer IPv4 first: raw-socket ping and hash paths assume IPv4.
    // Fall back to IPv6 only if no public IPv4 is available.
    var safeIP net.IP
    for _, ip := range ips {
        if ip.To4() == nil {
            continue // skip IPv6 on first pass
        }
        if addr, ok := netip.AddrFromSlice(ip); ok && !isBlockedIP(addr.Unmap()) {
            safeIP = ip
            break
        }
    }
    if safeIP == nil && mon.Type != "ping" && mon.Type != "port" {
        // IPv4 pass found nothing; try IPv6 (skip for ping/port as engine B assumes IPv4)
        for _, ip := range ips {
            if ip.To4() != nil {
                continue
            }
            if addr, ok := netip.AddrFromSlice(ip); ok && !isBlockedIP(addr.Unmap()) {
                safeIP = ip
                break
            }
        }
    }

    if safeIP == nil {
        // All resolved IPs are restricted, or no IPv4 available for ping/port.
        log.Printf("[CONFIG_ERROR] DNS returned no suitable public IPs for %s (%s)", mon.ID, mon.URL)
        CASUpdate(ptr, func(m *Monitor) {
            m.TargetIP = "" // Clear so state machine sees the CONFIG_ERROR
            m.TargetIPResolvedAt = time.Now()
        })
        return
    }

    ipStr := safeIP.String()
    CASUpdate(ptr, func(m *Monitor) {
        m.TargetIP = ipStr
        m.TargetIPResolvedAt = time.Now()
    })
}

