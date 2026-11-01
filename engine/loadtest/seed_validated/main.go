package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"strconv"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// seed_validated adheres strictly to server/src/uptime-cron/validation.js:
// - ping, port, udp: bare target_host (no scheme, no path), url is NULL.
// - http, api, keyword: valid URL (https://...), target_host is NULL.
// - dns, heartbeat: url is NULL, target_host is NULL (in Node they use dns_hostname & heartbeat_token).
// - initial status: 'pending' so successful checks prove transitions to 'up'.

func main() {
	proofMode := flag.Bool("proof", false, "Seed 10 monitors per type for all 8 types (80 total)")
	benchmarkCount := flag.Int("count", 50000, "Total monitors to seed in benchmark mode")
	typesList := flag.String("types", "http,api,keyword", "Comma-separated types to seed in benchmark mode")
	flag.Parse()

	dsn := os.Getenv("UPTIMER_DB")
	if dsn == "" {
		log.Fatal("UPTIMER_DB environment variable not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("pgxpool.New failed: %v", err)
	}
	defer pool.Close()

	interval := 30
	if envInterval := os.Getenv("SEED_INTERVAL"); envInterval != "" {
		if iv, err := strconv.Atoi(envInterval); err == nil && iv > 0 {
			interval = iv
		}
	}

	timeoutSec := 10

	log.Printf("Truncating existing monitors, incidents, and daily metrics...")
	_, err = pool.Exec(ctx, "TRUNCATE uptime_monitors, uptime_incidents, uptime_daily_metrics CASCADE")
	if err != nil {
		log.Fatalf("Truncate failed: %v", err)
	}

	type monitorRow struct {
		id         string
		userId     string
		mType      string
		targetHost *string
		url        *string
		keyword    *string
		tags       []string
		interval   int
		timeout    int
		status     string
		isPaused   bool
		managedBy  string
	}

	var rows []monitorRow

	if *proofMode {
		log.Printf("Seeding 10 monitors per type across all 8 types (proof-of-life mode, interval=%ds)...", interval)
		allTypes := []string{"http", "api", "keyword", "ping", "port", "dns", "udp", "heartbeat"}

		for _, mType := range allTypes {
			for i := 0; i < 10; i++ {
				host := fmt.Sprintf("mock-%s-%d.mock.local", mType, i)
				var u *string
				var th *string
				var kw *string

				switch mType {
				case "http", "api":
					s := fmt.Sprintf("https://%s:8443/mock/up", host)
					u = &s
				case "keyword":
					s := fmt.Sprintf("https://%s:8443/mock/keyword", host)
					u = &s
					k := "HEALTHY"
					kw = &k
				case "ping":
					// Node validation.js:57 enforces bare hostname/IP
					th = &host
				case "port":
					// Node validation.js:57 enforces bare hostname/IP, target_port=8443 in separate column
					th = &host
				case "dns":
					// Node validation.js stores dns_hostname in dedicated column; url and target_host are NULL
					// In schema.sql, there is no dns_hostname column, so target_host is NULL
					// If engine expects target in target_host, we test with NULL strictly mirroring Node
				case "udp":
					// Node validation.js stores target_host
					th = &host
				case "heartbeat":
					// Node validation.js stores url as NULL or label; heartbeat_token in dedicated column
				}

				rows = append(rows, monitorRow{
					id:         uuid.New().String(),
					userId:     "mock",
					mType:      mType,
					targetHost: th,
					url:        u,
					keyword:    kw,
					tags:       []string{fmt.Sprintf("proof_%s", mType)},
					interval:   interval,
					timeout:    timeoutSec,
					status:     "pending",
					isPaused:   false,
					managedBy:  "engine",
				})
			}
		}
	} else {
		// Benchmark mode: seed only validated types up to *benchmarkCount
		log.Printf("Seeding %d monitors for validated types [%s] (interval=%ds)...", *benchmarkCount, *typesList, interval)
		types := []string{}
		for _, t := range []string{"http", "api", "keyword"} {
			types = append(types, t)
		}

		for i := 0; i < *benchmarkCount; i++ {
			mType := types[i%len(types)]
			host := fmt.Sprintf("mock-%d.mock.local", i)
			var u *string
			var kw *string
			tag := fmt.Sprintf("bm_%s", mType)

			switch mType {
			case "http":
				s := fmt.Sprintf("https://%s:8443/mock/up", host)
				u = &s
			case "api":
				s := fmt.Sprintf("https://%s:8443/mock/up", host)
				u = &s
			case "keyword":
				s := fmt.Sprintf("https://%s:8443/mock/keyword", host)
				u = &s
				k := "HEALTHY"
				kw = &k
			}

			rows = append(rows, monitorRow{
				id:         uuid.New().String(),
				userId:     "mock",
				mType:      mType,
				targetHost: nil,
				url:        u,
				keyword:    kw,
				tags:       []string{tag},
				interval:   interval,
				timeout:    timeoutSec,
				status:     "pending",
				isPaused:   false,
				managedBy:  "engine",
			})
		}
	}

	var copyRows [][]interface{}
	typeCounts := map[string]int{}
	for _, r := range rows {
		copyRows = append(copyRows, []interface{}{
			r.id,
			r.userId,
			r.mType,
			r.targetHost,
			r.url,
			r.keyword,
			r.tags,
			r.interval,
			r.timeout,
			r.status,
			r.isPaused,
			r.managedBy,
		})
		typeCounts[r.mType]++
	}

	_, err = pool.CopyFrom(ctx,
		[]string{"uptime_monitors"},
		[]string{"id", "user_id", "monitor_type", "target_host", "url", "keyword", "tags", "interval_seconds", "timeout_seconds", "status", "is_paused", "managed_by"},
		pgx.CopyFromRows(copyRows),
	)
	if err != nil {
		log.Fatalf("CopyFrom failed: %v", err)
	}

	log.Printf("Successfully seeded %d monitors. Type distribution:", len(copyRows))
	for t, n := range typeCounts {
		log.Printf("  %-12s: %5d", t, n)
	}
}
