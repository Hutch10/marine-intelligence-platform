# 72-Hour Operational Soak Checklist

Use this checklist during a controlled burn-in before widening researcher access. Run against staging or production-like environment with real scheduler enabled.

## Preconditions

- [ ] `MARINE_DB_PATH` or Turso credentials configured
- [ ] `OPERATOR_ACCESS_TOKEN` set (if operator routes are gated)
- [ ] `OPERATIONAL_ANALYTICS_RECORD_KEY` set in production (web + API)
- [ ] Scheduler worker process running (`ingest-live-feeds` on interval)
- [ ] Baseline DB migrated (observations temporal columns, `recovery_backfill_queue`, `circuit_breaker_state`, `operational_analytics_daily`)

## Hour 0 — Startup validation

| Check | Command / surface | Pass criteria |
|-------|-------------------|---------------|
| API health | `GET /health` | `dbReachable: true` when DB configured |
| Scheduler config | `GET /internal/operator/status?token=…` | `scheduler.sources[]` lists NDBC, CRW, IOOS/ERDDAP per env |
| Feed health baseline | Same response `feed_health` | At least one source `healthy` or explicit `failed` with reason |
| Circuit breaker snapshot | `circuit_breaker` in operator status | All sources have `state` in `closed` \| `open` \| `half_open` |
| Freshness governance | `freshness_governance` | `withheldCount` documented; stale sources not promoted |
| Analytics empty OK | `GET /internal/operator/analytics?token=…` | Privacy manifest present; totals may be zero |

## Every 6 hours (×12 over 72h)

| Check | Pass criteria |
|-------|---------------|
| Feed health updates | `generated_at` advances; `latest_status_by_source` reflects recent runs |
| Ingestion runs | `recentHistory` in feed health shows new `reportId` entries |
| No silent zero-insert streak | Failed sources show `error` text, not empty diagnostics |
| Circuit breaker persistence | `circuit_breaker_state` table rows match operator snapshot after restart |
| Recovery queue | After simulated/organic outage recovery, `recovery_backfill_queue` has `completed` or `pending` rows |
| Operator console | `/operator` loads; recent failures/recoveries lists sane |
| Analytics monotonicity | `operational_analytics_daily.count` non-decreasing for active surfaces |

## Hour 24 — Persistence spot checks

- [ ] Stop API process; restart; confirm `circuit_breaker_state` unchanged for last known states
- [ ] Confirm `recovery_backfill_queue` pending jobs survive restart
- [ ] Open lineage for known `OBS-…` record; provenance fields populated
- [ ] Generate scientific export CSV; file includes `provenanceId`, per-metric timestamps, `freshnessClassification`

## Hour 48 — Failure drill (see Phase 3 doc)

- [ ] Run hostile verification suite: `pnpm --filter api test` (includes `hostile-verification.test.ts`)
- [ ] Review `apps/api/.verification/hostile-evidence.json`
- [ ] Review `apps/api/.verification/operational-validation-evidence.json`

## Hour 72 — Sign-off

| Metric | Target |
|--------|--------|
| Unplanned restarts | 0 without documented cause |
| Open circuits without recovery plan | 0 > 6h |
| Turso reconciliation backlog | `pending_turso` draining after connectivity restored |
| Public live promotion while source failed | 0 (fail-closed) |
| Analytics PII fields in DB | 0 |

## Operator dashboard checks (manual)

1. **Feed health** — source status, stale age, station diagnostics present for NDBC.
2. **Scheduler** — intervals match env (`SCHEDULER_*_INTERVAL_MS`).
3. **Circuit breaker** — open count matches known outages.
4. **Freshness governance** — withheld sources excluded from live promotion.
5. **Recent failures / recoveries** — correlate with ingestion reports.
6. **Operational analytics panel** — page_view, investigation_open, lineage_open, export, operator_usage totals move with usage.
7. **Data lineage link** — trace form works; no public nav exposure.

## Evidence to archive

- `hostile-evidence.json`
- `operational-validation-evidence.json`
- Screenshots or exports of operator status at H0, H24, H48, H72
- Any incident notes for failed soak checks
