# Phase 0B — Production Deployment Validation

**Validated (UTC):** 2026-06-10T06:02:32Z  
**Production API:** https://api.vitalicast.com  
**Reference:** [PHASE-0B-PRIMITIVE-EXTRACTION.md](./PHASE-0B-PRIMITIVE-EXTRACTION.md), [PHASE-0-BASELINE.md](./PHASE-0-BASELINE.md), [PHASE-0-INVARIANTS.md](./PHASE-0-INVARIANTS.md)

---

## Executive summary

| Dimension | Post-deploy status |
|-----------|-------------------|
| Deployment | **SUCCESS** — production alias updated |
| Replay validation | **18/18**, `overallPass: true` |
| Operator security | **PASS** — API 403 / web 307 without token |
| Public trust lineage | **PASS** — 0 missing `rootEventId`, `verificationEventId`, `provenanceHash` |
| Feed-health | **PASS** — `recent_history_count: 20` |
| Burn-in compatibility | **PASS** — thresholds unchanged; verify script exit 0 |
| Phase 0 invariants | **PASS** — `verify-phase0-invariants.ps1` exit 0 |

---

## 1. Deployment evidence

| Field | Value |
|-------|-------|
| **Deployment succeeded** | **Yes** |
| **Deployment ID** | `dpl_A4ZVqkSsx2A7C2ZpckKdSfSHtEKc` |
| **Deployment URL** | https://marine-intelligence-platform-cm8y85yki-hutchs-projects-ef99514e.vercel.app |
| **Production alias** | https://api.vitalicast.com |
| **Inspector** | https://vercel.com/hutchs-projects-ef99514e/marine-intelligence-platform-api/A4ZVqkSsx2A7C2ZpckKdSfSHtEKc |
| **Deployment timestamp (UTC)** | `2026-06-10T05:59:49Z` |
| **Vercel status** | Ready |
| **Git HEAD at deploy** | `f376ae8e21e5aa23fa6a212cfb800c4e499101ad` |
| **Deploy source** | Local working tree with uncommitted Phase 0B primitive extraction atop `f376ae8` |

**Traceability note:** Phase 0B code was deployed from the local workspace before commit. The deployed artifact contains `packages/shared/src/harness-primitives.ts` and repository import changes documented in Phase 0B. Recommend committing Phase 0B files to `main` for git-level traceability.

### Deploy command

```bash
npx vercel deploy --prod --yes --project marine-intelligence-platform-api
# (from monorepo root)
```

---

## 2. Production probe results

**Probe timestamp (UTC):** `2026-06-10T06:01:00Z`

### `/health`

| Field | Value |
|-------|-------|
| HTTP status | 200 |
| `status` | `ok` |
| `dbReachable` | `true` |

### `/feed-health`

| Field | Value |
|-------|-------|
| HTTP status | 200 |
| `latest_source_count` | 2 |
| `healthy_source_count` | 1 |
| `degraded_source_count` | 1 |
| `failed_source_count` | 0 |
| `recent_history_count` | **20** |
| `last_completed_at` | `2026-06-10T05:50:57.941Z` |

### `/internal/operator/status` (with token)

| Field | Value |
|-------|-------|
| HTTP status | 200 |
| `generated_at` | `2026-06-10T06:01:06Z` |
| `access` | `operator` |
| `harness.replayValidation.overallPass` | `true` |
| `harness.alerts.suppressedCount` | 12 |
| `harness.reviewQueue.pendingCount` | 0 |

### `/internal/operator/replay-validation` (with token)

```json
{
  "generatedAt": "2026-06-10T06:01:06Z",
  "sampleCount": 18,
  "passedCount": 18,
  "failedCount": 0,
  "overallPass": true
}
```

### `/live-conditions`

| Metric | Value |
|--------|-------|
| HTTP status | 200 |
| Total rows | 2 |
| Trusted rows | 2 |
| Missing `rootEventId` | **0** |
| Missing `verificationEventId` | **0** |
| Missing `provenanceHash` | **0** |

**Example trusted row (station 41009):**

```json
{
  "stationId": "41009",
  "signalId": "SIG-da29b8cae7178855",
  "rootEventId": "EHE-ingestion-7a11e057822d468c",
  "verificationEventId": "EHE-verification-ab9462f07a048805",
  "provenanceHash": "bae18c0d741d588ad5ab4acdd2aee5fa45e68bde37a440efba1e6aa757471451",
  "trustStatus": "trusted",
  "trustedForPromotion": true
}
```

### `/reef-alerts`

| Metric | Value |
|--------|-------|
| HTTP status | 200 |
| Total rows | 2 |
| Trusted rows | 2 |
| Missing `rootEventId` | **0** |
| Missing `verificationEventId` | **0** |
| Missing `provenanceHash` | **0** |

### Operator security (no token)

| Route | Status | Expected |
|-------|--------|----------|
| `/internal/operator/status` | **403** | 403 |
| `/internal/operator/replay-validation` | **403** | 403 |
| `/api/replay/signal/:id` | **403** | 403 |
| `https://oceansig.com/operator` | **307** | 307 |

---

## 3. Invariant check results

| Invariant | Result | Evidence |
|-----------|--------|----------|
| Replay `overallPass: true` | **PASS** | 18/18 at `2026-06-10T06:01:06Z` |
| Replay sample count ≥ baseline | **PASS** | 18 (baseline 18; unchanged) |
| Trusted missing `rootEventId` = 0 | **PASS** | live + reef scan |
| Trusted missing `verificationEventId` = 0 | **PASS** | all 4 trusted rows populated |
| Trusted missing `provenanceHash` = 0 | **PASS** | all 4 trusted rows populated |
| Operator APIs protected without token | **PASS** | 403 on status + replay-validation |
| `/operator` protected without token | **PASS** | 307 redirect |
| Feed-health populated | **PASS** | `recent_history_count: 20` |
| No mock promotion | **PASS** | 0 trusted rows with mock/synthetic/fallback source |
| No stale promotion | **PASS** | 0 trusted rows with `freshnessStatus.policyBand: fail` |
| No route contract changes | **PASS** | All probed routes return expected status codes |
| No ID format changes | **PASS** | Formats confirmed in production (see below) |

### ID format verification (production)

| Format | Example (post-deploy) | Pattern |
|--------|----------------------|---------|
| Signal ID | `SIG-da29b8cae7178855` | `SIG-{16 hex}` |
| Harness event ID | `EHE-ingestion-7a11e057822d468c` | `EHE-{kind}-{16 hex}` |
| Verification event ID | `EHE-verification-ab9462f07a048805` | `EHE-verification-{16 hex}` |
| Replay packet ID | `RP-359e4bcd5d093db9` | `RP-{16 hex}` |
| Evidence packet ID | `EVP-25e691ffb86386d8` | `EVP-{16 hex}` |

**Note:** Specific signal/event IDs differ from Phase 0A baseline because scheduled ingest advanced observations between baseline (`2026-06-10T04:51Z`) and deploy validation (`2026-06-10T06:01Z`). ID **formats** are unchanged; determinism is per-input (new ingest → new IDs, as expected).

### Replay validation sample profile (first 3)

| kind | id | passed | packetId | rootEventId | evidenceStatus |
|------|-----|--------|----------|-------------|----------------|
| signal | `SIG-5fad6c82e84ceb4e` | true | `RP-565c3148429c7e51` | `EHE-ingestion-60d8e851a50d670a` | partial |
| signal | `SIG-8bc886e9555844cc` | true | `RP-241d3f7bfb59e2ea` | `EHE-ingestion-6a05089aab1607e2` | partial |
| signal | `SIG-da29b8cae7178855` | true | `RP-359e4bcd5d093db9` | `EHE-ingestion-7a11e057822d468c` | partial |

---

## 4. Script validation

### `verify-phase0-invariants.ps1`

```powershell
.\scripts\phase0\verify-phase0-invariants.ps1 -ApiBase https://api.vitalicast.com
```

| Gate | Result |
|------|--------|
| API typecheck | PASS |
| Required replay + lineage tests | PASS (15/15) |
| Production health | PASS |
| Operator security | PASS |
| Public lineage | PASS (0 missing root) |
| `verify-production-telemetry.ps1` | PASS |
| **Overall exit code** | **0** |

### `verify-production-telemetry.ps1`

| Field | Value |
|-------|-------|
| Exit code | **0** |
| NDBC observation age | 0.9 h (pass; hard fail > 6 h) |
| CRW product age | 54.0 h (**warn**; hard fail > 72 h) |
| Scheduler execution age | 0.2 h (pass; hard fail > 3 h) |
| Replay `overallPass` | true |

---

## 5. Burn-in compatibility

| Parameter | Status |
|-----------|--------|
| T0 | `2026-06-09T03:41:35Z` — **unchanged** |
| H+72 end | `2026-06-12T03:41:35Z` — **unchanged** |
| Checkpoint schedule | **unchanged** |
| NDBC threshold (6 h) | **unchanged** |
| CRW warn/fail (48 h / 72 h) | **unchanged** |
| Burn-in scripts | **not modified** |
| H72 report validity | **valid** — deploy does not reset T0 or alter gate definitions |
| `verify-production-telemetry` | **exit 0** (CRW warn allowed) |

**Elapsed at validation:** ~26.3 h since T0.

---

## 6. Warnings (non-blocking)

| Warning | Detail |
|---------|--------|
| CRW product age | 54.0 h — warn band (> 48 h); within hard fail threshold (< 72 h) |
| Deploy traceability | Phase 0B deployed from uncommitted working tree atop `f376ae8` — commit recommended |
| Signal ID rotation | Trusted signal IDs changed due to new ingest between baseline and deploy — expected; formats preserved |

---

## 7. Rollback plan

If post-deploy regression is detected:

```bash
# 1. Roll back Vercel deployment via dashboard or CLI
npx vercel rollback --project marine-intelligence-platform-api

# 2. Or redeploy prior known-good deployment
npx vercel deploy --prod --yes --project marine-intelligence-platform-api
# (from commit f376ae8 before Phase 0B)

# 3. Verify
.\scripts\phase0\verify-phase0-invariants.ps1 -ApiBase https://api.vitalicast.com
```

**Rollback impact:** Restores pre-0B primitive import paths in API bundle. No database migration rollback required. No schema changes were deployed.

---

## 8. Comparison to Phase 0A baseline

| Metric | Phase 0A baseline | Post-0B deploy | Assessment |
|--------|-------------------|----------------|------------|
| Replay `overallPass` | true | true | **unchanged** |
| Replay sample count | 18 | 18 | **unchanged** |
| Missing `rootEventId` | 0 | 0 | **unchanged** |
| Feed-health history | 20 | 20 | **unchanged** |
| Operator 403 (no token) | yes | yes | **unchanged** |
| Verify script exit | 0 | 0 | **unchanged** |
| CRW warn | yes (~53 h) | yes (54 h) | **expected** |

---

## Final verdict

# **PHASE 0B PRODUCTION VERIFIED**

**Evidence:**

- Vercel deployment `dpl_A4ZVqkSsx2A7C2ZpckKdSfSHtEKc` reached **Ready** and aliases to `https://api.vitalicast.com`
- Production replay validation: **18/18 pass**, `overallPass: true`
- All trusted public rows have `rootEventId`, `verificationEventId`, and `provenanceHash`
- Operator routes and web `/operator` remain protected
- ID formats (`SIG-*`, `EHE-*`, `RP-*`, `EVP-*`) confirmed in production responses
- `verify-phase0-invariants.ps1` and `verify-production-telemetry.ps1` both **exit 0**
- Burn-in protocol, thresholds, and T0 unchanged

No production regression detected. Phase 0C is authorized when ready.
