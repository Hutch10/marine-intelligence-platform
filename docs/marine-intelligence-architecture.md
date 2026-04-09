# Marine Intelligence Architecture

## Purpose

This document describes the current marine-intelligence architecture implemented in this repository as of March 22, 2026. It is intended for peer review, so it distinguishes clearly between what is already present in code, what is partially implemented, and what remains an explicit next-step rather than an existing capability.

The platform is a monorepo-based marine observation and intelligence system. Its current operational spine is a live-ingestion path for NOAA NDBC, NOAA Coral Reef Watch, and IOOS data, backed by a SQLite schema, typed repositories, typed route surfaces, and a Next.js frontend. Around that spine, the repo also contains broader workflow, species, station-admin, and map features that are already part of the current codebase but are not all on the critical path for live ingestion.

## Strategic Position

- The strongest claim this repo can support today is that it has a credible, code-backed foundation for live marine observation ingestion and deterministic downstream interpretation.
- The repo does not yet support a claim of production maturity. It still uses a local SQLite store, framework-agnostic route definitions on the API side, selective mock fallbacks in several route paths, and incomplete safety centralization.
- The value is not raw data collection. The value is normalization, traceability, deterministic signal generation, and readable product surfaces on top of external observing systems.
- The system is already broader than a prototype mockup, but it is not yet a hardened operational platform.

## Current Source Coverage

The currently implemented live source stack is:

1. `noaa_ndbc`
   Real-time buoy observations mapped into normalized `observations` rows and threshold-based operational alerts.
2. `noaa_coral_reef_watch`
   Reef thermal-stress inputs mapped into `station_metrics` and `derived_signals`, then exposed as reef-stress outputs.
3. `ioos_regional`
   Regional observational feeds mapped into both `observations` and `station_metrics`, including water chemistry-style metrics such as salinity, dissolved oxygen, and chlorophyll where present.

Notably absent from the current repo:

- There is no `argo` connector in `apps/api/src/connectors`.
- There is no dedicated `services/safety` module yet, even though safety and disclosure rules are already implied by the domain and partially expressed in route contracts and shared types.
- There is no running HTTP server inside `apps/api`; the API package still exposes typed route definitions and repository-backed builders rather than a long-lived service process.

## Architecture Flow

The current architecture is best understood as a text flow rather than a box diagram:

1. Upstream sources are fetched by source-specific connectors.
   NDBC uses `connectors/ndbc/fetch.ts`, Coral Reef Watch uses `connectors/coral-reef-watch/fetch.ts`, and IOOS uses `connectors/ioos/fetch.ts`.
2. Raw feed payloads are parsed into source-specific intermediate records.
   Each connector has a dedicated `parse.ts` that handles source format differences and exposes typed parsed records.
3. Parsed records are mapped into internal domain shapes.
   `map.ts` files translate source fields into normalized observation, metric, or derived-signal payloads with internal field names and timestamps.
4. Source-specific ingestion services validate and persist records.
   `services/ingestion/run-ndbc.ts`, `run-crw.ts`, and `run-ioos.ts` create `ingestion_runs`, reject stale or impossible records, prevent duplicates, and write accepted records into normalized tables.
5. Row-level provenance is written for every accepted downstream record in the ingestion path.
   `repositories/provenance.ts` stores source ID, source timestamp, source reference, record type, and the downstream record ID.
6. Deterministic downstream interpretation is applied where rules already exist.
   NDBC records can trigger threshold-based `operational_alerts`. Coral Reef Watch records are converted into reef-stress metrics and derived bleaching-alert signals. The separate marine-event workflow stack can also evaluate threshold, trend, and contextual event logic.
7. Worker-level operational reporting is persisted.
   `workers/ingest-live-feeds.ts` orchestrates the source runs, summarizes success versus partial versus failed execution, and writes worker and per-source history into `live_ingestion_worker_runs` and `live_ingestion_reports`.
8. Repository read models translate normalized rows into product-facing response shapes.
   `repositories/observations.ts` builds live-condition snapshots, `repositories/reef-stress.ts` builds reef-stress records, and `repositories/live-ingestion-reports.ts` builds operational health views.
9. Typed routes expose those read models.
   `routes/live-conditions.ts`, `routes/reef-alerts.ts`, `routes/feed-health.ts`, `routes/regions.ts`, and the marine workflow routes in `routes/marine-intelligence.ts` turn repository output into stable response contracts.
10. The Next.js frontend consumes those route contracts and combines them with broader platform surfaces.
    The web app currently includes dashboard, ocean map, ocean stations, investigations, species database, and data-explorer surfaces.

The result is a layered path in which every live record should be attributable to a source, a source timestamp, and an ingestion run before it appears in a downstream surface.

## Actual Repository Structure

The repo is not organized as a narrow single-purpose ingestion service. It is a monorepo with a live-ingestion spine embedded in a broader ocean-intelligence product:

```text
marine/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   │   ├── connectors/
│   │   │   │   ├── coral-reef-watch/
│   │   │   │   │   ├── fetch.ts
│   │   │   │   │   ├── parse.ts
│   │   │   │   │   └── map.ts
│   │   │   │   ├── ioos/
│   │   │   │   │   ├── fetch.ts
│   │   │   │   │   ├── parse.ts
│   │   │   │   │   └── map.ts
│   │   │   │   └── ndbc/
│   │   │   │      ├── fetch.ts
│   │   │   │      ├── parse.ts
│   │   │   │      └── map.ts
│   │   │   ├── db/
│   │   │   │   ├── bootstrap.ts
│   │   │   │   ├── client.ts
│   │   │   │   ├── schema.ts
│   │   │   │   └── seed-datasets.ts
│   │   │   ├── repositories/
│   │   │   │   ├── ingestion-runs.ts
│   │   │   │   ├── live-ingestion-reports.ts
│   │   │   │   ├── observations.ts
│   │   │   │   ├── operational-alerts.ts
│   │   │   │   ├── provenance.ts
│   │   │   │   ├── reef-stress.ts
│   │   │   │   ├── regions.ts
│   │   │   │   ├── signals.ts
│   │   │   │   ├── species.ts
│   │   │   │   ├── station-metrics.ts
│   │   │   │   ├── stations.ts
│   │   │   │   ├── marine-events.ts
│   │   │   │   ├── marine-intelligence-alerts.ts
│   │   │   │   └── marine-investigations.ts
│   │   │   ├── routes/
│   │   │   │   ├── dashboard.ts
│   │   │   │   ├── feed-health.ts
│   │   │   │   ├── live-conditions.ts
│   │   │   │   ├── marine-intelligence.ts
│   │   │   │   ├── operational-alerts.ts
│   │   │   │   ├── reef-alerts.ts
│   │   │   │   ├── regions.ts
│   │   │   │   ├── signals.ts
│   │   │   │   ├── species.ts
│   │   │   │   └── stations.ts
│   │   │   ├── services/
│   │   │   │   ├── ingestion/
│   │   │   │   │   ├── ndbc-alert-evaluator.ts
│   │   │   │   │   ├── run-crw.ts
│   │   │   │   │   ├── run-ioos.ts
│   │   │   │   │   └── run-ndbc.ts
│   │   │   │   ├── marine-event-detection.ts
│   │   │   │   ├── marine-intelligence-events.ts
│   │   │   │   ├── marine-intelligence-workflow.ts
│   │   │   │   ├── marine-investigation-workflow.ts
│   │   │   │   └── operational-alerts.ts
│   │   │   ├── workers/
│   │   │   │   ├── ingest-live-feeds.ts
│   │   │   │   ├── ingest-dataset.ts
│   │   │   │   ├── compute-anomalies.ts
│   │   │   │   └── generate-report.ts
│   │   │   ├── data.ts
│   │   │   ├── marine-intelligence-types.ts
│   │   │   ├── index.ts
│   │   │   └── types.ts
│   │   └── .env.example
│   └── web/
│       ├── app/
│       │   ├── page.tsx
│       │   ├── ai-lab/
│       │   ├── data-explorer/
│       │   ├── investigations/
│       │   ├── ocean-map/
│       │   ├── ocean-stations/
│       │   ├── species-database/
│       │   ├── station/dynamic-slug/
│       │   └── api/
│       ├── components/
│       │   ├── dashboard/
│       │   ├── ocean-map/
│       │   ├── ocean-stations/
│       │   ├── signals/
│       │   ├── species/
│       │   └── investigations/
│       └── lib/
│           ├── api/
│           ├── ontology/
│           ├── persistence/
│           └── server/
├── packages/
│   └── shared/
│       └── src/
│           ├── index.ts
│           └── types.ts
├── docs/
│   ├── marine-intelligence-architecture.md
│   ├── implementation-brief-live-ingestion.md
│   ├── live-ingestion-operations.md
│   ├── current-state-handoff.md
│   └── agents/
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

This tree matters because the architecture is no longer just an API sketch. The web app, shared types package, route layer, repositories, ingestion services, and worker orchestration all exist in the current repo.

## Core Normalized Storage Model

The full schema in `apps/api/src/db/schema.ts` contains many more than ten tables. For architecture review, the ten tables below are the current normalized core of the live-ingestion and evidence chain.

### 1. `data_sources`

- Role: registry for upstream providers and their base metadata.
- Key columns: `id`, `name`, `priority`, `base_url`, `active`.
- Relationships: currently acts as source catalog metadata rather than a strongly enforced foreign-key dependency from the observation tables.
- Example use: representing `noaa_ndbc`, `noaa_coral_reef_watch`, and `ioos_regional` as platform-recognized sources.

### 2. `regions`

- Role: named geographic aggregation layer for reef stress, map overlays, and region-level briefings.
- Key columns: `id`, `name`, `status`, `summary`, `geometry`, `buoy_count`.
- Relationships: referenced by `stations.region_id`, `datasets.region_id`, `investigations.region_id`, `alerts.region_id`, and used indirectly by region-keyed metrics and signals.
- Example use: the `regions` repository builds ocean-map summaries and region metrics from this table plus related overlay data.

### 3. `stations`

- Role: canonical station identity table for physical monitoring assets and station-linked read models.
- Key columns: `id`, `slug`, `name`, `region_id`, `status`, `latitude`, `longitude`, `last_reported_at`.
- Relationships: referenced by `station_metrics.station_id`, `derived_signals.station_id`, `signal_detections.station_id`, and many station-facing UX tables.
- Example use: NDBC and IOOS observations are keyed by `station_id`; station detail and admin routes use this table as the identity anchor.

### 4. `ingestion_runs`

- Role: source-run audit log for each connector execution.
- Key columns: `id`, `source`, `status`, `station_count`, `inserted_rows`, `rejected_rows`, `started_at`, `finished_at`.
- Relationships: referenced by `observations.ingestion_run_id`, `station_metrics.ingestion_run_id`, `derived_signals.ingestion_run_id`, and `provenance_records.ingestion_run_id`.
- Example use: every NDBC, CRW, and IOOS run creates an `ING-*` row before persistence begins and finalizes it on completion or failure.

### 5. `observations`

- Role: normalized direct measurements from live feeds.
- Key columns: `station_id`, `source`, `observed_at`, `sea_surface_temp_c`, `wave_height_m`, `wind_speed_mps`, `pressure_hpa`.
- Relationships: belongs to an `ingestion_run`; should have a matching `provenance_record`; functionally linked to `stations` by `station_id`.
- Example use: NDBC and IOOS observations back the `/live-conditions` route through `repositories/observations.ts`.

### 6. `station_metrics`

- Role: normalized deterministic metrics that are not raw instrument observations but still belong to a station or region/time context.
- Key columns: `station_id`, `region_key`, `metric_type`, `metric_value`, `metric_unit`, `source`, `observed_at`.
- Relationships: belongs to an `ingestion_run`; optionally links to `stations`; should have a matching `provenance_record`.
- Example use: Coral Reef Watch writes `sst_anomaly_c`, `hotspot_c`, and `dhw`; IOOS can write `salinity_psu`, `dissolved_oxygen_mg_l`, and `chlorophyll_mg_m3`.

### 7. `derived_signals`

- Role: deterministic derived outputs that summarize interpreted state rather than source-native measurement values.
- Key columns: `station_id`, `region_key`, `signal_type`, `signal_value`, `signal_label`, `severity`, `source`, `observed_at`.
- Relationships: belongs to an `ingestion_run`; optionally links to `stations`; should have a matching `provenance_record`.
- Example use: Coral Reef Watch writes `reef_bleaching_alert_level` rows that are later rehydrated into `/reef-alerts` responses with `outputClass: "derived"`.

### 8. `provenance_records`

- Role: row-level lineage table connecting internal records back to source identity and ingestion execution.
- Key columns: `ingestion_run_id`, `source`, `source_station_id`, `source_timestamp`, `source_reference`, `record_type`, `record_id`, `payload_json`.
- Relationships: references `ingestion_runs`; points to downstream rows in `observations`, `station_metrics`, or `derived_signals` through `(record_type, record_id)`.
- Example use: every accepted live-ingestion write currently creates a provenance row describing the downstream record and the upstream source reference.

### 9. `live_ingestion_worker_runs`

- Role: top-level operational log for each worker-orchestrated multi-source ingestion execution.
- Key columns: `id`, `status`, `started_at`, `completed_at`, `duration_ms`, `inserted_count`, `rejected_count`, `rejection_reasons_json`.
- Relationships: parent table for `live_ingestion_reports.worker_run_id`.
- Example use: `workers/ingest-live-feeds.ts` persists one worker-run row that summarizes the NDBC, CRW, and optional IOOS execution batch.

### 10. `live_ingestion_reports`

- Role: per-source operational history beneath each worker run.
- Key columns: `worker_run_id`, `source`, `status`, `started_at`, `completed_at`, `inserted_count`, `rejected_count`, `run_id`, `error`.
- Relationships: references `live_ingestion_worker_runs`; `run_id` links back logically to `ingestion_runs.id`.
- Example use: `/feed-health` reads this table to report latest source status, stale feeds, rejection counts, and recent history.

### Adjacent Current Tables

Two adjacent tables matter enough to mention even though they are outside the ten-table normalized core above:

- `operational_alerts`
  Stores threshold-driven operational warnings generated today from NDBC anomaly rules.
- `signal_detections`
  Supports a separate signal-management workflow and is broader than the live-ingestion evidence chain.

## Relationships and Separation Rules

The architecture depends on strict separation between measurement, metric, signal, and narrative layers:

- `observations` are direct measurements.
  Example: buoy SST, wave height, wind speed, pressure.
- `station_metrics` are deterministic computed or normalized metrics.
  Example: SST anomaly, salinity, dissolved oxygen, chlorophyll.
- `derived_signals` are deterministic signal labels or severity assignments.
  Example: reef bleaching alert level derived from CRW fields.
- `marine events`, `alerts`, and UI briefings are interpretation and workflow layers built on top of evidence tables.

The repo already encodes the four-way intelligence classification in `apps/api/src/marine-intelligence-types.ts` as:

1. `observed`
   Directly reported from a feed or instrument.
   Example: an NDBC sea-surface temperature row in `observations`.
2. `derived`
   Deterministic transformation from observed data using explicit logic.
   Example: a Coral Reef Watch bleaching stress level or SST anomaly row exposed through `/reef-alerts`.
3. `modeled`
   Produced by a model or probabilistic inference layer rather than by a direct measurement or simple deterministic transform.
   Example: a future forecast or subsurface-state estimate. This layer is typed in the repo but not yet materially populated by the current live-ingestion path.
4. `narrative`
   Human- or AI-facing explanatory synthesis that references evidence but is not itself the evidence.
   Example: a dashboard briefing, AI-lab analysis, or regional written summary tied back to observed and derived inputs.

Peer-review implication: the repo already has the type vocabulary to keep these layers distinct. What still needs hardening is consistent enforcement of that distinction across every route and surface, not invention of the distinction itself.

## Product Surfaces

The current repo exposes three concrete marine-intelligence surfaces on top of the ingestion spine.

### 1. Live Marine Conditions

- Primary data: latest rows from `observations`.
- Primary backend path: `repositories/observations.ts` and `routes/live-conditions.ts`.
- User-facing purpose: show current station-level marine conditions such as SST, wave height, wind speed, and pressure.
- Strength today: this is the most direct readout of live NDBC and IOOS observation ingestion.
- Limitation today: route-level delivery is still a typed stub pattern with mock fallback if DB access is unavailable.

### 2. Reef Stress Watch

- Primary data: Coral Reef Watch-derived `station_metrics` plus `derived_signals`.
- Primary backend path: `repositories/reef-stress.ts` and `routes/reef-alerts.ts`.
- User-facing purpose: expose thermal-stress indicators such as SST anomaly, HotSpot, DHW, and bleaching alert level by region or station context.
- Strength today: the route clearly marks these records as `outputClass: "derived"`, which is the right epistemic classification.
- Limitation today: this remains a deterministic derived layer, not a probabilistic ecological forecast.

### 3. Regional Ocean Intelligence

- Primary data: `regions`, `alerts`, investigations, and species/map overlays, assembled into the ocean-map and regional summary views.
- Primary backend path: `repositories/regions.ts` and `routes/regions.ts`, with frontend presentation in `apps/web/app/ocean-map`.
- User-facing purpose: provide a regional view that combines risk status, overlay entities, recent activity, and geographically grouped context.
- Strength today: this is the broadest current synthesis surface and is already backed by real repository joins rather than a pure static mock.
- Limitation today: it is a mixed surface that combines evidence, workflow, and overlay logic; reviewers should treat it as a broader operational workspace rather than a narrowly normalized scientific product.

## Signal and Alert Layers

There are two distinct signal layers in the current repo:

- `operational_alerts`
  Immediate threshold-based operational warnings, currently used by NDBC ingestion.
- `marine event` and `marine alert` workflow stack
  A richer workflow layer with event classes `threshold_alert`, `trend_signal`, and `contextual_signal`, plus investigation and alert lifecycles.

This separation is useful, but it also means the system currently has parallel alerting concepts. That is not a defect by itself, but it is an architectural seam that should be reviewed explicitly if the platform is expected to converge on one canonical event model.

## Safety and Disclosure Rules

The repo does not yet contain a centralized `services/safety` implementation. Even so, a peer-reviewable architecture needs the safety and disclosure contract stated explicitly.

1. Evidence class must be explicit at the product boundary.
   Public-facing payloads should identify whether they are `observed`, `derived`, `modeled`, or `narrative`. This is already partially present through the ontology types and the `outputClass` field used by reef-stress outputs.
2. Source and timing provenance must remain visible.
   Live-condition and reef-stress responses should retain source identifiers and timestamps so downstream consumers do not mistake stale or synthetic output for fresh direct observation.
3. Species verification state must be disclosed.
   The species subsystem already distinguishes `pending`, `verified`, and `rejected` sightings. Unverified sightings should not be presented as confirmed ecological fact.
4. Sensitive-location precision requires deliberate handling.
   The current schema stores exact latitude and longitude for species sightings. Before any broad public release, those coordinates need route-level generalization or suppression. That requirement is architectural, and the current repo does not yet centralize it.
5. Administrative workflows must remain permission-gated.
   The marine workflow routes already require `station.view_admin`. Operational investigation and alert mutation should stay behind authenticated, permission-checked surfaces rather than public API paths.
6. Fallback state must be disclosed, not hidden.
   Several routes still fall back to mock or unavailable responses when DB access fails. Telemetry and fallback reasons need to remain visible so reviewers can distinguish real storage-backed output from placeholder-safe behavior.

## Architectural Assessment

What is strong in the current repo:

- Source-specific fetch/parse/map connectors exist for three live sources.
- Ingestion services enforce real validation and deduplication rules.
- Provenance and ingestion-run tables give the system a credible audit spine.
- Repository read models and route builders are already wired for live-condition, reef-stress, and feed-health surfaces.
- The shared type system is materially useful, not decorative.

What still needs architectural hardening:

- Consolidation between operational alerts, signal detections, and marine workflow alerts.
- A centralized safety/disclosure layer instead of scattered implicit policy.
- Clearer distinction between DB-backed output and mock fallback in broader surfaces.
- A production delivery path beyond framework-agnostic route definitions and local SQLite.
- A decision on whether additional sources such as Argo are actually in scope for the next milestone, since they are discussed in older planning language but are not implemented in the current repo.

## Runtime Topology (as of March 2026)

### Service boundary

The architecture now has a real HTTP boundary between the web frontend and the API backend.

```text
apps/web (Next.js, Vercel or self-hosted)
  └── Server Components call apps/api over HTTP
        MARINE_API_BASE_URL=http://<api-host>:4000
        5s timeout, explicit 5xx and malformed-response handling

apps/api (Node.js HTTP server, apps/api/src/server.ts)
  └── Serves all live product routes:
        GET /live-conditions
        GET /reef-alerts
        GET /signals
        GET /anomalies
        GET /v1/risk/:stationId
        GET /v1/regions/:regionId/risk
        GET /v1/regions/:regionId/risk/trend
  └── Reads from SQLite on a persistent volume
        MARINE_DB_PATH=.data/marine.sqlite

Ingestion worker (apps/api/src/workers/ingest-live-feeds.ts)
  └── Runs as a separate process on a cron or loop schedule
  └── Writes NOAA NDBC and CRW data to the same SQLite database
  └── Does NOT run inside apps/api server process
```

### Environment variables

| Service   | Variable              | Purpose                                              |
|-----------|-----------------------|------------------------------------------------------|
| apps/web  | MARINE_API_BASE_URL   | Base URL of the running apps/api server              |
| apps/api  | PORT                  | HTTP listen port (default 4000)                      |
| apps/api  | MARINE_DB_PATH        | Path to SQLite database file                         |
| apps/api  | NDBC_STATION_IDS      | Comma-separated NOAA NDBC station IDs to ingest      |
| apps/api  | CRW_TARGET_REGIONS    | Comma-separated CRW region names to ingest           |

### SQLite — current state and migration path

SQLite is intentional for the current pilot stage. It requires no infrastructure provisioning, runs embedded in the API process, and survives a Fly.io or Railway deployment with a persistent volume.

**Current limitation**: SQLite does not support concurrent writes from multiple processes. The ingestion worker and the API server must not write simultaneously, or the worker must run on the same machine as the API and use WAL mode (already the case for this project).

**Intended migration path**: When the platform moves to multi-region deployment or requires concurrent ingestion workers, the database layer should migrate to PostgreSQL (Neon, Supabase, or a managed provider). The repository layer (`apps/api/src/repositories/`) already abstracts all queries behind typed functions. Swapping the driver is the only change required at that layer — route builders and the API server are not affected.

### Current operational limitations

These are hard constraints on what the system can do today in a real deployment:

1. **SQLite — single-writer constraint**: The ingestion worker and API server share a SQLite file. Both must run on the same host. The system cannot scale to multiple ingestion workers or API replicas without migrating to PostgreSQL first.

2. **No process supervisor for the ingestion worker**: The ingestion worker (`apps/api/src/workers/ingest-live-feeds.ts`) is a standalone script. In production it needs a process supervisor (cron, systemd, or a Fly.io scheduled machine) to restart on failure and run on a predictable schedule. Without this, data goes stale silently.

3. **Auth-dependent Next.js API routes are not proxied**: Five `apps/web/app/api/v1/*` handlers pass `authResult.auth` directly into route builders and cannot be proxied to `apps/api` until an auth-forwarding mechanism exists. These routes are:
   - `POST /api/v1/validation/feedback`
   - `POST /api/v1/validation/outcomes`
   - `GET /api/v1/alerts` (marine workflow)
   - `POST /api/marine-intelligence/validation/outcomes`
   - `GET /api/admin/stations/:id/thresholds`
   These continue to call route builders in-process for now.

4. **No deployment guide**: There is no documented process for running `apps/api` in production alongside a Vercel-deployed `apps/web`. The runtime topology section above describes the target state, but there is no step-by-step deployment runbook.

### Resolved blockers (as of Pass 2)

- ~~Static region config cross-imported~~ — `MarineRegionConfig`, `listMarineRegionConfigs`, and `getMarineRegionConfig` moved to `@marine/shared`. `apps/api/src/services/region-config.ts` now re-exports from `@marine/shared`. The cross-app source import is eliminated.
- ~~Next.js API routes call route builders directly~~ — The four routes that did not pass auth context (`/api/v1/anomalies`, `/api/v1/risk/score`, `/api/v1/risk/evaluate`, `/api/v1/validation/summary`) are now proxy handlers that call `apps/api` over HTTP.
- ~~No `/health` endpoint~~ — `GET /health` on `apps/api` returns `{ status, uptimeSeconds, dbReachable, feedHealth }`.
- ~~No `/validation/summary` route on `apps/api`~~ — Added alongside the health endpoint.

## Bottom Line

This repository already contains a live-ingestion-capable marine-intelligence foundation. The evidence chain from source fetch through normalization, validation, provenance, and route-level presentation is real for NDBC, Coral Reef Watch, and IOOS.

The honest peer-review position is therefore:

- this is no longer just a static prototype,
- it is not yet an operationally hardened production system,
- and the most important next work is convergence, disclosure hardening, and delivery hardening rather than inventing the ingestion architecture from scratch.
