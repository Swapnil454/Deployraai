#!/usr/bin/env pwsh
# ════════════════════════════════════════════════════════════════════════════════
# run_six.ps1 - 6-Run Comparative Matrix
# Order: C-off, C-on, A, C-on, A, C-off
# Duration: 1815s each (30 minutes + 15s jitter headroom)
# ════════════════════════════════════════════════════════════════════════════════

$EngineDir = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $EngineDir

$armPlan = @(
    @{ Run = 1; Arm = "C-off" },
    @{ Run = 2; Arm = "C-on"  },
    @{ Run = 3; Arm = "A"     },
    @{ Run = 4; Arm = "C-on"  },
    @{ Run = 5; Arm = "A"     },
    @{ Run = 6; Arm = "C-off" }
)

$runSeconds = 1815

Write-Host "=================================================================="
Write-Host "  STARTING STEP 6 BENCHMARK MATRIX (6 RUNS x 1815s = ~3.5 HOURS)"
Write-Host "  Registered Arm Order: C-off, C-on, A, C-on, A, C-off"
Write-Host "=================================================================="

foreach ($step in $armPlan) {
    $runNum = $step.Run
    $arm = $step.Arm
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "`n>>> [RUN $runNum/6] Starting Arm $arm at $ts (Duration: ${runSeconds}s)..."

    # Clean previous run artifacts
    Remove-Item "brutal_report.md" -ErrorAction SilentlyContinue
    Remove-Item "brutal_soak.log" -ErrorAction SilentlyContinue
    Remove-Item "brutal_process_series.csv" -ErrorAction SilentlyContinue
    Remove-Item "brutal_stats.csv" -ErrorAction SilentlyContinue

    # Execute run_brutal.ps1
    & powershell -ExecutionPolicy Bypass -File .\loadtest\run_brutal.ps1 -MonitorCount 3000 -RunSeconds $runSeconds -Arm $arm
    $rc = $LASTEXITCODE

    # Check for run failure or abort
    if ($rc -ne 0) {
        Write-Error ">>> CRITICAL ABORT: Run $runNum (Arm $arm) failed with exit code $rc! Halting matrix."
        exit $rc
    }

    # Archive outputs with run number and arm
    $tag = "run_${runNum}_${arm}"
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

    Write-Host ">>> [RUN $runNum/6] Finished Arm $arm successfully at $(Get-Date -Format 'HH:mm:ss')."

    # Cool down period between runs
    if ($runNum -lt 6) {
        Write-Host ">>> Cooling down for 30s before next clean-slate run..."
        Start-Sleep -Seconds 30
    }
}

Write-Host "`n=================================================================="
Write-Host "  ALL 6 RUNS COMPLETED SUCCESSFULLY"
Write-Host "=================================================================="
