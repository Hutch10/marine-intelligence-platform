# Phase 0 invariant verification - HutchStack Core Extraction Program
#
# Usage:
#   .\scripts\phase0\verify-phase0-invariants.ps1
#   .\scripts\phase0\verify-phase0-invariants.ps1 -ApiBase https://api.vitalicast.com
#   .\scripts\phase0\verify-phase0-invariants.ps1 -SkipLocal
#   .\scripts\phase0\verify-phase0-invariants.ps1 -SkipProduction
#
# Local gates: API typecheck + harness-focused test subset
# Production gates: delegates to verify-production-telemetry.ps1 when OPERATOR_ACCESS_TOKEN is set
#
# Phase 0A scope: verification only. No deployments. No runtime changes.

param(
  [string] $ApiBase = "https://api.vitalicast.com",
  [switch] $SkipLocal,
  [switch] $SkipProduction
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$failures = @()
$warnings = @()

function Note-Failure([string] $message) {
  $script:failures += $message
}

function Note-Warning([string] $message) {
  $script:warnings += $message
}

Write-Host "Phase 0 invariant verification"
Write-Host "Repo: $repoRoot"
Write-Host "UTC now: $([DateTimeOffset]::UtcNow.ToString('o'))"
Write-Host ""

if (-not $SkipLocal) {
  Push-Location $repoRoot
  try {
    Write-Host ""
    Write-Host "== API typecheck =="
    pnpm --filter api typecheck
    if ($LASTEXITCODE -ne 0) {
      Note-Failure "API typecheck failed (exit $LASTEXITCODE)"
    }

    $requiredHarnessTests = @(
      "src/services/environmental-harness-replay.test.ts",
      "src/services/environmental-harness-lineage.test.ts"
    )

    $optionalHarnessTests = @(
      "src/services/environmental-harness.test.ts",
      "src/verification/hostile-verification.test.ts"
    )

    $dbHarnessTests = @(
      "src/services/environmental-harness-operator.test.ts",
      "src/routes/operator-status.test.ts",
      "src/routes/live-conditions.test.ts",
      "src/routes/reef-alerts.test.ts",
      "src/services/operational-alerts.test.ts"
    )

    $dbCandidates = @(
      (Join-Path $repoRoot "apps\api\.data\marine.sqlite"),
      (Join-Path $repoRoot ".data\marine.sqlite")
    )
    if ($env:MARINE_DB_PATH -and (Test-Path $env:MARINE_DB_PATH)) {
      $dbCandidates = @($env:MARINE_DB_PATH) + $dbCandidates
    }
    $hasLocalDb = $false
    foreach ($candidate in $dbCandidates) {
      if ($candidate -and (Test-Path $candidate)) {
        $hasLocalDb = $true
        break
      }
    }

    if (-not $hasLocalDb) {
      Note-Warning "No local marine.sqlite - DB-backed harness route tests skipped (production probes are authoritative)"
    }

    function Invoke-HarnessTests([string] $label, [string[]] $files, [switch] $Required) {
      if ($files.Count -eq 0) {
        return
      }

      Write-Host ""
      Write-Host "== $label =="
      Push-Location (Join-Path $repoRoot "apps\api")
      try {
        $testArgs = @("--import", "tsx", "--test") + $files
        $result = & node @testArgs 2>&1
        $output = ($result | Out-String).Trim()
        if ($output) {
          Write-Host $output
        }
        if ($LASTEXITCODE -ne 0) {
          if ($Required) {
            Note-Failure "$label failed (exit $LASTEXITCODE)"
          } else {
            Note-Warning "$label failed (exit $LASTEXITCODE) - non-blocking without local DB"
          }
        }
      } finally {
        Pop-Location
      }
    }

    Invoke-HarnessTests -label "Required harness tests (replay + lineage IDs)" -files $requiredHarnessTests -Required
    Invoke-HarnessTests -label "Supplemental harness tests" -files $optionalHarnessTests
    if ($hasLocalDb) {
      Invoke-HarnessTests -label "DB-backed harness route tests" -files $dbHarnessTests -Required
    }
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Skipping local gates (-SkipLocal)"
}

if (-not $SkipProduction) {
  Write-Host ""
  Write-Host "== Production invariant probes =="

  try {
    $health = Invoke-RestMethod -Uri "$ApiBase/health" -Method Get
    Write-Host ("health.status: {0}" -f $health.status)
    Write-Host ("health.dbReachable: {0}" -f $health.dbReachable)
    if (-not $health.dbReachable) {
      Note-Failure "health.dbReachable is false"
    }
  } catch {
    Note-Failure "GET /health failed: $_"
  }

  try {
    Invoke-WebRequest -Uri "$ApiBase/internal/operator/status" -Method Get -UseBasicParsing | Out-Null
    Note-Failure "/internal/operator/status returned success without token (expected 403)"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host ("operator/status without token: {0}" -f $status)
    if ($status -ne 403) {
      Note-Failure "/internal/operator/status without token expected 403, got $status"
    }
  }

  try {
    Invoke-WebRequest -Uri "$ApiBase/internal/operator/replay-validation" -Method Get -UseBasicParsing | Out-Null
    Note-Failure "/internal/operator/replay-validation returned success without token (expected 403)"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    Write-Host ("replay-validation without token: {0}" -f $status)
    if ($status -ne 403) {
      Note-Failure "/internal/operator/replay-validation without token expected 403, got $status"
    }
  }

  try {
    $live = Invoke-RestMethod -Uri "$ApiBase/live-conditions" -Method Get
    $reef = Invoke-RestMethod -Uri "$ApiBase/reef-alerts" -Method Get
    $missing = @()
    foreach ($c in $live.conditions) {
      if (($c.trustedForPromotion -eq $true -or $c.trustStatus -eq "trusted") -and -not $c.rootEventId) {
        $missing += "live-conditions:$($c.stationId)"
      }
    }
    foreach ($a in $reef.alerts) {
      if (($a.trustedForPromotion -eq $true -or $a.trustStatus -eq "trusted") -and -not $a.rootEventId) {
        $missing += "reef-alerts:$($a.region)"
      }
    }
    Write-Host ("public trusted missing rootEventId: {0}" -f $missing.Count)
    if ($missing.Count -gt 0) {
      Note-Failure "Public trusted signals missing rootEventId: $($missing -join ', ')"
    }
  } catch {
    Note-Failure "Public trust lineage probe failed: $_"
  }

  $verifyScript = Join-Path $repoRoot "scripts\telemetry-activation\verify-production-telemetry.ps1"
  if (-not (Test-Path $verifyScript)) {
    Note-Failure "Missing verify-production-telemetry.ps1 at $verifyScript"
  } elseif (-not $env:OPERATOR_ACCESS_TOKEN) {
    Note-Warning "OPERATOR_ACCESS_TOKEN not set - skipping full production telemetry gate"
  } else {
    Write-Host ""
    Write-Host "== Delegating to verify-production-telemetry.ps1 =="
    & $verifyScript -ApiBase $ApiBase
    if ($LASTEXITCODE -ne 0) {
      Note-Failure "verify-production-telemetry.ps1 failed (exit $LASTEXITCODE)"
    }
  }
} else {
  Write-Host "Skipping production gates (-SkipProduction)"
}

Write-Host ""
if ($failures.Count -eq 0) {
  if ($warnings.Count -gt 0) {
    Write-Host "WARN:"
    $warnings | ForEach-Object { Write-Host "  - $_" }
  }
  Write-Host "PASS - Phase 0 invariants satisfied."
  exit 0
}

Write-Host "FAIL:"
$failures | ForEach-Object { Write-Host "  - $_" }
if ($warnings.Count -gt 0) {
  Write-Host "WARN:"
  $warnings | ForEach-Object { Write-Host "  - $_" }
}
exit 1
