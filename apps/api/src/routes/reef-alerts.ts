import { apiMockData } from "../data";
import type {
  ReefAlertsResponse,
  ReefAlertsTelemetry,
  RouteDefinition,
} from "../types";
import type { ReefStressReadResult } from "../repositories/reef-stress";
import { isProductionHarnessMode } from "../services/environmental-harness/freshness-policy";
import { filterTrustedReefAlerts } from "../services/environmental-harness/lineage-presentation";

async function readDatabaseReefStress(): Promise<ReefStressReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/reef-stress") as {
      listLatestReefStress: () => Promise<ReefStressReadResult>;
    };

    return await repository.listLatestReefStress();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export async function buildReefAlertsRouteResponse(
  readResult?: ReefStressReadResult,
): Promise<{ status: number; json: ReefAlertsResponse; telemetry: ReefAlertsTelemetry }> {
  const actualReadResult = readResult ?? await readDatabaseReefStress();

  if (actualReadResult.source === "db") {
    const trusted = filterTrustedReefAlerts(actualReadResult.alerts);

    if (trusted.length === 0 && actualReadResult.alerts.length > 0) {
      return {
        status: isProductionHarnessMode() ? 503 : 200,
        json: {
          alerts: isProductionHarnessMode() ? [] : trusted,
        },
        telemetry: {
          route: "GET /reef-alerts",
          source: isProductionHarnessMode() ? "withheld" : "db",
          alertCount: trusted.length,
          fallbackReason: isProductionHarnessMode() ? "stale_or_unverifiable_withheld" : undefined,
        },
      };
    }

    return {
      status: 200,
      json: {
        alerts: trusted,
      },
      telemetry: {
        route: "GET /reef-alerts",
        source: "db",
        alertCount: trusted.length,
      },
    };
  }

  if (isProductionHarnessMode()) {
    return {
      status: 503,
      json: {
        alerts: [],
      },
      telemetry: {
        route: "GET /reef-alerts",
        source: "withheld",
        alertCount: 0,
        fallbackReason: actualReadResult.fallbackReason ?? "mock_withheld",
      },
    };
  }

  return {
    status: 200,
    json: {
      alerts: apiMockData.reefStressWatchData,
    },
    telemetry: {
      route: "GET /reef-alerts",
      source: "mock",
      alertCount: apiMockData.reefStressWatchData.length,
      fallbackReason: actualReadResult.fallbackReason,
    },
  };
}

export const getReefAlertsRoute: RouteDefinition<ReefAlertsResponse> = {
  method: "GET",
  path: "/reef-alerts",
  async handler() {
    return await buildReefAlertsRouteResponse();
  },
};
