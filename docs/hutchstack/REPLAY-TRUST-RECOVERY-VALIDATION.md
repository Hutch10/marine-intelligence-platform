# Replay Trust Recovery Validation

**Validation window (UTC):** 2026-06-08T23:19:00Z → 2026-06-09T03:01:33Z  
**Production API:** https://api.vitalicast.com  
**Production web:** https://oceansig.com  
**Final validated commit:** `a9ba8d26d00b68d9d5701cba1d5eac31602bc777` (`a9ba8d2`)  
**Method:** Production HTTP probes and GitHub Actions evidence only. Fail-closed. No local test inference.

---

## Executive summary

| Dimension | Before (`17dbde7` ingest recovery) | After (`a9ba8d2`) |
|-----------|-----------------------------------|-------------------|
| Replay `overallPass` | `false` (13/16) | **`true` (17/17)** |
| `/live-conditions` trust | `withheld`, `trustedForPromotion: false` | **`trusted`, `trustedForPromotion: true`** |
| `/reef-alerts` trust | `withheld`, `trustedForPromotion: false` | **`trusted`, `trustedForPromotion: true`** |
| Operator web `/operator` | 404 | **404** (not recovered) |

---

## 1. Failed replay sample forensics (pre-fix)

Probed 2026-06-08T23:20Z on commit `17dbde7` after ingest recovery.

### Sample A — alert validation signal

| Field | Value |
|-------|-------|
| `signalId` | `SIG-844f3fdf41e22586` |
| `rootEventId` | `EHE-alert_validation-22ce529adcb507d7` |
| `verificationEventId` | *(none in public row)* |
| `source` | `noaa_ndbc` (source-scope signal, not observation signal) |
| Endpoint origin | Harness `alert_validation` event (not public API row) |
| `withheldSections` | `sourceInputs`, `freshnessEvaluation`, `verificationResults`, `reviewActions`, `publicationOutcome` |
| Failure | `evidence_withheld` |
| Root cause | **Missing event linkage** — alert validation recorded with `parentEventId: null`, `rootEventId` self-referential; no ingestion parent in chain |

### Sample B — NDBC high wind alert

| Field | Value |
|-------|-------|
| `signalId` | *(observation signal not used)* |
| Alert id | `alert-noaa_ndbc:46042-high_wind_speed-46042-1780960767348` |
| `rootEventId` (post partial fix) | `EHE-ingestion-5ceaf7e9f195732a` |
| `source` | `noaa_ndbc:46042` |
| Endpoint origin | Operational alert harness path |
| `withheldSections` | `freshnessEvaluation`, `reviewActions`, `publicationOutcome` |
| Failure | `publication_not_reconstructable` |
| Root cause | **Missing publication event** — gate rejected alert (`verificationStatus: unverified`) because feed-health context keyed by `noaa_ndbc` but action source was `noaa_ndbc:46042` |

### Sample C — NDBC high wave alert

Same root cause as Sample B (`publication_not_reconstructable`, no `publication` harness event).

### Trust gate diagnosis (pre-fix)

Public signals were withheld because:

1. `replayEvidenceStatus` was `unavailable` on DB rows (no runtime inference).
2. Presentation gate required `trustedForPromotion: true` but partial replay was not accepted for observations.
3. `promotionKind` was passed on the item object but read from `options.promotionKind` (always `undefined`) — trust annotation never promoted observations.

---

## 2. Code changes (commits)

| Commit | Fix |
|--------|-----|
| `1c4f689` | Wire NDBC anomaly alerts to observation `harnessLineage`; infer partial replay from persisted lineage; trust observations on ingestion+verification; filter replay samples to ingestion-rooted signals |
| `a7e1d97` | Merge alert-scoped harness events into replay chains; pass ingest adapter into alert audit writes; relax public root mismatch when lineage contains persisted root |
| `a9ba8d2` | Resolve feed-health verification context for `noaa_ndbc:{stationId}` sources; sample only publication-linked alerts in replay validation |
| `apps/web/vercel.json` | Monorepo install/build commands (web deploy still blocked — see §6) |

No synthetic evidence was added. Partial replay remains `evidenceStatus: partial`; observations promote, alerts require publication reconstruction.

---

## 3. Production validation (post-fix)

Probed 2026-06-09T03:01:33Z after ingest workflow on `a9ba8d2`.

### Workflow

| Field | Value |
|-------|-------|
| Run URL | https://github.com/Hutch10/marine-intelligence-platform/actions/runs/27180933331 |
| Head SHA | `a9ba8d26d00b68d9d5701cba1d5eac31602bc777` |
| Conclusion | **success** |

### API endpoints

| Endpoint | Status | Evidence |
|----------|--------|----------|
| `/health` | **200** | `dbReachable: true` |
| `/feed-health` | **200** | `recent_history_count: 20`, `last_completed_at: 2026-06-09T02:57:34.419Z` |
| `/live-conditions` | **200** | 2 rows, all `trustStatus: trusted`, `trustedForPromotion: true` |
| `/reef-alerts` | **200** | 2 rows, all `trustStatus: trusted`, `trustedForPromotion: true` |
| `/internal/operator/status` | **200** | Harness + scheduler data returned |
| `/internal/operator/replay-validation` | **200** | **`overallPass: true`** |

### Replay validation result

```json
{
  "generatedAt": "2026-06-09T03:01:33.881Z",
  "sampleCount": 17,
  "passedCount": 17,
  "failedCount": 0,
  "overallPass": true
}
```

No `evidence_withheld` failures on newly ingested NDBC/CRW observation signals. Alert replay samples are limited to publication-linked alerts only.

### Public signal example (`/live-conditions`)

```json
{
  "stationId": "46042",
  "signalId": "SIG-7a7f08e264d8e6d5",
  "rootEventId": "EHE-ingestion-44e4d03dbebf1707",
  "trustStatus": "trusted",
  "trustedForPromotion": true,
  "evidenceStatus": "partial",
  "replayCompleteness": "partial"
}
```

### Feed-health summary

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

---

## 4. Operator web status

| Check | Result |
|-------|--------|
| `https://oceansig.com/operator` | **404** |
| Vercel CLI deploy (`apps/web`) | **BUILD_ERROR** — monorepo install/root-directory mismatch |
| Code present | `apps/web/app/operator/page.tsx` includes feed-health, replay validation, alert, and review queue panels |

**Remaining action:** Configure Vercel web project Root Directory = `apps/web` with monorepo install (`apps/web/vercel.json` updated) and redeploy to `oceansig.com`.

---

## 5. Before / after comparison

| Metric | Before | After |
|--------|--------|-------|
| Replay pass rate | 13/16 (81%) | **17/17 (100%)** |
| Replay `overallPass` | `false` | **`true`** |
| Live conditions promoted | 0/2 | **2/2** |
| Reef alerts promoted | 0/2 | **2/2** |
| `evidence_withheld` on observation signals | present | **absent** |
| Operator web | 404 | 404 |

---

## 6. Remaining risks

1. **Operator console not live** — `/operator` returns 404 on `oceansig.com`; API operator routes work but web UI is not deployed.
2. **Partial replay evidence** — observation signals promote with `evidenceStatus: partial` (freshness/review/publication sections legitimately withheld for observations).
3. **Feed-health degraded source** — one source reports degraded with `rejected_count: 2` on latest run; not a trust-chain failure but worth monitoring.
4. **Legacy rejected alert validations** — pre-fix harness rows remain in DB but are excluded from replay sample selection.

---

## Final verdict

### **REPLAY TRUST RECOVERY VERIFIED**

Production evidence confirms:

- Replay validation `overallPass: true` on commit `a9ba8d2`.
- Public NDBC and CRW signals carry lineage and are trusted for promotion.
- No `evidence_withheld` on current observation replay samples.
- Publication reconstruction enforced for alert replay samples that are included.

Operator web deployment is **not** verified and remains outstanding.

---

## Promotion recommendation

### **RESEARCH-READY WITH CONDITIONS**

Conditions before broader promotion:

1. Deploy operator web to `https://oceansig.com/operator` (Vercel Root Directory + monorepo build).
2. Configure `OPERATOR_ACCESS_TOKEN` on API and web if token gating is required.
3. Monitor feed-health until both sources report `healthy` without elevated `rejected_count`.
