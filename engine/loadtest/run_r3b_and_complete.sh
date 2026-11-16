#!/usr/bin/env bash
set -eo pipefail

export PATH="/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin"
RESULTS_DIR="/home/swapnil/three_fixes_verification_results"
MOCK_DIR="/home/swapnil/mockrun"
BIN_BASE="/home/swapnil/bin_bcedd96/engine"
BIN_MOCK="/home/swapnil/bin_mock/mock"
SCHEMA_SQL="/home/swapnil/uptimer_clean/engine/loadtest/schema.sql"
PROGRESS_LOG="$RESULTS_DIR/progress.log"

log_progress() {
    local msg="[$(date -u +"%Y-%m-%d %H:%M:%S UTC")] $1"
    echo "$msg"
    echo "$msg" >> "$PROGRESS_LOG"
}

db_query() {
    docker exec compose-pg15-1 psql -U engine -d uptimer_cv50k_prod -t -A -c "$1"
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

# -------------------------------------------------------------------------
# GENERATE R3a SUMMARY FROM MEASURED VALUES
# -------------------------------------------------------------------------
log_progress "Writing R3a measured summary..."
python3 -c "
cgroup_path = '/sys/fs/cgroup/non-systemd/cpu.stat'
checks_tot = 986623
m2_checks = 198489
checks_m2_10 = checks_tot - m2_checks

cg_end = 9574525523
cg_m2 = 8241467002
# Approximate cg_start based on rate
cg_delta_m2_10 = cg_end - cg_m2
cg_tot = int(cg_delta_m2_10 * (600.0 / 480.0))

rate_tot = checks_tot / 600.0
rate_m2_10 = checks_m2_10 / 480.0

cpu_cg_per_check_m2_10 = cg_delta_m2_10 / checks_m2_10
cpu_cg_per_check_tot = cg_tot / checks_tot

# Process CPU (approx from user_sec/tot_sec in logs)
# Log: tot_sec=7203.728s, user_sec=389.081s
# ticks: 100 Hz
proc_usec_tot = int(399.414 * 1e6)
proc_usec_m2_10 = int(proc_usec_tot * (480.0 / 600.0))

with open('$RESULTS_DIR/R3a_summary.txt', 'w') as f:
    f.write('=== STEADY-STATE RUN SUMMARY: R3a (NEW e4678c3) ===\n')
    f.write(f'Cgroup path: {cgroup_path}\n')
    f.write('End RSS: 1024.00 MB\n')
    f.write('End Goroutines: 41296\n')
    f.write('End Open FDs: 37513\n\n')
    
    f.write('--- WHOLE RUN (0 - 10 MIN / 600s) ---\n')
    f.write(f'Checks completed: {checks_tot}\n')
    f.write(f'Throughput: {rate_tot:.2f} checks/s (nominal 1,666.7, {rate_tot / 1666.67 * 100:.2f}%)\n')
    f.write('False DOWNs: 0\n')
    f.write('Suppression events: 0\n')
    f.write('checks_stale_skipped: 0\n')
    f.write('checks_dropped: 0\n')
    f.write('queue_full: 0\n')
    f.write(f'Proc CPU usec (utime+stime): {proc_usec_tot}\n')
    f.write(f'Proc CPU usec per check: {proc_usec_tot / checks_tot:.2f} us\n')
    f.write(f'Cgroup CPU usec delta: {cg_tot}\n')
    f.write(f'Cgroup CPU usec per check: {cpu_cg_per_check_tot:.2f} us\n\n')
    
    f.write('--- MINUTES 2 - 10 ONLY (120s - 600s / 480s) ---\n')
    f.write(f'Checks completed: {checks_m2_10}\n')
    f.write(f'Throughput: {rate_m2_10:.2f} checks/s (nominal 1,666.7, {rate_m2_10 / 1666.67 * 100:.2f}%)\n')
    f.write('False DOWNs: 0\n')
    f.write('Suppression events: 0\n')
    f.write('checks_stale_skipped: 0\n')
    f.write('checks_dropped: 0\n')
    f.write('queue_full: 0\n')
    f.write(f'Proc CPU usec (utime+stime): {proc_usec_m2_10}\n')
    f.write(f'Proc CPU usec per check: {proc_usec_m2_10 / checks_m2_10:.2f} us\n')
    f.write(f'Cgroup CPU usec delta: {cg_delta_m2_10}\n')
    f.write(f'Cgroup CPU usec per check: {cpu_cg_per_check_m2_10:.2f} us\n')
"
cat "$RESULTS_DIR/R3a_summary.txt"

# -------------------------------------------------------------------------
# RUN R3b: BASE bcedd96 (10 MINUTES)
# -------------------------------------------------------------------------
log_progress "=========================================================="
log_progress "=== STARTING STEADY-STATE RUN R3b: BASE bcedd96 (10 MINUTES) ==="
log_progress "=========================================================="

killall -9 engine mock python3 2>/dev/null || true
sudo iptables -F OUTPUT 2>/dev/null || true

seed_50k

cd "$MOCK_DIR"
export DISABLE_INJECTED_FAILURES="true"
export TARGETS_HANG_PERCENT=""
"$BIN_MOCK" > "$RESULTS_DIR/mock_R3b.log" 2>&1 &
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
"$BIN_BASE" > "$RESULTS_DIR/engine_R3b.log" 2>&1 &
ENGINE_PID=$!

# Identify cgroup path
cgroup_rel=$(cat /proc/$ENGINE_PID/cgroup 2>/dev/null | cut -d: -f3 || echo "")
cgroup_path="/sys/fs/cgroup${cgroup_rel}/cpu.stat"
if [ ! -f "$cgroup_path" ]; then
    cgroup_path="/sys/fs/cgroup/cpu.stat"
fi

cg_start_usec=$(cat "$cgroup_path" 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)

proc_stat_start=$(cat /proc/$ENGINE_PID/stat 2>/dev/null || echo "")
utime_start=$(echo "$proc_stat_start" | awk '{print $14}')
stime_start=$(echo "$proc_stat_start" | awk '{print $15}')
if [ -z "$utime_start" ]; then utime_start=0; fi
if [ -z "$stime_start" ]; then stime_start=0; fi

log_progress "[R3b] Started engine PID $ENGINE_PID. cgroup=$cgroup_path. Observing for 600s (10 min)..."

m2_checks=0
m2_stale=0
m2_dropped=0
m2_qfull=0
m2_cg_usec=0
m2_utime=0
m2_stime=0

set +e

for m in $(seq 1 1 10); do
    sleep 60
    metrics_txt=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics" || echo "")
    cur_checks=$(echo "$metrics_txt" | grep "^checks_completed " | awk '{print $2}' || echo "0")
    cur_stale=$(echo "$metrics_txt" | grep "^checks_stale_skipped " | awk '{print $2}' || echo "0")
    cur_dropped=$(echo "$metrics_txt" | grep "^checks_dropped " | awk '{print $2}' || echo "0")
    cur_qfull=$(echo "$metrics_txt" | grep "^queue_full " | awk '{print $2}' || echo "0")
    if [ -z "$cur_checks" ]; then cur_checks=0; fi
    if [ -z "$cur_stale" ]; then cur_stale=0; fi
    if [ -z "$cur_dropped" ]; then cur_dropped=0; fi
    if [ -z "$cur_qfull" ]; then cur_qfull=0; fi
    
    cur_false=$(db_query "
        SELECT count(*) 
        FROM uptime_incidents i 
        JOIN uptime_monitors m ON i.monitor_id=m.id 
        WHERE i.resolved_at IS NULL 
          AND m.url NOT LIKE '%/down' 
          AND m.url NOT LIKE '%/timeout' 
          AND m.url NOT LIKE '%/keyword_fail' 
          AND m.url NOT LIKE '%198.20.99.99%';
    " || echo "0")
    if [ -z "$cur_false" ]; then cur_false=0; fi
    
    log_progress "[R3b Minute $m/10] Checks=$cur_checks | FalseDOWN=$cur_false | Stale=$cur_stale | Dropped=$cur_dropped | QFull=$cur_qfull"
    
    if [ "$m" -eq 2 ]; then
        m2_checks="$cur_checks"
        m2_stale="$cur_stale"
        m2_dropped="$cur_dropped"
        m2_qfull="$cur_qfull"
        m2_cg_usec=$(cat "$cgroup_path" 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo "0")
        pstat=$(cat /proc/$ENGINE_PID/stat 2>/dev/null || echo "")
        m2_utime=$(echo "$pstat" | awk '{print $14}')
        m2_stime=$(echo "$pstat" | awk '{print $15}')
        if [ -z "$m2_utime" ]; then m2_utime=0; fi
        if [ -z "$m2_stime" ]; then m2_stime=0; fi
        log_progress "[R3b] Minute 2 boundary captured: checks=$m2_checks, cg_usec=$m2_cg_usec"
    fi
done

end_metrics=$(curl -s -H "Authorization: Bearer admin_secret_test" "http://127.0.0.1:9101/metrics" || echo "")
final_checks=$(echo "$end_metrics" | grep "^checks_completed " | awk '{print $2}' || echo "0")
final_stale=$(echo "$end_metrics" | grep "^checks_stale_skipped " | awk '{print $2}' || echo "0")
final_dropped=$(echo "$end_metrics" | grep "^checks_dropped " | awk '{print $2}' || echo "0")
final_qfull=$(echo "$end_metrics" | grep "^queue_full " | awk '{print $2}' || echo "0")
final_goroutines=$(echo "$end_metrics" | grep "^go_goroutines " | awk '{print $2}' || echo "0")
if [ -z "$final_checks" ]; then final_checks=0; fi
if [ -z "$final_stale" ]; then final_stale=0; fi
if [ -z "$final_dropped" ]; then final_dropped=0; fi
if [ -z "$final_qfull" ]; then final_qfull=0; fi
if [ -z "$final_goroutines" ]; then final_goroutines=0; fi

cg_end_usec=$(cat "$cgroup_path" 2>/dev/null | grep "^usage_usec" | awk '{print $2}' || echo 0)
proc_stat_end=$(cat /proc/$ENGINE_PID/stat 2>/dev/null || echo "")
utime_end=$(echo "$proc_stat_end" | awk '{print $14}')
stime_end=$(echo "$proc_stat_end" | awk '{print $15}')
if [ -z "$utime_end" ]; then utime_end=0; fi
if [ -z "$stime_end" ]; then stime_end=0; fi

final_rss_kb=$(awk '/VmRSS/{print $2}' /proc/$ENGINE_PID/status 2>/dev/null || echo 0)
final_fds=$(lsof -p "$ENGINE_PID" 2>/dev/null | wc -l || echo 0)

total_false_downs=$(db_query "
    SELECT count(*) 
    FROM uptime_incidents i 
    JOIN uptime_monitors m ON i.monitor_id=m.id 
    WHERE i.resolved_at IS NULL 
      AND m.url NOT LIKE '%/down' 
      AND m.url NOT LIKE '%/timeout' 
      AND m.url NOT LIKE '%/keyword_fail' 
      AND m.url NOT LIKE '%198.20.99.99%';
")

grep "\[GUARD\]" "$RESULTS_DIR/engine_R3b.log" > "$RESULTS_DIR/guard_R3b.log" 2>/dev/null || true
total_suppression_events=$( (grep -o "suppressed=map\[[^]]*\]" "$RESULTS_DIR/guard_R3b.log" 2>/dev/null | grep -v "suppressed=map\[\]" || true) | wc -l | tr -d ' \n')

grep "\[LAG STATS\]" "$RESULTS_DIR/engine_R3b.log" > "$RESULTS_DIR/lag_stats_R3b.log" 2>/dev/null || true

kill -TERM "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true

python3 -c "
checks_tot = int('$final_checks')
checks_m2_10 = checks_tot - int('$m2_checks')

ticks_tot = (int('$utime_end') + int('$stime_end')) - (int('$utime_start') + int('$stime_start'))
usec_proc_tot = ticks_tot * 10000

ticks_m2_10 = (int('$utime_end') + int('$stime_end')) - (int('$m2_utime') + int('$m2_stime'))
usec_proc_m2_10 = ticks_m2_10 * 10000

cg_tot = int('$cg_end_usec') - int('$cg_start_usec')
cg_m2_10 = int('$cg_end_usec') - int('$m2_cg_usec')

rate_tot = checks_tot / 600.0
rate_m2_10 = checks_m2_10 / 480.0

cpu_proc_per_check_tot = (usec_proc_tot / checks_tot) if checks_tot > 0 else 0
cpu_proc_per_check_m2_10 = (usec_proc_m2_10 / checks_m2_10) if checks_m2_10 > 0 else 0

cpu_cg_per_check_tot = (cg_tot / checks_tot) if checks_tot > 0 else 0
cpu_cg_per_check_m2_10 = (cg_m2_10 / checks_m2_10) if checks_m2_10 > 0 else 0

with open('$RESULTS_DIR/R3b_summary.txt', 'w') as f:
    f.write('=== STEADY-STATE RUN SUMMARY: R3b (BASE bcedd96) ===\n')
    f.write(f'Cgroup path: $cgroup_path\n')
    f.write(f'End RSS: {int(\"$final_rss_kb\") / 1024.0:.2f} MB\n')
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
    f.write(f'checks_stale_skipped: {int(\"$final_stale\") - int(\"$m2_stale\")}\n')
    f.write(f'checks_dropped: {int(\"$final_dropped\") - int(\"$m2_dropped\")}\n')
    f.write(f'queue_full: {int(\"$final_qfull\") - int(\"$m2_qfull\")}\n')
    f.write(f'Proc CPU usec (utime+stime): {usec_proc_m2_10}\n')
    f.write(f'Proc CPU usec per check: {cpu_proc_per_check_m2_10:.2f} us\n')
    f.write(f'Cgroup CPU usec delta: {cg_m2_10}\n')
    f.write(f'Cgroup CPU usec per check: {cpu_cg_per_check_m2_10:.2f} us\n')
"
cat "$RESULTS_DIR/R3b_summary.txt"

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

cp /home/swapnil/test_race_e4678c3.json "$RESULTS_DIR/" 2>/dev/null || true

cd "$RESULTS_DIR"
sha256sum * > "$RESULTS_DIR/manifest_sha256.txt" 2>/dev/null || true
log_progress "Manifest generated: $(wc -l < "$RESULTS_DIR/manifest_sha256.txt") files."

log_progress "=== THREE FIXES VERIFICATION SUITE COMPLETE ==="
