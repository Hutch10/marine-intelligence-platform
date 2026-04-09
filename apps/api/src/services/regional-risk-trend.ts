import type { InternalRegionRiskScoreResponse } from "../routes/region-risk";
import type { RegionalRiskSnapshotRecord } from "../repositories/regional-risk-snapshots";

export interface RegionalForecastWindow {
  riskLevel: "low" | "medium" | "high" | "critical";
  projectedScore: number;
  confidence: number;
}

export interface RegionalRiskTrendResult {
  trendDirection: "rising" | "falling" | "stable";
  trendStrength: "weak" | "moderate" | "strong";
  deltaScore: number;
  persistence: number;
  prior6hScore: number | null;
  prior12hScore: number | null;
  prior24hScore: number | null;
  next12h: RegionalForecastWindow;
  next24h: RegionalForecastWindow;
  operatorSummary: string;
}

interface BuildRegionalRiskTrendInput {
  current: InternalRegionRiskScoreResponse;
  history: RegionalRiskSnapshotRecord[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function scoreToRiskLevel(score: number): "low" | "medium" | "high" | "critical" {
  if (score >= 0.88) {
    return "critical";
  }

  if (score >= 0.66) {
    return "high";
  }

  if (score >= 0.38) {
    return "medium";
  }

  return "low";
}

function findWindowScore(
  history: RegionalRiskSnapshotRecord[],
  currentComputedAtMs: number,
  windowHours: number,
): number | null {
  const targetMs = currentComputedAtMs - (windowHours * 60 * 60 * 1000);
  const candidate = history
    .filter((snapshot) => Date.parse(snapshot.computedAt) <= targetMs)
    .sort((left, right) => Date.parse(right.computedAt) - Date.parse(left.computedAt))[0];

  return candidate?.weightedRegionalScore ?? null;
}

function averageScore(history: RegionalRiskSnapshotRecord[]): number | null {
  if (history.length === 0) {
    return null;
  }

  return history.reduce((sum, snapshot) => sum + snapshot.weightedRegionalScore, 0) / history.length;
}

function deriveTrendDirection(deltaScore: number): RegionalRiskTrendResult["trendDirection"] {
  if (deltaScore >= 0.08) {
    return "rising";
  }

  if (deltaScore <= -0.08) {
    return "falling";
  }

  return "stable";
}

function deriveTrendStrength(deltaScore: number): RegionalRiskTrendResult["trendStrength"] {
  const absoluteDelta = Math.abs(deltaScore);

  if (absoluteDelta >= 0.2) {
    return "strong";
  }

  if (absoluteDelta >= 0.1) {
    return "moderate";
  }

  return "weak";
}

function computePersistence(
  currentScore: number,
  history: RegionalRiskSnapshotRecord[],
): number {
  if (history.length === 0) {
    return 0;
  }

  const persistentSnapshots = history.filter((snapshot) =>
    Math.abs(snapshot.weightedRegionalScore - currentScore) <= 0.12
    || snapshot.regionalRiskLevel === scoreToRiskLevel(currentScore));

  return roundTo(persistentSnapshots.length / history.length, 2);
}

function computeForecastConfidence(
  current: InternalRegionRiskScoreResponse,
  persistence: number,
  crwBoost: number,
): number {
  const coveragePenalty = current.coverage.meets_minimum_healthy_stations ? 0 : 0.16;
  const corroborationBoost = current.corroborating_healthy_station_count >= 3 ? 0.08 : 0;

  return clamp(
    roundTo(
      current.confidence_score
      + (persistence * 0.1)
      + corroborationBoost
      + crwBoost
      - coveragePenalty,
      2,
    ),
    0.1,
    0.98,
  );
}

function buildForecastWindow(
  current: InternalRegionRiskScoreResponse,
  baseDelta: number,
  horizonMultiplier: number,
  persistence: number,
): RegionalForecastWindow {
  const corroborationBoost = current.corroborating_healthy_station_count >= 3 ? 0.04 : 0;
  const crwBoost = current.crw_support.supported ? 0.05 : 0;
  const coveragePenalty = current.coverage.meets_minimum_healthy_stations ? 0 : 0.08;
  const projectedScore = clamp(
    current.weighted_score
    + (baseDelta * horizonMultiplier)
    + corroborationBoost
    + crwBoost
    - coveragePenalty,
    0.12,
    0.98,
  );

  return {
    riskLevel: scoreToRiskLevel(projectedScore),
    projectedScore: roundTo(projectedScore, 3),
    confidence: computeForecastConfidence(current, persistence, current.crw_support.supported ? 0.04 : 0),
  };
}

export function buildRegionalRiskTrend(input: BuildRegionalRiskTrendInput): RegionalRiskTrendResult {
  const currentComputedAtMs = Date.parse(input.current.computed_at);
  const prior24hHistory = input.history.filter((snapshot) =>
    Date.parse(snapshot.computedAt) < currentComputedAtMs
    && Date.parse(snapshot.computedAt) >= currentComputedAtMs - (24 * 60 * 60 * 1000));
  const prior6hScore = findWindowScore(prior24hHistory, currentComputedAtMs, 6);
  const prior12hScore = findWindowScore(prior24hHistory, currentComputedAtMs, 12);
  const prior24hScore = findWindowScore(prior24hHistory, currentComputedAtMs, 24);
  const smoothedPastScore = averageScore(prior24hHistory);
  const deltaScore = roundTo(input.current.weighted_score - (smoothedPastScore ?? input.current.weighted_score), 3);
  const trendDirection = deriveTrendDirection(deltaScore);
  const trendStrength = deriveTrendStrength(deltaScore);
  const persistence = computePersistence(input.current.weighted_score, prior24hHistory);
  const next12h = buildForecastWindow(input.current, deltaScore, 1.1, persistence);
  const next24h = buildForecastWindow(input.current, deltaScore, 1.5, persistence);
  const operatorSummary = `${input.current.region_name} shows a ${trendDirection} ${trendStrength} trend `
    + `(delta ${deltaScore >= 0 ? "+" : ""}${deltaScore.toFixed(2)} over recent regional snapshots) `
    + `with persistence ${Math.round(persistence * 100)}%. `
    + `Forecast guidance suggests ${next12h.riskLevel} risk in 12h and ${next24h.riskLevel} risk in 24h.`;

  return {
    trendDirection,
    trendStrength,
    deltaScore,
    persistence,
    prior6hScore,
    prior12hScore,
    prior24hScore,
    next12h,
    next24h,
    operatorSummary,
  };
}
