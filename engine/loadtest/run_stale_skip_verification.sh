#!/usr/bin/env bash
set -eo pipefail

export PATH="/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
RESULTS_DIR="/home/swapnil/stale_skip_verification_results"
MOCK_DIR="/home/swapnil/mockrun"
BIN_BASELINE="/home/swapnil/bin_d330a8e/engine"
BIN_NEW="/home/swapnil/bin_bcedd96/engine"
BIN_MOCK="/home/swapnil/bin_mock/mock"
COMPOSE="/home/swapnil/uptimer_partial_50k/compose/docker-compose.yml"
SCHEMA_SQL="/home/swapnil/uptimer_clean/engine/loadtest/schema.sql"

mkdir -p "$RESULTS_DIR" "$MOCK_DIR" "/home/swapnil/bin_mock"
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

log_progress "=== STALE SKIP VERIFICATION SUITE STARTED ==="
log_progress "Results directory: $RESULTS_DIR"

# -------------------------------------------------------------------------
# PHASE 1: ENVIRONMENT START
# -------------------------------------------------------------------------
log_progress "=== PHASE 1: ENVIRONMENT START ==="
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
cat "$RESULTS_DIR/env_start.txt"

# Ensure postgres is running
docker compose -f "$COMPOSE" up -d pg15
sleep 3

# Setup 16 loopback IPs
python3 "/mnt/c/mini Desktop/AI_Agents/engine/loadtest/setup_16ips_and_hosts.py"

# Build mock binary
cd /home/swapnil/uptimer_clean/engine/loadtest/mock
go build -o "$BIN_MOCK" main.go

# Generate mock TLS cert covering 16 IPs
cd "$MOCK_DIR"
rm -f cert.pem key.pem
export DISABLE_INJECTED_FAILURES="true"
"$BIN_MOCK" > /dev/null 2>&1 &
MOCK_PID=$!
sleep 3
kill -TERM "$MOCK_PID" 2>/dev/null || true
wait "$MOCK_PID" 2>/dev/null || true
log_progress "Mock TLS certificate ready."

# -------------------------------------------------------------------------
# PROOF OF LIFE (2 MINUTES)
# -------------------------------------------------------------------------
log_progress "=== PROOF OF LIFE (2 MINUTES) ==="
reset_db_schema
cd /home/swapnil/uptimer_clean/engine/loadtest
go run seed_final_cohort.go -proof

cd "$MOCK_DIR"
export DISABLE_INJECTED_FAILURES="true"
export TARGETS_HANG_PERCENT=""
"$BIN_MOCK" > "$RESULTS_DIR/mock_proof_life.log" 2>&1 &
MOCK_PID=$!
sleep 2

cd /home/swapnil/uptimer_clean/engine
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
export HTTP_WORKERS=500
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export HEALTH_CANARIES="198.20.0.1:8443"
export ADMIN_ADDR="127.0.0.1:9101"
export ADMIN_TOKEN="admin_secret_test"

"$BIN_NEW" > "$RESULTS_DIR/engine_proof_life.log" 2>&1 &
ENGINE_PID=$!

log_progress "Proof of life running for 120 seconds..."
sleep 120

UP_HTTP=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='http' AND status='up';")
UP_API=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='api' AND status='up';")
UP_KW=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='keyword' AND status='up';")
UP_PING=$(db_query "SELECT count(*) FROM uptime_monitors WHERE monitor_type='ping' AND status='up';")

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true

cat << EOF > "$RESULTS_DIR/proof_of_life.txt"
=== PROOF OF LIFE RESULTS ===
HTTP UP:    $UP_HTTP / 10
API UP:     $UP_API / 10
KW UP:      $UP_KW / 10
Ping UP:    $UP_PING / 10
Total UP:   $((UP_HTTP + UP_API + UP_KW + UP_PING)) / 40
Status:     $([ "$((UP_HTTP + UP_API + UP_KW + UP_PING))" -eq 40 ] && echo "PASS" || echo "FAIL")
EOF
cat "$RESULTS_DIR/proof_of_life.txt"
[ "$((UP_HTTP + UP_API + UP_KW + UP_PING))" -eq 40 ] || { log_progress "FATAL: Proof of life failed"; exit 1; }

# Helper for polling metrics endpoint every 5 seconds
poll_metrics() {
    local run_name="$1"
    local end_time="$2"
    local out_csv="$RESULTS_DIR/metrics_5s_${run_name}.csv"
    echo "timestamp_utc,elapsed_s,checks_stale_skipped,checks_in_flight,queue_full,checks_late,checks_dropped" > "$out_csv"
    
    local start_epoch=$(date +%s)
    while [ $(date +%s) -lt "$end_time" ]; do
        local now_iso=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
        local now_epoch=$(date +%s)
        local elapsed=$((now_epoch - start_epoch))
        local metrics_txt=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics" || echo "")
        
        local stale=$(echo "$metrics_txt" | grep "^checks_stale_skipped " | awk '{print $2}')
        local inflight=$(echo "$metrics_txt" | grep "^checks_in_flight " | awk '{print $2}')
        local qfull=$(echo "$metrics_txt" | grep "^checks_dropped " | awk '{print $2}')
        local late=$(echo "$metrics_txt" | grep "^checks_late " | awk '{print $2}')
        local dropped=$(echo "$metrics_txt" | grep "^checks_dropped " | awk '{print $2}')
        
        if [ -z "$stale" ]; then stale="N/A"; fi
        if [ -z "$inflight" ]; then inflight="N/A"; fi
        if [ -z "$qfull" ]; then qfull="N/A"; fi
        if [ -z "$late" ]; then late="N/A"; fi
        if [ -z "$dropped" ]; then dropped="N/A"; fi
        
        echo "$now_iso,$elapsed,$stale,$inflight,$qfull,$late,$dropped" >> "$out_csv"
        sleep 5
    done
}

# -------------------------------------------------------------------------
# OUTAGE RUNNER FUNCTION (R1 and R2)
# -------------------------------------------------------------------------
run_controlled_outage() {
    local run_id="$1"       # "R1" or "R2"
    local bin_path="$2"     # $BIN_BASELINE or $BIN_NEW
    local run_label="$3"    # "BASELINE d330a8e" or "NEW bcedd96"
    
    log_progress "=== STARTING OUTAGE RUN $run_id: $run_label ==="
    
    killall -9 engine mock python3 2>/dev/null || true
    sudo iptables -D OUTPUT -d 198.20.0.0/28 -j DROP 2>/dev/null || true
    
    # Fresh 50k seed
    seed_50k
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT=""
    "$BIN_MOCK" > "$RESULTS_DIR/mock_${run_id}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    # Engine configuration: Default guard, 1800 workers, unreachable canary
    unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
    export HTTP_WORKERS=1800
    export HEALTH_CANARIES="198.20.0.1:9999"
    export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
    export DATABASE_URL_DIRECT="$DATABASE_URL"
    export DATABASE_URL_POOLED="$DATABASE_URL"
    export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
    export GOMEMLIMIT="1600MiB"
    export GOMAXPROCS="12"
    export ADMIN_ADDR="127.0.0.1:9101"
    export ADMIN_TOKEN="admin_secret_test"
    
    cd /home/swapnil/uptimer_clean/engine
    "$bin_path" > "$RESULTS_DIR/engine_${run_id}.log" 2>&1 &
    ENGINE_PID=$!
    
    log_progress "[$run_id] Engine started PID $ENGINE_PID. Warming up for 60s..."
    sleep 60
    
    local open_fds=$(lsof -p "$ENGINE_PID" 2>/dev/null | wc -l || echo "N/A")
    log_progress "[$run_id] 60s Warmup complete. MEASURED open_fds=$open_fds"
    
    local pre_open=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    log_progress "[$run_id] Pre-outage open incidents: $pre_open"
    
    # EXACT UTC DROP TIME
    local drop_time_utc=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    local drop_time_iso=$(date -u +"%Y-%m-%d %H:%M:%S+00")
    local drop_epoch=$(date +%s)
    log_progress "[$run_id] Applying iptables DROP on 198.20.0.0/28 at $drop_time_utc"
    sudo iptables -A OUTPUT -d 198.20.0.0/28 -j DROP
    
    # Start background metrics poller for 150s outage window
    local outage_end_epoch=$((drop_epoch + 150))
    poll_metrics "$run_id" "$outage_end_epoch" &
    local METRICS_PID=$!
    
    local sample_file="$RESULTS_DIR/outage_samples_${run_id}.txt"
    echo "elapsed_sec,open_incidents,bucket_new,total_new" > "$sample_file"
    
    local last_open="$pre_open"
    for t in $(seq 10 10 150); do
        sleep 10
        local cur_open=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
        local b_new=$((cur_open - last_open))
        local t_new=$((cur_open - pre_open))
        last_open="$cur_open"
        echo "$t,$cur_open,$b_new,$t_new" >> "$sample_file"
        log_progress "[$run_id Outage t=${t}s] Open=$cur_open (Bucket: +$b_new, Total: +$t_new)"
    done
    
    wait "$METRICS_PID" 2>/dev/null || true
    
    # EXACT UTC DROP REMOVAL TIME
    local remove_time_utc=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    log_progress "[$run_id] 150s Outage elapsed. Removing iptables DROP at $remove_time_utc"
    sudo iptables -D OUTPUT -d 198.20.0.0/28 -j DROP
    
    local post_open=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    local total_new_inc=$((post_open - pre_open))
    log_progress "[$run_id] Total incidents opened during outage: $total_new_inc / 50000"
    
    # Record metadata
    cat << EOF > "$RESULTS_DIR/outage_meta_${run_id}.txt"
run_id=$run_id
binary=$run_label
open_fds_warmup=$open_fds
drop_time_utc=$drop_time_utc
drop_time_iso=$drop_time_iso
remove_time_utc=$remove_time_utc
pre_open_incidents=$pre_open
total_outage_incidents=$total_new_inc
EOF

    # RECOVERY SAMPLING (every 10s until 100% UP or 300s)
    log_progress "[$run_id] Sampling recovery every 10s until 100% UP (50,000)..."
    local rec_csv="$RESULTS_DIR/recovery_${run_id}.csv"
    echo "elapsed_sec,up_count,up_pct" > "$rec_csv"
    
    local t50="N/A"
    local t95="N/A"
    local t100="N/A"
    
    for rt in $(seq 10 10 300); do
        sleep 10
        local cur_up=$(db_query "SELECT count(*) FROM uptime_monitors WHERE status = 'up';")
        local pct=$(awk "BEGIN {printf \"%.2f\", ($cur_up / 50000) * 100}")
        echo "$rt,$cur_up,$pct" >> "$rec_csv"
        log_progress "[$run_id Recovery t=${rt}s] UP=$cur_up / 50000 ($pct%)"
        
        if [ "$t50" = "N/A" ] && [ "$cur_up" -ge 25000 ]; then t50="${rt}s"; fi
        if [ "$t95" = "N/A" ] && [ "$cur_up" -ge 47500 ]; then t95="${rt}s"; fi
        if [ "$t100" = "N/A" ] && [ "$cur_up" -ge 49960 ]; then
            t100="${rt}s"
            log_progress "[$run_id] 100% Healthy UP recovery reached at $t100 (UP=$cur_up / 50000)."
            break
        fi
    done
    
    echo "t50=$t50" >> "$RESULTS_DIR/outage_meta_${run_id}.txt"
    echo "t95=$t95" >> "$RESULTS_DIR/outage_meta_${run_id}.txt"
    echo "t100=$t100" >> "$RESULTS_DIR/outage_meta_${run_id}.txt"
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
    
    # Save isolated logs
    grep "\[LAG STATS\]" "$RESULTS_DIR/engine_${run_id}.log" > "$RESULTS_DIR/lag_stats_${run_id}.log" 2>/dev/null || true
    grep "\[GUARD\]" "$RESULTS_DIR/engine_${run_id}.log" > "$RESULTS_DIR/guard_${run_id}.log" 2>/dev/null || true
    
    # Post-process DB incident buckets, polling visibility, timeout line counts, and guard deltas
    python3 -c "
import subprocess, re
from datetime import datetime

drop_iso = '$drop_time_iso'

# 1. DB incident started_at buckets
sql = '''
SELECT 
  floor(EXTRACT(EPOCH FROM (started_at - ''' + f\"'{drop_iso}'::timestamptz\" + ''')) / 10) * 10 as bucket_start,
  count(*),
  min(started_at),
  max(started_at)
FROM uptime_incidents
WHERE started_at >= ''' + f\"'{drop_iso}'::timestamptz AND started_at <= ('{drop_iso}'::timestamptz + interval '160 second')\" + '''
GROUP BY 1 ORDER BY 1;
'''
cmd = ['docker', 'compose', '-f', '$COMPOSE', 'exec', '-T', 'pg15', 'psql', '-U', 'engine', '-d', 'uptimer_cv50k_prod', '-t', '-A', '-F', '\t', '-c', sql]
res = subprocess.check_output(cmd).decode('utf-8')
with open('$RESULTS_DIR/db_incident_buckets_${run_id}.tsv', 'w') as f:
    f.write('bucket_start_s\tcount\tmin_started_at\tmax_started_at\n')
    f.write(res)

# 2. Count 'timeout' log lines per 10s bucket
drop_dt = datetime.fromisoformat(drop_iso.replace('+00', '+00:00'))
# Convert UTC to local IST for log timestamp matching
# Logs format: 2026/11/02 16:59:54 ...
timeout_counts = {t: 0 for t in range(0, 160, 10)}
with open('$RESULTS_DIR/engine_${run_id}.log', 'r', errors='ignore') as f:
    for line in f:
        if 'timeout' in line.lower() or 'deadline' in line.lower():
            m = re.match(r'^(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})', line)
            if m:
                try:
                    # engine logs in local time (UTC+5:30)
                    log_dt = datetime.strptime(m.group(1), '%Y/%m/%d %H:%M:%S')
                    # Convert drop_dt to naive local time for delta
                    diff = (log_dt - drop_dt.replace(tzinfo=None)).total_seconds() - (5.5 * 3600)
                    if 0 <= diff <= 160:
                        bucket = int(diff // 10) * 10
                        if bucket in timeout_counts:
                            timeout_counts[bucket] += 1
                except Exception:
                    pass

with open('$RESULTS_DIR/timeout_lines_per_10s_${run_id}.csv', 'w') as f:
    f.write('bucket_start_s,timeout_log_lines\n')
    for b in sorted(timeout_counts.keys()):
        f.write(f'{b},{timeout_counts[b]}\n')

# 3. Guard deltas
guard_lines = []
with open('$RESULTS_DIR/guard_${run_id}.log', 'r', errors='ignore') as f:
    for line in f:
        line = line.strip()
        if not line: continue
        # Parse timestamp and passed_failures
        # e.g. 2026/11/02 17:00:05 [GUARD] suppressed=map[] passed_failures=map[KEYWORD:1 NETWORK:1267 STATUS:9 TIMEOUT:10]
        ts_m = re.match(r'^(\d{4}/\d{2}/\d{2} \d{2}:\d{2}:\d{2})', line)
        pf_m = re.search(r'passed_failures=map\[(.*?)\]', line)
        sup_m = re.search(r'suppressed=map\[(.*?)\]', line)
        if ts_m:
            ts = ts_m.group(1)
            pf_str = pf_m.group(1) if pf_m else ''
            sup_str = sup_m.group(1) if sup_m else ''
            # Parse pairs
            pf = {}
            for pair in pf_str.split():
                if ':' in pair:
                    k, v = pair.split(':', 1)
                    pf[k] = int(v)
            guard_lines.append((ts, pf, sup_str))

with open('$RESULTS_DIR/guard_deltas_${run_id}.csv', 'w') as f:
    f.write('timestamp,passed_timeout,delta_timeout,passed_network,delta_network,suppressed\n')
    last_to = 0
    last_net = 0
    for ts, pf, sup in guard_lines:
        cur_to = pf.get('TIMEOUT', 0)
        cur_net = pf.get('NETWORK', 0)
        d_to = cur_to - last_to
        d_net = cur_net - last_net
        last_to = cur_to
        last_net = cur_net
        f.write(f'{ts},{cur_to},{d_to},{cur_net},{d_net},\"{sup}\"\n')
"
}

# EXECUTE R1: BASELINE d330a8e
run_controlled_outage "R1" "$BIN_BASELINE" "BASELINE d330a8e"

# EXECUTE R2: NEW bcedd96
run_controlled_outage "R2" "$BIN_NEW" "NEW bcedd96"

# -------------------------------------------------------------------------
# R3: STEADY-STATE REGRESSION CHECK (10 MINUTES, NEW BINARY bcedd96)
# -------------------------------------------------------------------------
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
export ADMIN_TOKEN="admin_secret_test"

cd /home/swapnil/uptimer_clean/engine
"$BIN_NEW" > "$RESULTS_DIR/engine_R3.log" 2>&1 &
ENGINE_PID=$!

CGROUP_START_USEC=$(cat /sys/fs/cgroup/cpu.stat 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)
R3_START_EPOCH=$(date +%s)
log_progress "[R3] Engine started PID $ENGINE_PID. Observing steady state for 600 seconds (10 minutes)..."

# Sample every minute
for m in $(seq 1 1 10); do
    sleep 60
    cur_checks=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics" | grep "^checks_completed " | awk '{print $2}' || echo 0)
    cur_stale=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics" | grep "^checks_stale_skipped " | awk '{print $2}' || echo 0)
    cur_dropped=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics" | grep "^checks_dropped " | awk '{print $2}' || echo 0)
    false_inc=$(db_query "SELECT count(*) FROM uptime_incidents i JOIN uptime_monitors m ON i.monitor_id=m.id WHERE i.resolved_at IS NULL AND m.url NOT LIKE '%/down' AND m.url NOT LIKE '%/timeout' AND m.url NOT LIKE '%/keyword_fail' AND m.url NOT LIKE '%198.20.99.99%';")
    log_progress "[R3 Minute $m/10] Checks: $cur_checks | False DOWNs: $false_inc | Stale Skipped: $cur_stale | Dropped: $cur_dropped"
done

CGROUP_END_USEC=$(cat /sys/fs/cgroup/cpu.stat 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)
R3_END_EPOCH=$(date +%s)
R3_WALL_SEC=$((R3_END_EPOCH - R3_START_EPOCH))
CGROUP_DELTA_USEC=$((CGROUP_END_USEC - CGROUP_START_USEC))
CPU_CORES=$(awk "BEGIN {printf \"%.2f\", $CGROUP_DELTA_USEC / ($R3_WALL_SEC * 1000000)}")

# Final metrics snapshot
METRICS_R3=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics")
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
