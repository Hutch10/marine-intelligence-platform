import { dashboardOverviewData } from "../../../web/lib/api/mock-data";
import type { DashboardActivityItem, DashboardMetric, DashboardOverviewData } from "../../../web/lib/api/types";
import type { DashboardFallbackReason, DashboardTelemetry, RouteDefinition } from "../types";
import type { DashboardCounts, DashboardReadResult } from "../repositories/dashboard";

function readDatabaseDashboard(): DashboardReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/dashboard") as {
      getDashboardSummary: () => DashboardReadResult;
    };
    return repository.getDashboardSummary();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function overrideMetrics(
  metrics: DashboardMetric[],
  overrides: Partial<Record<string, string>>,
): DashboardMetric[] {
  return metrics.map((metric) => ({
    ...metric,
    value: overrides[metric.label] ?? metric.value,
  }));
}

export function buildDashboardRouteResponse(
  readResult = readDatabaseDashboard(),
): { status: number; json: DashboardOverviewData; telemetry: DashboardTelemetry } {
  if (readResult.source === "db") {
    const { counts, activity, speciesActivity } = readResult;
    const useMockActivity = activity.length === 0;
    const resolvedActivity = useMockActivity ? dashboardOverviewData.activity : activity;
    const activitySource = useMockActivity ? ("mock" as const) : ("db" as const);
    const hasSpeciesActivity = speciesActivity !== null && speciesActivity !== undefined;

    return {
      status: 200,
      json: {
        metrics: overrideMetrics(dashboardOverviewData.metrics, {
          "Anomalies Detected": String(counts.openAlertCount),
        }),
        missions: dashboardOverviewData.missions,
        activity: resolvedActivity,
        quickAccess: dashboardOverviewData.quickAccess,
        anomalySummary: dashboardOverviewData.anomalySummary,
        ...(hasSpeciesActivity ? { speciesActivity } : {}),
      },
      telemetry: {
        route: "GET /dashboard",
        source: "db",
        openAlertCount: counts.openAlertCount,
        activityItemCount: resolvedActivity.length,
        activitySource,
        speciesActivitySource: hasSpeciesActivity ? "db" : "unavailable",
      },
    };
  }

  return {
    status: 200,
    json: dashboardOverviewData,
    telemetry: {
      route: "GET /dashboard",
      source: "mock",
      activityItemCount: dashboardOverviewData.activity.length,
      activitySource: "mock",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getDashboardRoute: RouteDefinition<DashboardOverviewData> = {
  method: "GET",
  path: "/dashboard",
  handler() {
    return buildDashboardRouteResponse();
  },
};
