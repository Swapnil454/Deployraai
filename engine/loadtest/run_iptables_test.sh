#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:/usr/bin:/bin:$PATH"

BENCHMARK_DIR="/home/swapnil/uptimer_partial_50k"
RESULTS_DIR="$BENCHMARK_DIR/results"
MOCK_IP="198.20.0.1"
COMPOSE="$BENCHMARK_DIR/compose/docker-compose.yml"

killall -9 engine mock 2>/dev/null || true
# Ensure no leftover iptables rules
sudo iptables -D OUTPUT -d "$MOCK_IP" -p tcp --dport 8443 -j DROP 2>/dev/null || true

# Engine env
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$BENCHMARK_DIR/mockrun/cert.pem"
export HTTP_WORKERS=1800
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export PPROF_ADDR="0.0.0.0:6060"

# Reset DB
docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -c "
UPDATE uptime_incidents SET resolved_at = NOW() WHERE resolved_at IS NULL;
UPDATE uptime_monitors SET status = 'up', is_paused = false;
"

# Start mock
cd "$BENCHMARK_DIR/mockrun"
rm -f incidents.jsonl*
export DISABLE_INJECTED_FAILURES="true"
"$BENCHMARK_DIR/bin/mock" > "$RESULTS_DIR/mock_iptables.log" 2>&1 &
MOCK_PID=$!
sleep 2

# Start engine with unreachable canary
cd "$BENCHMARK_DIR"
rm -f incidents.jsonl*
export HEALTH_CANARIES="$MOCK_IP:9999"
"$BENCHMARK_DIR/bin/engine" > "$RESULTS_DIR/engine_iptables.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running PID $ENGINE_PID with unreachable canary ($HEALTH_CANARIES)"
sleep 20
kill -0 "$ENGINE_PID" || { echo "Engine failed!"; exit 1; }

PRE_INCIDENTS=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
")
echo "Pre-outage incidents (HTTP/API/KW): $PRE_INCIDENTS"

echo "Applying real network-level fault: iptables DROP to $MOCK_IP:8443 for 150 seconds..."
sudo iptables -A OUTPUT -d "$MOCK_IP" -p tcp --dport 8443 -j DROP

T_START=$(date +%s)
for i in $(seq 10 10 150); do
    sleep 10
    CUR_INCIDENTS=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
    SELECT count(*) FROM uptime_incidents i
    JOIN uptime_monitors m ON i.monitor_id = m.id
    WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
    ")
    DOWN_MON=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
    SELECT count(*) FROM uptime_monitors WHERE status = 'down' AND monitor_type IN ('http', 'api', 'keyword');
    ")
    echo "t=${i}s: Open Incidents=$CUR_INCIDENTS (+$((CUR_INCIDENTS - PRE_INCIDENTS))), Down Monitors=$DOWN_MON"
done

echo "Removing iptables DROP rule..."
sudo iptables -D OUTPUT -d "$MOCK_IP" -p tcp --dport 8443 -j DROP

POST_INCIDENTS=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_incidents i
JOIN uptime_monitors m ON i.monitor_id = m.id
WHERE i.resolved_at IS NULL AND m.monitor_type IN ('http', 'api', 'keyword');
")
FINAL_DOWN=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_monitors WHERE status = 'down' AND monitor_type IN ('http', 'api', 'keyword');
")
NEW_INCIDENTS=$((POST_INCIDENTS - PRE_INCIDENTS))

echo "=== IPTABLES TEST RESULTS ==="
echo "MEASURED: iptables_outage_duration=150s"
echo "MEASURED: iptables_new_incidents_opened=$NEW_INCIDENTS"
echo "MEASURED: iptables_down_monitors=$FINAL_DOWN"

# Wait 60s to check recovery
echo "Waiting 60s for recovery after iptables rule removed..."
sleep 60
REC_UP=$(docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod -tAc "
SELECT count(*) FROM uptime_monitors WHERE status = 'up' AND monitor_type IN ('http', 'api', 'keyword');
")
echo "MEASURED: iptables_recovered_up=$REC_UP / 37470"

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
echo "=== IPTABLES TEST FINISHED ==="
