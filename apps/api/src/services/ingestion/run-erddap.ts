import {
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../../db/client";
import {
  fetchErddapData,
  resolveDefaultErddapBaseUrl,
  resolveDefaultErddapDatasetId,
  resolveErddapLookbackHours,
  buildDefaultTimeWindow,
  type ErddapFetchResult,
} from "../../connectors/erddap/fetch";
import {
  parseErddapCsv,
  type ErddapParsedRecord,
  type ErddapParseResult,
} from "../../connectors/erddap/parse";
import {
  mapErddapRecords,
  type ErddapMappedBatch,
} from "../../connectors/erddap/map";
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
  ensureStationMetricsTable,
  insertStationMetricRecord,
  stationMetricExists,
} from "../../repositories/station-metrics";
import {
  ensureProvenanceRecordsTable,
  insertProvenanceRecord,
} from "../../repositories/provenance";

const ERDDAP_SOURCE = "ioos_erddap" as const;
const DEFAULT_STALE_AFTER_MS = 48 * 60 * 60 * 1000; // ERDDAP window may be longer than real-time feeds
const DEFAULT_REGION_KEY = "ioos_erddap";

// A response must include at least one of these columns to pass schema validation.
const REQUIRED_COLUMN_GROUPS = [
  ["time"],
  ["station_id"],
  [
    "sea_water_temperature",
    "sea_surface_temperature",
    "sea_surface_wave_significant_height",
    "wind_speed",
    "air_pressure",
    "sea_water_practical_salinity",
    "dissolved_oxygen",
  ],
] as const;

export type ErddapRejectReason =
  | "timestamp_stale"
  | "impossible_values"
  | "duplicate_record"
  | "schema_drift";

export interface ErddapSourceConfig {
  baseUrl?: string;
  datasetId?: string;
  stationId?: string;
  regionKey?: string;
  lookbackHours?: number;
  enabled?: boolean;
}

export interface RunErddapIngestionResult {
  runId: string;
  status: "completed" | "completed_with_rejections" | "failed";
  polledSources: number;
  insertedRows: number;
  rejectedRows: number;
  rejectionReasons: Record<ErddapRejectReason, number>;
  finishedAt: string;
  error?: string;
}

interface RunErddapIngestionDependencies {
  resolvePath?: typeof resolveDatabasePath;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
  staleAfterMs?: number;
  sources?: ErddapSourceConfig[];
  fetchData?: (request: { baseUrl?: string; datasetId?: string; startTime?: string; endTime?: string }) => Promise<ErddapFetchResult>;
  parseData?: (body: string) => ErddapParseResult;
  mapData?: (records: ErddapParsedRecord[], sourceReference: string, fallbackRegionKey?: string) => ErddapMappedBatch;
}

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function loadConfiguredErddapSources(env = process.env): ErddapSourceConfig[] {
  const baseUrl = resolveDefaultErddapBaseUrl(env);
  const datasetId = resolveDefaultErddapDatasetId(env);
  const regionKey = env.ERDDAP_REGION_KEY ?? DEFAULT_REGION_KEY;
  const lookbackHours = resolveErddapLookbackHours(env);
  const stationIds = parseCsv(env.ERDDAP_STATION_IDS);

  if (stationIds.length > 0) {
    return stationIds.map((stationId) => ({
      baseUrl,
      datasetId,
      stationId,
      regionKey,
      lookbackHours,
    }));
  }

  // No station filter: fetch the full dataset for the time window.
  return [{ baseUrl, datasetId, regionKey, lookbackHours }];
}

function includesRequiredSchemaColumns(columns: string[]): boolean {
  const lowered = new Set(columns.map((col) => col.toLowerCase()));

  return REQUIRED_COLUMN_GROUPS.every((group) => group.some((col) => lowered.has(col)));
}

function isInvalidMeasurement(value: number | null, min: number, max: number): boolean {
  if (value === null) {
    return false;
  }

  return value < min || value > max;
}

function hasImpossibleValues(record: ErddapParsedRecord): boolean {
  return (
    isInvalidMeasurement(record.seaSurfaceTempC, -5, 45)
    || isInvalidMeasurement(record.waveHeightM, 0, 30)
    || isInvalidMeasurement(record.windSpeedMps, 0, 120)
    || isInvalidMeasurement(record.pressureHpa, 800, 1100)
    || isInvalidMeasurement(record.salinityPsu, 0, 45)
    || isInvalidMeasurement(record.dissolvedOxygenMgL, 0, 20)
    || isInvalidMeasurement(record.chlorophyllMgM3, 0, 200)
  );
}

function hasAtLeastOneMeasurement(record: ErddapParsedRecord): boolean {
  return (
    record.seaSurfaceTempC !== null
    || record.waveHeightM !== null
    || record.windSpeedMps !== null
    || record.pressureHpa !== null
    || record.salinityPsu !== null
    || record.dissolvedOxygenMgL !== null
    || record.chlorophyllMgM3 !== null
  );
}

export function validateErddapRecord(
  record: ErddapParsedRecord,
  now: number,
  staleAfterMs: number,
  db: SqliteDatabaseLike,
  regionKey: string,
): ErddapRejectReason | null {
  if (!record.stationId || record.observedAt === null || !hasAtLeastOneMeasurement(record)) {
    return "schema_drift";
  }

  if (now - record.observedAt > staleAfterMs) {
    return "timestamp_stale";
  }

  if (hasImpossibleValues(record)) {
    return "impossible_values";
  }

  if (observationExists(db, record.stationId, record.observedAt, ERDDAP_SOURCE)) {
    return "duplicate_record";
  }

  if (
    (record.salinityPsu !== null
      && stationMetricExists(db, {
        source: ERDDAP_SOURCE,
        stationId: record.stationId,
        regionKey,
        metricType: "salinity_psu",
        observedAt: record.observedAt,
      }))
    || (record.dissolvedOxygenMgL !== null
      && stationMetricExists(db, {
        source: ERDDAP_SOURCE,
        stationId: record.stationId,
        regionKey,
        metricType: "dissolved_oxygen_mg_l",
        observedAt: record.observedAt,
      }))
    || (record.chlorophyllMgM3 !== null
      && stationMetricExists(db, {
        source: ERDDAP_SOURCE,
        stationId: record.stationId,
        regionKey,
        metricType: "chlorophyll_mg_m3",
        observedAt: record.observedAt,
      }))
  ) {
    return "duplicate_record";
  }

  return null;
}

export async function runErddapIngestion(
  dependencies: RunErddapIngestionDependencies = {},
): Promise<RunErddapIngestionResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const nowFn = dependencies.now ?? Date.now;
  const staleAfterMs = dependencies.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const sources = (dependencies.sources ?? loadConfiguredErddapSources()).filter(
    (source) => source.enabled !== false,
  );
  const fetchData = dependencies.fetchData ?? fetchErddapData;
  const parseData = dependencies.parseData ?? parseErddapCsv;
  const mapData = dependencies.mapData ?? mapErddapRecords;

  const startedAt = nowFn();
  const dbPath = resolvePath();
  const db = openWritable(dbPath);

  ensureIngestionRunsTable(db);
  ensureObservationsTable(db);
  ensureStationMetricsTable(db);
  ensureProvenanceRecordsTable(db);

  const runId = createIngestionRun(db, {
    source: ERDDAP_SOURCE,
    startedAt,
    stationCount: sources.length,
  });

  let insertedRows = 0;
  let rejectedRows = 0;

  const rejectionReasons: Record<ErddapRejectReason, number> = {
    timestamp_stale: 0,
    impossible_values: 0,
    duplicate_record: 0,
    schema_drift: 0,
  };

  const seenRecordKeys = new Set<string>();

  try {
    for (const source of sources) {
      const regionKey = source.regionKey ?? DEFAULT_REGION_KEY;
      const lookbackHours = source.lookbackHours ?? resolveErddapLookbackHours();
      const timeWindow = buildDefaultTimeWindow(lookbackHours, nowFn());

      const fetched = await fetchData({
        baseUrl: source.baseUrl,
        datasetId: source.datasetId,
        startTime: timeWindow.startTime,
        endTime: timeWindow.endTime,
      });

      const parsed = parseData(fetched.body);

      if (!includesRequiredSchemaColumns(parsed.columns)) {
        const schemaRejectCount = Math.max(parsed.records.length, 1);
        rejectedRows += schemaRejectCount;
        rejectionReasons.schema_drift += schemaRejectCount;
        continue;
      }

      // If a specific station was configured, filter client-side.
      const candidateRecords = source.stationId
        ? parsed.records.filter((record) => record.stationId === source.stationId)
        : parsed.records;

      for (const record of candidateRecords) {
        const now = nowFn();
        const rejection = validateErddapRecord(record, now, staleAfterMs, db, regionKey);

        if (rejection) {
          rejectedRows += 1;
          rejectionReasons[rejection] += 1;
          continue;
        }

        const recordKey = `${record.stationId}|${record.observedAt}`;
        if (seenRecordKeys.has(recordKey)) {
          rejectedRows += 1;
          rejectionReasons.duplicate_record += 1;
          continue;
        }

        seenRecordKeys.add(recordKey);

        const mapped = mapData([record], fetched.sourceUrl, regionKey);

        for (const observation of mapped.observations) {
          const observationId = insertObservation(db, {
            stationId: observation.stationId,
            source: observation.source,
            observedAt: observation.observedAt,
            seaSurfaceTempC: observation.seaSurfaceTempC,
            waveHeightM: observation.waveHeightM,
            windSpeedMps: observation.windSpeedMps,
            pressureHpa: observation.pressureHpa,
            ingestionRunId: runId,
            sourceTimestamp: observation.sourceTimestamp,
            sourceReference: observation.sourceReference,
            rawLine: observation.rawLine,
            createdAt: now,
          });

          insertProvenanceRecord(db, {
            ingestionRunId: runId,
            source: ERDDAP_SOURCE,
            sourceStationId: observation.stationId,
            sourceTimestamp: observation.sourceTimestamp,
            sourceReference: observation.sourceReference,
            recordType: "observation",
            recordId: observationId,
            payload: {
              stationId: observation.stationId,
              observedAt: observation.sourceTimestamp,
              raw: record.raw,
            },
            createdAt: now,
          });

          insertedRows += 1;
        }

        for (const metric of mapped.metrics) {
          if (
            stationMetricExists(db, {
              source: ERDDAP_SOURCE,
              stationId: metric.stationId,
              regionKey: metric.regionKey,
              metricType: metric.metricType,
              observedAt: metric.observedAt,
            })
          ) {
            rejectedRows += 1;
            rejectionReasons.duplicate_record += 1;
            continue;
          }

          const metricId = insertStationMetricRecord(db, {
            stationId: metric.stationId,
            regionKey: metric.regionKey,
            metricType: metric.metricType,
            metricValue: metric.metricValue,
            metricUnit: metric.metricUnit,
            source: ERDDAP_SOURCE,
            observedAt: metric.observedAt,
            ingestionRunId: runId,
            sourceTimestamp: metric.sourceTimestamp,
            sourceReference: fetched.sourceUrl,
            createdAt: now,
          });

          insertProvenanceRecord(db, {
            ingestionRunId: runId,
            source: ERDDAP_SOURCE,
            sourceStationId: metric.stationId,
            sourceTimestamp: metric.sourceTimestamp,
            sourceReference: fetched.sourceUrl,
            recordType: "station_metric",
            recordId: metricId,
            payload: {
              stationId: metric.stationId,
              region: metric.regionKey,
              metricType: metric.metricType,
              metricValue: metric.metricValue,
            },
            createdAt: now,
          });

          insertedRows += 1;
        }
      }
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
      polledSources: sources.length,
      insertedRows,
      rejectedRows,
      rejectionReasons,
      finishedAt: new Date(finishedAt).toISOString(),
    };
  } catch (caught) {
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
      polledSources: sources.length,
      insertedRows,
      rejectedRows,
      rejectionReasons,
      finishedAt: new Date(failedAt).toISOString(),
      error: caught instanceof Error ? caught.message : String(caught),
    };
  } finally {
    db.close();
  }
}
