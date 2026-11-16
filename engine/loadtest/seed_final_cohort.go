package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

func main() {
	proofMode := flag.Bool("proof", false, "Seed 10 monitors per type for 2-minute proof of life (40 total)")
	flag.Parse()

	dsn := os.Getenv("UPTIMER_DB")
	if dsn == "" {
		dsn = "postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("pgxpool.New failed: %v", err)
	}
	defer pool.Close()

	log.Printf("Resetting database schema tables...")
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
		log.Printf("Seeding 10 monitors per type across 4 types (http, api, keyword, ping) for Proof of Life...")
		types := []string{"http", "api", "keyword", "ping"}
		for _, mType := range types {
			for i := 0; i < 10; i++ {
				host := fmt.Sprintf("mock-%d.mock.local", i)
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
					ip := "198.20.0.1"
					th = &ip
				}

				rows = append(rows, monitorRow{
					id:         uuid.New().String(),
					userId:     "mock",
					mType:      mType,
					targetHost: th,
					url:        u,
					keyword:    kw,
					tags:       []string{fmt.Sprintf("proof_%s", mType)},
					interval:   30,
					timeout:    10,
					status:     "pending",
					isPaused:   false,
					managedBy:  "engine",
				})
			}
		}
	} else {
		log.Printf("Seeding 50,000 monitors (12,500 per type: http, api, keyword, ping) with 40 deliberate failure canaries...")

		// Record list of 40 deliberate failure canaries
		canariesPath := os.Getenv("CANARIES_FILE")
		if canariesPath == "" {
			canariesPath = "/home/swapnil/final_crossverify_results/deliberately_failing_monitors.txt"
		}
		failingCanariesFile, err := os.Create(canariesPath)
		if err == nil {
			defer failingCanariesFile.Close()
			fmt.Fprintf(failingCanariesFile, "id,monitor_type,target,expected_failure\n")
		}

		// 10 HTTP Canaries: 503 Service Unavailable
		for i := 0; i < 10; i++ {
			id := uuid.New().String()
			url := fmt.Sprintf("https://mock-fail-http-%d.mock.local:8443/mock/down", i)
			rows = append(rows, monitorRow{
				id: id, userId: "mock", mType: "http", targetHost: nil, url: &url, keyword: nil,
				tags: []string{"canary_failing", "http_fail"}, interval: 30, timeout: 10, status: "pending", isPaused: false, managedBy: "engine",
			})
			if failingCanariesFile != nil {
				fmt.Fprintf(failingCanariesFile, "%s,http,%s,503 Service Unavailable\n", id, url)
			}
		}

		// 10 API Canaries: 15s Hang / Timeout (504)
		for i := 0; i < 10; i++ {
			id := uuid.New().String()
			url := fmt.Sprintf("https://mock-fail-api-%d.mock.local:8443/mock/timeout", i)
			rows = append(rows, monitorRow{
				id: id, userId: "mock", mType: "api", targetHost: nil, url: &url, keyword: nil,
				tags: []string{"canary_failing", "api_fail"}, interval: 30, timeout: 10, status: "pending", isPaused: false, managedBy: "engine",
			})
			if failingCanariesFile != nil {
				fmt.Fprintf(failingCanariesFile, "%s,api,%s,15s Timeout / Gateway Timeout\n", id, url)
			}
		}

		// 10 Keyword Canaries: HTML missing "HEALTHY"
		for i := 0; i < 10; i++ {
			id := uuid.New().String()
			url := fmt.Sprintf("https://mock-fail-kw-%d.mock.local:8443/mock/keyword_fail", i)
			kw := "HEALTHY"
			rows = append(rows, monitorRow{
				id: id, userId: "mock", mType: "keyword", targetHost: nil, url: &url, keyword: &kw,
				tags: []string{"canary_failing", "kw_fail"}, interval: 30, timeout: 10, status: "pending", isPaused: false, managedBy: "engine",
			})
			if failingCanariesFile != nil {
				fmt.Fprintf(failingCanariesFile, "%s,keyword,%s,Missing keyword HEALTHY\n", id, url)
			}
		}

		// 10 Ping Canaries: Unreachable target IP
		for i := 0; i < 10; i++ {
			id := uuid.New().String()
			ip := "198.20.99.99"
			rows = append(rows, monitorRow{
				id: id, userId: "mock", mType: "ping", targetHost: &ip, url: nil, keyword: nil,
				tags: []string{"canary_failing", "ping_fail"}, interval: 30, timeout: 10, status: "pending", isPaused: false, managedBy: "engine",
			})
			if failingCanariesFile != nil {
				fmt.Fprintf(failingCanariesFile, "%s,ping,%s,ICMP Host Unreachable / Timeout\n", id, ip)
			}
		}

		// 12,490 Healthy HTTP Monitors (Total HTTP = 12,500)
		for i := 0; i < 12490; i++ {
			host := fmt.Sprintf("mock-%d.mock.local", i)
			url := fmt.Sprintf("https://%s:8443/mock/up", host)
			rows = append(rows, monitorRow{
				id: uuid.New().String(), userId: "mock", mType: "http", targetHost: nil, url: &url, keyword: nil,
				tags: []string{"bm_http"}, interval: 30, timeout: 10, status: "pending", isPaused: false, managedBy: "engine",
			})
		}

		// 12,490 Healthy API Monitors (Total API = 12,500)
		for i := 12490; i < 24980; i++ {
			host := fmt.Sprintf("mock-%d.mock.local", i)
			url := fmt.Sprintf("https://%s:8443/mock/up", host)
			rows = append(rows, monitorRow{
				id: uuid.New().String(), userId: "mock", mType: "api", targetHost: nil, url: &url, keyword: nil,
				tags: []string{"bm_api"}, interval: 30, timeout: 10, status: "pending", isPaused: false, managedBy: "engine",
			})
		}

		// 12,490 Healthy Keyword Monitors (Total Keyword = 12,500)
		kw := "HEALTHY"
		for i := 24980; i < 37470; i++ {
			host := fmt.Sprintf("mock-%d.mock.local", i)
			url := fmt.Sprintf("https://%s:8443/mock/keyword", host)
			rows = append(rows, monitorRow{
				id: uuid.New().String(), userId: "mock", mType: "keyword", targetHost: nil, url: &url, keyword: &kw,
				tags: []string{"bm_keyword"}, interval: 30, timeout: 10, status: "pending", isPaused: false, managedBy: "engine",
			})
		}

		// 12,490 Healthy Ping Monitors (Total Ping = 12,500)
		for i := 0; i < 12490; i++ {
			ipIdx := (i % 16) + 1
			ip := fmt.Sprintf("198.20.0.%d", ipIdx)
			rows = append(rows, monitorRow{
				id: uuid.New().String(), userId: "mock", mType: "ping", targetHost: &ip, url: nil, keyword: nil,
				tags: []string{"bm_ping"}, interval: 30, timeout: 10, status: "pending", isPaused: false, managedBy: "engine",
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
