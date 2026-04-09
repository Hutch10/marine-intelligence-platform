const apiBase = () =>
  (process.env.MARINE_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

export interface OperationalAlertItem {
  id: string;
  source: string;
  ruleType: string;
  severity: "critical" | "warning" | "info";
  status: "active" | "resolved";
  title: string;
  detail: string | null;
  detectedAt: number;
  resolvedAt: number | null;
  investigationId?: string;
}

export interface OperationalAlertsResult {
  source: "db" | "unavailable";
  summary: {
    activeAlertCount: number;
    criticalCount: number;
    warningCount: number;
  };
  activeAlerts: OperationalAlertItem[];
  recentHistory: OperationalAlertItem[];
}

function mapItem(a: Record<string, unknown>): OperationalAlertItem {
  return {
    id: String(a.id ?? ""),
    source: String(a.source ?? ""),
    ruleType: String(a.rule_type ?? ""),
    severity: (a.severity as OperationalAlertItem["severity"]) ?? "info",
    status: (a.status as OperationalAlertItem["status"]) ?? "active",
    title: String(a.title ?? ""),
    detail: typeof a.detail === "string" ? a.detail : null,
    detectedAt: typeof a.detected_at === "number" ? a.detected_at : 0,
    resolvedAt: typeof a.resolved_at === "number" ? a.resolved_at : null,
    investigationId: typeof a.investigationId === "string" ? a.investigationId : undefined,
  };
}

const FALLBACK: OperationalAlertsResult = {
  source: "unavailable",
  summary: { activeAlertCount: 0, criticalCount: 0, warningCount: 0 },
  activeAlerts: [],
  recentHistory: [],
};

export async function listOperationalAlerts(): Promise<OperationalAlertsResult> {
  try {
    const res = await fetch(`${apiBase()}/operational-alerts`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return FALLBACK;

    const data = await res.json();
    const s = data?.summary ?? {};

    return {
      source: data.source === "db" ? "db" : "unavailable",
      summary: {
        activeAlertCount: Number(s.active_alert_count ?? 0),
        criticalCount: Number(s.critical_count ?? 0),
        warningCount: Number(s.warning_count ?? 0),
      },
      activeAlerts: Array.isArray(data.active_alerts)
        ? (data.active_alerts as Record<string, unknown>[]).map(mapItem)
        : [],
      recentHistory: Array.isArray(data.recent_history)
        ? (data.recent_history as Record<string, unknown>[]).map(mapItem)
        : [],
    };
  } catch {
    return FALLBACK;
  }
}
