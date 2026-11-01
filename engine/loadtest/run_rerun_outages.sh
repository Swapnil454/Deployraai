#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:/usr/bin:/bin:$PATH"

BENCHMARK_DIR="/home/swapnil/uptimer_partial_50k"
RESULTS_DIR="$BENCHMARK_DIR/results"
MOCK_IP="198.20.0.1"
COMPOSE="$BENCHMARK_DIR/compose/docker-compose.yml"

# Ensure any previous instances are cleaned
killall -9 engine mock python3 2>/dev/null || true

# 1. Start mock server with persisted cert
echo "Starting Mock server (persisted cert)..."
cd "$BENCHMARK_DIR/mockrun"
rm -f check_timestamps.csv
export DISABLE_INJECTED_FAILURES="true"
"$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_rerun.log" 2>&1 &
MOCK_PID=$!
sleep 2

# Start TCP Canary on 8444
cat > /tmp/canary_server.py << 'CANARY_EOF'
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
python3 /tmp/canary_server.py &
CANARY_PID=$!
echo "Canary running on 8444 (PID $CANARY_PID)"

# 2. Reset monitors in DB: resolve open incidents, set healthy monitors to UP
echo "Resetting DB state to clean UP..."
docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -c "
UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;
UPDATE uptime_monitors SET status = 'up' WHERE tags[1] LIKE 'healthy_%';
"

# 3. Start Engine with reachable canary
echo "Starting Production Engine (HEALTH_CANARIES=198.20.0.1:8444)..."
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$BENCHMARK_DIR/mockrun/cert.pem"
export HEALTH_CANARIES="$MOCK_IP:8444"
export HTTP_WORKERS=1800
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export PPROF_ADDR="0.0.0.0:6060"

"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_rerun.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running with PID $ENGINE_PID"

# Let engine run for 70 seconds to collect 2-3 consecutive check intervals for 100 sampled hosts
echo "Running healthy checks for 70s to sample consecutive intervals..."
sleep 70

echo "=== ITEM 5: SAMPLING 100 HEALTHY MONITORS CONSECUTIVE CHECK INTERVALS ==="
cat > /tmp/calc_intervals.py << 'INTERVAL_EOF'
from collections import defaultdict

ts = defaultdict(list)
with open('/home/swapnil/uptimer_partial_50k/mockrun/check_timestamps.csv') as f:
    for line in f:
        parts = line.strip().split(',')
        if len(parts) == 2:
            ts[parts[0]].append(int(parts[1]))

intervals = []
for host, times in sorted(ts.items()):
    if len(times) >= 2:
        for i in range(len(times)-1):
            dt = (times[i+1] - times[i]) / 1e9
            intervals.append(dt)

print(f"Total sampled hosts: {len(ts)}")
print(f"Total consecutive intervals measured: {len(intervals)}")
if intervals:
    intervals.sort()
    n = len(intervals)
    avg_iv = sum(intervals) / n
    med_iv = intervals[n // 2]
    p10 = intervals[int(n * 0.10)]
    p90 = intervals[int(n * 0.90)]
    min_iv = min(intervals)
    max_iv = max(intervals)
    print(f"Mean consecutive check interval: {avg_iv:.3f}s")
    print(f"Median consecutive check interval: {med_iv:.3f}s")
    print(f"Distribution: p10={p10:.3f}s, p90={p90:.3f}s, min={min_iv:.3f}s, max={max_iv:.3f}s")
INTERVAL_EOF
python3 /tmp/calc_intervals.py > "$RESULTS_DIR/interval_sampling.txt" 2>&1 || true
cat "$RESULTS_DIR/interval_sampling.txt"

# 4. Outage (a) RERUN WITH 150 SECONDS
echo "=== ITEM 2: OUTAGE (A) RERUN (150s OUTAGE, CANARY REACHABLE) ==="
PRE_A_INCIDENTS=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
")
echo "PRE-OUTAGE open incidents (HTTP/API/KW): $PRE_A_INCIDENTS"

echo "Injecting 150-second outage (kill -STOP on Mock server)..."
kill -STOP "$MOCK_PID"
sleep 150

DURING_A_INCIDENTS=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
")
DURING_A_DOWN_MONITORS=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_monitors WHERE status = 'down' AND monitor_type IN ('http', 'api', 'keyword');
")
NEW_A_INCIDENTS=$((DURING_A_INCIDENTS - PRE_A_INCIDENTS))

echo "MEASURED: outage_a_duration=150s"
echo "MEASURED: outage_a_new_incidents_opened=$NEW_A_INCIDENTS"
echo "MEASURED: outage_a_down_monitors=$DURING_A_DOWN_MONITORS"

echo "Resuming Mock server (SIGCONT)..."
kill -CONT "$MOCK_PID"
echo "Waiting 60s for recovery..."
sleep 60

RECOVERED_A_UP=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_monitors WHERE status = 'up' AND monitor_type IN ('http', 'api', 'keyword');
")
echo "MEASURED: outage_a_monitors_recovered_to_up=$RECOVERED_A_UP / 37470"

# 5. Outage (b) RERUN WITH EXTENDED REFUSED WINDOW
echo "=== ITEM 3: OUTAGE (B) RERUN (UNREACHABLE CANARY & REFUSED PHASE) ==="
kill -TERM "$ENGINE_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
sleep 3

# Reset DB state to clean UP
docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -c "
UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;
UPDATE uptime_monitors SET status = 'up' WHERE tags[1] LIKE 'healthy_%';
"

export HEALTH_CANARIES="$MOCK_IP:9999"
"$BENCHMARK_DIR/bin/engine" >> "$RESULTS_DIR/engine_rerun.log" 2>&1 &
ENGINE_PID=$!
echo "Engine restarted with unreachable canary ($HEALTH_CANARIES), PID $ENGINE_PID"
sleep 20

PRE_B_INCIDENTS=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
")

# Test connection refused phase (75s > confirmation window)
echo "Killing mock server to trigger Connection Refused for 75 seconds..."
kill -9 "$MOCK_PID" 2>/dev/null || true
sleep 75

DURING_B_REFUSED_INCIDENTS=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
")
NEW_B_REFUSED_INCIDENTS=$((DURING_B_REFUSED_INCIDENTS - PRE_B_INCIDENTS))

echo "MEASURED: outage_b_refused_duration=75s"
echo "MEASURED: outage_b_refused_incidents_opened=$NEW_B_REFUSED_INCIDENTS"
echo "MEASURED: outage_b_expected_refused_incidents=37470"

# Restart Mock server with SAME persisted certificate!
echo "Restarting Mock server with persisted certificate..."
cd "$BENCHMARK_DIR/mockrun"
"$BENCHMARK_DIR/bin/mock" >> "$RESULTS_DIR/mock_rerun.log" 2>&1 &
MOCK_PID=$!
echo "Mock restarted with PID $MOCK_PID"
echo "Waiting 60s for HTTP/API/KW recovery..."
sleep 60

RECOVERED_B_UP=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_monitors WHERE status = 'up' AND monitor_type IN ('http', 'api', 'keyword');
")
echo "MEASURED: outage_b_http_api_kw_recovered_to_up=$RECOVERED_B_UP / 37470"

# Cleanup
kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
kill "$CANARY_PID" 2>/dev/null || true
echo "=== RERUN TESTS COMPLETE ==="
