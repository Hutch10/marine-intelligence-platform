import { NextRequest } from "next/server";
import { logApiUsageSafely, requireApiKeyAuth } from "../../_auth";
import { jsonPublicApiError, jsonPublicApiResponse } from "../../_responses";

const API_BASE = (process.env.MARINE_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  const params = new URLSearchParams();
  const stationId = request.nextUrl.searchParams.get("stationId");
  const since = request.nextUrl.searchParams.get("since");
  if (stationId) params.set("stationId", stationId);
  if (since) params.set("since", since);

  const qs = params.size > 0 ? `?${params.toString()}` : "";
  let upstreamStatus = 502;
  let upstreamJson: unknown;

  try {
    const upstream = await fetch(`${API_BASE}/validation/summary${qs}`, {
      headers: { Accept: "application/json" },
    });
    upstreamStatus = upstream.status;
    upstreamJson = await upstream.json();
  } catch {
    await logApiUsageSafely({
      keyId: authResult.key.id,
      route: "/api/v1/validation/summary",
      statusCode: 502,
      durationMs: Date.now() - startedAt,
      requestAt: startedAt,
    });
    return jsonPublicApiError(502, "validation_summary_unavailable", "Validation summary service unreachable", {
      retryable: true,
      rateLimit: authResult.rateLimit,
    });
  }

  await logApiUsageSafely({
    keyId: authResult.key.id,
    route: "/api/v1/validation/summary",
    statusCode: upstreamStatus,
    durationMs: Date.now() - startedAt,
    requestAt: startedAt,
  });

  if (upstreamStatus !== 200) {
    const message =
      typeof upstreamJson === "object" &&
      upstreamJson !== null &&
      "message" in upstreamJson &&
      typeof (upstreamJson as { message: unknown }).message === "string"
        ? (upstreamJson as { message: string }).message
        : "Validation summary request failed";
    return jsonPublicApiError(
      upstreamStatus,
      upstreamStatus >= 500 ? "validation_summary_unavailable" : "validation_summary_invalid_request",
      message,
      { retryable: upstreamStatus >= 500, rateLimit: authResult.rateLimit },
    );
  }

  return jsonPublicApiResponse(upstreamJson, {
    status: upstreamStatus,
    rateLimit: authResult.rateLimit,
  });
}
