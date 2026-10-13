$file = 'core\dispatcher.go'
$content = [System.IO.File]::ReadAllText($file)

# Use LF endings since the file uses LF
$old = "					Emit(Sample{`n						MonitorID:      m.ParsedUUID,`n						TsMs:           time.Now().UnixMilli(),`n						LatencyUs:      0,`n						Status:         3,   // 3 = Reaped (distinct from 0=DOWN, 1=UP, 2=DEGRADED)`n						Err:            255, // Timeout/Dropped"

$new = "					// ErrNotExecuted: reaper fires when check deadline expired before the worker completed.`n					// MUST NOT call HandleFailure here -- that converts engine overload into a false DOWN`n					// (Goal 1, Req 6). A non-zero reaper count invalidates any benchmark run.`n					Emit(Sample{`n						MonitorID:      m.ParsedUUID,`n						TsMs:           time.Now().UnixMilli(),`n						LatencyUs:      0,`n						Status:         3,   // 3 = Reaped / ErrNotExecuted (never DOWN, never UP)`n						Err:            255, // ErrNotExecuted sentinel -- never maps to a DOWN state"

if ($content.Contains($old)) {
    $content = $content.Replace($old, $new)
    [System.IO.File]::WriteAllText($file, $content, [System.Text.Encoding]::UTF8)
    Write-Host "OK: reaper comment patched"
} else {
    Write-Host "Pattern not found"
    $idx = $content.IndexOf("Reaped (distinct")
    Write-Host "Bytes around match: [$($content.Substring([Math]::Max(0,$idx-100), 300) | ForEach-Object { [System.Text.Encoding]::UTF8.GetBytes($_) } )]"
}
