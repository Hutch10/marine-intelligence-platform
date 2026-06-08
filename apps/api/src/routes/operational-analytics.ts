import type { RouteDefinition } from "../types";
import {
  getOperationalAnalyticsSummary,
  recordOperationalAnalyticsEvent,
} from "../repositories/operational-analytics";
import {
  assertOperationalAnalyticsRecordAuthorized,
  validateOperationalAnalyticsRequest,
} from "../services/operational-analytics";
import type { OperationalAnalyticsSummary } from "@marine/shared";

export async function buildOperationalAnalyticsRecordRouteResponse(
  body: Record<string, unknown> = {},
  headers: Record<string, string | undefined> = {},
): Promise<{ status: number; json: { ok: boolean; message?: string } }> {
  const auth = assertOperationalAnalyticsRecordAuthorized(headers);
  if (!auth.ok) {
    return { status: auth.status, json: { ok: false, message: auth.message } };
  }

  const validation = validateOperationalAnalyticsRequest(body);
  if (!validation.ok) {
    return { status: 400, json: { ok: false, message: validation.error } };
  }

  const result = await recordOperationalAnalyticsEvent({
    eventType: validation.input.eventType,
    dimension: validation.input.dimension,
  });

  if (result.source === "unavailable") {
    if (result.fallbackReason === "disabled") {
      return { status: 202, json: { ok: true, message: "Operational analytics disabled" } };
    }
    return { status: 503, json: { ok: false, message: "Operational analytics storage unavailable" } };
  }

  return { status: 202, json: { ok: true } };
}

export async function buildOperationalAnalyticsSummaryRouteResponse(): Promise<{
  status: number;
  json: OperationalAnalyticsSummary | { message: string };
}> {
  const readResult = await getOperationalAnalyticsSummary(30);

  if (readResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Operational analytics summary unavailable" },
    };
  }

  return {
    status: 200,
    json: readResult.summary,
  };
}

export const postOperationalAnalyticsRecordRoute: RouteDefinition<
  { ok: boolean; message?: string },
  Record<string, unknown>
> = {
  method: "POST",
  path: "/internal/operational-analytics/record",
  async handler({ body, headers }) {
    return await buildOperationalAnalyticsRecordRouteResponse(
      (body ?? {}) as Record<string, unknown>,
      headers ?? {},
    );
  },
};

export const getOperationalAnalyticsSummaryRoute: RouteDefinition<
  OperationalAnalyticsSummary | { message: string }
> = {
  method: "GET",
  path: "/internal/operator/analytics",
  async handler() {
    return await buildOperationalAnalyticsSummaryRouteResponse();
  },
};

/** Fire-and-forget aggregate increment from API handlers (no identifiers). */
export function trackOperationalAnalyticsFromApi(
  eventType: Parameters<typeof recordOperationalAnalyticsEvent>[0]["eventType"],
  dimension?: string,
): void {
  void recordOperationalAnalyticsEvent({ eventType, dimension }).catch(() => {
    // Analytics must never affect request handling.
  });
}
