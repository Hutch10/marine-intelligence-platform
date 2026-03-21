import {
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../../db/client";
import { fetchNdbcRealtimeText } from "../../connectors/ndbc/fetch";
import { parseNdbcStationData } from "../../connectors/ndbc/parse";
import {
  mapNdbcRowsToObservations,
  type NdbcMappedObservation,
} from "../../connectors/ndbc/map";
import {
  ensureIngestionRunsTable,
  createIngestionRun,
  finalizeIngestionRun,
} from "../../repositories/ingestion-runs";
import {
  ensureObservationsTable,
  insertObservation,
  observationExists,
} from "../../repositories/observations";
import {
  ensureProvenanceRecordsTable,
  insertProvenanceRecord,
} from "../../repositories/provenance";

const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

export type NdbcRejectReason =
  | "timestamp_stale"
  | "impossible_values"
  | "duplicate_row";

export interface NdbcStationConfig {
  stationId: string;
  feedUrl?: string;
  enabled?: boolean;
}

export interface RunNdbcIngestionResult {
  runId: string;
  status: "completed" | "completed_with_rejections" | "failed";
  polledStations: number;
  insertedRows: number;
  rejectedRows: number;
  rejectionReasons: Record<NdbcRejectReason, number>;
  finishedAt: string;
}

interface RunNdbcIngestionDependencies {
  resolvePath?: typeof resolveDatabasePath;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
  stations?: NdbcStationConfig[];
  staleAfterMs?: number;
  fetchRealtimeText?: typeof fetchNdbcRealtimeText;
  parseStationData?: typeof parseNdbcStationData;
  mapRows?: typeof mapNdbcRowsToObservations;
}

export function loadConfiguredNdbcStations(env = process.env): NdbcStationConfig[] {
  const fromCsv = env.NDBC_STATION_IDS;

  if (!fromCsv) {
    return [
      { stationId: "46042" },
      { stationId: "41009" },
    ];
  }

  return fromCsv
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((stationId) => ({ stationId }));
}

function isInvalidMeasurement(value: number | null, min: number, max: number): boolean {
  if (value === null) {
    return false;
  }

  return value < min || value > max;
}

export function validateMappedObservation(
  observation: NdbcMappedObservation,
  now: number,
  staleAfterMs: number,
  db: SqliteDatabaseLike,
): NdbcRejectReason | null {
  if (now - observation.observedAt > staleAfterMs) {
    return "timestamp_stale";
  }

  if (
    isInvalidMeasurement(observation.seaSurfaceTempC, -5, 45)
    || isInvalidMeasurement(observation.waveHeightM, 0, 30)
    || isInvalidMeasurement(observation.windSpeedMps, 0, 120)
    || isInvalidMeasurement(observation.pressureHpa, 800, 1100)
  ) {
    return "impossible_values";
  }

  if (observationExists(db, observation.stationId, observation.observedAt)) {
    return "duplicate_row";
  }

  return null;
}

export async function runNdbcIngestion(
  dependencies: RunNdbcIngestionDependencies = {},
): Promise<RunNdbcIngestionResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const nowFn = dependencies.now ?? Date.now;
  const stations = (dependencies.stations ?? loadConfiguredNdbcStations()).filter((station) => station.enabled !== false);
  const staleAfterMs = dependencies.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const fetchRealtimeText = dependencies.fetchRealtimeText ?? fetchNdbcRealtimeText;
  const parseStationData = dependencies.parseStationData ?? parseNdbcStationData;
  const mapRows = dependencies.mapRows ?? mapNdbcRowsToObservations;

  const startedAt = nowFn();
  const dbPath = resolvePath();
  const db = openWritable(dbPath);

  ensureIngestionRunsTable(db);
  ensureObservationsTable(db);
  ensureProvenanceRecordsTable(db);

  const runId = createIngestionRun(db, {
    source: "noaa_ndbc",
    startedAt,
    stationCount: stations.length,
  });

  let insertedRows = 0;
  let rejectedRows = 0;

  const rejectionReasons: Record<NdbcRejectReason, number> = {
    timestamp_stale: 0,
    impossible_values: 0,
    duplicate_row: 0,
  };

  try {
    for (const station of stations) {
      const fetched = await fetchRealtimeText({
        stationId: station.stationId,
        feedUrl: station.feedUrl,
      });

      const parsed = parseStationData(fetched.body);
      const mapped = mapRows(station.stationId, fetched.feedUrl, parsed);

      if (mapped.length === 0) {
        continue;
      }

      const latest = mapped[0]!;
      const now = nowFn();
      const rejectionReason = validateMappedObservation(latest, now, staleAfterMs, db);

      if (rejectionReason) {
        rejectedRows += 1;
        rejectionReasons[rejectionReason] += 1;
        continue;
      }

      const observationId = insertObservation(db, {
        stationId: latest.stationId,
        source: latest.source,
        observedAt: latest.observedAt,
        seaSurfaceTempC: latest.seaSurfaceTempC,
        waveHeightM: latest.waveHeightM,
        windSpeedMps: latest.windSpeedMps,
        pressureHpa: latest.pressureHpa,
        ingestionRunId: runId,
        sourceTimestamp: latest.sourceTimestamp,
        sourceReference: latest.sourceFeed,
        rawLine: latest.rawLine,
        createdAt: now,
      });

      insertProvenanceRecord(db, {
        ingestionRunId: runId,
        source: latest.source,
        sourceStationId: latest.stationId,
        sourceTimestamp: latest.sourceTimestamp,
        sourceReference: latest.sourceFeed,
        recordType: "observation",
        recordId: observationId,
        payload: {
          stationId: latest.stationId,
          observedAt: latest.sourceTimestamp,
          sourceLine: latest.rawLine,
        },
        createdAt: now,
      });

      insertedRows += 1;
    }

    const finishedAt = nowFn();

    finalizeIngestionRun(db, {
      runId,
      status: "completed",
      finishedAt,
      insertedRows,
      rejectedRows,
    });

    return {
      runId,
      status: rejectedRows > 0 ? "completed_with_rejections" : "completed",
      polledStations: stations.length,
      insertedRows,
      rejectedRows,
      rejectionReasons,
      finishedAt: new Date(finishedAt).toISOString(),
    };
  } catch {
    const failedAt = nowFn();

    finalizeIngestionRun(db, {
      runId,
      status: "failed",
      finishedAt: failedAt,
      insertedRows,
      rejectedRows,
    });

    return {
      runId,
      status: "failed",
      polledStations: stations.length,
      insertedRows,
      rejectedRows,
      rejectionReasons,
      finishedAt: new Date(failedAt).toISOString(),
    };
  } finally {
    db.close();
  }
}
