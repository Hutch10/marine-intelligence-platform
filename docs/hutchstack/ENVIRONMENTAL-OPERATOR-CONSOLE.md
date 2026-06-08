# Environmental Operator Console (HutchStack Phase 3)

The operator console is an internal validation surface that proves live production environmental signals are replayable and safe to promote. It is **not** shown on public routes.

## Access

All operator console API routes require `OPERATOR_ACCESS_TOKEN`:

| Route | Method | Purpose |
|-------|--------|---------|
| `/internal/operator/status` | GET | Full console snapshot (feed health + harness) |
| `/internal/operator/replay-validation` | GET | Run replay validation job (read-only) |
| `/internal/operator/replay-validation/run` | POST | Run replay validation job |
| `/internal/operator/review-queue` | GET | List review queue items |
| `/internal/operator/review-queue/enqueue` | POST | Enqueue signal/alert for human review |
| `/internal/operator/review-queue/action` | POST | Apply approve/reject/escalate/annotate |

Pass the token as a query parameter: `?token=<OPERATOR_ACCESS_TOKEN>`.

Web UI: `/operator` (Next.js server fetches status using `MARINE_API_BASE_URL` + token).

## Console Sections

The `harness` section on `/internal/operator/status` includes:

- **latestIngestionRuns** — recent harness ingestion audit events
- **verificationStatus** — latest verification outcome and 7-day count
- **scheduler** — env-driven ingestion intervals (on parent response)
- **source freshness** — via `feed_health` + `freshness_governance`
- **active alerts** / **suppressed alerts** — operational alerts vs harness-gated rejections
- **replayCompleteness** — per signal/alert `evidenceStatus`, `withheldSections`, `packetId`
- **replayValidation** — burn-in job result (`overallPass`, per-sample failures)
- **publicationDecisions** — recent publication harness events
- **humanReviewActions** — recent human review audit trail
- **reviewQueue** — pending human review items

## Fail-Closed Rules

| Surface | Partial evidence | Unreplayable promoted alert |
|---------|------------------|----------------------------|
| Operator console | Shown as `partial` with `withheldSections` | Shown in suppressed alerts / failed validation |
| Public `/live-conditions`, `/reef-alerts` | Not marked `trustedForPromotion` | Withheld when `requireReplayLineage` and no `rootEventId` |

The operator console may display partial replay packets. Public surfaces never mark unreplayable items as trusted.

## Review Queue Actions

Each action emits a lineage-linked `human_review` harness event:

| Action | Queue status | Harness outcome |
|--------|--------------|-----------------|
| approve | approved | pass |
| reject | rejected | rejected |
| escalate | escalated | warn |
| annotate | annotated | pass |

Example action request:

```json
POST /internal/operator/review-queue/action?token=...
{
  "queueItemId": "ERQ-abc123",
  "action": "approve",
  "actor": "operator@example.com",
  "annotation": "Verified against NOAA source"
}
```

## Example Console Excerpt

```json
{
  "access": "operator",
  "harness": {
    "replayValidation": {
      "overallPass": true,
      "sampleCount": 4,
      "passedCount": 4,
      "failedCount": 0,
      "samples": [
        {
          "target": { "kind": "signal", "id": "SIG-a1b2c3d4e5f67890" },
          "passed": true,
          "evidenceStatus": "partial",
          "withheldSections": ["reviewActions"],
          "rootEventId": "EHE-ingestion-source-noaa_ndbc-..."
        }
      ]
    },
    "reviewQueue": { "pendingCount": 2, "items": [] }
  }
}
```

## Related Docs

- [Environmental Replay Engine](./ENVIRONMENTAL-REPLAY-ENGINE.md)
- [H+72 Replay Validation Gate](./H72-REPLAY-VALIDATION-GATE.md)
