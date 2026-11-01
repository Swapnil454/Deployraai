package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PARTIAL 50,000 Monitor Benchmark Seeder
// Cohort: 4 validated active monitor types (http, api, keyword, ping at 12,500 each).
// Exactly 40 deliberately failing monitors (10 per type) to measure detection separately.
// 49,960 monitors are 100% healthy: any incident on these is a FALSE DOWN.
// Ping: local ICMP path (198.20.0.1) with bare target_host (no scheme/path).
// All monitors seeded with interval_seconds = 30s.

func main() {
	dsn := os.Getenv("UPTIMER_DB")
	if dsn == "" {
		log.Fatal("UPTIMER_DB not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatalf("pgxpool.New failed: %v", err)
	}
	defer pool.Close()

	totalCount := 50000
	if len(os.Args) > 1 {
		fmt.Sscanf(os.Args[1], "%d", &totalCount)
	}

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

	log.Printf("Seeding %d monitors across 4 verified types (http, api, keyword, ping, interval=%ds)...", totalCount, interval)

	types := []string{"http", "api", "keyword", "ping"}
	perType := totalCount / len(types) // 12,500 each

	type monRow struct {
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

	var rows []monRow
	var failingList []string

	for tIdx, mType := range types {
		for i := 0; i < perType; i++ {
			globalIdx := tIdx*perType + i
			mID := uuid.New().String()
			host := fmt.Sprintf("mock-%d.mock.local", globalIdx)

			var u *string
			var th *string
			var kw *string
			var tags []string
			isFailing := (i < 10) // exactly 10 deliberately failing monitors per type (40 total)

			if isFailing {
				switch mType {
				case "http":
					s := fmt.Sprintf("https://%s:8443/mock/down", host)
					u = &s
					tags = []string{"canary_fail_down_http"}
				case "api":
					s := fmt.Sprintf("https://%s:8443/mock/timeout", host)
					u = &s
					tags = []string{"canary_fail_timeout_api"}
				case "keyword":
					s := fmt.Sprintf("https://%s:8443/mock/up", host)
					u = &s
					badKw := "DELIBERATE_FAILING_NON_EXISTENT_KEYWORD"
					kw = &badKw
					tags = []string{"canary_fail_keyword"}
				case "ping":
					// Unreachable IP outside loopback to fail ping probe
					badHost := "198.20.99.99"
					th = &badHost
					tags = []string{"canary_fail_ping"}
				}
				failingList = append(failingList, fmt.Sprintf("%s | type=%s | tag=%s", mID, mType, tags[0]))
			} else {
				// 100% healthy monitors
				switch mType {
				case "http":
					s := fmt.Sprintf("https://%s:8443/mock/up", host)
					u = &s
					tags = []string{"healthy_http"}
				case "api":
					s := fmt.Sprintf("https://%s:8443/mock/up", host)
					u = &s
					tags = []string{"healthy_api"}
				case "keyword":
					s := fmt.Sprintf("https://%s:8443/mock/keyword", host)
					u = &s
					healthyKw := "HEALTHY"
					kw = &healthyKw
					tags = []string{"healthy_keyword"}
				case "ping":
					// Bare target_host, url = NULL
					th = &host
					tags = []string{"healthy_ping"}
				}
			}

			rows = append(rows, monRow{
				id:         mID,
				userId:     "mock",
				mType:      mType,
				targetHost: th,
				url:        u,
				keyword:    kw,
				tags:       tags,
				interval:   interval,
				timeout:    timeoutSec,
				status:     "pending",
				isPaused:   false,
				managedBy:  "engine",
			})
		}
	}

	// Write failing monitor IDs to file
	failFile := "deliberately_failing_monitors.txt"
	if err := os.WriteFile(failFile, []byte(strings.Join(failingList, "\n")+"\n"), 0644); err != nil {
		log.Printf("Warning: failed to write %s: %v", failFile, err)
	} else {
		log.Printf("Recorded %d deliberately failing monitors in %s", len(failingList), failFile)
	}

	var copyRows [][]interface{}
	typeCounts := map[string]int{}
	tagCounts := map[string]int{}

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
		tagCounts[r.tags[0]]++
	}

	log.Printf("Bulk inserting %d monitors via pgx.CopyFrom...", len(copyRows))
	_, err = pool.CopyFrom(ctx,
		[]string{"uptime_monitors"},
		[]string{"id", "user_id", "monitor_type", "target_host", "url", "keyword", "tags", "interval_seconds", "timeout_seconds", "status", "is_paused", "managed_by"},
		pgx.CopyFromRows(copyRows),
	)
	if err != nil {
		log.Fatalf("CopyFrom failed: %v", err)
	}

	log.Println("Seeding complete. Distribution across verified active types:")
	for t, n := range typeCounts {
		log.Printf("  %-12s: %5d  (%.1f%%)", t, n, float64(n)*100/float64(totalCount))
	}
	log.Println("Deliberately failing monitor breakdown:")
	for tag, n := range tagCounts {
		if strings.HasPrefix(tag, "canary_fail") {
			log.Printf("  %-25s: %d", tag, n)
		}
	}
	log.Printf("Total healthy monitors (zero incidents expected): %d", totalCount-len(failingList))
}
