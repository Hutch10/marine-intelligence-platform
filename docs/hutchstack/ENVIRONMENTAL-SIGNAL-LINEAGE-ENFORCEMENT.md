# Environmental Signal Lineage Enforcement (HutchStack Phase 4)

Phase 4 closes the gap between replay-capable harness events and public environmental signals. Every newly ingested public signal carries persisted lineage identity; production APIs refuse to mark lineage-missing records as trusted.

## Persisted Lineage Fields

Each public environmental signal row stores:

| Field | Description |
|-------|-------------|
| `signalId` | Deterministic harness signal identifier (`SIG-…`) |
| `rootEventId` | Ingestion root harness event (`EHE-ingestion-…`) |
| `sourceIngestionEventId` | Same as root for signal-scoped ingestion chains |
| `verificationEventId` | Child verification harness event |
| `provenanceHash` | Stable SHA-256 over canonical source content |

### Tables (migration `0005_environmental_signal_lineage.sql`)

- `observations` — NDBC live conditions (`signal_id`, `root_event_id`, …)
- `derived_signals` — CRW reef alert rows (`harness_signal_id`, `root_event_id`, …)
- `station_metrics` — CRW metric rows (same lineage columns)

Legacy rows without lineage remain in the database but are **not backfilled**. They surface as `trustStatus: "unverified_lineage"` and are withheld from production public APIs.

## Ingestion Wiring

During NDBC and CRW ingestion:

1. `persistSignalIngestionLineage()` creates an ingestion root event
2. A verification child event is chained under the root
3. Deterministic `signalId` and `provenanceHash` are computed from stable source inputs
4. Lineage fields are written onto the observation / derived_signal / station_metric row

Services:

- `apps/api/src/services/environmental-harness/signal-lineage.ts`
- `apps/api/src/services/ingestion/run-ndbc.ts`
- `apps/api/src/services/ingestion/run-crw.ts`

## Public API Enforcement

`/live-conditions` and `/reef-alerts` use `filterTrustedLiveConditions` / `filterTrustedReefAlerts` from `lineage-presentation.ts`.

Production behavior (`NODE_ENV=production` or `VERCEL`):

- `requireReplayLineage` is enabled by default
- Signals without `rootEventId` are filtered out (503 if all rows fail)
- Returned trusted rows include `trustStatus`, `trustedForPromotion`, `evidenceStatus`, `replayCompleteness`

Example trusted live condition:

```json
{
  "stationId": "46042",
  "timestamp": "2026-06-03T12:00:00.000Z",
  "source": "noaa_ndbc",
  "signalId": "SIG-a1b2c3d4e5f67890",
  "rootEventId": "EHE-ingestion-abc123",
  "sourceIngestionEventId": "EHE-ingestion-abc123",
  "verificationEventId": "EHE-verification-def456",
  "provenanceHash": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
  "trustStatus": "trusted",
  "trustedForPromotion": true,
  "evidenceStatus": "complete",
  "replayCompleteness": "reconstructable"
}
```

Example legacy row (non-production may still return for debugging):

```json
{
  "stationId": "46042",
  "trustStatus": "unverified_lineage",
  "trustedForPromotion": false,
  "rootEventId": null
}
```

## Replay Validation Expansion

`runReplayValidationJob()` now also samples public signals from `/live-conditions` and `/reef-alerts` (via repository reads in the operator route).

For each public sample it asserts:

- `signalId` exists
- `rootEventId` exists (required for trusted rows)
- Replay packet generates and matches trust metadata
- Trusted rows fail closed when lineage or replay is incomplete

## H+72 Gate

The verification scripts additionally fail when any **trusted** public signal lacks `rootEventId`. See [H72-REPLAY-VALIDATION-GATE.md](./H72-REPLAY-VALIDATION-GATE.md).

## Rules

- No synthetic or backfilled lineage for legacy rows
- No weakening of freshness, provenance, alert gate, or replay rules
- Public trust decisions must be reproducible from persisted harness events
