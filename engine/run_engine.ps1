# Load engine .env variables
Get-Content .env | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
        $key = $matches[1].Trim()
        $val = $matches[2].Trim().Trim('"').Trim("'")
        [System.Environment]::SetEnvironmentVariable($key, $val, 'Process')
    }
}

# Windows local defaults
if (-not $env:TELEMETRY_SPOOL_DIR) {
    $env:TELEMETRY_SPOOL_DIR = "$PSScriptRoot\spool"
}
if (-not (Test-Path $env:TELEMETRY_SPOOL_DIR)) {
    New-Item -ItemType Directory -Path $env:TELEMETRY_SPOOL_DIR -Force | Out-Null
}

$env:ALLOW_TMPFS_SPOOL = "1"
$env:ADMIN_ADDR = "0.0.0.0:9101"
$env:ADMIN_TOKEN = "canary-secret-token-12345"
if (-not $env:HTTP_WORKERS) { $env:HTTP_WORKERS = "100" }

Write-Host "Starting Uptime Engine locally..." -ForegroundColor Cyan
Write-Host "Supabase Pooled: $env:DATABASE_URL_POOLED"
Write-Host "ClickHouse: $env:UPTIMER_CLICKHOUSE_URL"
Write-Host "Admin Endpoint: http://$env:ADMIN_ADDR"

.\uptime-engine.exe
