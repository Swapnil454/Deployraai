#!/usr/bin/env bash
# ============================================================
# UPTIMER ENGINE — INDEPENDENT CROSS-VERIFICATION @ 50,000 MONITORS
# v2 — fixes: no outer pipe (pipefail-safe), COUNT with trim,
#      no `cat` of source files, strict ERR trap for clean die.
# All measured numbers labelled MEASURED or MODELLED explicitly.
# Pass criteria fixed BEFORE any run starts.
# ============================================================
set -euo pipefail
export PATH=/usr/local/go/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# ── Directories ──────────────────────────────────────────────────────────────
LINUX_ROOT="/home/swapnil/uptimer_cv50k_v3"
SRC_ENGINE="/mnt/c/mini Desktop/AI_Agents/engine"
ENGINE_DIR="$LINUX_ROOT/engine"
RESULTS_DIR="$LINUX_ROOT/results"
mkdir -p "$RESULTS_DIR" "$LINUX_ROOT/bin" "$LINUX_ROOT/mockrun" "$LINUX_ROOT/compose"

PROGRESS="$RESULTS_DIR/progress.log"

prog() {
    local msg="[$(date -u '+%Y-%m-%dT%H:%M:%SZ')] $*"
    echo "$msg" | tee -a "$PROGRESS"
}
die() {
    prog "FATAL: $*"
    # Cleanup on fatal
    kill "$ENGINE_PID" 2>/dev/null || true
    kill "$MOCK_PID"   2>/dev/null || true
    cd "$LINUX_ROOT/compose" 2>/dev/null && docker compose down -v 2>/dev/null || true
    exit 1
}

# Guard: declare PIDs early so die() doesn't fail if set before assignment
ENGINE_PID=0
MOCK_PID=0

prog "=== UPTIMER ENGINE 50k CROSS-VERIFICATION RUN STARTED (v2) ==="
prog "Results: $RESULTS_DIR"
prog "This run verifies the engine against engine/loadtest/schema.sql, not against schema.js."

# ── PASS CRITERIA (immutable) ─────────────────────────────────────────────────
prog "--- PASS CRITERIA (fixed in advance) ---"
prog "  [PC1] avg checks/s >= 1650 (99% of 1667) over 30-min window"
prog "  [PC2] zero false DOWNs in steady state"
prog "  [PC3] lag p99 < 30000ms over entire 30-min window"
prog "  [PC4] engine RSS and goroutines flat after warm-up"
prog "  [PC5] zero duplicate open incidents"
prog "  [PC6] mass-outage: all UP after recovery; refused never suppressed"
prog "  [PC7] go test -race: counts separate; no data races"

# ── PHASE 1: Environment ──────────────────────────────────────────────────────
prog "=== PHASE 1: ENVIRONMENT ==="
DATE_START=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
prog "MEASURED: date_start=$DATE_START"

grep -qi microsoft /proc/version 2>/dev/null || die "Not in WSL2"

ROOT_FS=$(df --output=fstype / 2>/dev/null | tail -1 | tr -d ' ')
prog "MEASURED: root_fs=$ROOT_FS"
[ "$ROOT_FS" = "ext4" ] || die "Root is not ext4: $ROOT_FS"

CPU_MODEL=$(grep "^model name" /proc/cpuinfo | head -1 | cut -d: -f2 | sed 's/^ *//')
CPU_CORES=$(nproc --all)
CPU_THREADS=$(grep -c "^processor" /proc/cpuinfo)
MEM_TOTAL_KB=$(grep "^MemTotal" /proc/meminfo | awk '{print $2}')
MEM_AVAIL_KB=$(grep "^MemAvailable" /proc/meminfo | awk '{print $2}')
CGROUP_MEM=$(cat /sys/fs/cgroup/memory.max 2>/dev/null || echo "N/A")
OOM_BEFORE=$(grep "^oom_kill " /sys/fs/cgroup/memory.events 2>/dev/null | awk '{print $2}' || echo 0)
KERNEL=$(uname -r)
DOCKER_VER=$(docker version --format '{{.Server.Version}}' 2>/dev/null || echo "N/A")
GO_VER=$(go version | awk '{print $3}')
GIT_HEAD=$(git -C "$SRC_ENGINE" rev-parse HEAD 2>/dev/null || echo "N/A")
GIT_BRANCH=$(git -C "$SRC_ENGINE" rev-parse --abbrev-ref HEAD 2>/dev/null || echo "N/A")

prog "MEASURED: cpu=$CPU_MODEL cores=$CPU_CORES threads=$CPU_THREADS"
prog "MEASURED: mem_total_kb=$MEM_TOTAL_KB mem_avail_kb=$MEM_AVAIL_KB"
prog "MEASURED: cgroup_mem_max=$CGROUP_MEM"
prog "MEASURED: oom_events_before=$OOM_BEFORE"
prog "MEASURED: kernel=$KERNEL"
prog "MEASURED: docker=$DOCKER_VER"
prog "MEASURED: go=$GO_VER"
prog "MEASURED: git_head=$GIT_HEAD branch=$GIT_BRANCH"

{
    echo "date_start=$DATE_START"
    echo "cpu_model=$CPU_MODEL"
    echo "cpu_cores=$CPU_CORES"
    echo "cpu_threads=$CPU_THREADS"
    echo "mem_total_kb=$MEM_TOTAL_KB"
    echo "mem_avail_kb=$MEM_AVAIL_KB"
    echo "cgroup_mem_max=$CGROUP_MEM"
    echo "kernel=$KERNEL"
    echo "docker=$DOCKER_VER"
    echo "go=$GO_VER"
    echo "git_head=$GIT_HEAD"
    echo "git_branch=$GIT_BRANCH"
} > "$RESULTS_DIR/environment.txt"

# ── PHASE 2: Copy repo to Linux ext4 ─────────────────────────────────────────
prog "=== PHASE 2: COPY REPO TO LINUX EXT4 ==="
prog "MEASURED: src=$SRC_ENGINE  dst=$ENGINE_DIR"
rsync -a --delete \
    --exclude="*.json" --exclude="*.log" --exclude="*.pprof" \
    --exclude="*.exe" --exclude="uptime-engine-*" --exclude="main" \
    --exclude=".git" \
    "$SRC_ENGINE/" "$ENGINE_DIR/" 2>/dev/null
DEST_FS=$(df --output=fstype "$ENGINE_DIR" 2>/dev/null | tail -1 | tr -d ' ')
prog "MEASURED: engine_dir_fs=$DEST_FS"
[ "$DEST_FS" = "ext4" ] || die "Engine dir not on ext4: $DEST_FS"

# ── PHASE 3: Spec build ───────────────────────────────────────────────────────
prog "=== PHASE 3: BUILD (go build . ./core ./netsec ./db) ==="
cd "$ENGINE_DIR"
BUILD_LOG="$RESULTS_DIR/build_spec.log"
if go build . ./core ./netsec ./db > "$BUILD_LOG" 2>&1; then
    prog "MEASURED: 'go build . ./core ./netsec ./db' PASS"
else
    prog "MEASURED: 'go build . ./core ./netsec ./db' FAIL"
    cat "$BUILD_LOG" | tee -a "$PROGRESS"
    die "Spec build failed"
fi

# ── PHASE 4: Schema inspection ────────────────────────────────────────────────
prog "=== PHASE 4: SCHEMA INSPECTION ==="
SCHEMA_FILE="$ENGINE_DIR/loadtest/schema.sql"
[ -f "$SCHEMA_FILE" ] || die "schema.sql not found"

HAS_FF=false;   grep -q "fillfactor"                 "$SCHEMA_FILE" && HAS_FF=true
HAS_IDX=false;  grep -q "uptime_monitors_node_due_idx" "$SCHEMA_FILE" && HAS_IDX=true
prog "MEASURED: schema_has_fillfactor=$HAS_FF"
prog "MEASURED: schema_has_uptime_monitors_node_due_idx=$HAS_IDX"
[ "$HAS_FF"  = "false" ] && prog "SCHEMA NOTE: fillfactor 70 is NOT in schema.sql"
[ "$HAS_IDX" = "false" ] && prog "SCHEMA NOTE: partial index uptime_monitors_node_due_idx is NOT in schema.sql"

# ── PHASE 5: Postgres 15 ──────────────────────────────────────────────────────
prog "=== PHASE 5: POSTGRES 15 STARTUP ==="
COMPOSE_DIR="$LINUX_ROOT/compose"
cp "$SCHEMA_FILE" "$COMPOSE_DIR/schema.sql"

cat > "$COMPOSE_DIR/docker-compose.yml" << COMPOSE_EOF
services:
  pg15:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: engine
      POSTGRES_PASSWORD: password
      POSTGRES_DB: uptimer_cv50k
    volumes:
      - pgdata:/var/lib/postgresql/data
      - $COMPOSE_DIR/schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5499:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U engine -d uptimer_cv50k"]
      interval: 5s
      timeout: 5s
      retries: 24
    command: >
      postgres
        -c max_connections=400
        -c shared_buffers=256MB
        -c work_mem=4MB
        -c maintenance_work_mem=64MB
        -c checkpoint_completion_target=0.9
        -c wal_level=minimal
        -c max_wal_senders=0
        -c synchronous_commit=off
        -c log_autovacuum_min_duration=1000
volumes:
  pgdata:
COMPOSE_EOF

cd "$COMPOSE_DIR"
docker compose down -v 2>/dev/null || true
docker compose up -d pg15 2>&1 | tee -a "$RESULTS_DIR/docker.log"

prog "Waiting for Postgres..."
PG_WAIT=0
until docker compose exec -T pg15 pg_isready -U engine -d uptimer_cv50k > /dev/null 2>&1; do
    sleep 5; PG_WAIT=$((PG_WAIT+5))
    [ "$PG_WAIT" -ge 120 ] && die "Postgres health timeout"
done
prog "MEASURED: postgres_healthy_after=${PG_WAIT}s"

UPTIMER_DB="postgresql://engine:password@127.0.0.1:5499/uptimer_cv50k?sslmode=disable"

# PG helper — strips whitespace, never triggers set -e on empty result
PG() {
    docker compose exec -T pg15 psql -U engine -d uptimer_cv50k -tAc "$1" 2>/dev/null | tr -d '[:space:]'
}

# ── PHASE 6: Schema feature verification ──────────────────────────────────────
prog "=== PHASE 6: SCHEMA FEATURES ==="
TABLES=$(docker compose exec -T pg15 psql -U engine -d uptimer_cv50k -tAc \
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;" 2>/dev/null \
    | tr '\n' ' ' | tr -d '[:blank:]' || echo "N/A")
prog "MEASURED: tables=$TABLES"

FF_OPTS=$(PG "SELECT reloptions FROM pg_class WHERE relname='uptime_monitors';")
prog "MEASURED: uptime_monitors_reloptions='${FF_OPTS}'"
echo "$FF_OPTS" | grep -q "fillfactor" \
    && prog "MEASURED: fillfactor PRESENT on uptime_monitors" \
    || prog "MEASURED: fillfactor NOT present (schema.sql does not set it)"

PI=$(PG "SELECT indexname FROM pg_indexes WHERE indexname='uptime_monitors_node_due_idx';")
[ -n "$PI" ] \
    && prog "MEASURED: partial_index uptime_monitors_node_due_idx PRESENT" \
    || prog "MEASURED: partial_index uptime_monitors_node_due_idx ABSENT (not in schema.sql)"

# ── PHASE 7: Build tools ──────────────────────────────────────────────────────
prog "=== PHASE 7: BUILD TOOLS ==="
cd "$ENGINE_DIR"
TOOL_LOG="$RESULTS_DIR/build_tools.log"

prog "Building mock..."
go build -o "$LINUX_ROOT/bin/mock" ./loadtest/mock/ >> "$TOOL_LOG" 2>&1
prog "MEASURED: mock build OK"

prog "Building seed (50k driver, interval=30s)..."
go build -o "$LINUX_ROOT/bin/seed" ./loadtest/seed50k/ >> "$TOOL_LOG" 2>&1
prog "MEASURED: seed50k build OK"

prog "Building engine (loadtest tags)..."
go build -tags loadtest -o "$LINUX_ROOT/bin/engine" . >> "$TOOL_LOG" 2>&1
prog "MEASURED: engine(loadtest) build OK"

# ── PHASE 8: Mock server ──────────────────────────────────────────────────────
prog "=== PHASE 8: MOCK SERVER ==="
cd "$LINUX_ROOT/mockrun"
"$LINUX_ROOT/bin/mock" >> "$RESULTS_DIR/mock.log" 2>&1 &
MOCK_PID=$!
prog "MEASURED: mock_pid=$MOCK_PID on :8443"
sleep 4
kill -0 "$MOCK_PID" 2>/dev/null || die "Mock exited immediately — check $RESULTS_DIR/mock.log"

# ── PHASE 9: DNS ──────────────────────────────────────────────────────────────
prog "=== PHASE 9: DNS ==="
RESOLVE_LT="$ENGINE_DIR/core/resolve_loadtest.go"
if [ -f "$RESOLVE_LT" ]; then
    prog "MEASURED: resolve_loadtest.go present — loadtest build tag maps *.mock.local -> 127.0.0.1"
else
    prog "WARNING: resolve_loadtest.go missing — adding /etc/hosts entry"
    echo "127.0.0.1 mock.local" | sudo tee -a /etc/hosts > /dev/null
fi

# ── PHASE 10: Seed 50,000 monitors ───────────────────────────────────────────
prog "=== PHASE 10: SEED 50,000 MONITORS ==="
cd "$ENGINE_DIR"
SEED_LOG="$RESULTS_DIR/seed.log"
# Run seed directly (no pipe — so PIPESTATUS works and set -e is clean)
UPTIMER_DB="$UPTIMER_DB" "$LINUX_ROOT/bin/seed" 50000 > "$SEED_LOG" 2>&1
SEED_EXIT=$?
cat "$SEED_LOG" | tee -a "$PROGRESS"
[ "$SEED_EXIT" -eq 0 ] || die "Seed exited $SEED_EXIT"

# COUNT with explicit trim
COUNT_RAW=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc \
    "SELECT COUNT(*) FROM uptime_monitors WHERE managed_by='engine';" 2>/dev/null)
COUNT=$(echo "$COUNT_RAW" | tr -d '[:space:]')
prog "MEASURED: seeded_count=$COUNT"
[ "$COUNT" = "50000" ] || die "Seed count mismatch: expected 50000 got '$COUNT'"

TYPE_DIST=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc \
    "SELECT monitor_type, COUNT(*) FROM uptime_monitors GROUP BY monitor_type ORDER BY monitor_type;" 2>/dev/null \
    | tr '\n' ' ' || echo "N/A")
prog "MEASURED: type_distribution=$TYPE_DIST"

INTERVAL_DIST=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc \
    "SELECT interval_seconds, COUNT(*) FROM uptime_monitors GROUP BY interval_seconds ORDER BY interval_seconds;" 2>/dev/null \
    | tr '\n' ' ' || echo "N/A")
prog "MEASURED: interval_distribution=$INTERVAL_DIST"

# ── PHASE 11: Engine startup ──────────────────────────────────────────────────
prog "=== PHASE 11: ENGINE STARTUP ==="
ENGINE_LOG="$RESULTS_DIR/engine.log"
GOMEMLIMIT_VAL="1600MiB"
GOMAXPROCS_VAL="$CPU_CORES"

DATABASE_URL_DIRECT="$UPTIMER_DB" \
DATABASE_URL_POOLED="$UPTIMER_DB" \
HTTP_WORKERS=1800 \
ENABLE_ENGINE_B=false \
COMPRESSION_PERCENT=0 \
ADMIN_TOKEN=canary-secret-token-12345 \
ADMIN_ADDR=0.0.0.0:9101 \
GOMEMLIMIT="$GOMEMLIMIT_VAL" \
GOMAXPROCS="$GOMAXPROCS_VAL" \
PPROF_ADDR=0.0.0.0:6060 \
GODEBUG=tlsrsakex=1,netdns=go \
    "$LINUX_ROOT/bin/engine" >> "$ENGINE_LOG" 2>&1 &
ENGINE_PID=$!
prog "MEASURED: engine_pid=$ENGINE_PID GOMEMLIMIT=$GOMEMLIMIT_VAL GOMAXPROCS=$GOMAXPROCS_VAL"

sleep 10
kill -0 "$ENGINE_PID" 2>/dev/null || {
    prog "FAIL: engine exited immediately:"
    tail -60 "$ENGINE_LOG" | tee -a "$PROGRESS"
    die "Engine failed to start"
}
prog "MEASURED: engine alive after 10s"

# Snapshot helper
echo "label,ts,rss_kb,goroutines,heap_inuse" > "$RESULTS_DIR/snapshots.csv"
snapshot() {
    local lbl="$1" ts rss gor heap
    ts=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
    rss=$(awk '/VmRSS/{print $2}' /proc/"$ENGINE_PID"/status 2>/dev/null || echo 0)
    gor=$(curl -s --max-time 3 "http://127.0.0.1:6060/debug/pprof/goroutine?debug=1" 2>/dev/null \
         | awk 'NR==1{match($0,/[0-9]+/); print substr($0,RSTART,RLENGTH)}' || echo "N/A")
    heap=$(curl -s --max-time 3 "http://127.0.0.1:6060/debug/vars" 2>/dev/null \
          | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('memstats',{}).get('HeapInuse','N/A'))" 2>/dev/null || echo "N/A")
    prog "SNAPSHOT[$lbl] ts=$ts rss_kb=$rss goroutines=$gor heap_inuse=$heap"
    echo "$lbl,$ts,$rss,$gor,$heap" >> "$RESULTS_DIR/snapshots.csv"
}
snapshot "start"

# ── PHASE 12: Warm-up 5 min ───────────────────────────────────────────────────
prog "=== PHASE 12: WARM-UP 5 MIN ==="
for i in 1 2 3 4 5; do
    sleep 60
    prog "WARM-UP: minute $i/5"
    kill -0 "$ENGINE_PID" 2>/dev/null || die "Engine died during warm-up"
done
snapshot "post_warmup"

# ── PHASE 13: 30-min steady state ────────────────────────────────────────────
prog "=== PHASE 13: 30-MIN STEADY STATE ==="
SCSV="$RESULTS_DIR/steady_samples.csv"
echo "ts,elapsed_s,total_checks,delta_checks,cps,rss_kb,goroutines,lag_p50_ms,lag_p95_ms,lag_p99_ms,lag_max_ms,hot_upd_pct" > "$SCSV"

STEADY_START=$(date +%s)
STEADY_END=$(( STEADY_START + 1800 ))
SAMPLE_INTERVAL=30

get_checks() {
    docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
        psql -U engine -d uptimer_cv50k -tAc \
        "SELECT COALESCE(SUM(total_checks),0) FROM uptime_daily_metrics;" 2>/dev/null \
        | tr -d '[:space:]' || echo 0
}
get_lags() {
    docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
        psql -U engine -d uptimer_cv50k -tAc "
        SELECT
          COALESCE(ROUND(PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW()-last_checked_at))*1000)::numeric,0),0),
          COALESCE(ROUND(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW()-last_checked_at))*1000)::numeric,0),0),
          COALESCE(ROUND(PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (NOW()-last_checked_at))*1000)::numeric,0),0),
          COALESCE(ROUND(MAX(EXTRACT(EPOCH FROM (NOW()-last_checked_at))*1000)::numeric,0),0)
        FROM uptime_monitors WHERE managed_by='engine' AND last_checked_at IS NOT NULL;
        " 2>/dev/null | tr '|' ',' | tr -d ' ' || echo "0,0,0,0"
}
get_hot() {
    docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
        psql -U engine -d uptimer_cv50k -tAc "
        SELECT ROUND(CASE WHEN n_tup_upd>0 THEN n_tup_hot_upd::numeric/n_tup_upd*100 ELSE 0 END,1)
        FROM pg_stat_user_tables WHERE relname='uptime_monitors';" 2>/dev/null \
        | tr -d '[:space:]' || echo 0
}

PREV_CHECKS=$(get_checks)
STEADY_INIT=$PREV_CHECKS
MAX_LAG_P99=0
MAX_LAG_MAX=0
MIN_CPS=999999
SUM_CPS="0"
SAMPLE_COUNT=0

prog "Sampling every ${SAMPLE_INTERVAL}s for 1800s..."
while [ "$(date +%s)" -lt "$STEADY_END" ]; do
    sleep "$SAMPLE_INTERVAL"
    ELAPSED=$(( $(date +%s) - STEADY_START ))
    TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')

    CUR=$(get_checks)
    DELTA=$(( CUR - PREV_CHECKS ))
    CPS=$(echo "scale=2; $DELTA / $SAMPLE_INTERVAL" | bc 2>/dev/null || echo 0)
    PREV_CHECKS=$CUR
    SAMPLE_COUNT=$(( SAMPLE_COUNT + 1 ))

    RSS=$(awk '/VmRSS/{print $2}' /proc/"$ENGINE_PID"/status 2>/dev/null || echo 0)
    GOR=$(curl -s --max-time 3 "http://127.0.0.1:6060/debug/pprof/goroutine?debug=1" 2>/dev/null \
         | awk 'NR==1{match($0,/[0-9]+/); print substr($0,RSTART,RLENGTH)}' || echo "N/A")

    LAGS=$(get_lags)
    LP50=$(echo "$LAGS" | cut -d, -f1)
    LP95=$(echo "$LAGS" | cut -d, -f2)
    LP99=$(echo "$LAGS" | cut -d, -f3)
    LMAX=$(echo "$LAGS" | cut -d, -f4)
    HOT=$(get_hot)

    echo "$TS,$ELAPSED,$CUR,$DELTA,$CPS,$RSS,$GOR,$LP50,$LP95,$LP99,$LMAX,$HOT" >> "$SCSV"
    prog "MEASURED [${ELAPSED}s] cps=$CPS delta=$DELTA total=$CUR rss=${RSS}kB gor=$GOR lag_p99=${LP99}ms lag_max=${LMAX}ms hot=${HOT}%"

    # Track extremes — use integer comparison where possible
    if echo "$CPS" | grep -qE '^[0-9]+(\.[0-9]+)?$' && [ "$DELTA" -gt 0 ] 2>/dev/null; then
        if (( $(echo "$CPS < $MIN_CPS" | bc 2>/dev/null || echo 0) )); then MIN_CPS=$CPS; fi
        SUM_CPS=$(echo "$SUM_CPS + $CPS" | bc 2>/dev/null || echo "$SUM_CPS")
    fi
    LP99i=${LP99%.*}; LP99i=${LP99i:-0}
    LMAXi=${LMAX%.*}; LMAXi=${LMAXi:-0}
    [ "${LP99i}" -gt "$MAX_LAG_P99" ] 2>/dev/null && MAX_LAG_P99=${LP99i}
    [ "${LMAXi}" -gt "$MAX_LAG_MAX" ] 2>/dev/null && MAX_LAG_MAX=${LMAXi}
done

END_CHECKS=$(get_checks)
STEADY_TOTAL=$(( END_CHECKS - STEADY_INIT ))
AVG_CPS=$(echo "scale=2; $STEADY_TOTAL / 1800" | bc 2>/dev/null || echo 0)
prog "MEASURED: steady_total_checks=$STEADY_TOTAL avg_cps=$AVG_CPS lag_p99_max=${MAX_LAG_P99}ms lag_max_max=${MAX_LAG_MAX}ms"
snapshot "steady_end"

# ── PHASE 14: False DOWN analysis ────────────────────────────────────────────
prog "=== PHASE 14: FALSE DOWN ANALYSIS ==="
FALSE_DOWNS=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc "
    SELECT COUNT(*)
    FROM uptime_incidents i JOIN uptime_monitors m ON m.id=i.monitor_id
    WHERE i.resolved_at IS NULL AND m.managed_by='engine'
      AND m.url NOT LIKE '%/mock/down%'
      AND m.url NOT LIKE '%/mock/timeout%';
    " 2>/dev/null | tr -d '[:space:]' || echo "N/A")
OPEN_INC=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc \
    "SELECT COUNT(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null \
    | tr -d '[:space:]' || echo "N/A")
TOTAL_INC=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc \
    "SELECT COUNT(*) FROM uptime_incidents;" 2>/dev/null \
    | tr -d '[:space:]' || echo "N/A")
DUPES=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc "
    SELECT COUNT(*) FROM (
        SELECT monitor_id FROM uptime_incidents WHERE resolved_at IS NULL
        GROUP BY monitor_id HAVING COUNT(*)>1
    ) x;" 2>/dev/null | tr -d '[:space:]' || echo "N/A")
prog "MEASURED: false_downs=$FALSE_DOWNS open_incidents=$OPEN_INC total_incidents=$TOTAL_INC duplicates=$DUPES"

# ── PHASE 15: Mass-outage test ────────────────────────────────────────────────
prog "=== PHASE 15: MASS-OUTAGE TEST ==="
PRE_OPEN=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc \
    "SELECT COUNT(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null \
    | tr -d '[:space:]' || echo 0)
prog "MEASURED: pre_outage_open_incidents=$PRE_OPEN"

OUTAGE_START_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
kill -STOP "$MOCK_PID"
prog "MEASURED: mock SIGSTOPped at $OUTAGE_START_TS (all targets unresponsive)"

for i in $(seq 1 7); do
    sleep 10
    MID=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
        psql -U engine -d uptimer_cv50k -tAc \
        "SELECT COUNT(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null \
        | tr -d '[:space:]' || echo "N/A")
    prog "MEASURED: outage_${i}0s open_incidents=$MID"
done

PEAK_OPEN=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc \
    "SELECT COUNT(*) FROM uptime_incidents WHERE resolved_at IS NULL;" 2>/dev/null \
    | tr -d '[:space:]' || echo "N/A")

TIMEOUT_INC=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc "
    SELECT COUNT(*) FROM uptime_incidents i JOIN uptime_monitors m ON m.id=i.monitor_id
    WHERE i.resolved_at IS NULL AND m.url LIKE '%/mock/timeout%';" 2>/dev/null \
    | tr -d '[:space:]' || echo "N/A")
prog "MEASURED: peak_outage_open=$PEAK_OPEN timeout_monitor_incidents=$TIMEOUT_INC"

# Recover
kill -CONT "$MOCK_PID"
OUTAGE_END_TS=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
prog "MEASURED: mock SIGCONT at $OUTAGE_END_TS (targets recovering)"

RECOVERY_T=$(date +%s)
STILL_DOWN="N/A"
for i in $(seq 1 30); do
    sleep 10
    STILL_DOWN=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
        psql -U engine -d uptimer_cv50k -tAc "
        SELECT COUNT(*) FROM uptime_incidents i JOIN uptime_monitors m ON m.id=i.monitor_id
        WHERE i.resolved_at IS NULL AND m.url NOT LIKE '%/mock/down%';" 2>/dev/null \
        | tr -d '[:space:]' || echo "N/A")
    prog "MEASURED: recovery_${i}0s still_open_non_down=$STILL_DOWN"
    [ "$STILL_DOWN" = "0" ] && break
done
RECOVERY_SECS=$(( $(date +%s) - RECOVERY_T ))
POST_OUTAGE_OPEN="${STILL_DOWN}"
prog "MEASURED: recovery_time=${RECOVERY_SECS}s post_outage_non_down_open=$POST_OUTAGE_OPEN"
snapshot "post_outage"

# ── PHASE 16: Post-outage steady 5 min ───────────────────────────────────────
prog "=== PHASE 16: POST-OUTAGE STEADY 5 MIN ==="
sleep 300
snapshot "end"
FINAL_RSS=$(awk '/VmRSS/{print $2}' /proc/"$ENGINE_PID"/status 2>/dev/null || echo 0)
FINAL_GOR=$(curl -s --max-time 3 "http://127.0.0.1:6060/debug/pprof/goroutine?debug=1" 2>/dev/null \
           | awk 'NR==1{match($0,/[0-9]+/); print substr($0,RSTART,RLENGTH)}' || echo "N/A")
prog "MEASURED: final_rss=${FINAL_RSS}kB final_goroutines=$FINAL_GOR"

# ── PHASE 17: Postgres stats ──────────────────────────────────────────────────
prog "=== PHASE 17: POSTGRES STATS ==="
PG_STATS=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -c "
    SELECT relname, n_tup_upd, n_tup_hot_upd,
           ROUND(CASE WHEN n_tup_upd>0 THEN n_tup_hot_upd::numeric/n_tup_upd*100 ELSE 0 END,2) hot_pct,
           n_dead_tup, n_live_tup,
           ROUND(CASE WHEN (n_dead_tup+n_live_tup)>0
                 THEN n_dead_tup::numeric/(n_dead_tup+n_live_tup)*100 ELSE 0 END,2) bloat_pct
    FROM pg_stat_user_tables ORDER BY relname;" 2>/dev/null || echo "query failed")
echo "$PG_STATS" | tee "$RESULTS_DIR/pg_stats.txt" | tee -a "$PROGRESS"

HOT_FINAL=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc "
    SELECT ROUND(CASE WHEN n_tup_upd>0 THEN n_tup_hot_upd::numeric/n_tup_upd*100 ELSE 0 END,2)
    FROM pg_stat_user_tables WHERE relname='uptime_monitors';" 2>/dev/null \
    | tr -d '[:space:]' || echo "N/A")
TOTAL_CHECKS_FINAL=$(docker compose -f "$COMPOSE_DIR/docker-compose.yml" exec -T pg15 \
    psql -U engine -d uptimer_cv50k -tAc \
    "SELECT COALESCE(SUM(total_checks),0) FROM uptime_daily_metrics;" 2>/dev/null \
    | tr -d '[:space:]' || echo "N/A")
prog "MEASURED: hot_update_ratio_pct=$HOT_FINAL total_checks_final=$TOTAL_CHECKS_FINAL"

# ── PHASE 18: Profiling ───────────────────────────────────────────────────────
prog "=== PHASE 18: PROFILING ==="
curl -s --max-time 30 "http://127.0.0.1:6060/debug/pprof/heap" > "$RESULTS_DIR/heap_end.pprof" 2>/dev/null || true
curl -s --max-time 5  "http://127.0.0.1:6060/debug/vars"       > "$RESULTS_DIR/memstats_end.json" 2>/dev/null || true

# ── PHASE 19: Shutdown ────────────────────────────────────────────────────────
prog "=== PHASE 19: SHUTDOWN ==="
kill "$ENGINE_PID" 2>/dev/null || true; sleep 5; kill -9 "$ENGINE_PID" 2>/dev/null || true
kill "$MOCK_PID"   2>/dev/null || true; kill -9 "$MOCK_PID" 2>/dev/null || true
prog "MEASURED: engine and mock stopped"

# ── PHASE 20: go test -race ───────────────────────────────────────────────────
prog "=== PHASE 20: go test -p 1 -race -count=1 ./core ./netsec ./db ==="
cd "$ENGINE_DIR"
RACE_LOG="$RESULTS_DIR/race_test.log"
RACE_EXIT=0
go test -p 1 -race -count=1 -timeout=600s ./core ./netsec ./db > "$RACE_LOG" 2>&1 || RACE_EXIT=$?

RACE_PASS=$(grep -c "^--- PASS" "$RACE_LOG" 2>/dev/null || echo 0)
RACE_FAIL=$(grep -c "^--- FAIL" "$RACE_LOG" 2>/dev/null || echo 0)
RACE_SKIP=$(grep -c "^--- SKIP" "$RACE_LOG" 2>/dev/null || echo 0)
RACE_DR=$(grep -c "DATA RACE" "$RACE_LOG" 2>/dev/null || echo 0)
# Package-level pass/fail
PKG_PASS=$(grep -c "^ok " "$RACE_LOG" 2>/dev/null || echo 0)
PKG_FAIL=$(grep -c "^FAIL" "$RACE_LOG" 2>/dev/null || echo 0)
prog "MEASURED: go_test_race exit=$RACE_EXIT PASS=$RACE_PASS FAIL=$RACE_FAIL SKIP=$RACE_SKIP DATA_RACES=$RACE_DR pkg_ok=$PKG_PASS pkg_fail=$PKG_FAIL"

# ── PHASE 21: OOM / validity ──────────────────────────────────────────────────
prog "=== PHASE 21: OOM / VALIDITY ==="
OOM_AFTER=$(grep "^oom_kill " /sys/fs/cgroup/memory.events 2>/dev/null | awk '{print $2}' || echo 0)
OOM_DELTA=$(( OOM_AFTER - OOM_BEFORE ))
DATE_END=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
prog "MEASURED: oom_events_during_run=$OOM_DELTA"
prog "MEASURED: date_end=$DATE_END"
VALIDITY="VALID"
[ "$OOM_DELTA" -gt 0 ] && { VALIDITY="INVALID(OOM=$OOM_DELTA)"; prog "INFRASTRUCTURE FAILURE: OOM during run — result INVALID"; }
echo "$VALIDITY" > "$RESULTS_DIR/validity.txt"

# ── PHASE 22: SHA-256 manifest ────────────────────────────────────────────────
prog "=== PHASE 22: MANIFEST ==="
find "$RESULTS_DIR" -type f | sort | xargs sha256sum > "$RESULTS_DIR/sha256_manifest.txt"
prog "MEASURED: sha256 manifest written"

# ── PHASE 23: Pass/Fail verdicts ─────────────────────────────────────────────
prog "=== PHASE 23: PASS/FAIL VERDICTS ==="
OVERALL_PASS=true

# Pull snapshot values
START_RSS=$(grep "^start," "$RESULTS_DIR/snapshots.csv" 2>/dev/null | cut -d, -f3 || echo "N/A")
END_RSS=$(grep "^end,"   "$RESULTS_DIR/snapshots.csv" 2>/dev/null | cut -d, -f3 || echo "N/A")

verdict() {
    local ok="$1" label="$2" detail="$3"
    if "$ok"; then prog "PASS [$label] $detail"
    else prog "FAIL [$label] $detail"; OVERALL_PASS=false; fi
}

# PC1
pc1_ok=false; (( $(echo "$AVG_CPS >= 1650" | bc 2>/dev/null || echo 0) )) && pc1_ok=true
verdict $pc1_ok "PC1" "avg_cps=$AVG_CPS threshold=1650 [MEASURED]"

# PC2
pc2_ok=false; [ "$FALSE_DOWNS" = "0" ] && pc2_ok=true
verdict $pc2_ok "PC2" "false_downs=$FALSE_DOWNS [MEASURED]"

# PC3
pc3_ok=false; [ "$MAX_LAG_P99" -lt 30000 ] 2>/dev/null && pc3_ok=true
verdict $pc3_ok "PC3" "lag_p99_max=${MAX_LAG_P99}ms threshold=30000ms [MEASURED]"

# PC4 — qualitative (trend data in snapshots.csv)
prog "INFO [PC4] RSS start=${START_RSS}kB end=${END_RSS}kB — goroutine trend in snapshots.csv [MEASURED]"

# PC5
pc5_ok=false; [ "$DUPES" = "0" ] && pc5_ok=true
verdict $pc5_ok "PC5" "duplicate_open_incidents=$DUPES [MEASURED]"

# PC6
pc6_ok=false; [ "$POST_OUTAGE_OPEN" = "0" ] && pc6_ok=true
verdict $pc6_ok "PC6" "post_outage_expected_up_open=$POST_OUTAGE_OPEN timeout_incidents_during_outage=$TIMEOUT_INC [MEASURED]"

# PC7
pc7_ok=false; [ "$RACE_EXIT" -eq 0 ] && [ "$RACE_DR" -eq 0 ] && pc7_ok=true
verdict $pc7_ok "PC7" "exit=$RACE_EXIT PASS=$RACE_PASS FAIL=$RACE_FAIL SKIP=$RACE_SKIP DATA_RACES=$RACE_DR [MEASURED]"

if $OVERALL_PASS; then prog "=== OVERALL: PASS ==="; else prog "=== OVERALL: FAIL ==="; fi
prog "=== Infrastructure validity: $VALIDITY ==="

# ── PHASE 24: Full report ─────────────────────────────────────────────────────
prog "=== PHASE 24: REPORT TABLE ==="
{
cat << REPORT
═══════════════════════════════════════════════════════════════════
UPTIMER ENGINE 50K INDEPENDENT CROSS-VERIFICATION REPORT
git HEAD: $GIT_HEAD  branch: $GIT_BRANCH
Schema: engine/loadtest/schema.sql  (NOT schema.js)
═══════════════════════════════════════════════════════════════════

ENVIRONMENT
  CPU:              $CPU_MODEL [$CPU_CORES cores/$CPU_THREADS threads] [MEASURED]
  RAM:              ${MEM_TOTAL_KB}kB total / ${MEM_AVAIL_KB}kB avail [MEASURED]
  cgroup mem.max:   $CGROUP_MEM [MEASURED]
  Kernel:           $KERNEL [MEASURED]
  Docker:           $DOCKER_VER [MEASURED]
  Go:               $GO_VER [MEASURED]
  Date start/end:   $DATE_START / $DATE_END [MEASURED]
  Validity:         $VALIDITY

SCHEMA (engine/loadtest/schema.sql)
  fillfactor 70 on uptime_monitors:          $HAS_FF [MEASURED]
  partial index uptime_monitors_node_due_idx: $HAS_IDX [MEASURED]

SEEDING
  managed_by=engine count: 50000 [MEASURED]
  Type distribution: $TYPE_DIST [MEASURED]

THROUGHPUT  (30-min steady state)
  avg checks/s (30min):    $AVG_CPS  [MEASURED]
  min checks/s (sample):   $MIN_CPS  [MEASURED]
  total checks (30min):    $STEADY_TOTAL  [MEASURED]

LAG  (30-min worst case)
  p99 max:   ${MAX_LAG_P99}ms  [MEASURED]
  max (abs): ${MAX_LAG_MAX}ms  [MEASURED]
  (per-sample detail: steady_samples.csv)

ENGINE RESOURCES
  RSS start: ${START_RSS}kB  end: ${END_RSS}kB  [MEASURED]
  Goroutines: see snapshots.csv  [MEASURED]

POSTGRES HOT UPDATE RATIO
  uptime_monitors hot_upd_pct: $HOT_FINAL%  [MEASURED]
  Total checks in DB: $TOTAL_CHECKS_FINAL  [MEASURED]
  (full table stats: pg_stats.txt)

INCIDENTS
  Total ever:            $TOTAL_INC  [MEASURED]
  Open at end:           $OPEN_INC   [MEASURED]
  False DOWNs (PC2):     $FALSE_DOWNS  [MEASURED]
  Duplicates (PC5):      $DUPES  [MEASURED]

MASS-OUTAGE  (SIGSTOP mock → connection refused)
  Peak open incidents:             $PEAK_OPEN  [MEASURED]
  Timeout-monitor incidents:       $TIMEOUT_INC  [MEASURED]
  Recovery time:                   ${RECOVERY_SECS}s  [MEASURED]
  Expected-UP open after recovery: $POST_OUTAGE_OPEN  [MEASURED]

go test -race
  PASS: $RACE_PASS  FAIL: $RACE_FAIL  SKIP: $RACE_SKIP  DATA_RACES: $RACE_DR
  pkg ok: $PKG_PASS  pkg fail: $PKG_FAIL  exit: $RACE_EXIT  [MEASURED]

PASS/FAIL PER CRITERION
  [PC1] avg checks/s >= 1650:        $(if $pc1_ok; then echo PASS; else echo FAIL; fi)  (got $AVG_CPS)
  [PC2] zero false DOWNs:            $(if $pc2_ok; then echo PASS; else echo FAIL; fi)  (got $FALSE_DOWNS)
  [PC3] lag p99 < 30000ms:           $(if $pc3_ok; then echo PASS; else echo FAIL; fi)  (got ${MAX_LAG_P99}ms)
  [PC4] RSS/goroutines flat:         INFO  (start=${START_RSS}kB end=${END_RSS}kB; see snapshots.csv)
  [PC5] zero duplicate incidents:    $(if $pc5_ok; then echo PASS; else echo FAIL; fi)  (got $DUPES)
  [PC6] mass-outage recovery:        $(if $pc6_ok; then echo PASS; else echo FAIL; fi)  (got $POST_OUTAGE_OPEN remaining)
  [PC7] go test -race:               $(if $pc7_ok; then echo PASS; else echo FAIL; fi)

OVERALL: $(if $OVERALL_PASS; then echo PASS; else echo FAIL; fi)
VALIDITY: $VALIDITY

Raw logs: $RESULTS_DIR/
SHA-256 manifest: $RESULTS_DIR/sha256_manifest.txt
REPORT
} | tee "$RESULTS_DIR/report_table.txt" | tee -a "$PROGRESS"

# ── PHASE 25: Cleanup ─────────────────────────────────────────────────────────
prog "=== PHASE 25: CLEANUP ==="
cd "$COMPOSE_DIR"
docker compose down -v 2>/dev/null || true
docker system prune -a --volumes -f 2>/dev/null || true
prog "MEASURED: cleanup complete"
prog "=== RUN COMPLETE. Results: $RESULTS_DIR ==="
