import type { SqliteDatabaseLike, SqliteStatementLike } from "../db/client";

export interface StationMetricRecordInsertInput {
  stationId: string | null;
  regionKey: string;
  metricType: string;
  metricValue: number;
  metricUnit: string | null;
  source: string;
  observedAt: number;
  ingestionRunId: string;
  sourceTimestamp: string;
  sourceReference: string;
  createdAt: number;
}

export interface StationMetricHistoryItem {
  stationId: string | null;
  regionKey: string;
  metricType: string;
  metricValue: number;
  source: string;
  observedAt: number;
  sourceTimestamp: string;
  sourceReference: string;
}

function toStatement(db: SqliteDatabaseLike, sql: string): SqliteStatementLike {
  return db.prepare(sql);
}

function runStatement(statement: SqliteStatementLike, ...params: unknown[]) {
  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

export function ensureStationMetricsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS station_metrics (
        id TEXT PRIMARY KEY,
        station_id TEXT,
        region_key TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        metric_value REAL,
        metric_unit TEXT,
        source TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        ingestion_run_id TEXT NOT NULL,
        source_timestamp TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_station_metrics_source_identity ON station_metrics (source, station_id, region_key, metric_type, observed_at)",
    ),
  );
}

export function stationMetricExists(
  db: SqliteDatabaseLike,
  input: {
    source: string;
    stationId: string | null;
    regionKey: string;
    metricType: string;
    observedAt: number;
  },
): boolean {
  const rows = toStatement(
    db,
    `SELECT 1 AS found
     FROM station_metrics
     WHERE source = ?
       AND observed_at = ?
       AND region_key = ?
       AND metric_type = ?
       AND ((station_id = ?) OR (station_id IS NULL AND ? IS NULL))
     LIMIT 1`,
  ).all(
    input.source,
    input.observedAt,
    input.regionKey,
    input.metricType,
    input.stationId,
    input.stationId,
  ) as Array<{ found?: number }>;

  return rows.length > 0;
}

export function insertStationMetricRecord(db: SqliteDatabaseLike, input: StationMetricRecordInsertInput): string {
  const id = `STM-${input.metricType}-${input.regionKey}-${input.observedAt}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  runStatement(
    toStatement(
      db,
      `INSERT INTO station_metrics (
        id,
        station_id,
        region_key,
        metric_type,
        metric_value,
        metric_unit,
        source,
        observed_at,
        ingestion_run_id,
        source_timestamp,
        source_reference,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    id,
    input.stationId,
    input.regionKey,
    input.metricType,
    input.metricValue,
    input.metricUnit,
    input.source,
    input.observedAt,
    input.ingestionRunId,
    input.sourceTimestamp,
    input.sourceReference,
    input.createdAt,
  );

  return id;
}

export function readRecentStationMetricHistoryFromDb(
  db: SqliteDatabaseLike,
  input: {
    stationId: string;
    metricType: string;
    sinceObservedAt: number;
    limit?: number;
    sources?: string[];
  },
): StationMetricHistoryItem[] {
  const limit = input.limit ?? 180;
  const sourceFilters = (input.sources ?? []).map((source) => source.trim()).filter(Boolean);
  const sourcePredicate = sourceFilters.length > 0
    ? ` AND source IN (${sourceFilters.map(() => "?").join(", ")})`
    : "";

  const rows = toStatement(
    db,
    `SELECT station_id,
            region_key,
            metric_type,
            metric_value,
            source,
            observed_at,
            source_timestamp,
            source_reference
     FROM station_metrics
     WHERE station_id = ?
       AND metric_type = ?
       AND observed_at >= ?
       ${sourcePredicate}
     ORDER BY observed_at DESC
     LIMIT ?`,
  ).all(
    input.stationId,
    input.metricType,
    input.sinceObservedAt,
    ...sourceFilters,
    limit,
  ) as Array<{
    station_id: string | null;
    region_key: string;
    metric_type: string;
    metric_value: number | string;
    source: string;
    observed_at: number | string;
    source_timestamp: string;
    source_reference: string;
  }>;

  return rows
    .map((row) => {
      const metricValue = typeof row.metric_value === "number" ? row.metric_value : Number(row.metric_value);
      const observedAt = typeof row.observed_at === "number" ? row.observed_at : Number(row.observed_at);

      if (!Number.isFinite(metricValue) || !Number.isFinite(observedAt)) {
        return null;
      }

      return {
        stationId: row.station_id,
        regionKey: row.region_key,
        metricType: row.metric_type,
        metricValue,
        source: row.source,
        observedAt,
        sourceTimestamp: row.source_timestamp,
        sourceReference: row.source_reference,
      } satisfies StationMetricHistoryItem;
    })
    .filter((item): item is StationMetricHistoryItem => item !== null);
}
