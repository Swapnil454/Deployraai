param (
    [int]$Count = 35000
)

$env:UPTIMER_DB="postgresql://engine:password@localhost:5433/engine_test?sslmode=disable"

Write-Host "1. Starting Postgres DB and Mock Farm..."
docker-compose up -d db mock

Write-Host "Waiting for DB to be healthy..."
Start-Sleep -Seconds 10

Write-Host "2. Seeding $Count mock monitors..."
go run .\loadtest\seed\main.go $Count

Write-Host "3. Compiling Engine Image (with loadtest tag)..."
docker-compose build engine

Write-Host "4. Starting Docker stats collector in background..."
$statsJob = Start-Job -ScriptBlock {
    while ($true) {
        docker stats engine-engine-1 --no-stream --format "{{.Name}},{{.CPUPerc}},{{.MemUsage}},{{.NetIO}}" | Out-File -Append -FilePath "loadtest_stats.csv" -Encoding utf8
        Start-Sleep -Seconds 5
    }
}

Write-Host "5. Running Engine for 5 minutes with strict resource caps..."
Write-Host "NOTE: To test DB kill, pause the db container (docker pause engine-db-1) in another terminal!"

# Run engine in background
docker-compose up -d engine

# Wait 5 minutes
Start-Sleep -Seconds 300

# Stop the engine
Write-Host "Engine stopping. Dumping final cpu.stat..."
docker exec engine-engine-1 cat /sys/fs/cgroup/cpu.stat

docker-compose stop engine

Write-Host "Engine stopped. Stopping stats collector..."
Stop-Job -Job $statsJob
Remove-Job -Job $statsJob

Write-Host "6. Running verification query..."
docker-compose exec db psql -U engine -d engine_test -f /tmp/verify.sql

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
[System.Net.ServicePointManager]::ServerCertificateValidationCallback = { $true }
$mockCount = Invoke-RestMethod -Uri "https://localhost:8443/mock/count"
Write-Host "Mock server served $mockCount requests."
Write-Host "Please compare this number manually with the all_checks sum in the SQL output above."


