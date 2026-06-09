# H+72 Replay-Aware Production Burn-In Report

**Platform:** Marine Intelligence Platform  
**Production API:** https://api.vitalicast.com  
**Production web:** https://oceansig.com  
**Report generated (UTC):** 2026-06-09T03:41:35Z  
**Burn-in T0 (preflight pass):** 2026-06-09T03:41:35Z  
**Burn-in end (H+72):** 2026-06-12T03:41:35Z  
**Validated commit at T0:** `f154df9` (lockfile sync; prior: `54171f7` web deploy, `a9ba8d2` replay trust)  
**Method:** Production HTTP probes, GitHub Actions evidence, `verify-production-telemetry.ps1`. Fail-closed.

---

## Executive summary

| Dimension | Status at T0 |
|-----------|--------------|
| Preflight (9/9) | **PASS** (CRW warn only) |
| Operator security | **PASS** — token required on API + web |
| Replay validation | **17/17 pass**, `overallPass: true` |
| Public trust lineage | **0** trusted rows missing `rootEventId` |
| Scheduler (200-run window) | **92.4%** schedule success — **below 95% gate** |
| Burn-in elapsed | **0 h** — **in progress** |

**Interim verdict:** **RESEARCH-READY WITH CONDITIONS**

Burn-in **started** at T0. Do **not** promote to **RESEARCH-READY** until H+72 completes and all promotion gates pass at the final checkpoint.

---

## 1. Preflight checklist (T0 gate)

All checks must pass before T0. Probed **2026-06-09T03:41:35Z**.

| # | Check | Result | Evidence |
|---|-------|--------|----------|
| 1 | `OPERATOR_ACCESS_TOKEN` on API + web | **PASS** | Vercel env present on `marine-intelligence-platform-api` and `marine-intelligence-platform` (production) |
| 2 | `/operator` requires token | **PASS** | `307` → `/?notice=operator_access_required` without token |
| 3 | `/internal/operator/status` requires token | **PASS** | `403` `{"message":"Operator access required"}` without token |
| 4 | `/internal/operator/replay-validation` requires token | **PASS** | `403` without token; `overallPass: true` with token |
| 5 | `/health` 200 + `dbReachable: true` | **PASS** | `status: ok`, `dbReachable: true` |
| 6 | `/live-conditions` trusted + lineage | **PASS** | 2 rows; `trustStatus: trusted`; `missing_root: 0`; no mock sources |
| 7 | `/reef-alerts` trusted + lineage | **PASS** | 2 rows; `trustStatus: trusted`; `missing_root: 0`; no March mock rows |
| 8 | `/feed-health` `recent_history_count > 0` | **PASS** | `recent_history_count: 20`, `last_completed_at: 2026-06-09T02:57:34.419Z` |
| 9 | Replay validation `overallPass: true` | **PASS** | `sampleCount: 17`, `passedCount: 17`, `failedCount: 0` |

**T0 set:** 2026-06-09T03:41:35Z — all preflight checks passed.

### Preflight warnings (non-blocking at T0)

| Warning | Value | Policy |
|---------|-------|--------|
| CRW product age | **51.7 h** | Warn >48h; hard fail >72h (NOAA daily product cadence) |
| NDBC observation age | **1.2 h** | Hard fail >6h — **within policy** |
| Scheduler execution age | **0.7 h** | Hard fail >3h — **within policy** |

### Operator token remediation (pre-T0)

Initial token used Base64 (`+`, `/`) and failed URL query validation. Replaced with **48-character alphanumeric** token on both Vercel projects; API and web redeployed before T0.

---

## 2. T0 baseline — HutchStack trust chain

### Replay validation

```json
{
  "generatedAt": "2026-06-09T03:41:35Z",
  "sampleCount": 17,
  "passedCount": 17,
  "failedCount": 0,
  "overallPass": true
}
```

- Signal samples: partial evidence accepted for observations (`evidenceStatus: partial`)
- Alert samples (publication-linked): `publicationReconstructable: true` for NDBC 46042 alerts
- No `evidence_withheld` or `publication_not_reconstructable` failures at T0

### Public trusted signals

| Endpoint | Rows | `trustStatus: trusted` | Missing `rootEventId` | Mock contamination |
|----------|------|------------------------|----------------------|-------------------|
| `/live-conditions` | 2 | 2 | 0 | none |
| `/reef-alerts` | 2 | 2 | 0 | none |

Example (`/live-conditions` station 46042):

```json
{
  "signalId": "SIG-7a7f08e264d8e6d5",
  "rootEventId": "EHE-ingestion-44e4d03dbebf1707",
  "trustStatus": "trusted",
  "trustedForPromotion": true,
  "verificationStatus": "verified"
}
```

### Feed-health

```json
{
  "latest_source_count": 2,
  "healthy_source_count": 1,
  "degraded_source_count": 1,
  "failed_source_count": 0,
  "recent_history_count": 20,
  "last_completed_at": "2026-06-09T02:57:34.419Z"
}
```

### Operator harness (authenticated)

| Metric | T0 value |
|--------|----------|
| Active alerts | 0 |
| Suppressed alerts | 12 |
| Review queue pending | 0 |
| Published alerts (reconstructable) | 3 (NDBC 46042 family) |

### Dashboard mock scan

`https://oceansig.com` HTML scan: **no** hits for `2026-03`, `March`, `mock`, `synthetic`, `fallback`.

---

## 3. Scheduler baseline

**Workflow:** `.github/workflows/ingest-live-production.yml`  
**Schedule:** `*/20 * * * *` (UTC, best-effort)

### Window: last 200 workflow runs (as of T0)

| Trigger | Total | Success | Failure | Rate |
|---------|-------|---------|---------|------|
| `schedule` | 118 | 109 | 9 | **92.4%** |
| `workflow_dispatch` | (included in 200) | — | — | — |

**Promotion gate:** scheduler success ≥ **95%** — **NOT MET** at T0 baseline.

### Latest runs at T0

| Run ID | Event | Time (UTC) | Conclusion | Notes |
|--------|-------|------------|------------|-------|
| [27182099616](https://github.com/Hutch10/marine-intelligence-platform/actions/runs/27182099616) | schedule | 2026-06-09T03:33:10Z | **failure** | `ERR_PNPM_OUTDATED_LOCKFILE` — `next` specifier drift (`^14.2.0` vs `14.2.35`) |
| [27180933331](https://github.com/Hutch10/marine-intelligence-platform/actions/runs/27180933331) | workflow_dispatch | 2026-06-09T02:57:11Z | success | Post-replay-trust recovery ingest |
| [27179473133](https://github.com/Hutch10/marine-intelligence-platform/actions/runs/27179473133) | schedule | 2026-06-09T02:11:37Z | success | — |

**Recovery action (T0):** Commit `f154df9` syncs `pnpm-lock.yaml` with pinned `next@14.2.35`. Monitor next scheduled run.

---

## 4. Promotion gates (H+72 final)

| Gate | T0 status | Required at H+72 |
|------|-----------|------------------|
| 72 hours elapsed | 0 h | Yes |
| Scheduler success ≥ 95% | **92.4%** | Yes |
| NDBC freshness within policy (≤6h obs age) | **1.2 h** | Yes |
| CRW below 72h hard fail | **51.7 h** (warn) | Yes |
| No mock/simulated data promoted | **clean** | Yes |
| No stale data promoted as live | **clean** | Yes |
| Replay `overallPass: true` at each checkpoint | **true** | Yes |
| Public trusted missing `rootEventId` = 0 | **0** | Yes |
| `feed-health` `recent_history_count > 0` | **20** | Yes |
| Operator routes protected | **yes** | Yes |
| No published alert without reconstructable lineage | **3/3 reconstructable** | Yes |

---

## 5. Checkpoint protocol (every 6–12 hours)

Run from repo root:

```powershell
$env:OPERATOR_ACCESS_TOKEN = "<from Vercel marine-intelligence-platform-api production>"
./scripts/telemetry-activation/verify-production-telemetry.ps1 -ApiBase https://api.vitalicast.com
```

Record at each checkpoint:

| Field | Source |
|-------|--------|
| Scheduler success rate | `gh run list --workflow=ingest-live-production.yml` |
| NDBC freshness | `/live-conditions` observation ages |
| CRW freshness | `/reef-alerts` product ages |
| Feed-health status | `/feed-health` or `/health` embedded snapshot |
| Replay validation | `/internal/operator/replay-validation?token=...` |
| Public trusted lineage | verify script `missing rootEventId` count |
| Mock contamination | `/live-conditions` source scan + dashboard HTML |
| Stale promotion | trusted rows with `freshnessClassification: failed` or age > policy |
| Operator route status | `/operator` without token → redirect; API → 403 |
| Suppressed alert count | `/internal/operator/status` → `harness.alerts.suppressedCount` |
| Review queue count | `/internal/operator/status` → `harness.reviewQueue.pendingCount` |

### Checkpoint log

| Checkpoint | Time (UTC) | Elapsed | verify script | Replay pass | Scheduler rate | Verdict |
|------------|------------|---------|---------------|-------------|----------------|---------|
| **T0 / H+0** | 2026-06-09T03:41:35Z | 0 h | **PASS** (CRW warn) | 17/17 | 92.4% | Burn-in **started** |
| H+6 | *pending* | — | — | — | — | — |
| H+12 | *pending* | — | — | — | — | — |
| H+24 | *pending* | — | — | — | — | — |
| H+48 | *pending* | — | — | — | — | — |
| **H+72** | 2026-06-12T03:41:35Z | 72 h | *pending* | *pending* | *pending* | *pending* |

---

## 6. Final verdict options

| Verdict | When |
|---------|------|
| **RESEARCH-READY** | All H+72 gates pass; scheduler ≥95%; replay pass at every checkpoint; no trust regressions |
| **RESEARCH-READY WITH CONDITIONS** | Trust chain holds but one or more gates need monitoring (CRW warn, scheduler <95%, partial replay evidence) |
| **REMAIN RESEARCH-READY LIMITED BETA** | Hard fail on freshness, replay, mock contamination, or operator exposure |

**Current verdict (T0):** **RESEARCH-READY WITH CONDITIONS**

**Conditions:**

1. Complete 72-hour burn-in through **2026-06-12T03:41:35Z**.
2. Raise scheduler success rate to **≥95%** (lockfile fix `f154df9` must restore scheduled runs).
3. Maintain replay `overallPass: true` at each 6–12h checkpoint.
4. CRW product age must remain **below 72h** hard fail (currently 51.7h warn band).
5. Keep `OPERATOR_ACCESS_TOKEN` on both Vercel projects; never expose in logs or docs.

---

## 7. Related evidence

| Document | Purpose |
|----------|---------|
| [INGESTION-RECOVERY-VALIDATION.md](./INGESTION-RECOVERY-VALIDATION.md) | Ingest SQL / Turso recovery (`17dbde7`) |
| [REPLAY-TRUST-RECOVERY-VALIDATION.md](./REPLAY-TRUST-RECOVERY-VALIDATION.md) | Replay trust chain recovery (`a9ba8d2`) |
| [H72-REPLAY-VALIDATION-GATE.md](./H72-REPLAY-VALIDATION-GATE.md) | Gate definitions and verify script usage |

---

*Next checkpoint due: H+6 (2026-06-09T09:41:35Z) or H+12 (2026-06-09T15:41:35Z). Update §5 checkpoint log with production evidence only.*
