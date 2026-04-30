import { apiMockData } from "../data";
import type {
  LiveConditionsResponse,
  LiveConditionsTelemetry,
  RouteDefinition,
} from "../types";
import type { LiveConditionsReadResult } from "../repositories/observations";

async function readDatabaseLiveConditions(): Promise<LiveConditionsReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/observations") as {
      listLatestLiveConditions: () => Promise<LiveConditionsReadResult>;
    };

    return await repository.listLatestLiveConditions();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export async function buildLiveConditionsRouteResponse(
  readResult?: LiveConditionsReadResult,
): Promise<{ status: number; json: LiveConditionsResponse; telemetry: LiveConditionsTelemetry }> {
  const actualReadResult = readResult ?? await readDatabaseLiveConditions();

  if (actualReadResult.source === "db") {
    return {
      status: 200,
      json: {
        conditions: actualReadResult.conditions,
      },
      telemetry: {
        route: "GET /live-conditions",
        source: "db",
        conditionCount: actualReadResult.conditions.length,
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
      fallbackReason: actualReadResult.fallbackReason,
    },
  };
}

export const getLiveConditionsRoute: RouteDefinition<LiveConditionsResponse> = {
  method: "GET",
  path: "/live-conditions",
  async handler() {
    return await buildLiveConditionsRouteResponse();
  },
};
