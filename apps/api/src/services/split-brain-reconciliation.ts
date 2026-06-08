import {
  createLocalAdapter,
  createTursoAdapter,
  getAsyncAdapter,
  type AsyncDbAdapter,
} from "../db/async-client";
import {
  buildObservationId,
  ensureObservationsTable,
  type ObservationInsertInput,
} from "../repositories/observations";

export type ObservationSyncStatus = "synced" | "pending_turso" | "reconciled";

export async function writeObservationWithReplication(
  primaryAdapter: AsyncDbAdapter,
  input: ObservationInsertInput,
  executeInsert: (adapter: AsyncDbAdapter, payload: ObservationInsertInput) => Promise<string>,
): Promise<{ observationId: string; syncStatus: ObservationSyncStatus }> {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  const tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();
  const isLocalPrimary = (primaryAdapter.resourceId ?? "").startsWith("sqlite:");

  let syncStatus: ObservationSyncStatus = "synced";

  if (tursoUrl && isLocalPrimary) {
    try {
      const tursoAdapter = createTursoAdapter(tursoUrl, tursoToken);
      try {
        await ensureObservationsTable(tursoAdapter);
        await executeInsert(tursoAdapter, { ...input, syncStatus: "synced" });
      } finally {
        tursoAdapter.close();
      }
    } catch {
      syncStatus = "pending_turso";
    }
  }

  const observationId = await executeInsert(primaryAdapter, { ...input, syncStatus });
  return { observationId, syncStatus };
}

export async function listPendingTursoObservations(
  adapter: AsyncDbAdapter,
  limit = 100,
): Promise<Array<{ id: string }>> {
  const rows = await adapter.execute(
    `SELECT id
     FROM observations
     WHERE sync_status = 'pending_turso'
     ORDER BY created_at ASC
     LIMIT ?`,
    [limit],
  ) as Array<{ id: string }>;

  return rows;
}

export async function reconcilePendingObservationsToTurso(
  dependencies: {
    getLocalAdapter?: () => AsyncDbAdapter;
    getTursoAdapter?: () => AsyncDbAdapter;
  } = {},
): Promise<{ reconciled: number; failed: number }> {
  const tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
  if (!tursoUrl) {
    return { reconciled: 0, failed: 0 };
  }

  const localAdapter = dependencies.getLocalAdapter?.() ?? getAsyncAdapter(false);
  const tursoAdapter = dependencies.getTursoAdapter?.()
    ?? createTursoAdapter(tursoUrl, process.env.TURSO_AUTH_TOKEN);

  let reconciled = 0;
  let failed = 0;

  try {
    await ensureObservationsTable(tursoAdapter);
    const pending = await listPendingTursoObservations(localAdapter);

    for (const item of pending) {
      const rows = await localAdapter.execute(
        `SELECT station_id, source, observed_at, sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa,
                sea_temp_observed_at, wave_height_observed_at, wind_observed_at, pressure_observed_at,
                sea_surface_temp_backfilled, wave_height_backfilled, provenance_id,
                ingestion_run_id, source_timestamp, source_reference, raw_line, created_at
         FROM observations
         WHERE id = ?
         LIMIT 1`,
        [item.id],
      ) as Array<Record<string, unknown>>;

      const row = rows[0];
      if (!row) {
        failed += 1;
        continue;
      }

      const payload: ObservationInsertInput = {
        stationId: String(row.station_id),
        source: String(row.source),
        observedAt: Number(row.observed_at),
        seaSurfaceTempC: row.sea_surface_temp_c === null ? null : Number(row.sea_surface_temp_c),
        waveHeightM: row.wave_height_m === null ? null : Number(row.wave_height_m),
        windSpeedMps: row.wind_speed_mps === null ? null : Number(row.wind_speed_mps),
        pressureHpa: row.pressure_hpa === null ? null : Number(row.pressure_hpa),
        seaTempObservedAt: row.sea_temp_observed_at === null ? null : Number(row.sea_temp_observed_at),
        waveHeightObservedAt: row.wave_height_observed_at === null ? null : Number(row.wave_height_observed_at),
        windObservedAt: row.wind_observed_at === null ? null : Number(row.wind_observed_at),
        pressureObservedAt: row.pressure_observed_at === null ? null : Number(row.pressure_observed_at),
        seaSurfaceTempBackfilled: Number(row.sea_surface_temp_backfilled) === 1,
        waveHeightBackfilled: Number(row.wave_height_backfilled) === 1,
        provenanceId: row.provenance_id ? String(row.provenance_id) : null,
        ingestionRunId: String(row.ingestion_run_id),
        sourceTimestamp: String(row.source_timestamp),
        sourceReference: String(row.source_reference),
        rawLine: String(row.raw_line),
        createdAt: Number(row.created_at),
        syncStatus: "reconciled",
      };

      try {
        const tursoId = buildObservationId(payload);
        await tursoAdapter.execute(
          `INSERT OR REPLACE INTO observations (
            id, station_id, source, observed_at, sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa,
            sea_temp_observed_at, wave_height_observed_at, wind_observed_at, pressure_observed_at,
            sea_surface_temp_backfilled, wave_height_backfilled, provenance_id, sync_status,
            ingestion_run_id, source_timestamp, source_reference, raw_line, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            tursoId,
            payload.stationId,
            payload.source,
            payload.observedAt,
            payload.seaSurfaceTempC,
            payload.waveHeightM,
            payload.windSpeedMps,
            payload.pressureHpa,
            payload.seaTempObservedAt ?? null,
            payload.waveHeightObservedAt ?? null,
            payload.windObservedAt ?? null,
            payload.pressureObservedAt ?? null,
            payload.seaSurfaceTempBackfilled ? 1 : 0,
            payload.waveHeightBackfilled ? 1 : 0,
            payload.provenanceId ?? null,
            "reconciled",
            payload.ingestionRunId,
            payload.sourceTimestamp,
            payload.sourceReference,
            payload.rawLine,
            payload.createdAt,
          ],
        );

        await localAdapter.execute(
          `UPDATE observations SET sync_status = 'reconciled' WHERE id = ?`,
          [item.id],
        );
        reconciled += 1;
      } catch {
        failed += 1;
      }
    }
  } finally {
    localAdapter.close();
    tursoAdapter.close();
  }

  return { reconciled, failed };
}

export function createLocalFallbackAdapter(): AsyncDbAdapter {
  return createLocalAdapter(undefined, false);
}
