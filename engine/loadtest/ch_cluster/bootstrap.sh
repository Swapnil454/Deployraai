#!/usr/bin/env bash
set -uo pipefail
cd "$(dirname "$0")"
CC="clickhouse-client -u engine --password password"
Q1="INSERT INTO default.uptime_checks_telemetry_harness (monitor_id,checked_at) SETTINGS insert_quorum=2 VALUES (generateUUIDv4(), now64(3))"
wait_node() {
  for i in $(seq 1 60); do
    docker exec $1 $CC -q "SELECT 1" >/dev/null 2>&1 && return 0
    sleep 2
  done
  return 1
}
docker compose up -d || { echo "FAIL: compose up"; exit 1; }
for n in ch_node1 ch_node2; do
  wait_node $n || { echo "FAIL: $n not ready"; docker logs --tail 15 $n; docker logs --tail 15 ch_keeper; exit 1; }
done
echo "PASS: both nodes up"
python3 ddl.py ../../../server/src/uptime-cron/clickhouseSchema.js uptime_checks_telemetry_harness > harness.sql || { echo "FAIL: ddl"; exit 1; }
for n in ch_node1 ch_node2; do
  docker exec -i $n $CC --multiquery < harness.sql || { echo "FAIL: create on $n"; exit 1; }
done
echo "PASS: table created on both replicas"
docker exec ch_node1 $CC -q "ALTER TABLE default.uptime_checks_telemetry_harness ADD COLUMN IF NOT EXISTS run_id UUID ALIAS monitor_id, ADD COLUMN IF NOT EXISTS probe_seq UInt64 ALIAS generation" || { echo "FAIL: alias columns"; exit 1; }
docker exec ch_node2 $CC -q "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness"
echo "PASS: test-only alias columns run_id->monitor_id, probe_seq->generation"
R="SELECT replica_name,is_readonly,total_replicas,active_replicas FROM system.replicas WHERE table='uptime_checks_telemetry_harness' FORMAT TSV"
docker exec ch_node1 $CC -q "$R"
docker exec ch_node2 $CC -q "$R"
docker exec ch_node1 $CC -q "$Q1" && echo "PASS: quorum insert" || echo "FAIL: quorum insert"
docker exec ch_node2 $CC -q "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness"
N=$(docker exec ch_node2 $CC -q "SELECT count() FROM default.uptime_checks_telemetry_harness")
[ "$N" = 1 ] && echo "PASS: replicated, node2 sees 1 row" || echo "FAIL: node2 count=$N"
docker stop ch_node2 >/dev/null
OUT=$(docker exec ch_node1 $CC -q "$Q1" 2>&1 || true)
if echo "$OUT" | grep -q "285\|TOO_FEW_LIVE_REPLICAS"; then echo "PASS: Code 285 with one replica down"; else echo "FAIL: expected 285, got: ${OUT:0:200}"; fi
docker start ch_node2 >/dev/null
wait_node ch_node2 || { echo "FAIL: ch_node2 did not restart"; exit 1; }
docker exec ch_node2 $CC -q "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness"
docker exec ch_node1 $CC -q "TRUNCATE TABLE default.uptime_checks_telemetry_harness"
echo "BOOTSTRAP-DONE"
