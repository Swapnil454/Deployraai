package db

import (
	"context"
	"encoding/json"
	"fmt"
	"hash/fnv"
	"log"
	"net"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
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
		if ctx.Err() != nil {
			return
		}

		if time.Since(startTime) > 5*time.Minute {
			attempt = 1
		}

		backoff := attempt * 2
		if backoff > 30 {
			backoff = 30
		}
		log.Printf("Listener disconnected (err: %v). Reconnecting in %ds...", err, backoff)

		select {
		case <-time.After(time.Duration(backoff) * time.Second):
		case <-ctx.Done():
			return
		}
		attempt++
	}
}

// notifySem limits concurrent processNotification goroutines.
// During rapid bulk inserts, Postgres can fire thousands of NOTIFY events.
// Each goroutine does a Postgres query; without a cap we'd exhaust the pool.
var notifySem = make(chan struct{}, 32)

func listenLoop(ctx context.Context, dsn string, pool *pgxpool.Pool) error {
	connConfig, err := pgx.ParseConfig(dsn)
	if err != nil {
		return err
	}

	connConfig.DialFunc = (&net.Dialer{
		KeepAlive: 15 * time.Second,
		Timeout:   10 * time.Second,
	}).DialContext

	conn, err := pgx.ConnectConfig(ctx, connConfig)
	if err != nil {
		return err
	}
	defer conn.Close(context.Background())

	if _, err = conn.Exec(ctx, "LISTEN monitor_updates"); err != nil {
		return err
	}
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

		payload := notification.Payload
		// Acquire semaphore slot — non-blocking: drop if at capacity (backpressure).
		// The periodic reconciliation loop (every 5min) will catch any missed events.
		select {
		case notifySem <- struct{}{}:
			go func() {
				defer func() { <-notifySem }()
				processNotification(ctx, pool, payload)
			}()
		default:
			log.Printf("WARN: notification worker pool full, dropping payload (reconciler will catch): %.80s", payload)
		}
	}
}

func processNotification(ctx context.Context, pool *pgxpool.Pool, payloadStr string) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Recovered panic in processNotification: %v", r)
		}
	}()

	var payload map[string]interface{}
	if err := json.Unmarshal([]byte(payloadStr), &payload); err != nil {
		return
	}

	action, ok := payload["action"].(string)
	id, idOk := payload["id"].(string)
	if !ok || !idOk {
		return
	}

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
		core.CleanupMonitorState(id)
		return
	}

	query := `
        SELECT
            id,
            COALESCE(url, ''),
            interval_seconds,
            timeout_seconds,
            monitor_type,
            is_paused,
            managed_by,
            COALESCE(status, 'up'),
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
        WHERE id = $1
    `
	var r struct {
		ID                   string
		URL                  string
		Interval             int
		Timeout              int
		Type                 string
		IsPaused             bool
		ManagedBy            string
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
	}
	queryCtx, queryCancel := context.WithTimeout(ctx, 10*time.Second)
	defer queryCancel()
	err := pool.QueryRow(queryCtx, query, id).Scan(
		&r.ID,
		&r.URL,
		&r.Interval,
		&r.Timeout,
		&r.Type,
		&r.IsPaused,
		&r.ManagedBy,
		&r.Status,
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
	)
	if err != nil {
		if err != pgx.ErrNoRows {
			log.Printf("Failed to fetch monitor %s: %v", id, err)
		}
		return
	}

	// Filter capability: Only monitor if managed_by == 'engine'
	if r.ManagedBy != "engine" {
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
		core.CleanupMonitorState(id)
		return
	}

	if r.Interval <= 0 {
		r.Interval = 30
	}
	if r.Timeout <= 0 {
		r.Timeout = 30
	}
	if r.URL == "" && r.TargetHost != "" {
		if r.TargetPort > 0 && (r.Type == "port" || r.Type == "udp") {
			r.URL = fmt.Sprintf("%s:%d", r.TargetHost, r.TargetPort)
		} else {
			r.URL = r.TargetHost
		}
	}

	headerMap := parseHeaders(r.RequestHeadersRaw)
	expectedVals := parseExpectedValues(r.DNSExpectedValuesRaw)

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
			m.URL = r.URL
			m.Timeout = r.Timeout
			m.IsPaused = r.IsPaused
			m.Keyword = r.Keyword
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
			m.NextCheckAt = time.Now()
			m.ConfigSyncedAt = time.Now()
		})
		core.States.SyncStatus(r.ID, r.Status, time.Time{})
		log.Printf("[LISTENER] Updated monitor %s (URL: %s, interval: %ds, up_codes: %v, follow_redirects: %v)", r.ID, r.URL, r.Interval, r.UpStatusCodes, r.FollowRedirects)
		if ok && old.Type != r.Type {
			core.ReconcileTypeChange(p, r.Type)
		}
		return
	}

	core.Store.Mu.Lock()
	defer core.Store.Mu.Unlock()

	if _, exists := core.Store.Monitors[r.ID]; !exists {
		var parsedUUID uuid.UUID
		if u, err := uuid.Parse(r.ID); err == nil {
			parsedUUID = u
		}

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

		// A4: Spread out the check schedule (Jitter for new monitors)
		h := fnv.New32a()
		h.Write([]byte(r.ID))
		offset := time.Duration(h.Sum32()%5) * time.Second
		m.NextCheckAt = time.Now().Add(offset)

		monKey := core.MonitorKey(r.ID)
		interval := core.GetFullPhaseInterval(monKey, 0)
		m.LastFullPhaseAt = time.Now()
		m.FullPhaseInterval = interval

		if core.RequiresAssignedPort(r.Type) {
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
