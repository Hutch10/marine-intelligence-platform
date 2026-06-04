# Telemetry Activation

Activate production live telemetry by running the existing `ingest:live` worker on a schedule against the **same Turso database** as `marine-intelligence-platform-api`.

| Document | Purpose |
|----------|---------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Deployment target comparison, recommendation, cost notes |
| [RUNBOOK.md](./RUNBOOK.md) | Startup, restart, monitoring, verification, failure recovery |

**Quick start (GitHub Actions — recommended):**

1. Add repository secrets (see [RUNBOOK.md § Credentials](./RUNBOOK.md#credentials)).
2. Enable workflow `.github/workflows/ingest-live-production.yml`.
3. Run **workflow_dispatch** once; then confirm [verification checklist](./RUNBOOK.md#verification-checklist).

**Manual one-shot (operator workstation):**

```powershell
cd apps\api
Copy-Item .env.ingest-worker.example .env.ingest-worker.local
# Fill TURSO_* and station lists from Vercel production
Get-Content .env.ingest-worker.local | ForEach-Object { if ($_ -match '^([^#][^=]+)=(.*)$') { Set-Item -Path "env:$($matches[1])" -Value $matches[2] } }
pnpm run ingest:live
```

Or from repo root: `.\scripts\telemetry-activation\run-ingest-live.ps1`
