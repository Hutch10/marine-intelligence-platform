import { NextResponse } from "next/server";
import type { MarineWorkflowValidationOutcomeResponse, RiskEvaluationOutcomeRequest } from "@marine/shared";
import { postValidationOutcomeRoute } from "../../../../../../api/src/routes/validation";
import { requireMarineIntelligenceAdminSession } from "../../_utils";

interface ValidationOutcomeBody {
  evaluationId?: unknown;
  observedAt?: unknown;
  actualRiskLevel?: unknown;
  classification?: unknown;
  summary?: unknown;
  source?: unknown;
  notes?: unknown;
}

export async function POST(request: Request) {
  const authResult = await requireMarineIntelligenceAdminSession();

  if (!authResult.ok) {
    return authResult.response;
  }

  let body: ValidationOutcomeBody = {};

  try {
    body = (await request.json()) as ValidationOutcomeBody;
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const payload: RiskEvaluationOutcomeRequest = {
    evaluationId: typeof body.evaluationId === "string" ? body.evaluationId.trim() : "",
    observedAt: typeof body.observedAt === "string" ? body.observedAt.trim() : "",
    actualRiskLevel:
      body.actualRiskLevel === "low"
      || body.actualRiskLevel === "medium"
      || body.actualRiskLevel === "high"
      || body.actualRiskLevel === "critical"
        ? body.actualRiskLevel
        : "low",
    classification:
      body.classification === "correct"
      || body.classification === "partial"
      || body.classification === "incorrect"
        ? body.classification
        : "incorrect",
    summary: typeof body.summary === "string" ? body.summary.trim() : "",
    source: body.source === "manual" || body.source === "simulated" ? body.source : "manual",
    ...(typeof body.notes === "string" && body.notes.trim() ? { notes: body.notes.trim() } : {}),
  };

  const response = postValidationOutcomeRoute.handler({
    auth: authResult.auth,
    body: payload,
  });

  if (response.status !== 200 || !("evaluation" in response.json)) {
    return NextResponse.json(response.json, { status: response.status });
  }

  return NextResponse.json(
    response.json as MarineWorkflowValidationOutcomeResponse,
    { status: 200 },
  );
}
