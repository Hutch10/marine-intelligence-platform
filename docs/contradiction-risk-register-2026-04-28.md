# Contradiction-Handling Risk Register (2026-04-28)

## Status Legend
- Open: risk still present
- Mitigated: control implemented and tested
- Residual: reduced but not eliminated

## Register

| ID | Risk | Status | Evidence | Control | Residual Risk |
|---|---|---|---|---|---|
| CR-01 | Contradictory same-observation facts accepted silently | Mitigated | Adversarial test A | Same-observation contradiction guard + quarantine | Low |
| CR-02 | Stale-valid replay overrides fresher truth | Mitigated | Adversarial test B | Stale replay ordering guard + quarantine | Low |
| CR-03 | Concurrent duplicate inserts create duplicate truth rows | Mitigated | Adversarial test C | Partition/source/source_record unique index + deterministic conflict handling + adapter write lock | Low |
| CR-04 | Integrity-chain tamper allows append on forged branch | Mitigated | Adversarial test D | Pre-append chain audit + fail-closed + quarantine | Low |
| CR-05 | Contradiction states mapped to low-risk public output | Mitigated | Contradiction policy tests | Formal contradiction policy + fail-closed mapping to unknown | Low |
| CR-06 | Full distributed contradiction resistance formally proven across all pipelines | Open | Not fully proven | Additional multi-node temporal/fault proof campaign required | Medium |
| CR-07 | Recovery orchestration from quarantine and chain-fork events not fully automated | Residual | Manual path only | Quarantine persistence in place; automation pending | Medium |

## Contradiction Hierarchy (Formalized)
Precedence:
1. CONFLICTING_SIGNALS
2. INSUFFICIENT_DATA
3. UNKNOWN
4. LOW_RISK

Fail-closed requirement:
- Any contradiction or insufficiency at truth computation boundary must not surface as low risk in public output.
