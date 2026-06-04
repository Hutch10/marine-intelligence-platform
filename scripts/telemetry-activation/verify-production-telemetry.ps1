# Verify production telemetry freshness (read-only HTTP checks).
# Usage: .\scripts\telemetry-activation\verify-production-telemetry.ps1
# Optional: -ApiBase https://api.vitalicast.com

param(
  [string] $ApiBase = "https://api.vitalicast.com"
)

$ErrorActionPreference = "Stop"
$now = [DateTime]::UtcNow
$failures = @()

function Get-Json($url) {
  return Invoke-RestMethod -Uri $url -Method Get
}

Write-Host "Marine telemetry verification - $ApiBase"
Write-Host "UTC now: $($now.ToString('o'))"
Write-Host ""

try {
  $health = Get-Json "$ApiBase/health"
  Write-Host ("dbReachable: {0}" -f $health.dbReachable)
  if (-not $health.dbReachable) {
    $failures += "health.dbReachable is false"
  }
  $fh = $health.feedHealth
  if ($fh) {
    Write-Host ("feed-health last_completed_at: {0}" -f $fh.summary.last_completed_at)
    Write-Host ("feed-health recent_history_count: {0}" -f $fh.summary.recent_history_count)
  }
} catch {
  $failures += "GET /health failed: $_"
}

Write-Host ""

try {
  $live = Get-Json "$ApiBase/live-conditions"
  $maxObs = $null
  foreach ($c in $live.conditions) {
    $t = [DateTime]::Parse($c.timestamp).ToUniversalTime()
    if (-not $maxObs -or $t -gt $maxObs) { $maxObs = $t }
    Write-Host ("  station {0} timestamp {1}" -f $c.stationId, $c.timestamp)
  }
  if ($maxObs) {
    $ageH = ($now - $maxObs).TotalHours
    Write-Host ("Latest observation age: {0:N1} hours" -f $ageH)
    if ($ageH -gt 6) {
      $failures += "Latest observation older than 6 hours"
    }
  } else {
    $failures += "No live conditions returned"
  }
} catch {
  $failures += "GET /live-conditions failed: $_"
}

Write-Host ""

try {
  $reef = Get-Json "$ApiBase/reef-alerts"
  $maxReef = $null
  foreach ($a in $reef.alerts) {
    $t = [DateTime]::Parse($a.timestamp).ToUniversalTime()
    if (-not $maxReef -or $t -gt $maxReef) { $maxReef = $t }
    Write-Host ("  region {0} timestamp {1}" -f $a.region, $a.timestamp)
  }
  if ($maxReef) {
    $ageH = ($now - $maxReef).TotalHours
    Write-Host ("Latest reef alert age: {0:N1} hours" -f $ageH)
    if ($ageH -gt 48) {
      $failures += "Latest reef alert older than 48 hours"
    }
  }
} catch {
  $failures += "GET /reef-alerts failed: $_"
}

Write-Host ""

if ($failures.Count -eq 0) {
  Write-Host "PASS - production telemetry within thresholds."
  exit 0
}

Write-Host "FAIL:"
$failures | ForEach-Object { Write-Host "  - $_" }
exit 1
