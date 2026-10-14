#!/usr/bin/env pwsh
# ════════════════════════════════════════════════════════════════════════════════
# run_step2.ps1 - Step 2 Validation Runs
# Order: Run 6 Rerun (C-off) -> Run 7 (C-on) -> Run 8 (C-off)
# Duration: 1815s each (30 minutes + 15s jitter headroom)
# ════════════════════════════════════════════════════════════════════════════════

$EngineDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $EngineDir

$armPlan = @(
    @{ Run = "6_rerun"; Arm = "C-off" },
    @{ Run = "7";       Arm = "C-on"  },
    @{ Run = "8";       Arm = "C-off" }
)

$runSeconds = 1815

Write-Host "=================================================================="
Write-Host "  STARTING STEP 2 VALIDATION MATRIX (3 RUNS x 1815s)"
Write-Host "  Runs: Run 6 Rerun (C-off), Run 7 (C-on), Run 8 (C-off)"
Write-Host "=================================================================="

foreach ($step in $armPlan) {
    $runId = $step.Run
    $arm = $step.Arm
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "`n>>> [RUN $runId] Starting Arm $arm at $ts (Duration: ${runSeconds}s)..."

    # Clean previous run artifacts
    Remove-Item "brutal_report.md" -ErrorAction SilentlyContinue
    Remove-Item "brutal_soak.log" -ErrorAction SilentlyContinue
    Remove-Item "brutal_process_series.csv" -ErrorAction SilentlyContinue
    Remove-Item "brutal_stats.csv" -ErrorAction SilentlyContinue

    # Execute run_brutal.ps1
    & powershell -ExecutionPolicy Bypass -File .\loadtest\run_brutal.ps1 -MonitorCount 3000 -RunSeconds $runSeconds -Arm $arm
    $rc = $LASTEXITCODE

    if ($rc -ne 0) {
        Write-Error ">>> CRITICAL ABORT: Run $runId (Arm $arm) failed with exit code $rc! Halting."
        exit $rc
    }

    # Archive outputs with run ID and arm
    $tag = "run_${runId}_${arm}"
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

    Write-Host ">>> [RUN $runId] Finished Arm $arm successfully at $(Get-Date -Format 'HH:mm:ss')."

    Write-Host ">>> Cooling down for 30s before next clean-slate run..."
    Start-Sleep -Seconds 30
}

Write-Host "`n=================================================================="
Write-Host "  ALL STEP 2 VALIDATION RUNS COMPLETED SUCCESSFULLY"
Write-Host "=================================================================="
