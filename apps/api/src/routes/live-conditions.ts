import { apiMockData } from "../data";
import type {
  LiveConditionsResponse,
  LiveConditionsTelemetry,
  RouteDefinition,
} from "../types";
import type { LiveConditionsReadResult } from "../repositories/observations";

function readDatabaseLiveConditions(): LiveConditionsReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/observations") as {
      listLatestLiveConditions: () => LiveConditionsReadResult;
    };

    return repository.listLatestLiveConditions();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export function buildLiveConditionsRouteResponse(
  readResult = readDatabaseLiveConditions(),
): { status: number; json: LiveConditionsResponse; telemetry: LiveConditionsTelemetry } {
  if (readResult.source === "db") {
    return {
      status: 200,
      json: {
        conditions: readResult.conditions,
      },
      telemetry: {
        route: "GET /live-conditions",
        source: "db",
        conditionCount: readResult.conditions.length,
      },
    };
  }

  return {
    status: 200,
    json: {
      conditions: apiMockData.liveMarineConditionsData,
    },
    telemetry: {
      route: "GET /live-conditions",
      source: "mock",
      conditionCount: apiMockData.liveMarineConditionsData.length,
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getLiveConditionsRoute: RouteDefinition<LiveConditionsResponse> = {
  method: "GET",
  path: "/live-conditions",
  handler() {
    return buildLiveConditionsRouteResponse();
  },
};
