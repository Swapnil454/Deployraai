#!/usr/bin/env bash
set -uo pipefail
ENG="$(cd "$(dirname "$0")/../.." && pwd)"
CC="clickhouse-client -u engine --password password"
IMG="${GATE_IMAGE:-golang:1.25}"
T=3200000
ts() { date -u +%FT%TZ; }
RUN=(docker run --network ch_cluster_net -v "$ENG:/engine" -v go-pkg-mod:/go/pkg/mod -v go-build-cache:/root/.cache/go-build -w /engine)
echo "=== GATE 3.1-A: 60s ClickHouse outage orchestrator (bash port) ==="
echo "Evidence label: single-Keeper, single-host Docker (WSL2), image $IMG"
docker start ch_node1 ch_node2 >/dev/null; sleep 3
echo "[$(ts)] warming Go build cache..."
"${RUN[@]}" --rm "$IMG" go build -tags killhook -o /dev/null ./loadtest/gate31a || { echo "FAIL: build"; exit 1; }
docker exec ch_node1 $CC --query "TRUNCATE TABLE default.uptime_checks_telemetry_harness"
docker exec ch_node2 $CC --query "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness"
sleep 1
docker rm -f gate31a_engine >/dev/null 2>&1
CID=$("${RUN[@]}" -d --name gate31a_engine --memory 4g "$IMG" bash -c "set -o pipefail; go run -tags killhook ./loadtest/gate31a/main.go --target-rows=$T | tee /engine/gate_31a_raw.log")
[ -n "$CID" ] || { echo "FAIL: container did not start"; exit 1; }
echo "[$(ts)] container started; phase 1 healthy 12s"
sleep 12
echo "[$(ts)] phase 2: stop ch_node2 (Code 285 expected) 30s"; docker stop ch_node2 >/dev/null; sleep 30
echo "[$(ts)] phase 3: stop ch_node1 (both down) 30s"; docker stop ch_node1 >/dev/null; sleep 30
echo "[$(ts)] phase 4: start ch_node1"; docker start ch_node1 >/dev/null; sleep 3
echo "[$(ts)] phase 4: start ch_node2"; docker start ch_node2 >/dev/null; sleep 4
echo "[$(ts)] phase 5: waiting for replay and sync"
RC=$(docker wait gate31a_engine)
echo "exit code: $RC"
docker logs gate31a_engine 2>&1 | tail -60
docker rm -f gate31a_engine >/dev/null 2>&1
if [ "$RC" = 0 ] && ! grep -q "VERDICT: Gate 3.1-A FAILED" ../../gate_31a_raw.log; then echo ">>> ORCHESTRATOR VERDICT: PASSED"; else echo ">>> ORCHESTRATOR VERDICT: FAILED"; fi
