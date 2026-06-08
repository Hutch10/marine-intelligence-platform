import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import { getProvenanceByRecordId } from "./provenance";
import type { ObservationHistoryItem } from "./observations";
import { buildFreshnessGovernanceSnapshot } from "../services/freshness-governance";
import { getLiveIngestionHealthSnapshot } from "./live-ingestion-reports";

export interface DataLineageRecord {
  recordId: string;
  recordType: "observation";
  provenanceId: string | null;
  sourceStationId: string;
  source: string;
  anchorObservedAt: string;
  seaTempObservedAt: string | null;
  waveHeightObservedAt: string | null;
  windObservedAt: string | null;
  pressureObservedAt: string | null;
  ingestionObservedAt: string | null;
  sourceTimestamp: string;
  sourceReference: string;
  metricsConcurrent: boolean;
  backfillIndicators: {
    seaSurfaceTemp: boolean;
    waveHeight: boolean;
  };
  freshnessClassification: "live" | "stale" | "withheld" | "unknown";
  syncStatus: string | null;
  provenancePayload: Record<string, unknown>;
}

export type DataLineageReadResult =
  | { source: "db"; lineage: DataLineageRecord }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" | "not_found" };

function toIso(ms: number | null): string | null {
  if (ms === null || !Number.isFinite(ms)) {
    return null;
  }

  return new Date(ms).toISOString();
}

function metricsConcurrent(item: ObservationHistoryItem): boolean {
  const timestamps = [
    item.seaSurfaceTempC !== null ? item.seaTempObservedAt : null,
    item.waveHeightM !== null ? item.waveHeightObservedAt : null,
    item.windSpeedMps !== null ? item.windObservedAt : null,
    item.pressureHpa !== null ? item.pressureObservedAt : null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (timestamps.length <= 1) {
    return true;
  }

  return timestamps.every((value) => value === timestamps[0]);
}

function classifyFreshness(source: string): DataLineageRecord["freshnessClassification"] {
  const snapshotResult = getLiveIngestionHealthSnapshot({ limit: 20, staleAfterMs: 6 * 60 * 60 * 1000 });
  if (snapshotResult.source !== "db") {
    return "unknown";
  }

  const governance = buildFreshnessGovernanceSnapshot(snapshotResult.snapshot);
  const match = governance.sources.find((item) => item.source === source);
  if (!match) {
    return "unknown";
  }

  if (!match.promoteAsLive) {
    return "withheld";
  }

  return match.isStale ? "stale" : "live";
}

async function readObservationById(adapter: AsyncDbAdapter, recordId: string): Promise<ObservationHistoryItem | null> {
  const rows = await adapter.execute(
    `SELECT station_id, observed_at, sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa,
            sea_temp_observed_at, wave_height_observed_at, wind_observed_at, pressure_observed_at,
            sea_surface_temp_backfilled, wave_height_backfilled, provenance_id, sync_status,
            source, source_reference, source_timestamp, created_at
     FROM observations
     WHERE id = ?
     LIMIT 1`,
    [recordId],
  ) as Array<Record<string, unknown>>;

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    stationId: String(row.station_id),
    observedAt: Number(row.observed_at),
    seaSurfaceTempC: row.sea_surface_temp_c === null ? null : Number(row.sea_surface_temp_c),
    waveHeightM: row.wave_height_m === null ? null : Number(row.wave_height_m),
    windSpeedMps: row.wind_speed_mps === null ? null : Number(row.wind_speed_mps),
    pressureHpa: row.pressure_hpa === null ? null : Number(row.pressure_hpa),
    seaTempObservedAt: row.sea_temp_observed_at === null || row.sea_temp_observed_at === undefined
      ? null
      : Number(row.sea_temp_observed_at),
    waveHeightObservedAt: row.wave_height_observed_at === null || row.wave_height_observed_at === undefined
      ? null
      : Number(row.wave_height_observed_at),
    windObservedAt: row.wind_observed_at === null || row.wind_observed_at === undefined
      ? null
      : Number(row.wind_observed_at),
    pressureObservedAt: row.pressure_observed_at === null || row.pressure_observed_at === undefined
      ? null
      : Number(row.pressure_observed_at),
    seaSurfaceTempBackfilled: Number(row.sea_surface_temp_backfilled) === 1,
    waveHeightBackfilled: Number(row.wave_height_backfilled) === 1,
    provenanceId: row.provenance_id ? String(row.provenance_id) : null,
    syncStatus: row.sync_status ? String(row.sync_status) : null,
    source: row.source ? String(row.source) : null,
    sourceReference: row.source_reference ? String(row.source_reference) : null,
    sourceTimestamp: String(row.source_timestamp),
    ingestedAt: row.created_at === null || row.created_at === undefined ? null : Number(row.created_at),
  };
}

export async function getDataLineageByRecordId(recordId: string): Promise<DataLineageReadResult> {
  const databasePath = resolveDatabasePath();
  const isTurso = !!process.env.TURSO_DATABASE_URL;

  if (!isTurso && !hasDatabasePath(databasePath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let adapter: AsyncDbAdapter;
  try {
    adapter = getAsyncAdapter(true);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    const observation = await readObservationById(adapter, recordId);
    if (!observation) {
      return { source: "unavailable", fallbackReason: "not_found" };
    }

    const provenance = await getProvenanceByRecordId(adapter, recordId);
    const freshnessClassification = classifyFreshness(observation.source ?? "noaa_ndbc");

    return {
      source: "db",
      lineage: {
        recordId,
        recordType: "observation",
        provenanceId: observation.provenanceId ?? provenance?.id ?? null,
        sourceStationId: observation.stationId,
        source: observation.source ?? "noaa_ndbc",
        anchorObservedAt: toIso(observation.observedAt) ?? observation.sourceTimestamp,
        seaTempObservedAt: toIso(observation.seaTempObservedAt),
        waveHeightObservedAt: toIso(observation.waveHeightObservedAt),
        windObservedAt: toIso(observation.windObservedAt),
        pressureObservedAt: toIso(observation.pressureObservedAt),
        ingestionObservedAt: toIso(observation.ingestedAt),
        sourceTimestamp: observation.sourceTimestamp,
        sourceReference: observation.sourceReference ?? "",
        metricsConcurrent: metricsConcurrent(observation),
        backfillIndicators: {
          seaSurfaceTemp: observation.seaSurfaceTempBackfilled,
          waveHeight: observation.waveHeightBackfilled,
        },
        freshnessClassification,
        syncStatus: observation.syncStatus,
        provenancePayload: provenance?.payload ?? {},
      },
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    adapter.close();
  }
}
