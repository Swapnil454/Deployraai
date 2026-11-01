#!/bin/bash
set -euo pipefail
export PATH="/usr/local/go/bin:$PATH"

WORK_DIR="/home/swapnil/uptimer_proof_10"
RESULTS_DIR="$WORK_DIR/results"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR/compose" "$WORK_DIR/bin" "$RESULTS_DIR"

SRC="/mnt/c/mini Desktop/AI_Agents/engine"
echo "Syncing engine source..."
rsync -a --delete \
    --exclude="*.exe" --exclude="uptime-engine-*" --exclude="main" \
    --exclude=".git" \
    "$SRC/" "$WORK_DIR/engine/"

cp "$WORK_DIR/engine/loadtest/schema.sql" "$WORK_DIR/compose/schema.sql"

cat > "$WORK_DIR/compose/docker-compose.yml" << 'COMPOSE_EOF'
services:
  pg15:
    image: postgres:15-alpine
    environment:
      POSTGRES_USER: engine
      POSTGRES_PASSWORD: password
      POSTGRES_DB: uptimer_proof
    volumes:
      - pgdata_proof:/var/lib/postgresql/data
      - ./schema.sql:/docker-entrypoint-initdb.d/schema.sql
    ports:
      - "5499:5432"
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U engine -d uptimer_proof"]
      interval: 2s
      timeout: 2s
      retries: 20
    command: >
      postgres
      -c shared_buffers=512MB
      -c max_connections=200
volumes:
  pgdata_proof:
COMPOSE_EOF

echo "Starting Postgres 15 container..."
cd "$WORK_DIR/compose"
docker compose down -v 2>/dev/null || true
docker compose up -d

echo "Waiting for Postgres 15..."
for i in $(seq 1 30); do
    if docker compose exec -T pg15 pg_isready -U engine -d uptimer_proof >/dev/null 2>&1; then
        echo "Postgres is ready."
        break
    fi
    sleep 1
done

# Initialize schema explicitly
docker compose exec -T pg15 psql -U engine -d uptimer_proof -f /docker-entrypoint-initdb.d/schema.sql

echo "Building tools..."
cd "$WORK_DIR/engine"
go build -o "$WORK_DIR/bin/mock" ./loadtest/mock/
go build -o "$WORK_DIR/bin/seed_validated" ./loadtest/seed_validated/
go build -tags loadtest -o "$WORK_DIR/bin/engine" .
echo "Build complete."

# Start mock server
echo "Starting mock server..."
mkdir -p "$WORK_DIR/mockrun"
cd "$WORK_DIR/mockrun"
"$WORK_DIR/bin/mock" > "$RESULTS_DIR/mock.log" 2>&1 &
MOCK_PID=$!
sleep 2
kill -0 "$MOCK_PID" 2>/dev/null || { echo "Mock server failed to start"; exit 1; }
echo "Mock server running with PID $MOCK_PID"

# Seed 10 monitors per type (80 total) with 10s interval
echo "Seeding 10 per type proof of life..."
cd "$WORK_DIR/engine"
export UPTIMER_DB="postgres://engine:password@127.0.0.1:5499/uptimer_proof?sslmode=disable"
export SEED_INTERVAL="10"
"$WORK_DIR/bin/seed_validated" -proof > "$RESULTS_DIR/seed.log" 2>&1
cat "$RESULTS_DIR/seed.log"

echo "Verifying initial monitor count and status..."
docker compose -f "$WORK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_proof -c \
    "SELECT monitor_type, status, count(*) FROM uptime_monitors GROUP BY monitor_type, status ORDER BY monitor_type;"

# Start engine for 2-minute proof of life
echo "Starting engine for 120s proof of life..."
cd "$WORK_DIR"
export DATABASE_URL="$UPTIMER_DB"
export DATABASE_URL_DIRECT="$UPTIMER_DB"
export DATABASE_URL_POOLED="$UPTIMER_DB"
export ENGINE_PORT="8080"
export METRICS_PORT="9090"
export DISPATCH_INTERVAL_MS="50"

"$WORK_DIR/bin/engine" > "$RESULTS_DIR/engine.log" 2>&1 &
ENGINE_PID=$!
echo "Engine running with PID $ENGINE_PID"

# Sleep for 120s with a heartbeat ping test midway
echo "Running for 120s... logging progress..."
for t in 15 30 45 60 75 90 105 120; do
    sleep 15
    echo "--- T+${t}s ---"
    docker compose -f "$WORK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_proof -c \
        "SELECT monitor_type, status, count(*) FROM uptime_monitors GROUP BY monitor_type, status ORDER BY monitor_type;"
done

echo "Stopping engine gracefully..."
kill -TERM "$ENGINE_PID" 2>/dev/null || true
wait "$ENGINE_PID" 2>/dev/null || true
echo "Engine stopped."

kill "$MOCK_PID" 2>/dev/null || true

echo "=== FINAL PROOF OF LIFE AUDIT ==="
echo "--- Monitor Status Summary ---"
docker compose -f "$WORK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_proof -c \
    "SELECT monitor_type, status, count(*) FROM uptime_monitors GROUP BY monitor_type, status ORDER BY monitor_type;"

echo "--- Daily Metrics Checks Log Summary ---"
docker compose -f "$WORK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_proof -c \
    "SELECT m.monitor_type, 
            count(d.monitor_id) as reporting_monitors,
            sum(d.total_checks) as total_checks, 
            sum(d.successful_checks) as successful_checks,
            sum(d.total_checks - d.successful_checks) as failed_checks
     FROM uptime_monitors m
     LEFT JOIN uptime_daily_metrics d ON m.id = d.monitor_id
     GROUP BY m.monitor_type
     ORDER BY m.monitor_type;"

echo "--- Open Incidents Summary ---"
docker compose -f "$WORK_DIR/compose/docker-compose.yml" exec -T pg15 psql -U engine -d uptimer_proof -c \
    "SELECT m.monitor_type, count(i.id) as open_incidents, i.cause, i.first_error_message
     FROM uptime_monitors m
     LEFT JOIN uptime_incidents i ON m.id = i.monitor_id AND i.resolved_at IS NULL
     GROUP BY m.monitor_type, i.cause, i.first_error_message
     ORDER BY m.monitor_type;"

echo "--- Engine Log Snippet (Last 40 lines) ---"
tail -n 40 "$RESULTS_DIR/engine.log"

echo "=== PROOF OF LIFE COMPLETE ==="
