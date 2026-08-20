# Marine Intelligence Platform

Single-tenant marine risk monitoring system. Ingests NOAA NDBC buoy data, tracks reef stress, detects anomalies, and surfaces live conditions and investigation workflows.

> **Single-tenant:** This platform is designed for one operator. There is no multi-user auth or row-level isolation. Run one instance per deployment environment.

---

## 10-minute quickstart

### 1. Install

```bash
pnpm install
```

### 2. Configure environment

Create `apps/api/.env`:

```env
PORT=4000
MARINE_DB_PATH=./data/marine.db
```

Create `apps/web/.env.local`:

```env
NEXT_PUBLIC_MARINE_API_URL=http://localhost:4000
```

API base variable precedence (temporary compatibility):

1. `NEXT_PUBLIC_MARINE_API_URL` (canonical)
2. `MARINE_API_BASE_URL` (legacy fallback)
3. `http://localhost:4000` (default)

Set only `NEXT_PUBLIC_MARINE_API_URL` for new setups.

### 3. Seed sample data

Bootstraps the full database schema and inserts sample NOAA NDBC observations for 5 real buoy stations (41009, 41010, 41012, 41044, 42036) across two Florida regions. Safe to run multiple times — all inserts are `INSERT OR IGNORE`.

```bash
pnpm --filter api seed:datasets
```

### 4. Start the API

```bash
pnpm --filter api start
```

The API listens on `http://localhost:4000`.

### 5. Start the web app

```bash
pnpm --filter web dev
```

Open `http://localhost:3000`. The dashboard shows live conditions, reef stress, signals, and the observation coverage map.

---

## Live ingestion

To pull real readings from NOAA NDBC instead of seed data:

```bash
pnpm --filter api ingest:live
```

Configure which stations and regions are fetched via `apps/api/.env`:

```env
NDBC_STATION_IDS=41009,41010,41012,41044,42036
CRW_TARGET_REGIONS=florida_keys,southeast_florida
```

Once live ingestion has run, the dashboard banner on the Live Marine Conditions section changes from **Seed data** to live timestamps.

---

## Seed data vs live data

| | Seed data | Live data |
|---|---|---|
| Source | `pnpm --filter api seed:datasets` | `pnpm --filter api ingest:live` |
| `observations.source` column | `"seed"` | `"noaa_ndbc"` or similar |
| Dashboard banner | Shows "Seed data" notice | No banner |
| Use for | First-run demo, local dev | Scientific analysis |

Seed observations use real NDBC climatological baselines (April/May SE Florida) with deterministic diurnal offsets — they look plausible but are **not real observations**. Never cite seed data in scientific reports.

---

## Key concepts

**Station** — A physical buoy or sensor. Corresponds to a NOAA NDBC station ID (e.g. `41009`). Stations report sea surface temperature, wave height, wind speed, and pressure.

**Observation** — A single timestamped reading from a station. Stored in the `observations` table with a `source` field (`"seed"`, `"noaa_ndbc"`, etc.).

**Signal detection** — An anomaly flagged by the ingestion pipeline when a metric deviates beyond a threshold. Signals have severity levels and are linked to stations.

**Alert** — A region-level risk event. Alerts aggregate signal detections into actionable notices for a geographic region.

**Investigation** — A structured inquiry into one or more signals or alerts. Investigations link signals, species observations, and stations into a causal narrative. They are the primary unit of scientific work in this platform.

**Truth partition** — The rule that all data surfaces must trace to a verified source. Metrics and observations that cannot be traced to a real ingestion run are withheld or labeled. The dashboard shows "WITHHELD" or a fallback banner when the live API is unreachable rather than showing stale or fabricated values.

---

## Build and test

```bash
pnpm --filter web build    # Next.js production build
pnpm --filter web test     # Vitest unit tests (run from apps/web or use this filter)
pnpm --filter web lint     # ESLint
```

> Tests must run via `pnpm --filter web test` or from inside `apps/web/`. Running `npx vitest` from the repo root will fail (no vitest config found there).

---

## Environment variables reference

| Variable | App | Default | Description |
|---|---|---|---|
| `PORT` | api | `4000` | API listen port |
| `MARINE_DB_PATH` | api | `./data/marine.db` | Path to SQLite database file |
| `NDBC_STATION_IDS` | api | — | Comma-separated NDBC station IDs for live ingestion |
| `CRW_TARGET_REGIONS` | api | — | NOAA Coral Reef Watch region slugs for reef stress ingestion |
| `NEXT_PUBLIC_MARINE_API_URL` | web | `http://localhost:4000` | Canonical base URL for web-to-API requests |
| `MARINE_API_BASE_URL` | web | — | Legacy compatibility fallback if `NEXT_PUBLIC_MARINE_API_URL` is unset |
| `ALLOW_SYNTHETIC_BASELINE_IN_PRODUCTION` | api | `false` | Set to `true` to allow synthetic/seed observations in production queries (not recommended) |
