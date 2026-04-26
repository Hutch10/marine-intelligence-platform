import { NextResponse } from "next/server";

const API_BASE = (process.env.MARINE_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

export async function GET(_request: Request) {
  return NextResponse.json(
    { error: { code: "risk_score_unavailable", message: "Risk score is disabled in this deployment." } },
    { status: 503 }
  );
}

async function _unused_GET(request: NextRequest) {
  const startedAt = Date.now();
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  const params = new URLSearchParams();
  const stationId = request.nextUrl.searchParams.get("stationId");
  const window = request.nextUrl.searchParams.get("window");
  if (stationId) params.set("stationId", stationId);
  if (window) params.set("window", window);

  const qs = params.size > 0 ? `?${params.toString()}` : "";
  let upstreamStatus = 502;
  let upstreamJson: unknown;

  try {
    const upstream = await fetch(`${API_BASE}/risk/score${qs}`, {
      headers: { Accept: "application/json" },
    });
    upstreamStatus = upstream.status;
    upstreamJson = await upstream.json();
  } catch {
    await logApiUsageSafely({
      keyId: authResult.key.id,
      route: "/api/v1/risk/score",
      statusCode: 502,
      durationMs: Date.now() - startedAt,
      requestAt: startedAt,
    });
    return jsonPublicApiError(502, "risk_score_unavailable", "Risk score service unreachable", {
      retryable: true,
      rateLimit: authResult.rateLimit,
    });
  }

  await logApiUsageSafely({
    keyId: authResult.key.id,
    route: "/api/v1/risk/score",
    statusCode: upstreamStatus,
    durationMs: Date.now() - startedAt,
    requestAt: startedAt,
  });

  if (
    upstreamStatus !== 200 ||
    typeof upstreamJson !== "object" ||
    upstreamJson === null ||
    !("signals" in upstreamJson)
  ) {
    const message =
      typeof upstreamJson === "object" &&
      upstreamJson !== null &&
      "message" in upstreamJson &&
      typeof (upstreamJson as { message: unknown }).message === "string"
        ? (upstreamJson as { message: string }).message
        : "Risk score request failed";
    return jsonPublicApiError(
      upstreamStatus,
      upstreamStatus >= 500 ? "risk_score_unavailable" : "risk_score_invalid_request",
      message,
      { retryable: upstreamStatus >= 500, rateLimit: authResult.rateLimit },
    );
  }

  const payload = attachRecommendationToRiskScoreResponse(upstreamJson as RiskScoreResponse);

  try {
    const evaluation = await recordPublicRiskEvaluationPrediction({
      stationId: payload.stationId,
      route: "/api/v1/risk/score",
      apiKeyId: authResult.key.id,
      predictedAt: payload.computedAt,
      predictedRiskLevel: payload.overallRisk === "unknown" ? "low" : payload.overallRisk,
      recommendationAction: payload.recommendation?.action ?? null,
      recommendationUrgency: payload.recommendation?.urgency ?? null,
      confidenceScore: payload.confidenceScore,
      calibrationAdjustedConfidenceScore: payload.calibrationAdjustedConfidenceScore ?? undefined,
      operatorSummary: payload.operatorSummary,
      warningMessages: payload.warningMessages,
      contributingSignals: payload.recommendation?.contributingSignals ?? [],
      triggeredRules: payload.triggeredRules,
    });

    if (evaluation) {
      payload.calibrationAdjustedConfidenceScore = evaluation.calibrationAdjustedConfidenceScore;
      payload.evaluationId = evaluation.id;
    }
  } catch (error) {
    console.warn("[api/v1] failed to record risk score evaluation", error);
  }

  return jsonPublicApiResponse(payload, { status: 200, rateLimit: authResult.rateLimit });
}
