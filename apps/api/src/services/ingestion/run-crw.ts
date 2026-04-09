import {
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../../db/client";
import {
  fetchCoralReefWatchData,
  buildCrwRegionalVirtualStationDataUrl,
  resolveDefaultCrwSourceUrl,
} from "../../connectors/coral-reef-watch/fetch";
import {
  parseCoralReefWatchData,
  type CrwParsedRecord,
} from "../../connectors/coral-reef-watch/parse";
import { mapCrwRecords } from "../../connectors/coral-reef-watch/map";
import {
  ensureIngestionRunsTable,
  createIngestionRun,
  finalizeIngestionRun,
} from "../../repositories/ingestion-runs";
import {
  ensureProvenanceRecordsTable,
  insertProvenanceRecord,
} from "../../repositories/provenance";
import {
  ensureDerivedSignalsTable,
  ensureStationMetricsTable,
  insertDerivedSignal,
  insertStationMetric,
  reefStressSnapshotExists,
} from "../../repositories/reef-stress";
import { CRW_SOURCE } from "../../connectors/coral-reef-watch/constants";

const DEFAULT_STALE_AFTER_MS = 72 * 60 * 60 * 1000;
const REQUIRED_SCHEMA_FIELD_GROUPS = [
  ["sst_anomaly", "sst_anomaly_c", "ssta", "sstanomaly"],
  ["hotspot", "hotspot_c", "hot_spot", "hotspotc"],
  ["dhw", "degree_heating_weeks", "degreeheatingweeks"],
  ["alert_level", "bleaching_alert_level", "stress_level", "stresscategory"],
] as const;

export type CrwRejectReason =
  | "timestamp_stale"
  | "impossible_values"
  | "duplicate_record"
  | "schema_drift";

export interface CrwTargetConfig {
  region: string;
  stationId?: string;
  enabled?: boolean;
}

export interface RunCrwIngestionResult {
  runId: string;
  status: "completed" | "completed_with_rejections" | "failed";
  polledTargets: number;
  insertedRows: number;
  rejectedRows: number;
  rejectionReasons: Record<CrwRejectReason, number>;
  finishedAt: string;
  error?: string | null;
}

interface RunCrwIngestionDependencies {
  resolvePath?: typeof resolveDatabasePath;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
  staleAfterMs?: number;
  targets?: CrwTargetConfig[];
  fetchData?: typeof fetchCoralReefWatchData;
  parseData?: typeof parseCoralReefWatchData;
  mapData?: typeof mapCrwRecords;
  logLine?: (line: string) => void;
}

export function loadConfiguredCrwTargets(env = process.env): CrwTargetConfig[] {
  const configured = env.CRW_TARGET_REGIONS;

  if (!configured) {
    return [
      { region: "Southeast Florida" },
      { region: "Florida Keys" },
    ];
  }

  return configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((region) => ({ region }));
}

function includesRequiredSchemaFields(availableFields: string[]): boolean {
  const lowered = new Set(availableFields.map((field) => field.toLowerCase()));

  return REQUIRED_SCHEMA_FIELD_GROUPS.every((group) => group.some((field) => lowered.has(field)));
}

function isImpossibleValue(value: number | null, min: number, max: number): boolean {
  if (value === null) {
    return true;
  }

  return value < min || value > max;
}

function logDiagnostic(writeLine: ((line: string) => void) | undefined, message: string) {
  writeLine?.(`[run-crw] ${message}`);
}

function summarizeCrwBodyPreview(body: string): string {
  return body.slice(0, 500);
}

function selectLatestTargetRecord(target: CrwTargetConfig, rows: CrwParsedRecord[]): CrwParsedRecord | null {
  const sorted = [...rows].sort((left, right) => (right.observedAt ?? 0) - (left.observedAt ?? 0));

  return (
    sorted.find((row) => {
      if (target.stationId) {
        return row.stationId === target.stationId;
      }

      return row.region.toLowerCase() === target.region.toLowerCase();
    }) ?? null
  );
}

export function validateCrwRecord(
  record: CrwParsedRecord,
  now: number,
  staleAfterMs: number,
  db: SqliteDatabaseLike,
): CrwRejectReason | null {
  if (
    record.observedAt === null
    || record.sstAnomalyC === null
    || record.hotSpotC === null
    || record.dhw === null
  ) {
    return "schema_drift";
  }

  if (now - record.observedAt > staleAfterMs) {
    return "timestamp_stale";
  }

  if (
    isImpossibleValue(record.sstAnomalyC, -8, 10)
    || isImpossibleValue(record.hotSpotC, 0, 20)
    || isImpossibleValue(record.dhw, 0, 40)
  ) {
    return "impossible_values";
  }

  if (
    reefStressSnapshotExists(
      db,
      record.stationId,
      record.region,
      record.observedAt,
      CRW_SOURCE,
    )
  ) {
    return "duplicate_record";
  }

  return null;
}

export async function runCrwIngestion(
  dependencies: RunCrwIngestionDependencies = {},
): Promise<RunCrwIngestionResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const nowFn = dependencies.now ?? Date.now;
  const staleAfterMs = dependencies.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const targets = (dependencies.targets ?? loadConfiguredCrwTargets()).filter((target) => target.enabled !== false);
  const fetchData = dependencies.fetchData ?? fetchCoralReefWatchData;
  const parseData = dependencies.parseData ?? parseCoralReefWatchData;
  const mapData = dependencies.mapData ?? mapCrwRecords;
  const logLine = dependencies.logLine;
  const configuredSourceOverride = process.env.CRW_SOURCE_URL?.trim() ?? "";

  const startedAt = nowFn();
  const dbPath = resolvePath();
  logDiagnostic(logLine, `resolved DB path: ${dbPath}`);
  const db = openWritable(dbPath);

  logDiagnostic(logLine, `configured target count: ${targets.length}`);

  ensureIngestionRunsTable(db);
  ensureProvenanceRecordsTable(db);
  ensureStationMetricsTable(db);
  ensureDerivedSignalsTable(db);

  const runId = createIngestionRun(db, {
    source: CRW_SOURCE,
    startedAt,
    stationCount: targets.length,
  });

  let insertedRows = 0;
  let rejectedRows = 0;

  const rejectionReasons: Record<CrwRejectReason, number> = {
    timestamp_stale: 0,
    impossible_values: 0,
    duplicate_record: 0,
    schema_drift: 0,
  };

  try {
    if (targets.length === 0) {
      throw new Error("CRW ingestion misconfigured: CRW_TARGET_REGIONS resolved to zero enabled targets.");
    }

    for (const target of targets) {
      const sourceUrl = configuredSourceOverride
        ? resolveDefaultCrwSourceUrl()
        : buildCrwRegionalVirtualStationDataUrl(target.region);
      logDiagnostic(logLine, `fetching source ${sourceUrl}`);
      const fetched = await fetchData({ sourceUrl });
      logDiagnostic(logLine, `fetched source ${fetched.sourceUrl}`);
      logDiagnostic(logLine, `fetched HTTP status: ${fetched.statusCode}`);
      logDiagnostic(logLine, `fetched content-type: ${fetched.contentType ?? "unknown"}`);
      logDiagnostic(logLine, `fetched body length: ${fetched.body.length}`);
      logDiagnostic(logLine, `fetched body preview:\n${summarizeCrwBodyPreview(fetched.body)}`);
      const parsed = parseData(fetched.body);
      logDiagnostic(logLine, `fetched record count before validation: ${parsed.records.length}`);

      if (parsed.records.length === 0) {
        throw new Error(`CRW fetch returned no usable records from ${fetched.sourceUrl}`);
      }

      if (!includesRequiredSchemaFields(parsed.availableFields)) {
        throw new Error(`CRW schema drift: required fields missing from ${fetched.sourceUrl}`);
      }

      const record = selectLatestTargetRecord(target, parsed.records);
      if (!record) {
        throw new Error(`CRW target "${target.region}" returned no usable records from ${fetched.sourceUrl}`);
      }

      const now = nowFn();
      const rejection = validateCrwRecord(record, now, staleAfterMs, db);

      if (rejection) {
        rejectedRows += 1;
        rejectionReasons[rejection] += 1;
        continue;
      }

      const mapped = mapData([record]);

      for (const metric of mapped.metrics) {
        const metricId = insertStationMetric(db, {
          stationId: metric.stationId,
          regionKey: metric.region,
          metricType: metric.metricType,
          metricValue: metric.metricValue,
          metricUnit: metric.metricUnit,
          source: CRW_SOURCE,
          observedAt: metric.observedAt,
          ingestionRunId: runId,
          sourceTimestamp: metric.sourceTimestamp,
          sourceReference: fetched.sourceUrl,
          createdAt: now,
        });

        insertProvenanceRecord(db, {
          ingestionRunId: runId,
          source: CRW_SOURCE,
          sourceStationId: metric.stationId ?? metric.region,
          sourceTimestamp: metric.sourceTimestamp,
          sourceReference: fetched.sourceUrl,
          recordType: "station_metric",
          recordId: metricId,
          payload: {
            region: metric.region,
            metricType: metric.metricType,
            metricValue: metric.metricValue,
          },
          createdAt: now,
        });

        insertedRows += 1;
      }

      for (const signal of mapped.signals) {
        const signalId = insertDerivedSignal(db, {
          stationId: signal.stationId,
          regionKey: signal.region,
          signalType: signal.signalType,
          signalValue: signal.signalValue,
          signalLabel: signal.signalLabel,
          severity: signal.severity,
          source: CRW_SOURCE,
          observedAt: signal.observedAt,
          ingestionRunId: runId,
          sourceTimestamp: signal.sourceTimestamp,
          sourceReference: fetched.sourceUrl,
          createdAt: now,
        });

        insertProvenanceRecord(db, {
          ingestionRunId: runId,
          source: CRW_SOURCE,
          sourceStationId: signal.stationId ?? signal.region,
          sourceTimestamp: signal.sourceTimestamp,
          sourceReference: fetched.sourceUrl,
          recordType: "derived_signal",
          recordId: signalId,
          payload: {
            region: signal.region,
            signalType: signal.signalType,
            signalLabel: signal.signalLabel,
            severity: signal.severity,
          },
          createdAt: now,
        });

        insertedRows += 1;
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
      polledTargets: targets.length,
      insertedRows,
      rejectedRows,
      rejectionReasons,
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
      polledTargets: targets.length,
      insertedRows,
      rejectedRows,
      rejectionReasons,
      finishedAt: new Date(failedAt).toISOString(),
      error: message,
    };
  } finally {
    db.close();
  }
}
