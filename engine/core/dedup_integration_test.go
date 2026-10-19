package core

import (
	"context"
	"fmt"
	"net/netip"
	"os"
	"testing"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/google/uuid"
)

func validateTestClickHouseHost(t *testing.T, host string) {
	if os.Getenv("ALLOW_TEST_CLICKHOUSE") != "1" {
		t.Skip("skipping ClickHouse test: ALLOW_TEST_CLICKHOUSE=1 not set in environment")
	}

	if host == "localhost" || host == "127.0.0.1" || host == "::1" {
		return
	}

	addr, err := netip.ParseAddr(host)
	if err != nil {
		t.Fatalf("REFUSED: CLICKHOUSE_HOST %q is not a valid IP address or localhost", host)
	}

	// Strictly permit loopback or RFC1918 172.16.0.0/12 (container bridge) only
	if addr.IsLoopback() {
		return
	}

	private172Prefix := netip.MustParsePrefix("172.16.0.0/12")
	if private172Prefix.Contains(addr) {
		return
	}

	t.Fatalf("REFUSED: CLICKHOUSE_HOST %s is not a loopback or 172.16.0.0/12 private container address", host)
}

func TestDedup(t *testing.T) {
	host := os.Getenv("CLICKHOUSE_HOST")
	if host == "" {
		host = "localhost"
	}
	validateTestClickHouseHost(t, host)

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

	// Scope strictly to test table to prevent writing to or dropping production tables
	testTable := "test_dedup_ci_telemetry"
	revertTable := SetTelemetryTableForTest(testTable)
	defer revertTable()

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
	if !flush(context.Background(), conn, buf, batchID) {
		t.Fatalf("Flush 1 failed")
	}

	// Attempt 2 (exact same batch and token)
	if !flush(context.Background(), conn, buf, batchID) {
		t.Fatalf("Flush 2 failed")
	}

	time.Sleep(1 * time.Second)

	query := fmt.Sprintf("SELECT count() - uniqExact(monitor_id, checked_at, phase_kind) FROM %s WHERE monitor_id = ?", testTable)
	row := conn.QueryRow(context.Background(), query, mID)
	var duplicates int64
	if err := row.Scan(&duplicates); err != nil {
		t.Fatalf("Scan: %v", err)
	}

	if duplicates != 0 {
		t.Fatalf("Expected 0 duplicates with matching token, got %d", duplicates)
	}
	t.Logf("TestDedup PASSED: duplicates for monitor_id %s = %d (matching token: %s)", mID, duplicates, batchID)
}

func TestDedup_NegativeControl(t *testing.T) {
	host := os.Getenv("CLICKHOUSE_HOST")
	if host == "" {
		host = "localhost"
	}
	validateTestClickHouseHost(t, host)

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
		t.Skipf("ClickHouse not reachable at %s:9000, skipping TestDedup_NegativeControl: %v", host, err)
	}

	testTable := "test_dedup_ci_telemetry"
	revertTable := SetTelemetryTableForTest(testTable)
	defer revertTable()

	mID := uuid.New()
	now := time.Now().UTC()

	buf := newCols(1)
	buf.add(Sample{
		MonitorID:      mID,
		TsMs:           now.UnixMilli(),
		LatencyUs:      12345,
		Status:         1,
		Err:            0,
		Kind:           3,
		ProbeKind:      0,
		IntervalS:      30,
		PhaseKind:      0,
		Attempts:       1,
		TotalLatencyUs: 12345,
		Reused:         0,
		DidResume:      0,
		ReqMethod:      1,
		ReqScheme:      1,
	})

	// Negative Control: Insert identical sample with TWO DIFFERENT tokens
	tokenA := "negative_ctrl_a_" + uuid.New().String()
	tokenB := "negative_ctrl_b_" + uuid.New().String()

	if !flush(context.Background(), conn, buf, tokenA) {
		t.Fatalf("Flush with tokenA failed")
	}
	if !flush(context.Background(), conn, buf, tokenB) {
		t.Fatalf("Flush with tokenB failed")
	}

	time.Sleep(1 * time.Second)

	query := fmt.Sprintf("SELECT count() - uniqExact(monitor_id, checked_at, phase_kind) FROM %s WHERE monitor_id = ?", testTable)
	row := conn.QueryRow(context.Background(), query, mID)
	var duplicates int64
	if err := row.Scan(&duplicates); err != nil {
		t.Fatalf("Scan: %v", err)
	}

	if duplicates != 1 {
		t.Fatalf("Negative control failed: expected exactly 1 duplicate row with differing tokens, got %d", duplicates)
	}
	t.Logf("Negative control PASSED: ClickHouse correctly detected 1 duplicate row when tokens differed")
}
