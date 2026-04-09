import type {
  RiskEvaluateResponse,
  RiskRecommendation,
  RiskScoreResponse,
  RiskSignalSummary,
  RiskTriggeredRule,
} from "@marine/shared";
import { recommendAction } from "@/lib/ontology/action-recommender";

type RiskRecommendationInput = Pick<
  RiskScoreResponse,
  "stationId" | "triggeredRules" | "operatorSummary" | "warningMessages"
> & {
  measuredAt: string;
  signals: RiskSignalSummary[];
};

function toObservationNode(payload: RiskRecommendationInput) {
  const signalMap = new Map(payload.signals.map((signal) => [signal.field, signal.value]));

  return {
    __type: "observation",
    __rid: `risk:${payload.stationId}:${payload.measuredAt}`,
    __primaryKey: `${payload.stationId}:${payload.measuredAt}`,
    stationId: payload.stationId,
    timestamp: payload.measuredAt,
    sstC: signalMap.get("seaSurfaceTempC") ?? null,
    waveHeightM: signalMap.get("waveHeightM") ?? null,
    windSpeedMps: signalMap.get("windSpeedMps") ?? null,
    pressureHpa: signalMap.get("pressureHpa") ?? null,
  };
}

function toAlertNodes(
  stationId: string,
  measuredAt: string,
  triggeredRules: RiskTriggeredRule[],
) {
  return triggeredRules.map((rule, index) => ({
    __type: "alert",
    __rid: `risk-alert:${index}`,
    __primaryKey: `risk-alert:${index}`,
    title: rule.title,
    severity: rule.severity,
    status: "active",
    detail: rule.detail,
    stationId,
    linkedInvestigationId: null,
    detectedAt: measuredAt,
  }));
}

export function buildRiskRecommendation(payload: RiskRecommendationInput): RiskRecommendation {
  return recommendAction({
    investigation: null,
    species: [],
    stations: [],
    observations: [toObservationNode(payload)],
    alerts: toAlertNodes(payload.stationId, payload.measuredAt, payload.triggeredRules),
    resolvedAt: payload.measuredAt,
    stationId: payload.stationId,
    baselineAnomaly: {
      zScore: Math.max(0, ...payload.signals.map((signal) => Math.abs(signal.zScore ?? 0))),
    },
    explanation: {
      summary: payload.operatorSummary,
      likelyDrivers: [],
      anomalyNotes: payload.warningMessages,
      generatedAt: payload.measuredAt,
    },
  });
}

export function attachRecommendationToRiskScoreResponse(
  payload: RiskScoreResponse,
): RiskScoreResponse {
  return {
    ...payload,
    recommendation: buildRiskRecommendation({
      stationId: payload.stationId,
      measuredAt: payload.computedAt,
      signals: payload.signals,
      triggeredRules: payload.triggeredRules,
      operatorSummary: payload.operatorSummary,
      warningMessages: payload.warningMessages,
    }),
  };
}

export function attachRecommendationToRiskEvaluateResponse(
  payload: RiskEvaluateResponse,
): RiskEvaluateResponse {
  return {
    ...payload,
    recommendation: buildRiskRecommendation({
      stationId: payload.stationId,
      measuredAt: payload.evaluatedAt,
      signals: payload.baselineStats,
      triggeredRules: payload.triggeredRules,
      operatorSummary: payload.operatorSummary,
      warningMessages: payload.warningMessages,
    }),
  };
}
