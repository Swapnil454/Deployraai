param (
    [int]$SteadyStateSeconds = 25,
    [int]$WarmupSeconds = 8,
    [int]$Runs = 5
)

$ErrorActionPreference = "Continue"

function Get-AdminMetrics() {
    try {
        $raw = curl.exe -s -H "Authorization: Bearer brutal-soak-token" http://127.0.0.1:9101/metrics
        if ($raw) {
            $metrics = @{}
            foreach ($line in ($raw -split "`n")) {
                if ($line -match "^\s*([a-zA-Z0-9_]+)\s+([0-9\.]+)") {
                    $metrics[$Matches[1]] = [double]$Matches[2]
                }
            }
            return $metrics
        }
    } catch {}
    return $null
}

function Get-CgroupUsageUsec() {
    try {
        $cpuStat = docker exec brutal-engine cat /sys/fs/cgroup/cpu.stat 2>$null
        if ($cpuStat -and ($cpuStat -join "`n") -match "usage_usec\s+(\d+)") {
            return [int64]$Matches[1]
        }
    } catch {}
    return 0
}

function Run-SingleArm([string]$armName, [string]$binary, [string]$gogc, [string]$gomemlimit) {
    Write-Host "`n============================================================"
    Write-Host " BENCHMARKING ARM: $armName (binary=$binary, GOGC=$gogc, GOMEMLIMIT=$gomemlimit)"
    Write-Host "============================================================"

    $results = @()

    for ($i = 1; $i -le $Runs; $i++) {
        Write-Host "`n--- Run $i of $Runs for $armName ---"
        
        # Stop and recreate engine container
        docker rm -f brutal-engine 2>$null | Out-Null
        $env:ENGINE_BINARY = $binary
        $env:GOGC = $gogc
        $env:GOMEMLIMIT = $gomemlimit
        $env:GODEBUG = "gctrace=1"

        & docker-compose -f docker-compose.brutal.yml up -d engine 2>$null
        
        Write-Host "  Warming up for $WarmupSeconds seconds (excluding from steady-state)..."
        Start-Sleep -Seconds $WarmupSeconds

        # Sample at t0 (start of steady state)
        $t0Usec = Get-CgroupUsageUsec
        $t0Metrics = Get-AdminMetrics
        $t0Completed = if ($t0Metrics -and $t0Metrics.ContainsKey("checks_completed")) { [int64]$t0Metrics["checks_completed"] } else { 0 }
        $startT = Get-Date

        Write-Host "  Executing steady-state measurement for $SteadyStateSeconds seconds (t0_completed=$t0Completed, t0_usec=$t0Usec)..."
        Start-Sleep -Seconds $SteadyStateSeconds

        # Sample at t1 (end of steady state)
        $t1Usec = Get-CgroupUsageUsec
        $t1Metrics = Get-AdminMetrics
        $t1Completed = if ($t1Metrics -and $t1Metrics.ContainsKey("checks_completed")) { [int64]$t1Metrics["checks_completed"] } else { 0 }
        $endT = Get-Date

        $steadySec = ($endT - $startT).TotalSeconds
        $deltaCompleted = $t1Completed - $t0Completed
        $deltaUsec = $t1Usec - $t0Usec

        # Stop engine cleanly (SIGTERM -> 0 exit)
        docker stop -t 10 brutal-engine 2>$null | Out-Null

        # Read logs for lag and memory
        $logs = (docker logs brutal-engine 2>&1)

        # Parse LAG STATS (p99 dispatch lag) from t1Metrics or logs
        $p99Ms = 0.0
        if ($t1Metrics -and $t1Metrics.ContainsKey("p99_dispatch_lag_ms")) {
            $p99Ms = [double]$t1Metrics["p99_dispatch_lag_ms"]
        }
        if ($p99Ms -eq 0.0) {
            $lagLine = ($logs | Select-String "\[LAG STATS\]" | Select-Object -Last 1)
            if ($lagLine -match "p99:\s+([0-9\.]+)(us|ms|s)") {
                $val = [double]$Matches[1]
                $unit = $Matches[2]
                if ($unit -eq "s") { $p99Ms = $val * 1000.0 }
                elseif ($unit -eq "ms") { $p99Ms = $val }
                elseif ($unit -eq "us") { $p99Ms = $val / 1000.0 }
            }
        }

        # Parse final RSS from t1Metrics or PROCESS_STATS
        $rssMb = 0
        if ($t1Metrics -and $t1Metrics.ContainsKey("heap_sys_mb")) {
            $rssMb = [int]$t1Metrics["heap_sys_mb"]
        }
        if ($rssMb -eq 0) {
            $procLine = ($logs | Select-String "\[PROCESS_STATS\]" | Select-Object -Last 1)
            if ($procLine -match "heap_sys_mb=(\d+)") { $rssMb = [int]$Matches[1] }
        }

        # Parse final RUN_COUNTERS
        $runCounterLine = ($logs | Select-String "\[RUN_COUNTERS\]" | Select-Object -Last 1)
        $checksLate = 0
        $checksDropped = 0
        $finalGCShare = 0.0
        $gcSec = 0.0
        $userSec = 0.0
        $totSec = 0.0

        if ($runCounterLine -match "checks_late=(\d+)") { $checksLate = [int64]$Matches[1] }
        if ($runCounterLine -match "checks_dropped=(\d+)") { $checksDropped = [int64]$Matches[1] }
        if ($runCounterLine -match "gc_sec=([0-9\.]+)") { $gcSec = [double]$Matches[1] }
        if ($runCounterLine -match "user_sec=([0-9\.]+)") { $userSec = [double]$Matches[1] }
        if ($runCounterLine -match "tot_sec=([0-9\.]+)") { $totSec = [double]$Matches[1] }

        # Compute GC CPU share against total container CPU (including sys)
        if ($t1Usec -gt 0) {
            $totContainerCpuSec = $t1Usec / 1000000.0
            if ($totContainerCpuSec -gt 0) {
                $finalGCShare = ($gcSec / $totContainerCpuSec) * 100.0
            }
        }

        $steadyRate = if ($steadySec -gt 0) { [math]::Round($deltaCompleted / $steadySec, 1) } else { 0 }
        $cpuPerCheckUs = if ($deltaCompleted -gt 0 -and $deltaUsec -gt 0) { [math]::Round($deltaUsec / $deltaCompleted, 1) } else { 0 }

        $res = [PSCustomObject]@{
            Arm               = $armName
            Run               = $i
            SteadyCompleted   = $deltaCompleted
            ThroughputPerSec  = $steadyRate
            CPUPerCheckUs     = $cpuPerCheckUs
            P99DispatchLagMs  = [math]::Round($p99Ms, 2)
            RSSMb             = $rssMb
            TotalGCSharePct   = [math]::Round($finalGCShare, 2)
            ChecksLate        = $checksLate
            ChecksDropped     = $checksDropped
        }
        $results += $res

        Write-Host "  Result: SteadyCompleted=$deltaCompleted ($steadyRate/s), CPU/check=$cpuPerCheckUs us, P99Lag=$p99Ms ms, RSS=$rssMb MB, TotalGCShare=$([math]::Round($finalGCShare, 2)) %, Late=$checksLate, Dropped=$checksDropped"
    }

    return $results
}

# Run 4 Distinct Arms (5 runs each)
$arm1 = Run-SingleArm "Arm 1: Baseline (No-PGO, GOGC=100)" "./uptime-engine" "100" "1536MiB"
$arm2 = Run-SingleArm "Arm 2: SoftGC Only (No-PGO, GOGC=200)" "./uptime-engine" "200" "1536MiB"
$arm3 = Run-SingleArm "Arm 3: PGO Only (PGO, GOGC=100)" "./uptime-engine-pgo" "100" "1536MiB"
$arm4 = Run-SingleArm "Arm 4: PGO + SoftGC (PGO, GOGC=200)" "./uptime-engine-pgo" "200" "1536MiB"

Write-Host "`n============================================================"
Write-Host " ALL 4 ARMS COMPLETED - DETAILED SUMMARY"
Write-Host "============================================================"

$allRuns = @($arm1; $arm2; $arm3; $arm4)
$allRuns | Format-Table -AutoSize

# Statistical Helper
function Get-Stats($arr, [string]$field) {
    $vals = $arr | ForEach-Object { [double]$_.$field }
    $n = $vals.Count
    if ($n -eq 0) { return @{ Mean=0; StdDev=0 } }
    $sum = ($vals | Measure-Object -Sum).Sum
    $mean = $sum / $n
    $sumSq = 0
    foreach ($v in $vals) { $sumSq += [math]::Pow($v - $mean, 2) }
    $variance = if ($n -gt 1) { $sumSq / ($n - 1) } else { 0 }
    $stdDev = [math]::Sqrt($variance)
    return @{ Mean=[math]::Round($mean, 2); StdDev=[math]::Round($stdDev, 2) }
}

Write-Host "`n============================================================"
Write-Host " STATISTICAL AGGREGATES (MEAN ± STDDEV)"
Write-Host "============================================================"
$arms = @(
    @{ Name = "Arm 1: Baseline (No-PGO, GOGC=100)"; Data = $arm1 },
    @{ Name = "Arm 2: SoftGC Only (No-PGO, GOGC=200)"; Data = $arm2 },
    @{ Name = "Arm 3: PGO Only (PGO, GOGC=100)"; Data = $arm3 },
    @{ Name = "Arm 4: PGO + SoftGC (PGO, GOGC=200)"; Data = $arm4 }
)

$summaryRows = @()
foreach ($a in $arms) {
    $cpuStats = Get-Stats $a.Data "CPUPerCheckUs"
    $tpStats = Get-Stats $a.Data "ThroughputPerSec"
    $lagStats = Get-Stats $a.Data "P99DispatchLagMs"
    $gcStats = Get-Stats $a.Data "TotalGCSharePct"
    $rssStats = Get-Stats $a.Data "RSSMb"

    $summaryRows += [PSCustomObject]@{
        Arm               = $a.Name
        ThroughputPerSec  = "$($tpStats.Mean) ± $($tpStats.StdDev)"
        CPUPerCheckUs     = "$($cpuStats.Mean) ± $($cpuStats.StdDev)"
        P99DispatchLagMs  = "$($lagStats.Mean) ± $($lagStats.StdDev)"
        TotalGCSharePct   = "$($gcStats.Mean)% ± $($gcStats.StdDev)%"
        RSSMb             = "$($rssStats.Mean) ± $($rssStats.StdDev)"
    }
}
$summaryRows | Format-Table -AutoSize

# Save to JSON
$jsonObj = @{
    Arm1_Baseline    = $arm1
    Arm2_SoftGCOnly  = $arm2
    Arm3_PGOOnly     = $arm3
    Arm4_PGOSoftGC   = $arm4
    Summary          = $summaryRows
}
$jsonObj | ConvertTo-Json -Depth 5 | Out-File -FilePath "benchmark_4arms_results.json" -Encoding utf8
Write-Host "Results saved to benchmark_4arms_results.json"
