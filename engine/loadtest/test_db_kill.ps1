[CmdletBinding()]
param(
    [string]$Mode = "pause"
)

$MockBase = "https://localhost:8443/mock/override"

# Ignore SSL errors for Invoke-RestMethod since it's a self-signed cert
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }

Write-Host "1. Suspending Database (Mode: $Mode)..."
if ($Mode -eq "pause") { docker pause engine-db-1 } else { docker stop engine-db-1 }

Write-Host "2. Simulating monitor flips during DB outage..."
# Flip 200 up-monitors to failing. Assuming mock-0 to mock-199 are normally 'up' (97% are up)
for ($i=0; $i -lt 200; $i++) {
    Invoke-RestMethod -Uri "${MockBase}?host=mock-${i}.mock.local&state=down" -Method Post | Out-Null
}

# Flip 100 failing ones back to up. Assuming mock-98, 198, 298... are normally 'down'
for ($i=98; $i -lt 10000; $i+=100) {
    Invoke-RestMethod -Uri "${MockBase}?host=mock-${i}.mock.local&state=up" -Method Post | Out-Null
}

# Make 50 monitors go down and back up (flappers)
for ($i=200; $i -lt 250; $i++) {
    Invoke-RestMethod -Uri "${MockBase}?host=mock-${i}.mock.local&state=down" -Method Post | Out-Null
}
Start-Sleep -Seconds 90
for ($i=200; $i -lt 250; $i++) {
    Invoke-RestMethod -Uri "${MockBase}?host=mock-${i}.mock.local&state=up" -Method Post | Out-Null
}

Write-Host "3. Waiting 5 minutes to simulate prolonged outage..."
Start-Sleep -Seconds 300

Write-Host "4. Resuming Database..."
if ($Mode -eq "pause") { docker unpause engine-db-1 } else { docker start engine-db-1 }

Write-Host "5. Waiting 3 minutes for recovery and dead-letter replay..."
Start-Sleep -Seconds 180

Write-Host "6. Running verification query..."
Write-Host "6. Running verification query..."
docker-compose exec db psql -U engine -d engine_test -f /tmp/verify.sql

$mockCount = Invoke-RestMethod -Uri "https://localhost:8443/mock/count"
Write-Host "Mock server served $mockCount requests."

Write-Host "DB Kill test complete!"
