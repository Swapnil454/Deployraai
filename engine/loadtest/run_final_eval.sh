#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:/usr/bin:/bin:$PATH"

BENCHMARK_DIR="/home/swapnil/uptimer_partial_50k"
RESULTS_DIR="$BENCHMARK_DIR/results"
MOCK_IP="198.20.0.1"
COMPOSE="$BENCHMARK_DIR/compose/docker-compose.yml"
CALC_CPU="$BENCHMARK_DIR/calc_cpu.py"

# Engine environment configuration
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$BENCHMARK_DIR/mockrun/cert.pem"
export HTTP_WORKERS=1800
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export PPROF_ADDR="0.0.0.0:6060"

killall -9 engine mock python3 2>/dev/null || true

# Helper for psql
db_query() {
    local sql="$1"
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "$sql" 2>/dev/null || true
}

echo "=== STARTING FINAL EVALUATION HARNESS ==="
date

# -------------------------------------------------------------
# ITEM 1: SUPPRESSION TEST (Canary unreachable + Mock STOPPED for 150s)
# -------------------------------------------------------------
echo ""
echo "=========================================================="
echo "ITEM 1: SUPPRESSION TEST (CASE B: 150s TIMEOUT OUTAGE)"
echo "=========================================================="

# Reset DB
db_query "UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;"
db_query "UPDATE uptime_monitors SET status = 'up', is_paused = false;"

# Start mock
cd "$BENCHMARK_DIR/mockrun"
rm -f incidents.jsonl*
export DISABLE_INJECTED_FAILURES="true"
"$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_suppression.log" 2>&1 &
MOCK_PID=$!
sleep 2

# Start engine with unreachable canary
cd "$BENCHMARK_DIR"
rm -f incidents.jsonl*
export HEALTH_CANARIES="$MOCK_IP:9999"
"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_suppression.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running with unreachable canary ($HEALTH_CANARIES), PID $ENGINE_PID"
sleep 20
kill -0 "$ENGINE_PID" || { echo "Engine failed to stay running!"; cat "$RESULTS_DIR/engine_suppression.log"; exit 1; }

PRE_SUPP_INCIDENTS=$(db_query "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
")
echo "Pre-outage open incidents (HTTP/API/KW): $PRE_SUPP_INCIDENTS"

echo "Stopping Mock server (kill -STOP) for 150 seconds to inject timeouts..."
kill -STOP "$MOCK_PID"
sleep 150

POST_SUPP_INCIDENTS=$(db_query "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
")
NEW_SUPP_INCIDENTS=$((POST_SUPP_INCIDENTS - PRE_SUPP_INCIDENTS))

SUPP_DOWN_MONITORS=$(db_query "
SELECT count(*) FROM uptime_monitors WHERE status = 'down' AND monitor_type IN ('http', 'api', 'keyword');
")

echo "Resuming and stopping mock..."
kill -CONT "$MOCK_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
kill -TERM "$ENGINE_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
sleep 3

echo "MEASURED: item1_case_b_timeout_duration=150s"
echo "MEASURED: item1_case_b_timeout_new_incidents_opened=$NEW_SUPP_INCIDENTS"
echo "MEASURED: item1_case_b_timeout_down_monitors=$SUPP_DOWN_MONITORS"
echo "MODELLED: item1_case_b_timeout_suppressed_checks=187500"

# -------------------------------------------------------------
# ITEM 2: RECOVERY CURVES (Case a and Refused Phase of Case b)
# -------------------------------------------------------------
echo ""
echo "=========================================================="
echo "ITEM 2A: RECOVERY FOR CASE A (150s STOPPED OUTAGE)"
echo "=========================================================="

# Reset DB
db_query "UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;"
db_query "UPDATE uptime_monitors SET status = 'up', is_paused = false;"

# Start TCP Canary on 8444
cat > /tmp/canary_8444.py << 'CANARY_EOF'
import socket
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
s.bind(('198.20.0.1', 8444))
s.listen(128)
while True:
    try:
        conn, _ = s.accept()
        conn.close()
    except Exception:
        pass
CANARY_EOF
python3 /tmp/canary_8444.py &
CANARY_PID=$!

# Start mock
cd "$BENCHMARK_DIR/mockrun"
rm -f incidents.jsonl*
"$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_recovery_a.log" 2>&1 &
MOCK_PID=$!
sleep 2

# Start engine with reachable canary
cd "$BENCHMARK_DIR"
rm -f incidents.jsonl*
export HEALTH_CANARIES="$MOCK_IP:8444"
"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_recovery_a.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running with reachable canary, PID $ENGINE_PID"
sleep 20
kill -0 "$ENGINE_PID" || { echo "Engine failed to stay running!"; cat "$RESULTS_DIR/engine_recovery_a.log"; exit 1; }

echo "Injecting 150s outage for Case A..."
kill -STOP "$MOCK_PID"
sleep 150

A_DOWN=$(db_query "SELECT count(*) FROM uptime_monitors WHERE status = 'down' AND monitor_type IN ('http', 'api', 'keyword');")
echo "Monitors DOWN prior to recovery: $A_DOWN / 37500"

echo "Resuming Mock server (kill -CONT)..."
kill -CONT "$MOCK_PID"

echo "Sampling Case A recovery every 10s up to 300s..."
T50_A=""
T95_A=""
T100_A=""

for elapsed in $(seq 0 10 300); do
    UP_COUNT=$(db_query "SELECT count(*) FROM uptime_monitors WHERE status = 'up' AND monitor_type IN ('http', 'api', 'keyword') AND tags[1] LIKE 'healthy_%';")
    echo "Case A Recovery: t=${elapsed}s UP=$UP_COUNT / 37470"
    
    if [ -z "$T50_A" ] && [ "$UP_COUNT" -ge 18735 ]; then
        T50_A="${elapsed}s"
    fi
    if [ -z "$T95_A" ] && [ "$UP_COUNT" -ge 35597 ]; then
        T95_A="${elapsed}s"
    fi
    if [ -z "$T100_A" ] && [ "$UP_COUNT" -ge 37470 ]; then
        T100_A="${elapsed}s"
        break
    fi
    sleep 10
done

echo "MEASURED: case_a_recovery_time_to_50pct=${T50_A:-'>300s'}"
echo "MEASURED: case_a_recovery_time_to_95pct=${T95_A:-'>300s'}"
echo "MEASURED: case_a_recovery_time_to_100pct=${T100_A:-'>300s'}"

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
kill "$CANARY_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
sleep 3

echo ""
echo "=========================================================="
echo "ITEM 2B: RECOVERY FOR CASE B REFUSED PHASE (75s REFUSED)"
echo "=========================================================="

# Reset DB
db_query "UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;"
db_query "UPDATE uptime_monitors SET status = 'up', is_paused = false;"

# Start mock
cd "$BENCHMARK_DIR/mockrun"
rm -f incidents.jsonl*
"$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_recovery_b.log" 2>&1 &
MOCK_PID=$!
sleep 2

# Start engine with unreachable canary
cd "$BENCHMARK_DIR"
rm -f incidents.jsonl*
export HEALTH_CANARIES="$MOCK_IP:9999"
"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_recovery_b.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running with unreachable canary, PID $ENGINE_PID"
sleep 20
kill -0 "$ENGINE_PID" || { echo "Engine failed to stay running!"; cat "$RESULTS_DIR/engine_recovery_b.log"; exit 1; }

echo "Killing mock to trigger Connection Refused for 75s..."
kill -9 "$MOCK_PID" 2>/dev/null || true
sleep 75

B_REFUSED_DOWN=$(db_query "SELECT count(*) FROM uptime_monitors WHERE status = 'down' AND monitor_type IN ('http', 'api', 'keyword');")
echo "Monitors DOWN prior to recovery: $B_REFUSED_DOWN / 37500"

echo "Restarting mock with persisted cert/key..."
cd "$BENCHMARK_DIR/mockrun"
"$BENCHMARK_DIR/bin/mock" >> "$RESULTS_DIR/mock_recovery_b.log" 2>&1 &
MOCK_PID=$!

echo "Sampling Case B Refused recovery every 10s up to 300s..."
T50_B=""
T95_B=""
T100_B=""

for elapsed in $(seq 0 10 300); do
    UP_COUNT=$(db_query "SELECT count(*) FROM uptime_monitors WHERE status = 'up' AND monitor_type IN ('http', 'api', 'keyword') AND tags[1] LIKE 'healthy_%';")
    echo "Case B Recovery: t=${elapsed}s UP=$UP_COUNT / 37470"
    
    if [ -z "$T50_B" ] && [ "$UP_COUNT" -ge 18735 ]; then
        T50_B="${elapsed}s"
    fi
    if [ -z "$T95_B" ] && [ "$UP_COUNT" -ge 35597 ]; then
        T95_B="${elapsed}s"
    fi
    if [ -z "$T100_B" ] && [ "$UP_COUNT" -ge 37470 ]; then
        T100_B="${elapsed}s"
        break
    fi
    sleep 10
done

echo "MEASURED: case_b_recovery_time_to_50pct=${T50_B:-'>300s'}"
echo "MEASURED: case_b_recovery_time_to_95pct=${T95_B:-'>300s'}"
echo "MEASURED: case_b_recovery_time_to_100pct=${T100_B:-'>300s'}"

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
sleep 3

# -------------------------------------------------------------
# ITEM 3: CPU PROFILING (10 min All + 5 min Ping + 5 min HTTP/API/KW)
# -------------------------------------------------------------
echo ""
echo "=========================================================="
echo "ITEM 3A: 10-MINUTE STEADY-STATE CPU (ALL 50,000 MONITORS)"
echo "=========================================================="

# Reset DB
db_query "UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;"
db_query "UPDATE uptime_monitors SET status = 'up', is_paused = false;"

# Restart canary 8444
python3 /tmp/canary_8444.py &
CANARY_PID=$!

# Start mock
cd "$BENCHMARK_DIR/mockrun"
rm -f incidents.jsonl*
"$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_cpu_steady.log" 2>&1 &
MOCK_PID=$!
sleep 2

# Start engine
cd "$BENCHMARK_DIR"
rm -f incidents.jsonl*
export HEALTH_CANARIES="$MOCK_IP:8444"
"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_cpu_steady.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running PID $ENGINE_PID, warming up 30s..."
sleep 30
kill -0 "$ENGINE_PID" || { echo "Engine failed to stay running!"; cat "$RESULTS_DIR/engine_cpu_steady.log"; exit 1; }

read T0 U0 S0 CG0 <<< $(python3 "$CALC_CPU" snapshot "$ENGINE_PID")
CHECKS0=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics;")
echo "Snapshot 0: T=$T0, ticks=$((U0 + S0)), cg=$CG0, checks=$CHECKS0"

echo "Running 10 minutes (600s) steady window..."
sleep 600

read T1 U1 S1 CG1 <<< $(python3 "$CALC_CPU" snapshot "$ENGINE_PID")
CHECKS1=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics;")
DELTA_CHECKS=$((CHECKS1 - CHECKS0))
echo "Snapshot 1: T=$T1, ticks=$((U1 + S1)), cg=$CG1, checks=$CHECKS1, delta_checks=$DELTA_CHECKS"

python3 "$CALC_CPU" calc "$T0" "$U0" "$S0" "$CG0" "$T1" "$U1" "$S1" "$CG1" "$DELTA_CHECKS" > "$RESULTS_DIR/cpu_steady_10m.txt"
cat "$RESULTS_DIR/cpu_steady_10m.txt"

kill -TERM "$ENGINE_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
sleep 3

echo ""
echo "=========================================================="
echo "ITEM 3B: 5-MINUTE CPU (PING MONITORS ONLY: 12,500 MONITORS)"
echo "=========================================================="

db_query "UPDATE uptime_monitors SET is_paused = true WHERE monitor_type IN ('http', 'api', 'keyword');"
db_query "UPDATE uptime_monitors SET is_paused = false WHERE monitor_type = 'ping';"

cd "$BENCHMARK_DIR"
rm -f incidents.jsonl*
"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_cpu_ping.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running (Ping only) PID $ENGINE_PID, warming up 20s..."
sleep 20
kill -0 "$ENGINE_PID" || { echo "Engine failed to stay running!"; cat "$RESULTS_DIR/engine_cpu_ping.log"; exit 1; }

read T0_PING U0_PING S0_PING CG0_PING <<< $(python3 "$CALC_CPU" snapshot "$ENGINE_PID")
CHECKS0_PING=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics WHERE monitor_id IN (SELECT id FROM uptime_monitors WHERE monitor_type = 'ping');")

echo "Running 5 minutes (300s) Ping window..."
sleep 300

read T1_PING U1_PING S1_PING CG1_PING <<< $(python3 "$CALC_CPU" snapshot "$ENGINE_PID")
CHECKS1_PING=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics WHERE monitor_id IN (SELECT id FROM uptime_monitors WHERE monitor_type = 'ping');")
DELTA_PING=$((CHECKS1_PING - CHECKS0_PING))

python3 "$CALC_CPU" calc "$T0_PING" "$U0_PING" "$S0_PING" "$CG0_PING" "$T1_PING" "$U1_PING" "$S1_PING" "$CG1_PING" "$DELTA_PING" > "$RESULTS_DIR/cpu_ping_5m.txt"
cat "$RESULTS_DIR/cpu_ping_5m.txt"

kill -TERM "$ENGINE_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
sleep 3

echo ""
echo "=========================================================="
echo "ITEM 3C: 5-MINUTE CPU (HTTP/API/KW MONITORS ONLY: 37,500 MONITORS)"
echo "=========================================================="

db_query "UPDATE uptime_monitors SET is_paused = false WHERE monitor_type IN ('http', 'api', 'keyword');"
db_query "UPDATE uptime_monitors SET is_paused = true WHERE monitor_type = 'ping';"

cd "$BENCHMARK_DIR"
rm -f incidents.jsonl*
"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_cpu_http.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running (HTTP/API/KW only) PID $ENGINE_PID, warming up 20s..."
sleep 20
kill -0 "$ENGINE_PID" || { echo "Engine failed to stay running!"; cat "$RESULTS_DIR/engine_cpu_http.log"; exit 1; }

read T0_HTTP U0_HTTP S0_HTTP CG0_HTTP <<< $(python3 "$CALC_CPU" snapshot "$ENGINE_PID")
CHECKS0_HTTP=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics WHERE monitor_id IN (SELECT id FROM uptime_monitors WHERE monitor_type = 'ping');")
# Note: we query http/api/kw checks:
CHECKS0_HTTP=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics WHERE monitor_id IN (SELECT id FROM uptime_monitors WHERE monitor_type IN ('http', 'api', 'keyword'));")

echo "Running 5 minutes (300s) HTTP/API/KW window..."
sleep 300

read T1_HTTP U1_HTTP S1_HTTP CG1_HTTP <<< $(python3 "$CALC_CPU" snapshot "$ENGINE_PID")
CHECKS1_HTTP=$(db_query "SELECT COALESCE(SUM(total_checks), 0) FROM uptime_daily_metrics WHERE monitor_id IN (SELECT id FROM uptime_monitors WHERE monitor_type IN ('http', 'api', 'keyword'));")
DELTA_HTTP=$((CHECKS1_HTTP - CHECKS0_HTTP))

python3 "$CALC_CPU" calc "$T0_HTTP" "$U0_HTTP" "$S0_HTTP" "$CG0_HTTP" "$T1_HTTP" "$U1_HTTP" "$S1_HTTP" "$CG1_HTTP" "$DELTA_HTTP" > "$RESULTS_DIR/cpu_http_5m.txt"
cat "$RESULTS_DIR/cpu_http_5m.txt"

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
kill "$CANARY_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true

# Reset all monitors to unpaused
db_query "UPDATE uptime_monitors SET is_paused = false;"

echo ""
echo "=== ALL FINAL EVALUATION TESTS COMPLETE ==="
date
