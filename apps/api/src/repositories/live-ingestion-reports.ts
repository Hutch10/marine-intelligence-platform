import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";
import type { LiveFeedIngestionReport, SourceIngestionTelemetry } from "../workers/ingest-live-feeds";
import type { NdbcStationIngestionDiagnostic } from "../services/ingestion/run-ndbc";

export type LiveIngestionReportFallbackReason =
  | "db_path_missing"
  | "db_open_failed"
  | "db_query_failed";

export interface LiveIngestionHistoryItem {
  reportId: string;
  workerRunId: string;
  source: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  insertedCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  status: string;
  runId: string | null;
  error: string | null;
  workerStatus: string;
  stationDiagnostics: NdbcStationIngestionDiagnostic[];
}

export interface LiveIngestionLatestSourceStatus {
  source: string;
  workerRunId: string;
  workerStatus: string;
  status: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  insertedCount: number;
  rejectedCount: number;
  rejectionReasons: Record<string, number>;
  runId: string | null;
  error: string | null;
  stationDiagnostics: NdbcStationIngestionDiagnostic[];
}

interface LiveIngestionReportRow {
  id: string;
  worker_run_id: string;
  source: string;
  started_at: number | string;
  completed_at: number | string;
  duration_ms: number | string;
  inserted_count: number | string;
  rejected_count: number | string;
  rejection_reasons_json: string;
  status: string;
  run_id: string | null;
  error: string | null;
  worker_status: string;
  station_diagnostics_json: string | null;
}

interface LiveIngestionLatestRow {
  source: string;
  worker_run_id: string;
  worker_status: string;
  status: string;
  started_at: number | string;
  completed_at: number | string;
  duration_ms: number | string;
  inserted_count: number | string;
  rejected_count: number | string;
  rejection_reasons_json: string;
  run_id: string | null;
  error: string | null;
  station_diagnostics_json: string | null;
}

interface WorkerRunInsertInput {
  workerRunId: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  status: string;
  insertedCount: number;
  rejectedCount: number;
  rejectionReasonsJson: string;
  createdAt: number;
}

interface SourceReportInsertInput {
  reportId: string;
  workerRunId: string;
  source: string;
  startedAt: number;
  completedAt: number;
  durationMs: number;
  insertedCount: number;
  rejectedCount: number;
  rejectionReasonsJson: string;
  status: string;
  runId: string | null;
  error: string | null;
  stationDiagnosticsJson: string;
  createdAt: number;
}

interface LiveIngestionReportsRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

export type LiveIngestionHistoryReadResult =
  | { source: "db"; history: LiveIngestionHistoryItem[] }
  | { source: "unavailable"; fallbackReason: LiveIngestionReportFallbackReason };

export type LiveIngestionLatestStatusReadResult =
  | { source: "db"; latest: LiveIngestionLatestSourceStatus[] }
  | { source: "unavailable"; fallbackReason: LiveIngestionReportFallbackReason };

export interface LiveIngestionSourceHealthStatus extends LiveIngestionLatestSourceStatus {
  isStale: boolean;
  staleByMs: number | null;
}

export interface LiveIngestionHealthSummary {
  latestSourceCount: number;
  healthySourceCount: number;
  degradedSourceCount: number;
  failedSourceCount: number;
  staleSourceCount: number;
  insertedCount: number;
  rejectedCount: number;
  recentHistoryCount: number;
  lastCompletedAt: string | null;
}

export interface LiveIngestionHealthSnapshot {
  generatedAt: string;
  staleAfterMs: number;
  summary: LiveIngestionHealthSummary;
  latestBySource: LiveIngestionSourceHealthStatus[];
  recentHistory: LiveIngestionHistoryItem[];
}

export interface LiveIngestionHealthSnapshotReadOptions {
  limit?: number;
  staleAfterMs?: number;
  now?: () => number;
}

export type LiveIngestionHealthSnapshotReadResult =
  | { source: "db"; snapshot: LiveIngestionHealthSnapshot }
  | { source: "unavailable"; fallbackReason: LiveIngestionReportFallbackReason };

export interface LiveIngestionPersistResult {
  workerRunId: string;
  sourceReportIds: string[];
}

const DEFAULT_HEALTH_HISTORY_LIMIT = 20;
const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

function toStatement(db: SqliteDatabaseLike, sql: string): SqliteStatementLike {
  return db.prepare(sql);
}

function runStatement(statement: SqliteStatementLike, ...params: unknown[]) {
  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

function toEpochMs(value: string | number): number {
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

  return 0;
}

function toIso(value: string | number): string {
  return new Date(toEpochMs(value)).toISOString();
}

function toSafeNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseRejectionReasons(value: string): Record<string, number> {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: Record<string, number> = {};

    for (const [key, count] of Object.entries(parsed as Record<string, unknown>)) {
      const asNumber = Number(count);
      if (Number.isFinite(asNumber)) {
        result[key] = asNumber;
      }
    }

    return result;
  } catch {
    return {};
  }
}

function parseStationDiagnostics(value: string | null): NdbcStationIngestionDiagnostic[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") {
        return [];
      }

      const candidate = item as Record<string, unknown>;
      const coverage = candidate.usableMetricCoverage;
      if (typeof candidate.stationId !== "string" || !coverage || typeof coverage !== "object") {
        return [];
      }

      const coverageObject = coverage as Record<string, unknown>;
      const metricsPresent = Array.isArray(coverageObject.metricsPresent)
        ? coverageObject.metricsPresent.filter((metric): metric is string => typeof metric === "string")
        : [];
      const rawMissingFieldRates = (
        candidate.missingFieldRates && typeof candidate.missingFieldRates === "object" && !Array.isArray(candidate.missingFieldRates)
          ? candidate.missingFieldRates
          : {}
      ) as Record<string, unknown>;
      const rejectionBreakdown: Record<string, number> = {};
      const rawBreakdown = candidate.rejectionBreakdown;

      if (rawBreakdown && typeof rawBreakdown === "object" && !Array.isArray(rawBreakdown)) {
        for (const [reason, count] of Object.entries(rawBreakdown as Record<string, unknown>)) {
          const numeric = Number(count);
          if (Number.isFinite(numeric)) {
            rejectionBreakdown[reason] = numeric;
          }
        }
      }

      return [{
        stationId: candidate.stationId,
        status:
          candidate.status === "healthy" || candidate.status === "degraded" || candidate.status === "failed"
            ? candidate.status
            : "failed",
        lastSuccessfulIngestionAt:
          typeof candidate.lastSuccessfulIngestionAt === "string"
            ? candidate.lastSuccessfulIngestionAt
            : typeof candidate.latestSuccessTimestamp === "string"
              ? candidate.latestSuccessTimestamp
              : null,
        latestObservationTimestamp:
          typeof candidate.latestObservationTimestamp === "string" ? candidate.latestObservationTimestamp : null,
        latestObservationAgeMs:
          typeof candidate.latestObservationAgeMs === "number" && Number.isFinite(candidate.latestObservationAgeMs)
            ? candidate.latestObservationAgeMs
            : typeof candidate.rowAgeMs === "number" && Number.isFinite(candidate.rowAgeMs)
              ? candidate.rowAgeMs
              : null,
        usableMetricCoverage: {
          presentCount: Number.isFinite(Number(coverageObject.presentCount))
            ? Number(coverageObject.presentCount)
            : 0,
          totalCount: Number.isFinite(Number(coverageObject.totalCount))
            ? Number(coverageObject.totalCount)
            : 4,
          metricsPresent,
        },
        missingFieldRates: {
          seaSurfaceTempC: Number.isFinite(Number(rawMissingFieldRates.seaSurfaceTempC))
            ? Number(rawMissingFieldRates.seaSurfaceTempC)
            : 1,
          waveHeightM: Number.isFinite(Number(rawMissingFieldRates.waveHeightM))
            ? Number(rawMissingFieldRates.waveHeightM)
            : 1,
          windSpeedMps: Number.isFinite(Number(rawMissingFieldRates.windSpeedMps))
            ? Number(rawMissingFieldRates.windSpeedMps)
            : 1,
          pressureHpa: Number.isFinite(Number(rawMissingFieldRates.pressureHpa))
            ? Number(rawMissingFieldRates.pressureHpa)
            : 1,
        },
        rejectionBreakdown,
        lastFetchUrl: typeof candidate.lastFetchUrl === "string" ? candidate.lastFetchUrl : null,
      } satisfies NdbcStationIngestionDiagnostic];
    });
  } catch {
    return [];
  }
}

function hasColumn(db: SqliteDatabaseLike, tableName: string, columnName: string): boolean {
  const rows = toStatement(db, `PRAGMA table_info(${tableName})`).all() as Array<{ name?: string }>;
  return rows.some((row) => row.name === columnName);
}

function toHistoryItem(row: LiveIngestionReportRow): LiveIngestionHistoryItem {
  return {
    reportId: row.id,
    workerRunId: row.worker_run_id,
    source: row.source,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    durationMs: toSafeNumber(row.duration_ms),
    insertedCount: toSafeNumber(row.inserted_count),
    rejectedCount: toSafeNumber(row.rejected_count),
    rejectionReasons: parseRejectionReasons(row.rejection_reasons_json),
    status: row.status,
    runId: row.run_id,
    error: row.error,
    workerStatus: row.worker_status,
    stationDiagnostics: parseStationDiagnostics(row.station_diagnostics_json),
  };
}

function toLatestSourceStatus(row: LiveIngestionLatestRow): LiveIngestionLatestSourceStatus {
  return {
    source: row.source,
    workerRunId: row.worker_run_id,
    workerStatus: row.worker_status,
    status: row.status,
    startedAt: toIso(row.started_at),
    completedAt: toIso(row.completed_at),
    durationMs: toSafeNumber(row.duration_ms),
    insertedCount: toSafeNumber(row.inserted_count),
    rejectedCount: toSafeNumber(row.rejected_count),
    rejectionReasons: parseRejectionReasons(row.rejection_reasons_json),
    runId: row.run_id,
    error: row.error,
    stationDiagnostics: parseStationDiagnostics(row.station_diagnostics_json),
  };
}

export function ensureLiveIngestionWorkerRunsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS live_ingestion_worker_runs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        inserted_count INTEGER NOT NULL,
        rejected_count INTEGER NOT NULL,
        rejection_reasons_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
  );
}

export function ensureLiveIngestionReportsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS live_ingestion_reports (
        id TEXT PRIMARY KEY,
        worker_run_id TEXT NOT NULL,
        source TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        completed_at INTEGER NOT NULL,
        duration_ms INTEGER NOT NULL,
        inserted_count INTEGER NOT NULL,
        rejected_count INTEGER NOT NULL,
        rejection_reasons_json TEXT NOT NULL,
        status TEXT NOT NULL,
        run_id TEXT,
        error TEXT,
        station_diagnostics_json TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        FOREIGN KEY (worker_run_id) REFERENCES live_ingestion_worker_runs(id)
      )`,
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_live_ingestion_reports_source_started_at ON live_ingestion_reports (source, started_at)",
    ),
  );

  runStatement(
    toStatement(
      db,
      "CREATE INDEX IF NOT EXISTS idx_live_ingestion_reports_worker_run_id ON live_ingestion_reports (worker_run_id)",
    ),
  );

  if (!hasColumn(db, "live_ingestion_reports", "station_diagnostics_json")) {
    runStatement(
      toStatement(
        db,
        "ALTER TABLE live_ingestion_reports ADD COLUMN station_diagnostics_json TEXT NOT NULL DEFAULT '[]'",
      ),
    );
  }
}

export function insertLiveIngestionWorkerRun(
  db: SqliteDatabaseLike,
  input: WorkerRunInsertInput,
): string {
  runStatement(
    toStatement(
      db,
      `INSERT INTO live_ingestion_worker_runs (
        id,
        status,
        started_at,
        completed_at,
        duration_ms,
        inserted_count,
        rejected_count,
        rejection_reasons_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    input.workerRunId,
    input.status,
    input.startedAt,
    input.completedAt,
    input.durationMs,
    input.insertedCount,
    input.rejectedCount,
    input.rejectionReasonsJson,
    input.createdAt,
  );

  return input.workerRunId;
}

export function insertLiveIngestionSourceReport(
  db: SqliteDatabaseLike,
  input: SourceReportInsertInput,
): string {
  runStatement(
    toStatement(
      db,
      `INSERT INTO live_ingestion_reports (
        id,
        worker_run_id,
        source,
        started_at,
        completed_at,
        duration_ms,
        inserted_count,
        rejected_count,
        rejection_reasons_json,
        status,
        run_id,
        error,
        station_diagnostics_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    input.reportId,
    input.workerRunId,
    input.source,
    input.startedAt,
    input.completedAt,
    input.durationMs,
    input.insertedCount,
    input.rejectedCount,
    input.rejectionReasonsJson,
    input.status,
    input.runId,
    input.error,
    input.stationDiagnosticsJson,
    input.createdAt,
  );

  return input.reportId;
}

function buildWorkerRunId(now: number): string {
  return `LWR-${now}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function buildSourceReportId(source: string, startedAtMs: number): string {
  return `LRP-${source}-${startedAtMs}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export function persistLiveIngestionReport(
  report: LiveFeedIngestionReport,
  dependencies: LiveIngestionReportsRepositoryDependencies = {},
): LiveIngestionPersistResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const dbPath = resolvePath();

  const db = openWritable(dbPath);

  try {
    ensureLiveIngestionWorkerRunsTable(db);
    ensureLiveIngestionReportsTable(db);

    const persistedAt = now();
    const workerRunId = buildWorkerRunId(persistedAt);

    insertLiveIngestionWorkerRun(db, {
      workerRunId,
      status: report.status,
      startedAt: toEpochMs(report.started_at),
      completedAt: toEpochMs(report.completed_at),
      durationMs: report.duration_ms,
      insertedCount: report.inserted_count,
      rejectedCount: report.rejected_count,
      rejectionReasonsJson: JSON.stringify(report.rejection_reasons),
      createdAt: persistedAt,
    });

    const sourceReportIds = report.runs.map((run: SourceIngestionTelemetry) => {
      const reportId = buildSourceReportId(run.source, toEpochMs(run.started_at));

      insertLiveIngestionSourceReport(db, {
        reportId,
        workerRunId,
        source: run.source,
        startedAt: toEpochMs(run.started_at),
        completedAt: toEpochMs(run.completed_at),
        durationMs: run.duration_ms,
        insertedCount: run.inserted_count,
        rejectedCount: run.rejected_count,
        rejectionReasonsJson: JSON.stringify(run.rejection_reasons),
        status: run.status,
        runId: run.run_id,
        error: run.error,
        stationDiagnosticsJson: JSON.stringify(run.station_diagnostics ?? []),
        createdAt: persistedAt,
      });

      return reportId;
    });

    return {
      workerRunId,
      sourceReportIds,
    };
  } finally {
    db.close();
  }
}

export function readRecentLiveIngestionHistoryFromDb(
  db: SqliteDatabaseLike,
  limit = 50,
): LiveIngestionHistoryItem[] {
  const boundedLimit = Math.min(Math.max(Math.floor(limit), 1), 500);

  const rows = toStatement(
    db,
    `SELECT r.id,
            r.worker_run_id,
            r.source,
            r.started_at,
            r.completed_at,
            r.duration_ms,
            r.inserted_count,
            r.rejected_count,
            r.rejection_reasons_json,
            r.status,
            r.run_id,
            r.error,
            w.status AS worker_status,
            r.station_diagnostics_json
     FROM live_ingestion_reports r
     INNER JOIN live_ingestion_worker_runs w
             ON w.id = r.worker_run_id
     ORDER BY r.started_at DESC
     LIMIT ?`,
  ).all(boundedLimit) as LiveIngestionReportRow[];

  return rows.map(toHistoryItem);
}

export function readLatestLiveIngestionStatusBySourceFromDb(
  db: SqliteDatabaseLike,
): LiveIngestionLatestSourceStatus[] {
  const rows = toStatement(
    db,
    `SELECT r.source,
            r.worker_run_id,
            w.status AS worker_status,
            r.status,
            r.started_at,
            r.completed_at,
            r.duration_ms,
            r.inserted_count,
            r.rejected_count,
            r.rejection_reasons_json,
            r.run_id,
            r.error,
            r.station_diagnostics_json
     FROM live_ingestion_reports r
     INNER JOIN live_ingestion_worker_runs w
             ON w.id = r.worker_run_id
     INNER JOIN (
       SELECT source, MAX(started_at) AS started_at
       FROM live_ingestion_reports
       GROUP BY source
     ) latest
             ON latest.source = r.source
            AND latest.started_at = r.started_at
     ORDER BY r.source ASC`,
  ).all() as LiveIngestionLatestRow[];

  return rows.map(toLatestSourceStatus);
}

function toSourceHealthStatus(
  latest: LiveIngestionLatestSourceStatus,
  nowMs: number,
  staleAfterMs: number,
): LiveIngestionSourceHealthStatus {
  const completedAtMs = toEpochMs(latest.completedAt);
  const staleByMs = Math.max(0, nowMs - completedAtMs - staleAfterMs);
  const isStale = staleByMs > 0;

  return {
    ...latest,
    isStale,
    staleByMs: isStale ? staleByMs : null,
  };
}

function summarizeHealth(
  latestBySource: LiveIngestionSourceHealthStatus[],
  recentHistory: LiveIngestionHistoryItem[],
): LiveIngestionHealthSummary {
  let healthySourceCount = 0;
  let degradedSourceCount = 0;
  let failedSourceCount = 0;
  let staleSourceCount = 0;
  let insertedCount = 0;
  let rejectedCount = 0;
  let lastCompletedAtMs = 0;

  for (const latest of latestBySource) {
    if (latest.status === "success") {
      healthySourceCount += 1;
    } else if (latest.status === "failed") {
      failedSourceCount += 1;
    } else {
      degradedSourceCount += 1;
    }

    if (latest.isStale) {
      staleSourceCount += 1;
    }

    insertedCount += latest.insertedCount;
    rejectedCount += latest.rejectedCount;
    lastCompletedAtMs = Math.max(lastCompletedAtMs, toEpochMs(latest.completedAt));
  }

  return {
    latestSourceCount: latestBySource.length,
    healthySourceCount,
    degradedSourceCount,
    failedSourceCount,
    staleSourceCount,
    insertedCount,
    rejectedCount,
    recentHistoryCount: recentHistory.length,
    lastCompletedAt: lastCompletedAtMs > 0 ? new Date(lastCompletedAtMs).toISOString() : null,
  };
}

export function readLiveIngestionHealthSnapshotFromDb(
  db: SqliteDatabaseLike,
  options: LiveIngestionHealthSnapshotReadOptions = {},
): LiveIngestionHealthSnapshot {
  const now = options.now ?? Date.now;
  const historyLimit = options.limit ?? DEFAULT_HEALTH_HISTORY_LIMIT;
  const staleAfterMs = Math.max(0, Math.floor(options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS));
  const nowMs = now();

  const recentHistory = readRecentLiveIngestionHistoryFromDb(db, historyLimit);
  const latestBySource = readLatestLiveIngestionStatusBySourceFromDb(db).map((latest) =>
    toSourceHealthStatus(latest, nowMs, staleAfterMs),
  );

  return {
    generatedAt: new Date(nowMs).toISOString(),
    staleAfterMs,
    summary: summarizeHealth(latestBySource, recentHistory),
    latestBySource,
    recentHistory,
  };
}

export function listRecentLiveIngestionHistory(
  limit = 50,
  dependencies: LiveIngestionReportsRepositoryDependencies = {},
): LiveIngestionHistoryReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    return {
      source: "db",
      history: readRecentLiveIngestionHistoryFromDb(db, limit),
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function listLatestLiveIngestionStatusBySource(
  dependencies: LiveIngestionReportsRepositoryDependencies = {},
): LiveIngestionLatestStatusReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    return {
      source: "db",
      latest: readLatestLiveIngestionStatusBySourceFromDb(db),
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function getLiveIngestionHealthSnapshot(
  options: LiveIngestionHealthSnapshotReadOptions = {},
  dependencies: LiveIngestionReportsRepositoryDependencies = {},
): LiveIngestionHealthSnapshotReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    return {
      source: "db",
      snapshot: readLiveIngestionHealthSnapshotFromDb(db, options),
    };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
