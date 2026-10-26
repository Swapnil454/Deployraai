Write-Host "================================================================================"
Write-Host "    STARTING GATE 3.1-A: 60s CLICKHOUSE OUTAGE ORCHESTRATOR                     "
Write-Host "    Evidence Label: single-Keeper, single-host Docker                          "
Write-Host "================================================================================"

# 1. Ensure both ClickHouse nodes are started
docker start ch_node1 | Out-Null
docker start ch_node2 | Out-Null
Start-Sleep -Seconds 3

# 2. Truncate table on both nodes to start clean
Write-Host "[Orchestrator] Truncating harness table on both nodes..."
docker exec ch_node1 clickhouse-client -u engine --password password --query "TRUNCATE TABLE default.uptime_checks_telemetry_harness"
docker exec ch_node2 clickhouse-client -u engine --password password --query "SYSTEM SYNC REPLICA default.uptime_checks_telemetry_harness"
Start-Sleep -Seconds 1

# Remove any existing container
docker rm -f gate31a_engine 2>$null | Out-Null

$targetRows = 3200000
Write-Host "[Orchestrator] Launching engine stream at 33,333 checks/s in detached container (Target: $targetRows checks)..."
$containerId = docker run -d --name gate31a_engine --network ch_cluster_net -v "C:\mini Desktop\AI_Agents\engine:/engine" -v go-pkg-mod:/go/pkg/mod -v go-build-cache:/root/.cache/go-build -w /engine engine-ci:latest bash -c "set -o pipefail; go run -tags killhook ./loadtest/gate31a/main.go --target-rows=$targetRows | tee /engine/gate_31a_raw.log"

if (-not $containerId) {
    Write-Host "Failed to start gate31a_engine container!" -ForegroundColor Red
    exit 1
}
Write-Host "[Orchestrator] Container started: $containerId"

# Phase 1: Healthy ingestion (12s ~ 400k rows directly flushed with insert_quorum=2)
$p1Start = [DateTime]::UtcNow.ToString("o")
Write-Host "[Orchestrator] [$p1Start] Phase 1: Healthy ingestion for 12 seconds..."
Start-Sleep -Seconds 12

# Phase 2: Single-replica outage (ch_node2 down for 30s)
$p2Start = [DateTime]::UtcNow.ToString("o")
Write-Host "[Orchestrator] [$p2Start] >>> Phase 2: Stopping single replica ch_node2 (quorum failure Code 285 expected)..."
docker stop ch_node2
Start-Sleep -Seconds 30

# Phase 3: Both-replica outage (ch_node1 down for 30s)
$p3Start = [DateTime]::UtcNow.ToString("o")
Write-Host "[Orchestrator] [$p3Start] >>> Phase 3: Stopping ch_node1 (both replicas down, connection refused)..."
docker stop ch_node1
Start-Sleep -Seconds 30

# Phase 4: Cluster restore
$p4StartNode1 = [DateTime]::UtcNow.ToString("o")
Write-Host "[Orchestrator] [$p4StartNode1] >>> Phase 4: Restoring cluster: Starting ch_node1..."
docker start ch_node1
Start-Sleep -Seconds 3

$p4StartNode2 = [DateTime]::UtcNow.ToString("o")
Write-Host "[Orchestrator] [$p4StartNode2] >>> Phase 4: Restoring cluster: Starting ch_node2..."
docker start ch_node2
Start-Sleep -Seconds 4

# Phase 5: Live Ingestion + Concurrent Replay
$p5Start = [DateTime]::UtcNow.ToString("o")
Write-Host "[Orchestrator] [$p5Start] Cluster restored. Waiting for engine replayer to complete concurrent recovery and replica sync..."
$exitCode = docker wait gate31a_engine
Write-Host "[Orchestrator] Engine run completed with exit code: $exitCode"

# Dump container logs to host stdout
docker logs gate31a_engine

docker rm -f gate31a_engine 2>$null | Out-Null

if ($exitCode -ne 0) {
    Write-Host ">>> VERDICT: Gate 3.1-A FAILED" -ForegroundColor Red
    exit 1
} else {
    Write-Host ">>> VERDICT: Gate 3.1-A PASSED" -ForegroundColor Green
    exit 0
}
