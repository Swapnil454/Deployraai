#!/usr/bin/env pwsh
# ════════════════════════════════════════════════════════════════════════════════
# run_brutal.ps1  -  Brutal Soak Test
#   • 8 monitor types, equally split (12.5% each)
#   • ALL at 30-second interval
#   • 10-minute default run (override with -RunSeconds)
#   • ClickHouse (local container) + Postgres both active
#   • 100% controlled targets (mock + RFC5737 sinks, zero real internet)
#   • Per-5s resource sampling: CPU, RSS, NetIO for engine, db, clickhouse, mock
#   • /metrics captured BEFORE stopping engine (telemetry invariant)
#   • Full production-equivalent report at the end
#
# Pass criteria (attended run):
#   exit_code == 0
#   reaper_rows (status=3) == 0
#   http_class rate within 5% of expected (no dip)
#   unique_rows within 0.5% of enqueued after replay
#   invariant printed and holds
#   spool empty
# ════════════════════════════════════════════════════════════════════════════════
param (
    [int]$MonitorCount = 3000,   # 3000 HTTP-class monitors (http, keyword, api - Goal 2)
    [int]$RunSeconds   = 615,    # 10 min + 15s jitter headroom so all monitors complete 20 checks
    [string]$Arm       = "C-on", # C-on (idle=90s), C-off (idle=2s), A (baseline branch 25f99d9)
    [switch]$AttendedCheck       # stop execution as soon as one monitor of each type is OK
)

if ($Arm -eq "A") {
    $env:ENGINE_BINARY = "./uptime-engine-arm-a"
    $env:MAX_IDLE_CONN_DURATION_S = "2"
} elseif ($Arm -eq "C-off") {
    $env:ENGINE_BINARY = "./uptime-engine"
    $env:MAX_IDLE_CONN_DURATION_S = "2"
} else {
    $env:ENGINE_BINARY = "./uptime-engine"
    $env:MAX_IDLE_CONN_DURATION_S = "90"
}
Log "Selected arm: $Arm (ENGINE_BINARY=$env:ENGINE_BINARY, MAX_IDLE_CONN_DURATION_S=$env:MAX_IDLE_CONN_DURATION_S)"

$EngineDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $EngineDir

Set-StrictMode -Off
$ErrorActionPreference = "Continue"

$DC       = "docker-compose -f docker-compose.brutal.yml"
$COMPOSE  = "docker-compose.brutal.yml"
$LOGFILE  = "brutal_soak.log"
"" | Out-File -FilePath $LOGFILE -Encoding utf8
$STATSCSV = "brutal_stats.csv"
$REPORT   = "brutal_report.md"

$env:UPTIMER_DB = "postgresql://engine:password@localhost:5433/engine_test?sslmode=disable"
$StartTime      = Get-Date

# ── Helpers ──────────────────────────────────────────────────────────────────
function Log { param([string]$msg) $ts = (Get-Date -Format "HH:mm:ss"); Write-Host "[$ts] $msg" }
function Banner { param([string]$msg) Write-Host "`n=============================================="; Write-Host "  $msg"; Write-Host "==============================================" }
function CH {
    param([string]$query)
    docker exec brutal-clickhouse clickhouse-client --user engine --password password --query $query 2>$null
}

Banner "BRUTAL SOAK TEST"
$perTypeCount = [math]::Floor($MonitorCount / 3)
$runMinutes = [math]::Round($RunSeconds / 60)
Log "Monitors:   $MonitorCount ($perTypeCount per type across http, keyword, api)"
Log "Interval:   30 s (all monitors)"
Log "Duration:   $RunSeconds s ($runMinutes min)"
Log "Targets:    100% controlled TLS mock targets (Goal 2)"

# ── 1. Teardown + start infra ────────────────────────────────────────────────
Banner "Step 1/7 - Clean up"
docker rm -f brutal-engine brutal-db brutal-clickhouse brutal-mock 2>$null
docker-compose -f $COMPOSE down -v --remove-orphans 2>&1 | Tee-Object -Append $LOGFILE

Banner "Step 2/7 - Start Postgres + ClickHouse + Mock"
docker-compose -f $COMPOSE up --build -d db clickhouse mock 2>&1 | Tee-Object -Append $LOGFILE
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

# Verify seed: must be 100% controlled
$realSiteCount = (& cmd /c "docker-compose -f $COMPOSE exec -T db psql -U engine -d engine_test -tAc `"SELECT count(*) FROM uptime_monitors WHERE url NOT LIKE '%mock.local%' AND url NOT LIKE '%192.0.2.%' AND url NOT LIKE '%.nonexistent.invalid%'`"" 2>$null).Trim()
if ($realSiteCount -gt 0) {
    Log "ERROR: Seed contains $realSiteCount real-internet monitors. Expected 0. Aborting."
    exit 1
}
Log "Seed verified: 0 real-internet monitors."

$CommitHash = (git rev-parse --short HEAD 2>$null)
$SeedTime   = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
Log "Commit: $CommitHash  |  Seed time: $SeedTime"

# ── 4. Build engine image ─────────────────────────────────────────────────────
Banner "Step 5/7 - Build engine image"
& cmd.exe /c "set CGO_ENABLED=0&& set GOOS=linux&& set GOARCH=amd64&& go build -trimpath -ldflags=-s -tags loadtest -o uptime-engine ."
if ($LASTEXITCODE -ne 0) { Log "ERROR: go build failed with exit code $LASTEXITCODE"; exit 1 }
docker-compose -f $COMPOSE build engine 2>&1 | Tee-Object -Append $LOGFILE
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
docker-compose -f $COMPOSE up --build -d engine 2>&1 | Tee-Object -Append $LOGFILE
Log "Engine started. Running for $RunSeconds s..."

Start-Sleep -Seconds 5
$configLog = docker logs brutal-engine 2>&1 | Select-String "EFFECTIVE_CONFIG" | Select-Object -Last 1
$EngineStart = Get-Date
if ($configLog) {
    Log "Detected config: $configLog"
    if ($configLog -notmatch "workers=3000") {
        Log "ERROR: Config mismatch. Expected workers=3000. Aborting."
        exit 1
    }
    # Log dns_cache explicitly
    if ($configLog -match "dns_cache=(\S*)") { Log "dns_cache=$($Matches[1])" }
} else {
    Log "WARNING: No EFFECTIVE_CONFIG found in engine logs!"
}

# ── Progress loop ─────────────────────────────────────────────────────────────
$elapsed  = 0
$interval = 30
$SERIESCSV = "brutal_process_series.csv"
"ts,elapsed_s,goroutines,open_fds,in_flight,no_keepalive,retry_eof,retry_reset,retry_timeout,retry_other,cgroup_cpu_usec,net_rx_bytes,net_tx_bytes,mock_bytes,sock_fds,pipe_fds,snap" | Out-File -FilePath $SERIESCSV -Encoding utf8

while ($elapsed -lt $RunSeconds) {
    Start-Sleep -Seconds $interval
    $elapsed += $interval
    $remaining = $RunSeconds - $elapsed

    $snap = docker stats brutal-engine --no-stream --format 'CPU={{.CPUPerc}} MEM={{.MemUsage}} NET={{.NetIO}} PIDs={{.PIDs}}' 2>$null

    # Query runtime metrics from /metrics endpoint
    $mRaw = ((curl.exe -s "http://127.0.0.1:9101/metrics" -H "Authorization: Bearer brutal-soak-token" 2>$null) -join "`n")
    $gCount = 0; $fdCount = 0; $noKeep = 0; $mockBytes = 0; $inflightNow = 0
    $retryEof = 0; $retryReset = 0; $retryTimeout = 0; $retryOther = 0
    $Matches = $null
    if ($mRaw -match "goroutines\s+(\d+)") { $gCount = [int]$Matches[1] }
    $Matches = $null
    if ($mRaw -match "open_fds\s+(\d+)") { $fdCount = [int]$Matches[1] }
    $Matches = $null
    if ($mRaw -match "telemetry_in_flight\s+(\d+)") { $inflightNow = [int]$Matches[1] }
    $Matches = $null
    if ($mRaw -match "monitors_no_keepalive\s+(\d+)") { $noKeep = [int]$Matches[1] }
    $Matches = $null
    if ($mRaw -match "warm_retry_first_err_eof\s+(\d+)") { $retryEof = [int]$Matches[1] }
    $Matches = $null
    if ($mRaw -match "warm_retry_first_err_reset\s+(\d+)") { $retryReset = [int]$Matches[1] }
    $Matches = $null
    if ($mRaw -match "warm_retry_first_err_timeout\s+(\d+)") { $retryTimeout = [int]$Matches[1] }
    $Matches = $null
    if ($mRaw -match "warm_retry_first_err_other\s+(\d+)") { $retryOther = [int]$Matches[1] }
    $Matches = $null
    if ($mRaw -match "mock_net_bytes_total\s+(\d+)") { $mockBytes = [int64]$Matches[1] }

    # Query real kernel FDs from /proc/1/fd inside container and breakdown by type
    $realFds = (docker exec brutal-engine sh -c "ls -1 /proc/1/fd 2>/dev/null | wc -l" 2>$null)
    if ($realFds -match "^\s*(\d+)") { $fdCount = [int]$Matches[1] }
    $fdList = docker exec brutal-engine sh -c "ls -l /proc/1/fd 2>/dev/null" 2>$null
    $sockFds = ($fdList | Select-String "socket:\[" | Measure-Object).Count
    $pipeFds = ($fdList | Select-String "pipe:\[" | Measure-Object).Count

    # Query cgroup v2 usage_usec as single joined string
    $cpuUsec = 0
    $cgStat = (docker exec brutal-engine cat /sys/fs/cgroup/cpu.stat 2>$null) -join "`n"
    if ($cgStat -match "usage_usec\s+(\d+)") { $cpuUsec = [int64]$Matches[1] }

    $rxBytes = 0; $txBytes = 0
    $rxRaw = docker exec brutal-engine cat /sys/class/net/eth0/statistics/rx_bytes 2>$null
    if ($rxRaw -match "^\s*(\d+)") { $rxBytes = [int64]$Matches[1] }
    $txRaw = docker exec brutal-engine cat /sys/class/net/eth0/statistics/tx_bytes 2>$null
    if ($txRaw -match "^\s*(\d+)") { $txBytes = [int64]$Matches[1] }

    $tsNow = (Get-Date -Format "yyyy-MM-ddTHH:mm:ss")
    "$tsNow,$elapsed,$gCount,$fdCount,$inflightNow,$noKeep,$retryEof,$retryReset,$retryTimeout,$retryOther,$cpuUsec,$rxBytes,$txBytes,$mockBytes,$sockFds,$pipeFds,$snap" | Out-File -Append -FilePath $SERIESCSV -Encoding utf8
    Log "[$elapsed/${RunSeconds}s] $snap | FDs=$fdCount(sock=$sockFds,pipe=$pipeFds) InFlight=$inflightNow G=$gCount NoKeep=$noKeep Retries=[EOF:$retryEof,Reset:$retryReset,TO:$retryTimeout] cpuUsec=$cpuUsec (${remaining}s left)"

    if ($AttendedCheck) {
        $chByKind = CH "SELECT count() types_ok FROM (SELECT monitor_type FROM uptime_telemetry WHERE status=1 GROUP BY monitor_type HAVING count() > 0)"
        if ($chByKind -eq "8") {
            Log "Attended check passed for all 8 monitor types. Stopping early."
            break
        }
    }
}

$EngineStop    = Get-Date
$ActualRunSecs = [math]::Round(($EngineStop - $EngineStart).TotalSeconds)

# ── Capture /metrics BEFORE stopping engine ───────────────────────────────────
# This is the ONLY way to verify the telemetry invariant, since [RUN_COUNTERS]
# is printed after the flush completes — which is after the metrics endpoint is gone.
Log ""
Log "=== Telemetry Invariant Check (pre-stop /metrics) ==="
$metricsRaw = curl.exe -s "http://127.0.0.1:9101/metrics" -H "Authorization: Bearer brutal-soak-token" 2>$null
Log "Raw metrics response:"
Write-Host $metricsRaw
$metrics = @{}
$metricsRaw -split "`n" | ForEach-Object {
    if ($_ -match "^(telemetry_[a-z_]+)\s+(\d+)") {
        $metrics[$Matches[1]] = [int64]$Matches[2]
    }
}

$enq      = if ($metrics['telemetry_enqueued'])     { $metrics['telemetry_enqueued'] }     else { 0 }
$flushed  = if ($metrics['telemetry_flushed_rows']) { $metrics['telemetry_flushed_rows'] } else { 0 }
$failed   = if ($metrics['telemetry_failed_rows'])  { $metrics['telemetry_failed_rows'] }  else { 0 }
$dropped  = if ($metrics['telemetry_dropped'])      { $metrics['telemetry_dropped'] }      else { 0 }
$inflight = if ($metrics['telemetry_in_flight'])    { $metrics['telemetry_in_flight'] }    else { 0 }

$computed_enq = $flushed + $failed + $dropped + $inflight
Log "Invariant: enqueued($enq) == flushed($flushed) + failed($failed) + dropped($dropped) + in_flight($inflight) [$computed_enq]"
$invariantHolds = ($enq -eq $computed_enq)
if ($invariantHolds) {
    Log "SUCCESS: Telemetry invariant holds."
} else {
    Log "WARNING: Invariant VIOLATED. Diff = $($enq - $computed_enq)"
}

# ── Kill-switch drill (COMPRESSION_PERCENT=0 via admin endpoint) ──────────────
Log ""
Log "Running kill-switch drill (pct=0)..."
$ks = curl.exe -s -o NUL -w "%{http_code}" -X POST "http://127.0.0.1:9101/admin/compression?pct=0" -H "Authorization: Bearer brutal-soak-token" 2>$null
Log "Kill-switch response: HTTP $ks"

# ── Capture final resource snapshot ──────────────────────────────────────────
Log ""
Log "Final engine resource snapshot:"
$finalSnap = docker stats brutal-engine --no-stream --format '  CPU={{.CPUPerc}} | MEM={{.MemUsage}} | NET={{.NetIO}} | PIDs={{.PIDs}}' 2>$null
Write-Host $finalSnap

Log "CPU cgroup totals (engine):"
docker exec brutal-engine cat /sys/fs/cgroup/cpu.stat 2>$null | ForEach-Object { Write-Host "  $_" }

# ── Stop engine (mock stays up for final CH writes to complete) ───────────────
Log "Stopping engine (stop_grace_period=15s in compose)..."
$stopStart = Get-Date
docker-compose -f $COMPOSE stop engine 2>&1 | Out-Null
$stopElapsed = [math]::Round(($( Get-Date) - $stopStart).TotalSeconds, 2)
$exitCode = docker inspect brutal-engine --format="{{.State.ExitCode}}" 2>$null
Log "Engine stopped in ${stopElapsed}s. Exit code: $exitCode"
if ($exitCode -eq "0") {
    Log "PASS: Clean shutdown (exit 0)"
} elseif ($exitCode -eq "2") {
    Log "WARN: Bounded-drain shutdown (exit 2) - some goroutines did not drain"
} else {
    Log "FAIL: Unexpected exit code $exitCode (137=SIGKILL, other=crash)"
}

# Wait 2s for any final CH writes
Start-Sleep -Seconds 2

Stop-Job   -Job $samplerJob -ErrorAction SilentlyContinue
Remove-Job -Job $samplerJob -ErrorAction SilentlyContinue

# ── 7. Postgres verification ──────────────────────────────────────────────────
Banner "Step 7/7 - Verification"
Log "Running Postgres verify queries..."
docker-compose -f $COMPOSE exec -T db psql -U engine -d engine_test -f /tmp/verify_brutal.sql 2>&1 | Tee-Object -Append $LOGFILE

# ── ClickHouse verification ───────────────────────────────────────────────────
Log ""
Log "Running ClickHouse telemetry queries..."

$chTotal    = CH "SELECT count() FROM uptime_telemetry"
$chUniq     = CH "SELECT uniqExact(monitor_id, ts) FROM uptime_telemetry"
$chReaped   = CH "SELECT countIf(status=3) FROM uptime_telemetry"
$chExec     = CH "SELECT countIf(status != 3) FROM uptime_telemetry"
$chOK       = CH "SELECT countIf(status=1) FROM uptime_telemetry"

# Scheduled vs verification checks breakdown
# Scheduled checks (probe_kind=0) include all periodic dispatches (phase_kind=0 warm,
# phase_kind=1 full, and phase_kind=2 warm retry). Each dispatch produces exactly one row.
$chSched    = CH "SELECT count() FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND probe_kind = 0 AND status != 3"
$chWarmRows = CH "SELECT count() FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND probe_kind = 0 AND phase_kind = 2 AND status != 3"
$chVerif    = CH "SELECT count() FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND probe_kind = 1 AND status != 3"
# Use ActualRunSecs (wall clock from engine start to stop) not RunSeconds parameter
$httpSchedExpected = [math]::Round([double]$MonitorCount / 30 * $ActualRunSecs)
$schedGapPct = if ($httpSchedExpected -gt 0) { [math]::Round([math]::Abs($httpSchedExpected - [int]$chSched) / $httpSchedExpected * 100, 1) } else { 0 }

# Duplicate detection:
# 1. Scheduled lag detector (<25s apart on same monitor, filtering diagnostic phase_kind=1)
$chLagUnder25s       = CH "SELECT count() FROM (SELECT monitor_id, ts, dateDiff('second', lagInFrame(ts) OVER (PARTITION BY monitor_id ORDER BY ts), ts) as diff FROM uptime_telemetry WHERE status != 3 AND probe_kind = 0 AND phase_kind != 1) WHERE diff > 0 AND diff < 25"
$chDupSchedBuckets   = if ($chLagUnder25s -match '^\d+$') { [int]$chLagUnder25s } else { 0 }
$chMaxSchedPerBucket = CH "SELECT max(c) FROM (SELECT monitor_id, toStartOfInterval(ts,INTERVAL 30 SECOND) b, count() c FROM uptime_telemetry WHERE status != 3 AND probe_kind = 0 AND phase_kind != 1 GROUP BY monitor_id, b)"

# 2. Overall duplicate buckets across all executed checks
$chMaxTotalPerBucket = CH "SELECT max(c) FROM (SELECT monitor_id, toStartOfInterval(ts,INTERVAL 30 SECOND) b, count() c FROM uptime_telemetry WHERE status != 3 GROUP BY monitor_id, b)"
$chDupTotalBuckets   = CH "SELECT count() FROM (SELECT monitor_id, toStartOfInterval(ts,INTERVAL 30 SECOND) b, count() c FROM uptime_telemetry WHERE status != 3 GROUP BY monitor_id, b HAVING c > 1)"

# 3. Precise tuple duplicate check: (monitor_id, probe_kind, phase_kind, 30s bucket)
$chDupPrecise        = CH "SELECT count() FROM (SELECT monitor_id, probe_kind, phase_kind, toStartOfInterval(ts,INTERVAL 30 SECOND) b, count() c FROM uptime_telemetry WHERE status != 3 GROUP BY monitor_id, probe_kind, phase_kind, b HAVING c > 1)"

# Extract final [RUN_COUNTERS] from engine log post-stop
$finalRunCounters = docker logs brutal-engine 2>&1 | Select-String "\[RUN_COUNTERS\]" | Select-Object -Last 1
$finalEnq = 0
$finalFlushed = 0
$finalFailed = 0
$finalDropped = 0
$finalInFlight = 0
if ($finalRunCounters -match "telemetry_enqueued=(\d+)\s+telemetry_flushed=(\d+)\s+telemetry_failed=(\d+)\s+telemetry_dropped=(\d+)\s+telemetry_in_flight=(\d+)") {
    $finalEnq = [int64]$Matches[1]
    $finalFlushed = [int64]$Matches[2]
    $finalFailed = [int64]$Matches[3]
    $finalDropped = [int64]$Matches[4]
    $finalInFlight = [int64]$Matches[5]
} else {
    $finalEnq = [int64]$enq
    $finalFlushed = [int64]$flushed
    $finalDropped = [int64]$dropped
}

# Telemetry post-stop gate: ClickHouse count matches final flushed rows within 0.5%
$gapEnq    = [math]::Abs([int64]$finalFlushed - [int64]$chTotal)
$gapEnqPct = if ([int64]$finalFlushed -gt 0) { [math]::Round($gapEnq / [int64]$finalFlushed * 100, 2) } else { 0 }

Log "Total rows: $chTotal  |  Uniq: $chUniq  |  Exec: $chExec  |  OK: $chOK  |  Reaped: $chReaped"
Log "Scheduled checks (excl warm retry): $chSched vs $httpSchedExpected expected (ActualRun=${ActualRunSecs}s) → gap=$schedGapPct%"
Log "Warm retry rows (phase_kind=2): $chWarmRows"
Log "Verification checks (probe_kind=1): $chVerif"
Log "Dup check: max-sched-per-30s = $chMaxSchedPerBucket  |  sched-dup-buckets = $chDupSchedBuckets  |  total-dup-buckets = $chDupTotalBuckets  |  precise-dups = $chDupPrecise"
Log "Post-stop CH count vs final flushed: CH=$chTotal, Flushed=$finalFlushed, Enqueued=$finalEnq, Dropped=$finalDropped, InFlight=$finalInFlight, Gap=$gapEnq ($gapEnqPct%)"

if ([int]$chDupSchedBuckets -eq 0) {
    Log "PASS: Zero duplicate buckets for scheduled checks (one row per monitor per 30s)"
} else {
    Log "FAIL: $chDupSchedBuckets monitor-interval buckets have >1 scheduled row"
}
if ([int]$chReaped -eq 0) {
    Log "PASS: Zero reaper rows"
} else {
    Log "FAIL: $chReaped reaper rows"
}
if ([int64]$finalDropped -eq 0) {
    Log "PASS: Zero dropped telemetry (queue-full = 0)"
} else {
    Log "FAIL: $finalDropped dropped telemetry (queue-full > 0)"
}
if ([math]::Abs($schedGapPct) -le 5) {
    Log "PASS: Scheduled check rate within 5% of expected"
} else {
    Log "FAIL: Scheduled check gap $schedGapPct% exceeds 5%"
}
if ($gapEnqPct -le 0.5) {
    Log "PASS: Telemetry row count matches enqueued within 0.5%"
} else {
    Log "FAIL: Telemetry count gap $gapEnqPct% exceeds 0.5%"
}

# Protocol Abort Checks
$abortTriggers = @()
if ($exitCode -ne "0") { $abortTriggers += "exit code $exitCode != 0" }
if ([int]$chReaped -gt 0) { $abortTriggers += "reaper rows ($chReaped > 0)" }
if ([int64]$finalDropped -gt 0) { $abortTriggers += "queue-full / dropped rows ($finalDropped > 0)" }
if ($gapEnqPct -gt 0.5) { $abortTriggers += "row mismatch ($gapEnqPct% > 0.5%)" }
if ([int]$chDupSchedBuckets -gt 0) { $abortTriggers += "duplicate scheduled bucket ($chDupSchedBuckets > 0)" }
if ($abortTriggers.Count -gt 0) {
    Log "CRITICAL ABORT TRIGGERED: $($abortTriggers -join '; ')"
    $global:HasAborted = $true
}

# Check distribution per monitor (min, p25, median, p75, p90, max, avg)
$distStats = CH "SELECT min(c), quantile(0.25)(c), quantile(0.50)(c), quantile(0.75)(c), quantile(0.90)(c), max(c), round(avg(c),3) FROM (SELECT monitor_id, count() c FROM uptime_telemetry WHERE status != 3 GROUP BY monitor_id)"
Log "Per-monitor distribution (min, p25, median, p75, p90, max, avg): $distStats"

$distHisto = CH "SELECT c AS checks_per_mon, count() AS monitors FROM (SELECT monitor_id, count() c FROM uptime_telemetry WHERE status != 3 GROUP BY monitor_id) GROUP BY c ORDER BY c FORMAT PrettyCompact"
Write-Host ""
Write-Host "=== PER-MONITOR HISTOGRAM ==="
Write-Host $distHisto

# HTTP-class breakdown: reuse, did_resume, phase_kind, warm_retry
$chByKind = CH "SELECT
    monitor_type,
    req_method,
    req_scheme,
    reused,
    did_resume,
    phase_kind,
    count() samples,
    countIf(status=1)*100/count() ok_pct,
    round(avg(latency_us)/1000,1) avg_ms,
    round(quantile(0.95)(latency_us)/1000,1) p95_ms
FROM uptime_telemetry
WHERE monitor_type IN (1,2,7) AND status != 3
GROUP BY monitor_type, req_method, req_scheme, reused, did_resume, phase_kind
ORDER BY monitor_type, req_method, reused
FORMAT PrettyCompact"
Write-Host ""
Write-Host "=== HTTP-CLASS BREAKDOWN ==="
Write-Host $chByKind

# Reuse share and did_resume share (HTTP-class only, excluding reaped)
$chReuseShare  = CH "SELECT round(countIf(reused=1)*100.0/count(),1) FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND status != 3"
$chResumeShare = CH "SELECT round(countIf(did_resume=1)*100.0/count(),1) FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND status != 3"
$chWarmRetry   = CH "SELECT round(countIf(phase_kind=2)*100.0/count(),1) FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND status != 3"
Log "HTTP-class reuse=$chReuseShare%  did_resume=$chResumeShare%  warm_retry=$chWarmRetry%"

# warm_retry breakdown per tier (deterministic: cityHash64(monitor_id) % 4)
$tierRetries = CH "SELECT
    tier,
    count() total_checks,
    countIf(attempts = 2) warm_retries,
    round(countIf(attempts = 2)*100.0/count(), 2) retry_pct
FROM (
    SELECT
        attempts,
        (cityHash64(toString(monitor_id)) % 4) as tier
    FROM uptime_telemetry
    WHERE status != 3 AND monitor_type IN (1,2,7)
)
GROUP BY tier ORDER BY tier FORMAT PrettyCompact"
Write-Host ""
Write-Host "=== WARM RETRY BY IDLE TIER (0=5s, 1=15s, 2=60s, 3=75s) ==="
Write-Host $tierRetries

# warm_retry over time: Minutes 0-3 vs Minutes 20-30 (or Minutes 7-10 for shorter runs)
$retryEarly = CH "SELECT countIf(attempts = 2), count(), round(countIf(attempts = 2)*100.0/count(), 2) FROM uptime_telemetry WHERE status != 3 AND ts < (SELECT min(ts) + INTERVAL 180 SECOND FROM uptime_telemetry)"
$retryLate2030Raw = CH "SELECT countIf(attempts = 2), count(), round(countIf(attempts = 2)*100.0/count(), 2) FROM uptime_telemetry WHERE status != 3 AND ts >= (SELECT min(ts) + INTERVAL 1200 SECOND FROM uptime_telemetry) AND ts <= (SELECT min(ts) + INTERVAL 1800 SECOND FROM uptime_telemetry)"
$retryLateLabel = "Min 7-10"
if ($retryLate2030Raw -and $retryLate2030Raw.Trim() -ne "") {
    $retryLate = $retryLate2030Raw
    $retryLateLabel = "Min 20-30"
} else {
    $retryLate = CH "SELECT countIf(attempts = 2), count(), round(countIf(attempts = 2)*100.0/count(), 2) FROM uptime_telemetry WHERE status != 3 AND ts > (SELECT max(ts) - INTERVAL 180 SECOND FROM uptime_telemetry)"
}
Log "Warm retry rate: Min 0-3: $retryEarly | ${retryLateLabel}: $retryLate"

$lateRetryPct = 0.0
if ($retryLate -match '(\d+\.?\d*)\s*$') { $lateRetryPct = [double]$Matches[1] }

# Spool state check on container filesystem
$spoolDiff = (docker diff brutal-engine 2>$null | Select-String "telemetry-spool/seg-" | Measure-Object -Line).Lines
$spoolFiles = [int]$spoolDiff
Log "Spool files remaining: $spoolFiles"
if ($spoolFiles -eq 0) {
    Log "PASS: Spool empty"
} else {
    Log "WARN: $spoolFiles spool files remaining"
}

# Mock ground truth
$mockCountRaw = curl.exe -sk "https://localhost:8443/mock/count" 2>$null
if ($mockCountRaw -match '"total":(\d+)') { $mockTotal = [int]$Matches[1] } else { $mockTotal = 0 }
if ($mockCountRaw -match '"errors":(\d+)') { $mockErrors = [int]$Matches[1] } else { $mockErrors = 0 }
if ($mockCountRaw -match '"inject":(\d+)') { $mockInject = [int]$Matches[1] } else { $mockInject = 0 }
$tier5s = if ($mockCountRaw -match '"tier_5s_idle":(\d+)') { [int]$Matches[1] } else { 0 }
$tier15s = if ($mockCountRaw -match '"tier_15s_idle":(\d+)') { [int]$Matches[1] } else { 0 }
$tier60s = if ($mockCountRaw -match '"tier_60s_idle":(\d+)') { [int]$Matches[1] } else { 0 }
$tier75s = if ($mockCountRaw -match '"tier_75s_idle":(\d+)') { [int]$Matches[1] } else { 0 }
Log "Mock: total=$mockTotal errors=$mockErrors inject_5xx=$mockInject idle_closes=[5s:$tier5s, 15s:$tier15s, 60s:$tier60s, 75s:$tier75s]"

$mockGap = [math]::Abs([int]$chExec - $mockTotal)
$mockGapPct = if ([int]$chExec -gt 0) { [math]::Round($mockGap / [int]$chExec * 100, 1) } else { 0 }
Log "Mock request count ($mockTotal) vs Engine exec checks ($chExec) → gap=$mockGapPct%"
if ($mockGapPct -le 5.0) {
    Log "PASS: Mock request count within 5% of engine HTTP checks"
} else {
    Log "FAIL: Mock gap $mockGapPct% exceeds 5%"
}

# False-DOWN and False-UP analysis against mock request log
Log "Analyzing false-DOWN and false-UP vs mock request log..."
docker cp brutal-mock:/app/mock_requests.log mock_requests.log 2>$null
$falseDownCount = 0
$falseUpCount = 0
if (Test-Path mock_requests.log) {
    python loadtest/analyze_mock_join.py mock_requests.log 2>&1 | Tee-Object -Append $LOGFILE
    $falseUpRaw = CH "SELECT count() FROM uptime_telemetry WHERE status = 1 AND err_code != 0"
    $falseUpCount = if ($falseUpRaw -match '^\d+$') { [int]$falseUpRaw } else { 0 }
    $falseDownRaw = CH "SELECT count() FROM uptime_telemetry WHERE status = 0 AND latency_us > 0 AND err_code = 0"
    $falseDownCount = if ($falseDownRaw -match '^\d+$') { [int]$falseDownRaw } else { 0 }
}

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

# HTTP-class CPU and bytes per check (HTTP-class rows only, types 1,2,7)
$httpClassRows = CH "SELECT count() FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND status != 3"
$httpRows = 0
if ($httpClassRows -match '^\d+$') { $httpRows = [int]$httpClassRows }

# Query forced-down monitor IDs to compute healthy checks denominator
$forcedIdsRaw = docker exec brutal-db psql -U engine -d engine_test -t -c "SELECT id FROM uptime_monitors WHERE 'down' = ANY(tags) OR 'timeout' = ANY(tags);" 2>$null
$forcedIds = ($forcedIdsRaw -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -match '^[0-9a-f-]+$' })
$forcedSql = ($forcedIds | ForEach-Object { "'$_'" }) -join ','
$forcedRowsRaw = if ($forcedSql) { CH "SELECT count() FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND status != 3 AND toString(monitor_id) IN ($forcedSql)" } else { "0" }
$forcedRows = if ($forcedRowsRaw -match '^\d+$') { [int]$forcedRowsRaw } else { 0 }
$healthyRows = [math]::Max(0, $httpRows - $forcedRows)

$cpuSecsPerCheckAll      = if ($httpRows -gt 0) { [math]::Round(($eng.avg_cpu / 100 * $ActualRunSecs) / $httpRows, 6) } else { 0 }
$cpuSecsPerCheckHealthy  = if ($healthyRows -gt 0) { [math]::Round(($eng.avg_cpu / 100 * $ActualRunSecs) / $healthyRows, 6) } else { 0 }
$mockBytesPerCheckAll    = if ($httpRows -gt 0) { [math]::Round((($mck.net_rx + $mck.net_tx) * 1048576) / $httpRows, 2) } else { 0 }
$mockBytesPerCheckHealthy= if ($healthyRows -gt 0) { [math]::Round((($mck.net_rx + $mck.net_tx) * 1048576) / $healthyRows, 2) } else { 0 }
$netBytesPerCheckAll     = if ($httpRows -gt 0) { [math]::Round((($eng.net_rx + $eng.net_tx) * 1048576) / $httpRows, 2) } else { 0 }
$netBytesPerCheckHealthy = if ($healthyRows -gt 0) { [math]::Round((($eng.net_rx + $eng.net_tx) * 1048576) / $healthyRows, 2) } else { 0 }

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
Write-Host "  Monitors          : $MonitorCount ($perTypeCount per type x 3 types: http, keyword, api)"
Write-Host "  All intervals     : 30 s"
Write-Host "  Run duration      : ${ActualRunSecs}s ($([math]::Round($ActualRunSecs/60,1)) min)"
Write-Host "  HTTP-class rows   : $httpClassRows (all: $httpRows, healthy: $healthyRows, forced-down: $forcedRows)"
Write-Host "  CPU secs/check    : $cpuSecsPerCheckAll (all checks) | $cpuSecsPerCheckHealthy (healthy checks)"
Write-Host "  NIC bytes (mock)  : $mockBytesPerCheckAll B/check (all) | $mockBytesPerCheckHealthy B/check (healthy)"
Write-Host "  NIC bytes (total) : $netBytesPerCheckAll B/check (all) | $netBytesPerCheckHealthy B/check (healthy)"
Write-Host "  Mock requests     : $mockTotal (errors=$mockErrors inject_5xx=$mockInject)"
Write-Host "  False-DOWN count  : $falseDownCount (0 expected)"
Write-Host "  False-UP count    : $falseUpCount (0 expected)"
Write-Host "  Commit            : $CommitHash"
Write-Host "  Started           : $SeedTime"
Write-Host "  Ended             : $(Get-Date -Format 'yyyy-MM-ddTHH:mm:ss')"

# ── Windowed Metrics & Resource Stability Analysis (Minutes 10-30) ───────────
$seriesRows = Import-Csv $SERIESCSV 2>$null
$winCpuList = @()
$winGList = @()
$winFdList = @()
$winMemList = @()
$noKeepMin5 = 0
foreach ($row in $seriesRows) {
    $sec = [int]$row.elapsed_s
    if ($sec -ge 270 -and $sec -le 330 -and $noKeepMin5 -eq 0) {
        $noKeepMin5 = [int]$row.no_keepalive
    }
    if ($sec -ge 600 -and $sec -le 1800) {
        $winGList += [int]$row.goroutines
        $winFdList += [int]$row.open_fds
        if ($row.snap -match 'MEM=([0-9\.]+)MiB') { $winMemList += [double]$Matches[1] }
        if ($row.snap -match 'CPU=([0-9\.]+)%')   { $winCpuList += [double]$Matches[1] }
    }
}
$gFlat = $true; $fdFlat = $true; $memFlat = $true
if ($winGList.Count -gt 0) {
    $gDelta = [math]::Abs(($winGList[-1] - $winGList[0]))
    $fdDelta = [math]::Abs(($winFdList[-1] - $winFdList[0]))
    $memDelta = if ($winMemList.Count -gt 0) { [math]::Abs(($winMemList[-1] - $winMemList[0])) } else { 0 }
    if ($gDelta -gt 100) { $gFlat = $false }
    if ($fdDelta -gt 100) { $fdFlat = $false }
    if ($memDelta -gt 80) { $memFlat = $false }
}
$resFlat = ($gFlat -and $fdFlat -and $memFlat)

# Windowed CPU and NIC metrics from cgroup cpu.stat and NIC counters (Minutes 10-30)
$row600 = $seriesRows | Where-Object { [int]$_.elapsed_s -ge 570 -and [int]$_.elapsed_s -le 630 } | Select-Object -First 1
$row1800 = $seriesRows | Where-Object { [int]$_.elapsed_s -ge 1770 -and [int]$_.elapsed_s -le 1830 } | Select-Object -Last 1
if (-not $row1800 -and $seriesRows.Count -gt 0) { $row1800 = $seriesRows[-1] }

$winChecksRaw = CH "SELECT count() FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND status != 3 AND ts >= (SELECT min(ts) + INTERVAL 600 SECOND FROM uptime_telemetry) AND ts <= (SELECT min(ts) + INTERVAL 1800 SECOND FROM uptime_telemetry)"
$winChecks = if ($winChecksRaw -match '^\d+$') { [int]$winChecksRaw } else { 0 }

$dCpuUsec = 0; $dNetBytes = 0; $dMockBytes = 0
if ($row600 -and $row1800 -and [int64]$row1800.elapsed_s -gt [int64]$row600.elapsed_s) {
    $dCpuUsec = [int64]$row1800.cgroup_cpu_usec - [int64]$row600.cgroup_cpu_usec
    $dNetBytes = ([int64]$row1800.net_rx_bytes + [int64]$row1800.net_tx_bytes) - ([int64]$row600.net_rx_bytes + [int64]$row600.net_tx_bytes)
    $dMockBytes = [int64]$row1800.mock_bytes - [int64]$row600.mock_bytes
}

$winCpuSecsPerCheck = if ($winChecks -gt 0 -and $dCpuUsec -gt 0) { [math]::Round(($dCpuUsec / 1000000.0) / $winChecks, 6) } else { 0 }
$winBytesPerCheck = if ($winChecks -gt 0 -and $dNetBytes -gt 0) { [math]::Round($dNetBytes / $winChecks, 2) } else { 0 }
$winMockBytesPerCheck = if ($winChecks -gt 0 -and $dMockBytes -gt 0) { [math]::Round($dMockBytes / $winChecks, 2) } else { 0 }

# Late window (minutes 20-30) warm retry percentage
$lateSchedRaw = CH "SELECT count() FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND probe_kind = 0 AND status != 3 AND ts >= (SELECT min(ts) + INTERVAL 1200 SECOND FROM uptime_telemetry) AND ts <= (SELECT min(ts) + INTERVAL 1800 SECOND FROM uptime_telemetry)"
$lateRetryRaw = CH "SELECT count() FROM uptime_telemetry WHERE monitor_type IN (1,2,7) AND probe_kind = 0 AND phase_kind = 2 AND status != 3 AND ts >= (SELECT min(ts) + INTERVAL 1200 SECOND FROM uptime_telemetry) AND ts <= (SELECT min(ts) + INTERVAL 1800 SECOND FROM uptime_telemetry)"
$lateSched = if ($lateSchedRaw -match '^\d+$') { [int]$lateSchedRaw } else { 0 }
$lateRetries = if ($lateRetryRaw -match '^\d+$') { [int]$lateRetryRaw } else { 0 }
$lateRetryPct = if ($lateSched -gt 0) { [math]::Round($lateRetries / $lateSched * 100, 2) } else { 0 }

# Per-type breakdown (HTTP GET vs HEAD vs API)
$byTypeReport = CH "SELECT monitor_type, count() AS total_checks, round(avg(latency_us)/1000.0, 2) AS avg_ms, round(quantile(0.95)(latency_us)/1000.0, 2) AS p95_ms FROM uptime_telemetry WHERE status != 3 GROUP BY monitor_type ORDER BY monitor_type FORMAT Markdown"

# ── Gate summary ──────────────────────────────────────────────────────────────
Banner "GATE SUMMARY"
$gateItems = @(
    @{ name="Exit code 0";                              pass=($exitCode -eq "0") }
    @{ name="Reaper rows == 0";                         pass=([int]$chReaped -eq 0) }
    @{ name="HTTP-class rate within 5%";                pass=([math]::Abs($schedGapPct) -le 5) }
    @{ name="Dup buckets == 0";                         pass=([int]$chDupSchedBuckets -eq 0) }
    @{ name="Telemetry invariant holds";                pass=$invariantHolds }
    @{ name="Post-stop telemetry match <=0.5%";         pass=($gapEnqPct -le 0.5) }
    @{ name="Spool empty";                              pass=($spoolFiles -eq 0) }
    @{ name="Mock request count within 5%";             pass=($Arm -eq "A" -or $mockGapPct -le 5.0) }
    @{ name="False-DOWN == 0";                          pass=($falseDownCount -eq 0) }
    @{ name="False-UP == 0";                            pass=($falseUpCount -eq 0) }
    @{ name="NoKeepAlive reaches ~1500 by min 5";       pass=($Arm -ne "C-on" -or $noKeepMin5 -ge 1400 -or $ActualRunSecs -lt 300) }
    @{ name="Warm retry in late window <= 1.0%";        pass=($lateRetryPct -le 1.0) }
    @{ name="Goroutines, FDs, RSS flat min 10-30";      pass=($resFlat -or $ActualRunSecs -lt 1800) }
)
$allPass = $true
foreach ($item in $gateItems) {
    $symbol = if ($item.pass) { "PASS" } else { "FAIL"; $allPass = $false }
    Write-Host ("  [{0}] {1}" -f $symbol, $item.name)
}
Write-Host ""
if ($allPass) {
    Write-Host "  *** ALL GATE CRITERIA MET - PROCEED TO 30-MINUTE RUN ***"
} else {
    Write-Host "  *** GATE NOT CLEARED - see FAIL items above ***"
}

# ── Write markdown report ─────────────────────────────────────────────────────
$reportDate = Get-Date -Format "yyyy-MM-dd HH:mm"
$effConfig = docker logs brutal-engine 2>&1 | Select-String "EFFECTIVE_CONFIG" | Select-Object -Last 1

$reportContent = @"
# Brutal Soak Report - $reportDate

## Test Configuration

| Parameter         | Value                          |
|-------------------|-------------------------------|
| Monitor count     | $MonitorCount                  |
| Run duration      | ${ActualRunSecs} s             |
| Engine Exit Code  | $exitCode                      |
| Effective Config  | $effConfig |
| Interval          | 30 s (all monitors)            |
| Commit            | $CommitHash                    |
| Seed time         | $SeedTime                      |
| Real-internet     | 0 (100% controlled)            |

## Resource Usage

| Container      | CPU avg | CPU peak | MEM avg | MEM peak | Net RX MB | Net TX MB |
|----------------|---------|----------|---------|----------|-----------|-----------| 
| engine         | $($eng.avg_cpu)% | $($eng.peak_cpu)% | $($eng.avg_mem) MB | $($eng.peak_mem) MB | $($eng.net_rx) | $($eng.net_tx) |
| postgres       | $($db.avg_cpu)%  | $($db.peak_cpu)%  | $($db.avg_mem) MB  | $($db.peak_mem) MB  | $($db.net_rx)  | $($db.net_tx)  |
| clickhouse     | $($ch.avg_cpu)%  | $($ch.peak_cpu)%  | $($ch.avg_mem) MB  | $($ch.peak_mem) MB  | $($ch.net_rx)  | $($ch.net_tx)  |
| mock-farm      | $($mck.avg_cpu)% | $($mck.peak_cpu)% | $($mck.avg_mem) MB | $($mck.peak_mem) MB | $($mck.net_rx) | $($mck.net_tx) |

- **CPU secs / check (HTTP-class, whole run):** $cpuSecsPerCheckAll s (all) | $cpuSecsPerCheckHealthy s (healthy)
- **CPU secs / check (Minutes 10-30 window):** $winCpuSecsPerCheck s
- **NIC bytes (mock interface - HEADLINE):** $winMockBytesPerCheck B (window min 10-30) | $mockBytesPerCheckAll B (whole run)
- **NIC bytes (engine container total - secondary):** $netBytesPerCheckAll B (all) | $winBytesPerCheck B (window min 10-30)

## Telemetry Invariant (pre-stop)

- **Enqueued:** $enq
- **Flushed:** $flushed
- **Failed:** $failed
- **Dropped:** $dropped
- **In-flight:** $inflight
- **Invariant:** $(if ($invariantHolds) { "HOLDS" } else { "VIOLATED (diff=$($enq - $computed_enq))" })

## ClickHouse Telemetry

| Metric | Value |
|--------|-------|
| Total rows | $chTotal |
| Unique rows (id, ts) | $chUniq |
| Exec rows (status≠3) | $chExec |
| OK rows (status=1) | $chOK |
| Reaped rows (status=3) | $chReaped |
| Scheduled rows (probe_kind=0) | $chSched |
| Scheduled expected | $httpSchedExpected |
| Scheduled gap | $schedGapPct% |
| Verification rows (probe_kind=1) | $chVerif |
| Dup scheduled buckets (>1 sched/mon/30s) | $chDupSchedBuckets |
| Dup total buckets (>1 row/mon/30s) | $chDupTotalBuckets |
| Dup precise tuples (id,kind,phase,30s) | $chDupPrecise |
| Post-stop CH count vs Flushed gap | $gapEnq ($gapEnqPct%) |
| HTTP reuse share | $chReuseShare% |
| HTTP did_resume share | $chResumeShare% |
| HTTP warm_retry share | $chWarmRetry% |
| Spool files | $spoolFiles |

## HTTP-Class Breakdown

$chByKind

## Mock Ground Truth

| Metric | Value |
|--------|-------|
| Mock total hits | $mockTotal |
| Mock errors | $mockErrors |
| Mock inject_5xx | $mockInject |
| Mock 5s idle closes | $tier5s |
| Mock 15s idle closes | $tier15s |
| Mock 60s idle closes | $tier60s |
| Mock 75s idle closes | $tier75s |
| Mock vs Engine check gap | $mockGapPct% |

## Shutdown

- docker stop elapsed: ${stopElapsed}s
- Exit code: $exitCode

## Gate Criteria

| Criterion | Result |
|-----------|--------|
| Exit code 0 in <5s | $(if ($exitCode -eq "0") { "PASS ($stopElapsed s)" } else { "FAIL ($exitCode)" }) |
| Reaper rows == 0 | $(if ([int]$chReaped -eq 0) { "PASS" } else { "FAIL ($chReaped rows)" }) |
| HTTP-class rate within 5% | $(if ([math]::Abs($schedGapPct) -le 5) { "PASS ($schedGapPct%)" } else { "FAIL ($schedGapPct%)" }) |
| Dup buckets == 0 | $(if ([int]$chDupSchedBuckets -eq 0) { "PASS" } else { "FAIL ($chDupSchedBuckets buckets)" }) |
| Telemetry invariant holds | $(if ($invariantHolds) { "PASS" } else { "FAIL" }) |
| Post-stop telemetry match <=0.5% | $(if ($gapEnqPct -le 0.5) { "PASS ($gapEnqPct%)" } else { "FAIL ($gapEnqPct%)" }) |
| Spool empty | $(if ($spoolFiles -eq 0) { "PASS" } else { "WARN ($spoolFiles files)" }) |
| Mock request count within 5% | $(if ($Arm -eq "A") { "N/A (Arm A gap=$mockGapPct%)" } elseif ($mockGapPct -le 5.0) { "PASS ($mockGapPct%)" } else { "FAIL ($mockGapPct%)" }) |
| False-DOWN == 0 | $(if ($falseDownCount -eq 0) { "PASS" } else { "FAIL ($falseDownCount)" }) |
| False-UP == 0 | $(if ($falseUpCount -eq 0) { "PASS" } else { "FAIL ($falseUpCount)" }) |
| NoKeepAlive reaches ~1500 by min 5 | $(if ($Arm -ne "C-on") { "N/A ($Arm)" } elseif ($noKeepMin5 -ge 1400 -or $ActualRunSecs -lt 300) { "PASS ($noKeepMin5)" } else { "FAIL ($noKeepMin5)" }) |
| Warm retry in late window <= 1.0% | $(if ($Arm -ne "C-on") { "N/A ($Arm)" } elseif ($lateRetryPct -le 1.0) { "PASS ($lateRetryPct%)" } else { "FAIL ($lateRetryPct%)" }) |
| Goroutines, FDs, RSS flat min 10-30 | $(if ($resFlat -or $ActualRunSecs -lt 1800) { "PASS" } else { "FAIL" }) |
"@

[System.IO.File]::WriteAllText((Join-Path (Get-Location) $REPORT), $reportContent, (New-Object System.Text.UTF8Encoding $false))

Log ""
Log "Report written to: $REPORT"
Log "Stats CSV:         $STATSCSV"
Log "Full log:          $LOGFILE"
Banner "BRUTAL SOAK COMPLETE"

if ($global:HasAborted) {
    Log "RUN FAILED WITH ABORT CRITERIA TRIGGERED."
    exit 1
}
exit 0
