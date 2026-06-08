# HutchStack Environmental Intelligence Harness — Implementation Spec

**Version:** 0.1.0  
**Status:** Implementing smallest complete slice  
**Companion:** `ENVIRONMENTAL-INTELLIGENCE-HARNESS-ASSESSMENT.md`

---

## Design principles

1. **Fail closed** — mock, stale, unverifiable, or missing-provenance environmental data must not be presented as live.
2. **No behavior removal** — stricter equivalents only; existing tests preserved.
3. **Audit everything** — ingestion, scheduler, verification, alert publish, human review → `environmental_harness_events`.
4. **Deterministic identity** — event IDs derived from stable content hashes; no timestamp-only hashes unless timestamp is event identity.
5. **Turso authority** — when `TURSO_DATABASE_URL` is set, ingestion reports and harness events persist to Turso.

---

## Shared schemas (`packages/shared/src/harness.ts`)

| Type | Purpose |
|------|---------|
| `IngestionEvent` | Per-source ingest run outcome |
| `SchedulerExecutionEvent` | GHA or in-process scheduler completion |
| `VerificationEvent` | External or API verification check result |
| `FreshnessStatus` | Classification + age + policy band |
| `EnvironmentalSignalProvenance` | Normalized source/feed/productDate/ingestedAt/hash |
| `AlertLifecycleStatus` | open / withheld / published / rejected |
| `AlertValidationEvent` | Pre-publish verification gate |
| `HumanReviewEvent` | Validation outcome or feedback decision |

Exported via `@marine/shared` index.

---

## Database

### Table: `environmental_harness_events`

```sql
CREATE TABLE IF NOT EXISTS environmental_harness_events (
  id TEXT PRIMARY KEY,
  event_kind TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  outcome TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_harness_events_kind_created
  ON environmental_harness_events (event_kind, created_at);
CREATE INDEX IF NOT EXISTS idx_harness_events_subject
  ON environmental_harness_events (subject_type, subject_id);
```

Migration file: `apps/api/src/db/migrations/0002_environmental_harness_events.sql`  
Also registered in `apps/api/src/db/schema.ts` for bootstrap.

---

## Freshness policy

| Source | API presentation | Verification script |
|--------|------------------|----------------------|
| NDBC (`noaa_ndbc`) | `live` if observation age ≤ 6h; `stale` if >6h; `withheld` if synthetic/mock | Hard FAIL >6h |
| CRW (`noaa_crw`) | `live` ≤48h; `stale` 48–72h (warn band); `withheld` >72h | WARN >48h, FAIL >72h |
| Synthetic (`synthetic*`) | Always `withheld` | Mock contamination FAIL |

`FreshnessStatus.policyBand`: `pass` | `warn` | `fail`.

---

## API contracts

### `GET /live-conditions`

Each condition MUST include:

- `freshnessClassification` (or `freshnessStatus` alias via shared type)
- `verificationStatus`: `verified` | `unverified` | `withheld`
- `provenance`: `EnvironmentalSignalProvenance`

Production (`NODE_ENV=production` or `VERCEL`): mock fallback → **503** with empty `conditions` and `telemetry.source: "withheld"`.

Stale NDBC (`freshnessClassification: "stale"`) MUST NOT be classified as `live`.

### `GET /reef-alerts`

Each alert MUST include:

- `ingestedAt` — ISO from `derived_signals.created_at`
- `sourceFeed` — from `source_reference`
- `productDate` — from `source_timestamp` / observed product date
- `freshnessStatus` — `FreshnessStatus`
- `verificationStatus`

Same production fail-closed on mock.

### `GET /feed-health`

When `TURSO_DATABASE_URL` is set:

- Read `live_ingestion_reports` from Turso via async adapter
- `source: "db"` when rows exist
- Ingestion failures visible in `latest_status_by_source` with `status: "failed"`

---

## Audit emission points

| Trigger | `event_kind` | `subject_type` |
|---------|--------------|----------------|
| `ingestLiveFeeds` completion | `ingestion` | `source` |
| GHA / scheduler run wrapper | `scheduler_execution` | `worker_run` |
| Harness verification script | `verification` | `endpoint` |
| Freshness classification | `freshness` | `signal` |
| `applyAlertActions` create | `alert_validation` | `operational_alert` |
| Validation outcome attach | `human_review` | `risk_evaluation` |

---

## Alert publish gate

Before `alertStore.setAlert`:

1. Build `AlertValidationEvent` with feed-health `generatedAt`, source status, verification outcome.
2. If source is `failed` or verification `withheld` → do not publish; emit audit with `outcome: rejected`.
3. Published alerts MUST include `metadataJson.harnessVerification`.

---

## Verification script extensions

Extend `scripts/telemetry-activation/verify-production-telemetry.{ps1,sh}`:

| Check | Failure mode |
|-------|--------------|
| DB reachability (`/health.dbReachable`) | Hard FAIL |
| NDBC freshness | Hard FAIL >6h |
| CRW freshness | WARN 48–72h, FAIL >72h |
| Mock/live contamination | Hard FAIL if `telemetry.source === "mock"` or `source` starts with `synthetic` |
| Persisted ingestion reports | Hard FAIL if `feed-health.summary.recent_history_count === 0` |
| Latest scheduler execution | Hard FAIL if `last_completed_at` null or older than 3h |
| Harness provenance fields | WARN if missing on sample alert/condition |

Exit nonzero on any hard failure.

---

## Acceptance tests (`environmental-harness.test.ts`)

| Test | Rule |
|------|------|
| `stale NDBC cannot render as fresh` | Age >6h → classification ≠ `live` |
| `CRW 48–72h emits WARN` | `policyBand === "warn"` |
| `CRW >72h hard fails` | classification `withheld`, verification withheld |
| `mock data cannot be promoted as live` | Production route builder returns 503 on mock |
| `reef alerts include provenance` | All harness fields present |
| `scheduler events persist` | Audit row after ingest report persist |
| `ingestion failures appear in feed-health` | Failed source in snapshot |
| `alert cannot publish without verification` | Rejected when verification missing |
| `human review action creates audit trail` | `human_review` event after outcome attach |

---

## Files changed (expected)

- `docs/hutchstack/*.md`
- `packages/shared/src/harness.ts`, `types.ts`, `index.ts`
- `apps/api/src/db/schema.ts`, `migrations/0002_*.sql`
- `apps/api/src/repositories/environmental-harness-events.ts`
- `apps/api/src/services/environmental-harness/*.ts`
- `apps/api/src/repositories/observations.ts`, `reef-stress.ts`, `live-ingestion-reports.ts`
- `apps/api/src/routes/live-conditions.ts`, `reef-alerts.ts`, `feed-health.ts`
- `apps/api/src/services/operational-alerts.ts`
- `apps/api/src/workers/ingest-live-feeds.ts`
- `scripts/telemetry-activation/verify-production-telemetry.*`
- `apps/api/src/services/environmental-harness.test.ts`
