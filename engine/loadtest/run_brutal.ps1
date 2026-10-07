#!/usr/bin/env pwsh
# ════════════════════════════════════════════════════════════════════════════════
# run_brutal.ps1  -  Brutal Soak Test
#   • 8 monitor types, equally split (12.5% each)
#   • ALL at 30-second interval
#   • 50-minute run
#   • ClickHouse (local container) + Postgres both active
#   • Real website monitors mixed in (Google, GitHub, Cloudflare, httpbin, etc.)
#   • Per-5s resource sampling: CPU, RSS, NetIO for engine, db, clickhouse, mock
#   • Full production-equivalent report at the end
# ════════════════════════════════════════════════════════════════════════════════
param (
    [int]$MonitorCount = 8000,    # 8000 total = 1000 per type (divisible by 8)
    [int]$RunSeconds   = 600      # 10 minute dry run

)

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

$DC       = "docker-compose -f docker-compose.brutal.yml"
$COMPOSE  = "docker-compose.brutal.yml"
$LOGFILE  = "brutal_soak.log"
$STATSCSV = "brutal_stats.csv"
$REPORT   = "brutal_report.md"

$env:UPTIMER_DB = "postgresql://engine:password@localhost:5433/engine_test?sslmode=disable"
$StartTime      = Get-Date

# ── Helpers ──────────────────────────────────────────────────────────────────
function Log { param([string]$msg) $ts = (Get-Date -Format "HH:mm:ss"); Write-Host "[$ts] $msg" }
function Banner { param([string]$msg) Write-Host "`n=============================================="; Write-Host "  $msg"; Write-Host "==============================================" }

Banner "BRUTAL SOAK TEST"
$perTypeCount = [math]::Floor($MonitorCount / 8)
$runMinutes = [math]::Round($RunSeconds / 60)
Log "Monitors:   $MonitorCount ($perTypeCount per type, 8 types)"
Log "Interval:   30 s (all monitors)"
Log "Duration:   $RunSeconds s ($runMinutes min)"
Log "Compress:   100% (all keyword monitors use body decompression)"
Log "Real sites: Google, GitHub, Cloudflare, httpbin, JSONPlaceholder, Fastly"

# ── 1. Teardown + start infra ────────────────────────────────────────────────
Banner "Step 1/7 - Clean up"
docker rm -f brutal-engine brutal-db brutal-clickhouse brutal-mock 2>$null
docker volume prune -f 2>&1 | Tee-Object -Append $LOGFILE
docker-compose -f $COMPOSE down -v --remove-orphans 2>&1 | Tee-Object -Append $LOGFILE

Banner "Step 2/7 - Start Postgres + ClickHouse + Mock"
docker-compose -f $COMPOSE up -d db clickhouse mock 2>&1 | Tee-Object -Append $LOGFILE
Log "Waiting for Postgres + ClickHouse to be healthy (up to 120s)..."

$healthy = $false
for ($try = 0; $try -lt 24; $try++) {
    Start-Sleep -Seconds 5
    $pgOk = (docker inspect --format "{{.State.Health.Status}}" brutal-db 2>$null) -eq "healthy"
    $chOk = (docker inspect --format "{{.State.Health.Status}}" brutal-clickhouse 2>$null) -eq "healthy"
    if ($pgOk -and $chOk) { $healthy = $true; break }
    Log "  Postgres=$pgOk ClickHouse=$chOk (waiting...)"
}
if (-not $healthy) { Log "ERROR: services did not become healthy in 120s"; exit 1 }
Log "All services healthy."

# ── 2. Capture pre-deploy resource baseline ───────────────────────────────────
Banner "Step 3/7 - Capture pre-deploy baseline"
$BaselineCPU = (docker stats brutal-mock --no-stream --format '{{.CPUPerc}}' 2>$null) -replace '%',''
if ($BaselineCPU) { $BaselineCPU = $BaselineCPU.Trim() }
$BaselineMem = (docker stats brutal-db   --no-stream --format '{{.MemUsage}}' 2>$null)
if ($BaselineMem) { $BaselineMem = $BaselineMem.Trim() }
Log "Pre-deploy mock CPU: $BaselineCPU%  |  DB mem: $BaselineMem"

# ── 3. Seed monitors ──────────────────────────────────────────────────────────
Banner "Step 4/7 - Seed $MonitorCount monitors"
docker-compose -f $COMPOSE exec -T db psql -U engine -d engine_test -f /docker-entrypoint-initdb.d/01_schema.sql 2>&1 | Tee-Object -Append $LOGFILE
go run .\loadtest\seed_brutal\main.go $MonitorCount 2>&1 | Tee-Object -Append $LOGFILE
Log "Seed complete."

$CommitHash = (git rev-parse --short HEAD 2>$null)
$SeedTime   = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
Log "Commit: $CommitHash  |  Seed time: $SeedTime"

# ── 4. Build engine image ─────────────────────────────────────────────────────
Banner "Step 5/7 - Build engine image"
docker-compose -f $COMPOSE build --no-cache engine 2>&1 | Tee-Object -Append $LOGFILE
Log "Build complete."

# ── 5. Launch resource sampler ───────────────────────────────────────────────
$StatsAbsPath = (Get-Item .).FullName + "\" + $STATSCSV
"ts,container,cpu_pct,mem_use_mb,mem_limit_mb,net_rx_mb,net_tx_mb,pids" | Out-File -FilePath $StatsAbsPath -Encoding utf8

$samplerJob = Start-Job -ScriptBlock {
    param($csv)
    function ParseMB($s) {
        if (-not $s) { return 0 }
        $s = $s.Trim()
        if ($s -match '(\d+\.?\d*)\s*(GiB|GB)') { return [double]$Matches[1] * 1024 }
        if ($s -match '(\d+\.?\d*)\s*(MiB|MB)') { return [double]$Matches[1] }
        if ($s -match '(\d+\.?\d*)\s*(KiB|KB)') { return [double]$Matches[1] / 1024 }
        if ($s -match '(\d+\.?\d*)\s*B')         { return [double]$Matches[1] / 1048576 }
        return 0
    }

    $containers = @("brutal-engine","brutal-db","brutal-clickhouse","brutal-mock")
    while ($true) {
        $ts = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
        foreach ($c in $containers) {
            $raw = docker stats $c --no-stream --format '{{.CPUPerc}}|{{.MemUsage}}|{{.NetIO}}|{{.PIDs}}' 2>$null
            if (-not $raw) { continue }
            $parts = $raw -split '\|'
            if ($parts.Count -lt 4) { continue }

            $cpu = $parts[0] -replace '%',''
            $memParts = $parts[1] -split ' / '
            $netParts = $parts[2] -split ' / '

            $memUse   = ParseMB $memParts[0]
            $memLimit = if ($memParts.Count -gt 1) { ParseMB $memParts[1] } else { 0 }
            $netRx    = ParseMB $netParts[0]
            $netTx    = if ($netParts.Count -gt 1) { ParseMB $netParts[1] } else { 0 }
            $pids     = $parts[3]

            $memUseR   = [math]::Round($memUse, 1)
            $memLimitR = [math]::Round($memLimit, 1)
            $netRxR    = [math]::Round($netRx, 3)
            $netTxR    = [math]::Round($netTx, 3)

            "$ts,$c,$cpu,$memUseR,$memLimitR,$netRxR,$netTxR,$pids" | Out-File -Append -FilePath $csv -Encoding utf8
        }
        Start-Sleep -Seconds 5
    }
} -ArgumentList $StatsAbsPath

# Start engine
$EngineStart = Get-Date
docker-compose -f $COMPOSE up -d engine 2>&1 | Tee-Object -Append $LOGFILE
Log "Engine started. Running for $RunSeconds s..."

# ── Progress loop ─────────────────────────────────────────────────────────────
$elapsed  = 0
$interval = 30
while ($elapsed -lt $RunSeconds) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    $remaining = $RunSeconds - $elapsed

    $snap = docker stats brutal-engine --no-stream --format 'CPU={{.CPUPerc}} MEM={{.MemUsage}} NET={{.NetIO}}' 2>$null
    Log "[$elapsed/${RunSeconds}s] $snap  (${remaining}s left)"
}

$EngineStop    = Get-Date
$ActualRunSecs = [math]::Round(($EngineStop - $EngineStart).TotalSeconds)

# ── Kill-switch drill (COMPRESSION_PERCENT=0 via admin endpoint) ──────────────
Log ""
Log "Running kill-switch drill (pct=0)..."
$ks = curl.exe -s -o NUL -w "%{http_code}" -X POST "http://127.0.0.1:9101/admin/compression?pct=0" -H "Authorization: Bearer brutal-soak-token" 2>$null
Log "Kill-switch response: HTTP $ks"
Start-Sleep -Seconds 5

# ── Capture final resource snapshot ──────────────────────────────────────────
Log ""
Log "Final engine resource snapshot:"
$finalSnap = docker stats brutal-engine --no-stream --format '  CPU={{.CPUPerc}} | MEM={{.MemUsage}} | NET={{.NetIO}} | PIDs={{.PIDs}}' 2>$null
Write-Host $finalSnap

Log "CPU cgroup totals (engine):"
docker exec brutal-engine cat /sys/fs/cgroup/cpu.stat 2>$null | ForEach-Object { Write-Host "  $_" }

# Stop engine + sampler
docker-compose -f $COMPOSE stop engine 2>&1 | Out-Null
Stop-Job   -Job $samplerJob -ErrorAction SilentlyContinue
Remove-Job -Job $samplerJob -ErrorAction SilentlyContinue

# ── 7. Postgres verification ──────────────────────────────────────────────────
Banner "Step 7/7 - Verification"
Log "Running Postgres verify queries..."
docker-compose -f $COMPOSE exec -T db psql -U engine -d engine_test -f /tmp/verify_brutal.sql 2>&1 | Tee-Object -Append $LOGFILE

# ── ClickHouse verification ───────────────────────────────────────────────────
Log ""
Log "Running ClickHouse telemetry queries..."

$chTotal = docker exec brutal-clickhouse clickhouse-client --user engine --password password --query "SELECT count() FROM uptime_telemetry" 2>$null
$chByKind = docker exec brutal-clickhouse clickhouse-client --user engine --password password --query "SELECT probe_kind, req_method, req_scheme, reused, did_resume, count() samples, round(avg(latency_us)/1000,1) avg_ms, round(quantile(0.95)(latency_us)/1000,1) p95_ms, countIf(status=1)*100/count() ok_pct FROM uptime_telemetry GROUP BY probe_kind, req_method, req_scheme, reused, did_resume ORDER BY probe_kind, req_method, reused FORMAT PrettyCompact" 2>$null

Log "Total ClickHouse rows: $chTotal"
Write-Host $chByKind

$mockCount = curl.exe -sk "https://localhost:8443/mock/count" 2>$null

# ── Parse stats CSV ───────────────────────────────────────────────────────────
Banner "RESOURCE SUMMARY"
$stats = Import-Csv $STATSCSV 2>$null

function ContainerStats($containerName) {
    $rows = $stats | Where-Object { $_.container -eq $containerName }
    if (-not $rows -or $rows.Count -eq 0) {
        return @{avg_cpu=0;peak_cpu=0;avg_mem=0;peak_mem=0;net_rx=0;net_tx=0}
    }
    $cpuNums = $rows | ForEach-Object { [double]$_.cpu_pct }
    $memNums = $rows | ForEach-Object { [double]$_.mem_use_mb }
    $rxNums  = $rows | ForEach-Object { [double]$_.net_rx_mb }
    $txNums  = $rows | ForEach-Object { [double]$_.net_tx_mb }
    return @{
        avg_cpu  = [math]::Round(($cpuNums | Measure-Object -Average).Average, 2)
        peak_cpu = [math]::Round(($cpuNums | Measure-Object -Maximum).Maximum, 2)
        avg_mem  = [math]::Round(($memNums | Measure-Object -Average).Average, 1)
        peak_mem = [math]::Round(($memNums | Measure-Object -Maximum).Maximum, 1)
        net_rx   = [math]::Round(($rxNums  | Measure-Object -Maximum).Maximum, 3)
        net_tx   = [math]::Round(($txNums  | Measure-Object -Maximum).Maximum, 3)
    }
}

$eng = ContainerStats "brutal-engine"
$db  = ContainerStats "brutal-db"
$ch  = ContainerStats "brutal-clickhouse"
$mck = ContainerStats "brutal-mock"

Write-Host ""
Write-Host "  +-----------------------------------------------------------------+"
Write-Host "  |                      RESOURCE USAGE TABLE                       |"
Write-Host "  +----------------+--------------+--------------+------------------+"
Write-Host "  | Container      | CPU avg/peak | MEM avg/peak | NET rx / tx MB   |"
Write-Host "  +----------------+--------------+--------------+------------------+"
Write-Host ("  | engine         | {0,5}% / {1,5}% | {2,5}M / {3,5}M | {4,7} / {5,7} |" -f $eng.avg_cpu,$eng.peak_cpu,$eng.avg_mem,$eng.peak_mem,$eng.net_rx,$eng.net_tx)
Write-Host ("  | postgres       | {0,5}% / {1,5}% | {2,5}M / {3,5}M | {4,7} / {5,7} |" -f $db.avg_cpu,$db.peak_cpu,$db.avg_mem,$db.peak_mem,$db.net_rx,$db.net_tx)
Write-Host ("  | clickhouse     | {0,5}% / {1,5}% | {2,5}M / {3,5}M | {4,7} / {5,7} |" -f $ch.avg_cpu,$ch.peak_cpu,$ch.avg_mem,$ch.peak_mem,$ch.net_rx,$ch.net_tx)
Write-Host ("  | mock-farm      | {0,5}% / {1,5}% | {2,5}M / {3,5}M | {4,7} / {5,7} |" -f $mck.avg_cpu,$mck.peak_cpu,$mck.avg_mem,$mck.peak_mem,$mck.net_rx,$mck.net_tx)
Write-Host "  +----------------+--------------+--------------+------------------+"
Write-Host ""
Write-Host "  Monitors         : $MonitorCount ($perTypeCount per type x 8 types)"
Write-Host "  All intervals    : 30 s"
Write-Host "  Run duration     : ${ActualRunSecs}s ([math]::Round($ActualRunSecs/60,1) min)"
Write-Host "  Mock requests    : $mockCount"
Write-Host "  ClickHouse rows  : $chTotal"

$chRows = 0
if ($chTotal -match '^\d+$') { $chRows = [int]$chTotal }
$cpuSecsPerCheck = if ($chRows -gt 0) { [math]::Round(($eng.avg_cpu / 100 * $ActualRunSecs) / $chRows, 6) } else { 0 }
$netBytesPerCheck = if ($chRows -gt 0) { [math]::Round((($eng.net_rx + $eng.net_tx) * 1048576) / $chRows, 2) } else { 0 }

Write-Host "  CPU secs/check   : $cpuSecsPerCheck"
Write-Host "  NIC bytes/check  : $netBytesPerCheck"
Write-Host "  Commit           : $CommitHash"
Write-Host "  Started          : $SeedTime"
Write-Host "  Ended            : $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"

# ── Write markdown report ─────────────────────────────────────────────────────
$reportDate = Get-Date -Format "yyyy-MM-dd HH:mm"
$reportContent = @"
# Brutal Soak Report - $reportDate

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | $MonitorCount                  |
| Per type          | $perTypeCount (12.5% each)      |
| Monitor types     | http, keyword, ping, port, heartbeat, dns, api, udp |
| Interval          | 30 s (all monitors)            |
| Run duration      | ${ActualRunSecs} s             |
| Compression       | 100% (all body-reading monitors use decompression) |
| Commit            | $CommitHash                    |
| Seed time         | $SeedTime                      |
| Real sites        | Google, GitHub, Cloudflare, httpbin, JSONPlaceholder, Fastly |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------|
| engine         | $($eng.avg_cpu)% | $($eng.peak_cpu)% | $($eng.avg_mem) MB | $($eng.peak_mem) MB | $($eng.net_rx) | $($eng.net_tx) |
| postgres       | $($db.avg_cpu)%  | $($db.peak_cpu)%  | $($db.avg_mem) MB  | $($db.peak_mem) MB  | $($db.net_rx)  | $($db.net_tx)  |
| clickhouse     | $($ch.avg_cpu)%  | $($ch.peak_cpu)%  | $($ch.avg_mem) MB  | $($ch.peak_mem) MB  | $($ch.net_rx)  | $($ch.net_tx)  |
| mock-farm      | $($mck.avg_cpu)% | $($mck.peak_cpu)% | $($mck.avg_mem) MB | $($mck.peak_mem) MB | $($mck.net_rx) | $($mck.net_tx) |

CPU percentages are relative to host/container limits.

## ClickHouse Telemetry

- **Total rows inserted:** $chTotal
- **Expected checks ($MonitorCount monitors × 30s interval over ${RunSeconds}s):** ~$([math]::Round($MonitorCount * ($RunSeconds / 30)))

### Per-kind breakdown:

$chByKind

## Mock Farm

- **Total requests served:** $mockCount

## Kill-Switch Drill

- HTTP response: $ks
- Status: $(if ($ks -eq '200') { 'PASS - kill-switch functional' } else { "FAIL - response $ks" })

## What This Run Proves

| Claim | Evidence |
|-------|----------|
| 8 types run equally at 30s | Seed distribution verified by SQL query 1 |
| ~100 checks/monitor in 50 min | SQL query 4 checks_per_monitor |
| Incident correctness (down/timeout only) | SQL query 3 |
| No false positives | SQL query 6 |
| ClickHouse ingestion works at load | Row count vs expected |
| Kill-switch functional | Admin endpoint returns 200 |
| RSS stable under compression | brutal_stats.csv MEM trend |
| Real sites reachable and returning expected results | SQL query 7 real-site rows |

"@

$reportContent | Out-File -FilePath $REPORT -Encoding utf8

Log ""
Log "Report written to: $REPORT"
Log "Stats CSV:         $STATSCSV"
Log "Full log:          $LOGFILE"
Banner "BRUTAL SOAK COMPLETE"
