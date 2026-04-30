import type { RiskEvaluationFeedbackRequest } from "@marine/shared";
import { requireApiKeyAuth, logApiUsageSafely } from "../../_auth";
import { jsonPublicApiError, jsonPublicApiResponse } from "../../_responses";
import { postValidationFeedbackRoute } from "../../../../../../api/src/routes/validation";

export async function POST(request: Request) {
  const startedAt = Date.now();
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: RiskEvaluationFeedbackRequest;

  try {
    body = (await request.json()) as RiskEvaluationFeedbackRequest;
  } catch {
    return jsonPublicApiError(400, "invalid_json", "Invalid JSON body", {
      retryable: false,
      rateLimit: authResult.rateLimit,
    });
  }

  const routeResponse = await postValidationFeedbackRoute.handler({
    auth: authResult.auth,
    body,
  });

  await logApiUsageSafely({
    keyId: authResult.key.id,
    route: "/api/v1/validation/feedback",
    statusCode: routeResponse.status,
    durationMs: Date.now() - startedAt,
    requestAt: startedAt,
  });

  if (routeResponse.status !== 200) {
    const message = "message" in routeResponse.json && typeof routeResponse.json.message === "string"
      ? routeResponse.json.message
      : "Validation feedback request failed";
    return jsonPublicApiError(
      routeResponse.status,
      routeResponse.status >= 500 ? "validation_feedback_unavailable" : "validation_feedback_invalid_request",
      message,
      {
        retryable: routeResponse.status >= 500,
        rateLimit: authResult.rateLimit,
      },
    );
  }

  return jsonPublicApiResponse(routeResponse.json, {
    status: routeResponse.status,
    rateLimit: authResult.rateLimit,
  });
}
