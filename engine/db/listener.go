package db

import (
    "context"
    "encoding/json"
    "hash/fnv"
    "log"
    "net"
    "sync"
    "sync/atomic"
    "time"

    "github.com/jackc/pgx/v5"
    "github.com/jackc/pgx/v5/pgxpool"
    "github.com/your-org/uptime-engine/core"
)

func StartListener(ctx context.Context, dsn string, pool *pgxpool.Pool, wg *sync.WaitGroup) {
    defer wg.Done()
    attempt := 1
    for {
        startTime := time.Now()
        err := listenLoop(ctx, dsn, pool)
        if ctx.Err() != nil { return }
        
        if time.Since(startTime) > 5*time.Minute { attempt = 1 }

        backoff := attempt * 2
        if backoff > 30 { backoff = 30 } 
        log.Printf("Listener disconnected (err: %v). Reconnecting in %ds...", err, backoff)
        
        select {
        case <-time.After(time.Duration(backoff) * time.Second):
        case <-ctx.Done():
            return
        }
        attempt++
    }
}

func listenLoop(ctx context.Context, dsn string, pool *pgxpool.Pool) error {
    connConfig, err := pgx.ParseConfig(dsn)
    if err != nil { return err }
    
    connConfig.DialFunc = (&net.Dialer{
        KeepAlive: 15 * time.Second,
        Timeout:   10 * time.Second,
    }).DialContext

    conn, err := pgx.ConnectConfig(ctx, connConfig)
    if err != nil { return err }
    defer conn.Close(context.Background())

    if _, err = conn.Exec(ctx, "LISTEN monitor_updates"); err != nil { return err }
    log.Println("Connected to Postgres LISTEN channel.")

    for {
        waitCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
        notification, err := conn.WaitForNotification(waitCtx)
        cancel()

        if err != nil {
            if waitCtx.Err() == context.DeadlineExceeded {
                pingCtx, pingCancel := context.WithTimeout(ctx, 5*time.Second)
                _, pingErr := conn.Exec(pingCtx, "SELECT 1")
                pingCancel()
                if pingErr != nil {
                    return pingErr 
                }
                continue 
            }
            return err 
        }
        processNotification(ctx, pool, notification.Payload)
    }
}

func processNotification(ctx context.Context, pool *pgxpool.Pool, payloadStr string) {
    defer func() {
        if r := recover(); r != nil {
            log.Printf("Recovered panic in processNotification: %v", r)
        }
    }()

    var payload map[string]interface{}
    if err := json.Unmarshal([]byte(payloadStr), &payload); err != nil { return }

    action, ok := payload["action"].(string)
    id, idOk := payload["id"].(string)
    if !ok || !idOk { return }

    if action == "DELETE" {
        core.Store.Mu.Lock()
        if p, exists := core.Store.Monitors[id]; exists {
            m := p.Load()
            if m.Type != "http" && m.AssignedPort != 0 {
                core.PortAllocator.Deallocate(m.AssignedPort)
            }
        }
        delete(core.Store.Monitors, id)
        core.Store.Mu.Unlock()
        return
    }

    query := `
        SELECT id, COALESCE(url, target_host, ''), interval_seconds, timeout_seconds, monitor_type, is_paused, managed_by 
        FROM uptime_monitors
        WHERE id = $1
    `
    var r struct {
        ID, URL, Type, ManagedBy string
        Interval, Timeout        int
        IsPaused                 bool
    }
    err := pool.QueryRow(ctx, query, id).Scan(&r.ID, &r.URL, &r.Interval, &r.Timeout, &r.Type, &r.IsPaused, &r.ManagedBy)
    if err != nil {
        if err != pgx.ErrNoRows {
            log.Printf("Failed to fetch monitor %s: %v", id, err)
        }
        return
    }

    // Filter capability
    if r.ManagedBy != "engine" || (r.Type != "http" && r.Type != "port" && r.Type != "ping") {
        // Evict if exists
        core.Store.Mu.Lock()
        if p, exists := core.Store.Monitors[id]; exists {
            m := p.Load()
            if m.Type != "http" && m.AssignedPort != 0 {
                core.PortAllocator.Deallocate(m.AssignedPort)
            }
            delete(core.Store.Monitors, id)
        }
        core.Store.Mu.Unlock()
        return
    }

    if r.Interval <= 0 { r.Interval = 30 }
    if r.Timeout <= 0 { r.Timeout = 30 }

    core.Store.Mu.RLock()
    p, exists := core.Store.Monitors[r.ID]
    core.Store.Mu.RUnlock()

    if exists {
        old, _, ok := core.CASUpdateReturning(p, func(m *core.Monitor) {
            // If Interval changed by user, force re-earn
            if m.Interval != r.Interval {
                m.Interval = r.Interval
                m.ConfidenceScore = 0.0
                m.CurrentInterval = r.Interval
            }
            m.URL, m.Timeout, m.IsPaused = r.URL, r.Timeout, r.IsPaused
            m.ConfigSyncedAt = time.Now()
        })
        if ok && old.Type != r.Type {
            core.ReconcileTypeChange(p, r.Type)
        }
        return
    }

    core.Store.Mu.Lock()
    defer core.Store.Mu.Unlock()

    if _, exists := core.Store.Monitors[r.ID]; !exists {
        m := &core.Monitor{
            ID: r.ID, URL: r.URL, Interval: r.Interval, Timeout: r.Timeout, Type: r.Type, IsPaused: r.IsPaused,
            LastStatus: "UP", ConfidenceScore: 0.0, CurrentInterval: r.Interval, ConfigSyncedAt: time.Now(),
        }

        // A4: Spread out the check schedule (Jitter for new monitors)
        h := fnv.New32a()
        h.Write([]byte(r.ID))
        offset := time.Duration(h.Sum32() % 5) * time.Second
        m.NextCheckAt = time.Now().Add(offset)

        if r.Type != "http" {
            if port, ok := core.PortAllocator.Allocate(r.ID); ok {
                m.AssignedPort = port
            } else {
                log.Printf("Port pool exhausted, monitor %s not yet monitored", r.ID)
            }
        }
        
        ptr := new(atomic.Pointer[core.Monitor])
        ptr.Store(m)
        core.Store.Monitors[r.ID] = ptr

        if r.Type != "http" {
            go core.ResolveTargetIP(ptr)
        }
    }
}
