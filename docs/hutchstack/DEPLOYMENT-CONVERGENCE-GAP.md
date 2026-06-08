# Deployment Convergence Gap Assessment

**Assessment time (UTC):** 2026-06-08T05:00:00Z  
**Production API:** https://api.vitalicast.com  
**Production web:** https://oceansig.com  
**Methodology:** Compare local HEAD, remote `main`, live HTTP probes, and repository file presence. No assumptions about schema or deploy success.

---

## Commit divergence

| Reference | SHA | Notes |
|-----------|-----|-------|
| **Local HEAD** | `85d5e3e` | Docs commit; Phase 3/4 code in working tree (modified + untracked) |
| **Remote `origin/main`** | `e1028d53` | Last Vercel production deploy (2026-06-04) |
| **Local vs remote** | Local **behind 4** commits on shared history; Phase 3/4 work **not pushed** |

Remote commits not in local (telemetry activation fixes):

- `040d87b` — Production telemetry activation workflow
- `3930f2f` — Create `.data` before ingest:live for report persistence
- `0f5e8b3` — Read reef alerts from Turso when local SQLite absent
- `e1028d5` — Build `@marine/shared` before Vercel API compile

---

## Production route gap (HTTP probes)

Probed 2026-06-08T04:52 UTC against https://api.vitalicast.com.

| Route | Production | Local codebase (undeployed) |
|-------|------------|----------------------------|
| `GET /health` | **200** | Registered |
| `GET /live-conditions` | **200** (no lineage fields) | Registered + Phase 4 trust filter |
| `GET /reef-alerts` | **200** (no lineage fields) | Registered + Phase 4 trust filter |
| `GET /feed-health` | **200** (empty history) | Registered + Turso async read |
| `GET /internal/operator/status` | **404** | Registered (`operator-status.ts`) |
| `GET /internal/operator/replay-validation` | **404** | Registered (`replay-validation.ts`) |
| `GET /internal/operator/review-queue` | **404** (not deployed) | Registered (`operator-review-queue.ts`) |
| `GET /api/replay/signal/:id` | **404** | Registered (`replay.ts`) |
| `GET /api/replay/alert/:id` | **404** | Registered |
| `GET /api/replay/event/:id` | **404** | Registered |
| `POST /internal/operator/replay-validation/run` | **404** | Registered |
| `https://oceansig.com/operator` | **404** | `apps/web/app/operator/page.tsx` exists locally |

---

## Schema / migration gap

Migrations exist locally under `apps/api/src/db/migrations/` but **do not exist on remote `main`** (`gh api …/migrations?ref=main` → 404).

| Migration | Purpose | On remote `main` | Runtime ensure (local) | Production verified |
|-----------|---------|-------------------|------------------------|---------------------|
| `0002_environmental_harness_events.sql` | Harness events table | Unknown | `ensureEnvironmentalHarnessEventsTable` | Not verified |
| `0003_environmental_harness_lineage.sql` | Harness event lineage columns + indexes | **No** | `ensureLineageColumns` | **No** |
| `0004_environmental_review_queue.sql` | Review queue table + indexes | **No** | `ensureEnvironmentalReviewQueueTable` | **No** |
| `0005_environmental_signal_lineage.sql` | Signal lineage on observations / derived_signals / station_metrics | **No** | `ensureObservationLineageColumns`, reef-stress ensures | **No** |

**Production schema state:** Not directly queried (no Turso credentials in validation environment). Public API responses contain **no** lineage columns, consistent with pre-Phase-4 deploy.

---

## Public API response gap

### `/live-conditions` (production observed)

Returned keys: `stationId`, `timestamp`, `sstC`, `waveHeightM`, `windSpeedMps`, `pressureHpa`, `source`, `sourceFeed`, `ingestedAt`

**Missing from production (required Phase 4):**

- `signalId`
- `rootEventId`
- `verificationEventId`
- `provenanceHash`
- `trustStatus`
- `trustedForPromotion`
- `evidenceStatus`
- `verificationStatus`
- `freshnessStatus`

### `/reef-alerts` (production observed)

Returned keys: `region`, `stationId`, `timestamp`, `sstAnomalyC`, `hotSpotC`, `dhw`, `stressLevel`, `source`, `outputClass`

**Missing:** all harness lineage and trust fields listed above, plus `productDate`, `verificationStatus`.

---

## Feature module gap (local only)

The following directories/files exist locally but are **absent from deployed commit `e1028d53`**:

### Phase 2 — Replay engine

- `apps/api/src/routes/replay.ts`
- `apps/api/src/services/environmental-harness/replay*.ts`
- `packages/shared/src/harness-replay.ts`

### Phase 3 — Operator console

- `apps/api/src/routes/operator-status.ts`
- `apps/api/src/routes/replay-validation.ts`
- `apps/api/src/routes/operator-review-queue.ts`
- `apps/api/src/repositories/environmental-review-queue.ts`
- `apps/api/src/services/environmental-harness/operator-console.ts`
- `apps/web/app/operator/page.tsx`
- `apps/web/lib/server/operator-status.ts`
- `packages/shared/src/harness-operator.ts`

### Phase 4 — Signal lineage enforcement

- `apps/api/src/db/migrations/0005_environmental_signal_lineage.sql`
- `apps/api/src/services/environmental-harness/signal-lineage.ts`
- `apps/api/src/services/environmental-harness/lineage-presentation.ts`
- `apps/api/src/services/environmental-harness-lineage.test.ts`
- `packages/shared/src/harness.ts` (lineage types)
- Modified: `run-ndbc.ts`, `run-crw.ts`, `observations.ts`, `reef-stress.ts`, `live-conditions.ts`, `reef-alerts.ts`

### Feed-health Turso persistence (partial gap)

- Local `live-ingestion-reports.ts` adds `persistLiveIngestionReportAsync` / `getLiveIngestionHealthSnapshotAsync` for Turso
- Production `/feed-health` returns `source: "db"` but `recent_history_count: 0`, `last_completed_at: null` — ingestion reports **not visible** via API despite GHA ingest success

---

## Environment / configuration gap

| Variable | Required for | Production status |
|----------|--------------|-------------------|
| `TURSO_DATABASE_URL` | API + ingest | **Set** (inferred: `dbReachable: true`, live NOAA data) |
| `TURSO_AUTH_TOKEN` | Turso auth | **Set** (inferred) |
| `OPERATOR_ACCESS_TOKEN` | Operator route gating | **Not confirmed**; routes absent regardless |
| `NDBC_STATION_IDS` | GHA ingest | **Set** (GHA secrets; 2 stations observed) |
| `CRW_TARGET_REGIONS` | GHA ingest | **Set** (Florida Keys, Southeast Florida observed) |

---

## Verification tooling gap

| Tool | Status |
|------|--------|
| `verify-production-telemetry.ps1` | **Broken on Windows** — em-dash encoding parse error at line 169 |
| `verify-production-telemetry.sh` | Not exercised in validation shell |
| H+72 replay gate | Blocked — operator route 404 + token unset |

---

## What production already satisfies (baseline)

These capabilities **do not** require Phase 3/4 deploy and are operational today:

- API and web reachability
- Turso-backed NDBC live conditions (fresh ~1.7 h at pre-deploy probe)
- CRW reef alerts (non-mock, ~48 h product age — WARN band)
- GitHub Actions scheduled ingest (~98% success over last 50 schedule runs)
- Fail-closed mock withholding (no synthetic sources in public API)

---

## Convergence actions required

1. **Merge** local Phase 2/3/4 work with remote `main` (resolve 4-commit behind state).
2. **Push** to `main` to trigger Vercel API + web redeploy.
3. **Apply schema** — migrations 0003–0005 via runtime ensure functions on first API/ingest access (or explicit Turso migration run).
4. **Configure** `OPERATOR_ACCESS_TOKEN` on API and web Vercel projects.
5. **Trigger** post-deploy `ingest:live` so new rows carry lineage (legacy rows remain unverified).
6. **Verify** all routes and fields via live HTTP probes.
7. **Repair** PS1 verification script (UTF-8 / ASCII-safe strings).
8. **Re-run** replay validation and feed-health checks with observed evidence.

---

## Pre-convergence promotion state

Per `docs/hutchstack/PHASE4-PRODUCTION-VALIDATION.md`:

**REMAIN RESEARCH-READY LIMITED BETA** — HutchStack trust chain not operational in production.

This gap assessment documents **why** convergence is required before any promotion re-evaluation.
