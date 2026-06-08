import {
  type DegradedDataReason,
  MarineWorkflowValidationOutcomeResponse,
  RiskEvaluationFeedbackRequest,
  RiskEvaluationOutcomeRequest,
  SystemIntegrityStatus,
  ValidationSummaryResponse,
} from "@marine/shared";
import type { OceanStationAdminAuthContext, OceanStationAdminPermission } from "@marine/shared";
import {
  attachFeedbackToMarineRiskEvaluation,
  attachMarineRiskEvaluationOutcome,
  type MarineRiskEvaluationOutcomeAttachResult,
} from "../repositories/marine-intelligence-validation";
import { auditHumanReview } from "../services/environmental-harness/audit";
import { buildHarnessEventId, stableContentHash } from "../services/environmental-harness/provenance";
import {
  buildValidationSummary,
} from "../services/marine-intelligence-validation";
import type { RouteDefinition } from "../types";

interface ValidationSummaryQuery {
  stationId?: string;
  since?: string;
}

function hasViewAdminPermission(
  auth: OceanStationAdminAuthContext | undefined,
): auth is OceanStationAdminAuthContext {
  if (!auth) {
    return false;
  }

  return auth.permissions.includes("station.view_admin" as OceanStationAdminPermission);
}

function normalizeText(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractApiKeyId(actorId: string | undefined | null): string | null {
  if (typeof actorId === "string" && actorId.startsWith("api-key:")) {
    return actorId.slice("api-key:".length) || null;
  }

  return null;
}

function normalizeIsoTimestamp(value: string | undefined | null): string | null {
  const normalized = normalizeText(value);

  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return new Date(parsed).toISOString();
}

export async function buildValidationSummaryRouteResponse(
  query: ValidationSummaryQuery = {},
  summaryResult?: Awaited<ReturnType<typeof buildValidationSummary>>,
): Promise<{
  status: 200 | 400 | 503;
  json: ValidationSummaryResponse | { message: string };
}> {
  const since = query.since === undefined ? null : normalizeIsoTimestamp(query.since);

  if (query.since !== undefined && since === null) {
    return {
      status: 400,
      json: { message: "since must be a valid ISO timestamp" },
    };
  }

  const resolvedSummary = summaryResult ?? await buildValidationSummary({
    stationId: normalizeText(query.stationId),
    since,
  });

  if (!resolvedSummary.ok) {
    const reason: DegradedDataReason = resolvedSummary.fallbackReason === "db_path_missing"
      ? "db_path_missing"
      : "db_unavailable";
    return {
      status: 200,
      json: {
        generatedAt: new Date().toISOString(),
        summaryWindow: {
          since,
          stationId: normalizeText(query.stationId),
        },
        reliability: {
          totalEvaluations: 0,
          completedEvaluations: 0,
          outcomeCoverage: 0,
          empiricalAccuracy: null,
          averagePredictedConfidence: null,
          averageAdjustedConfidence: null,
          overallCalibrationGap: null,
          overconfidentBands: 0,
          underconfidentBands: 0,
        },
        confidenceBands: [],
        calibrationCurve: [],
        topFailureModes: [],
        feedbackTrendFlags: [],
        degraded: true,
        reason,
        trustStatus: SystemIntegrityStatus.TRUST_BLOCKED,
      },
    };
  }

  return {
    status: 200,
    json: resolvedSummary.summary,
  };
}

export async function buildAttachValidationOutcomeRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: RiskEvaluationOutcomeRequest,
  attachResult?: MarineRiskEvaluationOutcomeAttachResult,
): Promise<{
  status: 200 | 400 | 403 | 404 | 503;
  json: MarineWorkflowValidationOutcomeResponse | { message: string };
}> {
  const resolvedAttachResult = attachResult ?? await attachMarineRiskEvaluationOutcome({
    ...body,
    apiKeyId: extractApiKeyId(auth?.actorId),
  });

  if (resolvedAttachResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Validation storage is unavailable" },
    };
  }

  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
    };
  }

  if (!resolvedAttachResult.result.ok || !resolvedAttachResult.result.evaluation) {
    return {
      status: resolvedAttachResult.result.reason === "not_found" ? 404 : 400,
      json: { message: resolvedAttachResult.result.error },
    };
  }

  try {
    await auditHumanReview({
      eventId: buildHarnessEventId(
        "human_review",
        "risk_evaluation",
        body.evaluationId,
        stableContentHash({
          evaluationId: body.evaluationId,
          action: "attach_outcome",
          classification: body.classification,
        }),
      ),
      subjectType: "risk_evaluation",
      subjectId: body.evaluationId,
      action: "attach_outcome",
      actor: auth?.actorId ?? null,
      outcome: "pass",
      evaluatedAt: new Date().toISOString(),
      detail: body.classification,
    });
  } catch {
    // Harness audit is best-effort when storage is unavailable.
  }

  return {
    status: 200,
    json: { evaluation: resolvedAttachResult.result.evaluation },
  };
}

export async function buildAttachValidationFeedbackRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: RiskEvaluationFeedbackRequest,
  attachResult?: MarineRiskEvaluationOutcomeAttachResult,
): Promise<{
  status: 200 | 400 | 403 | 404 | 503;
  json: MarineWorkflowValidationOutcomeResponse | { message: string };
}> {
  const resolvedAttachResult = attachResult ?? await attachFeedbackToMarineRiskEvaluation({
    ...body,
    apiKeyId: extractApiKeyId(auth?.actorId),
  });

  if (resolvedAttachResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Validation storage is unavailable" },
    };
  }

  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
    };
  }

  if (!resolvedAttachResult.result.ok || !resolvedAttachResult.result.evaluation) {
    return {
      status: resolvedAttachResult.result.reason === "not_found" ? 404 : 400,
      json: { message: resolvedAttachResult.result.error },
    };
  }

  return {
    status: 200,
    json: { evaluation: resolvedAttachResult.result.evaluation },
  };
}

export const getValidationSummaryRoute: RouteDefinition<
  ValidationSummaryResponse | { message: string },
  undefined,
  ValidationSummaryQuery
> = {
  method: "GET",
  path: "/validation/summary",
  async handler(request) {
    return await buildValidationSummaryRouteResponse(request.query ?? {});
  },
};

export const postValidationOutcomeRoute: RouteDefinition<
  MarineWorkflowValidationOutcomeResponse | { message: string },
  RiskEvaluationOutcomeRequest
> = {
  method: "POST",
  path: "/validation/outcomes",
  async handler(request) {
    return await buildAttachValidationOutcomeRouteResponse(request.auth, request.body);
  },
};

export const postValidationFeedbackRoute: RouteDefinition<
  MarineWorkflowValidationOutcomeResponse | { message: string },
  RiskEvaluationFeedbackRequest
> = {
  method: "POST",
  path: "/validation/feedback",
  async handler(request) {
    return await buildAttachValidationFeedbackRouteResponse(request.auth, request.body);
  },
};
