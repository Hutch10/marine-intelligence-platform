import { apiMockData } from "../data";
import type {
  ReefAlertsResponse,
  ReefAlertsTelemetry,
  RouteDefinition,
} from "../types";
import type { ReefStressReadResult } from "../repositories/reef-stress";

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
    return {
      status: 200,
      json: {
        alerts: actualReadResult.alerts,
      },
      telemetry: {
        route: "GET /reef-alerts",
        source: "db",
        alertCount: actualReadResult.alerts.length,
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
