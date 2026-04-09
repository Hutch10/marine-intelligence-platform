import { NextRequest } from "next/server";
import type { PublicAlertsListResponse } from "@marine/shared";
import { buildMarineWorkflowAlertsRouteResponse } from "../../../../../api/src/routes/marine-intelligence";
import { logApiUsageSafely, requireApiKeyAuth } from "../_auth";
import { jsonPublicApiError, jsonPublicApiResponse } from "../_responses";

const VALID_STATUSES = new Set(["active", "acknowledged", "resolved"]);
const VALID_SEVERITIES = new Set(["low", "medium", "high", "critical"]);

function normalizeLimit(value: string | null): number {
  const parsed = value ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 50;
  }

  return Math.min(Math.max(1, Math.floor(parsed)), 200);
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  const status = request.nextUrl.searchParams.get("status");
  const severity = request.nextUrl.searchParams.get("severity");

  if (status && !VALID_STATUSES.has(status)) {
    return jsonPublicApiError(400, "alerts_invalid_status", "status is invalid", {
      retryable: false,
      rateLimit: authResult.rateLimit,
    });
  }

  if (severity && !VALID_SEVERITIES.has(severity)) {
    return jsonPublicApiError(400, "alerts_invalid_severity", "severity is invalid", {
      retryable: false,
      rateLimit: authResult.rateLimit,
    });
  }

  const normalizedLimit = normalizeLimit(request.nextUrl.searchParams.get("limit"));
  const defaultsApplied: string[] = [];

  if (!request.nextUrl.searchParams.get("limit")) {
    defaultsApplied.push("limit");
  }

  const routeResponse = buildMarineWorkflowAlertsRouteResponse(authResult.auth, {
    stationId: request.nextUrl.searchParams.get("stationId") ?? undefined,
    status: status as "active" | "acknowledged" | "resolved" | undefined,
    severity: severity as "low" | "medium" | "high" | "critical" | undefined,
    limit: normalizedLimit,
  });

  await logApiUsageSafely({
    keyId: authResult.key.id,
    route: "/api/v1/alerts",
    statusCode: routeResponse.status,
    durationMs: Date.now() - startedAt,
    requestAt: startedAt,
  });

  if (routeResponse.status !== 200 || !("alerts" in routeResponse.json)) {
    const message = "message" in routeResponse.json && typeof routeResponse.json.message === "string"
      ? routeResponse.json.message
      : "Alerts request failed";
    return jsonPublicApiError(
      routeResponse.status,
      routeResponse.status >= 500 ? "alerts_unavailable" : "alerts_invalid_request",
      message,
      {
        retryable: routeResponse.status >= 500,
        rateLimit: authResult.rateLimit,
      },
    );
  }

  const payload: PublicAlertsListResponse = {
    alerts: routeResponse.json.alerts,
    total: routeResponse.json.alerts.length,
    appliedFilters: {
      stationId: request.nextUrl.searchParams.get("stationId"),
      severity: (severity as "low" | "medium" | "high" | "critical" | null) ?? null,
      status: (status as "active" | "acknowledged" | "resolved" | null) ?? null,
      limit: normalizedLimit,
    },
    pagination: {
      limit: normalizedLimit,
      returned: routeResponse.json.alerts.length,
      total: routeResponse.json.alerts.length,
      hasMore: routeResponse.json.alerts.length === normalizedLimit,
      maxLimit: 200,
      defaultsApplied,
    },
  };

  return jsonPublicApiResponse(payload, { status: 200, rateLimit: authResult.rateLimit });
}
