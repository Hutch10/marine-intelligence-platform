# Implementation Brief: Live Ingestion

## Objective

This brief translates the current repository state into a concrete implementation and hardening plan for the live-ingestion path. It is not written as if the platform were still pre-ingestion. The repo already has working connectors, ingestion services, repository persistence, worker orchestration, and route surfaces for the core marine-observation flow.

The purpose of this brief is to make the current implementation legible, enumerate the moving parts precisely, and define the next coding sequence required to make the live path operationally dependable and reviewable.

## Current Implementation Baseline

The following live-ingestion components already exist in code:

- Source connectors for NDBC, Coral Reef Watch, and IOOS.
- Source-specific ingestion runners for each of those connectors.
- Persistence for `ingestion_runs`, `observations`, `station_metrics`, `derived_signals`, and `provenance_records`.
- Worker orchestration in `workers/ingest-live-feeds.ts`.
- Worker-level operational reporting in `live_ingestion_worker_runs` and `live_ingestion_reports`.
- Product-facing routes for `/live-conditions`, `/reef-alerts`, and `/feed-health`.
- Deterministic threshold alerting for NDBC via `services/ingestion/ndbc-alert-evaluator.ts`.
- A broader marine workflow stack for threshold, trend, and contextual event detection.

The work that remains is primarily about consolidation, disclosure, and operational hardening.

## Module Inventory

The live-ingestion implementation touches more modules than the original draft implied. The current inventory is:

### Connectors

- `apps/api/src/connectors/ndbc/fetch.ts`
- `apps/api/src/connectors/ndbc/parse.ts`
- `apps/api/src/connectors/ndbc/map.ts`
- `apps/api/src/connectors/coral-reef-watch/fetch.ts`
- `apps/api/src/connectors/coral-reef-watch/parse.ts`
- `apps/api/src/connectors/coral-reef-watch/map.ts`
- `apps/api/src/connectors/ioos/fetch.ts`
- `apps/api/src/connectors/ioos/parse.ts`
- `apps/api/src/connectors/ioos/map.ts`

### Ingestion Services

- `apps/api/src/services/ingestion/run-ndbc.ts`
- `apps/api/src/services/ingestion/run-crw.ts`
- `apps/api/src/services/ingestion/run-ioos.ts`
- `apps/api/src/services/ingestion/ndbc-alert-evaluator.ts`

### Persistence and Read Models

- `apps/api/src/repositories/ingestion-runs.ts`
- `apps/api/src/repositories/observations.ts`
- `apps/api/src/repositories/provenance.ts`
- `apps/api/src/repositories/station-metrics.ts`
- `apps/api/src/repositories/reef-stress.ts`
- `apps/api/src/repositories/live-ingestion-reports.ts`
- `apps/api/src/repositories/operational-alerts.ts`
- `apps/api/src/repositories/regions.ts`
- `apps/api/src/repositories/signals.ts`
- `apps/api/src/repositories/species.ts`
- `apps/api/src/repositories/stations.ts`
- `apps/api/src/repositories/marine-events.ts`
- `apps/api/src/repositories/marine-intelligence-alerts.ts`
- `apps/api/src/repositories/marine-investigations.ts`

### Route Modules

- `apps/api/src/routes/live-conditions.ts`
- `apps/api/src/routes/reef-alerts.ts`
- `apps/api/src/routes/feed-health.ts`
- `apps/api/src/routes/operational-alerts.ts`
- `apps/api/src/routes/marine-intelligence.ts`
- `apps/api/src/routes/regions.ts`
- `apps/api/src/routes/signals.ts`
- `apps/api/src/routes/species.ts`
- `apps/api/src/routes/stations.ts`
- `apps/api/src/routes/dashboard.ts`

### Workflow and Signal Services Adjacent to Live Ingestion

- `apps/api/src/services/operational-alerts.ts`
- `apps/api/src/services/marine-event-detection.ts`
- `apps/api/src/services/marine-intelligence-events.ts`
- `apps/api/src/services/marine-intelligence-workflow.ts`
- `apps/api/src/services/marine-investigation-workflow.ts`

### Workers

- `apps/api/src/workers/ingest-live-feeds.ts`
- `apps/api/src/workers/ingest-dataset.ts`
- `apps/api/src/workers/compute-anomalies.ts`
- `apps/api/src/workers/generate-report.ts`

### Schema and Shared Contracts

- `apps/api/src/db/schema.ts`
- `apps/api/src/db/client.ts`
- `apps/api/src/marine-intelligence-types.ts`
- `apps/api/src/types.ts`
- `packages/shared/src/types.ts`

### Frontend Surfaces Consuming the Live Path

- `apps/web/app/page.tsx`
- `apps/web/app/ocean-map/page.tsx`
- `apps/web/app/ocean-stations/page.tsx`
- `apps/web/components/ocean-map/*`
- `apps/web/components/ocean-stations/*`
- `apps/web/lib/api/client.ts`
- `apps/web/lib/api/mock-data.ts`

## Validation Rules

The current codebase already implements six distinct validation rules across the source ingestion services. These should remain the canonical validation set for the live path.

### 1. Missing or unusable required fields

- Definition: the record cannot be interpreted safely because required fields are absent, null, or structurally unusable.
- Current implementation:
  - CRW treats missing `observedAt`, `sstAnomalyC`, `hotSpotC`, or `dhw` as `schema_drift`.
  - IOOS treats missing `stationId`, missing `observedAt`, or a row with no usable measurement fields as `schema_drift`.
- Example: an IOOS record with a station ID but no timestamp and no measurable field values.

### 2. Stale timestamps

- Definition: `observed_at` is older than the freshness window configured for the source.
- Current implementation:
  - NDBC default stale threshold: 6 hours.
  - CRW default stale threshold: 24 hours.
  - IOOS default stale threshold: 24 hours.
- Example: an NDBC latest observation older than six hours is rejected as `timestamp_stale`.

### 3. Impossible values

- Definition: one or more numeric values fall outside the physically plausible range the source runner allows.
- Current implementation:
  - NDBC rejects SST below `-5` or above `45`, wave height below `0` or above `30`, wind speed below `0` or above `120`, pressure below `800` or above `1100`.
  - CRW rejects SST anomaly outside `-8` to `10`, HotSpot outside `0` to `20`, and DHW outside `0` to `40`.
  - IOOS rejects impossible SST, wave, wind, pressure, salinity, dissolved oxygen, and chlorophyll values using explicit numeric bounds.
- Example: a Coral Reef Watch DHW of `55` would be rejected as `impossible_values`.

### 4. Duplicate records

- Definition: the same source/station/time identity already exists in the normalized store.
- Current implementation:
  - NDBC checks `observations` for existing `station_id + observed_at`.
  - CRW checks for an existing `derived_signals` reef-stress snapshot at the same source, region, station, and time.
  - IOOS checks both `observations` and `station_metrics`, and also maintains an in-memory `seenRecordKeys` set during a run.
- Example: a second IOOS row for the same station and timestamp is rejected as `duplicate_record`.

### 5. Schema drift

- Definition: the upstream payload no longer exposes the field set expected by the parser and mapper, even if the payload is syntactically valid.
- Current implementation:
  - CRW validates required field groups such as anomaly, HotSpot, DHW, and alert-level aliases.
  - IOOS validates that the payload still exposes a time field, a station identity field, and at least one recognized measurement family.
- Example: a CRW payload that stops exposing any recognizable HotSpot or DHW field aliases is rejected as `schema_drift`.

### 6. Coordinate or identity mismatch

- Definition: the upstream record identity cannot be reconciled safely with the internal station or region identity expected by downstream consumers.
- Current implementation status:
  - This rule is partially represented today through source filtering and record selection rather than as a dedicated reject code.
  - CRW chooses the latest matching region or station record for each configured target.
  - IOOS can filter by configured `stationId` and uses region fallback logic.
- Required hardening:
  - this should become an explicit reject reason once station registry enforcement is centralized.
- Example: an IOOS feed row whose station identity resolves to a station outside the configured source scope should fail this rule explicitly rather than being accepted implicitly.

Peer-review note: the original draft listed coordinate mismatch as if it were already a first-class reject code. In the current repo it is a real validation concern, but it is not yet implemented as a dedicated persisted rejection reason.

## Record Statuses

There is no single global status enum in this repo. The implementation uses several status sets, each at a different layer. For review purposes they should be treated separately rather than conflated.

### Ingestion-run statuses

- `running`
- `completed`
- `failed`

Used by: `ingestion_runs.status`

### Source runner result statuses

- `completed`
- `completed_with_rejections`
- `failed`

Used by: `runNdbcIngestion`, `runCrwIngestion`, `runIoosIngestion`

### Worker-level operational statuses

- `success`
- `partial`
- `failed`

Used by: `workers/ingest-live-feeds.ts` and persisted into `live_ingestion_worker_runs` and `live_ingestion_reports`

### Operational alert statuses

- `active`
- `resolved`

Used by: `operational_alerts`

### Shared signal statuses

- `open`
- `monitoring`
- `promoted`
- `dismissed`

Used by: `signal_detections` and shared signal route contracts

### Marine workflow event statuses

- `detected`
- `monitoring`
- `confirmed`
- `resolved`
- `dismissed`

Used by: `marine event` workflow types

### Marine investigation statuses

- `open`
- `acknowledged`
- `in_review`
- `resolved`
- `dismissed`

Used by: marine investigation workflow types and routes

### Marine alert statuses

- `active`
- `acknowledged`
- `resolved`

Used by: marine workflow alert types and routes

### Species verification statuses

- `pending`
- `verified`
- `rejected`

Used by: `species_sightings`

The implementation consequence is straightforward: reviewers should not ask for a single cross-platform `status` without first deciding which layer it belongs to.

## Signal Classes

The repo currently contains two related but distinct signal vocabularies.

### Marine event classes

- `threshold_alert`
  Triggered when a single observed or derived value crosses a defined boundary.
  Example: SST deviation at least `1.0°C` above baseline in `services/marine-event-detection.ts`.
- `trend_signal`
  Triggered when a time series crosses a rate-of-change rule.
  Example: SST rise rate at least `0.1°C/hour` across at least three observations.
- `contextual_signal`
  Triggered when multiple indicators converge.
  Example: HotSpot above `0` and DHW at least `4`, with critical severity when HotSpot is above `1` and DHW is at least `8`.

### Shared signal detection classes

- `thermal_anomaly`
- `oxygen_depletion`
- `migration_anomaly`
- `chlorophyll_bloom`
- `current_shear`
- `station_health`

Used by: the broader `signals` route and shared UI contracts

### Operational alert rule classes

- `high_sea_temperature`
- `high_wave_height`
- `high_wind_speed`
- `low_pressure_system`

Used by: NDBC threshold evaluation in `ndbc-alert-evaluator.ts`

These three vocabularies overlap conceptually but not structurally. That overlap is one of the main architectural cleanups still pending.

## Safety and Disclosure Rules

The current repo needs six explicit safety and disclosure rules to be considered peer-review ready. Some are already partially implemented; others are policy requirements that still need centralized enforcement.

### 1. Output-class labeling is mandatory

- Every public-facing marine-intelligence payload should declare whether it is `observed`, `derived`, `modeled`, or `narrative`.
- Current state: already partially implemented through shared ontology types and `ReefStressWatchItem.outputClass`.

### 2. Source attribution is mandatory

- Responses built from live ingestion must preserve the upstream source identifier and a usable source reference where practical.
- Current state: `LiveMarineCondition` exposes `source` and `sourceFeed`; provenance tables retain deeper lineage.

### 3. Observation time and ingestion time must remain distinct

- `observedAt` and `ingestedAt` are not interchangeable and should not be collapsed into a single timestamp in route responses or UI copy.
- Current state: this distinction is already represented in `observations`, `ingestion_runs`, provenance, and several shared response types.

### 4. Verification state must be visible for species records

- Public or analyst-facing species outputs must expose whether a sighting is `pending`, `verified`, or `rejected`.
- Current state: already implemented in shared types, species repositories, and species routes.

### 5. Sensitive coordinates must be generalized or suppressed before broad public release

- The database currently stores precise species coordinates and the map overlay builder can surface them.
- Required rule: external public surfaces should not expose exact sensitive ecological locations without a deliberate disclosure policy.
- Current state: this rule is not yet centralized in code and should be treated as a hardening gap, not as solved functionality.

### 6. Administrative mutation routes must remain permission-gated

- Investigation creation, alert acknowledgement, alert resolution, and comparable workflow mutations must stay behind explicit admin permission checks.
- Current state: `routes/marine-intelligence.ts` already enforces `station.view_admin` for workflow endpoints.

## Full Six-Step Coding Sequence

The next implementation pass should follow this six-step order. The point is not to invent the live path, but to make the existing path coherent, testable, and operationally honest.

### Step 1. Consolidate source configuration and validation contracts

- Move source freshness windows, numeric bounds, and recognized field aliases into shared source-specific config objects.
- Normalize rejection-reason typing across NDBC, CRW, and IOOS so validation behavior is easier to audit.
- Promote the partially implicit station/region identity checks into explicit validation outcomes where appropriate.

### Step 2. Standardize persistence of accepted and rejected records

- Keep `ingestion_runs`, `provenance_records`, and normalized writes as the acceptance path.
- Add an explicit rejection-log strategy so rejected rows are inspectable without re-running ingestion or reading only aggregate counters.
- Ensure every accepted downstream record still has a provenance row and every rejected record has a durable reason code.

### Step 3. Unify event, signal, and alert generation

- Decide how `operational_alerts`, `signal_detections`, and `marine events` relate, then codify that relationship.
- At minimum, document whether NDBC threshold alerts remain a separate operational stream or are promoted into the marine-event model.
- Avoid maintaining three disconnected alert vocabularies without an explicit translation layer.

### Step 4. Add a centralized safety and disclosure boundary

- Implement a dedicated boundary module for output classification, source disclosure, timestamp disclosure, sensitive-coordinate handling, and verification-state enforcement.
- Apply that boundary consistently to `/live-conditions`, `/reef-alerts`, `/regions`, species surfaces, and workflow routes that emit mixed evidence.
- Treat this as a route-serialization concern, not as an afterthought in the UI.

### Step 5. Harden operational delivery and health reporting

- Keep `workers/ingest-live-feeds.ts` as the orchestrator, but add scheduling, retry policy, and explicit alerting on stale or failed source runs.
- Continue using `live_ingestion_worker_runs` and `live_ingestion_reports` as the operational audit history.
- Make `/feed-health` the canonical internal operational readout for recent source performance.

### Step 6. Close the loop with tests, docs, and runtime packaging

- Extend source-run tests to cover validation failures, schema drift, duplicate handling, provenance guarantees, and route-level disclosure behavior.
- Verify that DB-backed and fallback-backed route responses remain distinguishable.
- Package the API route layer behind a real delivery mechanism once the contracts are stable enough to justify removing the current typed-stub posture.

## Delivery Priorities by Surface

If implementation time is limited, the current order of operational value is:

1. `/feed-health`
   Internal truth source for whether ingestion is actually working.
2. `/live-conditions`
   Most direct public-facing proof that the platform is ingesting live observations.
3. `/reef-alerts`
   Highest-value deterministic derived product already backed by live data.
4. `/regions`
   Useful synthesis surface, but more mixed and therefore more sensitive to disclosure and evidence-labeling gaps.

## Risks to Track During Implementation

- Multiple overlapping signal and alert vocabularies can drift apart if not unified soon.
- Species coordinates are currently stored at precise resolution; that is a real disclosure risk if public surfaces expand before safety policy is centralized.
- Several routes still support mock fallback behavior, which is useful for resilience but risky if downstream consumers assume all responses are DB-backed.
- The repo uses SQLite and typed route definitions today; concurrency, deployment topology, and long-running operational behavior are still outside the current implementation boundary.
- Argo is still absent from the current repo despite older planning language that treated it as part of the intended stack.

## Bottom Line

The live-ingestion path is already implemented enough to review as real software. The next pass should therefore focus on hardening and convergence:

- make validation outcomes explicit,
- make disclosure rules centralized,
- make alert and signal layers consistent,
- and make operational health impossible to misunderstand.

That sequence is more valuable now than adding a fourth source before the current three-source path is fully coherent.
