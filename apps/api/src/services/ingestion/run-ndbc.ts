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
import type { NdbcParsedRow } from "../../connectors/ndbc/parse";
import {
  ensureIngestionRunsTable,
  createIngestionRun,
  finalizeIngestionRun,
} from "../../repositories/ingestion-runs";
import {
  ensureObservationsTable,
  insertObservation,
  observationExists,
  readRecentObservationHistoryFromDb,
} from "../../repositories/observations";
import {
  ensureStationRiskThresholdTables,
  resolveStationRiskThresholds,
  type ResolvedStationRiskThreshold,
} from "../../repositories/station-risk-thresholds";
import {
  ensureProvenanceRecordsTable,
  insertProvenanceRecord,
} from "../../repositories/provenance";
import {
  ensureOperationalAlertsTable,
} from "../../repositories/operational-alerts";
import { createOperationalAlertsService } from "../operational-alerts";
import { evaluateNdbcAnomalies } from "./ndbc-alert-evaluator";

const DEFAULT_STALE_AFTER_MS = 8 * 60 * 60 * 1000;
const SST_BACKFILL_WINDOW_MS = 12 * 60 * 60 * 1000;

export type NdbcRejectReason =
  | "timestamp_stale"
  | "impossible_values"
  | "duplicate_row"
  | "transient_failure";

export interface NdbcStationIngestionDiagnostic {
  stationId: string;
  status: "healthy" | "degraded" | "failed";
  lastSuccessfulIngestionAt: string | null;
  latestObservationTimestamp: string | null;
  latestObservationAgeMs: number | null;
  usableMetricCoverage: {
    presentCount: number;
    totalCount: number;
    metricsPresent: string[];
  };
  missingFieldRates: {
    seaSurfaceTempC: number;
    waveHeightM: number;
    windSpeedMps: number;
    pressureHpa: number;
  };
  rejectionBreakdown: Record<string, number>;
  lastFetchUrl: string | null;
}

export interface NdbcStationConfig {
  stationId: string;
  feedUrl?: string;
  fallbackFeedUrls?: string[];
  enabled?: boolean;
}

export interface RunNdbcIngestionResult {
  runId: string;
  status: "completed" | "completed_with_rejections" | "failed";
  polledStations: number;
  insertedRows: number;
  rejectedRows: number;
  rejectionReasons: Record<NdbcRejectReason, number>;
  stationDiagnostics: NdbcStationIngestionDiagnostic[];
  finishedAt: string;
  error?: string | null;
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
  resolveThresholds?: (
    stationId: string | null | undefined,
    dependencies?: { db?: SqliteDatabaseLike },
  ) => ResolvedStationRiskThreshold[];
  evaluateAnomalies?: typeof evaluateNdbcAnomalies;
  logLine?: (line: string) => void;
}

export function loadConfiguredNdbcStations(env = process.env): NdbcStationConfig[] {
  const fromCsv = env.NDBC_STATION_IDS;

  if (!fromCsv) {
    return [
      { stationId: "41009" },
      { stationId: "42019" },
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

function logDiagnostic(writeLine: ((line: string) => void) | undefined, message: string) {
  writeLine?.(`[run-ndbc] ${message}`);
}

function summarizeNdbcBodyPreview(body: string): string {
  return body
    .split(/\r?\n/)
    .slice(0, 10)
    .join("\n");
}

function isUsableNdbcFieldValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toUpperCase();
  return normalized.length > 0 && normalized !== "MM";
}

function toObservedAt(row: NdbcParsedRow): number {
  return Date.UTC(
    row.timestamp.year,
    row.timestamp.month - 1,
    row.timestamp.day,
    row.timestamp.hour,
    row.timestamp.minute,
    0,
    0,
  );
}

function findMostRecentUsableFieldRow(
  rows: NdbcParsedRow[],
  fieldKey: "WTMP" | "WVHT",
): NdbcParsedRow | null {
  for (const row of rows) {
    if (isUsableNdbcFieldValue(row.fields[fieldKey])) {
      return row;
    }
  }

  return null;
}

function computeMissingFieldRates(rows: NdbcParsedRow[]): NdbcStationIngestionDiagnostic["missingFieldRates"] {
  const totalRows = rows.length;

  if (totalRows === 0) {
    return {
      seaSurfaceTempC: 1,
      waveHeightM: 1,
      windSpeedMps: 1,
      pressureHpa: 1,
    };
  }

  const missingRate = (usableCount: number) => Math.max(0, Math.min(1, (totalRows - usableCount) / totalRows));

  return {
    seaSurfaceTempC: missingRate(rows.filter((row) => isUsableNdbcFieldValue(row.fields.WTMP)).length),
    waveHeightM: missingRate(rows.filter((row) => isUsableNdbcFieldValue(row.fields.WVHT)).length),
    windSpeedMps: missingRate(rows.filter((row) => isUsableNdbcFieldValue(row.fields.WSPD)).length),
    pressureHpa: missingRate(rows.filter((row) => isUsableNdbcFieldValue(row.fields.PRES ?? row.fields.BAR)).length),
  };
}

function logParsedFieldAvailability(
  logLine: ((line: string) => void) | undefined,
  stationId: string,
  rows: NdbcParsedRow[],
) {
  const latestRow = rows[0];
  const fieldSummaries: Array<{ key: "WTMP" | "WVHT"; label: string }> = [
    { key: "WTMP", label: "seaSurfaceTempC" },
    { key: "WVHT", label: "waveHeightM" },
  ];

  for (const field of fieldSummaries) {
    const usableCount = rows.filter((row) => isUsableNdbcFieldValue(row.fields[field.key])).length;
    const latestValue = latestRow?.fields[field.key] ?? "missing";
    const latestHasUsableValue = isUsableNdbcFieldValue(latestRow?.fields[field.key]);
    const mostRecentUsableRow = findMostRecentUsableFieldRow(rows, field.key);
    const mostRecentUsableObservedAt = mostRecentUsableRow
      ? formatObservedAt(toObservedAt(mostRecentUsableRow))
      : null;

    if (!latestHasUsableValue) {
      logDiagnostic(
        logLine,
        `station ${stationId} field ${field.label} is unavailable in the latest row (raw ${field.key}=${latestValue}); usable values found in ${usableCount}/${rows.length} fetched rows; most recent usable ${field.key} timestamp=${mostRecentUsableObservedAt ?? "none"}.`,
      );
    } else {
      logDiagnostic(
        logLine,
        `station ${stationId} field ${field.label} is present in the latest row (raw ${field.key}=${latestValue}); usable values found in ${usableCount}/${rows.length} fetched rows; most recent usable ${field.key} timestamp=${mostRecentUsableObservedAt ?? "none"}.`,
      );
    }
  }

  if (latestRow && !isUsableNdbcFieldValue(latestRow.fields.WTMP)) {
    const mostRecentSstRow = findMostRecentUsableFieldRow(rows, "WTMP");
    const latestObservedAt = toObservedAt(latestRow);
    const mostRecentSstObservedAt = mostRecentSstRow ? toObservedAt(mostRecentSstRow) : null;
    const isRecentEnoughForSstBackfill = mostRecentSstObservedAt !== null
      && (latestObservedAt - mostRecentSstObservedAt) <= SST_BACKFILL_WINDOW_MS;

    if (!isRecentEnoughForSstBackfill) {
      logDiagnostic(
        logLine,
        `station ${stationId} SST is unavailable for live ingestion: latest raw WTMP is MM and no usable WTMP exists within the 12-hour SST backfill window.`,
      );
    }
  }
}

function formatObservedAt(observedAt: number): string {
  return new Date(observedAt).toISOString();
}

function buildUsableMetricCoverage(
  observation: NdbcMappedObservation,
): NdbcStationIngestionDiagnostic["usableMetricCoverage"] {
  const metrics: Array<{
    key: keyof Pick<NdbcMappedObservation, "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa">;
    label: string;
  }> = [
    { key: "seaSurfaceTempC", label: "seaSurfaceTempC" },
    { key: "waveHeightM", label: "waveHeightM" },
    { key: "windSpeedMps", label: "windSpeedMps" },
    { key: "pressureHpa", label: "pressureHpa" },
  ];
  const metricsPresent = metrics
    .filter((metric) => typeof observation[metric.key] === "number" && Number.isFinite(observation[metric.key]))
    .map((metric) => metric.label);

  return {
    presentCount: metricsPresent.length,
    totalCount: metrics.length,
    metricsPresent,
  };
}

function createStationDiagnostic(
  stationId: string,
  observation: NdbcMappedObservation | null,
  parsedRows: NdbcParsedRow[],
  now: number,
): NdbcStationIngestionDiagnostic {
  return {
    stationId,
    status: "failed",
    lastSuccessfulIngestionAt: null,
    latestObservationTimestamp: observation?.sourceTimestamp ?? null,
    latestObservationAgeMs: observation ? Math.max(0, now - observation.observedAt) : null,
    usableMetricCoverage: observation
      ? buildUsableMetricCoverage(observation)
      : {
        presentCount: 0,
        totalCount: 4,
        metricsPresent: [],
      },
    missingFieldRates: computeMissingFieldRates(parsedRows),
    rejectionBreakdown: {},
    lastFetchUrl: null,
  };
}

function incrementRejectionBreakdown(
  diagnostic: NdbcStationIngestionDiagnostic,
  reason: string,
) {
  diagnostic.rejectionBreakdown[reason] = (diagnostic.rejectionBreakdown[reason] ?? 0) + 1;
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

  if (observationExists(db, observation.stationId, observation.observedAt, observation.source)) {
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
  const resolveThresholds = dependencies.resolveThresholds ?? resolveStationRiskThresholds;
  const evaluateAnomalies = dependencies.evaluateAnomalies ?? evaluateNdbcAnomalies;
  const logLine = dependencies.logLine;

  const startedAt = nowFn();
  const dbPath = resolvePath();
  logDiagnostic(logLine, `resolved DB path: ${dbPath}`);
  const db = openWritable(dbPath);

  logDiagnostic(logLine, `configured station count: ${stations.length}`);

  ensureIngestionRunsTable(db);
  ensureObservationsTable(db);
  ensureProvenanceRecordsTable(db);
  ensureOperationalAlertsTable(db);
  ensureStationRiskThresholdTables(db);

  const { DbAlertStore } = require("../db-alert-store");
  const alertsService = createOperationalAlertsService({ db, alertStore: new DbAlertStore(db) });

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
    transient_failure: 0,
  };
  const stationDiagnostics: NdbcStationIngestionDiagnostic[] = [];

  try {
    if (stations.length === 0) {
      throw new Error("NDBC ingestion misconfigured: NDBC_STATION_IDS resolved to zero enabled stations.");
    }

    for (const station of stations) {
      logDiagnostic(
        logLine,
        `fetching station ${station.stationId} from ${station.feedUrl ?? `https://www.ndbc.noaa.gov/data/realtime2/${encodeURIComponent(station.stationId)}.txt`}`,
      );
      const now = nowFn();
      let fetchedFeedUrl: string | null = station.feedUrl ?? null;
      let parsed: NdbcParsedRow[] = [];
      let mapped: NdbcMappedObservation[] = [];

      try {
        const fetched = await fetchRealtimeText({
          stationId: station.stationId,
          feedUrl: station.feedUrl,
          fallbackFeedUrls: station.fallbackFeedUrls,
        });
        fetchedFeedUrl = fetched.feedUrl;
        logDiagnostic(logLine, `fetched URL: ${fetched.feedUrl}`);
        logDiagnostic(logLine, `fetched HTTP status: ${fetched.statusCode}`);
        logDiagnostic(logLine, `fetched content-type: ${fetched.contentType ?? "unknown"}`);
        logDiagnostic(logLine, `fetched body length: ${fetched.body.length}`);
        logDiagnostic(logLine, `fetched body preview:\n${summarizeNdbcBodyPreview(fetched.body)}`);

        parsed = parseStationData(fetched.body);
        logParsedFieldAvailability(logLine, station.stationId, parsed);
        mapped = mapRows(station.stationId, fetched.feedUrl, parsed);
        logDiagnostic(logLine, `station ${station.stationId} fetched record count before validation: ${mapped.length}`);
      } catch (error) {
        const stationDiagnostic = createStationDiagnostic(station.stationId, null, [], now);
        stationDiagnostic.lastFetchUrl = fetchedFeedUrl;
        stationDiagnostic.status = "failed";
        incrementRejectionBreakdown(stationDiagnostic, "transient_failure");
        stationDiagnostics.push(stationDiagnostic);
        rejectedRows += 1;
        rejectionReasons.transient_failure += 1;
        logDiagnostic(
          logLine,
          `station ${station.stationId} transient failure: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }

      const stationDiagnostic = createStationDiagnostic(station.stationId, mapped[0] ?? null, parsed, now);
      stationDiagnostic.lastFetchUrl = fetchedFeedUrl;
      stationDiagnostics.push(stationDiagnostic);

      if (mapped.length === 0) {
        incrementRejectionBreakdown(stationDiagnostic, "transient_failure");
        stationDiagnostic.status = "failed";
        rejectedRows += 1;
        rejectionReasons.transient_failure += 1;
        logDiagnostic(
          logLine,
          `station ${station.stationId} yielded no usable records after fetch; classified as transient_failure`,
        );
        continue;
      }

      const latest = mapped[0]!;
      const rejectionReason = validateMappedObservation(latest, now, staleAfterMs, db);
      const baselineHistory = readRecentObservationHistoryFromDb(
        db,
        latest.stationId,
        latest.observedAt - (45 * 24 * 60 * 60 * 1000),
      );
      const resolvedThresholds = resolveThresholds(latest.stationId, { db });

      if (rejectionReason) {
        logDiagnostic(
          logLine,
          `rejected row stationId=${latest.stationId} observedAt=${formatObservedAt(latest.observedAt)} reason=${rejectionReason}`,
        );
        rejectedRows += 1;
        rejectionReasons[rejectionReason] += 1;
        incrementRejectionBreakdown(stationDiagnostic, rejectionReason);
        stationDiagnostic.status = "degraded";
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

      // Evaluate anomaly thresholds and raise operational alerts for any exceeded values.
      const anomalyActions = evaluateAnomalies(latest, {
        baselineHistory,
        baseline: { windowDays: 45, zScoreThreshold: 2 },
        thresholds: resolvedThresholds,
      });
      if (anomalyActions.length > 0) {
        alertsService.applyAlertActions(anomalyActions);
      }

      logDiagnostic(
        logLine,
        `accepted row stationId=${latest.stationId} observedAt=${formatObservedAt(latest.observedAt)}`,
      );
      stationDiagnostic.status = Object.keys(stationDiagnostic.rejectionBreakdown).length > 0 ? "degraded" : "healthy";
      stationDiagnostic.lastSuccessfulIngestionAt = new Date(now).toISOString();
      stationDiagnostic.latestObservationTimestamp = latest.sourceTimestamp;
      stationDiagnostic.latestObservationAgeMs = Math.max(0, now - latest.observedAt);
      insertedRows += 1;
    }

    if (insertedRows === 0) {
      throw new Error("NDBC ingestion did not yield any usable station observations.");
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
      stationDiagnostics,
      finishedAt: new Date(finishedAt).toISOString(),
      error: null,
    };
  } catch (error) {
    const failedAt = nowFn();
    const message = error instanceof Error ? error.message : String(error);
    logDiagnostic(logLine, `failed: ${message}`);

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
      stationDiagnostics,
      finishedAt: new Date(failedAt).toISOString(),
      error: message,
    };
  } finally {
    db.close();
  }
}
