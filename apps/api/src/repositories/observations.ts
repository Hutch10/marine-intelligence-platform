import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";
import type { LiveConditionsFallbackReason } from "../types";
import type { LiveMarineCondition } from "@marine/shared";

interface ObservationRow {
  station_id: string;
  observed_at: number | string;
  sea_surface_temp_c: number | string | null;
  wave_height_m: number | string | null;
  wind_speed_mps: number | string | null;
  pressure_hpa: number | string | null;
  source: string | null;
  source_reference: string | null;
  created_at: number | string | null;
}

export interface ObservationInsertInput {
  stationId: string;
  source: string;
  observedAt: number;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
  ingestionRunId: string;
  sourceTimestamp: string;
  sourceReference: string;
  rawLine: string;
  createdAt: number;
}

export interface ObservationHistoryItem {
  stationId: string;
  observedAt: number;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
  source: string | null;
  sourceReference: string | null;
  sourceTimestamp: string;
}

function toObservationHistoryItem(
  row: ObservationRow & { source_timestamp: string },
): ObservationHistoryItem {
  return {
    stationId: row.station_id,
    observedAt: toTimestamp(row.observed_at),
    seaSurfaceTempC: toNumber(row.sea_surface_temp_c),
    waveHeightM: toNumber(row.wave_height_m),
    windSpeedMps: toNumber(row.wind_speed_mps),
    pressureHpa: toNumber(row.pressure_hpa),
    source: row.source,
    sourceReference: row.source_reference,
    sourceTimestamp: row.source_timestamp,
  };
}

interface ObservationRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
}

export type LiveConditionsReadResult =
  | { source: "db"; conditions: LiveMarineCondition[] }
  | { source: "mock"; fallbackReason: LiveConditionsFallbackReason };

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

function shouldExcludeSyntheticBaselineData(): boolean {
  return process.env.NODE_ENV === "production"
    && String(process.env.ALLOW_SYNTHETIC_BASELINE_IN_PRODUCTION ?? "false").trim().toLowerCase() !== "true";
}

function syntheticObservationPredicate(column = "source"): string {
  if (!shouldExcludeSyntheticBaselineData()) {
    return "";
  }

  return ` AND ${column} NOT LIKE 'synthetic%'`;
}

function toLiveCondition(row: ObservationRow): LiveMarineCondition {
  const observedAtMs = toTimestamp(row.observed_at);
  const createdAtMs = row.created_at !== null ? toTimestamp(row.created_at) : null;

  return {
    stationId: row.station_id,
    timestamp: new Date(observedAtMs).toISOString(),
    sstC: toNumber(row.sea_surface_temp_c),
    waveHeightM: toNumber(row.wave_height_m),
    windSpeedMps: toNumber(row.wind_speed_mps),
    pressureHpa: toNumber(row.pressure_hpa),
    source: row.source ?? undefined,
    sourceFeed: row.source_reference ?? undefined,
    ingestedAt: createdAtMs !== null ? new Date(createdAtMs).toISOString() : undefined,
  };
}

export function ensureObservationsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS observations (
        id TEXT PRIMARY KEY,
        station_id TEXT NOT NULL,
        source TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        sea_surface_temp_c REAL,
        wave_height_m REAL,
        wind_speed_mps REAL,
        pressure_hpa REAL,
        ingestion_run_id TEXT NOT NULL,
        source_timestamp TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        raw_line TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_observations_station_observed_at ON observations (station_id, observed_at)",
    ),
  );
}

export function observationExists(
  db: SqliteDatabaseLike,
  stationId: string,
  observedAt: number,
  source?: string,
): boolean {
  const sql = source
    ? "SELECT 1 AS found FROM observations WHERE station_id = ? AND observed_at = ? AND source = ? LIMIT 1"
    : "SELECT 1 AS found FROM observations WHERE station_id = ? AND observed_at = ? LIMIT 1";
  const rows = (source
    ? toStatement(db, sql).all(stationId, observedAt, source)
    : toStatement(db, sql).all(stationId, observedAt)) as Array<{ found?: number }>;

  return rows.length > 0;
}

export function insertObservation(db: SqliteDatabaseLike, input: ObservationInsertInput): string {
  const normalizedSource = input.source.replace(/[^a-zA-Z0-9_-]/g, "_");
  const observationId = `OBS-${normalizedSource}-${input.stationId}-${input.observedAt}`;

  runStatement(
    toStatement(
      db,
      `INSERT INTO observations (
        id,
        station_id,
        source,
        observed_at,
        sea_surface_temp_c,
        wave_height_m,
        wind_speed_mps,
        pressure_hpa,
        ingestion_run_id,
        source_timestamp,
        source_reference,
        raw_line,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    observationId,
    input.stationId,
    input.source,
    input.observedAt,
    input.seaSurfaceTempC,
    input.waveHeightM,
    input.windSpeedMps,
    input.pressureHpa,
    input.ingestionRunId,
    input.sourceTimestamp,
    input.sourceReference,
    input.rawLine,
    input.createdAt,
  );

  return observationId;
}

export function readLatestLiveConditionsFromDb(
  db: SqliteDatabaseLike,
  limit = 20,
): LiveMarineCondition[] {
  const rows = toStatement(
    db,
    `SELECT o.station_id,
            o.observed_at,
            o.sea_surface_temp_c,
            o.wave_height_m,
            o.wind_speed_mps,
            o.pressure_hpa,
            o.source,
            o.source_reference,
            o.created_at
     FROM observations o
     INNER JOIN (
       SELECT station_id, MAX(observed_at) AS observed_at
       FROM observations
       WHERE 1 = 1
         ${syntheticObservationPredicate()}
       GROUP BY station_id
     ) latest
       ON latest.station_id = o.station_id
      AND latest.observed_at = o.observed_at
     ORDER BY o.observed_at DESC
     LIMIT ?`,
  ).all(limit) as ObservationRow[];

  return rows.map(toLiveCondition);
}

export function readRecentObservationHistoryFromDb(
  db: SqliteDatabaseLike,
  stationId: string,
  sinceObservedAt: number,
  limit = 120,
): ObservationHistoryItem[] {
  try {
    const rows = toStatement(
      db,
      `SELECT station_id,
              observed_at,
              sea_surface_temp_c,
              wave_height_m,
              wind_speed_mps,
              pressure_hpa,
              source,
              source_reference,
              source_timestamp
       FROM observations
       WHERE station_id = ?
         AND observed_at >= ?
         ${syntheticObservationPredicate()}
       ORDER BY observed_at DESC
       LIMIT ?`,
    ).all(stationId, sinceObservedAt, limit) as Array<ObservationRow & { source_timestamp: string }>;

    return rows.map(toObservationHistoryItem);
  } catch {
    return [];
  }
}

export function readLatestObservationSnapshotsFromDb(
  db: SqliteDatabaseLike,
  stationIds: string[],
  observedAtUpperBound = Number.POSITIVE_INFINITY,
): ObservationHistoryItem[] {
  const normalizedStationIds = stationIds
    .map((stationId) => stationId.trim())
    .filter((stationId) => stationId.length > 0);

  if (normalizedStationIds.length === 0) {
    return [];
  }

  try {
    const placeholders = normalizedStationIds.map(() => "?").join(", ");
    const rows = toStatement(
      db,
      `SELECT o.station_id,
              o.observed_at,
              o.sea_surface_temp_c,
              o.wave_height_m,
              o.wind_speed_mps,
              o.pressure_hpa,
              o.source,
              o.source_reference,
              o.source_timestamp
       FROM observations o
       INNER JOIN (
         SELECT station_id, MAX(observed_at) AS observed_at
         FROM observations
         WHERE station_id IN (${placeholders})
           AND observed_at <= ?
           ${syntheticObservationPredicate()}
         GROUP BY station_id
       ) latest
         ON latest.station_id = o.station_id
        AND latest.observed_at = o.observed_at
       ORDER BY o.observed_at DESC`,
    ).all(...normalizedStationIds, observedAtUpperBound) as Array<ObservationRow & { source_timestamp: string }>;

    return rows.map(toObservationHistoryItem);
  } catch {
    return [];
  }
}

export function listLatestLiveConditions(
  dependencies: ObservationRepositoryDependencies = {},
): LiveConditionsReadResult {
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
      conditions: readLatestLiveConditionsFromDb(db),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
