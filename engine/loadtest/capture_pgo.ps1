$ErrorActionPreference = "Continue"

Write-Host "Capturing saturating CPU profile for 40 seconds..."
docker rm -f brutal-engine 2>$null | Out-Null
$env:ENGINE_BINARY = "./uptime-engine"
$env:CPU_PROFILE = "/app/default.pgo"
$env:GOGC = "100"
$env:GOMEMLIMIT = "1536MiB"

& docker-compose -f docker-compose.brutal.yml up -d engine 2>$null
Start-Sleep -Seconds 40
docker stop -t 5 brutal-engine 2>$null | Out-Null

Write-Host "Profile capture complete."
