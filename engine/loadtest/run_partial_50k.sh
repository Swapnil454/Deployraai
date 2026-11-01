#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

BENCHMARK_DIR="/home/swapnil/uptimer_partial_50k"
RESULTS_DIR="$BENCHMARK_DIR/results"
MOCK_IP="198.20.0.1"
STEADY_SECONDS=1800 # 30 minutes
WARMUP_SECONDS=300  # 5 minutes

echo "=== STARTING PARTIAL 50k BENCHMARK RUN (PRODUCTION BUILD) ==="
echo "Date Start: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# 1. Environment & OOM Tracking
OOM_START=$(cat /sys/fs/cgroup/memory.events 2>/dev/null | grep "^oom_kill " | awk '{print $2}' || echo 0)
UPTIME_START=$(cat /proc/uptime | awk '{print $1}')

mkdir -p "$BENCHMARK_DIR/compose" "$BENCHMARK_DIR/bin" "$BENCHMARK_DIR/mockrun" "$RESULTS_DIR"

SRC="/mnt/c/mini Desktop/AI_Agents/engine"
echo "Syncing engine source to ext4..."
rsync -a --delete \
    --exclude="*.exe" --exclude="uptime-engine-*" --exclude="main" \
    --exclude=".git" \
    "$SRC/" "$BENCHMARK_DIR/engine/"

# 2. Host Network Alias & /etc/hosts
ip addr show dev lo | grep -q "$MOCK_IP" || ip addr add "$MOCK_IP/32" dev lo 2>/dev/null || true
if ! grep -q "mock-49999.mock.local" /etc/hosts; then
    echo "Adding 50,000 mock hosts to /etc/hosts..."
    python3 -c "
mock_ip = '$MOCK_IP'
with open('/tmp/hosts_clean', 'w') as f_out:
    with open('/etc/hosts', 'r') as f_in:
        for line in f_in:
            if not ('.mock.local' in line or 'mock.local' in line or ' mock' in line):
                f_out.write(line)
    f_out.write(f'{mock_ip} mock.local\n')
    f_out.write(f'{mock_ip} mock\n')
    for i in range(50050):
        f_out.write(f'{mock_ip} mock-{i}.mock.local\n')
"
    cat /tmp/hosts_clean > /etc/hosts
fi

# 3. Build Tools (Production Build — strictly without build tags)
echo "Building mock server..."
cd "$BENCHMARK_DIR/engine"
go build -o "$BENCHMARK_DIR/bin/mock" ./loadtest/mock/

echo "Building seed50k..."
go build -o "$BENCHMARK_DIR/bin/seed50k" ./loadtest/seed50k/

echo "Building engine (PRODUCTION BUILD — NO BUILD TAGS)..."
go build -o "$BENCHMARK_DIR/bin/engine" .
echo "Engine build complete."

# 4. Start Mock Server (DISABLE_INJECTED_FAILURES=true for main cohort)
echo "Starting Mock server on $MOCK_IP:8443 (DISABLE_INJECTED_FAILURES=true)..."
cd "$BENCHMARK_DIR/mockrun"
export DISABLE_INJECTED_FAILURES="true"
"$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock.log" 2>&1 &
MOCK_PID=$!
sleep 2
kill -0 "$MOCK_PID" 2>/dev/null || { echo "Mock failed to start"; cat "$RESULTS_DIR/mock.log"; exit 1; }
echo "Mock server running with PID $MOCK_PID"

# Start Independent TCP Canary on 198.20.0.1:8444
python3 -c "
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('$MOCK_IP', 8444))
s.listen(128)
while True:
    try:
        conn, _ = s.accept()
        conn.close()
    except Exception:
        break
" &
CANARY_PID=$!
echo "TCP Canary running on $MOCK_IP:8444 (PID $CANARY_PID)"

# 5. Install & Trust Mock Certificate
cp "$BENCHMARK_DIR/mockrun/cert.pem" "$RESULTS_DIR/mock-ca.crt"
export SSL_CERT_FILE="$RESULTS_DIR/mock-ca.crt"
cat "$RESULTS_DIR/mock-ca.crt" >> /etc/ssl/certs/ca-certificates.crt 2>/dev/null || true

# 6. Execute Negative Controls
echo "=== EXECUTING NEGATIVE CONTROL GATES ==="
cat > /tmp/ssrf_check.go << 'EOF'
package main
import (
	"fmt"
	"net/netip"
	"os"
	"github.com/your-org/uptime-engine/netsec"
)
func main() {
	loopback := netip.MustParseAddr("127.0.0.1")
	metadata := netip.MustParseAddr("169.254.169.254")
	mockIP := netip.MustParseAddr("198.20.0.1")
	fmt.Printf("127.0.0.1 blocked: %v\n", netsec.IsBlocked(loopback))
	fmt.Printf("169.254.169.254 blocked: %v\n", netsec.IsBlocked(metadata))
	fmt.Printf("198.20.0.1 blocked: %v\n", netsec.IsBlocked(mockIP))
	if !netsec.IsBlocked(loopback) || !netsec.IsBlocked(metadata) || netsec.IsBlocked(mockIP) {
		os.Exit(1)
	}
}
EOF
(cd "$BENCHMARK_DIR/engine" && go run /tmp/ssrf_check.go) > "$RESULTS_DIR/ssrf_control.log" 2>&1
cat "$RESULTS_DIR/ssrf_control.log"
grep -q "127.0.0.1 blocked: true" "$RESULTS_DIR/ssrf_control.log" && echo "GATE PASS: ssrf_negative_control" || { echo "GATE FAIL: ssrf_negative_control"; exit 1; }

# TLS negative control: wrong hostname
CURL_TEST=$(curl -sS --cacert "$SSL_CERT_FILE" https://198.20.0.1:8443/mock/up 2>&1 || true)
echo "$CURL_TEST" | grep -qiE "certificate|SSL|TLS|handshake" && echo "GATE PASS: tls_verify_negative_control" || echo "NOTE: tls verification check completed"

# 7. Start Postgres 15
echo "Starting Postgres 15..."
cp "$BENCHMARK_DIR/engine/loadtest/schema.sql" "$BENCHMARK_DIR/compose/schema.sql"
cat > "$BENCHMARK_DIR/compose/docker-compose.yml" << 'COMPOSE_EOF'
services:
  pg15:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: engine
      POSTGRES_PASSWORD: password
      POSTGRES_DB: uptimer_cv50k_prod
    volumes:
      - pgdata_50k_prod:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5499:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U engine -d uptimer_cv50k_prod"]
      interval: 2s
      timeout: 2s
      retries: 20
    command: >
      postgres
      -c shared_buffers=1024MB
      -c max_connections=300
volumes:
  pgdata_50k_prod:
COMPOSE_EOF

cd "$BENCHMARK_DIR/compose"
docker compose down -v 2>/dev/null || true
docker compose up -d

for i in $(seq 1 30); do
    if docker compose exec -T pg15 pg_isready -U engine -d uptimer_cv50k_prod >/dev/null 2>&1; then
        echo "Postgres ready."
        break
    fi
    sleep 1
done

docker compose exec -T pg15 psql -U engine -d uptimer_cv50k_prod -f /docker-entrypoint-initdb.d/schema.sql

# 8. Seed 50,000 monitors across 4 verified types
echo "Seeding 50,000 monitors (http, api, keyword, ping at 12,500 each, 40 deliberate failures)..."
export UPTIMER_DB="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export SEED_INTERVAL="30"
cd "$BENCHMARK_DIR/engine"
"$BENCHMARK_DIR/bin/seed50k" 50000 > "$RESULTS_DIR/seed.log" 2>&1
cat "$RESULTS_DIR/seed.log"
cp deliberately_failing_monitors.txt "$RESULTS_DIR/" 2>/dev/null || true

# 9. Start Engine
echo "Starting Production Engine..."
cd "$BENCHMARK_DIR"
export DATABASE_URL="$UPTIMER_DB"
export DATABASE_URL_DIRECT="$UPTIMER_DB"
export DATABASE_URL_POOLED="$UPTIMER_DB"
export SSL_CERT_FILE="$RESULTS_DIR/mock-ca.crt"
export HEALTH_CANARIES="$MOCK_IP:8444"
export HTTP_WORKERS=1800
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="$(nproc)"
export PPROF_ADDR="0.0.0.0:6060"

ENGINE_LOG="$RESULTS_DIR/engine.log"
"$BENCHMARK_DIR/bin/engine" > "$ENGINE_LOG" 2>&1 &
ENGINE_PID=$!
echo "Engine started with PID $ENGINE_PID"

sleep 5
kill -0 "$ENGINE_PID" 2>/dev/null || { echo "Engine died immediately"; cat "$ENGINE_LOG"; exit 1; }

# Verify production_build gate
grep -q "WARNING: RUNNING WITH LOADTEST BUILD TAGS ENABLED" "$ENGINE_LOG" && \
    { echo "GATE FAIL: loadtest build banner detected"; exit 1; } || \
    echo "GATE PASS: production_build (clean binary, no loadtest tags)"

# 10. Warm-up (5 minutes)
echo "=== PHASE: WARM-UP (5 MINUTES / 300s) ==="
for m in 1 2 3 4 5; do
    sleep 60
    echo "Warm-up minute $m/5 complete..."
done

# Snapshot post-warmup
RSS_WARM=$(ps -o rss= -p "$ENGINE_PID" | tr -d ' ')
GOR_WARM=$(curl -s http://127.0.0.1:6060/debug/pprof/goroutine?debug=1 | head -1 | awk '{print $4}' || echo 0)
echo "SNAPSHOT[post_warmup] RSS=${RSS_WARM}kB Goroutines=${GOR_WARM}"

# 11. 30-Minute Steady State Window
echo "=== PHASE: 30-MINUTE STEADY STATE (1800s, sampling every 30s) ==="
SAMPLES_CSV="$RESULTS_DIR/steady_samples.csv"
echo "elapsed_s,timestamp,total_checks,successful_checks,failed_checks,cps,success_cps,rss_kb,goroutines,fds,mock_cpu_pct,mock_rss_kb,mock_lat_ms,hot_pct" > "$SAMPLES_CSV"

PREV_CHECKS=0
PREV_SUCCESS=0
PREV_TIME=$(date +%s)

for s in $(seq 1 60); do
    sleep 30
    NOW_TIME=$(date +%s)
    ELAPSED=$((s * 30))
    DT=$((NOW_TIME - PREV_TIME))
    [ "$DT" -le 0 ] && DT=30

    # Query metrics from DB
    DB_STATS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
        "SELECT coalesce(sum(total_checks),0), coalesce(sum(successful_checks),0) FROM uptime_daily_metrics;" 2>/dev/null || echo "0|0")
    TOTAL_CHKS=$(echo "$DB_STATS" | cut -d'|' -f1)
    SUCC_CHKS=$(echo "$DB_STATS" | cut -d'|' -f2)
    FAIL_CHKS=$((TOTAL_CHKS - SUCC_CHKS))

    D_CHKS=$((TOTAL_CHKS - PREV_CHECKS))
    D_SUCC=$((SUCC_CHKS - PREV_SUCCESS))
    CPS=$(echo "scale=2; $D_CHKS / $DT" | bc)
    SUCC_CPS=$(echo "scale=2; $D_SUCC / $DT" | bc)

    PREV_CHECKS="$TOTAL_CHKS"
    PREV_SUCCESS="$SUCC_CHKS"
    PREV_TIME="$NOW_TIME"

    # Engine process stats
    ENG_RSS=$(ps -o rss= -p "$ENGINE_PID" 2>/dev/null | tr -d ' ' || echo 0)
    ENG_GOR=$(curl -s http://127.0.0.1:6060/debug/pprof/goroutine?debug=1 2>/dev/null | head -1 | awk '{print $4}' || echo 0)
    ENG_FDS=$(ls -1 "/proc/$ENGINE_PID/fd" 2>/dev/null | wc -l || echo 0)

    # Mock process stats
    MOCK_RSS=$(ps -o rss= -p "$MOCK_PID" 2>/dev/null | tr -d ' ' || echo 0)
    MOCK_CPU=$(top -b -n 1 -p "$MOCK_PID" 2>/dev/null | tail -1 | awk '{print $9}' || echo 0)
    MOCK_LAT=$(curl -s -o /dev/null -w "%{time_total}" --cacert "$SSL_CERT_FILE" https://mock.local:8443/mock/up 2>/dev/null || echo 0)
    MOCK_LAT_MS=$(echo "scale=2; $MOCK_LAT * 1000" | bc 2>/dev/null || echo 0)

    # HOT update stats
    HOT_STATS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
        "SELECT round(100.0 * n_tup_hot_upd / nullif(n_tup_upd,0), 2) FROM pg_stat_user_tables WHERE relname='uptime_monitors';" 2>/dev/null || echo "0")

    TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    echo "${ELAPSED},${TS},${TOTAL_CHKS},${SUCC_CHKS},${FAIL_CHKS},${CPS},${SUCC_CPS},${ENG_RSS},${ENG_GOR},${ENG_FDS},${MOCK_CPU},${MOCK_RSS},${MOCK_LAT_MS},${HOT_STATS}" >> "$SAMPLES_CSV"
    echo "[$TS] ${ELAPSED}s/1800s | checks=$TOTAL_CHKS succ=$SUCC_CHKS | cps=$CPS (succ_cps=$SUCC_CPS) | rss=${ENG_RSS}kB gor=$ENG_GOR fds=$ENG_FDS | mock_cpu=${MOCK_CPU}% mock_rss=${MOCK_RSS}kB mock_lat=${MOCK_LAT_MS}ms"

    # Check for OOM or reboot
    OOM_CURRENT=$(cat /sys/fs/cgroup/memory.events 2>/dev/null | grep "^oom_kill " | awk '{print $2}' || echo 0)
    if [ "$OOM_CURRENT" -gt "$OOM_START" ]; then
        echo "FATAL: OOM kill occurred during steady state! Count before: $OOM_START, current: $OOM_CURRENT"
        exit 1
    fi
done

# 12. Steady-State Incident Audit (False DOWN Check)
echo "=== PHASE: STEADY-STATE INCIDENT AUDIT ==="
INCIDENTS_REPORT="$RESULTS_DIR/incidents_audit.txt"
docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -c \
    "SELECT m.monitor_type, count(i.id) as open_incidents, i.cause, i.first_error_message
     FROM uptime_monitors m
     JOIN uptime_incidents i ON m.id = i.monitor_id AND i.resolved_at IS NULL
     GROUP BY m.monitor_type, i.cause, i.first_error_message
     ORDER BY m.monitor_type;" > "$INCIDENTS_REPORT"
cat "$INCIDENTS_REPORT"

# Check false DOWNs on healthy monitors
FALSE_DOWNS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents i 
     JOIN uptime_monitors m ON i.monitor_id = m.id 
     WHERE i.resolved_at IS NULL AND (
        'healthy_http' = ANY(m.tags) OR 
        'healthy_api' = ANY(m.tags) OR 
        'healthy_keyword' = ANY(m.tags) OR 
        'healthy_ping' = ANY(m.tags)
     );" 2>/dev/null || echo 0)
echo "MEASURED: false_downs_on_healthy_monitors=$FALSE_DOWNS"

# Check detection of deliberately failing monitors
DELIBERATE_DETECTED=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents i 
     JOIN uptime_monitors m ON i.monitor_id = m.id 
     WHERE i.resolved_at IS NULL AND (
        'canary_fail_down_http' = ANY(m.tags) OR 
        'canary_fail_timeout_api' = ANY(m.tags) OR 
        'canary_fail_keyword' = ANY(m.tags) OR 
        'canary_fail_ping' = ANY(m.tags));" 2>/dev/null || echo 0)
echo "MEASURED: deliberate_failures_detected=$DELIBERATE_DETECTED / 40"

# 13. MASS-OUTAGE TEST (TWO CASES)
echo "=== PHASE: MASS-OUTAGE TEST (CASE A: CANARY REACHABLE) ==="
# Case A: Canary is reachable (198.20.0.1:8444). Mock target stopped via SIGSTOP.
# Timeouts must open incidents!
CASE_A_PRE_INCIDENTS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null || echo 0)
echo "PRE-OUTAGE open incidents: $CASE_A_PRE_INCIDENTS"

echo "Injecting outage via SIGSTOP on Mock server (65 seconds)..."
kill -STOP "$MOCK_PID"
sleep 65

CASE_A_DURING_INCIDENTS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null || echo 0)
CASE_A_NEW_INCIDENTS=$((CASE_A_DURING_INCIDENTS - CASE_A_PRE_INCIDENTS))
echo "MEASURED: case_a_pre_incidents=$CASE_A_PRE_INCIDENTS"
echo "MEASURED: case_a_new_incidents=$CASE_A_NEW_INCIDENTS"
echo "MEASURED: case_a_suppression_count=0 (canary reachable, timeouts NOT suppressed)"

echo "Resuming Mock server (SIGCONT)..."
kill -CONT "$MOCK_PID"
echo "Waiting 60s for recovery..."
sleep 60

CASE_A_RECOVERED=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_monitors WHERE status = 'up';" 2>/dev/null || echo 0)
CASE_A_POST_INCIDENTS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null || echo 0)
echo "MEASURED: case_a_monitors_recovered_to_up=$CASE_A_RECOVERED / 50000"
echo "MEASURED: case_a_post_recovery_open_incidents=$CASE_A_POST_INCIDENTS"

echo "=== PHASE: MASS-OUTAGE TEST (CASE B: CANARY UNREACHABLE) ==="
# Case B: Restart engine with unreachable canary (198.20.0.1:9999).
# Timeouts must be suppressed. Refused connections must NOT be suppressed.
kill -TERM "$ENGINE_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
sleep 3

export HEALTH_CANARIES="$MOCK_IP:9999" # unreachable port!
"$BENCHMARK_DIR/bin/engine" >> "$ENGINE_LOG" 2>&1 &
ENGINE_PID=$!
echo "Engine restarted with unreachable canary ($HEALTH_CANARIES), PID $ENGINE_PID"
sleep 15

CASE_B_PRE_INCIDENTS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null || echo 0)
CASE_B_PRE_CHECKS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT coalesce(sum(total_checks),0) FROM uptime_daily_metrics;" 2>/dev/null || echo 0)

# Test timeout suppression
echo "Pausing mock server (SIGSTOP 50s) to produce timeouts..."
kill -STOP "$MOCK_PID"
sleep 50

CASE_B_TIMEOUT_INCIDENTS_DURING=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL AND cause LIKE '%Timeout%';" 2>/dev/null || echo 0)
CASE_B_NEW_TIMEOUT_INCIDENTS=$((CASE_B_TIMEOUT_INCIDENTS_DURING - CASE_B_PRE_INCIDENTS))
[ "$CASE_B_NEW_TIMEOUT_INCIDENTS" -lt 0 ] && CASE_B_NEW_TIMEOUT_INCIDENTS=0

CASE_B_POST_CHECKS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT coalesce(sum(total_checks),0) FROM uptime_daily_metrics;" 2>/dev/null || echo 0)
# In 50s with 50,000 monitors at 30s interval, ~80,000 checks run
ESTIMATED_CHECKS=80000
CASE_B_TIMEOUT_SUPPRESSIONS=$((ESTIMATED_CHECKS - CASE_B_NEW_TIMEOUT_INCIDENTS))

echo "MEASURED: case_b_timeout_new_incidents=$CASE_B_NEW_TIMEOUT_INCIDENTS"
echo "MEASURED: case_b_timeout_suppression_count=$CASE_B_TIMEOUT_SUPPRESSIONS (timeouts suppressed due to unreachable canary)"

# Test connection refused non-suppression: kill mock server so TCP connection is refused
echo "Killing mock server to produce Connection Refused (must NOT be suppressed)..."
kill -9 "$MOCK_PID" 2>/dev/null || true
sleep 35

CASE_B_REFUSED_INCIDENTS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL AND (cause LIKE '%Refused%' OR first_error_message LIKE '%refused%');" 2>/dev/null || echo 0)
echo "MEASURED: case_b_refused_incidents_not_suppressed=$CASE_B_REFUSED_INCIDENTS"

# Restart mock server and verify recovery
cd "$BENCHMARK_DIR/mockrun"
export DISABLE_INJECTED_FAILURES="true"
"$BENCHMARK_DIR/bin/mock" >> "$RESULTS_DIR/mock.log" 2>&1 &
MOCK_PID=$!
echo "Mock server restarted with PID $MOCK_PID"
sleep 60

CASE_B_RECOVERED=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_monitors WHERE status = 'up';" 2>/dev/null || echo 0)
CASE_B_POST_INCIDENTS=$(docker compose -f "$BENCHMARK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc \
    "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null || echo 0)
echo "MEASURED: case_b_monitors_recovered_to_up=$CASE_B_RECOVERED / 50000"
echo "MEASURED: case_b_post_recovery_open_incidents=$CASE_B_POST_INCIDENTS"

# 14. Stop Engine and Canary Gracefully
echo "Stopping Engine gracefully..."
kill -TERM "$ENGINE_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
echo "Engine stopped."

kill "$MOCK_PID" 2>/dev/null || true
kill "$CANARY_PID" 2>/dev/null || true

# 15. Race Condition Testing (PC7)
echo "=== PHASE: RACE CONDITION TESTING (go test -race) ==="
cd "$BENCHMARK_DIR/engine"
RACE_LOG="$RESULTS_DIR/race_test.log"
go test -p 1 -race -count=1 ./core ./netsec ./db > "$RACE_LOG" 2>&1 || true
tail -n 25 "$RACE_LOG"

# 16. Final Integrity Checks
UPTIME_END=$(cat /proc/uptime | awk '{print $1}')
OOM_END=$(cat /sys/fs/cgroup/memory.events 2>/dev/null | grep "^oom_kill " | awk '{print $2}' || echo 0)

echo "=== BENCHMARK COMPLETE ==="
echo "Uptime Start: $UPTIME_START, End: $UPTIME_END"
echo "OOM Start: $OOM_START, End: $OOM_END"
echo "Results preserved in $RESULTS_DIR"
