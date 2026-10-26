#!/usr/bin/env bash
set -uo pipefail
ENG="$(cd "$(dirname "$0")/.." && pwd)"
IMG="${GATE_IMAGE:-golang:1.25}"
mkdir -p "$ENG/rc_artifacts"
RUN=(docker run --rm --network ch_cluster_net -e ALLOW_TEST_CLICKHOUSE=1 -e CLICKHOUSE_HOST=ch_node1 -v "$ENG:/engine" -v go-pkg-mod:/go/pkg/mod -v go-build-cache:/root/.cache/go-build -w /engine --memory 4g --cap-add NET_ADMIN)
docker start ch_node1 ch_node2 >/dev/null 2>&1
run_gate() {
  local name="$1" tgt="$2" log="$ENG/rc_artifacts/gate_${1}_raw.log"
  echo "[$(date -u +%T)] >>> Gate $name"
  timeout 40m "${RUN[@]}" "$IMG" bash -c "set -o pipefail; go run -tags killhook $tgt 2>&1 | tee /engine/rc_artifacts/gate_${name}_raw.log" >/dev/null 2>&1
  local rc=$?
  local v; v=$(grep -a "VERDICT" "$log" 2>/dev/null | tail -1 | cut -c1-120)
  echo "[$(date -u +%T)] gate $name: rc=$rc | ${v:-no VERDICT line}"
}
[ -z "${ONLY:-}" -o "${ONLY:-}" = 31b ] && run_gate 31b ./loadtest/gate31b/main.go
[ -z "${ONLY:-}" -o "${ONLY:-}" = 31c ] && run_gate 31c ./loadtest/gate31c/gate31c_runner.go
[ -z "${ONLY:-}" -o "${ONLY:-}" = 31c2 ] && run_gate 31c2 ./loadtest/gate31c2/main.go
[ -z "${ONLY:-}" -o "${ONLY:-}" = 31e ] && run_gate 31e ./loadtest/gate31e/main.go
[ -z "${ONLY:-}" -o "${ONLY:-}" = 31f ] && run_gate 31f ./loadtest/gate31f/main.go
echo ALL-DONE
