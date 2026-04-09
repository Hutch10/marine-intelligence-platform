import type {
  CreateSignalInput,
  SignalDetection,
  SignalSeverity,
  SignalStatus,
  SignalType,
} from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
} from "../db/client";
import type { RecordInvestigationEventInput } from "./investigation-events";
import type { SignalFallbackReason } from "../types";

interface SignalRow {
  id: string;
  signal_type: string;
  severity: string;
  confidence: number | string;
  source_type: string;
  source_id: string;
  region: string;
  station_id: string | null;
  title: string;
  summary: string;
  detail: string;
  status: string;
  detected_at: number | string;
  created_at: number | string;
  updated_at: number | string;
  linked_investigation_id: string | null;
}

const VALID_SIGNAL_TYPES = new Set<SignalType>([
  "thermal_anomaly",
  "oxygen_depletion",
  "migration_anomaly",
  "chlorophyll_bloom",
  "current_shear",
  "station_health",
]);

const VALID_SIGNAL_SEVERITIES = new Set<SignalSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);

const VALID_SIGNAL_STATUSES = new Set<SignalStatus>([
  "open",
  "monitoring",
  "promoted",
  "dismissed",
]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export interface SignalListFilters {
  signalType?: SignalType;
  severity?: SignalSeverity;
  status?: SignalStatus;
  region?: string;
  stationId?: string;
  limit?: number | string;
}

export type SignalsListResult =
  | { source: "db"; signals: SignalDetection[] }
  | { source: "mock"; fallbackReason: SignalFallbackReason };

export type SignalDetailResult =
  | { source: "db"; result: "found"; signal: SignalDetection }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: SignalFallbackReason };

export type SignalCreateResult =
  | { source: "db"; result: "created"; signal: SignalDetection }
  | { source: "mock"; fallbackReason: SignalFallbackReason };

export type SignalPromoteResult =
  | { source: "db"; result: "promoted"; signal: SignalDetection }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: SignalFallbackReason };

export type SignalDismissResult =
  | { source: "db"; result: "dismissed"; signal: SignalDetection }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: SignalFallbackReason };

interface SignalsRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
  recordEvent?: (input: RecordInvestigationEventInput) => unknown;
}

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

function normalizeSignalType(value: string): SignalType {
  if (VALID_SIGNAL_TYPES.has(value as SignalType)) {
    return value as SignalType;
  }

  return "station_health";
}

function normalizeSeverity(value: string): SignalSeverity {
  if (VALID_SIGNAL_SEVERITIES.has(value as SignalSeverity)) {
    return value as SignalSeverity;
  }

  return "low";
}

function normalizeStatus(value: string): SignalStatus {
  if (VALID_SIGNAL_STATUSES.has(value as SignalStatus)) {
    return value as SignalStatus;
  }

  return "open";
}

function normalizeConfidence(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function normalizeTimestamp(value: number | string, now: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) {
      return asNumber;
    }

    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return now;
}

function toSignal(row: SignalRow, now: number): SignalDetection {
  return {
    id: row.id,
    signalType: normalizeSignalType(row.signal_type),
    severity: normalizeSeverity(row.severity),
    confidence: normalizeConfidence(row.confidence),
    sourceType: row.source_type,
    sourceId: row.source_id,
    region: row.region,
    stationId: row.station_id,
    title: row.title,
    summary: row.summary,
    detail: row.detail,
    status: normalizeStatus(row.status),
    detectedAt: new Date(normalizeTimestamp(row.detected_at, now)).toISOString(),
    createdAt: new Date(normalizeTimestamp(row.created_at, now)).toISOString(),
    updatedAt: new Date(normalizeTimestamp(row.updated_at, now)).toISOString(),
    linkedInvestigationId: row.linked_investigation_id,
  };
}

function normalizeLimit(rawLimit: number | string | undefined): number {
  if (rawLimit === undefined) {
    return DEFAULT_LIMIT;
  }

  const parsed = typeof rawLimit === "string" ? Number(rawLimit) : rawLimit;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.floor(parsed), MAX_LIMIT);
}

function ensureSignalDetectionsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS signal_detections (
        id TEXT PRIMARY KEY,
        signal_type TEXT NOT NULL,
        severity TEXT NOT NULL,
        confidence INTEGER NOT NULL,
        source_type TEXT NOT NULL,
        source_id TEXT NOT NULL,
        region TEXT NOT NULL,
        station_id TEXT REFERENCES stations(id),
        title TEXT NOT NULL,
        summary TEXT NOT NULL,
        detail TEXT NOT NULL,
        status TEXT NOT NULL,
        detected_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        linked_investigation_id TEXT REFERENCES investigations(id)
      )`,
    ),
  );
}

function createSignalId(now: number): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { randomUUID } = runtimeRequire("node:crypto") as { randomUUID: () => string };
  return `SIG-${now}-${randomUUID()}`;
}

function getRecordInvestigationEvent(): ((input: RecordInvestigationEventInput) => unknown) | null {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("./investigation-events") as {
      recordInvestigationEvent: (input: RecordInvestigationEventInput) => unknown;
    };

    return repository.recordInvestigationEvent;
  } catch {
    return null;
  }
}

function findSignalById(db: SqliteDatabaseLike, signalId: string): SignalRow | null {
  const row = toStatement(
    db,
    `SELECT id, signal_type, severity, confidence, source_type, source_id, region, station_id,
            title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id
     FROM signal_detections
     WHERE id = ?
     LIMIT 1`,
  ).all(signalId)[0] as SignalRow | undefined;

  return row ?? null;
}

function investigationExists(db: SqliteDatabaseLike, investigationId: string): boolean {
  const row = toStatement(
    db,
    "SELECT id FROM investigations WHERE id = ? LIMIT 1",
  ).all(investigationId) as Array<{ id: string }>;

  return row.length > 0;
}

export function listSignals(
  filters: SignalListFilters = {},
  dependencies: SignalsRepositoryDependencies = {},
): SignalsListResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();
  console.log("[signals] resolved databasePath:", databasePath);
  const has = hasPath(databasePath);
  console.log("[signals] hasPath:", has);
  if (!has) {
    console.log("[signals] DB path missing, returning fallback");
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    console.log("[signals] opening database");
    db = openReadOnly(databasePath);
    console.log("[signals] database opened");
  } catch (e) {
    console.log("[signals] DB open failed:", e);
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    console.log("[signals] preparing and running query");
    ensureSignalDetectionsTable(db);

    const whereClauses: string[] = [];
    const params: unknown[] = [];

    if (filters.signalType) {
      whereClauses.push("signal_type = ?");
      params.push(filters.signalType);
    }

    if (filters.severity) {
      whereClauses.push("severity = ?");
      params.push(filters.severity);
    }

    if (filters.status) {
      whereClauses.push("status = ?");
      params.push(filters.status);
    }

    if (filters.region?.trim()) {
      whereClauses.push("LOWER(region) = ?");
      params.push(filters.region.trim().toLowerCase());
    }

    if (filters.stationId?.trim()) {
      whereClauses.push("station_id = ?");
      params.push(filters.stationId.trim());
    }

    const whereSql = whereClauses.length > 0 ? `WHERE ${whereClauses.join(" AND ")}` : "";

    const rows = toStatement(
      db,
      `SELECT id, signal_type, severity, confidence, source_type, source_id, region, station_id,
              title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id
       FROM signal_detections
       ${whereSql}
       ORDER BY detected_at DESC, id DESC
       LIMIT ?`,
    ).all(...params, normalizeLimit(filters.limit)) as SignalRow[];
    console.log("[signals] query returned rows:", rows.length);
    return {
      source: "db",
      signals: rows.map((row) => toSignal(row, now())),
    };
  } catch (e) {
    console.log("[signals] DB query failed:", e);
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
    console.log("[signals] db closed");
  }
}

export function getSignalById(
  signalId: string,
  dependencies: SignalsRepositoryDependencies = {},
): SignalDetailResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openReadOnly = dependencies.openReadOnly ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    ensureSignalDetectionsTable(db);
    const signalRow = findSignalById(db, signalId);

    if (!signalRow) {
      return { source: "db", result: "not_found" };
    }

    return {
      source: "db",
      result: "found",
      signal: toSignal(signalRow, now()),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function createSignal(
  input: CreateSignalInput,
  dependencies: SignalsRepositoryDependencies = {},
): SignalCreateResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    ensureSignalDetectionsTable(db);

    const createdAt = now();
    const id = createSignalId(createdAt);
    const status = input.status && VALID_SIGNAL_STATUSES.has(input.status) ? input.status : "open";

    runStatement(
      toStatement(
        db,
        `INSERT INTO signal_detections
          (id, signal_type, severity, confidence, source_type, source_id, region, station_id, title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ),
      id,
      input.signalType,
      input.severity,
      input.confidence,
      input.sourceType,
      input.sourceId,
      input.region,
      input.stationId?.trim() ? input.stationId.trim() : null,
      input.title,
      input.summary,
      input.detail,
      status,
      createdAt,
      createdAt,
      createdAt,
      input.linkedInvestigationId?.trim() ? input.linkedInvestigationId.trim() : null,
    );

    const signal = findSignalById(db, id);

    if (!signal) {
      return { source: "mock", fallbackReason: "db_query_failed" };
    }

    return {
      source: "db",
      result: "created",
      signal: toSignal(signal, now()),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function promoteSignalToInvestigation(
  signalId: string,
  investigationId: string,
  actor: string | undefined,
  dependencies: SignalsRepositoryDependencies = {},
): SignalPromoteResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const recordEvent = dependencies.recordEvent ?? getRecordInvestigationEvent();
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    ensureSignalDetectionsTable(db);

    const existingSignal = findSignalById(db, signalId);

    if (!existingSignal) {
      return { source: "db", result: "not_found" };
    }

    if (!investigationExists(db, investigationId)) {
      return { source: "db", result: "not_found" };
    }

    runStatement(
      toStatement(
        db,
        `UPDATE signal_detections
         SET status = ?, linked_investigation_id = ?, updated_at = ?
         WHERE id = ?`,
      ),
      "promoted",
      investigationId,
      now(),
      signalId,
    );

    const promotedSignal = findSignalById(db, signalId);

    if (!promotedSignal) {
      return { source: "db", result: "not_found" };
    }

    const mappedSignal = toSignal(promotedSignal, now());

    if (recordEvent) {
      try {
        recordEvent({
          investigationId,
          eventType: "signal_linked",
          source: "Signal Detection Engine",
          actor: actor?.trim() || "System",
          summary: `Promoted signal ${mappedSignal.id} to ${investigationId}`,
          detail: mappedSignal.summary,
          confidence: mappedSignal.confidence,
        });
      } catch {
        // Event sync is best-effort and should not block signal promotion.
      }
    }

    return {
      source: "db",
      result: "promoted",
      signal: mappedSignal,
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function dismissSignal(
  signalId: string,
  _actor: string | undefined,
  dependencies: SignalsRepositoryDependencies = {},
): SignalDismissResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    ensureSignalDetectionsTable(db);

    const existingSignal = findSignalById(db, signalId);

    if (!existingSignal) {
      return { source: "db", result: "not_found" };
    }

    runStatement(
      toStatement(
        db,
        `UPDATE signal_detections
         SET status = ?, updated_at = ?
         WHERE id = ?`,
      ),
      "dismissed",
      now(),
      signalId,
    );

    const dismissedSignal = findSignalById(db, signalId);

    if (!dismissedSignal) {
      return { source: "db", result: "not_found" };
    }

    return {
      source: "db",
      result: "dismissed",
      signal: toSignal(dismissedSignal, now()),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
