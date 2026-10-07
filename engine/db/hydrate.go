package db

import (
    "context"
    "hash/fnv"
    "log"
    "sync"
    "sync/atomic"
    "time"

    "github.com/google/uuid"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/your-org/uptime-engine/core"
)

func HydrateMonitors(ctx context.Context, pool *pgxpool.Pool) error {
    sweepStarted := time.Now() 
    
    // We now select ONLY supported types managed by the engine
    query := `
        SELECT id, COALESCE(url, target_host, ''), interval_seconds, timeout_seconds, monitor_type, is_paused, status, last_checked_at, current_interval_seconds, COALESCE(keyword, '')
        FROM uptime_monitors
        WHERE managed_by = 'engine' AND monitor_type IN ('http', 'keyword', 'ping', 'port', 'heartbeat', 'dns', 'api', 'udp')
    `
    rows, err := pool.Query(ctx, query)
    if err != nil { return err }
    defer rows.Close()

    type row struct {
        ID, URL, Type         string
        Interval              int
        Timeout               int
        IsPaused              bool
        Status                string
        Keyword               string
        LastCheckedAt         *time.Time
        CurrentIntervalFromDB *int
    }
    var fresh []row
    var scanErr error
    for rows.Next() {
        var r row
        var isPaused *bool
        if err := rows.Scan(&r.ID, &r.URL, &r.Interval, &r.Timeout, &r.Type, &isPaused, &r.Status, &r.LastCheckedAt, &r.CurrentIntervalFromDB, &r.Keyword); err == nil {
            if r.Interval <= 0 { r.Interval = 30 }
            if r.Timeout <= 0 { r.Timeout = 30 }
            if isPaused != nil { r.IsPaused = *isPaused }
            fresh = append(fresh, r)
        } else {
            scanErr = err
            log.Printf("Scan error during HydrateMonitors: %v", err)
        }
    }
    if err := rows.Err(); err != nil { return err }

    seen := make(map[string]bool, len(fresh))
    core.Store.Mu.RLock()
    existing := make(map[string]*atomic.Pointer[core.Monitor], len(fresh))
    for _, r := range fresh {
        seen[r.ID] = true
        if p, ok := core.Store.Monitors[r.ID]; ok {
            existing[r.ID] = p
        }
    }
    core.Store.Mu.RUnlock()

    for _, r := range fresh {
        if p, ok := existing[r.ID]; ok {
            old, _, ok := core.CASUpdateReturning(p, func(m *core.Monitor) {
                // If Interval changed by user, force re-earn
                if m.Interval != r.Interval {
                    m.Interval = r.Interval
                    m.ConfidenceScore = 0.0
                    m.CurrentInterval = r.Interval
                }
                m.URL, m.Timeout, m.IsPaused, m.Keyword = r.URL, r.Timeout, r.IsPaused, r.Keyword
                m.ConfigSyncedAt = time.Now()
            })
            if ok && old.Type != r.Type {
                core.ReconcileTypeChange(p, r.Type)
            }
        }
    }

    // Before entering Lock(): identify new rows and allocate ports for ping/port monitors outside any Store.Mu lock.
    preAllocated := make(map[string]int)
    for _, r := range fresh {
        if _, ok := existing[r.ID]; !ok && (r.Type == "ping" || r.Type == "port") {
            if port, ok := core.PortAllocator.Allocate(r.ID); ok {
                preAllocated[r.ID] = port
            } else {
                log.Printf("Port pool exhausted, monitor %s not yet monitored", r.ID)
            }
        }
    }

    // A1: Query open incidents on boot to restore DOWN state
    openIncidents := make(map[string]bool)
    incQuery := `SELECT DISTINCT monitor_id FROM uptime_incidents WHERE resolved_at IS NULL`
    iRows, err := pool.Query(ctx, incQuery)
    if err == nil {
        for iRows.Next() {
            var mid string
            if iRows.Scan(&mid) == nil {
                openIncidents[mid] = true
            }
        }
        iRows.Close()
    } else {
        log.Printf("Warning: failed to query open incidents on boot: %v", err)
    }

    core.Store.Mu.Lock()
    for _, r := range fresh {
        if _, ok := core.Store.Monitors[r.ID]; !ok {
            var parsedUUID uuid.UUID
            if u, err := uuid.Parse(r.ID); err == nil {
                parsedUUID = u
            }
            m := &core.Monitor{
                ID: r.ID, ParsedUUID: parsedUUID, URL: r.URL, Interval: r.Interval, Timeout: r.Timeout, Type: r.Type, IsPaused: r.IsPaused, Keyword: r.Keyword,
                LastStatus: "UP", ConfidenceScore: 0.0, CurrentInterval: r.Interval, ConfigSyncedAt: time.Now(),
            }
            
            // Phase 5 Staleness Check
            staleness := time.Duration(1000) * time.Hour
            if r.LastCheckedAt != nil {
                staleness = time.Since(*r.LastCheckedAt)
            }
            if r.CurrentIntervalFromDB != nil && r.Status == "up" && staleness < 2*time.Duration(*r.CurrentIntervalFromDB)*time.Second {
                m.ConfidenceScore = 100.0
                m.CurrentInterval = *r.CurrentIntervalFromDB
            } else if r.Status == "up" && staleness < 2*time.Duration(r.Interval)*time.Second {
                m.ConfidenceScore = 100.0
                m.CurrentInterval = r.Interval * 4
            }
            
            // A1: Restore DOWN state if an incident is open
            if openIncidents[r.ID] {
                m.LastStatus = "DOWN"
                m.ConfidenceScore = 0.0
                m.CurrentInterval = r.Interval
            }

            // A4: Spread out the check schedule (Jitter)
            h := fnv.New32a()
            h.Write([]byte(r.ID))
            offset := time.Duration(h.Sum32() % uint32(m.CurrentInterval)) * time.Second
            m.NextCheckAt = time.Now().Add(offset)

            monKey := core.MonitorKey(r.ID)
            interval := core.GetFullPhaseInterval(monKey, 0)
            h64 := core.Splitmix64(monKey ^ 0x9e3779b97f4a7c15)
            offsetSec := time.Duration(h64 % uint64(interval.Seconds())) * time.Second
            m.LastFullPhaseAt = time.Now().Add(-offsetSec)
            m.FullPhaseInterval = interval

            if port, ok := preAllocated[r.ID]; ok {
                m.AssignedPort = port
            }
            ptr := new(atomic.Pointer[core.Monitor])
            ptr.Store(m)
            core.Store.Monitors[r.ID] = ptr
            if m.Type != "http" && m.Type != "keyword" && m.Type != "api" {
                go core.ResolveTargetIP(ptr)
            }
        } else if port, ok := preAllocated[r.ID]; ok {
            core.PortAllocator.Deallocate(port)
        }
    }
    core.Store.Mu.Unlock()

    if scanErr != nil {
        log.Printf("Skipping orphan purge due to scan errors: %v", scanErr)
        return nil
    }

    core.Store.Mu.RLock()
    storeSize := len(core.Store.Monitors)
    core.Store.Mu.RUnlock()

    if storeSize >= 20 && len(fresh) < storeSize*8/10 {
        log.Printf("CRITICAL: sweep returned %d rows, RAM holds %d; skipping purge", len(fresh), storeSize)
        return nil
    }

    core.Store.Mu.Lock()
    for id, p := range core.Store.Monitors {
        m := p.Load()
        if !seen[id] && m.ConfigSyncedAt.Before(sweepStarted) {
            if m.Type != "http" && m.AssignedPort != 0 {
                core.PortAllocator.Deallocate(m.AssignedPort)
            }
            delete(core.Store.Monitors, id)
        }
    }
    core.Store.Mu.Unlock()

    log.Printf("Reconciled: %d monitors.", len(fresh))
    return nil
}

func StartDNSRefreshLoop(ctx context.Context, wg *sync.WaitGroup) {
    defer wg.Done()
    ticker := time.NewTicker(30 * time.Minute)
    defer ticker.Stop()

    for {
        // Run once immediately on start
        var toResolve []*atomic.Pointer[core.Monitor]
        core.Store.Mu.RLock()
        for _, p := range core.Store.Monitors {
            m := p.Load()
            if m.Type != "http" && time.Since(m.TargetIPResolvedAt) > 30*time.Minute {
                toResolve = append(toResolve, p)
            }
        }
        core.Store.Mu.RUnlock()

        if len(toResolve) > 0 {
            const dnsWorkerCount = 50
            jobs := make(chan *atomic.Pointer[core.Monitor], len(toResolve))
            for _, p := range toResolve {
                jobs <- p
            }
            close(jobs)

            var wgDNS sync.WaitGroup
            for i := 0; i < dnsWorkerCount; i++ {
                wgDNS.Add(1)
                go func() {
                    defer wgDNS.Done()
                    for ptr := range jobs {
                        core.ResolveTargetIP(ptr)
                    }
                }()
            }
            wgDNS.Wait()
        }

        select {
        case <-ctx.Done():
            return
        case <-ticker.C:
        }
    }
}

func HydrateWithRetry(ctx context.Context, pool *pgxpool.Pool, maxAttempts int) {
    for attempt := 1; attempt <= maxAttempts; attempt++ {
        err := HydrateMonitors(ctx, pool)
        if err == nil { return }
        log.Printf("Boot hydration failed (error: %v), retrying in %ds", err, attempt*2)
        select {
        case <-time.After(time.Duration(attempt*2) * time.Second):
        case <-ctx.Done():
            return
        }
    }
    log.Fatal("Could not hydrate monitors on boot — refusing to start.")
}

func StartReconciliationLoop(ctx context.Context, pool *pgxpool.Pool, interval time.Duration, wg *sync.WaitGroup) {
    defer wg.Done()
    ticker := time.NewTicker(interval)
    defer ticker.Stop()
    for {
        select {
        case <-ticker.C:
            if err := HydrateMonitors(ctx, pool); err != nil {
                log.Printf("Periodic reconciliation failed: %v", err)
            }
        case <-ctx.Done():
            return
        }
    }
}
