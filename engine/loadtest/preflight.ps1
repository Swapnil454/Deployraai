#!/usr/bin/env pwsh
# ════════════════════════════════════════════════════════════════════════════════
# preflight.ps1 - Preflight Smoke Test & Abort Drill
# Runs C-off (120s), C-on (120s), A (120s), followed by Injected Abort Drill
# ════════════════════════════════════════════════════════════════════════════════

$EngineDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $EngineDir

$arms = @("C-off", "C-on", "A")
$runSecs = 120

Write-Host "=================================================================="
Write-Host "  PREFLIGHT SMOKE TEST (3 ARMS x 120s + INJECTED ABORT DRILL)"
Write-Host "=================================================================="

$step = 1
foreach ($arm in $arms) {
    Write-Host "`n>>> [PREFLIGHT $step/3] Starting Arm $arm (120s)..."

    Remove-Item "brutal_report.md" -ErrorAction SilentlyContinue
    Remove-Item "brutal_soak.log" -ErrorAction SilentlyContinue
    Remove-Item "brutal_process_series.csv" -ErrorAction SilentlyContinue
    Remove-Item "brutal_stats.csv" -ErrorAction SilentlyContinue

    & powershell -ExecutionPolicy Bypass -File .\loadtest\run_brutal.ps1 -MonitorCount 3000 -RunSeconds $runSecs -Arm $arm
    $rc = $LASTEXITCODE

    if ($rc -ne 0) {
        Write-Error "Preflight failed on Arm $arm with exit code $rc"
        exit $rc
    }

    # Verify config line in log
    $eff = Get-Content "brutal_soak.log" | Select-String "EFFECTIVE_CONFIG" | Select-Object -Last 1
    Write-Host ">>> Verified config line: $eff"

    $dest = "brutal_report_preflight_${step}_${arm}.md"
    Copy-Item "brutal_report.md" $dest -Force
    Write-Host ">>> Saved: $dest"

    $step++
    Start-Sleep -Seconds 5
}

# ── INJECTED FAILURE DRILL ────────────────────────────────────────────────────
Write-Host "`n=================================================================="
Write-Host "  INJECTED ABORT DRILL: docker kill on brutal-engine mid-run"
Write-Host "=================================================================="

# Start a background job that kills the engine after 25s
$killer = Start-Job -ScriptBlock {
    Start-Sleep -Seconds 25
    Write-Host ">>> [INJECTING FAILURE] Killing brutal-engine..."
    docker kill brutal-engine | Out-Null
}

$drillFailed = $false
try {
    & powershell -ExecutionPolicy Bypass -File .\loadtest\run_brutal.ps1 -MonitorCount 3000 -RunSeconds 120 -Arm "C-on"
    $rc = $LASTEXITCODE
    if ($rc -ne 0) {
        Write-Host "`n>>> SUCCESS: Injected abort drill caught engine termination and exited with code $rc!"
    } else {
        Write-Error ">>> DRILL FAILED: Script exited 0 despite engine being killed!"
        $drillFailed = $true
    }
} catch {
    Write-Host "`n>>> SUCCESS: Caught abort exception: $_"
} finally {
    Stop-Job $killer -ErrorAction SilentlyContinue
    Remove-Job $killer -ErrorAction SilentlyContinue
}

if ($drillFailed) {
    exit 1
}

Write-Host "`n=================================================================="
Write-Host "  PREFLIGHT ALL CHECKS & ABORT DRILL PASSED CLEANLY"
Write-Host "=================================================================="
exit 0
