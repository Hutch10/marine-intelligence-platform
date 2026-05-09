import type { OperationalAlertsData, OperationalAlertItem, SystemIntegrityStatus } from "@marine/shared";
import { SystemIntegrityStatus as SIS } from "@/lib/integrity-constants";

export type { OperationalAlertsData, OperationalAlertItem };

function apiBase(): string {
  const configured = process.env.MARINE_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!configured) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      throw new Error("MARINE_API_BASE_URL is not configured");
    }
    return "http://localhost:4000";
  }
  return configured;
}

function isValidIntegrity(v: unknown): v is SystemIntegrityStatus {
  return v === "NORMAL" || v === "DEGRADED" || v === "TRUST_BLOCKED";
}

function mapItem(a: Record<string, unknown>): OperationalAlertItem {
  return {
    id: String(a.id ?? ""),
    source: String(a.source ?? ""),
    ruleType: String(a.rule_type ?? "") as OperationalAlertItem["ruleType"],
    severity: (a.severity as OperationalAlertItem["severity"]) ?? "info",
    status: (a.status as OperationalAlertItem["status"]) ?? "active",
    lifecycleStatus: (a.lifecycle_status as OperationalAlertItem["lifecycleStatus"]) ?? "open",
    title: String(a.title ?? ""),
    detail: typeof a.detail === "string" ? a.detail : null,
    detectedAt: typeof a.detected_at === "number" ? a.detected_at : 0,
    resolvedAt: typeof a.resolved_at === "number" ? a.resolved_at : null,
    validationState: typeof a.validation_state === "string" ? a.validation_state : undefined,
    createdAt: String(a.created_at ?? ""),
    updatedAt: String(a.updated_at ?? ""),
    investigationId: typeof a.investigationId === "string" ? a.investigationId : undefined,
  };
}

function buildFallback(): OperationalAlertsData {
  const now = new Date().toISOString();
  return {
    source: "unavailable",
    fallbackReason: "db_query_failed",
    generatedAt: now,
    systemIntegrity: SIS.TRUST_BLOCKED,
    summary: {
      activeAlertCount: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      failedSourceCount: 0,
      staleSourceCount: 0,
      lastUpdatedAt: now,
    },
    activeAlerts: [],
    recentHistory: [],
  };
}

export async function listOperationalAlerts(): Promise<OperationalAlertsData> {
  try {
    const res = await fetch(`${apiBase()}/operational-alerts`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return buildFallback();

    const data = await res.json();
    const s = (data?.summary ?? {}) as Record<string, unknown>;

    return {
      source: data.source === "db" ? "db" : "unavailable",
      fallbackReason: data.fallback_reason ?? null,
      generatedAt: typeof data.generated_at === "string"
        ? data.generated_at
        : new Date().toISOString(),
      // Fail-closed: missing or unrecognised integrity value → TRUST_BLOCKED
      systemIntegrity: isValidIntegrity(data.system_integrity)
        ? data.system_integrity
        : SIS.TRUST_BLOCKED,
      summary: {
        activeAlertCount: Number(s.active_alert_count ?? 0),
        criticalCount:    Number(s.critical_count ?? 0),
        warningCount:     Number(s.warning_count ?? 0),
        infoCount:        Number(s.info_count ?? 0),
        failedSourceCount: Number(s.failed_source_count ?? 0),
        staleSourceCount:  Number(s.stale_source_count ?? 0),
        lastUpdatedAt: typeof s.last_updated_at === "string"
          ? s.last_updated_at
          : new Date().toISOString(),
      },
      activeAlerts: Array.isArray(data.active_alerts)
        ? (data.active_alerts as Record<string, unknown>[]).map(mapItem)
        : [],
      recentHistory: Array.isArray(data.recent_history)
        ? (data.recent_history as Record<string, unknown>[]).map(mapItem)
        : [],
    };
  } catch {
    return buildFallback();
  }
}
