# Phase 0C — Type Extraction Report

**Executed (UTC):** 2026-06-10  
**Scope:** Type-only trust and lineage interface extraction to `@marine/shared`  
**Deployments:** None  
**Reference:** [PHASE-0C-READINESS-REVIEW.md](./PHASE-0C-READINESS-REVIEW.md), [PHASE-0-INVARIANTS.md](./PHASE-0-INVARIANTS.md)

---

## Objective

Extract shared trust and lineage interfaces without changing runtime behavior, routes, trust gate logic, or replay logic.

---

## Interfaces extracted

| Interface | Location | Purpose |
|-----------|----------|---------|
| `TrustEvidenceStatus` | `harness-trust-types.ts` | Union for evidence availability |
| `TrustReplayCompleteness` | `harness-trust-types.ts` | Union for replay reconstructability |
| `TrustMetadata` | `harness-trust-types.ts` | Resolved trust projection (`trustedForPromotion`, `evidenceStatus`, `replayCompleteness`) |
| `ReplayLineageReference` | `harness-trust-types.ts` | `signalId`, `rootEventId`, `sourceIngestionEventId`, `verificationEventId`, `provenanceHash` |
| `VerificationReference` | `harness-trust-types.ts` | `verificationStatus` |
| `ReplayValidationReference` | `harness-trust-types.ts` | `replayEvidenceStatus`, `evidenceStatus`, `replayCompleteness`, `packetId`, `publicationReconstructable` |
| `SignalTrustFields` | `harness-trust-types.ts` | Trust gate input — composes all reference interfaces + provenance/freshness/promotion fields |
| `PublicSignalTrustProjection` | `types.ts` | Optional trust fields on public API rows (`Partial<TrustMetadata>` + `trustStatus`) |

### Backward compatibility

| Prior name | Phase 0C mapping |
|------------|------------------|
| `PublicTrustMetadata` | Type alias → `TrustMetadata` (exported from `harness-operator.ts`) |
| `HarnessPresentationInput` | Type alias → `SignalTrustFields` (in `presentation-gate.ts`) |

**Serialized API contracts:** Unchanged — field names and types on `LiveMarineCondition`, `ReefStressWatchItem`, operator JSON, and replay packets are preserved via interface extension (structural equivalence).

---

## Files changed

| File | Action |
|------|--------|
| `packages/shared/src/harness-trust-types.ts` | **Created** — canonical trust/lineage interfaces |
| `packages/shared/src/index.ts` | **Updated** — export `harness-trust-types` |
| `packages/shared/src/harness-operator.ts` | **Updated** — operator types extend shared references; `PublicTrustMetadata` alias |
| `packages/shared/src/types.ts` | **Updated** — `LiveMarineCondition`, `ReefStressWatchItem` extend shared interfaces |
| `apps/api/src/services/environmental-harness/presentation-gate.ts` | **Updated** — `HarnessPresentationInput = SignalTrustFields`; import shared types |

### Files intentionally untouched

- All route files (`server.ts`, operator routes, replay routes)
- `replay.ts`, `replay-validation.ts`, `freshness-policy.ts`
- Migrations, workers, `apps/web`
- Burn-in scripts and thresholds
- `harness-primitives.ts`, `harness-replay.ts` packet schemas

---

## Dependency reduction achieved

### Before

| Duplication | Locations |
|-------------|-----------|
| Trust input fields | Inline `HarnessPresentationInput` in `presentation-gate.ts` |
| Public trust fields | Duplicated on `LiveMarineCondition` and `ReefStressWatchItem` in `types.ts` |
| Evidence status unions | Repeated inline in `harness-operator.ts` (6+ occurrences) |
| `PublicTrustMetadata` | Standalone interface separate from public row fields |

### After

```
harness-trust-types.ts (canonical)
  ├── SignalTrustFields ──→ HarnessPresentationInput (alias)
  ├── TrustMetadata ──────→ PublicTrustMetadata (alias)
  ├── ReplayLineageReference ──→ LiveMarineCondition, ReefStressWatchItem, operator types
  ├── VerificationReference ───→ LiveMarineCondition, ReefStressWatchItem
  └── ReplayValidationReference → operator replay types, public rows
```

| Metric | Before | After |
|--------|--------|-------|
| Trust field definitions | 3 locations | 1 canonical module |
| Inline evidence unions in operator | 6+ | 0 (uses `TrustEvidenceStatus`) |
| `presentation-gate` marine type imports for gate input | 5 harness types | `SignalTrustFields` + `PublicTrustMetadata` |

**Runtime coupling:** Unchanged — no adapter wiring, no package moves, no repository import changes.

---

## Validation results

| Check | Result |
|-------|--------|
| `pnpm --filter @marine/shared build` | **PASS** (exit 0) |
| `pnpm --filter api typecheck` | **PASS** (exit 0) |
| `environmental-harness-replay.test.ts` | **PASS** |
| `environmental-harness-lineage.test.ts` | **PASS** |
| **Required replay + lineage** | **15/15 PASS** |
| `environmental-harness.test.ts` | **26/27** — 1 pre-existing fail (`reef alerts include provenance harness fields`; mock alert filtered by trust gate; documented in Phase 0A/0B) |
| `verify-phase0-invariants.ps1` | **PASS** (exit 0) |
| Production replay validation | **18/18**, `overallPass: true` |
| Production lineage | **0** trusted rows missing `rootEventId` |

### Invariant preservation

| Invariant | Status |
|-----------|--------|
| No route changes | **PASS** |
| No runtime logic changes | **PASS** — gate function bodies unchanged |
| No trust gate behavior changes | **PASS** |
| No replay packet schema changes | **PASS** |
| No ID format changes | **PASS** (replay + lineage tests green) |
| Public API field names preserved | **PASS** (structural extension) |

---

## Rollback strategy

```bash
git revert <phase-0c-commit>
pnpm --filter @marine/shared build
pnpm --filter api typecheck
node --import tsx --test apps/api/src/services/environmental-harness-replay.test.ts
node --import tsx --test apps/api/src/services/environmental-harness-lineage.test.ts
```

No migration rollback. No production deploy required for rollback unless 0C was deployed.

---

## Next step (not in scope)

**Phase 1:** Extract `@hutchstack/contracts` package from `harness.ts`, `harness-replay.ts`, `harness-trust-types.ts`, `harness-operator.ts`.

---

## Final verdict

# **PHASE 0C VERIFIED**

**Evidence:**

- Shared package builds; API typechecks clean
- Replay + lineage deterministic tests **15/15 pass**
- Trust gate logic bodies unchanged; only type declarations consolidated
- `PublicTrustMetadata` and `HarnessPresentationInput` preserved as aliases
- Phase 0 invariant script **PASS** including production replay **18/18**
- No deployments performed; production behavior unchanged until explicit deploy
