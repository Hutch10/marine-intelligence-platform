import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type {
  MarineAlertCreateInput,
  MarineAlertCreateResult,
  MarineAlertListFilters,
  MarineAlertListResult,
  MarineAlertMutationResult,
  MarineAlertRecord,
  MarineAlertRuleType,
  MarineAlertStatus,
  MarineEventSeverity,
} from "../marine-intelligence-types";

const VALID_STATUSES = new Set<MarineAlertStatus>([
  "active",
  "acknowledged",
  "resolved",
]);

const VALID_SEVERITIES = new Set<MarineEventSeverity>([
  "low",
  "medium",
  "high",
  "critical",
]);

const VALID_RULE_TYPES = new Set<MarineAlertRuleType>([
  "threshold_breach",
  "trend_detected",
  "contextual_convergence",
]);

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

interface MarineAlertRepositoryDeps {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

export type MarineAlertsRepositoryCreateResult =
  | { source: "db"; result: MarineAlertCreateResult }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

export type MarineAlertsRepositoryListResult =
  | { source: "db"; result: MarineAlertListResult }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

export type MarineAlertsRepositoryMutationResult =
  | {
      source: "db";
      result: MarineAlertMutationResult & { alert: MarineAlertRecord | null };
    }
  | {
      source: "unavailable";
      fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
    };

interface MarineAlertRow {
  id: string;
  event_id: string;
  investigation_id: string | null;
  severity: string;
  status: string;
  rule_type: string;
  title: string;
  detail: string | null;
  detected_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

function normalizeText(value: string | undefined | null): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeIsoTimestamp(value: string | undefined | null): string | null {
  const norm = normalizeText(value);
  if (!norm) return null;
  const ts = Date.parse(norm);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
}

function normalizeSeverity(v: string): MarineEventSeverity | null {
  return VALID_SEVERITIES.has(v as MarineEventSeverity)
    ? (v as MarineEventSeverity)
    : null;
}

function normalizeStatus(v: string): MarineAlertStatus | null {
  return VALID_STATUSES.has(v as MarineAlertStatus)
    ? (v as MarineAlertStatus)
    : null;
}

function normalizeRuleType(v: string): MarineAlertRuleType | null {
  return VALID_RULE_TYPES.has(v as MarineAlertRuleType)
    ? (v as MarineAlertRuleType)
    : null;
}

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.floor(limit as number), 1), MAX_LIMIT);
}

function runStatement(
  stmt: { all(...p: unknown[]): unknown[]; run?(...p: unknown[]): unknown },
  ...params: unknown[]
) {
  if (typeof stmt.run === "function") {
    stmt.run(...params);
    return;
  }
  stmt.all(...params);
}

function mapRow(row: MarineAlertRow): MarineAlertRecord {
  return {
    id: row.id,
    eventId: row.event_id,
    investigationId: row.investigation_id,
    severity: normalizeSeverity(row.severity) ?? "low",
    status: normalizeStatus(row.status) ?? "active",
    ruleType: normalizeRuleType(row.rule_type) ?? "threshold_breach",
    title: row.title,
    detail: row.detail,
    detectedAt: row.detected_at,
    acknowledgedAt: row.acknowledged_at,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function nextAlertId(db: SqliteDatabaseLike, nowMs: number): string {
  const rows = db
    .prepare("SELECT COUNT(*) AS total FROM marine_intelligence_alerts")
    .all() as Array<{ total: number }>;
  const total = Number(rows[0]?.total ?? 0);
  return `MALT-${nowMs}-${total + 1}`;
}

export function ensureMarineAlertTables(db: SqliteDatabaseLike) {
  runStatement(
    db.prepare(`
      CREATE TABLE IF NOT EXISTS marine_intelligence_alerts (
        id TEXT PRIMARY KEY,
        event_id TEXT NOT NULL,
        investigation_id TEXT,
        severity TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        rule_type TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        detected_at TEXT NOT NULL,
        acknowledged_at TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )
    `),
  );

  runStatement(
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_alerts_event
       ON marine_intelligence_alerts (event_id)`,
    ),
  );

  runStatement(
    db.prepare(
      `CREATE INDEX IF NOT EXISTS idx_alerts_status_severity
       ON marine_intelligence_alerts (status, severity, detected_at DESC)`,
    ),
  );
}

function validateAlertInput(
  input: MarineAlertCreateInput,
): { ok: true } | { ok: false; error: string } {
  if (!normalizeText(input.eventId)) {
    return { ok: false, error: "eventId is required" };
  }
  if (!normalizeSeverity(input.severity)) {
    return { ok: false, error: "severity is invalid" };
  }
  if (!normalizeRuleType(input.ruleType)) {
    return { ok: false, error: "ruleType is invalid" };
  }
  if (!normalizeText(input.title)) {
    return { ok: false, error: "title is required" };
  }
  if (input.detectedAt && !normalizeIsoTimestamp(input.detectedAt)) {
    return { ok: false, error: "detectedAt must be a valid ISO timestamp" };
  }
  return { ok: true };
}

export function createMarineAlert(
  input: MarineAlertCreateInput,
  dependencies: MarineAlertRepositoryDeps = {},
): MarineAlertsRepositoryCreateResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;

  const validation = validateAlertInput(input);

  if (!validation.ok) {
    return {
      source: "db",
      result: {
        ok: false,
        reason: "validation",
        error: validation.error,
        alert: null,
      },
    };
  }

  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureMarineAlertTables(db);

    const nowMs = now();
    const nowIso = new Date(nowMs).toISOString();
    const id = nextAlertId(db, nowMs);
    const detectedAt = normalizeIsoTimestamp(input.detectedAt) ?? nowIso;

    runStatement(
      db.prepare(`
        INSERT INTO marine_intelligence_alerts
          (id, event_id, investigation_id, severity, status, rule_type,
           title, detail, detected_at, acknowledged_at, resolved_at,
           created_at, updated_at)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, NULL, NULL, ?, ?)
      `),
      id,
      input.eventId.trim(),
      input.investigationId ?? null,
      input.severity,
      input.ruleType,
      input.title.trim(),
      input.detail ?? null,
      detectedAt,
      nowIso,
      nowIso,
    );

    const rows = db
      .prepare("SELECT * FROM marine_intelligence_alerts WHERE id = ?")
      .all(id) as MarineAlertRow[];

    const alert = rows[0] ? mapRow(rows[0]) : null;
    return { source: "db", result: { ok: true, alert } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }
}

export function listMarineAlerts(
  filters: MarineAlertListFilters = {},
  dependencies: MarineAlertRepositoryDeps = {},
): MarineAlertsRepositoryListResult {
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
    const clauses: string[] = [];
    const params: unknown[] = [];

    if (filters.eventId) {
      clauses.push("event_id = ?");
      params.push(filters.eventId.trim());
    }
    if (filters.investigationId) {
      clauses.push("investigation_id = ?");
      params.push(filters.investigationId.trim());
    }
    if (filters.status) {
      clauses.push("status = ?");
      params.push(filters.status);
    }
    if (filters.severity) {
      clauses.push("severity = ?");
      params.push(filters.severity);
    }
    if (filters.ruleType) {
      clauses.push("rule_type = ?");
      params.push(filters.ruleType);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
    const limit = normalizeLimit(filters.limit);

    params.push(limit);

    const rows = db
      .prepare(
        `SELECT * FROM marine_intelligence_alerts
         ${where}
         ORDER BY detected_at DESC
         LIMIT ?`,
      )
      .all(...params) as MarineAlertRow[];

    return { source: "db", result: { ok: true, alerts: rows.map(mapRow) } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }
}

export function acknowledgeMarineAlert(
  id: string,
  dependencies: MarineAlertRepositoryDeps = {},
): MarineAlertsRepositoryMutationResult {
  return updateAlertStatus(id, "acknowledged", dependencies);
}

export function resolveMarineAlert(
  id: string,
  dependencies: MarineAlertRepositoryDeps = {},
): MarineAlertsRepositoryMutationResult {
  return updateAlertStatus(id, "resolved", dependencies);
}

function updateAlertStatus(
  id: string,
  newStatus: MarineAlertStatus,
  dependencies: MarineAlertRepositoryDeps,
): MarineAlertsRepositoryMutationResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;

  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return { source: "unavailable", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(dbPath);
  } catch {
    return { source: "unavailable", fallbackReason: "db_open_failed" };
  }

  try {
    ensureMarineAlertTables(db);

    const rows = db
      .prepare("SELECT * FROM marine_intelligence_alerts WHERE id = ?")
      .all(id) as MarineAlertRow[];

    if (!rows[0]) {
      return {
        source: "db",
        result: {
          ok: false,
          reason: "not_found",
          error: `Alert ${id} not found`,
          alert: null,
        },
      };
    }

    const nowIso = new Date(now()).toISOString();
    const previous = rows[0];
    const acknowledgedAt =
      newStatus === "acknowledged" ? nowIso : previous.acknowledged_at;
    const resolvedAt =
      newStatus === "resolved" ? nowIso : previous.resolved_at;

    runStatement(
      db.prepare(`
        UPDATE marine_intelligence_alerts
        SET status = ?, updated_at = ?, acknowledged_at = ?, resolved_at = ?
        WHERE id = ?
      `),
      newStatus,
      nowIso,
      acknowledgedAt,
      resolvedAt,
      id,
    );

    const updatedRows = db
      .prepare("SELECT * FROM marine_intelligence_alerts WHERE id = ?")
      .all(id) as MarineAlertRow[];

    const alert = updatedRows[0] ? mapRow(updatedRows[0]) : null;
    return { source: "db", result: { ok: true, alert } };
  } catch {
    return { source: "unavailable", fallbackReason: "db_query_failed" };
  }
}
