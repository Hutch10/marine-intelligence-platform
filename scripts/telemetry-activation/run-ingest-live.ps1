# Run production ingest:live using apps/api/.env.ingest-worker.local
# Usage: .\scripts\telemetry-activation\run-ingest-live.ps1

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$apiDir = Join-Path $repoRoot "apps\api"
$envFile = Join-Path $apiDir ".env.ingest-worker.local"

if (-not (Test-Path $envFile)) {
  Write-Error "Missing $envFile - copy apps/api/.env.ingest-worker.example and fill Turso credentials."
}

Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
  if ($_ -match '^([^=]+)=(.*)$') {
    $name = $matches[1].Trim()
    $value = $matches[2].Trim()
    Set-Item -Path "env:$name" -Value $value
  }
}

if (-not $env:TURSO_DATABASE_URL) {
  Write-Error "TURSO_DATABASE_URL is not set in $envFile"
}

$env:NODE_ENV = "production"
Push-Location $apiDir
try {
  pnpm run ingest:live
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
