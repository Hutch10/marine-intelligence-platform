# Phase 4 Production Validation — HutchStack Trust Chain

**Platform:** Marine Intelligence Platform  
**Production API:** https://api.vitalicast.com  
**Production web:** https://oceansig.com  
**Validation executed (UTC):** 2026-06-08T04:52:23Z  
**Deployed API commit (remote `main`):** `e1028d53` — *fix(api): build @marine/shared before Vercel API compile*  
**Phase 3/4 code status:** Present in local development tree only; **not merged or deployed to production**

**Methodology:** Fail-closed. All conclusions below are based on direct HTTP probes, GitHub Actions run history, and repository state. No lineage, replay evidence, or migration application was inferred where not directly observed.

---

## Executive summary

Production telemetry ingestion is **operational** (NDBC fresh, CRW within daily-product warn window, scheduled GitHub Actions at 98% success over the last 50 schedule runs). The public API serves live NOAA-backed data and does **not** promote mock sources.

The **HutchStack trust chain required for Phase 4 promotion is not present in production**:

| Capability | Expected (Phase 4) | Observed (production) |
|------------|-------------------|----------------------|
| Signal lineage on public API | `signalId`, `rootEventId`, `provenanceHash`, `trustStatus` | **Absent** on all rows |
| Lineage-missing signals withheld | Filtered or `unverified_lineage` | **Promoted without trust metadata** |
| Operator console routes | `GET /internal/operator/*` | **404 Not found** |
| Operator web UI | `https://oceansig.com/operator` | **404 Not found** |
| Replay validation job | `GET /internal/operator/replay-validation` | **404 Not found** |
| Feed-health persistence | `recent_history_count > 0` | **0** |
| Turso migrations 0003–0005 | Applied | **Not verifiable** (no DB access; migrations not on remote `main`) |

**Verdict:** Production cannot demonstrate lineage enforcement, replay-verifiable promotion, or operator burn-in surfaces. Promotion beyond RESEARCH-READY LIMITED BETA is **not supported by production evidence**.

---

## 1. Database validation

### 1.1 Migration application (0003, 0004, 0005)

| Migration | Purpose | Remote `main` | Production DB |
|-----------|---------|---------------|---------------|
| `0003_environmental_harness_lineage.sql` | Harness event lineage columns + indexes on `environmental_harness_events` | **Not on remote `main`** (migrations folder absent) | **Not verified** |
| `0004_environmental_review_queue.sql` | `environmental_review_queue` table + indexes | **Not on remote `main`** | **Not verified** |
| `0005_environmental_signal_lineage.sql` | Lineage columns on `observations`, `derived_signals`, `station_metrics` + indexes | **Not on remote `main`** | **Not verified** |

**Evidence:**

- `gh api repos/Hutch10/marine-intelligence-platform/contents/apps/api/src/db/migrations?ref=main` → **HTTP 404** (directory does not exist on deployed branch).
- Migrations exist locally under `apps/api/src/db/migrations/` but are **untracked / not pushed**.
- No Turso credentials or direct SQL access were available during this validation; schema and column population **cannot be confirmed**.

**Result:** **FAIL (blocked)** — migration application unverified; Phase 4 schema not present on production deployment branch.

### 1.2 Expected schema contracts (local reference only)

When deployed, migration `0005` adds:

- `observations`: `signal_id`, `root_event_id`, `source_ingestion_event_id`, `verification_event_id`, `provenance_hash`
- `derived_signals` / `station_metrics`: `harness_signal_id`, `root_event_id`, `source_ingestion_event_id`, `verification_event_id`, `provenance_hash`
- Indexes: `idx_observations_signal_id`, `idx_derived_signals_harness_signal_id`, `idx_station_metrics_harness_signal_id`

**Population check:** Not performed. Public API responses contain no lineage fields, consistent with pre-Phase-4 presentation layer (see §4).

---

## 2. Deployment validation

### 2.1 API deployment

| Check | Result | Evidence |
|-------|--------|----------|
| API reachable | **PASS** | `GET /health` → HTTP 200 |
| Database connectivity | **PASS** | `"dbReachable": true` |
| Phase 3 operator routes | **FAIL** | `GET /internal/operator/status` → 404 |
| Phase 3 replay validation | **FAIL** | `GET /internal/operator/replay-validation` → 404 |
| Phase 2 replay API | **FAIL** | `GET /api/replay/signal/test` → 404 |
| Deployed commit | **Observed** | Remote `main` = `e1028d53` (pre-Phase 3/4) |

**Health snapshot (2026-06-08T04:53:27Z):**

```json
{
  "status": "ok",
  "uptimeSeconds": 173,
  "dbReachable": true
}
```

### 2.2 Web deployment

| Check | Result | Evidence |
|-------|--------|----------|
| Main site | **PASS** | `GET https://oceansig.com` → HTTP 200 |
| Operator console | **FAIL** | `GET https://oceansig.com/operator` → HTTP 404 |

### 2.3 `OPERATOR_ACCESS_TOKEN`

| Check | Result | Evidence |
|-------|--------|----------|
| Token configured (validation environment) | **Not observed** | `OPERATOR_ACCESS_TOKEN` unset in local validation shell |
| Token effectiveness in production | **Not testable** | Operator routes return 404 regardless of token |

**Result:** **FAIL** — API and web deploy successfully for baseline telemetry, but Phase 3/4 HutchStack surfaces are not deployed; operator token cannot be validated against missing routes.

---

## 3. Ingestion validation

### 3.1 Scheduler / GitHub Actions

| Metric | Value |
|--------|-------|
| Workflow | `ingest-live-production.yml` |
| Schedule | `*/20 * * * *` (UTC) |
| Last 50 schedule runs | **49 success / 1 failure** (98% success rate) |
| Latest successful run | [27114463773](https://github.com/Hutch10/marine-intelligence-platform/actions/runs/27114463773) — 2026-06-08T03:34:13Z |

**Latest run summary (from job log):**

- NDBC: `inserted_count: 2`, status `success` (stations 46042, 41009)
- CRW: `inserted_count: 0`, status `partial` (duplicate product day)
- Aggregate: `inserted_count: 2`, overall `partial`

### 3.2 NDBC (live conditions)

| Station | Observation time (UTC) | Ingested at (UTC) | Source | Lineage fields |
|---------|------------------------|-------------------|--------|----------------|
| 46042 | 2026-06-08T03:10:00Z | 2026-06-08T03:34:27.538Z | `noaa_ndbc` | **None** |
| 41009 | 2026-06-08T03:00:00Z | 2026-06-08T03:34:28.094Z | `noaa_ndbc` | **None** |

- Observation age at validation: **~1.7 h** (within 6 h NDBC freshness gate).
- `signalId`, `rootEventId`, `verificationEventId`, `provenanceHash`: **not present** in API response.

### 3.3 CRW (reef alerts)

| Region | Product timestamp (UTC) | Product age at validation | Source | Lineage fields |
|--------|-------------------------|---------------------------|--------|----------------|
| Florida Keys | 2026-06-06T00:00:00Z | **~47.9 h** | `noaa_crw` | **None** |
| Southeast Florida | 2026-06-06T00:00:00Z | **~47.9 h** | `noaa_crw` | **None** |

- CRW age is in **WARN** band (48–72 h policy) but below hard-fail threshold.
- `signalId`, `rootEventId`, `verificationEventId`, `provenanceHash`: **not present** in API response.
- `verificationStatus`, `productDate`, `trustStatus`: **not present**.

**Result:** **PARTIAL PASS** — fresh NDBC ingestion confirmed; CRW within warn window; **lineage fields not observable on any ingested public signal**.

---

## 4. Public API validation

Validation time: **2026-06-08T04:52–04:53 UTC**

### 4.1 `/live-conditions`

| Criterion | Expected (Phase 4) | Observed |
|-----------|-------------------|----------|
| HTTP status | 200 (or 503 if all lineage-missing) | **200** |
| Response keys per condition | Includes `signalId`, `rootEventId`, `trustStatus`, `trustedForPromotion`, `evidenceStatus` | **Only:** `stationId`, `timestamp`, `sstC`, `waveHeightM`, `windSpeedMps`, `pressureHpa`, `source`, `sourceFeed`, `ingestedAt` |
| Lineage-complete signals trusted | `trustStatus: "trusted"` with `rootEventId` | **No trust fields returned** |
| Lineage-missing signals withheld | Filtered out in production | **2 stations returned without lineage** |
| Mock data promoted | None | **PASS** — sources are `noaa_ndbc` only |
| Stale data promoted | NDBC >6 h should fail gate | **PASS** — observations ~1.7 h old |

**Sample (observed):**

```json
{
  "stationId": "46042",
  "timestamp": "2026-06-08T03:10:00Z",
  "source": "noaa_ndbc",
  "ingestedAt": "2026-06-08T03:34:27.538Z"
}
```

### 4.2 `/reef-alerts`

| Criterion | Expected (Phase 4) | Observed |
|-----------|-------------------|----------|
| HTTP status | 200 | **200** |
| Harness / lineage fields | Present on trusted rows | **Absent** |
| Lineage-missing withheld | Yes in production harness mode | **2 alerts returned without lineage** |
| Mock data promoted | None | **PASS** — `source: "noaa_crw"`, `outputClass: "derived"` |
| Stale beyond 72 h | Should hard-fail gate | **PASS** — product age ~47.9 h |

### 4.3 `/feed-health`

| Field | Expected (H+72 gate) | Observed |
|-------|---------------------|----------|
| `recent_history_count` | > 0 | **0** |
| `last_completed_at` | Within 3 h of validation | **`null`** |
| `latest_status_by_source` | NDBC + CRW entries | **`[]` (empty)** |
| `healthy_source_count` | ≥ 1 | **0** |

**Full observed payload:**

```json
{
  "source": "db",
  "summary": {
    "latest_source_count": 0,
    "recent_history_count": 0,
    "last_completed_at": null
  },
  "latest_status_by_source": [],
  "recent_history": []
}
```

**Note:** GitHub Actions ingestion reports success with NDBC inserts, but feed-health persistence to the API-visible store is **empty**. This disconnect was not resolved during validation.

**Result:** **FAIL** for HutchStack trust enforcement. Baseline NOAA data is live and non-mock, but Phase 4 lineage filtering and feed-health visibility requirements are **not met**.

---

## 5. Replay validation

| Check | Result | Evidence |
|-------|--------|----------|
| Route reachable | **FAIL** | `GET /internal/operator/replay-validation` → 404 |
| `rootEventId` exists in samples | **Not testable** | No replay job endpoint |
| Replay packet generation | **Not testable** | — |
| Publication decision reconstructable | **Not testable** | — |
| Evidence status reported | **Not testable** | — |
| No synthesized evidence | **Not testable** | — |
| `OPERATOR_ACCESS_TOKEN` gate | **Not testable** | Route absent; token unset in validation env |

Automated gate script status:

- `verify-production-telemetry.ps1` — **Could not execute** (PowerShell parse error at line 169: em-dash encoding in CRW warn string).
- `verify-production-telemetry.sh` — **Not run** (path unavailable in validation shell).

**Result:** **FAIL (blocked)** — replay validation cannot run against production; HutchStack replay burn-in gate is **not satisfied**.

---

## 6. Operator console validation

| Surface | Expected | Observed |
|---------|----------|----------|
| `GET /internal/operator/status` | Harness aggregation (freshness, verification, review queue) | **404** |
| Replay validation panel | `replay-validation` section in operator status | **Not reachable** |
| Review queue | `GET /internal/operator/review-queue` | **404** (not probed; same deployment gap) |
| Active / suppressed alerts | Operator status harness section | **Not reachable** |
| Freshness status | Operator + public harness fields | **Public harness fields absent** |
| Verification status | Operator + public harness fields | **Public harness fields absent** |
| Web operator UI | `https://oceansig.com/operator` | **404** |

**Result:** **FAIL** — operator console is not deployed to production.

---

## 7. H+72 burn-in readiness review

Reference gate: `docs/hutchstack/H72-REPLAY-VALIDATION-GATE.md`  
Prior burn-in report: `docs/operational-validation/72-HOUR-BURN-IN-REPORT.md` (classification: RESEARCH-READY LIMITED BETA)

| Dimension | Assessment | Production evidence |
|-----------|------------|---------------------|
| **Scheduler reliability** | **Good** | 49/50 recent schedule runs succeeded; latest run 2026-06-08T03:34 UTC |
| **Ingestion reliability** | **Good (NDBC), partial (CRW)** | NDBC 2 inserts/run; CRW 0 inserts (duplicate day) but product current within warn window |
| **Replay validation reliability** | **Not demonstrated** | Operator replay route 404; no samples |
| **Feed-health visibility** | **Fail** | `recent_history_count: 0`, `last_completed_at: null` |
| **Provenance completeness** | **Not demonstrated** | No `provenanceHash`, `verificationStatus`, or harness provenance on public API |
| **Lineage completeness** | **Fail** | No `signalId` or `rootEventId` on any public signal; Phase 4 filtering not active |
| **Mock contamination** | **Pass** | All sources `noaa_ndbc` / `noaa_crw` |
| **Automated H+72 script** | **Fail / blocked** | PS1 encoding error; operator token unset; harness routes missing |

**H+72 continuity:** Baseline telemetry burn-in from T0 (2026-06-04T03:59:47Z) exceeds 72 h elapsed time, but **Phase 4 trust-chain requirements were never deployed**, so H+72 promotion criteria for lineage and replay **cannot be evaluated on production**.

---

## 8. Remaining risks

1. **Undeployed HutchStack Phases 3–4** — Local code (lineage enforcement, operator console, replay validation) is not on remote `main` (`e1028d53`). Production continues pre-harness public API behavior.
2. **Unverified database migrations** — Migrations 0003–0005 are not on the deployed branch and were not validated against Turso. Risk of schema drift if manually applied without coordinated deploy.
3. **Feed-health persistence gap** — Ingestion succeeds in GitHub Actions but `/feed-health` reports zero history. Operators cannot rely on API-visible ingest audit trail.
4. **Lineage-missing signals promoted** — Without Phase 4 `filterTrustedLiveConditions` / `filterTrustedReefAlerts`, public endpoints return rows that Phase 4 would classify as `unverified_lineage` and withhold.
5. **Replay gate blocked** — No production path to prove reconstructable publication decisions or detect synthesized evidence.
6. **Operator access unverified** — `OPERATOR_ACCESS_TOKEN` configuration in Vercel/production secrets was not confirmed; operator surfaces are absent regardless.
7. **Verification tooling degraded** — `verify-production-telemetry.ps1` fails to parse on Windows due to encoding; automated promotion checks cannot run locally without fix.
8. **CRW product cadence** — Alerts at ~48 h product age are expected between NOAA publish cycles but remain a WARN until the next product day lands.

---

## 9. Local harness test status (non-production)

For completeness: the development tree reports **42/42 harness tests passing** locally (lineage, operator, replay, presentation gate). This validates **code readiness**, not **production readiness**. Local pass results were **not** used in the promotion decision below.

---

## PROMOTION RECOMMENDATION

### **1. REMAIN RESEARCH-READY LIMITED BETA**

**Rationale (production evidence only):**

- The HutchStack trust chain is **not operational in production**. Operator routes, replay validation, and signal lineage enforcement are absent from the deployed API (`404` on all operator/replay endpoints; no lineage or trust fields on public signals).
- Turso migrations **0003, 0004, and 0005** cannot be confirmed applied; they are not present on the deployed git branch.
- Newly ingested NDBC and CRW records **do not expose** `signalId`, `rootEventId`, `verificationEventId`, or `provenanceHash` via public API — lineage completeness **cannot be verified**.
- Feed-health persistence required for H+72 operational visibility reports **empty history**.
- Replay validation and operator console burn-in **could not be executed** against production.

**What production does support today:**

- Live NOAA NDBC and CRW data (non-mock) with fresh NDBC ingest
- Reliable scheduled ingestion (98% recent schedule success)
- API health and Turso connectivity

**Conditions to re-run this validation (not promotion itself):**

1. Merge and deploy Phase 3 + Phase 4 to production (API + web + Turso migrations 0003–0005).
2. Confirm post-deploy public API returns trust metadata and withholds lineage-missing rows.
3. Configure and verify `OPERATOR_ACCESS_TOKEN` on API and web.
4. Run fresh NDBC + CRW ingestion and confirm lineage columns populated (DB + API).
5. Execute replay validation via `/internal/operator/replay-validation` with token.
6. Fix and pass `verify-production-telemetry.{ps1,sh}` including H+72 replay and lineage gates.
7. Resolve feed-health persistence so `recent_history_count > 0` reflects scheduled runs.

Until those steps produce observed production evidence, promotion to **RESEARCH-READY** or **RESEARCH-READY WITH CONDITIONS** is **not supported**.

---

*Report generated from live production probes on 2026-06-08. Re-validate after Phase 4 deployment; do not infer lineage or replay evidence from local test passes or documentation alone.*
