#!/usr/bin/env bash
set -eo pipefail

echo "================================================================================"
echo "    MASTER 3.1 RELEASE CANDIDATE VERIFICATION SUITE                             "
echo "    Release Candidate SHA: $(git rev-parse HEAD)                                "
echo "    Environment: single-Keeper, single-host Docker on Windows host             "
echo "================================================================================"

mkdir -p /engine/rc_artifacts

run_gate() {
    local name="$1"
    local cmd="$2"
    local logfile="/engine/rc_artifacts/gate_${name}_raw.log"
    echo ""
    echo ">>> Running Gate ${name}..."
    eval "$cmd" | tee "$logfile"
    local hash=$(sha256sum "$logfile" | awk '{print $1}')
    echo ">>> Gate ${name} finished. SHA-256: ${hash}"
}

echo "=== Shipped Constants ==="
echo "ClickHouseFlushTimeout: 2s"
echo "BreakerDialProbeTimeout: 500ms"
echo "DefaultReplayBatchesPerSec: 10"
echo "QuarantineBackoffWindow: 10m"
echo "QuarantineThreshold: 3"
echo "========================="

# 1. Gate 3.1-A
run_gate "31a" "go run -tags killhook ./loadtest/gate31a/main.go"

# 2. Gate 3.1-B
run_gate "31b" "go run -tags killhook ./loadtest/gate31b/main.go"

# 3. Gate 3.1-C
run_gate "31c" "go run -tags killhook ./loadtest/gate31c/gate31c_runner.go"

# 4. Gate 3.1-C2
run_gate "31c2" "go run -tags killhook ./loadtest/gate31c2/main.go"

# 5. Gate 3.1-E
run_gate "31e" "go run -tags killhook ./loadtest/gate31e/main.go"

# 6. Gate 3.1-F
run_gate "31f" "go run -tags killhook ./loadtest/gate31f/main.go"

# 7. Gate D (-race -count=20)
echo ""
echo ">>> Running Gate D: -race -count=20 suite..."
go test -race -count=20 -v -json ./core ./netsec > /engine/rc_artifacts/gate_d_race_count20.json
sha256sum /engine/rc_artifacts/gate_d_race_count20.json

echo ""
echo "================================================================================"
echo "    ALL 3.1 GATES EXECUTED ON RELEASE CANDIDATE                                 "
echo "================================================================================"
sha256sum /engine/rc_artifacts/*
