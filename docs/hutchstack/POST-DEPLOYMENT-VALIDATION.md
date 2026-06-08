# Post-Deployment Validation — Marine Intelligence Platform Convergence

**Validation window (UTC):** 2026-06-08T05:03:00Z → 2026-06-08T06:35:00Z  
**Production API:** https://api.vitalicast.com  
**Production web:** https://oceansig.com  
**Method:** Evidence-only live probes, GitHub deployment metadata, and script execution. Fail-closed.

---

## Deployment timeline (observed)

| Commit | Purpose | Deployment time (UTC) | Environment |
|---|---|---|---|
| `1faa04a` | Phase 3/4 convergence merge | 2026-06-08T05:04 | Production API/web |
| `66b9092` | Build fixes (`@marine/shared` exports + TS errors) | 2026-06-08T05:17 | Production API |
| `97f429e` | Vercel libsql bundling attempt | 2026-06-08T05:23 | Production API |
| `d7d4026` | Hoisted install / tracing attempt | 2026-06-08T06:24 | Production API |
| `5964b35` | Revert to minimal vercel config | 2026-06-08T06:34 | Production API/web |

Source: `gh api repos/Hutch10/marine-intelligence-platform/deployments`.

---

## Migrations (0003, 0004, 0005)

### Expected
- `0003_environmental_harness_lineage.sql`
- `0004_environmental_review_queue.sql`
- `0005_environmental_signal_lineage.sql`

### Observed
- Migration files are now present on deployed branch (`main`).
- Production runtime cannot establish Turso adapter due missing runtime module load:
  - `Cannot find module '@libsql/client'` from `/var/task/apps/api/dist/api/src/db/async-client.js`.
- Because DB path is unavailable and Turso adapter fails, migration application cannot be verified from production behavior.

**Result:** **NOT VERIFIED / FAIL-CLOSED**.

---

## Route verification (post-deploy)

Final probe snapshot (2026-06-08T06:34 UTC):

| Route | Status | Evidence |
|---|---:|---|
| `/health` | 200 | `dbReachable: false`, `feedHealth.source: unavailable` |
| `/live-conditions` | 503 | Empty body (`conditions: []`) fail-closed withholding |
| `/reef-alerts` | 503 | Empty body (`alerts: []`) fail-closed withholding |
| `/feed-health` | 200 | `fallback_reason: db_query_failed`, counts all zero |
| `/internal/operator/status` | 200 | Route now registered and reachable |
| `/internal/operator/replay-validation` | 500 | Fails with `Cannot find module '@libsql/client'` |
| `/api/replay/signal/test` | 500 | Same module error |
| `https://oceansig.com/operator` | 404 | Operator web page not reachable |

**Result:** **Partial convergence**.
- API operator routes are now deployed.
- Core data/replay paths are blocked by runtime Turso client load failure.

---

## Lineage field validation (public API)

Required fields:
- `signalId`
- `rootEventId`
- `verificationEventId`
- `provenanceHash`
- `trustStatus`

Observed:
- `/live-conditions` returns **503** with empty array.
- `/reef-alerts` returns **503** with empty array.

Because production is withholding all records (fail-closed), there are no returned rows to inspect for lineage field presence.

**Result:** **NOT DEMONSTRABLE** (no promotable records returned).

---

## Feed-health validation

Observed from `/feed-health`:
- `source: "unavailable"`
- `fallback_reason: "db_query_failed"`
- `summary.recent_history_count: 0`
- `summary.last_completed_at: null`

Required by convergence task:
- `recent_history_count > 0` ❌
- `last_completed_at populated` ❌
- ingestion reports persist and visible ❌

**Result:** **FAIL**.

---

## Replay validation

Observed:
- `/internal/operator/replay-validation` reachable path-wise, but returns **500**.
- `/api/replay/signal/test` returns **500**.
- Both fail with:
  `Cannot find module '@libsql/client'` (Require stack includes `db/async-client.js`).

Required checks (packet generation, lineage reconstruction, trust/replay match, no trusted-without-lineage) cannot execute.

**Result:** **FAIL (blocked by runtime dependency error)**.

---

## Verification script repair

### PowerShell (`verify-production-telemetry.ps1`)
- Repaired em-dash parsing failure by replacing non-ASCII punctuation in warning text.
- Script runs on Windows PowerShell without parse errors.
- Current run exits fail for genuine production conditions (missing feed-health persistence, token not set), not parser failure.

### Bash (`verify-production-telemetry.sh`)
- Normalized em-dash punctuation to ASCII hyphen in output strings for portability.

**Result:** **PASS (script encoding compatibility repaired)**.

---

## Evidence summary

### Converged / improved
- Production now deploys latest branch commits repeatedly.
- Operator API route family is present (`/internal/operator/status` responds 200).
- Public endpoints fail closed instead of returning untrusted rows when DB unavailable.
- Verification scripts are encoding-safe on Windows.

### Still failing
- Turso runtime client loading on Vercel (`@libsql/client` module resolution).
- `dbReachable` remains false.
- `/live-conditions` and `/reef-alerts` are withheld (503).
- `/feed-health` has no persisted history visibility.
- Replay routes return 500.
- Operator web UI route still 404.

---

## Remaining risks

1. **Runtime dependency resolution risk:** API deploys successfully but fails at runtime for Turso adapter import.
2. **Operational blind spot:** feed-health persistence still unavailable from production API.
3. **Replay blind spot:** replay validation route cannot execute; trust-chain evidence cannot be reconstructed.
4. **Operator web incompleteness:** operator API exists but operator web route is absent.
5. **Promotion data gap:** no promotable live records returned, so lineage/trust fields cannot be evidenced on public payloads.

---

## PROMOTION READINESS RECOMMENDATION

### **REMAIN RESEARCH-READY LIMITED BETA**

This decision is based solely on live production evidence:
- Critical trust-chain components are deployed only partially.
- Database-backed operations remain broken at runtime (`@libsql/client` load failure).
- Replay validation and feed-health persistence requirements are not met.
- Public signals are withheld (503), preventing evidence of lineage-complete trusted promotion.

Promotion to **RESEARCH-READY WITH CONDITIONS** or **RESEARCH-READY** is not supportable until production demonstrates:
1. Stable Turso connectivity at runtime,
2. Non-empty feed-health persistence,
3. Passing replay validation,
4. Public lineage/trust fields on valid returned signals,
5. Reachable operator web console.
