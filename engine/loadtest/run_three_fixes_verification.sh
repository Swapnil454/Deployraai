#!/usr/bin/env bash
set -eo pipefail

export PATH="/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
RESULTS_DIR="/home/swapnil/three_fixes_verification_results"
MOCK_DIR="/home/swapnil/mockrun"
BIN_BASE="/home/swapnil/bin_bcedd96/engine"
BIN_NEW="/home/swapnil/bin_e4678c3/engine"
BIN_MOCK="/home/swapnil/bin_mock/mock"
SCHEMA_SQL="/home/swapnil/uptimer_clean/engine/loadtest/schema.sql"
CANARIES_FILE="$RESULTS_DIR/deliberately_failing_monitors.txt"
DELIBERATE_IDS="$RESULTS_DIR/deliberate_40_ids.txt"

mkdir -p "$RESULTS_DIR" "$MOCK_DIR" "/home/swapnil/bin_mock"
PROGRESS_LOG="$RESULTS_DIR/progress.log"
rm -f "$PROGRESS_LOG"

log_progress() {
    local msg="[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $1"
    echo "$msg"
    echo "$msg" >> "$PROGRESS_LOG"
}

db_query() {
    docker exec compose-pg15-1 psql -U engine -d uptimer_cv50k_prod -t -A -c "$1"
}

db_exec() {
    docker exec compose-pg15-1 psql -U engine -d uptimer_cv50k_prod -c "$1" >/dev/null 2>&1
}

reset_db_schema() {
    log_progress "Applying fresh database schema from $SCHEMA_SQL..."
    docker exec -i compose-pg15-1 psql -U engine -d uptimer_cv50k_prod < "$SCHEMA_SQL" >/dev/null 2>&1
}

seed_50k() {
    reset_db_schema
    cd /home/swapnil/uptimer_clean/engine/loadtest
    export CANARIES_FILE="$RESULTS_DIR/deliberately_failing_monitors.txt"
    go run seed_final_cohort.go
    local total=$(db_query "SELECT count(*) FROM uptime_monitors;")
    log_progress "Seeded fresh 50,000 cohort: total=$total"
}

log_progress "=== THREE ENGINE FIXES VERIFICATION SUITE STARTED ==="
log_progress "Results directory: $RESULTS_DIR"

sudo iptables -F OUTPUT 2>/dev/null || true
sudo iptables -F 2>/dev/null || true
killall -9 engine mock python3 2>/dev/null || true

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
docker start compose-pg15-1 2>/dev/null || true
sleep 3

# Setup 16 loopback IPs
python3 /home/swapnil/uptimer_clean/engine/loadtest/setup_16ips_and_hosts.py

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
# PROOF OF LIFE (2 MINUTES, 40/40 UP)
# -------------------------------------------------------------------------
if [ -f "$RESULTS_DIR/proof_of_life.txt" ] && grep -q "PASS" "$RESULTS_DIR/proof_of_life.txt"; then
    log_progress "Proof of life already passed, skipping."
else
    log_progress "=== PROOF OF LIFE (2 MINUTES) ==="
    sudo iptables -F OUTPUT 2>/dev/null || true
    sudo iptables -F 2>/dev/null || true
    killall -9 engine mock 2>/dev/null || true
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
fi

# -------------------------------------------------------------------------
# DELIBERATE FAILURES LIST & PRE-FAULT VERIFICATION
# -------------------------------------------------------------------------
if [ ! -f "$DELIBERATE_IDS" ]; then
    log_progress "=== SEEDING 50K AND EXTRACTING DELIBERATE FAILURES LIST ==="
    seed_50k
    awk -F',' 'NR>1 {print $1}' "$RESULTS_DIR/deliberately_failing_monitors.txt" > "$DELIBERATE_IDS"
    DELIBERATE_COUNT=$(wc -l < "$DELIBERATE_IDS")
    log_progress "Seeded 40 deliberate failure monitors. Extracted $DELIBERATE_COUNT IDs to $DELIBERATE_IDS"
fi

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
        local qfull=$(echo "$metrics_txt" | grep "^queue_full " | awk '{print $2}')
        local late=$(echo "$metrics_txt" | grep "^checks_late " | awk '{print $2}')
        local dropped=$(echo "$metrics_txt" | grep "^checks_dropped " | awk '{print $2}')
        
        if [ -z "$stale" ]; then stale="0"; fi
        if [ -z "$inflight" ]; then inflight="0"; fi
        if [ -z "$qfull" ]; then qfull="0"; fi
        if [ -z "$late" ]; then late="0"; fi
        if [ -z "$dropped" ]; then dropped="0"; fi
        
        echo "$now_iso,$elapsed,$stale,$inflight,$qfull,$late,$dropped" >> "$out_csv"
        sleep 5
    done
}

# -------------------------------------------------------------------------
# OUTAGE RUNNER FUNCTION (O1 to O5)
# -------------------------------------------------------------------------
run_outage_test() {
    local run_id="$1"        # O1, O2, O3, O4, O5
    local bin_path="$2"      # $BIN_BASE or $BIN_NEW
    local fault_mode="$3"    # "BLACKHOLE" or "FASTFAIL"
    local workers="$4"       # 1800 or 15000
    local label="$5"         # e.g. "O1 BASE BLACKHOLE 1800w"
    
    log_progress "=========================================================="
    log_progress "=== STARTING OUTAGE RUN $run_id: $label ==="
    log_progress "=========================================================="
    
    if [ -f "$RESULTS_DIR/guard_summary_${run_id}.txt" ]; then
        log_progress "[$run_id] Already completed successfully (found guard_summary_${run_id}.txt), skipping."
        return 0
    fi
    
    killall -9 engine mock python3 2>/dev/null || true
    sudo iptables -F OUTPUT 2>/dev/null || true
    
    # Fresh 50k seed
    seed_50k
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT=""
    "$BIN_MOCK" > "$RESULTS_DIR/mock_${run_id}.log" 2>&1 &
    MOCK_PID=$!
    sleep 2
    
    # Engine configuration: Default guard, unreachable canary
    unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
    export HTTP_WORKERS="$workers"
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
    
    log_progress "[$run_id] Engine started PID $ENGINE_PID with $workers workers. Warming up for 60s..."
    sleep 60
    
    local open_fds=$(lsof -p "$ENGINE_PID" 2>/dev/null | wc -l || echo "N/A")
    log_progress "[$run_id] 60s Warmup complete. MEASURED open_fds=$open_fds"
    
    local pre_open=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    log_progress "[$run_id] Pre-outage open incidents: $pre_open"
    if [ "$pre_open" -gt 40 ]; then
        log_progress "[$run_id] WARNING: Pre-fault open incidents ($pre_open) exceed 40!"
        db_query "SELECT i.id, i.monitor_id, m.monitor_type, m.url FROM uptime_incidents i JOIN uptime_monitors m ON i.monitor_id=m.id WHERE i.resolved_at IS NULL;" > "$RESULTS_DIR/pre_fault_extra_incidents_${run_id}.txt"
    fi
    
    # Capture guard baseline line before fault
    local pre_guard_line=$(grep "\[GUARD\]" "$RESULTS_DIR/engine_${run_id}.log" | tail -n 1 || echo "NONE")
    log_progress "[$run_id] Baseline pre-fault [GUARD] line: $pre_guard_line"
    
    # EXACT UTC FAULT TIME
    local drop_time_utc=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    local drop_time_iso=$(date -u +"%Y-%m-%d %H:%M:%S+00")
    local drop_epoch=$(date +%s)
    
    if [ "$fault_mode" = "BLACKHOLE" ]; then
        log_progress "[$run_id] Applying BLACKHOLE (iptables DROP on 198.20.0.0/28) at $drop_time_utc"
        sudo iptables -A OUTPUT -d 198.20.0.0/28 -j DROP
    else
        log_progress "[$run_id] Applying FASTFAIL (iptables REJECT --reject-with icmp-net-unreachable on 198.20.0.0/28) at $drop_time_utc"
        sudo iptables -A OUTPUT -d 198.20.0.0/28 -j REJECT --reject-with icmp-net-unreachable
    fi
    
    # Start background metrics poller for 150s outage window + 300s recovery window = 450s
    local total_window_end_epoch=$((drop_epoch + 450))
    poll_metrics "$run_id" "$total_window_end_epoch" &
    local METRICS_PID=$!
    
    # Sample incidents every 10s during 150s outage
    local sample_file="$RESULTS_DIR/visibility_samples_${run_id}.txt"
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
    
    # EXACT UTC REMOVAL TIME
    local remove_time_utc=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
    local remove_time_iso=$(date -u +"%Y-%m-%d %H:%M:%S+00")
    local remove_epoch=$(date +%s)
    log_progress "[$run_id] 150s Outage elapsed. Removing fault rule at $remove_time_utc"
    sudo iptables -F OUTPUT
    
    local outage_end_open=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    local total_outage_new=$((outage_end_open - pre_open))
    log_progress "[$run_id] Fault removed. Incidents opened during 150s outage: $total_outage_new"
    
    # SAMPLING RECOVERY AND CONTINUED INCIDENT POLLING FOR 300s POST-REMOVAL
    log_progress "[$run_id] Sampling recovery and incident opening for 300s after fault removal..."
    local rec_csv="$RESULTS_DIR/recovery_${run_id}.csv"
    echo "elapsed_sec,up_count,up_pct,open_incidents,post_removal_new_incidents" > "$rec_csv"
    
    local t50="N/A"
    local t95="N/A"
    local t100="N/A"
    
    for rt in $(seq 10 10 300); do
        sleep 10
        local total_sec=$((150 + rt))
        local cur_up=$(db_query "SELECT count(*) FROM uptime_monitors WHERE status = 'up';")
        local cur_open=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
        local post_inc=$((cur_open - outage_end_open))
        local pct=$(awk "BEGIN {printf \"%.2f\", ($cur_up / 50000) * 100}")
        
        echo "$rt,$cur_up,$pct,$cur_open,$post_inc" >> "$rec_csv"
        echo "$total_sec,$cur_open,$((cur_open - last_open)),$((cur_open - pre_open))" >> "$sample_file"
        last_open="$cur_open"
        
        log_progress "[$run_id Post-Removal t=+${rt}s (Total ${total_sec}s)] UP=$cur_up / 50000 ($pct%) | OpenIncidents=$cur_open (+${post_inc} post-removal)"
        
        # Milestones: 50% = 24980, 95% = 47462, 100% of affected = 49960
        if [ "$t50" = "N/A" ] && [ "$cur_up" -ge 24980 ]; then t50="${rt}s"; fi
        if [ "$t95" = "N/A" ] && [ "$cur_up" -ge 47462 ]; then t95="${rt}s"; fi
        if [ "$t100" = "N/A" ] && [ "$cur_up" -ge 49960 ]; then
            if [ "$t100" = "N/A" ]; then
                t100="${rt}s"
                log_progress "[$run_id] 100% Affected Monitors UP reached at +${rt}s post-removal (UP=$cur_up / 50000)."
            fi
        fi
    done
    
    wait "$METRICS_PID" 2>/dev/null || true
    
    local final_open=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")
    local post_removal_incidents=$((final_open - outage_end_open))
    log_progress "[$run_id] 300s Post-removal window complete. Final Open=$final_open, PostRemovalNew=$post_removal_incidents, t50=$t50, t95=$t95, t100=$t100"
    
    # Record metadata
    cat << EOF > "$RESULTS_DIR/outage_meta_${run_id}.txt"
run_id=$run_id
label=$label
fault_mode=$fault_mode
workers=$workers
open_fds_warmup=$open_fds
pre_open_incidents=$pre_open
drop_time_utc=$drop_time_utc
drop_time_iso=$drop_time_iso
drop_epoch=$drop_epoch
remove_time_utc=$remove_time_utc
remove_time_iso=$remove_time_iso
remove_epoch=$remove_epoch
total_outage_incidents_150s=$total_outage_new
total_post_removal_incidents_300s=$post_removal_incidents
final_open_incidents=$final_open
t50=$t50
t95=$t95
t100=$t100
pre_guard_line=$pre_guard_line
EOF
    
    # Save isolated logs
    grep "\[LAG STATS\]" "$RESULTS_DIR/engine_${run_id}.log" > "$RESULTS_DIR/lag_stats_${run_id}.log" 2>/dev/null || true
    grep "\[GUARD\]" "$RESULTS_DIR/engine_${run_id}.log" > "$RESULTS_DIR/guard_${run_id}.log" 2>/dev/null || true
    
    # Post-process with analyze_outage.py BEFORE re-seeding
    log_progress "[$run_id] Running analyze_outage.py..."
    python3 /home/swapnil/uptimer_clean/engine/loadtest/analyze_outage.py \
        "$run_id" "$RESULTS_DIR" "$drop_time_iso" "$remove_time_iso" "$drop_epoch" "$remove_epoch" "$DELIBERATE_IDS"
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
    log_progress "[$run_id] Finished successfully."
}

# -------------------------------------------------------------------------
# PHASE 2: BLACKHOLE SHELL PROOF (10s)
# -------------------------------------------------------------------------
log_progress "=== PHASE 2: BLACKHOLE SHELL PROOF (10s) ==="
if [ -f "$RESULTS_DIR/shell_proof_blackhole.txt" ]; then
    log_progress "BLACKHOLE shell proof already recorded, skipping."
else
    sudo iptables -A OUTPUT -d 198.20.0.0/28 -j DROP
    BH_START_TIME=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

    cat << EOF > "$RESULTS_DIR/shell_proof_blackhole.txt"
=== SHELL PROOF: BLACKHOLE (iptables DROP on 198.20.0.0/28) ===
Start Time: $BH_START_TIME
Command 1: curl -v --max-time 3 https://198.20.0.1:8443
EOF
    curl -v --max-time 3 https://198.20.0.1:8443 >> "$RESULTS_DIR/shell_proof_blackhole.txt" 2>&1 || true

    cat << EOF >> "$RESULTS_DIR/shell_proof_blackhole.txt"

Command 2: ping -c 3 -W 1 198.20.0.1
EOF
    ping -c 3 -W 1 198.20.0.1 >> "$RESULTS_DIR/shell_proof_blackhole.txt" 2>&1 || true

    sudo iptables -F OUTPUT
    log_progress "BLACKHOLE shell proof recorded in shell_proof_blackhole.txt"
fi

# -------------------------------------------------------------------------
# PHASE 3: RUN O1 (BASE, BLACKHOLE, 1800w)
# -------------------------------------------------------------------------
run_outage_test "O1" "$BIN_BASE" "BLACKHOLE" 1800 "BASE BLACKHOLE HTTP_WORKERS=1800"

# -------------------------------------------------------------------------
# PHASE 4: RUN O2 (NEW, BLACKHOLE, 1800w)
# -------------------------------------------------------------------------
run_outage_test "O2" "$BIN_NEW" "BLACKHOLE" 1800 "NEW BLACKHOLE HTTP_WORKERS=1800"

# -------------------------------------------------------------------------
# PHASE 5: RUN O3 (NEW, BLACKHOLE, 15000w)
# -------------------------------------------------------------------------
run_outage_test "O3" "$BIN_NEW" "BLACKHOLE" 15000 "NEW BLACKHOLE HTTP_WORKERS=15000"

# -------------------------------------------------------------------------
# PHASE 6: FASTFAIL SHELL PROOF (10s)
# -------------------------------------------------------------------------
log_progress "=== PHASE 6: FASTFAIL SHELL PROOF (10s) ==="
sudo iptables -A OUTPUT -d 198.20.0.0/28 -j REJECT --reject-with icmp-net-unreachable
FF_START_TIME=$(date -u +"%Y-%m-%d %H:%M:%S UTC")

cat << EOF > "$RESULTS_DIR/shell_proof_fastfail.txt"
=== SHELL PROOF: FASTFAIL (iptables REJECT --reject-with icmp-net-unreachable on 198.20.0.0/28) ===
Start Time: $FF_START_TIME
Command 1: curl -v --max-time 3 https://198.20.0.1:8443
EOF
curl -v --max-time 3 https://198.20.0.1:8443 >> "$RESULTS_DIR/shell_proof_fastfail.txt" 2>&1 || true

cat << EOF >> "$RESULTS_DIR/shell_proof_fastfail.txt"

Command 2: ping -c 3 -W 1 198.20.0.1
EOF
ping -c 3 -W 1 198.20.0.1 >> "$RESULTS_DIR/shell_proof_fastfail.txt" 2>&1 || true

sudo iptables -F OUTPUT
log_progress "FASTFAIL shell proof recorded in shell_proof_fastfail.txt"

# -------------------------------------------------------------------------
# PHASE 7: RUN O4 (BASE, FASTFAIL, 1800w)
# -------------------------------------------------------------------------
run_outage_test "O4" "$BIN_BASE" "FASTFAIL" 1800 "BASE FASTFAIL HTTP_WORKERS=1800"

# -------------------------------------------------------------------------
# PHASE 8: RUN O5 (NEW, FASTFAIL, 1800w)
# -------------------------------------------------------------------------
run_outage_test "O5" "$BIN_NEW" "FASTFAIL" 1800 "NEW FASTFAIL HTTP_WORKERS=1800"

# -------------------------------------------------------------------------
# PHASE 9: S2 PARTIAL-HANG SAFETY CHECK (NEW, 40% HANG, CANARY REACHABLE)
# -------------------------------------------------------------------------
log_progress "=== PHASE 9: RUN S2 PARTIAL-HANG SAFETY CHECK ==="
killall -9 engine mock python3 2>/dev/null || true
sudo iptables -F OUTPUT 2>/dev/null || true

seed_50k

cd "$MOCK_DIR"
export DISABLE_INJECTED_FAILURES="true"
export TARGETS_HANG_PERCENT="40"
"$BIN_MOCK" > "$RESULTS_DIR/mock_S2.log" 2>&1 &
MOCK_PID=$!
sleep 2

unset HEALTH_WINDOW_SECS HEALTH_UNHEALTHY_RATIO HEALTH_RECOVER_RATIO HEALTH_MIN_SAMPLES || true
export HTTP_WORKERS=6000
export HEALTH_CANARIES="198.20.0.1:8443"  # REACHABLE
export DATABASE_URL="postgres://engine:password@127.0.0.1:5499/uptimer_cv50k_prod?sslmode=disable"
export DATABASE_URL_DIRECT="$DATABASE_URL"
export DATABASE_URL_POOLED="$DATABASE_URL"
export SSL_CERT_FILE="$MOCK_DIR/cert.pem"
export GOMEMLIMIT="1600MiB"
export GOMAXPROCS="12"
export ADMIN_ADDR="127.0.0.1:9101"
export ADMIN_TOKEN="admin_secret_test"

cd /home/swapnil/uptimer_clean/engine
"$BIN_NEW" > "$RESULTS_DIR/engine_S2.log" 2>&1 &
ENGINE_PID=$!

S2_START_UTC=$(date -u +"%Y-%m-%d %H:%M:%S UTC")
log_progress "[S2] Started engine PID $ENGINE_PID. Observing for 240 seconds..."
sleep 240

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true

# In S2: 40% of HTTP/API/KW targets hang (mock-0 to mock-37499 with id % 100 < 40 = 15,000 hanging targets)
# Query incidents on hanging targets:
# Hostnames mock-<id>.mock.local where (id % 100) < 40
S2_HANGING_INCIDENTS=$(db_query "
SELECT count(*) 
FROM uptime_incidents i 
JOIN uptime_monitors m ON i.monitor_id=m.id 
WHERE i.resolved_at IS NULL 
  AND m.url ~ 'mock-([0-9]+)\.mock\.local' 
  AND (substring(m.url from 'mock-([0-9]+)\.mock\.local')::int % 100) < 40;
")

S2_TOTAL_OPEN=$(db_query "SELECT count(*) FROM uptime_incidents WHERE resolved_at IS NULL;")

# Total hanging monitors is 15,000 (plus 10 API timeout canaries)
# 40% of 12,490 HTTP (4,996) + 40% of 12,490 API (4,996) + 40% of 12,490 KW (4,996) = 14,988
S2_PCT_DETECTED=$(awk "BEGIN {printf \"%.2f\", ($S2_HANGING_INCIDENTS / 14988) * 100}")

# Check suppression events in S2
grep "\[GUARD\]" "$RESULTS_DIR/engine_S2.log" > "$RESULTS_DIR/guard_S2.log" 2>/dev/null || true
S2_SUPPRESSED_COUNT=$(grep -o "suppressed=map\[[^]]*\]" "$RESULTS_DIR/guard_S2.log" | grep -v "suppressed=map\[\]" | wc -l || echo 0)

cat << EOF > "$RESULTS_DIR/s2_summary.txt"
=== S2 PARTIAL-HANG SAFETY CHECK RESULTS ===
Start Time UTC: $S2_START_UTC
Hanging Targets: 40% of HTTP, API, Keyword (~14,988 monitors)
Canary: 198.20.0.1:8443 (REACHABLE)
Workers: 6000
Observation Time: 240 seconds
Hanging Incidents Opened: $S2_HANGING_INCIDENTS / 14988 ($S2_PCT_DETECTED%)
Total Incidents Open: $S2_TOTAL_OPEN
Suppression Events Count: $S2_SUPPRESSED_COUNT
Pass Criteria: >= 95% of hanging monitors open incidents within 240s, with 0 suppressed events.
Status: $([ "$S2_HANGING_INCIDENTS" -ge 14238 ] && [ "$S2_SUPPRESSED_COUNT" -eq 0 ] && echo "PASS" || echo "FAIL")
EOF
cat "$RESULTS_DIR/s2_summary.txt"

# -------------------------------------------------------------------------
# PHASE 10: R3a STEADY-STATE (NEW BINARY e4678c3, 10 MINUTES)
# -------------------------------------------------------------------------
run_steady_state() {
    local run_id="$1"     # "R3a" or "R3b"
    local bin_path="$2"   # $BIN_NEW or $BIN_BASE
    local label="$3"      # "NEW e4678c3" or "BASE bcedd96"
    
    log_progress "=========================================================="
    log_progress "=== STARTING STEADY-STATE RUN $run_id: $label (10 MINUTES) ==="
    log_progress "=========================================================="
    
    killall -9 engine mock python3 2>/dev/null || true
    sudo iptables -F OUTPUT 2>/dev/null || true
    
    seed_50k
    
    cd "$MOCK_DIR"
    export DISABLE_INJECTED_FAILURES="true"
    export TARGETS_HANG_PERCENT=""
    "$BIN_MOCK" > "$RESULTS_DIR/mock_${run_id}.log" 2>&1 &
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
    "$bin_path" > "$RESULTS_DIR/engine_${run_id}.log" 2>&1 &
    ENGINE_PID=$!
    
    # Identify cgroup path
    local cgroup_rel=$(cat /proc/$ENGINE_PID/cgroup 2>/dev/null | cut -d: -f3 || echo "")
    local cgroup_path="/sys/fs/cgroup${cgroup_rel}/cpu.stat"
    if [ ! -f "$cgroup_path" ]; then
        cgroup_path="/sys/fs/cgroup/cpu.stat"
    fi
    
    local cg_start_usec=$(cat "$cgroup_path" 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)
    
    # Read /proc/<pid>/stat start ticks
    # Field 14 (utime) and 15 (stime)
    local proc_stat_start=$(cat /proc/$ENGINE_PID/stat 2>/dev/null || echo "")
    local utime_start=$(echo "$proc_stat_start" | awk '{print $14}')
    local stime_start=$(echo "$proc_stat_start" | awk '{print $15}')
    if [ -z "$utime_start" ]; then utime_start=0; fi
    if [ -z "$stime_start" ]; then stime_start=0; fi
    
    local start_epoch=$(date +%s)
    log_progress "[$run_id] Started engine PID $ENGINE_PID. cgroup=$cgroup_path. Observing for 600s (10 min)..."
    
    local m2_checks=0
    local m2_stale=0
    local m2_dropped=0
    local m2_qfull=0
    local m2_cg_usec=0
    local m2_utime=0
    local m2_stime=0
    
    for m in $(seq 1 1 10); do
        sleep 60
        local metrics_txt=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics" || echo "")
        local cur_checks=$(echo "$metrics_txt" | grep "^checks_completed " | awk '{print $2}')
        local cur_stale=$(echo "$metrics_txt" | grep "^checks_stale_skipped " | awk '{print $2}')
        local cur_dropped=$(echo "$metrics_txt" | grep "^checks_dropped " | awk '{print $2}')
        local cur_qfull=$(echo "$metrics_txt" | grep "^queue_full " | awk '{print $2}')
        if [ -z "$cur_checks" ]; then cur_checks=0; fi
        if [ -z "$cur_stale" ]; then cur_stale=0; fi
        if [ -z "$cur_dropped" ]; then cur_dropped=0; fi
        if [ -z "$cur_qfull" ]; then cur_qfull=0; fi
        
        local cur_false=$(db_query "
            SELECT count(*) 
            FROM uptime_incidents i 
            JOIN uptime_monitors m ON i.monitor_id=m.id 
            WHERE i.resolved_at IS NULL 
              AND m.url NOT LIKE '%/down' 
              AND m.url NOT LIKE '%/timeout' 
              AND m.url NOT LIKE '%/keyword_fail' 
              AND m.url NOT LIKE '%198.20.99.99%';
        ")
        
        log_progress "[$run_id Minute $m/10] Checks=$cur_checks | FalseDOWN=$cur_false | Stale=$cur_stale | Dropped=$cur_dropped | QFull=$cur_qfull"
        
        # Capture minute 2 boundary (end of minute 2 = 120s)
        if [ "$m" -eq 2 ]; then
            m2_checks="$cur_checks"
            m2_stale="$cur_stale"
            m2_dropped="$cur_dropped"
            m2_qfull="$cur_qfull"
            m2_cg_usec=$(cat "$cgroup_path" 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)
            local pstat=$(cat /proc/$ENGINE_PID/stat 2>/dev/null || echo "")
            m2_utime=$(echo "$pstat" | awk '{print $14}')
            m2_stime=$(echo "$pstat" | awk '{print $15}')
            if [ -z "$m2_utime" ]; then m2_utime=0; fi
            if [ -z "$m2_stime" ]; then m2_stime=0; fi
            log_progress "[$run_id] Minute 2 boundary captured: checks=$m2_checks, cg_usec=$m2_cg_usec"
        fi
    done
    
    # End capture at minute 10 (600s)
    local end_metrics=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics" || echo "")
    local final_checks=$(echo "$end_metrics" | grep "^checks_completed " | awk '{print $2}')
    local final_stale=$(echo "$end_metrics" | grep "^checks_stale_skipped " | awk '{print $2}')
    local final_dropped=$(echo "$end_metrics" | grep "^checks_dropped " | awk '{print $2}')
    local final_qfull=$(echo "$end_metrics" | grep "^queue_full " | awk '{print $2}')
    local final_goroutines=$(echo "$end_metrics" | grep "^go_goroutines " | awk '{print $2}')
    if [ -z "$final_checks" ]; then final_checks=0; fi
    if [ -z "$final_stale" ]; then final_stale=0; fi
    if [ -z "$final_dropped" ]; then final_dropped=0; fi
    if [ -z "$final_qfull" ]; then final_qfull=0; fi
    if [ -z "$final_goroutines" ]; then final_goroutines=0; fi
    
    local cg_end_usec=$(cat "$cgroup_path" 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)
    local proc_stat_end=$(cat /proc/$ENGINE_PID/stat 2>/dev/null || echo "")
    local utime_end=$(echo "$proc_stat_end" | awk '{print $14}')
    local stime_end=$(echo "$proc_stat_end" | awk '{print $15}')
    if [ -z "$utime_end" ]; then utime_end=0; fi
    if [ -z "$stime_end" ]; then stime_end=0; fi
    
    local final_rss_kb=$(awk '/VmRSS/{print $2}' /proc/$ENGINE_PID/status 2>/dev/null || echo 0)
    local final_fds=$(lsof -p "$ENGINE_PID" 2>/dev/null | wc -l || echo 0)
    
    local total_false_downs=$(db_query "
        SELECT count(*) 
        FROM uptime_incidents i 
        JOIN uptime_monitors m ON i.monitor_id=m.id 
        WHERE i.resolved_at IS NULL 
          AND m.url NOT LIKE '%/down' 
          AND m.url NOT LIKE '%/timeout' 
          AND m.url NOT LIKE '%/keyword_fail' 
          AND m.url NOT LIKE '%198.20.99.99%';
    ")
    
    grep "\[GUARD\]" "$RESULTS_DIR/engine_${run_id}.log" > "$RESULTS_DIR/guard_${run_id}.log" 2>/dev/null || true
    local total_suppression_events=$(grep -o "suppressed=map\[[^]]*\]" "$RESULTS_DIR/guard_${run_id}.log" | grep -v "suppressed=map\[\]" | wc -l || echo 0)
    
    grep "\[LAG STATS\]" "$RESULTS_DIR/engine_${run_id}.log" > "$RESULTS_DIR/lag_stats_${run_id}.log" 2>/dev/null || true
    
    kill -TERM "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID" 2>/dev/null || true
    wait "$ENGINE_PID" 2>/dev/null || true
    
    # Calculate CPU metrics via python
    python3 -c "
checks_tot = $final_checks
checks_m2_10 = $final_checks - $m2_checks

# Proc ticks (1 tick = 10,000 usec on Linux 100Hz)
ticks_tot = ($utime_end + $stime_end) - ($utime_start + $stime_start)
usec_proc_tot = ticks_tot * 10000

ticks_m2_10 = ($utime_end + $stime_end) - ($m2_utime + $m2_stime)
usec_proc_m2_10 = ticks_m2_10 * 10000

# Cgroup usec
cg_tot = $cg_end_usec - $cg_start_usec
cg_m2_10 = $cg_end_usec - $m2_cg_usec

rate_tot = checks_tot / 600.0
rate_m2_10 = checks_m2_10 / 480.0

cpu_proc_per_check_tot = (usec_proc_tot / checks_tot) if checks_tot > 0 else 0
cpu_proc_per_check_m2_10 = (usec_proc_m2_10 / checks_m2_10) if checks_m2_10 > 0 else 0

cpu_cg_per_check_tot = (cg_tot / checks_tot) if checks_tot > 0 else 0
cpu_cg_per_check_m2_10 = (cg_m2_10 / checks_m2_10) if checks_m2_10 > 0 else 0

with open('$RESULTS_DIR/${run_id}_summary.txt', 'w') as f:
    f.write('=== STEADY-STATE RUN SUMMARY: $run_id ($label) ===\n')
    f.write(f'Cgroup path: $cgroup_path\n')
    f.write(f'End RSS: {$final_rss_kb / 1024.0:.2f} MB\n')
    f.write(f'End Goroutines: $final_goroutines\n')
    f.write(f'End Open FDs: $final_fds\n\n')
    
    f.write('--- WHOLE RUN (0 - 10 MIN / 600s) ---\n')
    f.write(f'Checks completed: {checks_tot}\n')
    f.write(f'Throughput: {rate_tot:.2f} checks/s (nominal 1,666.7, {rate_tot / 1666.67 * 100:.2f}%)\n')
    f.write(f'False DOWNs: $total_false_downs\n')
    f.write(f'Suppression events: $total_suppression_events\n')
    f.write(f'checks_stale_skipped: $final_stale\n')
    f.write(f'checks_dropped: $final_dropped\n')
    f.write(f'queue_full: $final_qfull\n')
    f.write(f'Proc CPU usec (utime+stime): {usec_proc_tot}\n')
    f.write(f'Proc CPU usec per check: {cpu_proc_per_check_tot:.2f} us\n')
    f.write(f'Cgroup CPU usec delta: {cg_tot}\n')
    f.write(f'Cgroup CPU usec per check: {cpu_cg_per_check_tot:.2f} us\n\n')
    
    f.write('--- MINUTES 2 - 10 ONLY (120s - 600s / 480s) ---\n')
    f.write(f'Checks completed: {checks_m2_10}\n')
    f.write(f'Throughput: {rate_m2_10:.2f} checks/s (nominal 1,666.7, {rate_m2_10 / 1666.67 * 100:.2f}%)\n')
    f.write(f'False DOWNs: $total_false_downs\n')
    f.write(f'Suppression events: $total_suppression_events\n')
    f.write(f'checks_stale_skipped: {$final_stale - $m2_stale}\n')
    f.write(f'checks_dropped: {$final_dropped - $m2_dropped}\n')
    f.write(f'queue_full: {$final_qfull - $m2_qfull}\n')
    f.write(f'Proc CPU usec (utime+stime): {usec_proc_m2_10}\n')
    f.write(f'Proc CPU usec per check: {cpu_proc_per_check_m2_10:.2f} us\n')
    f.write(f'Cgroup CPU usec delta: {cg_m2_10}\n')
    f.write(f'Cgroup CPU usec per check: {cpu_cg_per_check_m2_10:.2f} us\n')
"
    cat "$RESULTS_DIR/${run_id}_summary.txt"
}

# Run R3a: NEW e4678c3
run_steady_state "R3a" "$BIN_NEW" "NEW e4678c3"

# Run R3b: BASE bcedd96
run_steady_state "R3b" "$BIN_BASE" "BASE bcedd96"

# -------------------------------------------------------------------------
# PHASE 11: ENVIRONMENT END & MANIFEST
# -------------------------------------------------------------------------
log_progress "=== PHASE 11: ENVIRONMENT END & MANIFEST ==="
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
cat "$RESULTS_DIR/env_end.txt"

# Copy race test json to results
cp /home/swapnil/test_race_e4678c3.json "$RESULTS_DIR/" 2>/dev/null || true

# Compute SHA-256 manifest
cd "$RESULTS_DIR"
sha256sum * > "$RESULTS_DIR/manifest_sha256.txt" 2>/dev/null || true
log_progress "Manifest generated: $(wc -l < "$RESULTS_DIR/manifest_sha256.txt") files."

log_progress "=== THREE FIXES VERIFICATION SUITE COMPLETE ==="
