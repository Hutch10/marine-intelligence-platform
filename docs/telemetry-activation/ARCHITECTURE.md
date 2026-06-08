# Telemetry Activation — Deployment Architecture

## Current production gap

| Component | State |
|-----------|--------|
| API (`api.vitalicast.com`) | Operational — reads Turso for `/live-conditions`, `/reef-alerts` |
| Turso | Operational — holds last writes (~2026-03-18 seed era) |
| Ingestion write path | **Absent** — no cron, no long-running worker |
| `live_ingestion_reports` on API feed-health | Empty (SQLite sidecar on Vercel; see [split-brain note](#split-brain-operational-note)) |

**Activation** = scheduled `ingest:live` with production Turso credentials so observation and reef timestamps advance.

---

## Intended runtime topology (after activation)

```
┌─────────────────────────────────────────────────────────────────┐
│  GitHub Actions (recommended) or VM/Fly cron                    │
│  schedule: every 15–20 min                                      │
│  command: pnpm --filter api ingest:live                         │
│  env: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, NDBC_*, CRW_*       │
└────────────────────────────┬────────────────────────────────────┘
                             │ writes observations, reef stress,
                             │ ingestion_runs (Turso via libsql)
                             ▼
                    ┌─────────────────┐
                    │  Turso (prod)   │
                    └────────┬────────┘
                             │ read
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Vercel — marine-intelligence-platform-api (serverless HTTP)    │
│  GET /live-conditions, /reef-alerts, /feed-health, /health    │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│  Vercel — marine-intelligence-platform (Next.js → oceansig.com) │
└─────────────────────────────────────────────────────────────────┘
```

Ingestion **does not** run inside the API server process (`apps/api/src/server.ts` does not start `ingest:scheduler`).

---

## Deployment target comparison

### A. Long-running worker (`ingest:scheduler`)

| Aspect | Detail |
|--------|--------|
| **How** | `pnpm --filter api ingest:scheduler` on VM, Fly Machine, Railway, Render worker |
| **Cadence** | NDBC ~20 min, CRW ~2 h, IOOS/ERDDAP ~45 min (if enabled) |
| **Pros** | Matches code defaults; immediate run on startup; per-source overlap locks |
| **Cons** | Always-on cost; must supervise restarts; not native to Vercel; ~$5–15+/mo minimum |
| **Best when** | Sub-20-minute NDBC latency is mandatory and you already run a small VM |

### B. Cron-based `ingest:live` (recommended)

| Aspect | Detail |
|--------|--------|
| **How** | Scheduled one-shot: GitHub Actions, Vercel Cron + HTTP trigger (not in repo), systemd timer |
| **Cadence** | Every 15–20 min (NDBC); full pipeline NDBC → CRW → optional IOOS/ERDDAP each run |
| **Pros** | No always-on host; fits Turso + serverless API; implemented in-repo via GHA workflow; failures visible in Actions |
| **Cons** | CRW runs every tick (extra NOAA load vs 2 h scheduler); max gap = cron period if a run fails |
| **Best when** | Activating telemetry quickly with minimal infra (this project today) |

### Recommendation: **B — cron-based `ingest:live`**

Use **GitHub Actions** on `*/20 * * * *` (see `.github/workflows/ingest-live-production.yml`). Rationale:

1. Production API is already on Vercel; adding a second always-on host only for scheduler is unnecessary for beta telemetry.
2. Repository already ships the unified worker; no new HTTP ingest route required.
3. Operational surface is one workflow + Turso secrets aligned with the API project.
4. NDBC freshness target (~20 min) maps directly to cron.

Re-evaluate **A** if you need CRW at 2 h only, IOOS/ERDDAP on independent intervals, or sub-15-minute NDBC without overlapping `ingest:live` runs.

---

## Worker environment requirements

| Variable | Required | Notes |
|----------|----------|-------|
| `TURSO_DATABASE_URL` | **Yes** | Same value as Vercel `marine-intelligence-platform-api` production |
| `TURSO_AUTH_TOKEN` | **Yes** | Read/write token; rotate with API |
| `NDBC_STATION_IDS` | **Yes** | Comma-separated; align with stations served in prod (e.g. `46042,41009`) |
| `CRW_TARGET_REGIONS` | **Yes** | Comma-separated; align with prod reef rows (e.g. `Great Barrier Reef,Caribbean`) |
| `NODE_ENV` | Recommended | Set `production` so async client fails closed without Turso |
| `IOOS_ENABLED` | No | Default `false` |
| `ERDDAP_ENABLED` | No | Default `false` |
| `MARINE_DB_PATH` | Optional | Local SQLite for `persistLiveIngestionReport` only; **not** shared with Vercel — see split-brain |

Template: `apps/api/.env.ingest-worker.example`

---

## Turso credential strategy

1. **Single source of truth:** Turso database used by production API (Vercel env on `marine-intelligence-platform-api`).
2. **Worker token:** Use the same `TURSO_AUTH_TOKEN` as the API (full access). Do not create a separate DB unless intentionally splitting environments.
3. **Storage:** GitHub Actions **encrypted secrets** (or host env / secret manager for VM cron). Never commit tokens.
4. **Rotation:** Rotate in Turso → update Vercel API env → update GHA secrets → run one manual `ingest:live` → verify `/live-conditions`.
5. **Staging:** Optional second Turso DB + `workflow_dispatch` with `environment: staging` (future); production workflow uses production secrets only.

---

## Monitoring requirements

| Signal | Method | Alert if |
|--------|--------|----------|
| Worker success | GitHub Actions workflow conclusion | Failed run |
| Observation freshness | `GET /live-conditions` max `timestamp` | Older than 6 h |
| Reef freshness | `GET /reef-alerts` max `timestamp` | Older than 24 h |
| Ingestion failures | GHA logs; optional `GET /operational-alerts` | `source_failed` / sustained `source_stale` |
| Turso connectivity | Worker exit code 2 (persist fail) or 1 (ingest fail) | Two consecutive failures |

Feed-health (`/feed-health`) may remain empty on Turso-only production until report persistence shares the API read path — use observation timestamps as the **primary** activation metric (see runbook).

---

## Failure recovery strategy

Built into `ingest:live` (no extra deployment):

1. **Per-source continue-on-error** — partial runs still persist telemetry for successful sources.
2. **Recovery backfill queue** — post-ingest step re-runs sources after circuit transitions.
3. **Split-brain reconciliation** — `reconcilePendingObservationsToTurso()` when local primary (N/A when Turso is primary).
4. **Next cron tick** — automatic retry.
5. **Manual recovery** — `workflow_dispatch` or `scripts/telemetry-activation/run-ingest-live.ps1` with prod env.
6. **Rollback** — set `IOOS_ENABLED=false` / `ERDDAP_ENABLED=false` and re-run (see `docs/live-ingestion-operations.md`).

---

## Cost estimates (order of magnitude)

| Option | Monthly estimate | Assumptions |
|--------|------------------|-------------|
| **GitHub Actions cron** | **$0–$20** | Public repo: within free minutes. Private: ~72 runs/day × 3–5 min ≈ 11k–22k min/mo — may need paid minutes or reduce frequency to `*/30`. |
| **Turso** | **$0–$29** | Free tier often sufficient for ingest volume; scale with row/storage growth. |
| **Long-running VM (Fly/Railway)** | **$5–15+** | Smallest always-on instance for `ingest:scheduler`. |
| **Vercel Cron** | **$0** on Pro with limits | Requires HTTP ingest endpoint (not shipped); out of scope for ops-only activation. |

**Recommended stack cost:** Turso existing + GitHub Actions ≈ **$0** for public repos or modest private usage.

---

## Split-brain operational note

- **Observations / reef stress / ingestion_runs:** written via `getAsyncAdapter()` → **Turso** when `TURSO_DATABASE_URL` is set.
- **`live_ingestion_reports` / feed-health:** `persistLiveIngestionReport()` uses **local SQLite** (`MARINE_DB_PATH`).

Production API `/feed-health` reads the Vercel-local SQLite file (empty reports), while `/live-conditions` reads Turso. **Telemetry activation success** = Turso observation timestamps advance; do not block launch on feed-history counts alone.

No architecture change in this sprint — document and monitor via `/live-conditions` and optional Turso SQL on `observations`.
