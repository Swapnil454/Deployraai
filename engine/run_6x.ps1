#!/usr/bin/env pwsh

$MonitorCount = 35695
$RunSeconds = 1800

for ($i = 1; $i -le 6; $i++) {
    Write-Host "Starting Benchmark Run $i/6"
    ./loadtest/run_brutal.ps1 -MonitorCount $MonitorCount -RunSeconds $RunSeconds
    
    # Save reports
    Copy-Item brutal_report.md -Destination "brutal_report_run${i}.md"
    Copy-Item brutal_stats.csv -Destination "brutal_stats_run${i}.csv"
    Copy-Item brutal_soak.log -Destination "brutal_soak_run${i}.log"
    
    Write-Host "Finished Benchmark Run $i/6"
}
