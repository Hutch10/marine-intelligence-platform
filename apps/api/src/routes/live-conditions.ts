import { apiMockData } from "../data";
import type {
  LiveConditionsResponse,
  LiveConditionsTelemetry,
  RouteDefinition,
} from "../types";
import type { LiveConditionsReadResult } from "../repositories/observations";
import { isProductionHarnessMode } from "../services/environmental-harness/freshness-policy";
import { filterTrustedLiveConditions } from "../services/environmental-harness/lineage-presentation";

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
    const trusted = filterTrustedLiveConditions(actualReadResult.conditions);

    if (trusted.length === 0 && actualReadResult.conditions.length > 0) {
      return {
        status: isProductionHarnessMode() ? 503 : 200,
        json: {
          conditions: isProductionHarnessMode() ? [] : trusted,
        },
        telemetry: {
          route: "GET /live-conditions",
          source: isProductionHarnessMode() ? "withheld" : "db",
          conditionCount: trusted.length,
          fallbackReason: isProductionHarnessMode() ? "stale_or_unverifiable_withheld" : undefined,
        },
      };
    }

    return {
      status: 200,
      json: {
        conditions: trusted,
      },
      telemetry: {
        route: "GET /live-conditions",
        source: "db",
        conditionCount: trusted.length,
      },
    };
  }

  if (isProductionHarnessMode()) {
    return {
      status: 503,
      json: {
        conditions: [],
      },
      telemetry: {
        route: "GET /live-conditions",
        source: "withheld",
        conditionCount: 0,
        fallbackReason: actualReadResult.fallbackReason ?? "mock_withheld",
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
