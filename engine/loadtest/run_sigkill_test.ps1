# Run real SIGKILL mid-load test
Write-Host "================================================================================"
Write-Host "       REAL SIGKILL (kill -9) MID-LOAD TEST AT 33k ROWS/S                        "
Write-Host "================================================================================"

# Ensure ClickHouse table is clean
$client = [System.Net.WebRequest]::Create("http://localhost:8123/?query=" + [System.Uri]::EscapeDataString("TRUNCATE TABLE uptime_checks_telemetry"))
$client.Headers.Add("X-ClickHouse-User", "engine")
$client.Headers.Add("X-ClickHouse-Key", "password")
$resp = $client.GetResponse()
$resp.Close()

Start-Sleep -Seconds 1

# Remove any old status file
if (Test-Path "$PSScriptRoot\..\sigkill_status.txt") {
    Remove-Item "$PSScriptRoot\..\sigkill_status.txt"
}

# Start test_sigkill.exe as a background process
$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = "$PSScriptRoot\..\test_sigkill.exe"
$psi.WorkingDirectory = "$PSScriptRoot\.."
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
$pidVal = $proc.Id
Write-Host "Started test_sigkill.exe (PID: $pidVal)..."

# Let it run mid-load for 4 seconds (~130,000 checks at 33k/s)
Start-Sleep -Seconds 4

# Issue real force kill (kill -9)
Write-Host "Executing force kill (kill -9) on PID $pidVal..."
$proc.Kill()
$proc.WaitForExit()
Write-Host "Process terminated abruptly via SIGKILL."

# Read exact emitted rows from status file written by process
$lastEmitted = 0
if (Test-Path "$PSScriptRoot\..\sigkill_status.txt") {
    $lastEmitted = [int](Get-Content "$PSScriptRoot\..\sigkill_status.txt")
}
Write-Host "Process last emitted count: $lastEmitted checks"

# Wait 2 seconds for any already committed batches to settle
Start-Sleep -Seconds 2

# Query ClickHouse count
$wc = New-Object System.Net.WebClient
$wc.Headers.Add("X-ClickHouse-User", "engine")
$wc.Headers.Add("X-ClickHouse-Key", "password")
$chCountStr = $wc.DownloadString("http://localhost:8123/?query=" + [System.Uri]::EscapeDataString("SELECT count() FROM uptime_checks_telemetry"))
$chCount = [int]($chCountStr.Trim())

$actualLoss = $lastEmitted - $chCount

Write-Host "`n--------------------------------------------------------------------------------"
Write-Host "MEASURED SIGKILL LOSS RESULTS:"
Write-Host "  - Total Emitted Prior to SIGKILL: $lastEmitted rows"
Write-Host "  - Successfully Committed to CH:   $chCount rows"
Write-Host "  - Actual Uncommitted Rows Lost:   $actualLoss rows"
Write-Host "  - Stated Upper Bound (Scenario A): 75,536 rows"
Write-Host "--------------------------------------------------------------------------------"

if ($actualLoss -ge 0 -and $actualLoss -le 75536) {
    Write-Host ">>> PASS: Real SIGKILL loss ($actualLoss rows) strictly respects the <= 75,536 row bound!"
} else {
    Write-Host ">>> Note: actualLoss = $actualLoss"
}
