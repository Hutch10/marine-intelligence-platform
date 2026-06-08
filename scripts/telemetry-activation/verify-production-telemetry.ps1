# Verify production telemetry freshness (read-only HTTP checks).

# Usage: .\scripts\telemetry-activation\verify-production-telemetry.ps1

# Optional: -ApiBase https://api.vitalicast.com

#

# Thresholds:

#   NDBC (live-conditions): hard FAIL when observation age > 6 hours

#   CRW (reef-alerts): WARN when product age > 48 hours; hard FAIL when > 72 hours

#   CRW timestamp is the NOAA product date (midnight UTC), not ingest time.



param(

  [string] $ApiBase = "https://api.vitalicast.com"

)



$ErrorActionPreference = "Stop"

$now = [DateTimeOffset]::UtcNow

$failures = @()

$warnings = @()



function Get-Json($url) {

  return Invoke-RestMethod -Uri $url -Method Get

}



function ParseUtcTimestamp([string] $value) {

  return [DateTimeOffset]::Parse($value, [Globalization.CultureInfo]::InvariantCulture, [Globalization.DateTimeStyles]::AssumeUniversal).UtcDateTime

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

    $t = ParseUtcTimestamp([string]$c.timestamp)

    if (-not $maxObs -or $t -gt $maxObs) { $maxObs = $t }

    Write-Host ("  station {0} timestamp {1}" -f $c.stationId, $c.timestamp)

  }

  if ($maxObs) {

    $ageH = ($now.UtcDateTime - $maxObs).TotalHours

    Write-Host ("Latest observation age: {0:N1} hours (NDBC hard fail > 6h)" -f $ageH)

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

    $t = ParseUtcTimestamp([string]$a.timestamp)

    if (-not $maxReef -or $t -gt $maxReef) { $maxReef = $t }

    Write-Host ("  region {0} timestamp {1}" -f $a.region, $a.timestamp)

  }

  if ($maxReef) {

    $ageH = ($now.UtcDateTime - $maxReef).TotalHours

    Write-Host ("Latest reef alert age: {0:N1} hours (CRW warn > 48h, fail > 72h)" -f $ageH)

    if ($ageH -gt 72) {

      $failures += "Latest reef alert older than 72 hours (CRW hard fail)"

    } elseif ($ageH -gt 48) {

      $warnings += "Latest reef alert older than 48 hours (CRW warn - daily NOAA product cadence)"

    }

  }

} catch {

  $failures += "GET /reef-alerts failed: $_"

}



Write-Host ""



try {

  $feed = Get-Json "$ApiBase/feed-health"

  $historyCount = [int]($feed.summary.recent_history_count)

  Write-Host ("feed-health recent_history_count: {0}" -f $historyCount)

  Write-Host ("feed-health last_completed_at: {0}" -f $feed.summary.last_completed_at)



  if ($historyCount -eq 0) {

    $failures += "No persisted ingestion reports in feed-health"

  }



  if (-not $feed.summary.last_completed_at) {

    $failures += "No latest scheduler execution timestamp in feed-health"

  } else {

    $lastCompleted = ParseUtcTimestamp([string]$feed.summary.last_completed_at)

    $schedAgeH = ($now.UtcDateTime - $lastCompleted).TotalHours

    Write-Host ("Latest scheduler execution age: {0:N1} hours (hard fail > 3h)" -f $schedAgeH)

    if ($schedAgeH -gt 3) {

      $failures += "Latest scheduler execution older than 3 hours"

    }

  }

} catch {

  $failures += "GET /feed-health failed: $_"

}



try {

  $live2 = Get-Json "$ApiBase/live-conditions"

  foreach ($c in $live2.conditions) {

    $src = [string]$c.source

    if ($src -match '^synthetic' -or $src -eq 'mock') {

      $failures += "Mock/synthetic contamination detected in live-conditions"

      break

    }

  }

} catch {

  $failures += "mock contamination check failed: $_"

}



try {

  $reef2 = Get-Json "$ApiBase/reef-alerts"

  foreach ($a in $reef2.alerts) {

    if (-not $a.verificationStatus -or -not $a.productDate) {

      $warnings += "Reef alerts missing harness provenance fields (deploy harness API update)"

      break

    }

  }

} catch {

  $failures += "reef provenance check failed: $_"

}



Write-Host ""



if ($env:OPERATOR_ACCESS_TOKEN) {

  try {

    $replay = Get-Json "$ApiBase/internal/operator/replay-validation?token=$($env:OPERATOR_ACCESS_TOKEN)"

    $replaySamples = [int]($replay.sampleCount)

    $replayPass = [bool]($replay.overallPass)

    Write-Host ("replay-validation sampleCount: {0}" -f $replaySamples)

    Write-Host ("replay-validation overallPass: {0}" -f $replayPass)



    if ($replaySamples -eq 0) {

      $failures += "No replay validation samples available (deploy harness + Turso migration 0003+)"

    } elseif (-not $replayPass) {

      $failures += "Replay validation burn-in failed - incomplete or unreplayable production evidence"

    }

  } catch {

    $failures += "GET /internal/operator/replay-validation failed: $_"

  }

} else {

  $failures += "OPERATOR_ACCESS_TOKEN not set - cannot verify replay validation gate"

}



try {

  $live3 = Get-Json "$ApiBase/live-conditions"

  $reef3 = Get-Json "$ApiBase/reef-alerts"

  $trustedMissingLineage = @()

  foreach ($c in $live3.conditions) {

    if (($c.trustedForPromotion -eq $true -or $c.trustStatus -eq "trusted") -and -not $c.rootEventId) {

      $trustedMissingLineage += "live-conditions:$($c.stationId)"

    }

  }

  foreach ($a in $reef3.alerts) {

    if (($a.trustedForPromotion -eq $true -or $a.trustStatus -eq "trusted") -and -not $a.rootEventId) {

      $trustedMissingLineage += "reef-alerts:$($a.region)"

    }

  }

  Write-Host ("public trusted signals missing rootEventId: {0}" -f $trustedMissingLineage.Count)

  if ($trustedMissingLineage.Count -gt 0) {

    $failures += "Public API returned trusted environmental signals without rootEventId lineage"

  }

} catch {

  $failures += "public lineage enforcement check failed: $_"

}



Write-Host ""



if ($failures.Count -eq 0) {

  if ($warnings.Count -gt 0) {

    Write-Host "WARN:"

    $warnings | ForEach-Object { Write-Host "  - $_" }

    Write-Host "PASS - production telemetry within thresholds (CRW warning only)."

    exit 0

  }



  Write-Host "PASS - production telemetry within thresholds."

  exit 0

}



Write-Host "FAIL:"

$failures | ForEach-Object { Write-Host "  - $_" }

if ($warnings.Count -gt 0) {

  Write-Host "WARN:"

  $warnings | ForEach-Object { Write-Host "  - $_" }

}

exit 1

