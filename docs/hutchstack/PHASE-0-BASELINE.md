# Phase 0 Baseline — HutchStack Core Extraction

**Recorded (UTC):** 2026-06-10T04:51:23Z  
**Git commit:** `f376ae8` — `docs: start H+72 replay-aware burn-in with T0 preflight evidence`  
**Branch:** `main`  
**Production API:** https://api.vitalicast.com  
**Production web:** https://oceansig.com  
**Method:** Local typecheck + harness tests; production HTTP probes; `verify-production-telemetry.ps1`

This document is the **reference baseline** for Phase 0A. All HutchStack Core extraction work must preserve the invariants defined in [PHASE-0-INVARIANTS.md](./PHASE-0-INVARIANTS.md).

---

## Executive summary

| Dimension | Baseline status |
|-----------|-----------------|
| Production health | **PASS** — `dbReachable: true` |
| Replay validation | **PASS** — 18/18, `overallPass: true` |
| Operator security | **PASS** — 403 without token on API; 307 redirect on web |
| Public trust lineage | **PASS** — 0 trusted rows missing `rootEventId` |
| Feed-health | **PASS** — `recent_history_count: 20` |
| Burn-in | **IN PROGRESS** — ~25.2 h elapsed since T0 |
| Verify script | **PASS** (exit 0; CRW warn only) |
| Interim verdict | **RESEARCH-READY WITH CONDITIONS** |

---

## 1. Burn-in status

| Parameter | Value |
|-----------|-------|
| T0 (preflight pass) | `2026-06-09T03:41:35Z` |
| Baseline elapsed | **~25.2 hours** |
| H+72 end | `2026-06-12T03:41:35Z` |
| Canonical H+6 target | `2026-06-09T09:41:35Z` |
| Validated commit at T0 | `f154df9` (lockfile); baseline doc commit `f376ae8` |
| Promotion eligibility | **NOT ELIGIBLE** — burn-in in progress |

### Checkpoint status (from H72 report + baseline time)

| Checkpoint | Target (UTC) | Status at baseline |
|------------|--------------|-------------------|
| T0 / H+0 | 2026-06-09T03:41:35Z | **PASS** (documented) |
| H+6 (early attempt) | 2026-06-09T04:01:36Z | **FAIL** timing (0.33 h) — snapshot only |
| H+6 (canonical) | 2026-06-09T09:41:35Z | Due before baseline — **not re-audited in Phase 0A** |
| H+12 | 2026-06-09T15:41:35Z | Due before baseline — **not re-audited in Phase 0A** |
| H+24 | 2026-06-10T03:41:35Z | Due before baseline — **not re-audited in Phase 0A** |
| H+72 | 2026-06-12T03:41:35Z | **PENDING** |

**Note:** Phase 0A records a **point-in-time production snapshot** at baseline time. Formal H+12/H+24 checkpoint rows in the burn-in report remain to be updated per the H+72 protocol.

---

## 2. Production evidence — health and feed-health

**Probed:** 2026-06-10T04:51:23Z

```json
{
  "status": "ok",
  "dbReachable": true,
  "feedHealth": {
    "summary": {
      "latest_source_count": 2,
      "healthy_source_count": 1,
      "degraded_source_count": 1,
      "failed_source_count": 0,
      "recent_history_count": 20,
      "last_completed_at": "2026-06-10T04:03:08.918Z"
    }
  }
}
```

| Check | Result |
|-------|--------|
| `/health` 200 | **PASS** |
| `dbReachable` | **true** |
| `recent_history_count > 0` | **20** |
| Scheduler execution age | **0.8 h** (hard fail > 3 h) |

---

## 3. Production evidence — replay validation

**Route:** `GET /internal/operator/replay-validation?token=…`  
**Probed:** 2026-06-10T04:50:56Z

```json
{
  "generatedAt": "2026-06-10T04:50:56Z",
  "sampleCount": 18,
  "passedCount": 18,
  "failedCount": 0,
  "overallPass": true
}
```

| Metric | T0 (H72 report) | Phase 0A baseline | Delta |
|--------|-----------------|-------------------|-------|
| Sample count | 17 | 18 | +1 (new ingestion-rooted target) |
| Passed | 17 | 18 | — |
| Failed | 0 | 0 | — |
| `overallPass` | true | true | unchanged |

### Sample profile (first sample)

| Field | Value |
|-------|-------|
| `target.kind` | `signal` |
| `target.id` | `SIG-d3e1e9ebf9882a55` |
| `passed` | `true` |
| `evidenceStatus` | `partial` |
| `rootEventId` | `EHE-ingestion-97357d5def9718e7` |
| `publicationReconstructable` | `null` (signal sample) |

**Invariant status:** Replay validation **100% passing** at baseline.

---

## 4. Production evidence — operator routes

### API security (no token)

| Route | Status | Expected |
|-------|--------|----------|
| `/internal/operator/status` | **403** | 403 |
| `/internal/operator/replay-validation` | **403** | 403 |

### API authenticated (`OPERATOR_ACCESS_TOKEN` set)

**Probed:** 2026-06-10T04:50:56Z

| Field | Value |
|-------|-------|
| `generated_at` | `2026-06-10T04:50:56Z` |
| `access` | `operator` |
| `harness.replayValidation.overallPass` | `true` |
| `harness.alerts.suppressedCount` | `12` |
| `harness.reviewQueue.pendingCount` | `0` |

### Web operator

| Route | Without token | Result |
|-------|---------------|--------|
| `https://oceansig.com/operator` | No token | **307** redirect |

---

## 5. Production evidence — trust gates

**Probed:** 2026-06-10T04:50:08Z

### `/live-conditions`

| Metric | Value |
|--------|-------|
| Total rows | 2 |
| `trustStatus: trusted` | 2 |
| Missing `rootEventId` (trusted) | **0** |

**Example row (station 41009):**

```json
{
  "stationId": "41009",
  "signalId": "SIG-3e00cec6a71909e2",
  "rootEventId": "EHE-ingestion-1b7569f8c1d14401",
  "trustStatus": "trusted",
  "trustedForPromotion": true
}
```

### `/reef-alerts`

| Metric | Value |
|--------|-------|
| Total rows | 2 |
| `trustStatus: trusted` | 2 |
| Missing `rootEventId` (trusted) | **0** |

### Freshness (verify script)

| Source | Age | Policy | Result |
|--------|-----|--------|--------|
| NDBC (stations 41009, 46042) | **1.4 h** | hard fail > 6 h | **PASS** |
| CRW (Florida Keys, Southeast Florida) | **52.9 h** | warn > 48 h; fail > 72 h | **WARN** |
| Public trusted missing lineage | **0** | must be 0 | **PASS** |

---

## 6. verify-production-telemetry summary

**Command:** `.\scripts\telemetry-activation\verify-production-telemetry.ps1 -ApiBase https://api.vitalicast.com`  
**Exit code:** **0**  
**Timestamp:** 2026-06-10T04:51:23Z

```
PASS - production telemetry within thresholds (CRW warning only).
```

Warnings:

- Latest reef alert older than 48 hours (CRW warn — daily NOAA product cadence)

---

## 7. Local development baseline

| Check | Result | Notes |
|-------|--------|-------|
| API typecheck | **PASS** | `pnpm --filter api typecheck` exit 0 |
| Required harness tests | **PASS** | `environmental-harness-replay.test.ts` + `environmental-harness-lineage.test.ts` (15/15) |
| Full API test suite | **707 pass / 99 fail** | Failures concentrated in marine investigation/validation repos (untracked WIP modules) |
| DB-backed route tests | **SKIPPED locally** | No `marine.sqlite` in workspace; production probes are authoritative |

### Local test gate tiers (`verify-phase0-invariants.ps1`)

| Tier | Files | Blocking? |
|------|-------|-----------|
| **Required** | `environmental-harness-replay.test.ts`, `environmental-harness-lineage.test.ts` | Yes |
| **Supplemental** | `environmental-harness.test.ts`, `hostile-verification.test.ts` | Warn only without local DB |
| **DB-backed** | route + operator harness tests | Run when `MARINE_DB_PATH` or `.data/marine.sqlite` exists |

**Extraction gate:** Phase 0+ uses **required replay/lineage tests + production probes**, not the full 806-test count.

---

## 8. Extraction readiness scorecard (at baseline)

Scores reflect readiness **before** Phase 0B primitive extraction.

| Component | Score | Rationale |
|-----------|-------|-----------|
| **Contracts** | **88** | `harness.ts`, `harness-replay.ts`, `harness-operator.ts` are pure types in `@marine/shared`. No dedicated `@hutchstack/contracts` package yet. |
| **Events** | **65** | Event store works in production. Repo imports `provenance`/`lineage` from services (circular). Marine SQL in sample discovery. |
| **Replay** | **58** | 18/18 validation pass. Engine coupled to `provenance` repo and NDBC/CRW freshness branches. |
| **Trust** | **52** | Gates proven in production. `LiveMarineCondition`/`ReefStressWatchItem` embedded in presentation filters. |
| **Governance** | **76** | Review queue operational (`pendingCount: 0`). Audit writers coupled to marine ingest report shape. |
| **Operator** | **48** | Routes secured and functional. Console monolith imports operational-alerts route. |
| **Verification** | **68** | Burn-in script and replay validation gate operational. Sample provider is marine-specific. |

**Phase 0A effect:** Establishes frozen baseline and verification script. Scores unchanged until 0B breaks repo cycle.

---

## 9. Promotion gate snapshot

| Gate | Baseline status | Required at H+72 |
|------|-----------------|------------------|
| 72 hours elapsed | **~25.2 h** | Yes |
| Replay `overallPass` | **true** | Yes (each checkpoint) |
| Missing `rootEventId` on trusted public | **0** | Yes |
| `feed-health` history | **20** | Yes |
| Operator routes protected | **yes** | Yes |
| NDBC within 6 h | **1.4 h** | Yes |
| CRW below 72 h hard fail | **52.9 h** (warn) | Yes |
| Scheduler success ≥ 95% | **not re-measured in 0A** | Yes |
| No mock contamination | **not re-scanned in 0A** | Yes |

**Verdict at baseline:** **RESEARCH-READY WITH CONDITIONS** (burn-in in progress; CRW warn band; scheduler gate pending H+72 measurement)

---

## 10. Related documents

| Document | Purpose |
|----------|---------|
| [PHASE-0-INVARIANTS.md](./PHASE-0-INVARIANTS.md) | Frozen behavioral contract |
| [H72-REPLAY-AWARE-BURN-IN-REPORT.md](./H72-REPLAY-AWARE-BURN-IN-REPORT.md) | Active burn-in protocol and T0 evidence |
| [REPLAY-TRUST-RECOVERY-VALIDATION.md](./REPLAY-TRUST-RECOVERY-VALIDATION.md) | Replay trust recovery (`a9ba8d2`) |
| [H72-REPLAY-VALIDATION-GATE.md](./H72-REPLAY-VALIDATION-GATE.md) | Gate definitions |

---

## 11. Verification command

```powershell
# From repo root — requires OPERATOR_ACCESS_TOKEN for full production gate
.\scripts\phase0\verify-phase0-invariants.ps1 -ApiBase https://api.vitalicast.com
```

**Phase 0A complete when:** This baseline is recorded, invariants are frozen, and the verification script passes locally + production.
