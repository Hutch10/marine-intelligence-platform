# Byzantine Attack Findings Report (2026-04-28)

## Scope and Method
This report records adversarial falsification against Marine Intelligence truth ingestion and integrity chaining for:
- Contradictory truth injection
- Stale-valid replay attacks
- Double-insert race pressure
- Integrity-chain fork/tamper handling
- Contradiction policy formalization

Partitions exercised:
- FIELD_TRUTH
- PRESSURE_TEST
- SYNTHETIC_BENCH (through partition-scoped guard logic)

## Attack Sequence and Outcomes

### A. Contradictory Truth Injection
Attack pattern:
- Insert valid event for a specific identity and observed point.
- Insert second valid-looking event for same identity/observed point with conflicting severity/summary.

Observed outcome:
- Second write rejected (validation error, contradiction code path).
- Payload quarantined in `marine_intelligence_event_quarantine` with reason `contradictory_truth`.
- No silent acceptance observed.

### B. Stale-Valid Replay Attacks
Attack pattern:
- Insert fresher accepted truth.
- Replay stale-but-valid input (intact structure/hashable payload) for same identity key but older observation time.

Observed outcome:
- Stale replay blocked with fail-closed validation error.
- Payload quarantined with reason `stale_replay`.
- No overwrite of fresher truth observed.

### C. Double-Insert Race Conditions
Attack pattern:
- Concurrently submit duplicate logical event under race pressure.

Observed outcome:
- One event persisted.
- Remaining concurrent attempts deterministically rejected as contradiction for duplicate source record key conflict.
- Behavior is deterministic and non-silent; no duplicate persistence observed.

### D. Integrity-Chain Fork/Tamper Attacks
Attack pattern:
- Create baseline chain records.
- Tamper existing `integrity_chain_hash` to forge branch.
- Attempt additional append.

Observed outcome:
- Append blocked via pre-append chain audit gate.
- Attempt quarantined with reason `chain_fork_detected`.
- Fail-closed response returned.

## Implemented Hardening
- Added detailed chain diagnostics via `verifyChainDetailed`.
- Strengthened canonical hash normalization to exclude non-semantic/transient fields:
  - integrity hash fields (snake/camel)
  - timestamps (snake/camel)
  - auto-generated id
- Added partition-scoped unique idempotency index:
  - `(truth_partition, source, source_record_id)`
- Added explicit quarantine table and persistence path:
  - `marine_intelligence_event_quarantine`
- Added pre-append partition chain verification gate.
- Added stale replay guard (identity + partition + source + ordering).
- Added contradictory same-observation guard with deterministic rejection/quarantine.
- Added adapter-scoped write lock to avoid nested transaction race errors in concurrent local execution.

## Contradiction Policy Audit
Previous public risk mapping degraded contradiction/insufficient states toward low-risk exposure in one route path.

Hardening action:
- Formalized contradiction severity policy in service layer.
- Enforced fail-closed public mapping:
  - `conflicting_signals` -> `unknown`
  - `insufficient_data` -> `unknown`

## Proof Artifacts
- `apps/api/src/repositories/marine-events.adversarial.test.ts`
- `apps/api/src/services/contradiction-policy.test.ts`

Execution result snapshot:
- Adversarial repository suite: 4/4 passed
- Contradiction policy suite: 2/2 passed

## Final Hostile Verdict
UNPROVEN

Rationale:
- The tested attack classes above are now blocked or deterministically quarantined under the exercised code paths.
- Full contradiction resistance for all upstream/downstream routes and all distributed deployment permutations is not yet mathematically proven end-to-end.
