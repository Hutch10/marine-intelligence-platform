# Phase 0 Invariants — HutchStack Core Extraction

**Status:** FROZEN  
**Effective (UTC):** 2026-06-10T04:51:23Z  
**Scope:** Marine Intelligence production reference implementation  
**Purpose:** Behavioral contract that all HutchStack Core extraction work must preserve.

Phase 0A establishes **documentation and verification only**. No runtime, route, trust, or deployment changes are permitted under this freeze without explicit program approval and a new baseline revision.

---

## 1. Immutable route contracts

### Public API routes (must not change path, method, or auth model)

| Method | Path | Auth | Expected status |
|--------|------|------|-----------------|
| GET | `/health` | None | 200 |
| GET | `/live-conditions` | None | 200 |
| GET | `/reef-alerts` | None | 200 |
| GET | `/feed-health` | None | 200 |
| GET | `/operational-alerts` | None | 200 |
| GET | `/signals` | None | 200 |
| GET | `/validation/summary` | None | 200 |

### Operator / harness routes (token required when `OPERATOR_ACCESS_TOKEN` is set)

| Method | Path | Auth | Denied response |
|--------|------|------|-----------------|
| GET | `/internal/operator/status` | `?token=` query | 403 `{"message":"Operator access required"}` |
| GET | `/internal/operator/replay-validation` | `?token=` query | 403 |
| POST | `/internal/operator/replay-validation/run` | `?token=` query | 403 |
| GET | `/internal/operator/review-queue` | `?token=` query | 403 |
| POST | `/internal/operator/review-queue/action` | `?token=` query | 403 |
| POST | `/internal/operator/review-queue/enqueue` | `?token=` query | 403 |
| GET | `/internal/operator/analytics` | `?token=` query | 403 |
| GET | `/internal/lineage/:recordId` | `?token=` query | 403 |
| GET | `/api/replay/signal/:id` | `?token=` query | 403 |
| GET | `/api/replay/alert/:id` | `?token=` query | 403 |
| GET | `/api/replay/event/:id` | `?token=` query | 403 |
| GET | `/internal/scientific/export` | `?token=` query | 403 |

### Web operator surface

| Path | Without token | With valid token |
|------|---------------|------------------|
| `https://oceansig.com/operator` | 307 redirect (access required) | 200 |

**Invariant:** Route paths and HTTP methods listed above must not change during Phases 0B–7. New routes may be added only if they do not alter existing contracts.

---

## 2. Immutable ID formats

All identifiers are deterministic. Changing canonical JSON sort order, hash algorithm, or prefix format is a **breaking invariant violation**.

### Content hash

```
stableContentHash(payload):
  canonical = JSON.stringify(payload, Object.keys(payload).sort())
  return SHA-256(canonical) as 64-char lowercase hex
```

**Source:** `apps/api/src/services/environmental-harness/provenance.ts`

### Harness event ID

```
buildHarnessEventId(eventKind, subjectType, subjectId, contentHash):
  digest = SHA-256("{eventKind}|{subjectType}|{subjectId}|{contentHash}").slice(0, 16)
  return "EHE-{eventKind}-{digest}"
```

**Example:** `EHE-ingestion-1b7569f8c1d14401`

### Signal ID

```
buildDeterministicSignalId({ source, stationId, regionKey, observedAt, provenanceId }):
  digest = stableContentHash({...}).slice(0, 16)
  return "SIG-{digest}"
```

**Example:** `SIG-3e00cec6a71909e2`

### Replay packet ID

```
buildReplayPacketId({ rootEventId, signalId, alertId, eventId, lineageEventIds }):
  digest = stableContentHash({ rootEventId, signalId, alertId, eventId, lineageEventIds: sorted })
  return "RP-{digest.slice(0, 16)}"
```

### Evidence packet ID

```
buildEvidencePacketId(replayPacketId, rootEventId):
  digest = stableContentHash({ replayPacketId, rootEventId })
  return "EVP-{digest.slice(0, 16)}"
```

### Lineage event type mapping

| `HarnessEventKind` | `HarnessLineageEventType` |
|--------------------|---------------------------|
| `ingestion`, `scheduler_execution` | `ingestion` |
| `verification`, `freshness` | `verification` |
| `alert_validation` | `alert` |
| `human_review` | `review` |
| `publication` | `publication` |

**Source:** `apps/api/src/services/environmental-harness/lineage.ts`

---

## 3. Immutable replay packet format

**Type:** `EnvironmentalReplayPacket` (`packages/shared/src/harness-replay.ts`)

### Required top-level fields

| Field | Type | Invariant |
|-------|------|-----------|
| `packetId` | `string` | `RP-*` prefix; deterministic |
| `lineage` | `HarnessLineageNode[]` | Ordered chain; each node has `eventId`, `rootEventId`, `eventType` |
| `sourceInputs` | `ReplaySourceInputs \| ReplayWithheldSection` | Withheld must include `status` + `reason` |
| `freshnessEvaluation` | `ReplayFreshnessEvaluation` | Available or withheld |
| `verificationResults` | `ReplayVerificationResults` | Available or withheld |
| `alertDecisions` | `ReplayAlertDecisions` | Available or withheld |
| `reviewActions` | `ReplayReviewActions` | Available or withheld |
| `publicationOutcome` | `ReplayPublicationOutcome` | Available or withheld |
| `evidenceStatus` | `"complete" \| "partial" \| "withheld"` | Must reflect actual reconstructability |
| `withheldSections` | `string[]` | Names of withheld sections when applicable |

### HarnessLineageNode fields

```typescript
{
  eventId: string;
  parentEventId: string | null;
  rootEventId: string;
  eventType: HarnessLineageEventType;
  createdAt: string;  // ISO 8601 UTC
  outcome?: HarnessOutcome;
}
```

### Withheld section contract

```typescript
{ status: "withheld" | "unavailable"; reason: string }
```

**Invariant:** Replay must never synthesize `complete` evidence from missing lineage. Withheld sections must be explicitly named in `withheldSections`.

---

## 4. Immutable evidence packet format

**Type:** `EnvironmentalEvidencePacket` (`packages/shared/src/harness-replay.ts`)

### Required top-level fields

| Field | Type | Invariant |
|-------|------|-----------|
| `packetId` | `string` | `EVP-*` prefix; deterministic from replay packet + root |
| `generatedAt` | `string` | ISO 8601 UTC |
| `rootEventId` | `string` | Must match lineage root |
| `provenance` | `EnvironmentalSignalProvenance \| ReplayWithheldSection` | — |
| `lineage` | `HarnessLineageNode[]` | Same chain as replay |
| `verification` | `ReplayVerificationResults` | — |
| `reviewHistory` | `ReplayReviewActions` | — |
| `publicationDecision` | `ReplayPublicationOutcome` | Required for alert reconstruction |
| `replay` | `EnvironmentalReplayPacket` | Embedded replay packet |
| `evidenceStatus` | `"complete" \| "partial" \| "withheld"` | — |
| `withheldSections` | `string[]` | — |

---

## 5. Immutable trust metadata fields

**Type:** `PublicTrustMetadata` (`packages/shared/src/harness-operator.ts`)

```typescript
{
  trustedForPromotion: boolean;
  evidenceStatus: "complete" | "partial" | "withheld" | "unavailable";
  replayCompleteness: "reconstructable" | "partial" | "unavailable";
}
```

### Public signal trust fields (`LiveMarineCondition`, `ReefStressWatchItem`)

| Field | Type | Invariant |
|-------|------|-----------|
| `trustStatus` | `EnvironmentalSignalTrustStatus` | `trusted \| unverified_lineage \| withheld \| partial` |
| `trustedForPromotion` | `boolean` | Must align with harness gate outcome |
| `rootEventId` | `string \| null` | **Required** on all `trustStatus: trusted` public rows |
| `evidenceStatus` | `PublicTrustMetadata["evidenceStatus"]` | — |
| `replayCompleteness` | `PublicTrustMetadata["replayCompleteness"]` | — |
| `verificationStatus` | `VerificationStatus` | `verified \| unverified \| withheld \| failed` |
| `signalId` | `string` | `SIG-*` when present |
| `provenance` | `EnvironmentalSignalProvenance` | Required for promotion |
| `provenanceId` | `string \| null` | — |

### Trust gate rules (behavior frozen)

1. Synthetic sources never promote (`isSyntheticSource`).
2. `verificationStatus` of `withheld`, `failed`, or `unverified` blocks promotion.
3. `freshnessClassification: withheld` blocks promotion.
4. `freshnessStatus.policyBand: fail` blocks promotion.
5. When `requireReplayLineage` is true, missing `rootEventId` blocks promotion.
6. Observations may promote with `evidenceStatus: partial` when ingestion + verification events exist.
7. Alerts require `publicationReconstructable: true` in replay validation.

**Source:** `apps/api/src/services/environmental-harness/presentation-gate.ts`

---

## 6. Immutable operator API schemas

### Replay validation (`ReplayValidationJobResult`)

**Route:** `GET /internal/operator/replay-validation`

```typescript
{
  generatedAt: string;       // ISO 8601
  sampleCount: number;
  passedCount: number;
  failedCount: number;
  overallPass: boolean;      // MUST be true for burn-in pass
  samples: ReplayValidationCheckResult[];
}
```

### Replay validation sample (`ReplayValidationCheckResult`)

```typescript
{
  target: { kind: "signal" | "alert"; id: string };
  passed: boolean;
  failures: string[];
  evidenceStatus: "complete" | "partial" | "withheld" | "unavailable";
  withheldSections: string[];
  packetId: string | null;
  rootEventId: string | null;
  publicationReconstructable: boolean | null;  // required for alert samples
}
```

### Operator status (`OperatorStatusResponse`)

**Route:** `GET /internal/operator/status`

```typescript
{
  generated_at: string;
  access: "operator";
  feed_health: FeedHealthResponse;
  scheduler: OperatorSchedulerStatus;
  circuit_breaker: CircuitBreakerSnapshot;
  freshness_governance: FreshnessGovernanceSnapshot;
  recent_failures: OperatorFailureItem[];
  recent_recoveries: OperatorRecoveryItem[];
  harness: OperatorConsoleHarnessSection;
}
```

### Operator harness section (`OperatorConsoleHarnessSection`)

Required sub-sections (field names frozen):

- `latestIngestionRuns`
- `verificationStatus`
- `replayCompleteness`
- `replayValidation` (embeds full `ReplayValidationJobResult`)
- `publicationDecisions`
- `humanReviewActions`
- `reviewQueue` (`pendingCount`, `items`)
- `alerts` (`activeCount`, `suppressedCount`, `active`, `suppressed`)

**Source types:** `packages/shared/src/harness-operator.ts`, `apps/api/src/routes/operator-status.ts`

---

## 7. Burn-in protocol invariants

Reference: [H72-REPLAY-AWARE-BURN-IN-REPORT.md](./H72-REPLAY-AWARE-BURN-IN-REPORT.md)

| Parameter | Frozen value |
|-----------|--------------|
| T0 | `2026-06-09T03:41:35Z` |
| H+72 end | `2026-06-12T03:41:35Z` |
| Canonical H+6 | `2026-06-09T09:41:35Z` |
| Verify script | `scripts/telemetry-activation/verify-production-telemetry.ps1` |
| API base | `https://api.vitalicast.com` |
| Web base | `https://oceansig.com` |

### Freshness thresholds (verify script)

| Source | Warn | Hard fail |
|--------|------|-----------|
| NDBC observation age | — | > 6 hours |
| CRW product age | > 48 hours | > 72 hours |
| Scheduler execution age | — | > 3 hours |

### Promotion gates (must hold at H+72)

- Replay `overallPass: true` at every checkpoint
- Public trusted signals missing `rootEventId`: **0**
- `feed-health.recent_history_count > 0`
- Operator routes protected (403 without token)
- Scheduler success ≥ 95% (rolling window)
- No mock/simulated data promoted

---

## 8. Extraction work rules

During Phases 0B–7, every change must satisfy:

| Rule | Verification |
|------|--------------|
| No public API schema regression | `live-conditions.test.ts`, `reef-alerts.test.ts` |
| No replay ID drift | `environmental-harness-replay.test.ts` |
| No trust gate regression | `environmental-harness.test.ts` |
| No operator schema regression | `operator-status.test.ts`, `environmental-harness-operator.test.ts` |
| Production replay pass | `verify-production-telemetry.ps1` exit 0 |
| Production lineage | 0 trusted rows missing `rootEventId` |

Run: `scripts/phase0/verify-phase0-invariants.ps1`

---

## 9. Revision policy

This document may be revised only when:

1. A new production baseline is recorded in `PHASE-0-BASELINE.md`, and
2. The revision is explicitly approved as part of the HutchStack extraction program, and
3. All invariant changes are backward-compatible or accompanied by a versioned migration plan.

**Baseline reference:** [PHASE-0-BASELINE.md](./PHASE-0-BASELINE.md)
