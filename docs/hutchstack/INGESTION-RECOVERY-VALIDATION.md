# Production Ingestion Recovery Validation

**Validation window (UTC):** 2026-06-08T23:19:08Z → 2026-06-08T23:20:31Z  
**Production API:** https://api.vitalicast.com  
**Production web:** https://oceansig.com  
**Validated commit:** `17dbde784d7392456b9ef22843d2c8b392e1144d` (`17dbde7`)  
**Method:** Live workflow trigger, GitHub Actions logs, and production HTTP probes only. Fail-closed. No local test inference.

---

## 1. Workflow execution

| Field | Observed value |
|-------|----------------|
| Workflow | Production live ingestion (`ingest-live-production.yml`) |
| Trigger | `workflow_dispatch` (manual) |
| Run URL | https://github.com/Hutch10/marine-intelligence-platform/actions/runs/27173173009 |
| Run ID | `27173173009` |
| Conclusion | **success** |
| Head SHA | `17dbde784d7392456b9ef22843d2c8b392e1144d` |
| Started (UTC) | 2026-06-08T23:19:08Z |
| Completed (UTC) | ~2026-06-08T23:19:35Z |

**Result:** **PASS** — workflow executed on commit `17dbde7`.

---

## 2. NDBC ingest validation

Evidence from workflow log (`Run ingest:live` step) and `/health` feed-health snapshot (probed 2026-06-08T23:19:56Z):

| Criterion | Observed | Pass |
|-----------|----------|------|
| Status | `success` | ✓ |
| Records inserted | `2` | ✓ |
| Rejected | `0` | ✓ |
| Schema / SQL errors | `error: null` (no `investigations` or column-count errors) | ✓ |
| Run ID | `ING-1780960764369-20H9N5` | — |
| Worker run ID | `LWR-c1f55a4197bf3c41` | — |

**Station diagnostics (feed-health):**

| Station | Status | Last successful ingest (UTC) |
|---------|--------|------------------------------|
| `46042` | healthy | 2026-06-08T23:19:25.791Z |
| `41009` | healthy | 2026-06-08T23:19:28.457Z |

**Result:** **PASS**

---

## 3. CRW ingest validation

| Criterion | Observed | Pass |
|-----------|----------|------|
| Status | `success` | ✓ |
| Records inserted | `8` | ✓ |
| Rejected | `0` | ✓ |
| Column-count mismatch | `error: null` (prior `18 values for 17 columns` absent) | ✓ |
| Run ID | `ING-1780960769912-COZ4CR` | — |

**Result:** **PASS**

---

## 4. Feed-health validation

Probed via `GET https://api.vitalicast.com/health` at 2026-06-08T23:19:56Z:

```json
{
  "summary": {
    "latest_source_count": 2,
    "healthy_source_count": 2,
    "degraded_source_count": 0,
    "failed_source_count": 0,
    "stale_source_count": 0,
    "inserted_count": 10,
    "rejected_count": 0,
    "recent_history_count": 20,
    "last_completed_at": "2026-06-08T23:19:33.108Z"
  }
}
```

| Criterion | Observed | Pass |
|-----------|----------|------|
| `recent_history_count > 0` | `20` | ✓ |
| `last_completed_at` populated | `2026-06-08T23:19:33.108Z` | ✓ |
| Latest NDBC run successful | `status: success`, `inserted_count: 2` | ✓ |
| Latest CRW run successful | `status: success`, `inserted_count: 8` | ✓ |

**Result:** **PASS**

---

## 5. Production API validation

### `GET /health`

| Field | Value |
|-------|-------|
| HTTP status | **200** |
| `status` | `ok` |
| `dbReachable` | `true` |

### `GET /live-conditions`

| Field | Value |
|-------|-------|
| HTTP status | **200** |
| Condition count | `2` |
| Prior state (pre-`17dbde7`) | **503**, `conditions: []` |

**Lineage on returned rows (observed):**

| stationId | signalId | rootEventId | trustStatus | trustedForPromotion |
|-----------|----------|-------------|-------------|---------------------|
| `41009` | `SIG-c9393463ca8d6901` | `EHE-ingestion-8e553ccfe5fc53ac` | `withheld` | `false` |
| `46042` | `SIG-278f2353c2cf30d9` | `EHE-ingestion-c1dff20db8c981f3` | `withheld` | `false` |

All rows include `sourceIngestionEventId`, `verificationEventId`, and `provenanceHash`.

### `GET /reef-alerts`

| Field | Value |
|-------|-------|
| HTTP status | **200** |
| Alert count | `2` |
| Prior state (pre-`17dbde7`) | **503**, `alerts: []` |

| region | signalId | rootEventId | trustStatus | trustedForPromotion |
|--------|----------|-------------|-------------|---------------------|
| Florida Keys | `SIG-b04f469de8c8ef38` | `EHE-ingestion-f0f59e8d52b95166` | `withheld` | `false` |
| Southeast Florida | `SIG-5a36ec3b87c828f4` | `EHE-ingestion-b5e1f42a18a78da1` | `withheld` | `false` |

**Result:** **PASS** (endpoints respond 200 with lineage-bearing rows). **Trust promotion remains fail-closed** (`trustedForPromotion: false` on all returned signals).

---

## 6. Operator route validation

### `GET /internal/operator/status`

| Field | Value |
|-------|-------|
| HTTP status | **200** |
| `access` | `operator` |
| Harness ingestion runs visible | `12` recent events |
| Recent failures | `0` |
| Feed-health sub-panel | `source: unavailable`, `fallback_reason: db_path_missing` |

Route is live; feed-health aggregation on the serverless API instance does not resolve a local DB path (environment limitation, not ingest failure).

### `GET /internal/operator/replay-validation`

| Field | Value |
|-------|-------|
| HTTP status | **200** |
| `sampleCount` | `16` |
| `passedCount` | `13` |
| `failedCount` | `3` |
| `overallPass` | **`false`** |

**Failed samples (observed):**

| target id | failures | evidenceStatus |
|-----------|----------|----------------|
| `SIG-844f3fdf41e22586` | `evidence_withheld` | `withheld` |
| `alert-noaa_ndbc:46042-high_wind_speed-46042-1780960767348` | `evidence_withheld` | `withheld` |
| `alert-noaa_ndbc:46042-high_wave_height-46042-1780960767348` | `evidence_withheld` | `withheld` |

**Result:** **PARTIAL PASS** — routes respond; replay validation does not pass overall.

### `GET https://oceansig.com/operator`

| Field | Value |
|-------|-------|
| HTTP status | **404** |

Operator web UI not deployed (out of scope for commit `17dbde7` ingest fix).

---

## 7. Before / after comparison

| Check | Pre-`17dbde7` (2026-06-08T23:11Z) | Post-`17dbde7` (2026-06-08T23:19Z) |
|-------|-----------------------------------|-------------------------------------|
| NDBC ingest | `failed` — `no such table: investigations` | `success`, `inserted_count: 2` |
| CRW ingest | `failed` — `18 values for 17 columns` | `success`, `inserted_count: 8` |
| `/live-conditions` | 503, empty | 200, 2 rows with lineage |
| `/reef-alerts` | 503, empty | 200, 2 rows with lineage |
| Feed-health failed sources | `2` | `0` |
| Replay `overallPass` | `false` (10/14) | `false` (13/16) |

---

## 8. Evidence index

| Artifact | Location |
|----------|----------|
| Workflow run | https://github.com/Hutch10/marine-intelligence-platform/actions/runs/27173173009 |
| Commit | `17dbde784d7392456b9ef22843d2c8b392e1144d` |
| Total inserted (workflow) | `10` (NDBC `2` + CRW `8`) |
| Feed-health probe | `GET /health` → `feedHealth.summary` |
| Public API probes | `GET /live-conditions`, `GET /reef-alerts` |
| Operator probes | `GET /internal/operator/status`, `GET /internal/operator/replay-validation` |

---

## Final verdict

### **INGESTION RECOVERY VERIFIED**

Commit `17dbde7` resolves the observed production ingestion failures:

- NDBC ingest completes without schema errors and inserts records.
- CRW ingest completes without column-count mismatch and inserts records.
- Feed-health reflects successful latest runs with populated history.
- Public APIs return lineage-bearing rows (up from fail-closed 503).

### Trust chain status (fail-closed, not inferred)

Full HutchStack trust-chain promotion is **not yet verified**:

- All public signals carry `trustStatus: withheld` and `trustedForPromotion: false`.
- Replay validation reports `overallPass: false` (3/16 samples failed, `evidence_withheld`).
- Operator web remains 404.

**Promotion recommendation:** Remain **research-ready limited beta** until replay validation passes and `trustedForPromotion` is true for production signals.
