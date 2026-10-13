// +build ignore

// test_dedup.go: standalone smoke-test for ClickHouse dedup logic.
// Run manually: go run ./loadtest/test_dedup.go
// Use the integration test instead for CI: go test -v -run TestDedup ./core/...

package main

import (
	"context"
	"fmt"
	"log"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/google/uuid"
)

func main() {
	chHost := "localhost:9000"
	opts, err := clickhouse.ParseDSN("clickhouse://engine:password@" + chHost + "/default")
	if err != nil {
		log.Fatalf("Parse error: %v", err)
	}

	conn, err := clickhouse.Open(opts)
	if err != nil {
		log.Fatalf("Open error: %v", err)
	}

	mID := uuid.New()
	now := time.Now().UTC()
	batchID := "test_batch_" + uuid.New().String()

	// Both attempts use the same batchID as the dedup token.
	for attempt := 1; attempt <= 2; attempt++ {
		batch, err := conn.PrepareBatch(context.Background(),
			"INSERT INTO uptime_telemetry (monitor_id, ts, latency_us, status, err_code, monitor_type, probe_kind, interval_s, phase_kind, attempts, total_latency_us, reused, did_resume, req_method, req_scheme)"+
				" SETTINGS async_insert=1, wait_for_async_insert=0, insert_deduplication_token='"+batchID+"'")
		if err != nil {
			log.Fatalf("PrepareBatch attempt %d: %v", attempt, err)
		}
		if err := batch.Append(mID, now, uint32(12345), uint8(1), uint8(0), uint8(1), uint8(0), uint16(30), uint8(0), uint8(1), uint32(12345), uint8(0), uint8(0), uint8(0), uint8(1)); err != nil {
			log.Fatalf("Append attempt %d: %v", attempt, err)
		}
		if err := batch.Send(); err != nil {
			log.Fatalf("Send attempt %d: %v", attempt, err)
		}
		fmt.Printf("Sent batch %d\n", attempt)
	}

	time.Sleep(2 * time.Second) // wait for async_insert

	row := conn.QueryRow(context.Background(),
		"SELECT count() - uniqExact(monitor_id, ts, phase_kind) FROM uptime_telemetry WHERE monitor_id = ?", mID)
	var duplicates int64
	if err := row.Scan(&duplicates); err != nil {
		log.Fatalf("Scan: %v", err)
	}
	fmt.Printf("Duplicates for monitor_id: %d\n", duplicates)
	if duplicates == 0 {
		fmt.Println("PASS: dedup working correctly")
	} else {
		fmt.Printf("FAIL: %d duplicate rows found\n", duplicates)
	}
}
