import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import type { LiveConditionsFallbackReason } from "../types";
import type { LiveMarineCondition } from "@marine/shared";
import {
  classifyNdbcFreshness,
  verificationStatusFromFreshness,
} from "../services/environmental-harness/freshness-policy";
import { buildSignalProvenance } from "../services/environmental-harness/provenance";
import { annotateLiveConditionTrust } from "../services/environmental-harness/lineage-presentation";

interface ObservationRow {
  station_id: string;
  observed_at: number | string;
  sea_surface_temp_c: number | string | null;
  wave_height_m: number | string | null;
  wind_speed_mps: number | string | null;
  pressure_hpa: number | string | null;
  sea_temp_observed_at: number | string | null;
  wave_height_observed_at: number | string | null;
  wind_observed_at: number | string | null;
  pressure_observed_at: number | string | null;
  sea_surface_temp_backfilled: number | string | null;
  wave_height_backfilled: number | string | null;
  provenance_id: string | null;
  sync_status: string | null;
  source: string | null;
  source_reference: string | null;
  created_at: number | string | null;
  signal_id?: string | null;
  root_event_id?: string | null;
  source_ingestion_event_id?: string | null;
  verification_event_id?: string | null;
  provenance_hash?: string | null;
}

export interface EnvironmentalSignalLineageInsert {
  signalId?: string | null;
  rootEventId?: string | null;
  sourceIngestionEventId?: string | null;
  verificationEventId?: string | null;
  provenanceHash?: string | null;
}

export interface ObservationInsertInput extends EnvironmentalSignalLineageInsert {
  stationId: string;
  source: string;
  observedAt: number;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
  seaTempObservedAt?: number | null;
  waveHeightObservedAt?: number | null;
  windObservedAt?: number | null;
  pressureObservedAt?: number | null;
  seaSurfaceTempBackfilled?: boolean;
  waveHeightBackfilled?: boolean;
  provenanceId?: string | null;
  syncStatus?: "synced" | "pending_turso" | "reconciled";
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
  seaTempObservedAt: number | null;
  waveHeightObservedAt: number | null;
  windObservedAt: number | null;
  pressureObservedAt: number | null;
  seaSurfaceTempBackfilled: boolean;
  waveHeightBackfilled: boolean;
  provenanceId: string | null;
  syncStatus: string | null;
  source: string | null;
  sourceReference: string | null;
  sourceTimestamp: string;
  ingestedAt: number | null;
}

function toIsoTimestamp(value: number | string | null | undefined): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const ms = toTimestamp(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function toBooleanFlag(value: number | string | null | undefined): boolean {
  if (value === null || value === undefined) {
    return false;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  const normalized = String(value).trim().toLowerCase();
  return normalized === "1" || normalized === "true";
}

function metricsConcurrentFromRow(row: ObservationRow): boolean {
  const timestamps = [
    row.sea_surface_temp_c !== null ? row.sea_temp_observed_at : null,
    row.wave_height_m !== null ? row.wave_height_observed_at : null,
    row.wind_speed_mps !== null ? row.wind_observed_at : null,
    row.pressure_hpa !== null ? row.pressure_observed_at : null,
  ]
    .map((value) => (value === null || value === undefined ? null : toTimestamp(value)))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (timestamps.length <= 1) {
    return true;
  }

  return timestamps.every((value) => value === timestamps[0]);
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
    seaTempObservedAt: row.sea_temp_observed_at === null || row.sea_temp_observed_at === undefined
      ? null
      : toTimestamp(row.sea_temp_observed_at),
    waveHeightObservedAt: row.wave_height_observed_at === null || row.wave_height_observed_at === undefined
      ? null
      : toTimestamp(row.wave_height_observed_at),
    windObservedAt: row.wind_observed_at === null || row.wind_observed_at === undefined
      ? null
      : toTimestamp(row.wind_observed_at),
    pressureObservedAt: row.pressure_observed_at === null || row.pressure_observed_at === undefined
      ? null
      : toTimestamp(row.pressure_observed_at),
    seaSurfaceTempBackfilled: toBooleanFlag(row.sea_surface_temp_backfilled),
    waveHeightBackfilled: toBooleanFlag(row.wave_height_backfilled),
    provenanceId: row.provenance_id ?? null,
    syncStatus: row.sync_status ?? null,
    source: row.source,
    sourceReference: row.source_reference,
    sourceTimestamp: row.source_timestamp,
    ingestedAt: row.created_at === null || row.created_at === undefined ? null : toTimestamp(row.created_at),
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

function toLiveCondition(row: ObservationRow, nowMs = Date.now()): LiveMarineCondition {
  const observedAtMs = toTimestamp(row.observed_at);
  const createdAtMs = row.created_at !== null ? toTimestamp(row.created_at) : null;
  const source = row.source ?? "noaa_ndbc";
  const observedAtIso = new Date(observedAtMs).toISOString();
  const ingestedAtIso = createdAtMs !== null ? new Date(createdAtMs).toISOString() : undefined;
  const freshnessStatus = classifyNdbcFreshness(observedAtMs, nowMs, source);
  const verificationStatus = verificationStatusFromFreshness(freshnessStatus);
  const provenance = buildSignalProvenance({
    source,
    sourceFeed: row.source_reference ?? null,
    productDate: observedAtIso,
    ingestedAt: ingestedAtIso ?? null,
    provenanceId: row.provenance_id ?? null,
    stationId: row.station_id,
    observedAt: observedAtIso,
  });

  return annotateLiveConditionTrust({
    stationId: row.station_id,
    timestamp: observedAtIso,
    sstC: toNumber(row.sea_surface_temp_c),
    waveHeightM: toNumber(row.wave_height_m),
    windSpeedMps: toNumber(row.wind_speed_mps),
    pressureHpa: toNumber(row.pressure_hpa),
    seaTempObservedAt: toIsoTimestamp(row.sea_temp_observed_at),
    waveHeightObservedAt: toIsoTimestamp(row.wave_height_observed_at),
    windObservedAt: toIsoTimestamp(row.wind_observed_at),
    pressureObservedAt: toIsoTimestamp(row.pressure_observed_at),
    metricsConcurrent: metricsConcurrentFromRow(row),
    backfillIndicators: {
      seaSurfaceTemp: toBooleanFlag(row.sea_surface_temp_backfilled),
      waveHeight: toBooleanFlag(row.wave_height_backfilled),
    },
    provenanceId: row.provenance_id ?? null,
    source,
    sourceFeed: row.source_reference ?? undefined,
    ingestedAt: ingestedAtIso,
    freshnessClassification: freshnessStatus.classification,
    freshnessStatus,
    verificationStatus,
    provenance,
    signalId: row.signal_id ?? null,
    rootEventId: row.root_event_id ?? null,
    sourceIngestionEventId: row.source_ingestion_event_id ?? null,
    verificationEventId: row.verification_event_id ?? null,
    provenanceHash: row.provenance_hash ?? provenance.contentHash ?? null,
  });
}

async function ensureObservationLineageColumns(adapter: AsyncDbAdapter) {
  const migrations = [
    "ALTER TABLE observations ADD COLUMN signal_id TEXT",
    "ALTER TABLE observations ADD COLUMN root_event_id TEXT",
    "ALTER TABLE observations ADD COLUMN source_ingestion_event_id TEXT",
    "ALTER TABLE observations ADD COLUMN verification_event_id TEXT",
    "ALTER TABLE observations ADD COLUMN provenance_hash TEXT",
  ];

  for (const sql of migrations) {
    try {
      await adapter.execute(sql);
    } catch {
      // Column already exists.
    }
  }
}

async function ensureObservationTemporalColumns(adapter: AsyncDbAdapter) {
  const migrations = [
    "ALTER TABLE observations ADD COLUMN sea_temp_observed_at INTEGER",
    "ALTER TABLE observations ADD COLUMN wave_height_observed_at INTEGER",
    "ALTER TABLE observations ADD COLUMN wind_observed_at INTEGER",
    "ALTER TABLE observations ADD COLUMN pressure_observed_at INTEGER",
    "ALTER TABLE observations ADD COLUMN sea_surface_temp_backfilled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE observations ADD COLUMN wave_height_backfilled INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE observations ADD COLUMN provenance_id TEXT",
    "ALTER TABLE observations ADD COLUMN sync_status TEXT NOT NULL DEFAULT 'synced'",
  ];

  for (const sql of migrations) {
    try {
      await adapter.execute(sql);
    } catch {
      // Column already exists.
    }
  }
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

  await ensureObservationTemporalColumns(adapter);
  await ensureObservationLineageColumns(adapter);
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

export function buildObservationId(input: Pick<ObservationInsertInput, "source" | "stationId" | "observedAt">): string {
  const normalizedSource = input.source.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `OBS-${normalizedSource}-${input.stationId}-${input.observedAt}`;
}

export async function insertObservation(adapter: AsyncDbAdapter, input: ObservationInsertInput): Promise<string> {
  const observationId = buildObservationId(input);

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
      sea_temp_observed_at,
      wave_height_observed_at,
      wind_observed_at,
      pressure_observed_at,
      sea_surface_temp_backfilled,
      wave_height_backfilled,
      provenance_id,
      sync_status,
      ingestion_run_id,
      source_timestamp,
      source_reference,
      raw_line,
      created_at,
      signal_id,
      root_event_id,
      source_ingestion_event_id,
      verification_event_id,
      provenance_hash
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      observationId,
      input.stationId,
      input.source,
      input.observedAt,
      input.seaSurfaceTempC,
      input.waveHeightM,
      input.windSpeedMps,
      input.pressureHpa,
      input.seaTempObservedAt ?? null,
      input.waveHeightObservedAt ?? null,
      input.windObservedAt ?? null,
      input.pressureObservedAt ?? null,
      input.seaSurfaceTempBackfilled ? 1 : 0,
      input.waveHeightBackfilled ? 1 : 0,
      input.provenanceId ?? null,
      input.syncStatus ?? "synced",
      input.ingestionRunId,
      input.sourceTimestamp,
      input.sourceReference,
      input.rawLine,
      input.createdAt,
      input.signalId ?? null,
      input.rootEventId ?? null,
      input.sourceIngestionEventId ?? null,
      input.verificationEventId ?? null,
      input.provenanceHash ?? null,
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
            o.sea_temp_observed_at,
            o.wave_height_observed_at,
            o.wind_observed_at,
            o.pressure_observed_at,
            o.sea_surface_temp_backfilled,
            o.wave_height_backfilled,
            o.provenance_id,
            o.sync_status,
            o.source,
            o.source_reference,
            o.created_at,
            o.signal_id,
            o.root_event_id,
            o.source_ingestion_event_id,
            o.verification_event_id,
            o.provenance_hash
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
              sea_temp_observed_at,
              wave_height_observed_at,
              wind_observed_at,
              pressure_observed_at,
              sea_surface_temp_backfilled,
              wave_height_backfilled,
              provenance_id,
              sync_status,
              source,
              source_reference,
              source_timestamp,
              created_at
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
              o.sea_temp_observed_at,
              o.wave_height_observed_at,
              o.wind_observed_at,
              o.pressure_observed_at,
              o.sea_surface_temp_backfilled,
              o.wave_height_backfilled,
              o.provenance_id,
              o.sync_status,
              o.source,
              o.source_reference,
              o.source_timestamp,
              o.created_at
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
