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

function toLiveCondition(row: ObservationRow): LiveMarineCondition {
  const observedAtMs = toTimestamp(row.observed_at);

  return {
    stationId: row.station_id,
    timestamp: new Date(observedAtMs).toISOString(),
    sstC: toNumber(row.sea_surface_temp_c),
    waveHeightM: toNumber(row.wave_height_m),
    windSpeedMps: toNumber(row.wind_speed_mps),
    pressureHpa: toNumber(row.pressure_hpa),
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
): boolean {
  const rows = toStatement(
    db,
    "SELECT 1 AS found FROM observations WHERE station_id = ? AND observed_at = ? LIMIT 1",
  ).all(stationId, observedAt) as Array<{ found?: number }>;

  return rows.length > 0;
}

export function insertObservation(db: SqliteDatabaseLike, input: ObservationInsertInput): string {
  const observationId = `OBS-${input.stationId}-${input.observedAt}`;

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
            o.pressure_hpa
     FROM observations o
     INNER JOIN (
       SELECT station_id, MAX(observed_at) AS observed_at
       FROM observations
       GROUP BY station_id
     ) latest
       ON latest.station_id = o.station_id
      AND latest.observed_at = o.observed_at
     ORDER BY o.observed_at DESC
     LIMIT ?`,
  ).all(limit) as ObservationRow[];

  return rows.map(toLiveCondition);
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
