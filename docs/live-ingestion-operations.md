# Live Ingestion Operations

This runbook defines deployment-time environment configuration and the minimum staging verification path for unified live ingestion.

**Production telemetry activation** (scheduled worker, Turso credentials, verification): see [telemetry-activation/RUNBOOK.md](./telemetry-activation/RUNBOOK.md).

## Environment Template

Use `apps/api/.env.example` as the baseline template for API runtime configuration.

Required IOOS keys in deployment environments:

- `IOOS_ENABLED=false`
- `IOOS_SOURCE_URL=`
- `IOOS_STATION_IDS=`
- `IOOS_REGION_KEY=ioos_region`
- `IOOS_SOURCE_URLS=`

Safe default behavior:

- `IOOS_ENABLED` defaults to `false`, so `ioos_regional` is skipped by the unified worker until explicitly enabled.
- Leave all IOOS source keys empty to rely on connector defaults while IOOS is disabled.

## IOOS Config Loading Notes

The IOOS ingestion loader follows this precedence:

1. If `IOOS_STATION_IDS` is set:
   - each station ID becomes a source target
   - source URL is chosen from `IOOS_SOURCE_URL`, then first entry of `IOOS_SOURCE_URLS`, then connector default
2. If `IOOS_STATION_IDS` is empty and `IOOS_SOURCE_URLS` is set:
   - each URL in `IOOS_SOURCE_URLS` becomes a source target
3. If both are empty:
   - one source target is created from the connector default URL

Region key behavior:

- `IOOS_REGION_KEY` defaults to `ioos_region` when unset.

## Staging Verification Path

1. Deploy the API with `IOOS_ENABLED=true` in staging and set IOOS source variables for the intended region/stations.
2. Run the unified worker once:

```powershell
pnpm --filter api ingest:live
```

3. Confirm ingestion persistence in staging database:

```sql
SELECT id, status, inserted_count, rejected_count, datetime(started_at / 1000, 'unixepoch') AS started_utc
FROM live_ingestion_worker_runs
ORDER BY started_at DESC
LIMIT 5;

SELECT source, worker_status, status, inserted_count, rejected_count, error
FROM live_ingestion_reports
ORDER BY started_at DESC
LIMIT 20;
```

4. Verify feed-health includes IOOS source entry:

```bash
curl -s "https://<staging-api-host>/feed-health?limit=20" | jq '.latest_status_by_source[] | select(.source == "ioos_regional")'
```

Acceptance check:

- output returns a row for `source == "ioos_regional"`.

5. Verify operational alerts remain stable after the run:

```bash
curl -s "https://<staging-api-host>/operational-alerts" | jq '{source, summary, active_alerts: (.active_alerts | length)}'
```

Acceptance check:

- response is `source == "db"` with no unexpected spike in critical alerts tied to IOOS enablement.

## API Quick Reference: GET /operational-alerts

Query params:

- `status`: optional, `active` or `resolved`
- `source`: optional, exact source filter (for example `ioos_regional`)
- `ruleType`: optional, exact rule filter
- `limit`: optional, bounded to `1..500`
- `historyLimit`: compatibility alias, only used when `limit` is omitted

Valid `ruleType` values:

- `source_failed`
- `source_stale`
- `repeated_degraded`
- `persistence_failure`

Compatibility behavior:

- `active_alerts` remains active-only
- `recent_history` supports `status` filtering
- `historyLimit` applies only when `limit` is not provided

Examples:

```bash
curl -s "https://<staging-api-host>/operational-alerts?status=resolved&source=ioos_regional&ruleType=source_stale&limit=25"
```

```bash
curl -s "https://<staging-api-host>/operational-alerts?historyLimit=10"
```

## Operator Workflow: /feed-health + /operational-alerts

Use this sequence during ingestion verification and incident review.

1. Verify latest feed outcomes and stale signals:

```bash
curl -s "https://<staging-api-host>/feed-health?limit=20" | jq '{summary, latest_status_by_source}'
```

2. If a source shows `failed` or `stale`, inspect operational alerts scoped to that source:

```bash
curl -s "https://<staging-api-host>/operational-alerts?source=ioos_regional&limit=50" | jq '{summary, active_alerts, recent_history}'
```

3. For incident review, switch to resolved history for the same source/rule:

```bash
curl -s "https://<staging-api-host>/operational-alerts?status=resolved&source=ioos_regional&ruleType=source_stale&limit=50" | jq '{summary, recent_history}'
```

4. Correlate timestamps:

- Compare `feed-health` source status time windows with `operational-alerts` `detected_at` and `resolved_at`.
- Escalate if `feed-health` still reports stale/failed while matching alerts remain active.

## Rollback Toggle

If IOOS introduces unexpected load or alert noise in staging or production, set:

- `IOOS_ENABLED=false`

Then rerun `pnpm --filter api ingest:live` to return to NDBC + CRW only execution.
