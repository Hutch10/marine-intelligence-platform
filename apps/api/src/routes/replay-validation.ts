import type { RouteDefinition } from "../types";
import type { ReplayValidationJobResult } from "@marine/shared";
import { listLatestLiveConditions } from "../repositories/observations";
import { listLatestReefStress } from "../repositories/reef-stress";
import { runReplayValidationJob } from "../services/environmental-harness/replay-validation";

export async function buildReplayValidationRouteResponse(): Promise<{
  status: number;
  json: ReplayValidationJobResult;
}> {
  const [liveConditions, reefAlerts] = await Promise.all([
    listLatestLiveConditions().catch(() => ({ source: "mock" as const, fallbackReason: "db_query_failed" as const })),
    listLatestReefStress().catch(() => ({ source: "mock" as const, fallbackReason: "db_query_failed" as const })),
  ]);

  const result = await runReplayValidationJob({
    sampleLimit: 10,
    liveConditions: liveConditions.source === "db" ? liveConditions.conditions : [],
    reefAlerts: reefAlerts.source === "db" ? reefAlerts.alerts : [],
  });

  return {
    status: 200,
    json: result,
  };
}

export const getReplayValidationRoute: RouteDefinition<ReplayValidationJobResult> = {
  method: "GET",
  path: "/internal/operator/replay-validation",
  async handler() {
    return await buildReplayValidationRouteResponse();
  },
};

export const postReplayValidationRoute: RouteDefinition<ReplayValidationJobResult> = {
  method: "POST",
  path: "/internal/operator/replay-validation/run",
  async handler() {
    return await buildReplayValidationRouteResponse();
  },
};
