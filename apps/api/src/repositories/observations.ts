import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
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
  getAdapter?: typeof getAsyncAdapter;
}

export type LiveConditionsReadResult =
  | { source: "db"; conditions: LiveMarineCondition[] }
  | { source: "mock"; fallbackReason: LiveConditionsFallbackReason };

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

export async function ensureObservationsTable(adapter: AsyncDbAdapter) {
  await adapter.execute(
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
    )`
  );

  await adapter.execute(
    "CREATE INDEX IF NOT EXISTS idx_observations_station_observed_at ON observations (station_id, observed_at)"
  );
}

export async function observationExists(
  adapter: AsyncDbAdapter,
  stationId: string,
  observedAt: number,
  source?: string,
): Promise<boolean> {
  const sql = source
    ? "SELECT 1 AS found FROM observations WHERE station_id = ? AND observed_at = ? AND source = ? LIMIT 1"
    : "SELECT 1 AS found FROM observations WHERE station_id = ? AND observed_at = ? LIMIT 1";
  
  const rows = (source
    ? await adapter.execute(sql, [stationId, observedAt, source])
    : await adapter.execute(sql, [stationId, observedAt])) as Array<{ found?: number }>;

  return rows.length > 0;
}

export async function insertObservation(adapter: AsyncDbAdapter, input: ObservationInsertInput): Promise<string> {
  const normalizedSource = input.source.replace(/[^a-zA-Z0-9_-]/g, "_");
  const observationId = `OBS-${normalizedSource}-${input.stationId}-${input.observedAt}`;

  await adapter.execute(
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
    [
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
    ]
  );

  return observationId;
}

export async function readLatestLiveConditionsFromDb(
  adapter: AsyncDbAdapter,
  limit = 20,
): Promise<LiveMarineCondition[]> {
  const rows = await adapter.execute(
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
     ORDER BY o.observed_at DESC, o.id ASC
     LIMIT ?`,
    [limit]
  ) as ObservationRow[];

  return rows.map(toLiveCondition);
}

export async function readRecentObservationHistoryFromDb(
  adapter: AsyncDbAdapter,
  stationId: string,
  sinceObservedAt: number,
  limit = 120,
): Promise<ObservationHistoryItem[]> {
  try {
    const rows = await adapter.execute(
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
       ORDER BY observed_at DESC, id ASC
       LIMIT ?`,
      [stationId, sinceObservedAt, limit]
    ) as Array<ObservationRow & { source_timestamp: string }>;

    return rows.map(toObservationHistoryItem);
  } catch {
    return [];
  }
}

export async function readLatestObservationSnapshotsFromDb(
  adapter: AsyncDbAdapter,
  stationIds: string[],
  observedAtUpperBound = Number.POSITIVE_INFINITY,
): Promise<ObservationHistoryItem[]> {
  const normalizedStationIds = stationIds
    .map((stationId) => stationId.trim())
    .filter((stationId) => stationId.length > 0);

  if (normalizedStationIds.length === 0) {
    return [];
  }

  try {
    const placeholders = normalizedStationIds.map(() => "?").join(", ");
    const rows = await adapter.execute(
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
       ORDER BY o.observed_at DESC, o.id ASC`,
      [...normalizedStationIds, observedAtUpperBound]
    ) as Array<ObservationRow & { source_timestamp: string }>;

    return rows.map(toObservationHistoryItem);
  } catch {
    return [];
  }
}

export async function listLatestLiveConditions(
  dependencies: ObservationRepositoryDependencies = {},
): Promise<LiveConditionsReadResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const databasePath = resolvePath();

  const isTurso = !!process.env.TURSO_DATABASE_URL;
  if (!isTurso && !hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAdapter(true);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    return {
      source: "db",
      conditions: await readLatestLiveConditionsFromDb(adapter),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    adapter.close();
  }
}
