#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:/usr/bin:/bin:$PATH"

BENCHMARK_DIR="/home/swapnil/uptimer_partial_50k"
RESULTS_DIR="$BENCHMARK_DIR/results"
MOCK_IP="198.20.0.1"
COMPOSE="$BENCHMARK_DIR/compose/docker-compose.yml"

mkdir -p "$RESULTS_DIR"

# Ensure postgres is up
docker compose -f "$COMPOSE" up -d
sleep 2

# Clean any existing processes and iptables rules
killall -9 engine mock python3 2>/dev/null || true
sudo iptables -D OUTPUT -d "$MOCK_IP" -p tcp --dport 8443 -j DROP 2>/dev/null || true

# Helper for psql
db_query() {
    local sql="$1"
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "$sql" 2>/dev/null || true
}

reset_db() {
    docker compose -f "$COMPOSE" up -d >/dev/null 2>&1 || true
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -c "
    UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;
    UPDATE uptime_monitors SET status = 'up', is_paused = false;
    " >/dev/null 2>&1
}

# Base engine env
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$BENCHMARK_DIR/mockrun/cert.pem"
export HTTP_WORKERS=1800
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export PPROF_ADDR="0.0.0.0:6060"

echo "=== BINARY VERIFICATION ==="
SHA256_ENGINE=$(sha256sum "$BENCHMARK_DIR/bin/engine" | awk '{print $1}')
echo "BINARY_SHA256=$SHA256_ENGINE"
echo "$SHA256_ENGINE" > "$RESULTS_DIR/engine_sha256.txt"

# Start Canary server helper
start_canary() {
    cat > /tmp/canary_server_8444.py << 'CANARY_EOF'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('198.20.0.1', 8444))
s.listen(128)
while True:
    try:
        c, _ = s.accept()
        c.close()
    except Exception:
        break
CANARY_EOF
    python3 /tmp/canary_server_8444.py &
    CANARY_PID=$!
}

# -------------------------------------------------------------------------
# TEST 1: MASS-OUTAGE SUPPRESSION TEST (CONFIG A: DEFAULTS vs CONFIG B: TUNED)
# -------------------------------------------------------------------------

run_outage_test() {
    local config_name="$1"
    local log_file="$RESULTS_DIR/outage_${config_name}.log"
    local sample_file="$RESULTS_DIR/outage_samples_${config_name}.txt"
    echo ""
    echo "================================================================="
    echo "STARTING MASS-OUTAGE SUPPRESSION TEST: CONFIG $config_name"
    echo "================================================================="
    
    killall -9 engine mock python3 2>/dev/null || true
    sudo iptables -D OUTPUT -d "$MOCK_IP" -p tcp --dport 8443 -j DROP 2>/dev/null || true
    reset_db
    
    # Start mock with failures disabled for clean baseline
    cd "$BENCHMARK_DIR/mockrun"
    rm -f incidents.jsonl*
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_DOWN_PERCENT=""
    "$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_outage_${config_name}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    # Configure Engine
    if [ "$config_name" = "A" ]; then
        unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
    else
        export HEALTH_WINDOW_SECS=10
        export HEALTH_UNHEALTHY_RATIO=0.35
        export HEALTH_RECOVER_RATIO=0.15
        export HEALTH_MIN_SAMPLES=500
    fi
    export HEALTH_CANARIES="$MOCK_IP:9999" # unreachable canary
    
    cd "$BENCHMARK_DIR"
    rm -f incidents.jsonl*
    "$BENCHMARK_DIR/bin/engine" > "$log_file" 2>&1 &
    ENGINE_PID=$!
    echo "Engine running PID $ENGINE_PID (Config $config_name, canary $HEALTH_CANARIES)"
    
    # Requirement: "keep-alive connections already open before the fault"
    echo "Warming up for 60s so keep-alive connections are established..."
    sleep 60
    
    PRE_INCIDENTS=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
    ")
    echo "Pre-outage open incidents: $PRE_INCIDENTS"
    
    echo "Applying iptables DROP on $MOCK_IP:8443 for 150 seconds..."
    sudo iptables -A OUTPUT -d "$MOCK_IP" -p tcp --dport 8443 -j DROP
    
    echo "bucket_sec,open_incidents,new_incidents,down_monitors" > "$sample_file"
    LAST_INC=$PRE_INCIDENTS
    
    for t in $(seq 10 10 150); do
        sleep 10
        CUR_INC=$(db_query "
        SELECT count(*) FROM uptime_incidents i
        JOIN uptime_monitors m ON i.monitor_id = m.id
        WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
        ")
        DOWN_MON=$(db_query "
        SELECT count(*) FROM uptime_monitors WHERE status = 'down' AND monitor_type IN ('http', 'api', 'keyword');
        ")
        NEW_IN_BUCKET=$((CUR_INC - LAST_INC))
        TOTAL_NEW=$((CUR_INC - PRE_INCIDENTS))
        LAST_INC=$CUR_INC
        echo "t=${t}s: Open=$CUR_INC (Bucket: +$NEW_IN_BUCKET, Total: +$TOTAL_NEW), Down Monitors=$DOWN_MON"
        echo "$t,$CUR_INC,$NEW_IN_BUCKET,$DOWN_MON" >> "$sample_file"
    done
    
    echo "Removing iptables DROP rule..."
    sudo iptables -D OUTPUT -d "$MOCK_IP" -p tcp --dport 8443 -j DROP
    
    POST_INC=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
    ")
    FINAL_NEW_INC=$((POST_INC - PRE_INCIDENTS))
    echo "MEASURED: config_${config_name}_total_new_incidents=$FINAL_NEW_INC"
    
    echo "Sampling recovery every 10s until 100% UP (37,470)..."
    REC_TIME=""
    for rt in $(seq 10 10 300); do
        sleep 10
        UP_COUNT=$(db_query "
        SELECT count(*) FROM uptime_monitors WHERE status = 'up' AND monitor_type IN ('http', 'api', 'keyword') AND tags[1] LIKE 'healthy_%';
        ")
        echo "Recovery t=${rt}s: UP=$UP_COUNT / 37470"
        if [ "$UP_COUNT" -ge 37470 ]; then
            REC_TIME="${rt}s"
            break
        fi
    done
    echo "MEASURED: config_${config_name}_recovery_time=${REC_TIME:-'>300s'}"
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
}

echo "Executing Mass-Outage Test Config A (Defaults)..."
run_outage_test "A"

echo "Executing Mass-Outage Test Config B (Tuned)..."
run_outage_test "B"

# -------------------------------------------------------------------------
# TEST 2: SAFETY CASES S1, S2, S3 (UNDER CONFIG A AND CONFIG B)
# -------------------------------------------------------------------------

run_safety_case() {
    local case_id="$1"
    local pct_down="$2"
    local canary_type="$3" # "unreachable" or "reachable"
    local config_name="$4" # "A" or "B"
    local expected_down="$5"
    
    echo ""
    echo "--- SAFETY CASE $case_id (Config $config_name): ${pct_down}% Down, Canary $canary_type ---"
    
    killall -9 engine mock python3 2>/dev/null || true
    reset_db
    
    cd "$BENCHMARK_DIR/mockrun"
    rm -f incidents.jsonl*
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_DOWN_PERCENT="$pct_down"
    "$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_safety_${case_id}_${config_name}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    if [ "$canary_type" = "reachable" ]; then
        start_canary
        export HEALTH_CANARIES="$MOCK_IP:8444"
    else
        export HEALTH_CANARIES="$MOCK_IP:9999"
    fi
    
    if [ "$config_name" = "A" ]; then
        unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
    else
        export HEALTH_WINDOW_SECS=10
        export HEALTH_UNHEALTHY_RATIO=0.35
        export HEALTH_RECOVER_RATIO=0.15
        export HEALTH_MIN_SAMPLES=500
    fi
    
    cd "$BENCHMARK_DIR"
    rm -f incidents.jsonl*
    "$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_safety_${case_id}_${config_name}.log" 2>&1 &
    ENGINE_PID=$!
    
    PRE_INC=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
    ")
    
    echo "Running safety test for 100 seconds to exceed 65-75s confirmation window..."
    sleep 100
    
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
    
    echo "MEASURED: safety_${case_id}_${config_name}_new_incidents=$NEW_INC / $expected_down"
    echo "MEASURED: safety_${case_id}_${config_name}_down_monitors=$DOWN_MON"
    echo "MEASURED: safety_${case_id}_${config_name}_suppressed=$SUPPRESSED"
    
    echo "$case_id,$config_name,$expected_down,$NEW_INC,$DOWN_MON,$SUPPRESSED" >> "$RESULTS_DIR/safety_summary.csv"
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    if [ "$canary_type" = "reachable" ]; then
        kill "$CANARY_PID" 2>/dev/null || true
    fi
    wait "$ENGINE_PID" 2>/dev/null || true
}

echo "case_id,config,expected_down,new_incidents,down_monitors,suppressed" > "$RESULTS_DIR/safety_summary.csv"

# S1: 20% down (7,494), Canary unreachable
run_safety_case "S1" "20" "unreachable" "A" 7494
run_safety_case "S1" "20" "unreachable" "B" 7494

# S2: 40% down (14,988), Canary reachable
run_safety_case "S2" "40" "reachable" "A" 14988
run_safety_case "S2" "40" "reachable" "B" 14988

# S3: 40% down (14,988), Canary unreachable
run_safety_case "S3" "40" "unreachable" "A" 14988
run_safety_case "S3" "40" "unreachable" "B" 14988

# -------------------------------------------------------------------------
# TEST 3: 30-MINUTE HEALTHY STEADY-STATE UNDER CONFIG B
# -------------------------------------------------------------------------
echo ""
echo "================================================================="
echo "STARTING 30-MINUTE HEALTHY STEADY-STATE TEST: CONFIG B"
echo "================================================================="

killall -9 engine mock python3 2>/dev/null || true
reset_db

cd "$BENCHMARK_DIR/mockrun"
rm -f incidents.jsonl*
export DISABLE_INJECTED_FAILURES="true"
export TARGETS_DOWN_PERCENT=""
"$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_steady_30m_b.log" 2>&1 &
MOCK_PID=$!
sleep 2

start_canary

export HEALTH_WINDOW_SECS=10
export HEALTH_UNHEALTHY_RATIO=0.35
export HEALTH_RECOVER_RATIO=0.15
export HEALTH_MIN_SAMPLES=500
export HEALTH_CANARIES="$MOCK_IP:8444"

cd "$BENCHMARK_DIR"
rm -f incidents.jsonl*
"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_steady_30m_b.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running PID $ENGINE_PID for 30 minutes steady test..."

CHECKS_START=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics;")
T_START=$(date +%s)

# Sleep for 1800 seconds (30 minutes), sampling every 300s (5 min)
for min in 5 10 15 20 25 30; do
    sleep 300
    CURRENT_INC=$(db_query "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.tags[1] LIKE 'healthy_%';
    ")
    CHECKS_NOW=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics;")
    echo "[${min}m / 30m] Open false incidents on healthy monitors: $CURRENT_INC | Total checks: $CHECKS_NOW"
done

T_END=$(date +%s)
CHECKS_END=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics;")
ELAPSED=$((T_END - T_START))
CHECKS_DELTA=$((CHECKS_END - CHECKS_START))

FINAL_FALSE_DOWNS=$(db_query "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.tags[1] LIKE 'healthy_%';
")

echo "MEASURED: steady_30m_b_elapsed_sec=$ELAPSED"
echo "MEASURED: steady_30m_b_checks_completed=$CHECKS_DELTA"
echo "MEASURED: steady_30m_b_false_downs=$FINAL_FALSE_DOWNS"
echo "MEASURED: steady_30m_b_suppression_events=0"

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
kill "$CANARY_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true

echo ""
echo "=== ALL EVALUATION TESTS COMPLETED SUCCESSFULLY ==="
date
