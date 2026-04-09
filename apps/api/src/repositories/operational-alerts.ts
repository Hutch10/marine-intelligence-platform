import type { OperationalAlert, OperationalAlertAction, OperationalAlertRuleType, OperationalAlertSeverity, OperationalAlertStatus } from "../services/operational-alerts";
import {
  createOperationalAlertsService,
  evaluateFeedHealthForAlerts,
} from "../services/operational-alerts";
import type { LiveIngestionHealthSnapshot } from "./live-ingestion-reports";
import type { SqliteDatabaseLike } from "../db/client";
import { hasDatabasePath, resolveDatabasePath, openReadOnlyDatabase } from "../db/client";

export type { OperationalAlert, OperationalAlertAction, OperationalAlertRuleType, OperationalAlertSeverity, OperationalAlertStatus };

export interface OperationalAlertsReadResult {
  activeAlerts: OperationalAlert[];
  recentHistory: OperationalAlert[];
}

export interface OperationalAlertsReadOptions {
  status?: OperationalAlertStatus;
  source?: string;
  ruleType?: OperationalAlertRuleType;
  limit?: number;
}

export type OperationalAlertsReadResultResponse =
  | { source: "db"; result: OperationalAlertsReadResult }
  | { source: "unavailable"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

export interface OperationalAlertsSummary {
  activeAlertCount: number;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  failedSourceCount: number;
  staleSourceCount: number;
  lastUpdatedAt: string;
}

interface OperationalAlertsRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
}

interface OperationalAlertsRepositoryReadOptions extends OperationalAlertsReadOptions, OperationalAlertsRepositoryDependencies {}

interface OperationalAlertRow {
  id: string;
  source: string;
  station_id?: string | null;
  rule_type: string;
  severity: string;
  status: string;
  lifecycle_status?: string | null;
  title: string;
  detail: string | null;
  metadata_json: string | null;
  detected_at: number | string;
  resolved_at: number | string | null;
  occurrence_count?: number | string | null;
  window_started_at?: number | string | null;
  window_ends_at?: number | string | null;
  created_at: string;
  updated_at: string;
  investigation_id?: string | null;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 500;

function normalizeLimit(limit: number | undefined): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.floor(limit as number), 1), MAX_LIMIT);
}

function normalizeFilterText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function toOperationalAlert(row: OperationalAlertRow): OperationalAlert {
  const detectedAt = Number(row.detected_at);
  const occurrenceCount = Number(row.occurrence_count ?? 1) || 1;
  const windowStartedAt = Number(row.window_started_at ?? detectedAt);
  const windowEndsAt = Number(row.window_ends_at ?? windowStartedAt + 60 * 60 * 1000);

  return {
    id: row.id,
    source: row.source,
    stationId: row.station_id ?? null,
    ruleType: row.rule_type as OperationalAlertRuleType,
    severity: row.severity as OperationalAlertSeverity,
    status: row.status as OperationalAlertStatus,
    lifecycleStatus: (row.lifecycle_status === "resolved"
      ? "resolved"
      : row.lifecycle_status === "ongoing"
        ? "ongoing"
        : occurrenceCount > 1
          ? "ongoing"
          : "open"),
    title: row.title,
    detail: row.detail,
    metadataJson: row.metadata_json,
    detectedAt,
    resolvedAt: row.resolved_at == null ? null : Number(row.resolved_at),
    occurrenceCount,
    windowStartedAt,
    windowEndsAt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    investigationId: row.investigation_id ?? null,
  };
}

function getOrderByClause(status: OperationalAlertStatus | undefined): string {
  if (status === "active") {
    return "ORDER BY detected_at DESC, id ASC";
  }

  if (status === "resolved") {
    return "ORDER BY resolved_at DESC, detected_at DESC, id ASC";
  }

  return "ORDER BY COALESCE(resolved_at, detected_at) DESC, resolved_at DESC, detected_at DESC, id ASC";
}

function readOperationalAlertsRows(
  db: SqliteDatabaseLike,
  options: OperationalAlertsReadOptions,
): OperationalAlert[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (options.status) {
    where.push("status = ?");
    params.push(options.status);
  }

  const source = normalizeFilterText(options.source);
  if (source) {
    where.push("source = ?");
    params.push(source);
  }

  if (options.ruleType) {
    where.push("rule_type = ?");
    params.push(options.ruleType);
  }

  const limit = normalizeLimit(options.limit);

  const query = [
    "SELECT * FROM operational_alerts",
    where.length > 0 ? `WHERE ${where.join(" AND ")}` : "",
    getOrderByClause(options.status),
    "LIMIT ?",
  ]
    .filter(Boolean)
    .join(" ");

  params.push(limit);

  const rows = db.prepare(query).all(...params) as OperationalAlertRow[];
  return rows.map(toOperationalAlert);
}

/**
 * Ensure the operational_alerts table exists.
 */
export function ensureOperationalAlertsTable(db: SqliteDatabaseLike) {
  const stmt = db.prepare(`
    CREATE TABLE IF NOT EXISTS operational_alerts (
      id TEXT PRIMARY KEY,
      source TEXT NOT NULL,
      station_id TEXT,
      rule_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      lifecycle_status TEXT NOT NULL DEFAULT 'open',
      title TEXT NOT NULL,
      detail TEXT,
      metadata_json TEXT,
      detected_at INTEGER NOT NULL,
      resolved_at INTEGER,
      occurrence_count INTEGER NOT NULL DEFAULT 1,
      window_started_at INTEGER NOT NULL DEFAULT 0,
      window_ends_at INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      investigation_id TEXT REFERENCES investigations(id),
      UNIQUE(source, rule_type, status)
    )
  `);

  if (typeof stmt.run === "function") {
    stmt.run();
  } else {
    stmt.all();
  }
}
// --- Phase 3: Investigation Linking Helpers ---

/**
 * Link an operational alert to an investigation (sets investigation_id).
 */
export function linkOperationalAlertToInvestigation(db: SqliteDatabaseLike, alertId: string, investigationId: string) {
  const stmt = db.prepare(`
    UPDATE operational_alerts
    SET investigation_id = ?
    WHERE id = ?
  `);
  if (stmt && typeof stmt.run === "function") {
    stmt.run(investigationId, alertId);
  } else {
    throw new Error("Failed to prepare statement or .run is not a function");
  }
}

/**
 * Find an open investigation for a given alert context (by source, rule_type, etc).
 * Returns the investigation_id or null if not found.
 * You can extend the context as needed for your workflow.
 */
export function findOpenInvestigationForAlertContext(db: SqliteDatabaseLike, context: { source: string; ruleType: string; }): string | null {
  // Example: Find the most recent open investigation for this source and ruleType
  const stmt = db.prepare(`
    SELECT investigation_id FROM operational_alerts
    WHERE source = ? AND rule_type = ? AND investigation_id IS NOT NULL
    ORDER BY detected_at DESC LIMIT 1
  `);
  const rows = stmt.all(context.source, context.ruleType);
  if (Array.isArray(rows) && rows.length > 0) {
    const row = rows[0] as { investigation_id?: string | null };
    return row.investigation_id ?? null;
  }
  return null;
}

/**
 * Read the linked investigation data for a given alert (returns investigation row or null).
 */
export function getLinkedInvestigationForAlert(db: SqliteDatabaseLike, alertId: string): { id: string; title: string; summary: string; state: string; confidence: number | null } | null {
  const stmt = db.prepare(`
    SELECT i.id, i.title, i.summary, i.state, i.confidence
    FROM operational_alerts oa
    JOIN investigations i ON oa.investigation_id = i.id
    WHERE oa.id = ?
  `);
  const rows = stmt.all(alertId);
  if (Array.isArray(rows) && rows.length > 0) {
    return rows[0] as { id: string; title: string; summary: string; state: string; confidence: number | null };
  }
  return null;
}

/**
 * Evaluate feed-health snapshot and apply alerts.
 * Returns the IDs of alerts that were created/updated.
 */
export function evaluateAndApplyAlerts(
  db: SqliteDatabaseLike,
  snapshot: LiveIngestionHealthSnapshot,
): string[] {
  const { DbAlertStore } = require("../services/db-alert-store");
  const service = createOperationalAlertsService({ db, alertStore: new DbAlertStore(db) });
  const actions = evaluateFeedHealthForAlerts(snapshot);

  // Apply create actions
  const createdIds = service.applyAlertActions(
    actions.filter((a) => a.type === "create"),
  );

  // Auto-resolve alerts for sources that are now healthy or degraded
  for (const sourceStatus of snapshot.latestBySource) {
    if (sourceStatus.status === "healthy" || sourceStatus.status === "degraded") {
      service.resolveAlertsForSource(sourceStatus.source);
    }
  }

  return createdIds;
}

/**
 * Get all operational alerts with summary & history.
 */
export function getOperationalAlertsWithSummary(
  db: SqliteDatabaseLike,
  options: OperationalAlertsReadOptions = {},
): OperationalAlertsReadResult {
  const limit = normalizeLimit(options.limit);

  const activeAlerts = readOperationalAlertsRows(db, {
    status: "active",
    source: options.source,
    ruleType: options.ruleType,
    limit,
  });

  const recentHistory = readOperationalAlertsRows(db, {
    status: options.status,
    source: options.source,
    ruleType: options.ruleType,
    limit,
  });

  return {
    activeAlerts,
    recentHistory,
  };
}

/**
 * Build alert summary from active alerts.
 */
export function buildAlertSummary(alerts: OperationalAlert[]): OperationalAlertsSummary {
  const criticalCount = alerts.filter((a) => a.severity === "critical").length;
  const warningCount = alerts.filter((a) => a.severity === "warning").length;
  const infoCount = alerts.filter((a) => a.severity === "info").length;

  const failedSourceCount = new Set(
    alerts.filter((a) => a.ruleType === "source_failed").map((a) => a.source),
  ).size;

  const staleSourceCount = new Set(
    alerts.filter((a) => a.ruleType === "source_stale").map((a) => a.source),
  ).size;

  return {
    activeAlertCount: alerts.length,
    criticalCount,
    warningCount,
    infoCount,
    failedSourceCount,
    staleSourceCount,
    lastUpdatedAt: new Date().toISOString(),
  };
}

/**
 * Read operational alerts with 3-level fallback (like feed-health).
 * - Level 1: Database path missing
 * - Level 2: Fail to open database
 * - Level 3: Fail to query database
 */
function readOperationalAlertsFromDatabase(options: {
  status?: OperationalAlertStatus;
  source?: string;
  ruleType?: OperationalAlertRuleType;
  limit?: number;
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openReadOnly?: typeof openReadOnlyDatabase;
} = {}): OperationalAlertsReadResultResponse {
  const {
    status,
    source,
    ruleType,
    limit,
    resolvePath = resolveDatabasePath,
    hasPath = hasDatabasePath,
    openReadOnly = openReadOnlyDatabase,
  } = options;

  // Level 1: Check if database path exists
  if (!hasPath()) {
    return {
      source: "unavailable",
      fallbackReason: "db_path_missing",
    };
  }

  // Level 2: Try to open database
  const dbPath = resolvePath();
  let db: SqliteDatabaseLike;

  try {
    db = openReadOnly(dbPath);
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_open_failed",
    };
  }

  // Level 3: Try to query
  try {
    ensureOperationalAlertsTable(db);
    const result = getOperationalAlertsWithSummary(db, {
      status,
      source,
      ruleType,
      limit,
    });

    return {
      source: "db",
      result,
    };
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  }
}

export const getOperationalAlerts = (
  options: OperationalAlertsRepositoryReadOptions = {},
): OperationalAlertsReadResultResponse => {
  const {
    status,
    source,
    ruleType,
    limit,
    resolvePath = resolveDatabasePath,
    hasPath = hasDatabasePath,
    openReadOnly = openReadOnlyDatabase,
  } = options;

  return readOperationalAlertsFromDatabase({
    status,
    source,
    ruleType,
    limit,
    resolvePath,
    hasPath,
    openReadOnly,
  });
};
