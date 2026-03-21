import { apiMockData } from "../data";
import type {
  ReefAlertsResponse,
  ReefAlertsTelemetry,
  RouteDefinition,
} from "../types";
import type { ReefStressReadResult } from "../repositories/reef-stress";

function readDatabaseReefStress(): ReefStressReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/reef-stress") as {
      listLatestReefStress: () => ReefStressReadResult;
    };

    return repository.listLatestReefStress();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export function buildReefAlertsRouteResponse(
  readResult = readDatabaseReefStress(),
): { status: number; json: ReefAlertsResponse; telemetry: ReefAlertsTelemetry } {
  if (readResult.source === "db") {
    return {
      status: 200,
      json: {
        alerts: readResult.alerts,
      },
      telemetry: {
        route: "GET /reef-alerts",
        source: "db",
        alertCount: readResult.alerts.length,
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
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getReefAlertsRoute: RouteDefinition<ReefAlertsResponse> = {
  method: "GET",
  path: "/reef-alerts",
  handler() {
    return buildReefAlertsRouteResponse();
  },
};
