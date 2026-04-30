import type {
  RiskEvaluationPredictionRequest,
  RiskRecommendationSignal,
  ValidationCalibrationCurvePoint,
  ValidationConfidenceBandSummary,
  ValidationFailureModeSummary,
  ValidationFeedbackTrendFlag,
  ValidationSummaryResponse,
} from "@marine/shared";
import {
  listMarineRiskEvaluations,
  recordMarineRiskEvaluationPrediction,
  type MarineRiskEvaluationListResult,
  type MarineRiskEvaluationPredictionCreateResult,
} from "../repositories/marine-intelligence-validation";

const CONFIDENCE_BANDS = [
  { label: "0.00-0.19", min: 0, max: 0.19 },
  { label: "0.20-0.39", min: 0.2, max: 0.39 },
  { label: "0.40-0.59", min: 0.4, max: 0.59 },
  { label: "0.60-0.79", min: 0.6, max: 0.79 },
  { label: "0.80-1.00", min: 0.8, max: 1.0 },
] as const;

function round(value: number | null, digits = 3): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function weightedAccuracyForClassification(classification: "correct" | "partial" | "incorrect"): number {
  if (classification === "correct") {
    return 1;
  }

  if (classification === "partial") {
    return 0.5;
  }

  return 0;
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function bandState(gap: number | null, evaluationCount: number): ValidationConfidenceBandSummary["confidenceState"] {
  if (evaluationCount < 2 || gap === null) {
    return "insufficient_data";
  }

  if (gap >= 0.1) {
    return "overconfident";
  }

  if (gap <= -0.1) {
    return "underconfident";
  }

  return "well_calibrated";
}

export async function buildValidationSummary(
  input: {
    stationId?: string | null;
    since?: string | null;
  } = {},
  readResult?: MarineRiskEvaluationListResult,
): Promise<{
  ok: true;
  summary: ValidationSummaryResponse;
} | {
  ok: false;
  fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed";
}> {
  const resolvedReadResult = readResult ?? await listMarineRiskEvaluations(input);
  if (resolvedReadResult.source === "unavailable") {
    return {
      ok: false,
      fallbackReason: resolvedReadResult.fallbackReason,
    };
  }

  const evaluations = resolvedReadResult.result.evaluations;
  const completed = evaluations.filter(
    (evaluation) => evaluation.actualOutcome !== null && evaluation.actualOutcome.source !== "simulated",
  );
  const confidenceBands: ValidationConfidenceBandSummary[] = CONFIDENCE_BANDS.map((band) => {
    const matches = completed.filter((evaluation) => {
      const score = evaluation.calibrationAdjustedConfidenceScore ?? evaluation.confidenceScore;
      return score >= band.min && score <= band.max;
    });
    const correctCount = matches.filter((evaluation) => evaluation.actualOutcome?.classification === "correct").length;
    const partialCount = matches.filter((evaluation) => evaluation.actualOutcome?.classification === "partial").length;
    const incorrectCount = matches.filter((evaluation) => evaluation.actualOutcome?.classification === "incorrect").length;
    const empiricalAccuracy = average(
      matches.map((evaluation) => weightedAccuracyForClassification(evaluation.actualOutcome?.classification ?? "incorrect")),
    );
    const avgPredicted = average(matches.map((evaluation) => evaluation.confidenceScore));
    const avgAdjusted = average(
      matches
        .map((evaluation) => evaluation.calibrationAdjustedConfidenceScore)
        .filter((value): value is number => typeof value === "number"),
    );
    const gap = empiricalAccuracy === null || avgPredicted === null ? null : round(avgPredicted - empiricalAccuracy);

    return {
      label: band.label,
      minConfidence: band.min,
      maxConfidence: band.max,
      evaluationCount: matches.length,
      correctCount,
      partialCount,
      incorrectCount,
      empiricalAccuracy,
      averagePredictedConfidence: avgPredicted,
      averageAdjustedConfidence: avgAdjusted,
      calibrationGap: gap,
      confidenceState: bandState(gap, matches.length),
    };
  });

  const calibrationCurve: ValidationCalibrationCurvePoint[] = confidenceBands.map((band) => ({
    bandLabel: band.label,
    bandMidpoint: round((band.minConfidence + band.maxConfidence) / 2, 2) ?? 0,
    averagePredictedConfidence: band.averagePredictedConfidence,
    empiricalAccuracy: band.empiricalAccuracy,
    calibrationGap: band.calibrationGap,
    evaluationCount: band.evaluationCount,
  }));

  const falsePositiveHighRisk = completed.filter(
    (evaluation) =>
      (evaluation.predictedRiskLevel === "high" || evaluation.predictedRiskLevel === "critical")
      && evaluation.actualOutcome?.classification === "incorrect",
  ).length;
  const falseNegativeHighOutcome = completed.filter(
    (evaluation) =>
      (evaluation.predictedRiskLevel === "low" || evaluation.predictedRiskLevel === "medium")
      && (evaluation.actualOutcome?.actualRiskLevel === "high" || evaluation.actualOutcome?.actualRiskLevel === "critical")
      && evaluation.actualOutcome.classification !== "correct",
  ).length;
  const missedMultiFactorInteraction = completed.filter(
    (evaluation) =>
      evaluation.contributingSignals.length >= 2
      && evaluation.actualOutcome?.classification !== "correct",
  ).length;
  const overconfidentPrediction = completed.filter((evaluation) => {
    const score = evaluation.calibrationAdjustedConfidenceScore ?? evaluation.confidenceScore;
    return score >= 0.7 && evaluation.actualOutcome?.classification === "incorrect";
  }).length;
  const negativeOperatorFeedback = evaluations.filter(
    (evaluation) => evaluation.feedbackUseful === false,
  ).length;

  const failureModeTotal = Math.max(1, completed.length || evaluations.length || 1);
  const topFailureModes = [
    {
      code: "false_positive_high_risk",
      label: "High-risk false positives",
      count: falsePositiveHighRisk,
      share: round(falsePositiveHighRisk / failureModeTotal, 3) ?? 0,
    },
    {
      code: "false_negative_high_outcome",
      label: "High-outcome false negatives",
      count: falseNegativeHighOutcome,
      share: round(falseNegativeHighOutcome / failureModeTotal, 3) ?? 0,
    },
    {
      code: "missed_multi_factor_interaction",
      label: "Missed multi-factor interactions",
      count: missedMultiFactorInteraction,
      share: round(missedMultiFactorInteraction / failureModeTotal, 3) ?? 0,
    },
    {
      code: "overconfident_prediction",
      label: "Overconfident predictions",
      count: overconfidentPrediction,
      share: round(overconfidentPrediction / failureModeTotal, 3) ?? 0,
    },
    {
      code: "negative_operator_feedback",
      label: "Negative operator feedback",
      count: negativeOperatorFeedback,
      share: round(negativeOperatorFeedback / Math.max(1, evaluations.length), 3) ?? 0,
    },
  ] satisfies ValidationFailureModeSummary[];

  topFailureModes.sort((left, right) => right.count - left.count || left.label.localeCompare(right.label));

  const signalFeedbackMap = new Map<string, { total: number; negative: number }>();

  for (const evaluation of evaluations) {
    const signalLabels = new Set<string>(
      evaluation.contributingSignals.map((signal) => signal.label),
    );

    for (const label of signalLabels) {
      const current = signalFeedbackMap.get(label) ?? { total: 0, negative: 0 };
      current.total += 1;
      if (evaluation.feedbackUseful === false) {
        current.negative += 1;
      }
      signalFeedbackMap.set(label, current);
    }
  }

  const feedbackTrendFlags: ValidationFeedbackTrendFlag[] = [...signalFeedbackMap.entries()]
    .map(([signalLabel, counts]) => ({
      signalLabel,
      negativeFeedbackRate: round(counts.negative / Math.max(1, counts.total), 3) ?? 0,
      feedbackCount: counts.negative,
      recommendationCount: counts.total,
    }))
    .filter((flag) => flag.recommendationCount >= 2 && flag.negativeFeedbackRate >= 0.5)
    .sort((left, right) => right.negativeFeedbackRate - left.negativeFeedbackRate || right.recommendationCount - left.recommendationCount)
    .slice(0, 5);

  const empiricalAccuracy = average(
    completed.map((evaluation) => weightedAccuracyForClassification(evaluation.actualOutcome?.classification ?? "incorrect")),
  );
  const averagePredictedConfidence = average(completed.map((evaluation) => evaluation.confidenceScore));
  const averageAdjustedConfidence = average(
    completed
      .map((evaluation) => evaluation.calibrationAdjustedConfidenceScore)
      .filter((value): value is number => typeof value === "number"),
  );
  const overallCalibrationGap =
    empiricalAccuracy === null || averagePredictedConfidence === null
      ? null
      : round(averagePredictedConfidence - empiricalAccuracy);

  return {
    ok: true,
    summary: {
      generatedAt: new Date().toISOString(),
      summaryWindow: {
        since: input.since ?? null,
        stationId: input.stationId ?? null,
      },
      reliability: {
        totalEvaluations: evaluations.length,
        completedEvaluations: completed.length,
        outcomeCoverage: round(completed.length / Math.max(1, evaluations.length), 3) ?? 0,
        empiricalAccuracy,
        averagePredictedConfidence,
        averageAdjustedConfidence,
        overallCalibrationGap,
        overconfidentBands: confidenceBands.filter((band) => band.confidenceState === "overconfident").length,
        underconfidentBands: confidenceBands.filter((band) => band.confidenceState === "underconfident").length,
      },
      confidenceBands,
      calibrationCurve,
      topFailureModes,
      feedbackTrendFlags,
    },
  };
}

export async function calculateCalibrationAdjustedConfidence(
  prediction: Pick<RiskEvaluationPredictionRequest, "confidenceScore" | "contributingSignals" | "stationId">,
  readResult?: MarineRiskEvaluationListResult,
): Promise<number | null> {
  const resolvedReadResult = readResult ?? await listMarineRiskEvaluations({
    limit: 500,
    sinceDays: 90,
    stationId: prediction.stationId,
  });

  if (resolvedReadResult.source === "unavailable") {
    return null;
  }

  const completed = resolvedReadResult.result.evaluations.filter(
    (evaluation) => evaluation.actualOutcome !== null && evaluation.actualOutcome.source !== "simulated",
  );
  const baseConfidence = round(prediction.confidenceScore);

  if (baseConfidence === null) {
    return null;
  }

  let adjusted = baseConfidence;
  const matchingBand = CONFIDENCE_BANDS.find((band) => baseConfidence >= band.min && baseConfidence <= band.max);

  if (matchingBand) {
    const bandEvaluations = completed.filter((evaluation) => {
      const score = evaluation.calibrationAdjustedConfidenceScore ?? evaluation.confidenceScore;
      return score >= matchingBand.min && score <= matchingBand.max;
    });

    if (bandEvaluations.length >= 3) {
      const bandAccuracy = average(
        bandEvaluations.map((evaluation) => weightedAccuracyForClassification(evaluation.actualOutcome?.classification ?? "incorrect")),
      );

      if (bandAccuracy !== null) {
        const gap = adjusted - bandAccuracy;
        adjusted = round(adjusted - (gap * 0.5), 3) ?? adjusted;
      }
    }
  }

  const signalPenalty = buildSignalPenaltyMap(completed);

  for (const signal of prediction.contributingSignals) {
    const penalty = signalPenalty.get(signal.label);
    if (penalty) {
      adjusted -= penalty;
    }
  }

  return Math.min(1, Math.max(0, round(adjusted, 3) ?? adjusted));
}

function buildSignalPenaltyMap(
  evaluations: Array<{
    feedbackUseful: boolean | null;
    contributingSignals: RiskRecommendationSignal[];
  }>,
): Map<string, number> {
  const counts = new Map<string, { total: number; negative: number }>();

  for (const evaluation of evaluations) {
    const labels = new Set(evaluation.contributingSignals.map((signal) => signal.label));

    for (const label of labels) {
      const current = counts.get(label) ?? { total: 0, negative: 0 };
      current.total += 1;
      if (evaluation.feedbackUseful === false) {
        current.negative += 1;
      }
      counts.set(label, current);
    }
  }

  const penalties = new Map<string, number>();

  for (const [label, stat] of counts.entries()) {
    if (stat.total >= 3 && stat.negative / stat.total >= 0.5) {
      penalties.set(label, 0.03);
    }
  }

  return penalties;
}

export async function recordMarineRiskEvaluationWithCalibration(
  input: RiskEvaluationPredictionRequest,
  createResult?: MarineRiskEvaluationPredictionCreateResult,
): Promise<MarineRiskEvaluationPredictionCreateResult> {
  const adjusted = await calculateCalibrationAdjustedConfidence(input);
  const payload: RiskEvaluationPredictionRequest = {
    ...input,
    calibrationAdjustedConfidenceScore:
      input.calibrationAdjustedConfidenceScore === undefined
        ? adjusted
        : input.calibrationAdjustedConfidenceScore,
  };

  return createResult ?? await recordMarineRiskEvaluationPrediction(payload);
}
