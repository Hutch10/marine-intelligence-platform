# Phase 1 Readiness Review — HutchStack Core Extraction

**Review (UTC):** 2026-06-10T08:31:16Z  
**Production commit (deployed):** `e3d15e574e5f9d92dc49ce19e93701df56c19c61` (Phase 0B)  
**Git HEAD (local):** `55fd4e4` + **uncommitted Phase 0C changes**  
**Burn-in:** H+72 active — T0 `2026-06-09T03:41:35Z`, H+72 end `2026-06-12T03:41:35Z`, **~28.8 h elapsed**

---

## Executive summary

| Dimension | Assessment |
|-----------|------------|
| **Phase 1 readiness score** | **71 / 100** |
| **Technical contract readiness** | **HIGH** — harness modules are pure types, colocated in `@marine/shared` |
| **Production stability** | **STABLE** — replay 18/18, lineage 0 missing, verify exit 0 |
| **Git/production alignment** | **DRIFT** — Phase 0C complete locally but **not committed or deployed** |
| **Burn-in status** | **IN PROGRESS** — H+72 not complete; checkpoint log incomplete |
| **Phase 1 risk (contracts-only)** | **LOW–MEDIUM** — import-path churn; mitigated by re-export shims |
| **Final verdict** | **START AFTER H+72 COMPLETION** |

---

## 1. Current architecture assessment

### Shared harness module inventory (`packages/shared/src/`)

| Module | Lines (approx.) | Role | HutchStack Core candidate |
|--------|-----------------|------|---------------------------|
| `harness.ts` | ~136 | Event kinds, outcomes, audit payloads, provenance | **Contracts + audit events** |
| `harness-replay.ts` | ~102 | Replay/evidence packet schemas, lineage nodes | **Replay contracts** |
| `harness-trust-types.ts` | ~56 | Trust/lineage reference interfaces (Phase 0C) | **Trust contracts** |
| `harness-primitives.ts` | ~94 | Deterministic ID/hash functions (Phase 0B) | **Contracts utilities** |
| `harness-operator.ts` | ~120 | Operator console, replay validation job types | **Operator contracts** |
| `types.ts` | ~3,900 | Marine domain + public API types | **Marine adapter** (not Phase 1) |
| `trust-authority.ts` | — | Marine truth partitions | **NOT READY** (marine-specific) |
| `operational-analytics.ts` | — | Privacy analytics | Out of Phase 1 scope |

**Observation:** HutchStack contract surface is already modular within `@marine/shared`, but it is **not** isolated in a dedicated package. Phase 1 is primarily a **package boundary** move with backward-compatible re-exports.

### Remaining contract duplication

| Duplication | Locations | Severity |
|-------------|-----------|----------|
| `PublicationHarnessEvent` vs `PublicationEvent` | `harness.ts` vs `harness-replay.ts` | **Medium** — audit writer uses前者; replay collector uses latter; fields differ (`alertKey` vs absent) |
| `EnvironmentalHarnessEventRecord` vs `HarnessEventRecord` | `harness.ts` vs `environmental-harness-events.ts` | **Medium** — shared type lacks lineage columns (`parentEventId`, `rootEventId`, `signalId`, `alertId`, `eventType`) |
| `EnvironmentalSignalLineage` vs `ReplayLineageReference` | `harness.ts` vs `harness-trust-types.ts` | **Low** — required vs optional field shapes; consolidation candidate |
| `HarnessLineageEventType` mapping | `harness-primitives.ts` `lineageEventTypeFromKind` | **None** — single implementation post-0B |
| Marine types mixed with harness | `types.ts` imports `harness-trust-types` | **Low** — acceptable until marine adapter split |

### Remaining event duplication

| Area | Status |
|------|--------|
| Audit event payloads (`IngestionEvent`, `VerificationEvent`, `AlertValidationEvent`, `HumanReviewEvent`, `PublicationHarnessEvent`) | **Single source** in `harness.ts` — **READY** to extract |
| Persisted event record shape | **Duplicated** — repository `HarnessEventRecord` extends beyond `EnvironmentalHarnessEventRecord` |
| Event kind / outcome enums | **Single source** — **READY** |

### Remaining replay schema duplication

| Area | Status |
|------|--------|
| `EnvironmentalReplayPacket` / `EnvironmentalEvidencePacket` | **Single source** in `harness-replay.ts` — **READY** |
| Withheld section pattern (`ReplayWithheldSection`) | **Single source** — **READY** |
| Replay validation result types | In `harness-operator.ts` — extends `harness-trust-types` post-0C — **READY** |
| API replay route response wrapper | Runtime in `routes/replay.ts` — **out of Phase 1 scope** |

### Remaining trust schema duplication

| Area | Status |
|------|--------|
| `TrustMetadata` / `PublicTrustMetadata` | **Unified** post-0C (local) — **READY** |
| `SignalTrustFields` / `HarnessPresentationInput` | **Unified** post-0C (local) — **READY** |
| Public row trust fields | `LiveMarineCondition` / `ReefStressWatchItem` extend shared interfaces post-0C — **READY** |
| Trust gate runtime | `presentation-gate.ts` — **NOT Phase 1** (runtime) |

---

## 2. Extraction candidate classification

| Candidate | Readiness | Rationale |
|-----------|-----------|-----------|
| **Core contracts** (`HarnessEventKind`, `HarnessOutcome`, freshness, provenance) | **READY** | Pure types; zero runtime; single file |
| **Audit event contracts** (`IngestionEvent`, `VerificationEvent`, `AlertValidationEvent`, `HumanReviewEvent`, `PublicationHarnessEvent`) | **READY** | Pure types; consumed by audit + replay |
| **Replay packet contracts** (`EnvironmentalReplayPacket`, `EnvironmentalEvidencePacket`, withheld sections) | **READY** | Pure types; validated by 15/15 replay tests |
| **Trust contracts** (`harness-trust-types.ts`) | **READY** | Phase 0C complete locally; type-only |
| **ID primitives** (`harness-primitives.ts`) | **READY** | Deployed in production (0B); deterministic tests pass |
| **Operator contracts** (`harness-operator.ts`) | **PARTIALLY READY** | Pure types but marine operator panel shapes; extract with contracts package |
| **Unified event record contract** | **PARTIALLY READY** | Need merged `HarnessEventRecord` aligned with DB schema before events package (Phase 2) |
| **Publication event unification** | **PARTIALLY READY** | `PublicationHarnessEvent` / `PublicationEvent` merge requires careful audit/replay alignment |
| **`@hutchstack/contracts` package wiring** | **PARTIALLY READY** | Monorepo workspace + `@marine/shared` re-exports not yet established |
| **Runtime event store** | **NOT READY** | Phase 2+ |
| **Runtime replay engine** | **NOT READY** | Phase 2+ |
| **Runtime trust engine** | **NOT READY** | Phase 3+ |
| **`trust-authority.ts`** | **NOT READY** | Marine truth partitions |

---

## 3. Production risk assessment

**Probed:** `2026-06-10T08:31:16Z`

| Dimension | Status | Evidence |
|-----------|--------|----------|
| Replay validation | **GREEN** | 18/18, `overallPass: true` |
| Trust lineage | **GREEN** | 0 trusted rows missing `rootEventId` |
| Feed-health | **GREEN** | `recent_history_count: 20`, `dbReachable: true` |
| Verify script | **GREEN** | exit 0 (CRW warn only) |
| Scheduler (last 20 runs) | **GREEN** | 20/20 success |
| Scheduler (T0 rolling 200) | **YELLOW** | 92.4% documented at T0; promotion gate ≥95% |
| Burn-in elapsed | **YELLOW** | 28.8 h / 72 h |
| Git/production alignment | **RED** | Phase 0C uncommitted; production on 0B only |

### Burn-in impact (Phase 1 contracts-only)

| Risk | Level | Mitigation |
|------|-------|------------|
| Import-path churn breaks API build | Medium | `@marine/shared` re-exports all moved symbols |
| Accidental runtime change bundled | Low | Phase 1 scope gate: types only |
| Deploy during burn-in confuses acceptance | Medium | **No production deploy** until H+72 checkpoint pass |
| Checkpoint evidence invalidated | Low | Contracts move does not change runtime if re-exports preserved |

### Replay risk

| Risk | Level | Notes |
|------|-------|-------|
| Packet schema drift | **Low** if types moved verbatim | 15/15 replay+lineage tests |
| ID primitive regression | **None in Phase 1** | Primitives already in shared (0B deployed) |

### Trust risk

| Risk | Level | Notes |
|------|-------|-------|
| Trust gate behavior change | **None in Phase 1** | No `presentation-gate.ts` changes |
| Public API field drift | **Low** | Re-export `LiveMarineCondition` fields via shared |

### Operator risk

| Risk | Level | Notes |
|------|-------|-------|
| Operator JSON schema change | **Low** | Move `harness-operator.ts` types with identical fields |
| Route/auth change | **None** | Routes out of scope |

---

## 4. Phase 1 design

**Principle:** Create `@hutchstack/contracts` as a pure-types package. `@marine/shared` re-exports for backward compatibility. **No runtime extraction.**

### Phase 1A — Core contracts package bootstrap

| | |
|--|--|
| **Scope** | Create `packages/hutchstack-contracts/`; move `harness.ts` core enums and audit payloads |
| **Files create** | `packages/hutchstack-contracts/package.json`, `tsconfig.json`, `src/index.ts`, `src/events.ts`, `src/audit.ts`, `src/freshness.ts` |
| **Files modify** | `packages/shared/src/harness.ts` → re-export shim; `pnpm-workspace.yaml` (if needed); root `package.json` workspaces |
| **Dependencies** | None (zero runtime) |
| **Validation** | `pnpm --filter @hutchstack/contracts build`; `pnpm --filter @marine/shared build`; `pnpm --filter api typecheck`; replay+lineage tests |
| **Rollback** | Delete package; restore `harness.ts` inline types |

### Phase 1B — Replay and evidence contracts

| | |
|--|--|
| **Scope** | Move `harness-replay.ts` to `@hutchstack/contracts`; consolidate `PublicationEvent` / `PublicationHarnessEvent` documentation (types only, no merge yet if risky) |
| **Files create** | `src/replay.ts`, `src/evidence.ts` |
| **Files modify** | `packages/shared/src/harness-replay.ts` → re-export shim; `apps/api` imports unchanged via `@marine/shared` |
| **Dependencies** | `@hutchstack/contracts` 1A |
| **Validation** | `environmental-harness-replay.test.ts` 15/15; production replay probe if deployed |
| **Rollback** | Revert 1B commit; shims restore paths |

### Phase 1C — Trust, primitives, operator contracts

| | |
|--|--|
| **Scope** | Move `harness-trust-types.ts`, `harness-primitives.ts`, `harness-operator.ts` into `@hutchstack/contracts` (or subpath exports); `@marine/shared` re-exports |
| **Files create** | `src/trust.ts`, `src/primitives.ts`, `src/operator.ts` |
| **Files modify** | Shared shims; `packages/shared/src/index.ts` |
| **Dependencies** | 1A, 1B |
| **Validation** | Full `verify-phase0-invariants.ps1`; operator-status tests; trust harness tests |
| **Rollback** | Single revert per phase |

### Phase 1 invariant (all sub-phases)

```
∀ phase: no changes to presentation-gate.ts function bodies
∀ phase: no changes to replay.ts function bodies
∀ phase: no route path changes
∀ phase: @marine/shared exports all symbols previously exported
```

---

## 5. Launch gate — evidence required before Phase 1 begins

| # | Gate | Status at review | Required |
|---|------|------------------|----------|
| 1 | Phase 0C committed to `main` | **NOT MET** — uncommitted local changes | Yes |
| 2 | Phase 0C production validation (if 0C deployed) | **NOT MET** — production on 0B only | Yes (or defer 0C deploy until after H+72) |
| 3 | H+72 burn-in complete | **NOT MET** — 28.8 h / 72 h | Yes |
| 4 | Replay `overallPass: true` at H+72 | **MET** (trend); formal H+72 checkpoint pending | Yes at H+72 |
| 5 | Scheduler ≥95% at H+72 measurement | **LIKELY** — 20/20 recent; T0 window 92.4% | Yes at H+72 |
| 6 | Trust chain stable (0 missing lineage) | **MET** | Yes |
| 7 | `verify-production-telemetry` exit 0 | **MET** | Yes |
| 8 | Production commit matches git `main` | **MET** for 0B; **DRIFT** for 0C | Yes |
| 9 | H+48/H+72 checkpoints recorded in H72 report | **PARTIAL** — gaps in §5 checkpoint log | Yes before promotion; recommended before Phase 1 merge |

### Minimum gate to **begin Phase 1 branch work**

- Phase 0C git reconciliation complete
- `verify-phase0-invariants.ps1` exit 0
- Burn-in not in active incident state

### Minimum gate to **merge/deploy Phase 1**

- H+72 complete with formal checkpoint evidence
- Scheduler ≥95% at H+72 window
- Replay 18/18 (or current sample count) at H+72
- Phase 1A–C validation green

---

## 6. Timing evaluation

### Option A — Start Phase 1 now

| Dimension | Assessment |
|-----------|------------|
| Trust risk | Medium — 0C not on production; starting package split adds concurrent churn |
| Verification risk | Medium — acceptance suite is mid-burn-in |
| Burn-in risk | **High** — H+72 incomplete; checkpoint log behind |
| Extraction benefit | Low immediate — contracts already modular in shared |

**Verdict:** **Not recommended**

### Option B — Start after H+72 completion

| Dimension | Assessment |
|-----------|------------|
| Trust risk | **Low** — burn-in acceptance complete |
| Verification risk | **Low** — full 72h evidence |
| Burn-in risk | **Low** — no concurrent gate ambiguity |
| Extraction benefit | **High** — clean baseline for `@hutchstack/contracts` |

**Verdict:** **Recommended**

### Option C — Start after Research-Ready certification

| Dimension | Assessment |
|-----------|------------|
| Trust risk | **Lowest** |
| Verification risk | **Lowest** |
| Burn-in risk | **None** |
| Extraction benefit | **Delayed 1–2 weeks** — unnecessary for contracts-only move |

**Verdict:** Overly conservative unless H+72 fails promotion gates

---

## 7. Readiness score breakdown

| Component | Score | Weight | Notes |
|-----------|-------|--------|-------|
| Contract modularity | 90 | 25% | Files exist; package boundary missing |
| Production stability | 92 | 25% | Replay/lineage green |
| Git/production alignment | 45 | 20% | 0C drift |
| Burn-in completion | 40 | 20% | 40% elapsed; gates open |
| Duplication resolution | 75 | 10% | Publication + event record gaps |
| **Weighted total** | **71** | | |

---

## 8. Blocking conditions

| Blocker | Clears |
|---------|--------|
| Phase 0C uncommitted | Commit + push Phase 0C |
| Phase 0C not deployed (optional) | Deploy after 0C commit or accept 0C in Phase 1C bundle |
| H+72 incomplete | `2026-06-12T03:41:35Z` |
| Checkpoint log incomplete | Execute H+48/H+72 audits; update H72 §5 |
| Scheduler promotion gate unproven at H+72 | Measure rolling window at final checkpoint |

---

## 9. Recommended timeline

| Date (UTC) | Action |
|------------|--------|
| **Immediate** | Git-reconcile Phase 0C (commit, push; deploy optional before H+72) |
| **2026-06-11T03:41:35Z** | H+48 checkpoint — record in H72 report |
| **2026-06-12T03:41:35Z** | H+72 final checkpoint |
| **2026-06-12T06:00:00Z** | **Begin Phase 1A** (if H+72 gates pass) |
| **+3–5 days** | Phase 1A → 1B → 1C on branch; merge after validation |
| **Post Phase 1** | Phase 2 runtime extraction (events, replay) — separate program gate |

---

## Final verdict

# **START AFTER H+72 COMPLETION**

**Not** START PHASE 1 NOW — burn-in incomplete, Phase 0C not git-aligned, concurrent extraction churn during acceptance window.

**Not** START AFTER RESEARCH-READY CERTIFICATION — unnecessarily delays a contracts-only package move if H+72 passes.

**Begin Phase 1A at `2026-06-12T06:00:00Z`** (or first business window after H+72 formal checkpoint), contingent on:

1. Phase 0C git reconciliation complete
2. H+72 checkpoint PASS recorded in `H72-REPLAY-AWARE-BURN-IN-REPORT.md`
3. Replay `overallPass: true` at H+72
4. Scheduler ≥95% at H+72 measurement window
5. `verify-phase0-invariants.ps1` exit 0

Phase 1 branch preparation (read-only planning, package scaffold RFC) may begin after Phase 0C reconciliation without production deploy.

---

## Evidence sources

| Source | Timestamp (UTC) |
|--------|-----------------|
| Live production probes | `2026-06-10T08:31:16Z` |
| `verify-production-telemetry.ps1` | `2026-06-10T08:31:xxZ` (exit 0) |
| `gh run list --limit 20` | 20/20 success |
| Git `main` @ `55fd4e4` + uncommitted 0C | `2026-06-10T08:31:xxZ` |
| PHASE-0B-PRODUCTION-VALIDATION.md | Phase 0B deployed |
| PHASE-0C-TYPE-EXTRACTION.md | Local 0C complete, not committed |
| H72-REPLAY-AWARE-BURN-IN-REPORT.md | T0 `2026-06-09T03:41:35Z` |
