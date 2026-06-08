# Telemetry Activation — Operational Runbook

Production API: `https://api.vitalicast.com`  
Production web: `https://oceansig.com`  
Recommended worker: GitHub Actions workflow `ingest-live-production.yml`

---

## Credentials

Configure these **GitHub repository secrets** (Settings → Secrets and variables → Actions):

| Secret | Source |
|--------|--------|
| `TURSO_DATABASE_URL` | Copy from Vercel project `marine-intelligence-platform-api` → Production |
| `TURSO_AUTH_TOKEN` | Same (secret) |
| `NDBC_STATION_IDS` | Production station list (must include stations on dashboard, e.g. `46042,41009`) |
| `CRW_TARGET_REGIONS` | Production reef regions (e.g. `Great Barrier Reef,Caribbean`) |

Optional **repository variables** (not secrets):

| Variable | Default | Purpose |
|----------|---------|---------|
| `IOOS_ENABLED` | `false` | Set `true` only when IOOS URLs/IDs configured |
| `ERDDAP_ENABLED` | `false` | Set `true` only when ERDDAP configured |

Verify Vercel API already has the same `TURSO_*` values (`vercel env ls` or dashboard).

---

## Startup procedure

### 1. Preflight (local, optional)

```powershell
cd c:\Users\hetfw\marine-intelligence-platform\apps\api
# Load production Turso creds into session (never commit .env.ingest-worker.local)
pnpm run ingest:live
```

Expect exit code `0`, JSON report with `noaa_ndbc` and CRW source `noaa_crw` (or `noaa_coral_reef_watch`) runs.

### 2. Enable GitHub Actions worker

1. Commit `.github/workflows/ingest-live-production.yml` on default branch.
2. Add secrets listed above.
3. Actions → **Production live ingestion** → **Run workflow** (`workflow_dispatch`).
4. Wait for green run (~3–8 minutes typical).

### 3. Confirm production read path

Run verification checklist below.

### 4. Enable schedule

Workflow cron `*/20 * * * *` (UTC) runs automatically after merge. No Vercel change required.

---

## Restart procedure

| Scenario | Action |
|----------|--------|
| **Stuck / failed run** | Actions → re-run failed job, or **Run workflow** manually |
| **Pause ingestion** | Disable workflow (Actions → workflow → ⋮ → Disable) or remove `schedule` trigger via PR |
| **Resume ingestion** | Re-enable workflow or merge schedule back; manual dispatch once |
| **Rotate Turso token** | Update Turso → Vercel API env → GHA secrets → manual `workflow_dispatch` |
| **Change station list** | Update `NDBC_STATION_IDS` / `CRW_TARGET_REGIONS` secrets → next run picks up |

Long-running alternative (`ingest:scheduler`): restart systemd/Fly process (`systemctl restart marine-ingest` or `fly apps restart` per your host).

---

## Monitoring procedure

### Daily (automated)

- GitHub Actions: workflow **Production live ingestion** — last run succeeded.

### Daily (manual, 2 minutes)

```powershell
.\scripts\telemetry-activation\verify-production-telemetry.ps1
```

Or bash:

```bash
./scripts/telemetry-activation/verify-production-telemetry.sh
```

### Weekly

1. `GET /operational-alerts` — no unexplained sustained `source_stale` for `noaa_ndbc`.
2. Compare GHA duration trend (sudden 2× increase → NOAA slowness or station misconfig).
3. Turso dashboard — storage/row growth normal.

### Alert thresholds (operator)

| Signal | Metric | Warn | Hard fail | Notes |
|--------|--------|------|-----------|-------|
| **NDBC** (`/live-conditions`) | Latest observation age | - | **> 6 h** | Real-time station telemetry |
| **CRW** (`/reef-alerts`) | Latest product date age | **> 48 h** | **> 72 h** | Daily NOAA virtual-station product |
| GHA ingest | Consecutive failures | - | **>= 2** | Page operator |
| `ingest:live` | Exit code | - | `1` / `2` | Ingest or persistence failure |

**CRW freshness policy:** NOAA Coral Reef Watch virtual-station files publish **one row per calendar day**. The API `timestamp` is the **product date at midnight UTC**, not ingest time. Between NOAA publishing cycles, reef alert age commonly exceeds 48 h while data remains the latest available product. Verification scripts (`verify-production-telemetry.ps1` / `.sh`) emit **WARN** when CRW age is 48-72 h and **FAIL** only above 72 h - aligned with ingest `staleAfterMs` (72 h) in `run-crw.ts`. Do not treat CRW WARN alone as platform failure when NDBC is fresh.

---

## Verification checklist

Run after first successful worker execution and after any incident.

- [ ] **GitHub Actions:** Latest `ingest-live-production` run **green** (exit 0).
- [ ] **Live conditions:** `curl -s https://api.vitalicast.com/live-conditions` — at least one `timestamp` **newer than** `2026-03-18T10:50:00.000Z`.
- [ ] **Reef alerts:** `curl -s https://api.vitalicast.com/reef-alerts` — `timestamp` advanced vs pre-activation baseline.
- [ ] **Health:** `curl -s https://api.vitalicast.com/health` — `dbReachable: true`.
- [ ] **Feed-health (informational):** `curl -s https://api.vitalicast.com/feed-health` — may still show `last_completed_at: null` on Turso-only prod ([split-brain](./ARCHITECTURE.md#split-brain-operational-note)); do not use as sole gate.
- [ ] **Dashboard:** `oceansig.com` station/reef ages reflect fresh data (browser refresh).
- [ ] **Optional Turso SQL:** `SELECT MAX(observed_at) FROM observations;` — ISO time within 6 h.

**Activation complete when** live-condition timestamps advance on two consecutive cron cycles (~40 min apart).

---

## Failure recovery

### Worker failed in GitHub Actions

1. Open failed run → **Run ingest:live** step logs.
2. Common causes:
   - Missing/invalid `TURSO_*` → fix secrets.
   - `NDBC_STATION_IDS` empty → fix secret.
   - NOAA timeout → retry; reduce station count temporarily.
   - `NDBC ingestion did not yield any usable station observations` → check NOAA feed outage or stale rejection rules.
3. Re-run workflow manually.
4. If two failures: run local `ingest:live` with same env to reproduce.

### API still shows old timestamps after green worker

1. Confirm GHA secrets match **production** Turso URL (not staging/local).
2. Confirm `NDBC_STATION_IDS` includes stations returned by `/live-conditions`.
3. Query Turso `MAX(observed_at)` — if fresh in DB but API stale, API env mismatch (wrong `TURSO_DATABASE_URL` on Vercel).

### Partial source failure

Inspect JSON report in GHA logs: `runs[]` per source. `partial` status is acceptable if NDBC succeeded. IOOS/ERDDAP off by default.

### Disable auxiliary sources

Set repository variable `IOOS_ENABLED=false`, `ERDDAP_ENABLED=false` (defaults). See `docs/live-ingestion-operations.md` rollback.

---

## Related documents

- `docs/live-ingestion-operations.md` — IOOS/ERDDAP staging verification
- `VERCEL_DEPLOYMENT.md` — Turso env on API project
- `docs/telemetry-activation/ARCHITECTURE.md` — design comparison and costs
