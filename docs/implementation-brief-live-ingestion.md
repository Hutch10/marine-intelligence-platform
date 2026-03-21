# Implementation Brief: Live Ingestion

## Objective
Deliver a 14-day implementation sequence for live marine data ingestion, validation, signal generation, and safety-aware publication across API and dashboard surfaces.

## 14-Day Implementation Sequence

### Phase 1 (Days 1-4)
Focus:

- NDBC connector
- observations + ingestion_runs + provenance_records
- live buoy conditions on dashboard

Expected outputs:

- Connector that fetches and normalizes NDBC station observations.
- Ingestion pipeline that records run metadata and row-level provenance.
- Initial live conditions endpoint and dashboard panel fed by real buoy data.

### Phase 2 (Days 5-7)
Focus:

- Coral Reef Watch connector
- Reef Stress Watch
- SST anomaly / HotSpot / DHW integration

Expected outputs:

- Coral Reef Watch ingestion module with normalized storage.
- Reef Stress Watch surface backed by observed and derived reef stress fields.
- Rule-ready fields for SST anomaly, HotSpot, and Degree Heating Weeks.

### Phase 3 (Days 8-10)
Focus:

- basic signal rules
- rapid SST increase
- HotSpot threshold
- DHW threshold
- stale buoy feed alert

Expected outputs:

- Deterministic signal engine for threshold and trend checks.
- Alert records for reef stress and data-health events.
- Station/feed health checks including stale data detection.

### Phase 4 (Days 11-14)
Focus:

- IOOS connector
- Argo context layer
- scale path toward Postgres/TimescaleDB

Expected outputs:

- IOOS connector for additional regional observational coverage.
- Argo context ingestion for broader ocean profile context.
- Migration plan and abstraction boundaries to scale from current store to Postgres/TimescaleDB.

## Implementation Modules
Target modules under apps/api/src/:

- connectors/ndbc
- connectors/coral-reef-watch
- connectors/ioos
- connectors/argo
- services/ingestion
- services/validation
- services/signals
- services/safety
- repositories/observations
- repositories/alerts
- repositories/stations
- repositories/provenance
- repositories/ingestion-runs
- routes/marine-briefing
- routes/reef-alerts
- routes/live-conditions
- routes/station-health

## Validation Rules
Apply these checks during ingestion and normalization:

- missing values
- stale timestamps
- impossible values
- duplicate rows
- coordinate mismatch
- source schema drift

## Record Statuses
Each processed record should be labeled with one of:

- accepted
- accepted_with_flags
- rejected

Status guidance:

- accepted: no material quality issues.
- accepted_with_flags: usable but includes one or more non-blocking quality warnings.
- rejected: fails mandatory validation and is excluded from downstream analytics.

## Signal Classes
Implement three signal classes:

- threshold alerts
- trend signals
- contextual signals

Class intent:

- Threshold alerts trigger on hard bounds.
- Trend signals trigger on rate-of-change or directional shifts.
- Contextual signals combine multiple observations to produce interpretable operational context.

## Safety and Disclosure Rules
Required safeguards:

- generalize sensitive locations
- suppress protected-species precision
- classify outputs as observed / derived / inferred

Implementation guidance:

- Apply location precision controls before returning public-facing responses.
- Enforce species-sensitivity policies at query and serialization layers.
- Include explicit output classification metadata in every route payload.

## Next Recommended Coding Sequence
1. Implement connectors/ndbc and wire services/ingestion to persist observations, ingestion_runs, and provenance_records.
2. Add routes/live-conditions backed by repository queries and expose the first real-time dashboard path.
3. Implement connectors/coral-reef-watch and derive SST anomaly, HotSpot, and DHW fields in services/signals.
4. Add threshold and trend rule execution for rapid SST increase, HotSpot threshold, DHW threshold, and stale feed checks.
5. Stand up routes/reef-alerts, routes/station-health, and routes/marine-briefing with output-classification metadata.
6. Integrate IOOS and Argo connectors, then finalize the storage abstraction and migration path toward Postgres/TimescaleDB.

## Operations Runbook

For deployment configuration and staging verification steps for unified live ingestion, see:

- `docs/live-ingestion-operations.md`
