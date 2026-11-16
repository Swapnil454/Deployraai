#!/usr/bin/env bash
set -eo pipefail

export PATH="/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
RESULTS_DIR="/home/swapnil/stale_skip_verification_results"
MOCK_DIR="/home/swapnil/mockrun"
BIN_NEW="/home/swapnil/bin_bcedd96/engine"
BIN_MOCK="/home/swapnil/bin_mock/mock"
COMPOSE="/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml"
SCHEMA_SQL="/home/swapnil/uptimer_clean/engine/loadtest/schema.sql"

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

reset_db_schema() {
    log_progress "Applying fresh database schema from $SCHEMA_SQL..."
    docker compose -f "$COMPOSE" exec -T pg15 psql -U engine -d uptimer_cv50k_prod < "$SCHEMA_SQL" >/dev/null 2>&1
}

seed_50k() {
    reset_db_schema
    cd /home/swapnil/uptimer_clean/engine/loadtest
    go run seed_final_cohort.go
    local total=$(db_query "SELECT count(*) FROM uptime_monitors;")
    log_progress "Seeded fresh 50,000 cohort: total=$total"
}

log_progress "=== PHASE: R3 STEADY-STATE REGRESSION CHECK (10 MINUTES, bcedd96) ==="

killall -9 engine mock python3 2>/dev/null || true
sudo iptables -D OUTPUT -d 198.20.0.0/28 -j DROP 2>/dev/null || true

# Seed fresh 50k cohort
seed_50k

cd "$MOCK_DIR"
export DISABLE_INJECTED_FAILURES="true"
export TARGETS_HANG_PERCENT=""
"$BIN_MOCK" > "$RESULTS_DIR/mock_R3.log" 2>&1 &
MOCK_PID=$!
sleep 2

unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
export HTTP_WORKERS=1800
export HEALTH_CANARIES="198.20.0.1:8443"
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export ADMIN_ADDR="127.0.0.1:9101"

cd /home/swapnil/uptimer_clean/engine
"$BIN_NEW" > "$RESULTS_DIR/engine_R3.log" 2>&1 &
ENGINE_PID=$!

CGROUP_START_USEC=$(cat /sys/fs/cgroup/cpu.stat 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)
R3_START_EPOCH=$(date +%s)
log_progress "[R3] Engine started PID $ENGINE_PID. Observing steady state for 600 seconds (10 minutes)..."

# Sample every minute
for m in $(seq 1 1 10); do
    sleep 60
    cur_checks=$(curl -s "http://127.0.0.1:9101/metrics" | grep "^checks_completed " | awk '{print $2}' || echo 0)
    cur_stale=$(curl -s "http://127.0.0.1:9101/metrics" | grep "^checks_stale_skipped " | awk '{print $2}' || echo 0)
    cur_dropped=$(curl -s "http://127.0.0.1:9101/metrics" | grep "^checks_dropped " | awk '{print $2}' || echo 0)
    false_inc=$(db_query "SELECT count(*) FROM uptime_incidents i JOIN uptime_monitors m ON i.monitor_id=m.id WHERE i.resolved_at IS NULL AND m.url NOT LIKE '%/down' AND m.url NOT LIKE '%/timeout' AND m.url NOT LIKE '%/keyword_fail' AND m.url NOT LIKE '%198.20.99.99%';")
    log_progress "[R3 Minute $m/10] Checks: $cur_checks | False DOWNs: $false_inc | Stale Skipped: $cur_stale | Dropped: $cur_dropped"
done

CGROUP_END_USEC=$(cat /sys/fs/cgroup/cpu.stat 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)
R3_END_EPOCH=$(date +%s)
R3_WALL_SEC=$((R3_END_EPOCH - R3_START_EPOCH))
CGROUP_DELTA_USEC=$((CGROUP_END_USEC - CGROUP_START_USEC))
CPU_CORES=$(awk "BEGIN {printf \"%.2f\", $CGROUP_DELTA_USEC / ($R3_WALL_SEC * 1000000)}")

# Final metrics snapshot
METRICS_R3=$(curl -s "http://127.0.0.1:9101/metrics")
echo "$METRICS_R3" > "$RESULTS_DIR/metrics_final_R3.txt"

TOTAL_CHECKS=$(echo "$METRICS_R3" | grep "^checks_completed " | awk '{print $2}')
CHECKS_PER_SEC=$(awk "BEGIN {printf \"%.2f\", $TOTAL_CHECKS / $R3_WALL_SEC}")
CHECKS_STALE_R3=$(echo "$METRICS_R3" | grep "^checks_stale_skipped " | awk '{print $2}')
CHECKS_DROPPED_R3=$(echo "$METRICS_R3" | grep "^checks_dropped " | awk '{print $2}')
QUEUE_FULL_R3=$(echo "$METRICS_R3" | grep "^checks_dropped " | awk '{print $2}')
FALSE_DOWNS=$(db_query "SELECT count(*) FROM uptime_incidents i JOIN uptime_monitors m ON i.monitor_id=m.id WHERE i.resolved_at IS NULL AND m.url NOT LIKE '%/down' AND m.url NOT LIKE '%/timeout' AND m.url NOT LIKE '%/keyword_fail' AND m.url NOT LIKE '%198.20.99.99%';")
SUPPRESSION_EVENTS=$(grep -c "suppressed=map\[" "$RESULTS_DIR/engine_R3.log" | grep -v "suppressed=map\[\]" || echo 0)

grep "\[LAG STATS\]" "$RESULTS_DIR/engine_R3.log" > "$RESULTS_DIR/lag_stats_R3.log" 2>/dev/null || true
grep "\[GUARD\]" "$RESULTS_DIR/engine_R3.log" > "$RESULTS_DIR/guard_R3.log" 2>/dev/null || true

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true

cat << EOF > "$RESULTS_DIR/r3_summary.txt"
=== R3 STEADY-STATE REGRESSION SUMMARY ===
duration_sec=$R3_WALL_SEC
total_checks=$TOTAL_CHECKS
checks_per_sec=$CHECKS_PER_SEC
nominal_checks_per_sec=1666.7
pct_nominal=$(awk "BEGIN {printf \"%.2f\", ($CHECKS_PER_SEC / 1666.67) * 100}")
false_downs=$FALSE_DOWNS
suppression_events=$SUPPRESSION_EVENTS
checks_stale_skipped=$CHECKS_STALE_R3
checks_dropped=$CHECKS_DROPPED_R3
queue_full=$QUEUE_FULL_R3
cgroup_delta_usec=$CGROUP_DELTA_USEC
cpu_cores_used=$CPU_CORES
EOF
cat "$RESULTS_DIR/r3_summary.txt"

# -------------------------------------------------------------------------
# END ENVIRONMENT & MANIFEST
# -------------------------------------------------------------------------
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
EOF

cd "$RESULTS_DIR"
sha256sum * > manifest_sha256.txt 2>/dev/null || true

log_progress "=== ALL RUNS COMPLETED SUCCESSFULLY ==="
