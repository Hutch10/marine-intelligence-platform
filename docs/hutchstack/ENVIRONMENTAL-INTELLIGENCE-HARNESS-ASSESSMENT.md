# HutchStack Environmental Intelligence Harness — Architecture Assessment

**Repository:** Marine Intelligence Platform  
**Assessment date:** 2026-06-03  
**Scope:** Ingestion, scheduler, verification, freshness, alert, and human-review paths for environmental signals (NDBC, CRW, IOOS/ERDDAP).

---

## Executive summary

The platform already ingests NOAA NDBC and Coral Reef Watch (CRW) data on a GHA schedule, persists observations and derived signals to Turso in production, and exposes `/live-conditions`, `/reef-alerts`, and `/feed-health`. Gaps relative to the HutchStack harness are concentrated in **audit trail completeness**, **API-level provenance/freshness contracts**, **Turso reconciliation for ingestion telemetry**, and **fail-closed presentation rules** (mock/stale/unverifiable data must not appear as live).

---

## Layer 1 — Data ingestion

### Existing components

| Component | Path | Role |
|-----------|------|------|
| Orchestrator | `apps/api/src/workers/ingest-live-feeds.ts` | Runs NDBC → CRW → optional IOOS/ERDDAP; aggregates telemetry; persists ingestion report |
| NDBC runner | `apps/api/src/services/ingestion/run-ndbc.ts` | Fetch, validate (8h stale gate), insert observations, station diagnostics |
| CRW runner | `apps/api/src/services/ingestion/run-crw.ts` | Fetch, validate (72h stale gate), insert derived_signals + station_metrics |
| IOOS / ERDDAP | `run-ioos.ts`, `run-erddap.ts` | Optional regional feeds |
| Report persistence | `apps/api/src/repositories/live-ingestion-reports.ts` | Writes `live_ingestion_worker_runs` + `live_ingestion_reports` |
| Provenance records | `provenance_records` table (`schema.ts`) | Per-record lineage at ingest |
| GHA workflow | `.github/workflows/ingest-live-production.yml` | `*/20` cron, `pnpm run ingest:live` → Turso |

### DB tables

- `observations` — NDBC live conditions (per-metric temporal columns, `provenance_id`, `source`, `source_reference`, `created_at`)
- `derived_signals`, `station_metrics` — CRW reef stress
- `ingestion_runs`, `provenance_records`
- `live_ingestion_worker_runs`, `live_ingestion_reports`

### Gaps

1. Ingestion reports persist to **local SQLite only** in `persistLiveIngestionReport`; production GHA has no durable local file → `/feed-health` shows `recent_history_count: 0` on Turso-backed API.
2. No unified **harness audit event** emitted per ingestion decision.
3. `evaluateAlerts` from feed-health is wired in worker post-ingest but not in GHA CLI path consistently.
4. Report IDs use random suffixes — reproducibility requires stable hashes for audit subjects.

---

## Layer 2 — Scheduler execution

### Existing components

| Component | Path | Role |
|-----------|------|------|
| In-process scheduler | `apps/api/src/workers/scheduler.ts` | Interval-based NDBC/CRW/IOOS/ERDDAP (dev/long-running) |
| Production scheduler | `.github/workflows/ingest-live-production.yml` | Authoritative production cadence (~20 min cron; observed ~82 min avg) |

### Gaps

1. No `scheduler_execution` audit events persisted to DB.
2. `/feed-health` `last_completed_at` is the proxy for scheduler health but is empty when reports are not in Turso.
3. Operator console (`apps/web/app/operator/page.tsx`) exists in dev tree; production API deploy at `e1028d5` does not expose full operator routes.

---

## Layer 3 — Verification

### Existing components

| Component | Path | Role |
|-----------|------|------|
| Production telemetry scripts | `scripts/telemetry-activation/verify-production-telemetry.ps1`, `.sh` | HTTP checks: `/health`, `/live-conditions`, `/reef-alerts`; NDBC >6h FAIL; CRW >48h WARN, >72h FAIL |
| Hostile verification tests | `apps/api/src/verification/hostile-verification.test.ts` | Contract/regression guards |
| Operational validation | `apps/api/src/verification/operational-validation.test.ts` | Feed-health shape checks |
| Ingest validators | `run-ndbc.ts`, `run-crw.ts` | Reject stale/mock/synthetic at write time |
| Synthetic exclusion | `shouldExcludeSyntheticBaselineData()` in repositories | Filters `synthetic%` sources when enabled |

### Gaps

1. Scripts do not yet check **mock contamination**, **persisted ingestion reports**, or **latest scheduler execution** explicitly.
2. No `verification_event` audit trail in DB.
3. API routes can still return **mock fallback** with HTTP 200 when DB is unavailable (non-production and some production error paths).

---

## Layer 4 — Source freshness

### Existing components

| Component | Path | Role |
|-----------|------|------|
| Ingest stale gates | NDBC 8h, CRW 72h, ERDDAP 48h, IOOS 24h | Write-time rejection |
| Feed-health stale | `live-ingestion-reports.ts` — default 6h on `completed_at` | Operational staleness for ingestion runs |
| Freshness governance | `apps/api/src/services/freshness-governance.ts` | Maps feed-health → withhold/promote decisions |
| Shared type | `LiveMarineCondition.freshnessClassification` in `packages/shared/src/types.ts` | **Defined but not populated** in `observations.ts` |

### Gaps

1. `/live-conditions` does not expose normalized freshness/provenance metadata on every condition.
2. `/reef-alerts` lacks `ingestedAt`, `sourceFeed`, `productDate`, `freshnessStatus`, `verificationStatus`.
3. CRW daily product cadence (midnight UTC product date) requires **48h WARN / 72h FAIL** at verification — implemented in scripts but not in API response fields.

---

## Layer 5 — Alert generation

### Existing components

| Component | Path | Role |
|-----------|------|------|
| Rule engine | `apps/api/src/services/operational-alerts.ts` | `evaluateFeedHealthForAlerts` — source_failed, source_stale, repeated_degraded |
| Anomaly rules | `run-ndbc.ts` | High SST/wave/wind/pressure → operational alerts |
| Persistence | `operational_alerts` table, `DbAlertStore` | Alert lifecycle with investigation linkage |
| Investigation events | `investigation-events.ts` | Case opened on alert create |

### Gaps

1. Alerts published without explicit **verification metadata** in harness contract.
2. No `alert_validation_event` audit rows.
3. Reef stress items on `/reef-alerts` are not gated by verification status before presentation.

---

## Layer 6 — Human review

### Existing components

| Component | Path | Role |
|-----------|------|------|
| Validation API | `apps/api/src/routes/validation.ts` | Risk evaluation outcomes, feedback, summary |
| Validation repository | `marine-intelligence-validation.ts` | Predictions, outcomes, feedback linkage |
| Investigation timeline | `investigation-events.ts` | Case workflow events |
| Operator UI (dev) | `apps/web/app/operator/page.tsx`, `operator-status.ts` | Feed-health / status surfaces |

### Gaps

1. Human review decisions (outcome attach, feedback) do not emit **harness audit events**.
2. No cross-link from environmental signal provenance → review decision in audit table.

---

## API routes inventory

| Route | File | Environmental data? | Freshness/provenance today |
|-------|------|---------------------|----------------------------|
| `GET /live-conditions` | `routes/live-conditions.ts` | Yes | Partial (`source`, `sourceFeed`, `ingestedAt`); no `freshnessClassification` |
| `GET /reef-alerts` | `routes/reef-alerts.ts` | Yes | `source` only; missing harness fields |
| `GET /feed-health` | `routes/feed-health.ts` | Telemetry | Local SQLite only; Turso split-brain |
| `GET /health` | `server.ts` | Aggregated | Includes feed-health snapshot |
| `GET /operator/status` | `routes/operator-status.ts` | Ops | Dev/deploy gap on production |

---

## UI surfaces

| Surface | Path | Harness relevance |
|---------|------|-------------------|
| Sidebar operator link | `apps/web/components/layout/sidebar.tsx` | Navigation to operator console |
| Operator page | `apps/web/app/operator/page.tsx` | Feed-health, lineage (dev) |
| Public API consumers | External | `/live-conditions`, `/reef-alerts` |

---

## Reproducibility and audit posture

| Concern | Current state | Harness target |
|---------|---------------|----------------|
| Deterministic event IDs | Random suffixes on ingestion report IDs | Stable content hashes for audit subjects |
| Audit trail | Investigation events, provenance_records | Unified `environmental_harness_events` for all layers |
| Fail-closed | Production Turso required in `getAsyncAdapter` | Extend to API presentation + alert publish |
| Mock contamination | Mock fallback on DB miss | HTTP 503 / withheld in production |

---

## Risk register (pre-implementation)

| Risk | Severity | Notes |
|------|----------|-------|
| Turso ingestion report split-brain | High | `/feed-health` empty in production |
| Mock fallback as live | High | Violates harness fail-closed |
| CRW 48h false FAIL | Medium | Mitigated in verification scripts; API fields still missing |
| Scheduler success rate 84% | Medium | Below 95% burn-in target |
| Operator routes not on production API | Low | Does not block harness API layer |

---

## Recommended implementation order

1. `environmental_harness_events` table + shared schemas  
2. Freshness/provenance enrichment on `/live-conditions` and `/reef-alerts`  
3. Turso-backed ingestion report persist + `/feed-health` read  
4. Harness audit emission on ingest, scheduler, alert publish, human review  
5. Verification script hardening + harness test suite  

See `ENVIRONMENTAL-INTELLIGENCE-HARNESS-SPEC.md` for concrete contracts and acceptance tests.
