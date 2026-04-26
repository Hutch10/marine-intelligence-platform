import { NextResponse } from "next/server";

export async function POST(_request: Request) {
  return NextResponse.json(
    { error: { code: "validation_outcome_unavailable", message: "Validation outcomes is disabled in this deployment." } },
    { status: 503 }
  );
}

async function _unused_POST(request: Request) {
  const startedAt = Date.now();
  const authResult = await requireApiKeyAuth(request);

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: RiskEvaluationOutcomeRequest;

  try {
    body = (await request.json()) as RiskEvaluationOutcomeRequest;
  } catch {
    return jsonPublicApiError(400, "invalid_json", "Invalid JSON body", {
      retryable: false,
      rateLimit: authResult.rateLimit,
    });
  }

  const routeResponse = postValidationOutcomeRoute.handler({
    auth: authResult.auth,
    body,
  });

  await logApiUsageSafely({
    keyId: authResult.key.id,
    route: "/api/v1/validation/outcomes",
    statusCode: routeResponse.status,
    durationMs: Date.now() - startedAt,
    requestAt: startedAt,
  });

  if (routeResponse.status !== 200) {
    const message = "message" in routeResponse.json && typeof routeResponse.json.message === "string"
      ? routeResponse.json.message
      : "Validation outcome request failed";
    return jsonPublicApiError(
      routeResponse.status,
      routeResponse.status >= 500 ? "validation_outcome_unavailable" : "validation_outcome_invalid_request",
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
