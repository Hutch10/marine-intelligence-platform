import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import { buildFreshnessGovernanceSnapshot } from "./freshness-governance";
import { getLiveIngestionHealthSnapshot } from "../repositories/live-ingestion-reports";

export interface ScientificExportRow {
  observationId: string;
  provenanceId: string | null;
  stationId: string;
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
  seaSurfaceTempBackfilled: boolean;
  waveHeightBackfilled: boolean;
  freshnessClassification: string;
  syncStatus: string;
  confidenceAdjustment: string;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
}

function toIso(value: number | null): string | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  return new Date(value).toISOString();
}

function metricsConcurrent(row: Record<string, unknown>): boolean {
  const timestamps = [
    row.sea_surface_temp_c !== null ? Number(row.sea_temp_observed_at) : null,
    row.wave_height_m !== null ? Number(row.wave_height_observed_at) : null,
    row.wind_speed_mps !== null ? Number(row.wind_observed_at) : null,
    row.pressure_hpa !== null ? Number(row.pressure_observed_at) : null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (timestamps.length <= 1) {
    return true;
  }

  return timestamps.every((value) => value === timestamps[0]);
}

function classifyFreshness(source: string): string {
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

function confidenceAdjustment(row: Record<string, unknown>): string {
  const backfilled = Number(row.sea_surface_temp_backfilled) === 1 || Number(row.wave_height_backfilled) === 1;
  const concurrent = metricsConcurrent(row);

  if (backfilled && !concurrent) {
    return "downrank_non_concurrent_backfill";
  }

  if (!concurrent) {
    return "downrank_non_concurrent_metrics";
  }

  return "none";
}

export async function listScientificObservationExports(
  adapter: AsyncDbAdapter,
  options: { stationId?: string; limit?: number } = {},
): Promise<ScientificExportRow[]> {
  const limit = Math.min(Math.max(options.limit ?? 200, 1), 2000);
  const params: unknown[] = [];
  let whereClause = "WHERE 1 = 1";

  if (options.stationId) {
    whereClause += " AND station_id = ?";
    params.push(options.stationId);
  }

  params.push(limit);

  const rows = await adapter.execute(
    `SELECT id, provenance_id, station_id, source, observed_at,
            sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa,
            sea_temp_observed_at, wave_height_observed_at, wind_observed_at, pressure_observed_at,
            sea_surface_temp_backfilled, wave_height_backfilled, sync_status,
            source_timestamp, source_reference, created_at
     FROM observations
     ${whereClause}
     ORDER BY observed_at DESC
     LIMIT ?`,
    params,
  ) as Array<Record<string, unknown>>;

  return rows.map((row) => {
    const source = String(row.source ?? "noaa_ndbc");
    return {
      observationId: String(row.id),
      provenanceId: row.provenance_id ? String(row.provenance_id) : null,
      stationId: String(row.station_id),
      source,
      anchorObservedAt: toIso(Number(row.observed_at)) ?? String(row.source_timestamp),
      seaTempObservedAt: toIso(row.sea_temp_observed_at === null ? null : Number(row.sea_temp_observed_at)),
      waveHeightObservedAt: toIso(row.wave_height_observed_at === null ? null : Number(row.wave_height_observed_at)),
      windObservedAt: toIso(row.wind_observed_at === null ? null : Number(row.wind_observed_at)),
      pressureObservedAt: toIso(row.pressure_observed_at === null ? null : Number(row.pressure_observed_at)),
      ingestionObservedAt: toIso(row.created_at === null ? null : Number(row.created_at)),
      sourceTimestamp: String(row.source_timestamp),
      sourceReference: String(row.source_reference),
      metricsConcurrent: metricsConcurrent(row),
      seaSurfaceTempBackfilled: Number(row.sea_surface_temp_backfilled) === 1,
      waveHeightBackfilled: Number(row.wave_height_backfilled) === 1,
      freshnessClassification: classifyFreshness(source),
      syncStatus: String(row.sync_status ?? "synced"),
      confidenceAdjustment: confidenceAdjustment(row),
      seaSurfaceTempC: row.sea_surface_temp_c === null ? null : Number(row.sea_surface_temp_c),
      waveHeightM: row.wave_height_m === null ? null : Number(row.wave_height_m),
      windSpeedMps: row.wind_speed_mps === null ? null : Number(row.wind_speed_mps),
      pressureHpa: row.pressure_hpa === null ? null : Number(row.pressure_hpa),
    };
  });
}

export async function buildScientificExport(
  options: { stationId?: string; limit?: number } = {},
): Promise<{ source: "db" | "unavailable"; rows: ScientificExportRow[] }> {
  const databasePath = resolveDatabasePath();
  const isTurso = !!process.env.TURSO_DATABASE_URL;

  if (!isTurso && !hasDatabasePath(databasePath)) {
    return { source: "unavailable", rows: [] };
  }

  let adapter: AsyncDbAdapter;
  try {
    adapter = getAsyncAdapter(true);
  } catch {
    return { source: "unavailable", rows: [] };
  }

  try {
    const rows = await listScientificObservationExports(adapter, options);
    return { source: "db", rows };
  } catch {
    return { source: "unavailable", rows: [] };
  } finally {
    adapter.close();
  }
}

export function scientificExportToCsv(rows: ScientificExportRow[]): string {
  if (rows.length === 0) {
    return "";
  }

  const keys = Object.keys(rows[0]!) as Array<keyof ScientificExportRow>;
  const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, "\"\"")}"`;

  return [
    keys.join(","),
    ...rows.map((row) => keys.map((key) => escape(row[key])).join(",")),
  ].join("\n");
}
