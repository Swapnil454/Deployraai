$ErrorActionPreference = "Stop"
$duration = $args[0]
if (-not $duration) { $duration = 120 }

Write-Host "Starting continuous CPU stat and lag collection for $duration seconds..."
$endTime = (Get-Date).AddSeconds($duration)

$lastPeriods = 0
$lastThrottled = 0
$lastTime = Get-Date

while ((Get-Date) -lt $endTime) {
    $stat = docker-compose exec -T engine cat /sys/fs/cgroup/cpu.stat
    $statHash = @{}
    $stat -split "`n" | Where-Object { $_ -match " " } | ForEach-Object {
        $parts = $_ -split " "
        $statHash[$parts[0]] = [long]$parts[1]
    }
    
    $currPeriods = $statHash["nr_periods"]
    $currThrottled = $statHash["nr_throttled"]
    
    $now = Get-Date
    if ($lastPeriods -ne 0) {
        $diffPeriods = $currPeriods - $lastPeriods
        $diffThrottled = $currThrottled - $lastThrottled
        $ratio = 0
        if ($diffPeriods -gt 0) { $ratio = [math]::Round(($diffThrottled / $diffPeriods) * 100, 2) }
        Write-Host "[$now] CPU Throttled: $ratio% ($diffThrottled / $diffPeriods periods)"
    }
    
    $lastPeriods = $currPeriods
    $lastThrottled = $currThrottled
    $lastTime = $now
    
    Start-Sleep -Seconds 5
}
