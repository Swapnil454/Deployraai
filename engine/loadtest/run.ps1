param (
    [int]$Count = 35000,
    [int]$RunSeconds = 300
)

$env:UPTIMER_DB="postgresql://engine:password@localhost:5433/engine_test?sslmode=disable"
$StartTime = Get-Date

Write-Host "============================================================"
Write-Host " PRODUCTION READINESS LOADTEST — $Count monitors, ${RunSeconds}s run"
Write-Host "============================================================"
Write-Host ""

# ── 1. Start infrastructure ──────────────────────────────────────────────────
Write-Host "[1/7] Cleaning up old containers and volumes..."
docker-compose down -v

Write-Host "[2/7] Starting Postgres DB and Mock Farm..."
docker-compose up -d db mock
Start-Sleep -Seconds 10
docker-compose exec db psql -U engine -d engine_test -f /docker-entrypoint-initdb.d/schema.sql

# ── 2. Seed monitors ─────────────────────────────────────────────────────────
Write-Host "[2/7] Seeding $Count production-realistic monitors..."
go run .\loadtest\seed\main.go $Count
Write-Host "      Seed complete."
Write-Host ""

# ── 3. Build images ─────────────────────────────────────────────────────
Write-Host "[3/7] Building images (engine and mock)..."
docker-compose build engine mock
Write-Host "      Build complete."
Write-Host ""

# ── 4. Launch resource collectors ────────────────────────────────────────────
Write-Host "[4/7] Launching resource collectors..."

# CSV header
"timestamp,cpu_pct,mem_usage,mem_limit,net_rx,net_tx" | Out-File -FilePath "loadtest_stats.csv" -Encoding utf8

$statsJob = Start-Job -ScriptBlock {
    param($outFile)
    while ($true) {
        $ts = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss")
        $line = docker stats engine-engine-1 --no-stream --format "$ts,{{.CPUPerc}},{{.MemUsage}},{{.NetIO}}" 2>$null
        if ($line) { $line | Out-File -Append -FilePath $outFile -Encoding utf8 }
        Start-Sleep -Seconds 5
    }
} -ArgumentList (Join-Path (Get-Location) "loadtest_stats.csv")

# ── 5. Run engine ─────────────────────────────────────────────────────────────
Write-Host "[5/7] Starting engine (${RunSeconds}s run)..."
Write-Host "      TIP: docker pause engine-db-1 to test DB resilience"
Write-Host ""

$engineStart = Get-Date
docker-compose up -d engine

# Progress indicator (no timer spam — just a simple wait)
$elapsed = 0
while ($elapsed -lt $RunSeconds) {
    Start-Sleep -Seconds 30
    $elapsed += 30
    $remaining = $RunSeconds - $elapsed
    Write-Host "      [$elapsed/${RunSeconds}s] Engine running... ($remaining s remaining)"
}

# ── 6. Capture final stats ────────────────────────────────────────────────────
Write-Host ""
Write-Host "[6/7] Capturing final metrics..."
$engineStop = Get-Date
$actualRunSeconds = ($engineStop - $engineStart).TotalSeconds

Write-Host "      CPU cgroup stats:"
docker exec engine-engine-1 cat /sys/fs/cgroup/cpu.stat 2>$null

# Network I/O from docker stats (last line)
Write-Host ""
Write-Host "      Final resource snapshot:"
docker stats engine-engine-1 --no-stream --format "      CPU: {{.CPUPerc}} | MEM: {{.MemUsage}} | NET: {{.NetIO}} | PID: {{.PIDs}}"

# Stop engine
Write-Host ""
Write-Host "      Stopping engine..."
docker-compose stop engine

Stop-Job -Job $statsJob -ErrorAction SilentlyContinue
Remove-Job -Job $statsJob -ErrorAction SilentlyContinue

# ── 7. Verification ───────────────────────────────────────────────────────────
Write-Host ""
Write-Host "[7/7] Running verification queries..."
Write-Host ""
docker-compose exec db psql -U engine -d engine_test -f /tmp/verify.sql

# Mock server count
$mockCount = (curl.exe -sk "https://localhost:8443/mock/count" 2>$null)
Write-Host ""
Write-Host "============================================================"
Write-Host " RESOURCE SUMMARY"
Write-Host "============================================================"
Write-Host ""
Write-Host "  Monitors          : $Count"
Write-Host "  Run duration      : $([math]::Round($actualRunSeconds))s"
Write-Host "  Mock requests     : $mockCount"
Write-Host ""

# Parse stats CSV for averages
Write-Host "  Per-interval resource sample (from loadtest_stats.csv):"
$stats = Import-Csv "loadtest_stats.csv" -Header timestamp,cpu_pct,mem_usage,mem_limit,net_rx,net_tx 2>$null
if ($stats -and $stats.Count -gt 2) {
    # Skip first row (warmup) and last row (shutdown)
    $steadyState = $stats | Select-Object -Skip 2 | Select-Object -SkipLast 1
    Write-Host "  Sample points     : $($steadyState.Count)"
    $cpuNums = $steadyState | ForEach-Object { [double]($_.cpu_pct -replace '%','') }
    $avgCPU  = ($cpuNums | Measure-Object -Average).Average
    $maxCPU  = ($cpuNums | Measure-Object -Maximum).Maximum
    Write-Host "  Avg CPU           : $([math]::Round($avgCPU, 2))%"
    Write-Host "  Peak CPU          : $([math]::Round($maxCPU, 2))%"
}

Write-Host ""
Write-Host "  Total test duration: $(($engineStop - $StartTime).ToString('mm\m\ ss\s'))"
Write-Host "============================================================"
Write-Host ""
Write-Host "  See loadtest_stats.csv for full per-5s resource timeline."
Write-Host "  See loadtest_v8.log for complete output."
Write-Host "============================================================"
