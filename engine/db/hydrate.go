package db

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/your-org/uptime-engine/core"
)

type rawHeader struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

func parseHeaders(raw []byte) map[string]string {
	if len(raw) == 0 {
		return nil
	}
	var items []rawHeader
	if err := json.Unmarshal(raw, &items); err == nil && len(items) > 0 {
		m := make(map[string]string, len(items))
		for _, it := range items {
			if it.Key != "" {
				m[it.Key] = it.Value
			}
		}
		return m
	}
	return nil
}

func parseExpectedValues(raw []byte) []string {
	if len(raw) == 0 {
		return nil
	}
	var items []string
	if err := json.Unmarshal(raw, &items); err == nil {
		return items
	}
	return nil
}

func HydrateMonitors(ctx context.Context, pool *pgxpool.Pool) error {
	sweepStarted := time.Now()

	query := `
        SELECT
            id,
            COALESCE(url, ''),
            interval_seconds,
            timeout_seconds,
            monitor_type,
            is_paused,
            status,
            last_checked_at,
            current_interval_seconds,
            COALESCE(keyword, ''),
            COALESCE(keyword_condition, 'exists'),
            COALESCE(case_sensitive, FALSE),
            COALESCE(up_status_codes, ARRAY['2xx', '3xx']),
            COALESCE(follow_redirects, TRUE),
            COALESCE(http_method, 'GET'),
            COALESCE(auth_type, 'none'),
            COALESCE(auth_username, ''),
            COALESCE(auth_password, ''),
            COALESCE(auth_bearer_token, ''),
            COALESCE(request_body, ''),
            COALESCE(request_headers, '[]'::jsonb),
            COALESCE(target_host, ''),
            COALESCE(target_port, 0),
            COALESCE(dns_hostname, ''),
            COALESCE(dns_record_type, 'A'),
            COALESCE(dns_expected_values, '[]'::jsonb),
            COALESCE(dns_match_mode, 'any_match')
        FROM uptime_monitors
        WHERE managed_by = 'engine'
    `
	rows, err := pool.Query(ctx, query)
	if err != nil {
		return err
	}
	defer rows.Close()

	type row struct {
		ID                   string
		URL                  string
		Interval             int
		Timeout              int
		Type                 string
		IsPaused             bool
		Status               string
		Keyword              string
		KeywordCondition     string
		CaseSensitive        bool
		UpStatusCodes        []string
		FollowRedirects      bool
		HTTPMethod           string
		AuthType             string
		AuthUsername         string
		AuthPassword         string
		AuthBearerToken      string
		RequestBody          string
		RequestHeadersRaw    []byte
		TargetHost           string
		TargetPort           int
		DNSHostname          string
		DNSRecordType        string
		DNSExpectedValuesRaw []byte
		DNSMatchMode         string
		LastCheckedAt        *time.Time
		CurrentIntervalDB    *int
	}
	var fresh []row
	var scanErr error
	for rows.Next() {
		var r row
		var isPaused *bool
		if err := rows.Scan(
			&r.ID,
			&r.URL,
			&r.Interval,
			&r.Timeout,
			&r.Type,
			&isPaused,
			&r.Status,
			&r.LastCheckedAt,
			&r.CurrentIntervalDB,
			&r.Keyword,
			&r.KeywordCondition,
			&r.CaseSensitive,
			&r.UpStatusCodes,
			&r.FollowRedirects,
			&r.HTTPMethod,
			&r.AuthType,
			&r.AuthUsername,
			&r.AuthPassword,
			&r.AuthBearerToken,
			&r.RequestBody,
			&r.RequestHeadersRaw,
			&r.TargetHost,
			&r.TargetPort,
			&r.DNSHostname,
			&r.DNSRecordType,
			&r.DNSExpectedValuesRaw,
			&r.DNSMatchMode,
		); err == nil {
			if r.Interval <= 0 {
				r.Interval = 30
			}
			if r.Timeout <= 0 {
				r.Timeout = 30
			}
			if isPaused != nil {
				r.IsPaused = *isPaused
			}
			if r.URL == "" && r.TargetHost != "" {
				if r.TargetPort > 0 && (r.Type == "port" || r.Type == "udp") {
					r.URL = fmt.Sprintf("%s:%d", r.TargetHost, r.TargetPort)
				} else {
					r.URL = r.TargetHost
				}
			}
			fresh = append(fresh, r)
		} else {
			scanErr = err
			log.Printf("Scan error during HydrateMonitors: %v", err)
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}

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

	// Query open incidents to ensure in-memory state machine matches DB
	openIncidents := make(map[string]time.Time)
	incQuery := `SELECT monitor_id, MIN(started_at) FROM uptime_incidents WHERE resolved_at IS NULL GROUP BY monitor_id`
	iRows, err := pool.Query(ctx, incQuery)
	if err == nil {
		for iRows.Next() {
			var mid string
			var st time.Time
			if iRows.Scan(&mid, &st) == nil {
				openIncidents[mid] = st
			}
		}
		iRows.Close()
	} else {
		log.Printf("Warning: failed to query open incidents on reconcile: %v", err)
	}

	for _, r := range fresh {
		// Keep state machine synchronized with DB ground truth
		if openStart, isOpen := openIncidents[r.ID]; isOpen {
			core.States.SyncStatus(r.ID, "down", openStart)
		} else {
			core.States.SyncStatus(r.ID, r.Status, time.Time{})
		}

		if p, ok := existing[r.ID]; ok {
			headerMap := parseHeaders(r.RequestHeadersRaw)
			expectedVals := parseExpectedValues(r.DNSExpectedValuesRaw)
			old, _, ok := core.CASUpdateReturning(p, func(m *core.Monitor) {
				if m.Interval != r.Interval {
					m.Interval = r.Interval
					m.ConfidenceScore = 0.0
					m.CurrentInterval = r.Interval
				}
				m.URL, m.Timeout, m.IsPaused, m.Keyword = r.URL, r.Timeout, r.IsPaused, r.Keyword
				m.KeywordCondition = r.KeywordCondition
				m.CaseSensitive = r.CaseSensitive
				m.UpStatusCodes = r.UpStatusCodes
				m.FollowRedirects = r.FollowRedirects
				m.HTTPMethod = r.HTTPMethod
				m.AuthType = r.AuthType
				m.AuthUsername = r.AuthUsername
				m.AuthPassword = r.AuthPassword
				m.AuthBearerToken = r.AuthBearerToken
				m.RequestBody = r.RequestBody
				m.TargetHost = r.TargetHost
				m.TargetPort = r.TargetPort
				m.DNSHostname = r.DNSHostname
				m.DNSRecordType = r.DNSRecordType
				m.DNSExpectedValues = expectedVals
				m.DNSMatchMode = r.DNSMatchMode
				m.Headers = headerMap
				m.ConfigSyncedAt = time.Now()
			})
			if ok && old.Type != r.Type {
				core.ReconcileTypeChange(p, r.Type)
			}
		}
	}

	// Before entering Lock(): identify new rows and allocate ports only if required
	preAllocated := make(map[string]int)
	for _, r := range fresh {
		if _, ok := existing[r.ID]; !ok && core.RequiresAssignedPort(r.Type) {
			if port, ok := core.PortAllocator.Allocate(r.ID); ok {
				preAllocated[r.ID] = port
			} else {
				log.Printf("Port pool exhausted, monitor %s not yet monitored", r.ID)
			}
		}
	}

	core.Store.Mu.Lock()
	for _, r := range fresh {
		if _, ok := core.Store.Monitors[r.ID]; !ok {
			var parsedUUID uuid.UUID
			if u, err := uuid.Parse(r.ID); err == nil {
				parsedUUID = u
			}
			headerMap := parseHeaders(r.RequestHeadersRaw)
			expectedVals := parseExpectedValues(r.DNSExpectedValuesRaw)
			m := &core.Monitor{
				ID: r.ID, ParsedUUID: parsedUUID, URL: r.URL, Interval: r.Interval, Timeout: r.Timeout, Type: r.Type, IsPaused: r.IsPaused, Keyword: r.Keyword,
				KeywordCondition: r.KeywordCondition, CaseSensitive: r.CaseSensitive,
				UpStatusCodes: r.UpStatusCodes, FollowRedirects: r.FollowRedirects, HTTPMethod: r.HTTPMethod,
				AuthType: r.AuthType, AuthUsername: r.AuthUsername, AuthPassword: r.AuthPassword, AuthBearerToken: r.AuthBearerToken,
				RequestBody: r.RequestBody, TargetHost: r.TargetHost, TargetPort: r.TargetPort,
				DNSHostname: r.DNSHostname, DNSRecordType: r.DNSRecordType, DNSExpectedValues: expectedVals, DNSMatchMode: r.DNSMatchMode,
				Headers: headerMap,
				LastStatus: "UP", ConfidenceScore: 0.0, CurrentInterval: r.Interval, ConfigSyncedAt: time.Now(),
				NoKeepAlive: strings.HasPrefix(strings.ToLower(r.URL), "http://"),
				DNSTempCell: &core.DNSTempCell{},
			}

			// Phase 5 Staleness Check
			staleness := time.Duration(1000) * time.Hour
			if r.LastCheckedAt != nil {
				staleness = time.Since(*r.LastCheckedAt)
			}
			if r.CurrentIntervalDB != nil && r.Status == "up" && staleness < 2*time.Duration(*r.CurrentIntervalDB)*time.Second {
				m.ConfidenceScore = 100.0
				if ci := *r.CurrentIntervalDB; ci > 0 && ci <= r.Interval {
					m.CurrentInterval = ci
				} else {
					m.CurrentInterval = r.Interval
				}
			} else if r.Status == "up" && staleness < 2*time.Duration(r.Interval)*time.Second {
				m.ConfidenceScore = 100.0
				m.CurrentInterval = r.Interval
			}

			// Restore state in machine matching open incidents or current status
			if openStart, isOpen := openIncidents[r.ID]; isOpen {
				core.States.SyncStatus(r.ID, "down", openStart)
				m.LastStatus = "DOWN"
				m.ConfidenceScore = 0.0
				m.CurrentInterval = r.Interval
			} else {
				core.States.SyncStatus(r.ID, r.Status, time.Time{})
			}

			// A4: Spread out the check schedule (Jitter)
			h := fnv.New32a()
			h.Write([]byte(r.ID))
			offset := time.Duration(h.Sum32()%uint32(m.CurrentInterval)) * time.Second
			m.NextCheckAt = time.Now().Add(offset)

			monKey := core.MonitorKey(r.ID)
			interval := core.GetFullPhaseInterval(monKey, 0)
			h64 := core.Splitmix64(monKey ^ 0x9e3779b97f4a7c15)
			offsetSec := time.Duration(h64%uint64(interval.Seconds())) * time.Second
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
			core.CleanupMonitorState(id)
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
		if err == nil {
			return
		}
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
