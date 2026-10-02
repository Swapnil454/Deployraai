package main

import (
	"context"
	"fmt"
	"log"
	"math/rand"
	"os"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Production-realistic distribution of monitor types.
// Based on typical SaaS uptime monitoring usage patterns:
//
//   Interval distribution (reflects free/paid tiers):
//     30s  → 40%  (paid/premium)
//     60s  → 35%  (standard)
//    120s  → 15%  (basic)
//    300s  → 10%  (free tier)
//
//   Endpoint behaviour:
//     96.0% → healthy (HTTP 200)
//      1.0% → down (HTTP 503)
//      0.5% → timeout (slow response)
//      1.0% → HTTP 405 (HEAD not supported, triggers ForceGET learning)
//      1.5% → keyword monitors (check body for string)
//
//   Timeout per interval:
//     30s interval  → 10s timeout
//     60s interval  → 15s timeout
//    120s interval  → 20s timeout
//    300s interval  → 30s timeout

func main() {
	dsn := os.Getenv("UPTIMER_DB")
	if dsn == "" {
		log.Fatal("UPTIMER_DB not set")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		log.Fatal(err)
	}
	defer pool.Close()

	count := 35000
	if len(os.Args) > 1 {
		fmt.Sscanf(os.Args[1], "%d", &count)
	}

	log.Printf("Truncating existing monitors and incidents...")
	_, err = pool.Exec(ctx, "TRUNCATE uptime_monitors CASCADE")
	if err != nil {
		log.Fatalf("Truncate failed: %v", err)
	}

	log.Printf("Seeding %d realistic production monitors...", count)

	// Interval buckets: [seconds, weight_cumulative]
	// Weights: 30s=40%, 60s=35%, 120s=15%, 300s=10%
	intervals := []int{30, 60, 120, 300}
	intervalTimeouts := map[int]int{30: 10, 60: 15, 120: 20, 300: 30}

	// Behaviour buckets (per 1000):
	// 960 up, 10 down, 5 timeout, 10 405, 15 keyword
	type monitorSpec struct {
		path     string
		tag      string
		keyword  string
		mType    string
	}

	rng := rand.New(rand.NewSource(42)) // deterministic seed for reproducibility

	pickInterval := func() int {
		r := rng.Intn(100)
		switch {
		case r < 40:
			return intervals[0] // 30s
		case r < 75:
			return intervals[1] // 60s
		case r < 90:
			return intervals[2] // 120s
		default:
			return intervals[3] // 300s
		}
	}

	pickSpec := func(i int) monitorSpec {
		v := i % 1000
		switch {
		case v < 10: // 1.0% down
			return monitorSpec{path: "/mock/down", tag: "down", mType: "http"}
		case v < 15: // 0.5% timeout
			return monitorSpec{path: "/mock/timeout", tag: "timeout", mType: "http"}
		case v < 25: // 1.0% 405
			return monitorSpec{path: "/mock/405", tag: "405", mType: "http"}
		case v < 40: // 1.5% keyword monitors (healthy, but check body)
			return monitorSpec{path: "/mock/keyword", tag: "keyword", keyword: "HEALTHY", mType: "keyword"}
		default: // 96.0% plain up, split across types
			rem := (v - 40) % 7
			switch rem {
			case 0: return monitorSpec{path: "/mock/up", tag: "up_http", mType: "http"}
			case 1: return monitorSpec{path: "/mock/up", tag: "up_ping", mType: "ping"}
			case 2: return monitorSpec{path: "/mock/up", tag: "up_port", mType: "port"}
			case 3: return monitorSpec{path: "/mock/up", tag: "up_heartbeat", mType: "heartbeat"}
			case 4: return monitorSpec{path: "/mock/up", tag: "up_dns", mType: "dns"}
			case 5: return monitorSpec{path: "/mock/up", tag: "up_api", mType: "api"}
			case 6: return monitorSpec{path: "/mock/up", tag: "up_udp", mType: "udp"}
			}
			return monitorSpec{path: "/mock/up", tag: "up_http", mType: "http"}
		}
	}

	var rows [][]interface{}
	tagCounts := map[string]int{}

	for i := 0; i < count; i++ {
		spec := pickSpec(i)
		interval := pickInterval()
		timeout := intervalTimeouts[interval]
		// Timeout monitors get a short timeout to trigger the condition
		if spec.tag == "timeout" {
			timeout = 5
		}

		host := fmt.Sprintf("mock-%d.mock.local", i)
		url := fmt.Sprintf("https://%s:8443%s", host, spec.path)

		rows = append(rows, []interface{}{
			uuid.New().String(), // id
			"mock",              // user_id
			spec.mType,          // monitor_type
			url,                 // url
			spec.keyword,        // keyword (empty string for non-keyword monitors)
			[]string{spec.tag},  // tags
			interval,            // interval_seconds
			timeout,             // timeout_seconds
			"up",                // status
			false,               // is_paused
			"engine",            // managed_by
		})
		tagCounts[spec.tag]++
	}

	_, err = pool.CopyFrom(ctx,
		[]string{"uptime_monitors"},
		[]string{"id", "user_id", "monitor_type", "url", "keyword", "tags", "interval_seconds", "timeout_seconds", "status", "is_paused", "managed_by"},
		pgx.CopyFromRows(rows),
	)
	if err != nil {
		log.Fatalf("CopyFrom failed: %v", err)
	}

	log.Println("Seeding complete. Distribution:")
	for tag, n := range tagCounts {
		log.Printf("  %-10s %5d  (%.1f%%)", tag, n, float64(n)*100/float64(count))
	}
}
