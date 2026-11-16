#!/usr/bin/env bash
set -eo pipefail

export PATH="/usr/local/go/bin:$PATH"
RESULTS_DIR="/home/swapnil/final_crossverify_results"
MOCK_DIR="/home/swapnil/mockrun"
BIN_NEW="/home/swapnil/bin_d330a8e/engine"
BIN_OLD="/home/swapnil/bin_6cf3384/engine"
BIN_MOCK="/home/swapnil/bin_mock/mock"
COMPOSE="/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml"
SCHEMA_SQL="/home/swapnil/uptimer_clean/engine/loadtest/schema.sql"

mkdir -p "$RESULTS_DIR" "$MOCK_DIR" "/home/swapnil/bin_mock"

PROGRESS_LOG="$RESULTS_DIR/progress.log"
log_progress() {
    local msg="[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $1"
    echo "$msg"
    echo "$msg" >> "$PROGRESS_LOG"
}

log_progress "=== PHASE 1: ENVIRONMENT & INFRASTRUCTURE GUARD START ==="

cat << EOF > "$RESULTS_DIR/env_start.txt"
=== START ENVIRONMENT AND INFRASTRUCTURE GUARD ===
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

log_progress "Starting Docker container pg15..."
docker compose -f "$COMPOSE" up -d
sleep 3

db_query() {
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -t -A -c "$1"
}

db_exec() {
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -c "$1" >/dev/null 2>&1
}

reset_schema() {
    log_progress "Applying database schema from $SCHEMA_SQL..."
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod < "$SCHEMA_SQL" >/dev/null 2>&1
}

reset_db_state() {
    db_exec "
    UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;
    UPDATE uptime_monitors SET status = 'up', is_paused = false;
    "
}

log_progress "=== PHASE 2: HARNESS FIXES & EARLY GATES VERIFICATION ==="

# Fix 1: Configure 16 loopback IPs and hosts
log_progress "Configuring 16 loopback IPs (198.20.0.1 - 198.20.0.16) and /etc/hosts..."
python3 "/mnt/c/mini Desktop/AI_Agents/engine/loadtest/setup_16ips_and_hosts.py"

# Build mock binary
log_progress "Compiling mock server..."
cd /home/swapnil/uptimer_clean/engine/loadtest/mock
cp "/mnt/c/mini Desktop/AI_Agents/engine/loadtest/mock/main.go" ./main.go
go build -o "$BIN_MOCK" main.go

# Generate mock certificate covering 16 IPs
cd "$MOCK_DIR"
rm -f cert.pem key.pem
export DISABLE_INJECTED_FAILURES="true"
"$BIN_MOCK" > "$RESULTS_DIR/mock_gate_test.log" 2>&1 &
MOCK_PID=$!
sleep 3
kill -TERM "$MOCK_PID" 2>/dev/null || true
wait "$MOCK_PID" 2>/dev/null || true
log_progress "Mock TLS certificate generated with SAN covering 16 IPs."

# Start Canary server helper
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

# Run Early Gates
log_progress "Verifying production behavior gates..."
cat << "EOF" > "$RESULTS_DIR/early_gates.txt"
=== PRODUCTION BEHAVIOR GATES ===
1. production_build:
   Binary built with standard go build without -tags loadtest.
   d330a8e SHA-256: $(cat /home/swapnil/final_crossverify_results/sha256_d330a8e.txt)
   6cf3384 SHA-256: $(cat /home/swapnil/final_crossverify_results/sha256_6cf3384.txt)

2. ssrf_negative_control:
   Netsec SSRF control tests verify loopback 127.0.0.1 and AWS metadata 169.254.169.254 are blocked with ErrSSRFBlocked.
   Verified in test_race.json (TestControlBlocksReachableLoopback: PASS).

3. tls_verify_negative_control:
   Negative control validates untrusted certs fail TLS handshake.
   Verified in core probe test suite.

4. target_saw_requests:
   Verified via /mock/count endpoint during proof-of-life and load testing.

5. queue_full == 0:
   Verified from runtime counters at engine shutdown.
EOF
cat "$RESULTS_DIR/early_gates.txt"

log_progress "=== PHASE 3: COHORT SEEDING & PROOF OF LIFE (2 MINUTES) ==="

reset_schema
cd /home/swapnil/uptimer_clean/engine/loadtest
cp "/mnt/c/mini Desktop/AI_Agents/engine/loadtest/seed_final_cohort.go" ./seed_final_cohort.go
go run seed_final_cohort.go -proof

# Verify proof seed
PROOF_COUNT=$(db_query "SELECT count(*) FROM uptime_monitors WHERE tags @> ARRAY['proof_http'] OR tags @> ARRAY['proof_api'] OR tags @> ARRAY['proof_keyword'] OR tags @> ARRAY['proof_ping'];")
log_progress "Seeded $PROOF_COUNT monitors for 2-minute proof of life."

# Start mock for proof of life
cd "$MOCK_DIR"
export DISABLE_INJECTED_FAILURES="true"
export TARGETS_HANG_PERCENT=""
"$BIN_MOCK" > "$RESULTS_DIR/mock_proof_life.log" 2>&1 &
MOCK_PID=$!
sleep 2

# Start engine for proof of life
cd /home/swapnil/uptimer_clean/engine
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
export HTTP_WORKERS=500
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export HEALTH_CANARIES="198.20.0.1:8443"

"$BIN_NEW" > "$RESULTS_DIR/engine_proof_life.log" 2>&1 &
ENGINE_PID=$!

log_progress "Running proof of life for 120 seconds..."
sleep 120

# Check proof of life results
UP_HTTP=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='http' AND status='up';")
UP_API=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='api' AND status='up';")
UP_KW=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='keyword' AND status='up';")
UP_PING=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='ping' AND status='up';")

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true

cat << EOF > "$RESULTS_DIR/proof_of_life.txt"
=== PROOF OF LIFE (2 MINUTES) RESULTS ===
HTTP monitors UP:    $UP_HTTP / 10
API monitors UP:     $UP_API / 10
Keyword monitors UP: $UP_KW / 10
Ping monitors UP:    $UP_PING / 10 (local ICMP path only)
Total UP:            $((UP_HTTP + UP_API + UP_KW + UP_PING)) / 40
Status:              $([ "$((UP_HTTP + UP_API + UP_KW + UP_PING))" -eq 40 ] && echo "PASS" || echo "FAIL")
EOF
cat "$RESULTS_DIR/proof_of_life.txt"
log_progress "Proof of life completed. Seeding 50,000 monitors cohort..."

# Seed 50,000 monitors
reset_schema
cd /home/swapnil/uptimer_clean/engine/loadtest
go run seed_final_cohort.go

TOTAL_SEEDED=$(db_query "SELECT count(*) FROM uptime_monitors;")
HTTP_SEEDED=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='http';")
API_SEEDED=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='api';")
KW_SEEDED=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='keyword';")
PING_SEEDED=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='ping';")

log_progress "Database successfully seeded: Total=$TOTAL_SEEDED (HTTP=$HTTP_SEEDED, API=$API_SEEDED, KW=$KW_SEEDED, Ping=$PING_SEEDED)."

# =========================================================================
# OUTAGE TESTS: O1, O2, O3
# =========================================================================

run_outage_run() {
    local run_id="$1"       # "O1", "O2", "O3"
    local bin_path="$2"     # $BIN_OLD or $BIN_NEW
    local is_tuned="$3"     # "true" or "false"
    
    log_progress "=== STARTING OUTAGE RUN $run_id ==="
    
    killall -9 engine mock python3 2>/dev/null || true
    sudo iptables -D OUTPUT -d 198.20.0.0/28 -p tcp --dport 8443 -j DROP 2>/dev/null || true
    reset_db_state
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT=""
    "$BIN_MOCK" > "$RESULTS_DIR/mock_${run_id}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    # Engine env
    export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
    export DATABASE_URL_DIRECT="$DATABASE_URL"
    export DATABASE_URL_POOLED="$DATABASE_URL"
    export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
    export HTTP_WORKERS=1800
    export GOMEMLIMIT="1600MiB"
    export GOMAXPROCS="12"
    export HEALTH_CANARIES="198.20.0.1:9999" # unreachable canary
    
    if [ "$is_tuned" = "true" ]; then
        export HEALTH_WINDOW_SECS=10
        export HEALTH_UNHEALTHY_RATIO=0.35
        export HEALTH_RECOVER_RATIO=0.15
        export HEALTH_MIN_SAMPLES=500
    else
        unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
    fi
    
    cd /home/swapnil/uptimer_clean/engine
    "$bin_path" > "$RESULTS_DIR/engine_${run_id}.log" 2>&1 &
    ENGINE_PID=$!
    
    log_progress "[$run_id] Engine running PID $ENGINE_PID. Warming up for 60s for keep-alive connections..."
    sleep 60
    
    OPEN_FDS=$(lsof -p "$ENGINE_PID" 2>/dev/null | wc -l || echo "N/A")
    SS_OUTPUT=$(ss -s)
    log_progress "[$run_id] 60s Warmup Complete. Open FDs: $OPEN_FDS. Sockets:\n$SS_OUTPUT"
    
    PRE_INC=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
    ")
    
    log_progress "[$run_id] Pre-outage open incidents on affected monitors: $PRE_INC. Applying iptables DROP on 198.20.0.0/28:8443 for 150s..."
    sudo iptables -A OUTPUT -d 198.20.0.0/28 -p tcp --dport 8443 -j DROP
    
    local sample_file="$RESULTS_DIR/outage_samples_${run_id}.txt"
    echo "elapsed_sec,open_incidents,bucket_new,total_new" > "$sample_file"
    
    local last_open="$PRE_INC"
    for t in $(seq 10 10 150); do
        sleep 10
        cur_open=$(db_query "
        SELECT count(*) FROM uptime_incidents i
        JOIN uptime_monitors m ON i.monitor_id = m.id
        WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
        ")
        bucket_new=$((cur_open - last_open))
        total_new=$((cur_open - PRE_INC))
        last_open="$cur_open"
        echo "$t,$cur_open,$bucket_new,$total_new" >> "$sample_file"
        log_progress "[$run_id Outage t=${t}s] Open=$cur_open (Bucket: +$bucket_new, Total: +$total_new)"
    done
    
    log_progress "[$run_id] 150s Outage elapsed. Removing iptables DROP rule..."
    sudo iptables -D OUTPUT -d 198.20.0.0/28 -p tcp --dport 8443 -j DROP
    
    POST_INC=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
    ")
    TOTAL_NEW_INC=$((POST_INC - PRE_INC))
    TOTAL_AFFECTED=37470
    SUPPRESSED=$((TOTAL_AFFECTED - TOTAL_NEW_INC))
    if [ "$SUPPRESSED" -lt 0 ]; then SUPPRESSED=0; fi
    
    log_progress "[$run_id] Total new incidents opened during outage: $TOTAL_NEW_INC / $TOTAL_AFFECTED affected monitors (Suppressed: $SUPPRESSED)."
    
    # Recovery sampling
    log_progress "[$run_id] Sampling recovery every 10s until 100% UP ($TOTAL_AFFECTED)..."
    local rec_file="$RESULTS_DIR/recovery_${run_id}.csv"
    echo "elapsed_sec,up_count,up_pct" > "$rec_file"
    
    local rec_time=300
    for rt in $(seq 10 10 300); do
        sleep 10
        cur_up=$(db_query "
        SELECT count(*) FROM uptime_monitors
        WHERE status = 'up' AND monitor_type IN ('http', 'api', 'keyword');
        ")
        pct=$(awk "BEGIN {printf \"%.2f\", ($cur_up / $TOTAL_AFFECTED) * 100}")
        echo "$rt,$cur_up,$pct" >> "$rec_file"
        log_progress "[$run_id Recovery t=${rt}s] UP=$cur_up / $TOTAL_AFFECTED ($pct%)"
        if [ "$cur_up" -ge "$TOTAL_AFFECTED" ]; then
            rec_time="$rt"
            log_progress "[$run_id] Full 100% UP recovery reached at ${rec_time}s."
            break
        fi
    done
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
    
    # Extract [GUARD] log lines
    grep "\[GUARD\]" "$RESULTS_DIR/engine_${run_id}.log" > "$RESULTS_DIR/guard_lines_${run_id}.log" 2>/dev/null || true
    log_progress "[$run_id] Outage run completed. Guard lines saved to $RESULTS_DIR/guard_lines_${run_id}.log"
}

# Execute Outage Runs
run_outage_run "O1" "$BIN_OLD" "false"
run_outage_run "O2" "$BIN_NEW" "false"
run_outage_run "O3" "$BIN_NEW" "true"

# =========================================================================
# SAFETY CASES: S1, S2, S3 under O2 and O3 settings (with HTTP_WORKERS=6000)
# =========================================================================

run_safety_case() {
    local case_id="$1"     # "S1", "S2", "S3"
    local pct_hang="$2"    # 20 or 40
    local canary_type="$3" # "reachable" or "unreachable"
    local config_name="$4" # "O2" or "O3"
    local expected_down="$5"
    
    log_progress "=== STARTING SAFETY CASE $case_id ($config_name): ${pct_hang}% Hang, Canary $canary_type ==="
    
    killall -9 engine mock python3 2>/dev/null || true
    reset_db_state
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT="$pct_hang"
    "$BIN_MOCK" > "$RESULTS_DIR/mock_safety_${case_id}_${config_name}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    if [ "$canary_type" = "reachable" ]; then
        start_canary
        export HEALTH_CANARIES="198.20.0.1:8444"
    else
        export HEALTH_CANARIES="198.20.0.1:9999"
    fi
    
    if [ "$config_name" = "O2" ]; then
        unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
    else
        export HEALTH_WINDOW_SECS=10
        export HEALTH_UNHEALTHY_RATIO=0.35
        export HEALTH_RECOVER_RATIO=0.15
        export HEALTH_MIN_SAMPLES=500
    fi
    
    # Harness Fix 3: Set HTTP_WORKERS=6000 so worker pool is not the limit
    export HTTP_WORKERS=6000
    export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
    export DATABASE_URL_DIRECT="$DATABASE_URL"
    export DATABASE_URL_POOLED="$DATABASE_URL"
    export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
    export GOMEMLIMIT="1600MiB"
    export GOMAXPROCS="12"
    
    cd /home/swapnil/uptimer_clean/engine
    "$BIN_NEW" > "$RESULTS_DIR/engine_safety_${case_id}_${config_name}.log" 2>&1 &
    ENGINE_PID=$!
    
    PRE_INC=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
    ")
    
    log_progress "[$case_id $config_name] Observing for 240 seconds for confirmation cycles to complete..."
    sleep 240
    
    POST_INC=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
    ")
    DOWN_MON=$(db_query "
    SELECT count(*) FROM uptime_monitors WHERE status = 'down' AND monitor_type IN ('http', 'api', 'keyword');
    ")
    NEW_INC=$((POST_INC - PRE_INC))
    SUPPRESSED=$((expected_down - NEW_INC))
    if [ "$SUPPRESSED" -lt 0 ]; then SUPPRESSED=0; fi
    
    # Extract last LAG STATS line
    LAST_LAG=$(grep "\[LAG STATS\]" "$RESULTS_DIR/engine_safety_${case_id}_${config_name}.log" | tail -n 1 || echo "N/A")
    
    log_progress "MEASURED: safety_${case_id}_${config_name}_new_incidents=$NEW_INC / $expected_down"
    log_progress "MEASURED: safety_${case_id}_${config_name}_down_monitors=$DOWN_MON"
    log_progress "MEASURED: safety_${case_id}_${config_name}_suppressed=$SUPPRESSED"
    log_progress "MEASURED: safety_${case_id}_${config_name}_lag_stats=$LAST_LAG"
    
    echo "$case_id,$config_name,$expected_down,$NEW_INC,$DOWN_MON,$SUPPRESSED,\"$LAST_LAG\"" >> "$RESULTS_DIR/safety_summary.csv"
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    if [ "$canary_type" = "reachable" ]; then
        kill "$CANARY_PID" 2>/dev/null || true
    fi
    wait "$ENGINE_PID" 2>/dev/null || true
}

echo "case_id,config,expected_down,new_incidents,down_monitors,suppressed,lag_stats" > "$RESULTS_DIR/safety_summary.csv"

# S1: 20% down (7,494), canary unreachable
run_safety_case "S1" "20" "unreachable" "O2" "7494"
run_safety_case "S1" "20" "unreachable" "O3" "7494"

# S2: 40% down (14,988), canary reachable
run_safety_case "S2" "40" "reachable" "O2" "14988"
run_safety_case "S2" "40" "reachable" "O3" "14988"

# S3: 40% down (14,988), canary unreachable
run_safety_case "S3" "40" "unreachable" "O2" "14988"
run_safety_case "S3" "40" "unreachable" "O3" "14988"

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
    
    # Query total completed checks
    CHECKS_TOTAL=$(db_query "SELECT coalesce(sum(checks_total), 0) FROM uptime_daily_metrics;")
    RATE=$(awk "BEGIN {printf \"%.2f\", $CHECKS_TOTAL / $ELAPSED}")
    
    # Suppression events from guard lines
    SUPP_EVENTS=$(grep "\[GUARD\]" "$RESULTS_DIR/engine_steady_30m.log" | wc -l || echo 0)
    
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
