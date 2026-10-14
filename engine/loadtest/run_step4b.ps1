#!/usr/bin/env pwsh
# ════════════════════════════════════════════════════════════════════════════════
# run_step4b.ps1 - Step 4B Production Scale Test (35,000 Monitors @ 30s)
# ════════════════════════════════════════════════════════════════════════════════

$EngineDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $EngineDir

$MonitorCount = 35000
$RunSeconds = 615 # 10 minutes + 15s jitter margin (~720,000 checks)
$Arm = "C-on"

Write-Host "=================================================================="
Write-Host "  STARTING STEP 4B SCALE TEST ($MonitorCount Monitors @ 30s)"
Write-Host "  Arm: $Arm | Duration: ${RunSeconds}s (~$([math]::Round($RunSeconds/60)) min)"
Write-Host "  Checks expected: ~$([math]::Round($MonitorCount / 30 * $RunSeconds))"
Write-Host "  Check Rate: ~$([math]::Round($MonitorCount / 30)) checks/second"
Write-Host "=================================================================="

# Clean previous run artifacts
Remove-Item "brutal_report.md" -ErrorAction SilentlyContinue
Remove-Item "brutal_soak.log" -ErrorAction SilentlyContinue
Remove-Item "brutal_process_series.csv" -ErrorAction SilentlyContinue
Remove-Item "brutal_stats.csv" -ErrorAction SilentlyContinue

# Execute run_brutal.ps1
& powershell -ExecutionPolicy Bypass -File .\loadtest\run_brutal.ps1 -MonitorCount $MonitorCount -RunSeconds $RunSeconds -Arm $Arm
$rc = $LASTEXITCODE

if ($rc -ne 0) {
    Write-Error ">>> CRITICAL ABORT: Step 4B failed with exit code $rc!"
    exit $rc
}

# Archive outputs
$tag = "step4b_35k_${Arm}"
if (Test-Path "brutal_report.md") {
    Copy-Item -Path "brutal_report.md" -Destination "brutal_report_${tag}.md" -Force
    Write-Host ">>> Report saved: brutal_report_${tag}.md"
}
if (Test-Path "brutal_soak.log") {
    Copy-Item -Path "brutal_soak.log" -Destination "brutal_soak_${tag}.log" -Force
}
if (Test-Path "brutal_process_series.csv") {
    Copy-Item -Path "brutal_process_series.csv" -Destination "brutal_process_series_${tag}.csv" -Force
}
if (Test-Path "brutal_stats.csv") {
    Copy-Item -Path "brutal_stats.csv" -Destination "brutal_stats_${tag}.csv" -Force
}

Write-Host "`n=================================================================="
Write-Host "  STEP 4B ($MonitorCount MONITORS) COMPLETED SUCCESSFULLY"
Write-Host "=================================================================="
