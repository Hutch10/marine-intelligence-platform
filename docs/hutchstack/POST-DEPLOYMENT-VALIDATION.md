# Post-Deployment Validation — Marine Intelligence Platform Convergence

**Validation window (UTC):** 2026-06-08T05:03:00Z → 2026-06-08T23:05:00Z  
**Production API:** https://api.vitalicast.com  
**Production web:** https://oceansig.com  
**Deployed commit (final validation):** `d98129d` (+ pending adapter-lifecycle fix)  
**Method:** Evidence-only live probes, GitHub deployment metadata, and script execution. Fail-closed.

---

## Deployment timeline (observed)

| Commit | Purpose | Deployment time (UTC) | Result |
|--------|---------|----------------------|--------|
| `1faa04a` | Phase 3/4 convergence merge | 2026-06-08T05:04 | Operator routes 404 → 200; Turso broken |
| `66b9092` | Build fixes (`@marine/shared` dist exports) | 2026-06-08T05:17 | Build succeeds; Turso still broken |
| `97f429e` / `d7d4026` / `5964b35` | libsql bundling attempts | 2026-06-08T05:23–06:34 | Turso still broken |
| `22b0913` | Hoisted `.npmrc` + validation doc | 2026-06-08T22:42 | Turso still broken |
| **`d98129d`** | **Stage `@libsql/client` into API dist** | **2026-06-08T22:57** | **Turso restored** |

Source: `gh api repos/Hutch10/marine-intelligence-platform/deployments`.

---

## Migrations (0003, 0004, 0005)

| Migration | On deployed branch | Runtime evidence |
|-----------|-------------------|------------------|
| `0003_environmental_harness_lineage.sql` | Yes | Harness events queryable; replay samples show `rootEventId` |
| `0004_environmental_review_queue.sql` | Yes | Operator status reports `reviewQueue.pendingCount: 0` |
| `0005_environmental_signal_lineage.sql` | Yes | Legacy observation rows lack lineage; harness events populated for recent ingests |

Schema columns are applied via runtime `ensure*` functions on first Turso access. Direct SQL audit was not performed (no Turso credentials in validation environment).

**Result:** **PARTIAL PASS** — schema operational for harness events; legacy public signal rows pre-date lineage backfill (by design, no fake backfill).

---

## Route verification (post-`d98129d`)

Probed 2026-06-08T22:58 UTC:

| Route | Status | Evidence |
|-------|--------|----------|
| `/health` | **200** | `dbReachable: true` |
| `/live-conditions` | **503** | `conditions: []` — fail-closed (legacy rows lack lineage) |
| `/reef-alerts` | **503** | `alerts: []` — fail-closed |
| `/feed-health` | **200** | `source: db`, `recent_history_count: 20`, `last_completed_at: 2026-06-08T22:52:45.418Z` |
| `/internal/operator/status` | **200** | Full harness aggregation returned |
| `/internal/operator/replay-validation` | **200** | `sampleCount: 14`, `overallPass: false` |
| `/api/replay/signal/:id` | **200** (with valid signal ID) | Replay packets generate for harness events |
| `https://oceansig.com/operator` | **404** | Operator web UI not deployed |

---

## Lineage field validation (public API)

Required fields: `signalId`, `rootEventId`, `verificationEventId`, `provenanceHash`, `trustStatus`.

**Observed:** `/live-conditions` and `/reef-alerts` return **503 with empty arrays**. Phase 4 fail-closed filtering withholds legacy rows that lack persisted lineage. No public row is returned for field inspection.

**Harness-level lineage (replay validation samples — observed):**

```json
{
  "target": { "kind": "signal", "id": "SIG-1fd0cc502a437d45" },
  "passed": true,
  "rootEventId": "EHE-ingestion-efb33ff4bb65cada",
  "packetId": "RP-30b2748d03133977",
  "evidenceStatus": "partial"
}
```

**Failed public API replay samples (legacy DB rows):**

```json
{
  "target": { "kind": "signal", "id": "public-live_condition" },
  "passed": false,
  "failures": ["signal_id_missing", "root_event_id_missing"]
}
```

**Result:** **FAIL for public API lineage display** — correct fail-closed behavior, but no trusted public signals promoted.

---

## Feed-health validation

Observed at `d98129d` (2026-06-08T22:58 UTC):

| Check | Required | Observed |
|-------|----------|----------|
| `recent_history_count > 0` | Yes | **20** |
| `last_completed_at` populated | Yes | **2026-06-08T22:52:45.418Z** |
| Ingestion reports persist | Yes | **Yes** — 20 history entries visible |

Latest source status shows NDBC and CRW runs **failed** with `Client is closed: Client was manually closed` (adapter lifecycle bug during lineage writes — fix committed, pending deploy).

**Result:** **PASS** for persistence visibility; **FAIL** for latest ingest success.

---

## Replay validation

Observed `/internal/operator/replay-validation` (2026-06-08T22:58 UTC):

| Check | Result |
|-------|--------|
| Route reachable | **PASS** (200) |
| Replay packets generate | **PASS** (10/14 samples; harness events) |
| `rootEventId` exists | **PASS** on harness event samples |
| Lineage reconstructable | **PARTIAL** (`evidenceStatus: partial`, publication withheld) |
| Public signal lineage match | **FAIL** (4/14 — legacy public rows) |
| `overallPass` | **false** |

**Result:** **FAIL** — replay engine operational but burn-in gate not satisfied.

---

## Verification script repair

| Script | Status |
|--------|--------|
| `verify-production-telemetry.ps1` | **PASS** — em-dash replaced with ASCII; runs without parse error |
| `verify-production-telemetry.sh` | **PASS** — em-dash normalized |

Note: Script still reports FAIL for `OPERATOR_ACCESS_TOKEN not set` in local validation environment.

---

## Remaining risks

1. **Ingestion adapter lifecycle:** `recordHarnessEvent` closed caller-owned Turso adapter during NDBC/CRW ingest, causing `Client is closed` failures (fix committed, not yet deployed at validation time).
2. **Legacy lineage gap:** Pre-Phase-4 observation/alert rows lack persisted lineage; public API correctly withholds them (503).
3. **Operator web absent:** `https://oceansig.com/operator` returns 404.
4. **OPERATOR_ACCESS_TOKEN:** Not verified in production secrets during validation.
5. **Replay burn-in incomplete:** `overallPass: false` due to public API legacy samples.

---

## PROMOTION READINESS RECOMMENDATION

### **REMAIN RESEARCH-READY LIMITED BETA**

Based solely on live production evidence at `d98129d`:

**What converged:**
- Phase 3/4 API deployed (`5964b35` → `d98129d`)
- Turso connectivity restored (`dbReachable: true`)
- Operator API routes operational
- Feed-health persistence visible (`recent_history_count: 20`)
- Replay engine generates packets for harness events with `rootEventId`
- Phase 4 fail-closed withholding active (503 on lineage-missing public signals)
- Verification scripts encoding-safe on Windows

**What blocks promotion:**
- No trusted public signals returned (503 on `/live-conditions` and `/reef-alerts`)
- Public lineage fields not observable on any promoted row
- Replay validation `overallPass: false`
- Latest GHA ingest failed (`Client is closed`) — fresh lineage not written to public tables
- Operator web UI not deployed
- `OPERATOR_ACCESS_TOKEN` not confirmed

**Next validation gate (after adapter-lifecycle fix deploy + successful ingest):**
1. Confirm GHA `ingest:live` succeeds with lineage columns populated on new observations
2. Confirm `/live-conditions` returns trusted rows with `signalId`, `rootEventId`, `trustStatus`
3. Confirm replay validation `overallPass: true`
4. Deploy operator web to `https://oceansig.com/operator`
5. Re-run `verify-production-telemetry.ps1` with `OPERATOR_ACCESS_TOKEN` set

Until those checks pass with observed production evidence, **RESEARCH-READY** or **RESEARCH-READY WITH CONDITIONS** is not supportable.
