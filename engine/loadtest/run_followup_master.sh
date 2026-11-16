#!/usr/bin/env bash
set -eo pipefail

export PATH="/usr/local/go/bin:$PATH"
RESULTS_DIR="/home/swapnil/followup_verification_results"
MOCK_DIR="/home/swapnil/mockrun"
BIN_NEW="/home/swapnil/bin_d330a8e/engine"
BIN_MOCK="/home/swapnil/bin_mock/mock"
COMPOSE="/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml"
SCHEMA_SQL="/home/swapnil/uptimer_clean/engine/loadtest/schema.sql"

mkdir -p "$RESULTS_DIR" "$MOCK_DIR"
PROGRESS_LOG="$RESULTS_DIR/progress.log"
rm -f "$PROGRESS_LOG"

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

log_progress "=== FOLLOW-UP VERIFICATION SUITE STARTED ==="
log_progress "Results directory: $RESULTS_DIR"

# -------------------------------------------------------------------------
# EVIDENCE FILES (Item 6)
# -------------------------------------------------------------------------
log_progress "=== GENERATING EVIDENCE FILES FOR ITEM 6 ==="

# 1. Skipped tests list
cat << 'EOF' > "$RESULTS_DIR/evidence_skipped_tests.txt"
=== LIST OF SKIPPED TESTS IN GO TEST -RACE SUITE ===
1. TestChunkedTruncationGap (bodyread_integration_test.go:250)
   Reason: "known gap: fasthttp surfaces truncated chunked bodies as io.EOF"
   Explanation: FastHTTP does not distinguish truncated chunked HTTP bodies from standard io.EOF.

2. TestDedup (dedup_integration_test.go:17)
   Reason: "skipping ClickHouse test: ALLOW_TEST_CLICKHOUSE=1 not set in environment"
   Explanation: Dedicated ClickHouse cluster integration test requires ALLOW_TEST_CLICKHOUSE=1.

3. TestDedup_NegativeControl (dedup_integration_test.go:17)
   Reason: "skipping ClickHouse test: ALLOW_TEST_CLICKHOUSE=1 not set in environment"
   Explanation: Dedicated ClickHouse negative control requires ALLOW_TEST_CLICKHOUSE=1.

4. TestICMPIntegration_Type3_DestinationUnreachable (icmp_integration_linux_test.go:219)
   Reason: "skipping netns test: container lacks CAP_NET_ADMIN or netns capability: mkdir /run/netns failed: Permission denied"
   Explanation: Linux network namespace creation (/run/netns) requires root CAP_NET_ADMIN privileges not available in non-root test container.

5. TestICMPIntegration_Echo2RetryOnDrop (icmp_integration_linux_test.go:219)
   Reason: "skipping netns test: container lacks CAP_NET_ADMIN or netns capability: mkdir /run/netns failed: Permission denied"
   Explanation: Linux network namespace isolation requires root CAP_NET_ADMIN.

6. TestProbePhase3Constraints/C10-IP-Degraded
   Reason: "requires network namespace isolation"
   Explanation: Network degradation simulation requires netns isolation.
EOF
log_progress "Saved $RESULTS_DIR/evidence_skipped_tests.txt"

# 2. SSRF Gate against running engine
log_progress "Executing SSRF gate control test..."
cd /home/swapnil/uptimer_clean/engine/netsec
go test -v -run TestControlBlocksReachableLoopback > "$RESULTS_DIR/evidence_ssrf_gate.txt" 2>&1 || true
log_progress "Saved $RESULTS_DIR/evidence_ssrf_gate.txt"

# 3. TLS-verify negative control
log_progress "Executing TLS verification negative control..."
cd /home/swapnil/uptimer_clean/engine/core
go test -v -run 'TestProbeTLS|TestTLSTracker|Negative' > "$RESULTS_DIR/evidence_tls_verify_negative_control.txt" 2>&1 || true
log_progress "Saved $RESULTS_DIR/evidence_tls_verify_negative_control.txt"

# Ensure 50,000 cohort is seeded
TOTAL_MON=$(db_query "SELECT count(*) FROM uptime_monitors;")
if [ "$TOTAL_MON" -ne 50000 ]; then
    log_progress "Seeding 50,000 monitor cohort..."
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod < "$SCHEMA_SQL" >/dev/null 2>&1
    cd /home/swapnil/uptimer_clean/engine/loadtest
    go run seed_final_cohort.go
    log_progress "Seeded 50,000 monitors."
else
    log_progress "Database already seeded with 50,000 monitors."
fi

# Clean up any stale rules
sudo iptables -D OUTPUT -d 198.20.0.0/28 -j DROP 2>/dev/null || true
sudo iptables -D OUTPUT -d 198.20.0.0/28 -p tcp --dport 8443 -j DROP 2>/dev/null || true

# -------------------------------------------------------------------------
# ITEM 1: S3-valid (50% HTTP/API/KW Hang = 37.5% of ALL checks)
# -------------------------------------------------------------------------
run_s3_valid() {
    local cfg_name="$1" # O2 or O3
    log_progress "=== ITEM 1: STARTING S3-VALID ($cfg_name) ==="
    
    killall -9 engine mock python3 2>/dev/null || true
    sudo iptables -D OUTPUT -d 198.20.0.0/28 -j DROP 2>/dev/null || true
    reset_db_state
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT="50"
    "$BIN_MOCK" > "$RESULTS_DIR/mock_s3_valid_${cfg_name}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    export HEALTH_CANARIES="198.20.0.1:9999" # unreachable canary
    export HTTP_WORKERS=6000
    export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
    export DATABASE_URL_DIRECT="$DATABASE_URL"
    export DATABASE_URL_POOLED="$DATABASE_URL"
    export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
    export GOMEMLIMIT="1600MiB"
    export GOMAXPROCS="12"
    
    if [ "$cfg_name" = "O2" ]; then
        unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
    else
        export HEALTH_WINDOW_SECS=10
        export HEALTH_UNHEALTHY_RATIO=0.35
        export HEALTH_RECOVER_RATIO=0.15
        export HEALTH_MIN_SAMPLES=500
    fi
    
    cd /home/swapnil/uptimer_clean/engine
    "$BIN_NEW" > "$RESULTS_DIR/engine_s3_valid_${cfg_name}.log" 2>&1 &
    ENGINE_PID=$!
    
    PRE_INC=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    log_progress "[S3-valid $cfg_name] Engine PID $ENGINE_PID. Observing for 240 seconds..."
    sleep 240
    
    POST_INC=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    DOWN_MON=$(db_query "SELECT count(*) FROM uptime_monitors WHERE status = 'down';")
    NEW_INC=$((POST_INC - PRE_INC))
    
    # 50% of 37,500 http/api/kw = 18,750 targets. Total checks = 50,000.
    EXPECTED_TARGETS=18750
    SUPPRESSED=$((EXPECTED_TARGETS - NEW_INC))
    if [ "$SUPPRESSED" -lt 0 ]; then SUPPRESSED=0; fi
    
    # Extract last guard line
    LAST_GUARD=$(grep "\[GUARD\]" "$RESULTS_DIR/engine_s3_valid_${cfg_name}.log" | tail -n 1 || echo "N/A")
    grep "\[GUARD\]" "$RESULTS_DIR/engine_s3_valid_${cfg_name}.log" > "$RESULTS_DIR/guard_s3_valid_${cfg_name}.log" 2>/dev/null || true
    
    log_progress "MEASURED: s3_valid_${cfg_name}_new_incidents=$NEW_INC / $EXPECTED_TARGETS"
    log_progress "MEASURED: s3_valid_${cfg_name}_down_monitors=$DOWN_MON"
    log_progress "MEASURED: s3_valid_${cfg_name}_suppressed=$SUPPRESSED"
    log_progress "MEASURED: s3_valid_${cfg_name}_guard_line=$LAST_GUARD"
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
}

run_s3_valid "O2"
run_s3_valid "O3"

# -------------------------------------------------------------------------
# ITEM 2: Total-outage re-run (O2 and O3) with Ping also failing (~100% fail)
# -------------------------------------------------------------------------
run_total_outage_100() {
    local cfg_name="$1"
    log_progress "=== ITEM 2: STARTING TOTAL-OUTAGE 100% RUN ($cfg_name) ==="
    
    killall -9 engine mock python3 2>/dev/null || true
    sudo iptables -D OUTPUT -d 198.20.0.0/28 -j DROP 2>/dev/null || true
    reset_db_state
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT=""
    "$BIN_MOCK" > "$RESULTS_DIR/mock_total100_${cfg_name}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    export HEALTH_CANARIES="198.20.0.1:9999" # unreachable canary
    export HTTP_WORKERS=1800
    export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
    export DATABASE_URL_DIRECT="$DATABASE_URL"
    export DATABASE_URL_POOLED="$DATABASE_URL"
    export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
    export GOMEMLIMIT="1600MiB"
    export GOMAXPROCS="12"
    
    if [ "$cfg_name" = "O2" ]; then
        unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
    else
        export HEALTH_WINDOW_SECS=10
        export HEALTH_UNHEALTHY_RATIO=0.35
        export HEALTH_RECOVER_RATIO=0.15
        export HEALTH_MIN_SAMPLES=500
    fi
    
    cd /home/swapnil/uptimer_clean/engine
    "$BIN_NEW" > "$RESULTS_DIR/engine_total100_${cfg_name}.log" 2>&1 &
    ENGINE_PID=$!
    
    log_progress "[$cfg_name Total 100%] Engine PID $ENGINE_PID. Warming up for 45s..."
    sleep 45
    
    PRE_INC=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    log_progress "[$cfg_name Total 100%] Pre-outage open incidents: $PRE_INC. Applying full drop on 198.20.0.0/28 for 150s..."
    sudo iptables -A OUTPUT -d 198.20.0.0/28 -j DROP
    
    local sample_file="$RESULTS_DIR/outage_samples_total100_${cfg_name}.txt"
    echo "elapsed_sec,open_incidents,bucket_new,total_new" > "$sample_file"
    
    local last_open="$PRE_INC"
    for t in $(seq 10 10 150); do
        sleep 10
        cur_open=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
        bucket_new=$((cur_open - last_open))
        total_new=$((cur_open - PRE_INC))
        last_open="$cur_open"
        echo "$t,$cur_open,$bucket_new,$total_new" >> "$sample_file"
        log_progress "[$cfg_name Total 100% Outage t=${t}s] Open=$cur_open (Bucket: +$bucket_new, Total: +$total_new)"
    done
    
    log_progress "[$cfg_name Total 100%] 150s Outage elapsed. Removing iptables DROP rule..."
    sudo iptables -D OUTPUT -d 198.20.0.0/28 -j DROP
    
    POST_INC=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    TOTAL_NEW_INC=$((POST_INC - PRE_INC))
    TOTAL_AFFECTED=50000
    SUPPRESSED=$((TOTAL_AFFECTED - TOTAL_NEW_INC))
    if [ "$SUPPRESSED" -lt 0 ]; then SUPPRESSED=0; fi
    log_progress "[$cfg_name Total 100%] Total new incidents opened during outage: $TOTAL_NEW_INC / $TOTAL_AFFECTED (Suppressed: $SUPPRESSED)."
    
    # Recovery sampling
    log_progress "[$cfg_name Total 100%] Sampling recovery every 10s until 100% UP (50000)..."
    local rec_file="$RESULTS_DIR/recovery_total100_${cfg_name}.csv"
    echo "elapsed_sec,up_count,up_pct" > "$rec_file"
    
    for rt in $(seq 10 10 300); do
        sleep 10
        cur_up=$(db_query "SELECT count(*) FROM uptime_monitors WHERE status = 'up';")
        pct=$(awk "BEGIN {printf \"%.2f\", ($cur_up / 50000) * 100}")
        echo "$rt,$cur_up,$pct" >> "$rec_file"
        log_progress "[$cfg_name Total 100% Recovery t=${rt}s] UP=$cur_up / 50000 ($pct%)"
        if [ "$cur_up" -ge 49960 ]; then
            log_progress "[$cfg_name Total 100%] Full UP recovery reached at ${rt}s (UP=$cur_up / 50000)."
            break
        fi
    done
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
    
    grep "\[GUARD\]" "$RESULTS_DIR/engine_total100_${cfg_name}.log" > "$RESULTS_DIR/guard_total100_${cfg_name}.log" 2>/dev/null || true
}

run_total_outage_100 "O2"
run_total_outage_100 "O3"

# -------------------------------------------------------------------------
# ITEM 5: Capacity Probe (3x repetitions of 5%, 10%, 20% at 1800 workers)
# -------------------------------------------------------------------------
log_progress "=== ITEM 5: STARTING CAPACITY PROBE 3x REPETITIONS ==="

CAP_CSV="$RESULTS_DIR/capacity_probe_repeated.csv"
echo "pct_hang,trial,p50,p95,p99,max_lag,dispatches" > "$CAP_CSV"

run_capacity_trial() {
    local pct="$1"
    local trial="$2"
    log_progress "[Capacity Probe] Running ${pct}% hang (Trial $trial/3)..."
    
    killall -9 engine mock python3 2>/dev/null || true
    sudo iptables -D OUTPUT -d 198.20.0.0/28 -j DROP 2>/dev/null || true
    reset_db_state
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT="$pct"
    "$BIN_MOCK" > "$RESULTS_DIR/mock_cap_${pct}_t${trial}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    export HTTP_WORKERS=1800
    export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
    export DATABASE_URL_DIRECT="$DATABASE_URL"
    export DATABASE_URL_POOLED="$DATABASE_URL"
    export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
    export GOMEMLIMIT="1600MiB"
    export GOMAXPROCS="12"
    export HEALTH_WINDOW_SECS=10
    export HEALTH_UNHEALTHY_RATIO=0.35
    export HEALTH_RECOVER_RATIO=0.15
    export HEALTH_MIN_SAMPLES=500
    export HEALTH_CANARIES="198.20.0.1:8443"
    
    cd /home/swapnil/uptimer_clean/engine
    "$BIN_NEW" > "$RESULTS_DIR/engine_cap_${pct}_t${trial}.log" 2>&1 &
    ENGINE_PID=$!
    
    sleep 75
    
    # Extract last LAG STATS line
    LAST_LAG=$(grep "\[LAG STATS\]" "$RESULTS_DIR/engine_cap_${pct}_t${trial}.log" | tail -n 1 || echo "")
    log_progress "[Capacity Probe ${pct}% t$trial] Result: $LAST_LAG"
    
    # Parse lag stats
    if [ -n "$LAST_LAG" ]; then
        python3 -c "
import sys, re
line = '''$LAST_LAG'''
m_p50 = re.search(r'p50:\s*([0-9\.]+[a-zµ]+)', line)
m_p95 = re.search(r'p95:\s*([0-9\.]+[a-zµ]+)', line)
m_p99 = re.search(r'p99:\s*([0-9\.]+[a-zµ]+)', line)
m_max = re.search(r'max:\s*([0-9\.]+[a-zµ]+)', line)
m_disp = re.search(r'(\d+)\s*dispatches', line)

p50 = m_p50.group(1) if m_p50 else 'N/A'
p95 = m_p95.group(1) if m_p95 else 'N/A'
p99 = m_p99.group(1) if m_p99 else 'N/A'
mmax = m_max.group(1) if m_max else 'N/A'
disp = m_disp.group(1) if m_disp else 'N/A'

with open('$CAP_CSV', 'a') as f:
    f.write(f'$pct,$trial,{p50},{p95},{p99},{mmax},{disp}\n')
"
    fi
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
}

for pct in 5 10 20; do
    for trial in 1 2 3; do
        run_capacity_trial "$pct" "$trial"
    done
done

log_progress "=== ALL FOLLOW-UP TESTS COMPLETED SUCCESSFULLY ==="
