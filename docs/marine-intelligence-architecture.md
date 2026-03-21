# Marine Intelligence Architecture

## Project Purpose
Move the platform from a prototype into a real-data marine intelligence platform that continuously ingests, validates, and interprets ocean observations for operational decision support.

## Strategic Takeaway
- Actual build time so far: about 7 days.
- Typical industry timelines for comparable maturity are much longer.
- The strategic advantage is execution velocity, not inflated claims of maturity.
- Position current progress as a fast, credible foundation that is ready for disciplined iteration.

## Core Architecture
End-to-end system flow:

1. Source feeds
2. Ingestion
3. Normalization
4. Validation
5. Signal detection
6. Safety filtering
7. Dashboards and APIs

Reference pipeline:

source feeds -> ingestion -> normalization -> validation -> signal detection -> safety filtering -> dashboards/APIs

## Source Priority Order
1. NDBC
2. Coral Reef Watch
3. IOOS
4. Argo

## Recommended Repository Structure Under apps/api/src/
apps/api/src/
  connectors/
    ndbc/
    coral-reef-watch/
    ioos/
    argo/
  services/
    ingestion/
    validation/
    signals/
    safety/
  repositories/
    observations/
    station-metrics/
    stations/
    alerts/
    provenance/
    ingestion-runs/
    species-observations/
    regions/
  routes/
    live-conditions.ts
    reef-alerts.ts
    marine-briefing.ts
    station-health.ts
  workers/
    ingest-live-feeds.ts
    derive-signals.ts
    publish-briefings.ts

## Normalized Storage Model
Core tables/entities:

- data_sources
- stations
- station_metrics
- observations
- derived_signals
- alerts
- regions
- species_observations
- ingestion_runs
- provenance_records

## Traceability Rule
Every downstream row must be traceable to:

- source
- timestamp
- ingestion run

Practical requirement for each downstream record:

- source_id (or equivalent source reference)
- observed_at and/or ingested_at
- ingestion_run_id

No derived or published output should exist without this lineage.

## Separation of Data Types
Maintain strict separation between:

- observed data
- derived metrics
- model outputs
- narrative conclusions

Implementation guidance:

- Store observed data exactly as measured, with minimal transformation.
- Store derived metrics as deterministic transformations from observed data.
- Store model outputs as probabilistic or heuristic products with explicit confidence metadata.
- Store narrative conclusions separately as human-facing interpretation layers that reference the underlying evidence.

## Product Surfaces
- Reef Stress Watch
- Live Marine Conditions
- Regional Marine Briefing

## Strategic Positioning
The platform is a marine intelligence layer on top of existing ocean observing systems, not a replacement for those systems.

Positioning implications:

- Integrate and contextualize trusted external observations.
- Add operational signal detection and safety-aware interpretation.
- Preserve source attribution and scientific traceability across all user-facing outputs.
