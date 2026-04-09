import type {
  RiskEvaluationFeedbackRequest,
  RiskEvaluationOutcomeRequest,
  RiskEvaluationPredictionRequest,
  RiskEvaluationRecord,
  ValidationSummaryResponse,
} from "@marine/shared";
import {
  attachFeedbackToMarineRiskEvaluation,
  attachMarineRiskEvaluationOutcome,
} from "../repositories/marine-intelligence-validation";
import {
  buildValidationSummary,
  recordMarineRiskEvaluationWithCalibration,
} from "./marine-intelligence-validation";

export async function recordPublicRiskEvaluation(
  input: RiskEvaluationPredictionRequest,
): Promise<RiskEvaluationRecord | null> {
  const result = recordMarineRiskEvaluationWithCalibration(input);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.evaluation;
}

export async function attachPublicRiskEvaluationOutcome(
  input: RiskEvaluationOutcomeRequest,
): Promise<RiskEvaluationRecord | null> {
  const result = attachMarineRiskEvaluationOutcome(input);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.evaluation;
}

export async function attachPublicRiskEvaluationFeedback(
  input: RiskEvaluationFeedbackRequest,
): Promise<RiskEvaluationRecord | null> {
  const result = attachFeedbackToMarineRiskEvaluation(input);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.evaluation;
}

export async function readPublicValidationSummary(input: {
  stationId?: string | null;
  since?: string | null;
}): Promise<ValidationSummaryResponse | null> {
  const result = buildValidationSummary(input);

  if (!result.ok) {
    return null;
  }

  return result.summary;
}
