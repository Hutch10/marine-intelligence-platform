import type {
  MarineWorkflowValidationOutcomeResponse,
  RiskEvaluationFeedbackRequest,
  RiskEvaluationOutcomeRequest,
  ValidationSummaryResponse,
} from "@marine/shared";
import type { OceanStationAdminAuthContext, OceanStationAdminPermission } from "@marine/shared";
import {
  attachFeedbackToMarineRiskEvaluation,
  attachMarineRiskEvaluationOutcome,
  type MarineRiskEvaluationOutcomeAttachResult,
} from "../repositories/marine-intelligence-validation";
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

export function buildValidationSummaryRouteResponse(
  query: ValidationSummaryQuery = {},
  summaryResult?: ReturnType<typeof buildValidationSummary>,
): {
  status: 200 | 400 | 503;
  json: ValidationSummaryResponse | { message: string };
} {
  const since = query.since === undefined ? null : normalizeIsoTimestamp(query.since);

  if (query.since !== undefined && since === null) {
    return {
      status: 400,
      json: { message: "since must be a valid ISO timestamp" },
    };
  }

  const resolvedSummary = summaryResult ?? buildValidationSummary({
    stationId: normalizeText(query.stationId),
    since,
  });

  if (!resolvedSummary.ok) {
    return {
      status: 503,
      json: { message: "Validation summary unavailable" },
    };
  }

  return {
    status: 200,
    json: resolvedSummary.summary,
  };
}

export function buildAttachValidationOutcomeRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: RiskEvaluationOutcomeRequest,
  attachResult: MarineRiskEvaluationOutcomeAttachResult = attachMarineRiskEvaluationOutcome({
    ...body,
    apiKeyId: extractApiKeyId(auth?.actorId),
  }),
): {
  status: 200 | 400 | 403 | 404 | 503;
  json: MarineWorkflowValidationOutcomeResponse | { message: string };
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
    };
  }

  if (attachResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Validation outcome storage unavailable" },
    };
  }

  if (!attachResult.result.ok || !attachResult.result.evaluation) {
    return {
      status: attachResult.result.reason === "not_found" ? 404 : 400,
      json: { message: attachResult.result.error },
    };
  }

  return {
    status: 200,
    json: { evaluation: attachResult.result.evaluation },
  };
}

export function buildAttachValidationFeedbackRouteResponse(
  auth: OceanStationAdminAuthContext | undefined,
  body: RiskEvaluationFeedbackRequest,
  attachResult: MarineRiskEvaluationOutcomeAttachResult = attachFeedbackToMarineRiskEvaluation({
    ...body,
    apiKeyId: extractApiKeyId(auth?.actorId),
  }),
): {
  status: 200 | 400 | 403 | 404 | 503;
  json: MarineWorkflowValidationOutcomeResponse | { message: string };
} {
  if (!hasViewAdminPermission(auth)) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
    };
  }

  if (attachResult.source === "unavailable") {
    return {
      status: 503,
      json: { message: "Validation feedback storage unavailable" },
    };
  }

  if (!attachResult.result.ok || !attachResult.result.evaluation) {
    return {
      status: attachResult.result.reason === "not_found" ? 404 : 400,
      json: { message: attachResult.result.error },
    };
  }

  return {
    status: 200,
    json: { evaluation: attachResult.result.evaluation },
  };
}

export const getValidationSummaryRoute: RouteDefinition<
  ValidationSummaryResponse | { message: string },
  undefined,
  ValidationSummaryQuery
> = {
  method: "GET",
  path: "/validation/summary",
  handler(request) {
    return buildValidationSummaryRouteResponse(request.query ?? {});
  },
};

export const postValidationOutcomeRoute: RouteDefinition<
  MarineWorkflowValidationOutcomeResponse | { message: string },
  RiskEvaluationOutcomeRequest
> = {
  method: "POST",
  path: "/validation/outcomes",
  handler(request) {
    return buildAttachValidationOutcomeRouteResponse(request.auth, request.body);
  },
};

export const postValidationFeedbackRoute: RouteDefinition<
  MarineWorkflowValidationOutcomeResponse | { message: string },
  RiskEvaluationFeedbackRequest
> = {
  method: "POST",
  path: "/validation/feedback",
  handler(request) {
    return buildAttachValidationFeedbackRouteResponse(request.auth, request.body);
  },
};
