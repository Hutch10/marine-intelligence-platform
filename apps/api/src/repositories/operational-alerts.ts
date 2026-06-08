import type { AsyncDbAdapter } from "../db/async-client";
import { getAsyncAdapter } from "../db/async-client";
import {
  hasDatabasePath,
  resolveDatabasePath,
} from "../db/client";
import type {
  OperationalAlert,
  OperationalAlertAction,
  OperationalAlertRuleType,
  OperationalAlertSeverity,
  OperationalAlertStatus,
} from "../services/operational-alerts";
import {
  createOperationalAlertsService,
  evaluateFeedHealthForAlerts,
} from "../services/operational-alerts";
import type { LiveIngestionHealthSnapshot } from "./live-ingestion-reports";

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
  getAdapter?: typeof getAsyncAdapter;
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
  if (limit === undefined || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.min(Math.max(Math.floor(limit), 1), MAX_LIMIT);
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

async function readOperationalAlertsRows(
  adapter: AsyncDbAdapter,
  options: OperationalAlertsReadOptions,
): Promise<OperationalAlert[]> {
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

  const rows = (await adapter.execute(query, params)) as OperationalAlertRow[];
  return rows.map(toOperationalAlert);
}

/**
 * Ensure the investigations table exists for alert-linked case records.
 */
export async function ensureInvestigationsTable(adapter: AsyncDbAdapter) {
  await adapter.execute(`
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT,
      state TEXT NOT NULL,
      confidence INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
}

/**
 * Ensure the operational_alerts table exists.
 */
export async function ensureOperationalAlertsTable(adapter: AsyncDbAdapter) {
  await ensureInvestigationsTable(adapter);
  await adapter.execute(`
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
}

/**
 * Link an operational alert to an investigation (sets investigation_id).
 */
export async function linkOperationalAlertToInvestigation(adapter: AsyncDbAdapter, alertId: string, investigationId: string) {
  await adapter.execute(`
    UPDATE operational_alerts
    SET investigation_id = ?
    WHERE id = ?
  `, [investigationId, alertId]);
}

/**
 * Find an open investigation for a given alert context (by source, rule_type, etc).
 * Returns the investigation_id or null if not found.
 */
export async function findOpenInvestigationForAlertContext(adapter: AsyncDbAdapter, context: { source: string; ruleType: string; }): Promise<string | null> {
  const rows = (await adapter.execute(`
    SELECT investigation_id FROM operational_alerts
    WHERE source = ? AND rule_type = ? AND investigation_id IS NOT NULL
    ORDER BY detected_at DESC LIMIT 1
  `, [context.source, context.ruleType])) as Array<{ investigation_id?: string | null }>;

  if (rows.length > 0) {
    return rows[0].investigation_id ?? null;
  }
  return null;
}

/**
 * Read the linked investigation data for a given alert (returns investigation row or null).
 */
export async function getLinkedInvestigationForAlert(adapter: AsyncDbAdapter, alertId: string): Promise<{ id: string; title: string; summary: string; state: string; confidence: number | null } | null> {
  const rows = (await adapter.execute(`
    SELECT i.id, i.title, i.summary, i.state, i.confidence
    FROM operational_alerts oa
    JOIN investigations i ON oa.investigation_id = i.id
    WHERE oa.id = ?
  `, [alertId])) as Array<{ id: string; title: string; summary: string; state: string; confidence: number | null }>;

  if (rows.length > 0) {
    return rows[0];
  }
  return null;
}

/**
 * Evaluate feed-health snapshot and apply alerts.
 * Returns the IDs of alerts that were created/updated.
 */
export async function evaluateAndApplyAlerts(
  adapter: AsyncDbAdapter,
  snapshot: LiveIngestionHealthSnapshot,
): Promise<string[]> {
  const { DbAlertStore } = require("../services/db-alert-store");
  const { buildAlertVerificationContextMap } = require("../services/operational-alerts");
  const service = createOperationalAlertsService({
    adapter,
    alertStore: new DbAlertStore(adapter),
    alertVerificationContextBySource: buildAlertVerificationContextMap(snapshot),
  });
  const actions = evaluateFeedHealthForAlerts(snapshot);

  const createdIds = await service.applyAlertActions(
    actions.filter((a) => a.type === "create"),
  );

  for (const sourceStatus of snapshot.latestBySource) {
    if (sourceStatus.status === "healthy" || sourceStatus.status === "degraded") {
      await service.resolveAlertsForSource(sourceStatus.source);
    }
  }

  return createdIds;
}

/**
 * Get all operational alerts with summary & history.
 */
export async function getOperationalAlertsWithSummary(
  adapter: AsyncDbAdapter,
  options: OperationalAlertsReadOptions = {},
): Promise<OperationalAlertsReadResult> {
  const limit = normalizeLimit(options.limit);

  const activeAlerts = await readOperationalAlertsRows(adapter, {
    status: "active",
    source: options.source,
    ruleType: options.ruleType,
    limit,
  });

  const recentHistory = await readOperationalAlertsRows(adapter, {
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
 * Read operational alerts with 3-level fallback.
 */
async function readOperationalAlertsFromDatabase(options: {
  status?: OperationalAlertStatus;
  source?: string;
  ruleType?: OperationalAlertRuleType;
  limit?: number;
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  getAdapter?: typeof getAsyncAdapter;
} = {}): Promise<OperationalAlertsReadResultResponse> {
  const {
    status,
    source,
    ruleType,
    limit,
    resolvePath = resolveDatabasePath,
    hasPath = hasDatabasePath,
    getAdapter = getAsyncAdapter,
  } = options;

  if (!hasPath()) {
    return {
      source: "unavailable",
      fallbackReason: "db_path_missing",
    };
  }

  let adapter: AsyncDbAdapter;
  try {
    adapter = getAdapter(true);
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_open_failed",
    };
  }

  try {
    await ensureOperationalAlertsTable(adapter);
    const result = await getOperationalAlertsWithSummary(adapter, {
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
  } finally {
    await adapter.close();
  }
}

export const getOperationalAlerts = async (
  options: OperationalAlertsRepositoryReadOptions = {},
): Promise<OperationalAlertsReadResultResponse> => {
  return readOperationalAlertsFromDatabase(options);
};
