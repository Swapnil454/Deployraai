package core

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/google/uuid"
)

func TestDedup(t *testing.T) {
	host := os.Getenv("CLICKHOUSE_HOST")
	if host == "" {
		host = "localhost"
	}
	dsn := fmt.Sprintf("clickhouse://engine:password@%s:9000/default", host)
	opts, err := clickhouse.ParseDSN(dsn)
	if err != nil {
		t.Fatalf("Parse error: %v", err)
	}

	conn, err := clickhouse.Open(opts)
	if err != nil {
		t.Fatalf("Open error: %v", err)
	}

	pingCtx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if err := conn.Ping(pingCtx); err != nil {
		t.Skipf("ClickHouse not reachable at %s:9000, skipping TestDedup: %v", host, err)
	}
	t.Logf("Connected to ClickHouse at %s:9000", host)

	mID := uuid.New()
	now := time.Now().UTC()

	buf := newCols(1)
	buf.add(Sample{
		MonitorID:      mID,
		TsMs:           now.UnixMilli(),
		LatencyUs:      12345,
		Status:         1,
		Err:            0,
		Kind:           3, // HTTP
		ProbeKind:      0,
		IntervalS:      30,
		PhaseKind:      0,
		Attempts:       1,
		TotalLatencyUs: 12345,
		Reused:         0,
		DidResume:      0,
		ReqMethod:      1, // GET
		ReqScheme:      1, // HTTPS
	})

	batchID := "test_batch_" + uuid.New().String()

	// Attempt 1
	success := flush(context.Background(), conn, buf, batchID)
	if !success {
		t.Fatalf("Flush 1 failed")
	}
	t.Log("Sent batch 1")

	// Attempt 2 (exact same batch and token)
	success = flush(context.Background(), conn, buf, batchID)
	if !success {
		t.Fatalf("Flush 2 failed")
	}
	t.Log("Sent batch 2")

	time.Sleep(2 * time.Second) // wait for async_insert

	row := conn.QueryRow(context.Background(), "SELECT count() - uniqExact(monitor_id, ts, phase_kind) FROM uptime_telemetry WHERE monitor_id = ?", mID)
	var duplicates int64
	if err := row.Scan(&duplicates); err != nil {
		t.Fatalf("Scan: %v", err)
	}
	t.Logf("Duplicates for monitor_id: %d\n", duplicates)

	if duplicates != 0 {
		t.Errorf("Expected 0 duplicates, got %d", duplicates)
	}
}
