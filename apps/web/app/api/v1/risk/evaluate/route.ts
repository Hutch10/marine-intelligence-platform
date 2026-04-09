import type { RiskEvaluateRequest, RiskEvaluateResponse } from "@marine/shared";
import { logApiUsageSafely, requireApiKeyAuth } from "../../_auth";
import { attachRecommendationToRiskEvaluateResponse } from "../_recommendation";
import { recordPublicRiskEvaluationPrediction } from "@/lib/server/public-api-store";
import { jsonPublicApiError, jsonPublicApiResponse } from "../../_responses";

const API_BASE = (process.env.MARINE_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

export async function POST(request: Request) {
  const startedAt = Date.now();
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: RiskEvaluateRequest;

  try {
    body = (await request.json()) as RiskEvaluateRequest;
  } catch {
    return jsonPublicApiError(400, "invalid_json", "Invalid JSON body", {
      retryable: false,
      rateLimit: authResult.rateLimit,
    });
  }

  let upstreamStatus = 502;
  let upstreamJson: unknown;

  try {
    const upstream = await fetch(`${API_BASE}/risk/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
    });
    upstreamStatus = upstream.status;
    upstreamJson = await upstream.json();
  } catch {
    await logApiUsageSafely({
      keyId: authResult.key.id,
      route: "/api/v1/risk/evaluate",
      statusCode: 502,
      durationMs: Date.now() - startedAt,
      requestAt: startedAt,
    });
    return jsonPublicApiError(502, "risk_evaluate_unavailable", "Risk evaluate service unreachable", {
      retryable: true,
      rateLimit: authResult.rateLimit,
    });
  }

  await logApiUsageSafely({
    keyId: authResult.key.id,
    route: "/api/v1/risk/evaluate",
    statusCode: upstreamStatus,
    durationMs: Date.now() - startedAt,
    requestAt: startedAt,
  });

  if (
    upstreamStatus !== 200 ||
    typeof upstreamJson !== "object" ||
    upstreamJson === null ||
    !("baselineStats" in upstreamJson)
  ) {
    const message =
      typeof upstreamJson === "object" &&
      upstreamJson !== null &&
      "message" in upstreamJson &&
      typeof (upstreamJson as { message: unknown }).message === "string"
        ? (upstreamJson as { message: string }).message
        : "Risk evaluation request failed";
    return jsonPublicApiError(
      upstreamStatus,
      upstreamStatus >= 500 ? "risk_evaluate_unavailable" : "risk_evaluate_invalid_request",
      message,
      { retryable: upstreamStatus >= 500, rateLimit: authResult.rateLimit },
    );
  }

  const payload = attachRecommendationToRiskEvaluateResponse(upstreamJson as RiskEvaluateResponse);

  try {
    const evaluation = await recordPublicRiskEvaluationPrediction({
      stationId: payload.stationId,
      route: "/api/v1/risk/evaluate",
      apiKeyId: authResult.key.id,
      predictedAt: payload.evaluatedAt,
      predictedRiskLevel: payload.riskLevel,
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
    console.warn("[api/v1] failed to record risk evaluate prediction", error);
  }

  return jsonPublicApiResponse(payload, {
    status: upstreamStatus,
    rateLimit: authResult.rateLimit,
  });
}
