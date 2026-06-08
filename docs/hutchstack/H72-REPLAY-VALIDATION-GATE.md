# H+72 Replay Validation Gate

Production promotion at **H+72** (72-hour burn-in) requires all harness checks to pass, including replay validation. This gate extends the existing telemetry verification scripts.

## Required Checks (H+72)

| Check | Script section | Hard fail |
|-------|----------------|-----------|
| Feed freshness (NDBC ≤6h) | `/live-conditions` | Yes |
| CRW product age (fail >72h, warn >48h) | `/reef-alerts` | Yes (>72h) |
| Persisted ingestion reports | `/feed-health` `recent_history_count > 0` | Yes |
| Scheduler execution age (≤3h) | `/feed-health` `last_completed_at` | Yes |
| Mock contamination | `/live-conditions` sources | Yes |
| Provenance fields | `/reef-alerts` harness fields | Warn |
| **Replay validation** | `/internal/operator/replay-validation` | **Yes** |
| **Public lineage enforcement** | `/live-conditions` + `/reef-alerts` trusted rows | **Yes** |
| Published alert lineage | Replay job per-alert samples | **Yes** |

## Running Verification

### Bash

```bash
export OPERATOR_ACCESS_TOKEN="<token>"
./scripts/telemetry-activation/verify-production-telemetry.sh https://api.vitalicast.com
```

### PowerShell

```powershell
$env:OPERATOR_ACCESS_TOKEN = "<token>"
./scripts/telemetry-activation/verify-production-telemetry.ps1 -ApiBase https://api.vitalicast.com
```

## Replay Validation Job

The job samples recent harness `signal_id` and `alert_id` targets, invokes the Phase 2 replay engine, and validates:

1. Lineage chain exists
2. `rootEventId` is present
3. Replay packet generates (`status: available`)
4. `evidenceStatus` is `complete` or explicitly `partial` (not falsely marked complete)
5. No synthesized evidence (complete status without persisted `sourceInputs`)
6. `packetId` is deterministic (repeat generation matches)
7. Publication decision is reconstructable when a publication node exists in lineage

Phase 4 additionally validates public API samples from `/live-conditions` and `/reef-alerts`:

- Trusted rows must include `signalId` and `rootEventId`
- Replay packet must match persisted trust metadata
- Any trusted row without lineage fails the gate

### Public lineage script check

```
public trusted signals missing rootEventId: 0
```

If any returned condition or alert has `trustedForPromotion: true` or `trustStatus: "trusted"` without `rootEventId`, the script fails:

```
FAIL: Public API returned trusted environmental signals without rootEventId lineage
```

### Pass Criteria

- `sampleCount > 0` (harness events exist post-migration)
- `overallPass === true` (all samples pass)
- No published alert in samples fails lineage reconstruction

### Fail Examples

```
FAIL: OPERATOR_ACCESS_TOKEN not set — cannot verify replay validation gate
FAIL: No replay validation samples available (deploy harness + Turso migration 0003+)
FAIL: Replay validation burn-in failed — incomplete or unreplayable production evidence
```

### Pass Example

```
replay-validation sampleCount: 6
replay-validation overallPass: true
PASS — production telemetry within thresholds.
```

## API Response Shape

```json
{
  "generatedAt": "2026-06-03T12:00:00.000Z",
  "sampleCount": 6,
  "passedCount": 6,
  "failedCount": 0,
  "overallPass": true,
  "samples": [
    {
      "target": { "kind": "alert", "id": "alert-noaa_ndbc-source_stale-..." },
      "passed": true,
      "failures": [],
      "evidenceStatus": "complete",
      "withheldSections": [],
      "packetId": "RP-deadbeefcafebabe",
      "rootEventId": "EHE-ingestion-...",
      "publicationReconstructable": true
    }
  ]
}
```

## Prerequisites

1. Deploy API with Phase 1–3 harness code
2. Apply Turso migrations `0002`, `0003`, `0004`, `0005`
3. Set `OPERATOR_ACCESS_TOKEN` in API and CI verification environment
4. Allow 72h of live ingestion for harness event accumulation

## Remaining Risks

- Pre-migration events lack lineage columns → samples may be partial until new ingestions occur
- Empty harness table fails the gate (`sampleCount: 0`) — intentional fail-closed behavior
- Legacy observations/reef rows without lineage remain untrusted until re-ingested (no backfill)
- Review queue actions require Turso migration `0004`
- Signal lineage columns require Turso migration `0005`
