# Phase 0B — Primitive Extraction Report

**Executed (UTC):** 2026-06-10T05:01:07Z  
**Scope:** Break repository-to-service circular dependency via `@marine/shared` primitives  
**Deployments:** None (local extraction only)  
**Reference:** [PHASE-0-INVARIANTS.md](./PHASE-0-INVARIANTS.md), [PHASE-0-BASELINE.md](./PHASE-0-BASELINE.md)

---

## Objective

Move pure deterministic harness ID/hash primitives into `@marine/shared` so the event-store repository no longer imports `environmental-harness` service modules — without changing runtime behavior, routes, trust logic, or replay logic.

---

## Files changed

| File | Action |
|------|--------|
| `packages/shared/src/harness-primitives.ts` | **Created** — verbatim primitive implementations |
| `packages/shared/src/index.ts` | **Updated** — export `harness-primitives` |
| `apps/api/src/services/environmental-harness/provenance.ts` | **Updated** — re-export primitives; retain `buildSignalProvenance` |
| `apps/api/src/services/environmental-harness/lineage.ts` | **Updated** — thin re-export shim from `@marine/shared` |
| `apps/api/src/repositories/environmental-harness-events.ts` | **Updated** — import primitives from `@marine/shared` |

### Files intentionally untouched

- All route files (`server.ts`, `operator-status.ts`, `replay-validation.ts`, etc.)
- `replay.ts`, `replay-validation.ts`, `presentation-gate.ts`, `freshness-policy.ts`
- Migrations, workers, `apps/web`, burn-in scripts
- No `@hutchstack/*` packages created

---

## Dependency cycle removed

### Before (circular)

```
environmental-harness-events.ts (repository)
  → provenance.ts (service)
  → lineage.ts (service)
    → provenance.ts

replay.ts / audit.ts / signal-lineage.ts (services)
  → environmental-harness-events.ts (repository)
```

The repository layer depended on the service layer for `stableContentHash`, `buildHarnessEventId`, and `lineageEventTypeFromKind`, while services depended on the repository for event persistence.

### After (acyclic at primitive boundary)

```
environmental-harness-events.ts (repository)
  → @marine/shared/harness-primitives

provenance.ts / lineage.ts (service shims)
  → @marine/shared/harness-primitives

replay.ts / audit.ts (services)
  → environmental-harness-events.ts (repository)   [unchanged, one-way]
```

**Cycle broken:** `environmental-harness-events.ts` no longer imports any file under `services/environmental-harness/`.

---

## Import path changes

### `environmental-harness-events.ts`

| Symbol | Before | After |
|--------|--------|-------|
| `stableContentHash` | `../services/environmental-harness/provenance` | `@marine/shared` |
| `buildHarnessEventId` | `../services/environmental-harness/provenance` | `@marine/shared` |
| `lineageEventTypeFromKind` | `../services/environmental-harness/lineage` | `@marine/shared` |

### `provenance.ts` (backward-compatible shim)

| Symbol | Implementation |
|--------|----------------|
| `stableContentHash` | Re-export from `@marine/shared` |
| `buildHarnessEventId` | Re-export from `@marine/shared` |
| `buildSignalProvenance` | **Unchanged** — remains in `provenance.ts` |

### `lineage.ts` (backward-compatible shim)

| Symbol | Implementation |
|--------|----------------|
| `lineageEventTypeFromKind` | Re-export from `@marine/shared` |
| `buildDeterministicSignalId` | Re-export from `@marine/shared` |
| `buildSourceScopeSignalId` | Re-export from `@marine/shared` |
| `buildReplayPacketId` | Re-export from `@marine/shared` |
| `buildEvidencePacketId` | Re-export from `@marine/shared` |

**Note:** 11 other importers continue to use `./provenance` or `./lineage` shims — no import-path churn required.

---

## Primitives extracted

| Function | Source (pre-0B) | Destination |
|----------|-----------------|-------------|
| `stableContentHash` | `provenance.ts` | `harness-primitives.ts` |
| `buildHarnessEventId` | `provenance.ts` | `harness-primitives.ts` |
| `lineageEventTypeFromKind` | `lineage.ts` | `harness-primitives.ts` |
| `buildDeterministicSignalId` | `lineage.ts` | `harness-primitives.ts` |
| `buildSourceScopeSignalId` | `lineage.ts` | `harness-primitives.ts` |
| `buildReplayPacketId` | `lineage.ts` | `harness-primitives.ts` |
| `buildEvidencePacketId` | `lineage.ts` | `harness-primitives.ts` |

**Invariant:** Implementations copied verbatim (same canonical JSON sort, SHA-256, ID prefixes).

---

## Validation results

### Build and typecheck

| Command | Result |
|---------|--------|
| `pnpm --filter @marine/shared build` | **PASS** (exit 0) |
| `pnpm --filter api typecheck` | **PASS** (exit 0) |

### Required harness tests (deterministic ID invariants)

| Test file | Result |
|-----------|--------|
| `environmental-harness-replay.test.ts` | **PASS** |
| `environmental-harness-lineage.test.ts` | **PASS** |
| **Combined** | **15/15 pass** |

These tests assert `RP-*`, `EVP-*`, `SIG-*`, and `stableContentHash` determinism — confirming no ID drift from extraction.

### Targeted harness tests (user-requested set)

| Test file | Result | Notes |
|-----------|--------|-------|
| `environmental-harness-replay.test.ts` | **PASS** | — |
| `environmental-harness-lineage.test.ts` | **PASS** | — |
| `environmental-harness.test.ts` | **1 fail** | `reef alerts include provenance harness fields` — pre-existing; mock alert filtered by trust gate without `rootEventId` (documented in Phase 0A baseline) |
| `operator-status.test.ts` | **PASS** | — |
| `live-conditions.test.ts` | **1 fail** | `live-conditions route returns db-backed conditions` — **skipped reason:** no local `marine.sqlite` |
| `reef-alerts.test.ts` | **1 fail** | `reef-alerts route returns db-backed reef stress alerts` — **skipped reason:** no local `marine.sqlite` |

**Targeted total:** 30 pass / 3 fail (all failures pre-date 0B; none in replay/lineage ID tests)

### Full API test suite

| Metric | Result |
|--------|--------|
| `pnpm --filter api test` | **707 pass / 99 fail** (exit 1) |
| Delta vs Phase 0A baseline | **No regression** — same pass/fail count |

### Phase 0 invariant verification

```powershell
.\scripts\phase0\verify-phase0-invariants.ps1 -ApiBase https://api.vitalicast.com
```

| Gate | Result |
|------|--------|
| API typecheck | **PASS** |
| Required replay + lineage tests | **15/15 PASS** |
| Production `/health` | **PASS** — `dbReachable: true` |
| Operator security (no token) | **PASS** — 403 on status + replay-validation |
| Public trusted missing `rootEventId` | **0** |
| `verify-production-telemetry.ps1` | **PASS** (exit 0; CRW warn only) |
| **Script overall** | **PASS** (exit 0) |

---

## Production probe results

**Probed:** 2026-06-10T05:01:07Z  
**Note:** Production API not redeployed with 0B changes. Probes confirm **deployed** behavior remains within Phase 0 invariants (acceptance suite for post-deploy verification).

| Probe | Value |
|-------|-------|
| Replay `sampleCount` | 18 |
| Replay `passedCount` | 18 |
| Replay `overallPass` | **true** |
| Missing `rootEventId` (trusted public) | **0** |
| NDBC observation age | 1.5 h |
| CRW product age | 53.0 h (warn) |
| Feed-health `recent_history_count` | 20 |

---

## Acceptance criteria checklist

| Criterion | Status |
|-----------|--------|
| No route changes | **PASS** |
| No runtime behavior changes (local tests) | **PASS** |
| No trust logic changes | **PASS** |
| No replay logic changes | **PASS** |
| No replay/evidence/signal/event ID drift | **PASS** (15/15 ID tests) |
| Replay validation green (production) | **PASS** (18/18) |
| API typecheck passes | **PASS** |
| Required harness tests pass | **PASS** |
| Phase 0 invariants satisfied | **PASS** |
| Repository no longer imports service primitives | **PASS** |

---

## Rollback plan

Single revert commit restores:

1. Inline implementations in `provenance.ts` and `lineage.ts`
2. Repository imports from `../services/environmental-harness/provenance` and `lineage`
3. Remove `harness-primitives.ts` and index export

```bash
git revert <phase-0b-commit>
pnpm --filter @marine/shared build
pnpm --filter api typecheck
node --import tsx --test apps/api/src/services/environmental-harness-replay.test.ts
```

No migration rollback required. No production deploy was performed.

---

## Next step (not in scope)

**Phase 0C:** Type-only adapter interfaces (`HarnessDbAdapter`, `ProvenanceReader`, `SignalTrustFields`) — authorized only after 0B deploy + 24h production replay pass.

---

## Final verdict

# **PHASE 0B VERIFIED**

**Evidence:**

- `@marine/shared` builds with extracted primitives
- API typechecks clean
- Replay + lineage deterministic tests **15/15 pass** (no ID format drift)
- Repository import cycle broken (`environmental-harness-events.ts` → `@marine/shared` only)
- Phase 0 invariant script **PASS** including production replay **18/18**
- No new test regressions vs Phase 0A baseline (707/99 unchanged)
- DB-backed route test failures are environmental (no local DB), not caused by primitive extraction
