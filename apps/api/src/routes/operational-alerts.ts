import type { RouteDefinition } from "../types";
import type {
  OperationalAlertsReadResultResponse,
  OperationalAlert,
  OperationalAlertsSummary,
  OperationalAlertRuleType,
  OperationalAlertStatus,
} from "../repositories/operational-alerts";

type OperationalAlertsFallbackReason = "db_path_missing" | "db_open_failed" | "db_query_failed";

interface OperationalAlertsResponseItem {
  id: string;
  source: string;
  rule_type: string;
  severity: string;
  status: string;
  title: string;
  detail: string | null;
  detected_at: number;
  resolved_at: number | null;
  created_at: string;
  updated_at: string;
  // Only emit investigationId if a real linked investigation exists
  investigationId?: string;
}

interface OperationalAlertsSummaryResponse {
  active_alert_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  failed_source_count: number;
  stale_source_count: number;
  last_updated_at: string;
}

interface OperationalAlertsResponse {
  source: "db" | "unavailable";
  fallback_reason: OperationalAlertsFallbackReason | null;
  generated_at: string;
  summary: OperationalAlertsSummaryResponse;
  active_alerts: OperationalAlertsResponseItem[];
  recent_history: OperationalAlertsResponseItem[];
}

interface OperationalAlertsQuery {
  status?: string;
  source?: string;
  ruleType?: string;
  limit?: number | string;
  historyLimit?: number | string;
}

interface ParsedOperationalAlertsQuery {
  status?: OperationalAlertStatus;
  source?: string;
  ruleType?: OperationalAlertRuleType;
  limit: number;
}

interface OperationalAlertsReadDependencies {
  readOperationalAlerts?: (options: {
    status?: OperationalAlertStatus;
    source?: string;
    ruleType?: OperationalAlertRuleType;
    limit?: number;
  }) => OperationalAlertsReadResultResponse;
}

interface OperationalAlertsTelemetry {
  route: "GET /operational-alerts";
  source: "db" | "unavailable";
  activeAlertCount: number;
  historyCount: number;
  criticalCount: number;
  fallbackReason?: OperationalAlertsFallbackReason;
}

const DEFAULT_HISTORY_LIMIT = 20;
const ALLOWED_RULE_TYPES: ReadonlySet<OperationalAlertRuleType> = new Set([
  "source_failed",
  "source_stale",
  "repeated_degraded",
  "persistence_failure",
]);

function normalizeFilterText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeStatus(value: string | undefined): OperationalAlertStatus | undefined {
  const normalized = normalizeFilterText(value)?.toLowerCase();
  if (normalized === "active" || normalized === "resolved") {
    return normalized;
  }

  return undefined;
}

function normalizeRuleType(value: string | undefined): OperationalAlertRuleType | undefined {
  const normalized = normalizeFilterText(value) as OperationalAlertRuleType | undefined;
  if (!normalized || !ALLOWED_RULE_TYPES.has(normalized)) {
    return undefined;
  }

  return normalized;
}

function normalizeInteger(
  value: number | string | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const numeric = Number(value);

  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(Math.max(Math.floor(numeric), min), max);
}

export function parseOperationalAlertsQuery(query: OperationalAlertsQuery | undefined): ParsedOperationalAlertsQuery {
  const limitInput = query?.limit ?? query?.historyLimit;

  return {
    status: normalizeStatus(query?.status),
    source: normalizeFilterText(query?.source),
    ruleType: normalizeRuleType(query?.ruleType),
    limit: normalizeInteger(limitInput, DEFAULT_HISTORY_LIMIT, 1, 500),
  };
}

export async function readDatabaseOperationalAlerts(
  query: OperationalAlertsQuery | undefined,
  dependencies: OperationalAlertsReadDependencies = {},
): Promise<OperationalAlertsReadResultResponse> {
  const parsedQuery = parseOperationalAlertsQuery(query);

  try {
    const readOperationalAlerts = dependencies.readOperationalAlerts ?? (() => {
      const runtimeRequire = eval("require") as NodeRequire;
      const repository = runtimeRequire("../repositories/operational-alerts") as {
        getOperationalAlerts: (options: {
          status?: OperationalAlertStatus;
          source?: string;
          ruleType?: OperationalAlertRuleType;
          limit?: number;
        }) => Promise<OperationalAlertsReadResultResponse> | OperationalAlertsReadResultResponse;
      };

      return repository.getOperationalAlerts;
    })();

    return await readOperationalAlerts({
      status: parsedQuery.status,
      source: parsedQuery.source,
      ruleType: parsedQuery.ruleType,
      limit: parsedQuery.limit,
    });
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  }
}

function toAlertResponseItem(item: OperationalAlert): OperationalAlertsResponseItem {
  const base: OperationalAlertsResponseItem = {
    id: item.id,
    source: item.source,
    rule_type: item.ruleType,
    severity: item.severity,
    status: item.status,
    title: item.title,
    detail: item.detail,
    detected_at: item.detectedAt,
    resolved_at: item.resolvedAt,
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
  // Only emit investigationId if a real linked investigation exists (not null/undefined/empty)
  if (item.investigationId && typeof item.investigationId === "string" && item.investigationId.trim() !== "") {
    return { ...base, investigationId: item.investigationId };
  }
  return base;
}

function toSummaryResponse(summary: OperationalAlertsSummary): OperationalAlertsSummaryResponse {
  return {
    active_alert_count: summary.activeAlertCount,
    critical_count: summary.criticalCount,
    warning_count: summary.warningCount,
    info_count: summary.infoCount,
    failed_source_count: summary.failedSourceCount,
    stale_source_count: summary.staleSourceCount,
    last_updated_at: summary.lastUpdatedAt,
  };
}

function buildEmptySummary(): OperationalAlertsSummaryResponse {
  return {
    active_alert_count: 0,
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
    failed_source_count: 0,
    stale_source_count: 0,
    last_updated_at: new Date().toISOString(),
  };
}

export async function buildOperationalAlertsRouteResponse(
  readResultPromise: Promise<OperationalAlertsReadResultResponse> | OperationalAlertsReadResultResponse = readDatabaseOperationalAlerts(undefined),
  query?: OperationalAlertsQuery,
): Promise<{
  status: number;
  json: OperationalAlertsResponse;
  telemetry: OperationalAlertsTelemetry;
}> {
  const readResult = await readResultPromise;
  const parsedQuery = parseOperationalAlertsQuery(query);
  void parsedQuery;

  if (readResult.source === "db") {
    const { activeAlerts, recentHistory } = readResult.result;

    // Build summary
    const summaryData = {
      activeAlertCount: activeAlerts.length,
      criticalCount: activeAlerts.filter((a) => a.severity === "critical").length,
      warningCount: activeAlerts.filter((a) => a.severity === "warning").length,
      infoCount: activeAlerts.filter((a) => a.severity === "info").length,
      failedSourceCount: new Set(
        activeAlerts.filter((a) => a.ruleType === "source_failed").map((a) => a.source),
      ).size,
      staleSourceCount: new Set(
        activeAlerts.filter((a) => a.ruleType === "source_stale").map((a) => a.source),
      ).size,
      lastUpdatedAt: new Date().toISOString(),
    };

    const activeAlertsResponse = activeAlerts.map(toAlertResponseItem);
    const recentHistoryResponse = recentHistory.map(toAlertResponseItem);

    return {
      status: 200,
      json: {
        source: "db",
        fallback_reason: null,
        generated_at: new Date().toISOString(),
        summary: toSummaryResponse(summaryData),
        active_alerts: activeAlertsResponse,
        recent_history: recentHistoryResponse,
      },
      telemetry: {
        route: "GET /operational-alerts",
        source: "db",
        activeAlertCount: activeAlertsResponse.length,
        historyCount: recentHistoryResponse.length,
        criticalCount: summaryData.criticalCount,
      },
    };
  }

  return {
    status: 200,
    json: {
      source: "unavailable",
      fallback_reason: readResult.fallbackReason,
      generated_at: new Date().toISOString(),
      summary: buildEmptySummary(),
      active_alerts: [],
      recent_history: [],
    },
    telemetry: {
      route: "GET /operational-alerts",
      source: "unavailable",
      activeAlertCount: 0,
      historyCount: 0,
      criticalCount: 0,
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getOperationalAlertsRoute: RouteDefinition<
  OperationalAlertsResponse,
  undefined,
  OperationalAlertsQuery
> = {
  method: "GET",
  path: "/operational-alerts",
  async handler(request) {
    const readResult = await readDatabaseOperationalAlerts(request.query);
    return await buildOperationalAlertsRouteResponse(readResult, request.query);
  },
};
