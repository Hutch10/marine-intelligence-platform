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
  rule_type: string;
  severity: string;
  status: string;
  title: string;
  detail: string | null;
  metadata_json: string | null;
  detected_at: number | string;
  resolved_at: number | string | null;
  created_at: string;
  updated_at: string;
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
  return {
    id: row.id,
    source: row.source,
    ruleType: row.rule_type as OperationalAlertRuleType,
    severity: row.severity as OperationalAlertSeverity,
    status: row.status as OperationalAlertStatus,
    title: row.title,
    detail: row.detail,
    metadataJson: row.metadata_json,
    detectedAt: Number(row.detected_at),
    resolvedAt: row.resolved_at === null ? null : Number(row.resolved_at),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
      rule_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      detail TEXT,
      metadata_json TEXT,
      detected_at INTEGER NOT NULL,
      resolved_at INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(source, rule_type, status)
    )
  `);

  if (typeof stmt.run === "function") {
    stmt.run();
  } else {
    stmt.all();
  }
}

/**
 * Evaluate feed-health snapshot and apply alerts.
 * Returns the IDs of alerts that were created/updated.
 */
export function evaluateAndApplyAlerts(
  db: SqliteDatabaseLike,
  snapshot: LiveIngestionHealthSnapshot,
): string[] {
  const service = createOperationalAlertsService({ db });
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
