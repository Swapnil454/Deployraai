#!/usr/bin/env bash
set -eo pipefail

export PATH="/usr/local/go/bin:$PATH"
RESULTS_DIR="/home/swapnil/final_crossverify_results"
MOCK_DIR="/home/swapnil/mockrun"
BIN_NEW="/home/swapnil/bin_d330a8e/engine"
BIN_MOCK="/home/swapnil/bin_mock/mock"
COMPOSE="/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml"

PROGRESS_LOG="$RESULTS_DIR/progress.log"
log_progress() {
    local msg="[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $1"
    echo "$msg"
    echo "$msg" >> "$PROGRESS_LOG"
}

db_query() {
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -t -A -c "$1"
}

db_exec() {
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -c "$1" >/dev/null 2>&1
}

reset_db_state() {
    db_exec "
    UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;
    UPDATE uptime_monitors SET status = 'up', is_paused = false;
    "
}

start_canary() {
    python3 -c '
import socket, sys
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(("198.20.0.1", 8444))
s.listen(128)
while True:
    try:
        c, _ = s.accept()
        c.recv(1024)
        c.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nOK")
        c.close()
    except Exception:
        break
' &
    CANARY_PID=$!
}

# =========================================================================
# STEADY STATE TEST (30 MINUTES UNDER O3 SETTINGS)
# =========================================================================

log_progress "=== STARTING 30-MINUTE HEALTHY STEADY-STATE TEST UNDER O3 ==="

killall -9 engine mock python3 2>/dev/null || true
reset_db_state

cd "$MOCK_DIR"
export DISABLE_INJECTED_FAILURES="true"
export TARGETS_HANG_PERCENT=""
"$BIN_MOCK" > "$RESULTS_DIR/mock_steady_30m.log" 2>&1 &
MOCK_PID=$!
sleep 2

start_canary
export HEALTH_CANARIES="198.20.0.1:8444" # reachable canary
export HEALTH_WINDOW_SECS=10
export HEALTH_UNHEALTHY_RATIO=0.35
export HEALTH_RECOVER_RATIO=0.15
export HEALTH_MIN_SAMPLES=500
export HTTP_WORKERS=1800
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$MOCK_DIR/cert.pem"

cd /home/swapnil/uptimer_clean/engine
"$BIN_NEW" > "$RESULTS_DIR/engine_steady_30m.log" 2>&1 &
ENGINE_PID=$!

STEADY_SAMPLE_CSV="$RESULTS_DIR/steady_samples.csv"
echo "elapsed_sec,checks_completed,throughput_rate,false_downs,suppression_events,lag_p50,lag_p95,lag_p99,cpu_usec_delta,rss_kb,goroutines,open_fds" > "$STEADY_SAMPLE_CSV"

T0_EPOCH=$(date +%s)
T0_CGROUP=$(cat /sys/fs/cgroup/cpu.stat 2>/dev/null | grep usage_usec | awk '{print $2}' || echo 0)

for m in $(seq 1 30); do
    sleep 60
    NOW_EPOCH=$(date +%s)
    ELAPSED=$((NOW_EPOCH - T0_EPOCH))
    
    # Query false incidents on healthy monitors (excluding deliberate 40 failing canaries)
    FALSE_INC=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND NOT (m.tags @> ARRAY['canary_failing']);
    ")
    
    # Query total completed checks from uptime_daily_metrics (column is total_checks)
    CHECKS_TOTAL=$(db_query "SELECT coalesce(sum(total_checks), 0) FROM uptime_daily_metrics;")
    RATE=$(awk "BEGIN {printf \"%.2f\", $CHECKS_TOTAL / $ELAPSED}")
    
    # Suppression events from guard lines
    SUPP_EVENTS=$(grep "\[GUARD\]" "$RESULTS_DIR/engine_steady_30m.log" | grep "suppressed=map\[" | grep -v "suppressed=map\[\]" | wc -l || echo 0)
    
    # Process metrics
    RSS_KB=$(awk '/VmRSS/{print $2}' /proc/$ENGINE_PID/status 2>/dev/null || echo 0)
    GOROUTINES=$(curl -s http://127.0.0.1:6060/debug/pprof/goroutine?debug=1 2>/dev/null | grep "goroutine profile: total" | awk '{print $4}' || echo 0)
    OPEN_FDS=$(lsof -p "$ENGINE_PID" 2>/dev/null | wc -l || echo 0)
    
    # Cgroup CPU delta
    CUR_CGROUP=$(cat /sys/fs/cgroup/cpu.stat 2>/dev/null | grep usage_usec | awk '{print $2}' || echo 0)
    CPU_DELTA=$((CUR_CGROUP - T0_CGROUP))
    
    # Lag stats from last log line
    LAST_LAG=$(grep "\[LAG STATS\]" "$RESULTS_DIR/engine_steady_30m.log" | tail -n 1 || echo "")
    P50=$(echo "$LAST_LAG" | grep -o 'p50: [^ |]*' | awk '{print $2}' || echo "N/A")
    P95=$(echo "$LAST_LAG" | grep -o 'p95: [^ |]*' | awk '{print $2}' || echo "N/A")
    P99=$(echo "$LAST_LAG" | grep -o 'p99: [^ |]*' | awk '{print $2}' || echo "N/A")
    
    echo "$ELAPSED,$CHECKS_TOTAL,$RATE,$FALSE_INC,$SUPP_EVENTS,$P50,$P95,$P99,$CPU_DELTA,$RSS_KB,$GOROUTINES,$OPEN_FDS" >> "$STEADY_SAMPLE_CSV"
    log_progress "[$m min / 30 min] Checks: $CHECKS_TOTAL ($RATE checks/s) | False Incidents: $FALSE_INC | RSS: ${RSS_KB}KB | Goroutines: $GOROUTINES | Open FDs: $OPEN_FDS"
done

# Clean shutdown
kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
kill "$CANARY_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true

# Extract final counters
grep "\[RUN_COUNTERS\]" "$RESULTS_DIR/engine_steady_30m.log" > "$RESULTS_DIR/run_counters_steady.log" 2>/dev/null || true
log_progress "Steady-state test complete. Run counters:\n$(cat "$RESULTS_DIR/run_counters_steady.log" 2>/dev/null || echo 'None')"

# =========================================================================
# OPTIONAL CAPACITY PROBE WITH 1,800 WORKERS (5%, 10%, 20% HANG)
# =========================================================================

log_progress "=== OPTIONAL CAPACITY PROBE (1,800 WORKERS: 5%, 10%, 20% HANG) ==="
echo "pct_hang,duration_sec,p50_lag,p95_lag,p99_lag" > "$RESULTS_DIR/capacity_probe.csv"

run_capacity_probe() {
    local pct="$1"
    log_progress "Testing capacity with ${pct}% targets hanging (HTTP_WORKERS=1800)..."
    killall -9 engine mock python3 2>/dev/null || true
    reset_db_state
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT="$pct"
    "$BIN_MOCK" > "$RESULTS_DIR/mock_cap_${pct}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    start_canary
    export HEALTH_CANARIES="198.20.0.1:8444"
    export HTTP_WORKERS=1800
    export GOMEMLIMIT="1600MiB"
    export GOMAXPROCS="12"
    export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
    export DATABASE_URL_DIRECT="$DATABASE_URL"
    export DATABASE_URL_POOLED="$DATABASE_URL"
    export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
    
    cd /home/swapnil/uptimer_clean/engine
    "$BIN_NEW" > "$RESULTS_DIR/engine_cap_${pct}.log" 2>&1 &
    ENGINE_PID=$!
    
    sleep 120
    
    LAST_LAG=$(grep "\[LAG STATS\]" "$RESULTS_DIR/engine_cap_${pct}.log" | tail -n 1 || echo "")
    P50=$(echo "$LAST_LAG" | grep -o 'p50: [^ |]*' | awk '{print $2}' || echo "N/A")
    P95=$(echo "$LAST_LAG" | grep -o 'p95: [^ |]*' | awk '{print $2}' || echo "N/A")
    P99=$(echo "$LAST_LAG" | grep -o 'p99: [^ |]*' | awk '{print $2}' || echo "N/A")
    
    echo "$pct,120,$P50,$P95,$P99" >> "$RESULTS_DIR/capacity_probe.csv"
    log_progress "Capacity probe ${pct}% result: p50=$P50, p95=$P95, p99=$P99"
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    kill "$CANARY_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
}

run_capacity_probe 5
run_capacity_probe 10
run_capacity_probe 20

# =========================================================================
# PHASE FINAL: ENVIRONMENT END & MANIFEST
# =========================================================================

log_progress "=== PHASE FINAL: RECORDING END ENVIRONMENT & MANIFEST ==="

cat << EOF > "$RESULTS_DIR/env_end.txt"
=== END ENVIRONMENT AND INFRASTRUCTURE GUARD ===
Date: $(date -u +"%Y-%m-%d %H:%M:%S UTC") (Local: $(date +"%Y-%m-%d %H:%M:%S %Z"))
Kernel: $(uname -r)
nproc: $(nproc)
GOMAXPROCS: $(go env GOMAXPROCS 2>/dev/null || nproc)
Uptime: $(uptime)
Memory:
$(free -m)
WSL Memory Limit / Cgroup:
Memory max: $(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo "N/A")
Memory current: $(cat /sys/fs/cgroup/memory.current 2>/dev/null || echo "N/A")
MemTotal from /proc/meminfo: $(grep MemTotal /proc/meminfo)
MemFree from /proc/meminfo: $(grep MemFree /proc/meminfo)
MemAvailable from /proc/meminfo: $(grep MemAvailable /proc/meminfo)
EOF

cd "$RESULTS_DIR"
sha256sum * > "$RESULTS_DIR/manifest_sha256.txt" 2>/dev/null || true

log_progress "=== ALL PHASES COMPLETED SUCCESSFULLY ==="
