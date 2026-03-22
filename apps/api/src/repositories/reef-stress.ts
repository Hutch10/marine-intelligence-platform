import {
  hasDatabasePath,
  openReadOnlyDatabase,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
  resolveDatabasePath,
} from "../db/client";
import type { ReefAlertsFallbackReason } from "../types";
import type { ReefStressWatchItem } from "@marine/shared";

interface StationMetricRow {
  metric_type: string;
  metric_value: number | string | null;
}

interface DerivedSignalRow {
  station_id: string | null;
  region_key: string;
  signal_label: string | null;
  observed_at: number | string;
}

export interface StationMetricInsertInput {
  stationId: string | null;
  regionKey: string;
  metricType: "sst_anomaly_c" | "hotspot_c" | "dhw";
  metricValue: number;
  metricUnit: "celsius" | "week";
  source: string;
  observedAt: number;
  ingestionRunId: string;
  sourceTimestamp: string;
  sourceReference: string;
  createdAt: number;
}

export interface DerivedSignalInsertInput {
  stationId: string | null;
  regionKey: string;
  signalType: "reef_bleaching_alert_level";
  signalValue: number | null;
  signalLabel: string | null;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  observedAt: number;
  ingestionRunId: string;
  sourceTimestamp: string;
  sourceReference: string;
  createdAt: number;
}

interface ReefStressRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
}

export type ReefStressReadResult =
  | { source: "db"; alerts: ReefStressWatchItem[] }
  | { source: "mock"; fallbackReason: ReefAlertsFallbackReason };

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

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toTimestamp(value: number | string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }

  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return Date.now();
}

function signalKey(stationId: string | null, regionKey: string): string {
  return `${stationId ?? "region"}:${regionKey}`;
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
}

export function ensureDerivedSignalsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS derived_signals (
        id TEXT PRIMARY KEY,
        station_id TEXT,
        region_key TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        signal_value REAL,
        signal_label TEXT,
        severity TEXT,
        source TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        ingestion_run_id TEXT NOT NULL,
        source_timestamp TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
  );
}

export function reefStressSnapshotExists(
  db: SqliteDatabaseLike,
  stationId: string | null,
  regionKey: string,
  observedAt: number,
  source: string,
): boolean {
  const rows = toStatement(
    db,
    `SELECT 1 AS found
     FROM derived_signals
     WHERE signal_type = 'reef_bleaching_alert_level'
       AND source = ?
       AND observed_at = ?
       AND region_key = ?
       AND ((station_id = ?) OR (station_id IS NULL AND ? IS NULL))
     LIMIT 1`,
  ).all(source, observedAt, regionKey, stationId, stationId) as Array<{ found?: number }>;

  return rows.length > 0;
}

export function insertStationMetric(db: SqliteDatabaseLike, input: StationMetricInsertInput): string {
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

export function insertDerivedSignal(db: SqliteDatabaseLike, input: DerivedSignalInsertInput): string {
  const id = `DRS-${input.regionKey}-${input.observedAt}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  runStatement(
    toStatement(
      db,
      `INSERT INTO derived_signals (
        id,
        station_id,
        region_key,
        signal_type,
        signal_value,
        signal_label,
        severity,
        source,
        observed_at,
        ingestion_run_id,
        source_timestamp,
        source_reference,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    id,
    input.stationId,
    input.regionKey,
    input.signalType,
    input.signalValue,
    input.signalLabel,
    input.severity,
    input.source,
    input.observedAt,
    input.ingestionRunId,
    input.sourceTimestamp,
    input.sourceReference,
    input.createdAt,
  );

  return id;
}

function readMetricsForSnapshot(
  db: SqliteDatabaseLike,
  source: string,
  regionKey: string,
  stationId: string | null,
  observedAt: number,
): Record<string, number | null> {
  const rows = toStatement(
    db,
    `SELECT metric_type, metric_value
     FROM station_metrics
     WHERE source = ?
       AND observed_at = ?
       AND region_key = ?
       AND ((station_id = ?) OR (station_id IS NULL AND ? IS NULL))`,
  ).all(source, observedAt, regionKey, stationId, stationId) as StationMetricRow[];

  const metrics: Record<string, number | null> = {};

  for (const row of rows) {
    metrics[row.metric_type] = toNumber(row.metric_value);
  }

  return metrics;
}

export function readLatestReefStressFromDb(
  db: SqliteDatabaseLike,
  limit = 20,
): ReefStressWatchItem[] {
  const rows = toStatement(
    db,
    `SELECT station_id, region_key, signal_label, observed_at
     FROM derived_signals
     WHERE source = 'noaa_coral_reef_watch'
       AND signal_type = 'reef_bleaching_alert_level'
     ORDER BY observed_at DESC
     LIMIT 200`,
  ).all() as DerivedSignalRow[];

  const latestByKey = new Map<string, DerivedSignalRow>();

  for (const row of rows) {
    const key = signalKey(row.station_id, row.region_key);
    if (!latestByKey.has(key)) {
      latestByKey.set(key, row);
    }
  }

  const snapshots = [...latestByKey.values()].slice(0, limit);

  return snapshots.map((row) => {
    const observedAt = toTimestamp(row.observed_at);
    const metrics = readMetricsForSnapshot(
      db,
      "noaa_coral_reef_watch",
      row.region_key,
      row.station_id,
      observedAt,
    );

    return {
      region: row.region_key,
      stationId: row.station_id,
      timestamp: new Date(observedAt).toISOString(),
      sstAnomalyC: metrics.sst_anomaly_c ?? null,
      hotSpotC: metrics.hotspot_c ?? null,
      dhw: metrics.dhw ?? null,
      stressLevel: row.signal_label,
      source: "noaa_coral_reef_watch",
      outputClass: "derived" as const,
    };
  });
}

export function listLatestReefStress(
  dependencies: ReefStressRepositoryDependencies = {},
): ReefStressReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    return {
      source: "db",
      alerts: readLatestReefStressFromDb(db),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
