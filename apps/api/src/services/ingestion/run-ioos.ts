import {
  resolveDatabasePath,
} from "../../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../../db/async-client";
import {
  fetchIoosData,
  resolveDefaultIoosSourceUrl,
  type IoosFetchResult,
} from "../../connectors/ioos/fetch";
import {
  parseIoosData,
  type IoosParsedRecord,
  type IoosParseResult,
} from "../../connectors/ioos/parse";
import {
  mapIoosRecords,
  type IoosMappedBatch,
} from "../../connectors/ioos/map";
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

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REGION_KEY = "ioos_region";
const REQUIRED_SCHEMA_FIELD_GROUPS = [
  ["time", "timestamp", "datetime", "observed_at", "phenomenontime"],
  ["station_id", "stationid", "station", "platform_code", "platform"],
  [
    "sea_surface_temperature",
    "sst",
    "water_temperature",
    "wave_height",
    "wind_speed",
    "pressure_hpa",
    "salinity",
    "dissolved_oxygen",
    "chlorophyll",
  ],
] as const;

export type IoosRejectReason =
  | "timestamp_stale"
  | "impossible_values"
  | "duplicate_record"
  | "schema_drift";

export interface IoosSourceConfig {
  sourceUrl?: string;
  stationId?: string;
  regionKey?: string;
  enabled?: boolean;
}

export interface RunIoosIngestionResult {
  runId: string;
  status: "completed" | "completed_with_rejections" | "failed";
  polledSources: number;
  insertedRows: number;
  rejectedRows: number;
  rejectionReasons: Record<IoosRejectReason, number>;
  finishedAt: string;
}

interface RunIoosIngestionDependencies {
  resolvePath?: typeof resolveDatabasePath;
  now?: () => number;
  staleAfterMs?: number;
  sources?: IoosSourceConfig[];
  fetchData?: (request: {
    sourceUrl?: string;
    stationId?: string;
  }) => Promise<IoosFetchResult>;
  parseData?: (feedBody: string) => IoosParseResult;
  mapData?: (records: IoosParsedRecord[], sourceReference: string, fallbackRegionKey?: string) => IoosMappedBatch;
  getAdapter?: (readOnly?: boolean) => AsyncDbAdapter;
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

export function loadConfiguredIoosSources(env = process.env): IoosSourceConfig[] {
  const regionKey = env.IOOS_REGION_KEY ?? DEFAULT_REGION_KEY;
  const stationIds = parseCsv(env.IOOS_STATION_IDS);
  const sourceUrls = parseCsv(env.IOOS_SOURCE_URLS);

  if (stationIds.length > 0) {
    const sharedSourceUrl = env.IOOS_SOURCE_URL ?? sourceUrls[0] ?? resolveDefaultIoosSourceUrl(env);
    return stationIds.map((stationId) => ({
      stationId,
      sourceUrl: sharedSourceUrl,
      regionKey,
    }));
  }

  if (sourceUrls.length > 0) {
    return sourceUrls.map((sourceUrl) => ({
      sourceUrl,
      regionKey,
    }));
  }

  return [
    {
      sourceUrl: resolveDefaultIoosSourceUrl(env),
      regionKey,
    },
  ];
}

function hasAtLeastOneMeasurement(record: IoosParsedRecord): boolean {
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

function includesRequiredSchemaFields(availableFields: string[]): boolean {
  const lowered = new Set(availableFields.map((field) => field.toLowerCase()));

  return REQUIRED_SCHEMA_FIELD_GROUPS.every((group) => group.some((field) => lowered.has(field)));
}

function isInvalidMeasurement(value: number | null, min: number, max: number): boolean {
  if (value === null) {
    return false;
  }

  return value < min || value > max;
}

function hasImpossibleValues(record: IoosParsedRecord): boolean {
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

function resolveRegionKey(record: IoosParsedRecord, sourceRegionKey: string | undefined): string {
  const fallback = sourceRegionKey ?? DEFAULT_REGION_KEY;
  const candidate = (record.region ?? fallback).trim();
  return candidate.length > 0 ? candidate : fallback;
}

export async function validateIoosRecord(
  record: IoosParsedRecord,
  now: number,
  staleAfterMs: number,
  adapter: AsyncDbAdapter,
  sourceRegionKey: string | undefined,
): Promise<IoosRejectReason | null> {
  if (!record.stationId || record.observedAt === null || !hasAtLeastOneMeasurement(record)) {
    return "schema_drift";
  }

  if (now - record.observedAt > staleAfterMs) {
    return "timestamp_stale";
  }

  if (hasImpossibleValues(record)) {
    return "impossible_values";
  }

  const regionKey = resolveRegionKey(record, sourceRegionKey);

  if (await observationExists(adapter, record.stationId, record.observedAt, "ioos_regional")) {
    return "duplicate_record";
  }

  if (
    (record.salinityPsu !== null
      && await stationMetricExists(adapter, {
        source: "ioos_regional",
        stationId: record.stationId,
        regionKey,
        metricType: "salinity_psu",
        observedAt: record.observedAt,
      }))
    || (record.dissolvedOxygenMgL !== null
      && await stationMetricExists(adapter, {
        source: "ioos_regional",
        stationId: record.stationId,
        regionKey,
        metricType: "dissolved_oxygen_mg_l",
        observedAt: record.observedAt,
      }))
    || (record.chlorophyllMgM3 !== null
      && await stationMetricExists(adapter, {
        source: "ioos_regional",
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

export async function runIoosIngestion(
  dependencies: RunIoosIngestionDependencies = {},
): Promise<RunIoosIngestionResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const nowFn = dependencies.now ?? Date.now;
  const staleAfterMs = dependencies.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const sources = (dependencies.sources ?? loadConfiguredIoosSources()).filter((source) => source.enabled !== false);
  const fetchData = dependencies.fetchData ?? fetchIoosData;
  const parseData = dependencies.parseData ?? parseIoosData;
  const mapData = dependencies.mapData ?? mapIoosRecords;

  const startedAt = nowFn();
  const dbPath = resolvePath();
  
  const getAdapter = dependencies.getAdapter ?? getAsyncAdapter;
  const adapter = getAdapter(false);

  await ensureIngestionRunsTable(adapter);
  await ensureObservationsTable(adapter);
  await ensureStationMetricsTable(adapter);
  await ensureProvenanceRecordsTable(adapter);

  const runId = await createIngestionRun(adapter, {
    source: "ioos_regional",
    startedAt,
    stationCount: sources.length,
  });

  let insertedRows = 0;
  let rejectedRows = 0;

  const rejectionReasons: Record<IoosRejectReason, number> = {
    timestamp_stale: 0,
    impossible_values: 0,
    duplicate_record: 0,
    schema_drift: 0,
  };

  const seenRecordKeys = new Set<string>();

  try {
    for (const source of sources) {
      const fetched = await fetchData({
        sourceUrl: source.sourceUrl,
        stationId: source.stationId,
      });

      const parsed = parseData(fetched.body);

      if (!includesRequiredSchemaFields(parsed.availableFields)) {
        const schemaRejectCount = Math.max(parsed.records.length, 1);
        rejectedRows += schemaRejectCount;
        rejectionReasons.schema_drift += schemaRejectCount;
        continue;
      }

      const candidateRecords = source.stationId
        ? parsed.records.filter((record) => record.stationId === source.stationId)
        : parsed.records;

      for (const record of candidateRecords) {
        const now = nowFn();
        const rejection = await validateIoosRecord(record, now, staleAfterMs, adapter, source.regionKey);

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

        const mapped = mapData([record], fetched.sourceUrl, source.regionKey ?? DEFAULT_REGION_KEY);

        for (const observation of mapped.observations) {
          const observationId = await insertObservation(adapter, {
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

          await insertProvenanceRecord(adapter, {
            ingestionRunId: runId,
            source: "ioos_regional",
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
            await stationMetricExists(adapter, {
              source: "ioos_regional",
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

          const metricId = await insertStationMetricRecord(adapter, {
            stationId: metric.stationId,
            regionKey: metric.regionKey,
            metricType: metric.metricType,
            metricValue: metric.metricValue,
            metricUnit: metric.metricUnit,
            source: "ioos_regional",
            observedAt: metric.observedAt,
            ingestionRunId: runId,
            sourceTimestamp: metric.sourceTimestamp,
            sourceReference: fetched.sourceUrl,
            createdAt: now,
          });

          await insertProvenanceRecord(adapter, {
            ingestionRunId: runId,
            source: "ioos_regional",
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

    await finalizeIngestionRun(adapter, {
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
  } catch {
    const failedAt = nowFn();

    await finalizeIngestionRun(adapter, {
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
    };
  } finally {
    await adapter.close();
  }
}
