import { RiskSignalSummary, FusionState } from "@marine/shared/src/types";

/**
 * Canonical builder for RiskSignalSummary.
 * Ensures sources and fusionState are always present and valid.
 */
export function buildRiskSignal(input: Omit<RiskSignalSummary, "sources" | "fusionState"> & {
  sources?: string[];
  fusionState?: FusionState;
}): RiskSignalSummary {
  // Assign sources based on field or input
  let sources: string[] = input.sources ?? [];
  if (!sources.length) {
    switch (input.field) {
      case "salinityPsu":
      case "dissolvedOxygenMgL":
        sources = ["ERDDAP"];
        break;
      case "crwSstAnomalyC":
        sources = ["CRW"];
        break;
      default:
        sources = ["NDBC"];
    }
  }

  // Compute fusionState if not provided
  let fusionState: FusionState = input.fusionState ?? "single";
  if (sources.length > 1) {
    // If more than one source, default to agreement (extend as needed)
    fusionState = "agreement";
  } else if (sources.length === 1) {
    fusionState = "single";
  }

  return {
    ...input,
    sources,
    fusionState,
  };
}
import type { NdbcMappedObservation } from "../connectors/ndbc/map";
import type { ResolvedStationRiskThreshold } from "../repositories/station-risk-thresholds";
import {
  scoreBaselineAnomalies,
  type BaselineObservationInput,
  type BaselineSignalStats,
  type CrwBaselineInput,
} from "./ingestion/baseline-anomaly";

export type SignalFusionRiskLevel = "low" | "moderate" | "high" | "critical";

export interface SignalFusionContributor {
  kind: "threshold" | "baseline_anomaly" | "crw_context" | "neighbor_corroboration" | "trend" | "confidence";
  field: BaselineSignalStats["field"] | ResolvedStationRiskThreshold["metric"] | null;
  title: string;
  detail: string;
  score: number;
  confidenceAdjustment: number;
}

export interface SignalFusionResult {
  riskLevel: SignalFusionRiskLevel;
  confidence: number;
  reasons: string[];
  contributors: SignalFusionContributor[];
  neighborInfluence: "none" | "supporting" | "isolated" | "mixed";
}

export interface SignalFusionInput {
  observation: NdbcMappedObservation;
  thresholds: ResolvedStationRiskThreshold[];
  baselineHistory: BaselineObservationInput[];
  neighborObservations?: BaselineObservationInput[];
  crwCurrent?: CrwBaselineInput | null;
  crwHistory?: CrwBaselineInput[];
  baselineWindowDays?: number;
  anomalyZScoreThreshold?: number;
  trendSampleCount?: number;
}

interface ThresholdSignal {
  breached: boolean;
  reason: string | null;
  title: string | null;
  detail: string | null;
  score: number;
  field: ResolvedStationRiskThreshold["metric"];
}

interface TrendSignal {
  triggered: boolean;
  reason: string | null;
  title: string | null;
  detail: string | null;
  score: number;
  field: "seaSurfaceTempC" | "windSpeedMps" | "crwSstAnomalyC" | null;
}

interface NeighborCorroborationSignal {
  confidenceAdjustment: number;
  reason: string | null;
  scoreAdjustment: number;
  influence: "none" | "supporting" | "isolated" | "mixed";
}

interface NeighborCoverageSignal {
  confidenceAdjustment: number;
  reason: string | null;
}

const DEFAULT_BASELINE_WINDOW_DAYS = 45;
const DEFAULT_ANOMALY_Z_SCORE_THRESHOLD = 2;
const DEFAULT_TREND_SAMPLE_COUNT = 5;
const MIN_REGIONAL_NEIGHBOR_COVERAGE = 3;
const NEIGHBOR_DELTA_TOLERANCES: Partial<Record<BaselineSignalStats["field"], number>> = {
  seaSurfaceTempC: 1.2,
  waveHeightM: 0.8,
  windSpeedMps: 2.5,
  pressureHpa: 6,
};

function isCrwField(field: BaselineSignalStats["field"]): field is "crwSstAnomalyC" | "crwHotspotC" | "crwDhw" {
  return field === "crwSstAnomalyC" || field === "crwHotspotC" || field === "crwDhw";
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function metricLabel(metric: ResolvedStationRiskThreshold["metric"]): string {
  switch (metric) {
    case "seaSurfaceTempC":
      return "SST";
    case "waveHeightM":
      return "wave height";
    case "windSpeedMps":
      return "wind speed";
    case "pressureHpa":
      return "pressure";
    default:
      return metric;
  }
}

function baselineFieldLabel(field: BaselineSignalStats["field"]): string {
  switch (field) {
    case "crwSstAnomalyC":
      return "CRW SST anomaly";
    case "crwHotspotC":
      return "CRW hotspot";
    case "crwDhw":
      return "CRW DHW";
    default:
      return metricLabel(field);
  }
}

function metricUnit(metric: ResolvedStationRiskThreshold["metric"]): string {
  switch (metric) {
    case "seaSurfaceTempC":
      return "°C";
    case "waveHeightM":
      return "m";
    case "windSpeedMps":
      return "m/s";
    case "pressureHpa":
      return "hPa";
    default:
      return "";
  }
}

function formatMetricValue(
  metric: ResolvedStationRiskThreshold["metric"],
  value: number,
): string {
  const digits = metric === "pressureHpa" ? 0 : 1;
  const unit = metricUnit(metric);
  return `${value.toFixed(digits)}${unit ? ` ${unit}` : ""}`;
}

function buildThresholdSignal(
  observation: NdbcMappedObservation,
  threshold: ResolvedStationRiskThreshold,
): ThresholdSignal {
  const value = observation[threshold.metric];

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return { breached: false, reason: null, title: null, detail: null, score: 0, field: threshold.metric };
  }

  const breached = threshold.comparator === "above"
    ? value > threshold.thresholdValue
    : value < threshold.thresholdValue;

  if (!breached) {
    return { breached: false, reason: null, title: null, detail: null, score: 0, field: threshold.metric };
  }

  const magnitude = threshold.comparator === "above"
    ? value - threshold.thresholdValue
    : threshold.thresholdValue - value;
  const severityBoost = threshold.source === "station_override" ? 0.05 : 0;
  const score = clamp(0.42 + Math.min(0.18, magnitude * 0.05) + severityBoost, 0, 0.65);
  const comparatorText = threshold.comparator === "above" ? "above" : "below";

  return {
    breached: true,
    field: threshold.metric,
    score,
    reason: `${metricLabel(threshold.metric)} crossed ${comparatorText} threshold (${formatMetricValue(threshold.metric, value)} vs ${formatMetricValue(threshold.metric, threshold.thresholdValue)}).`,
    title: `${metricLabel(threshold.metric)} threshold breach`,
    detail: `Observed ${metricLabel(threshold.metric)} was ${formatMetricValue(threshold.metric, value)} which is ${comparatorText} configured threshold ${formatMetricValue(threshold.metric, threshold.thresholdValue)}.`,
  };
}

function buildAnomalySignals(
  stats: BaselineSignalStats[],
  threshold: number,
): Array<{ triggered: boolean; reason: string | null; title: string | null; detail: string | null; score: number; field: BaselineSignalStats["field"] }> {
  return stats.map((stat) => {
    if (isCrwField(stat.field) && (stat.zScore === null || stat.zScore <= 0)) {
      return { triggered: false, reason: null, title: null, detail: null, score: 0, field: stat.field };
    }

    if (stat.zScore === null || Math.abs(stat.zScore) < threshold) {
      return { triggered: false, reason: null, title: null, detail: null, score: 0, field: stat.field };
    }

    const score = clamp(0.22 + Math.min(0.18, (Math.abs(stat.zScore) - threshold) * 0.08), 0, 0.4);
    const baselineKind = stat.usedSeasonalBucket ? "seasonal" : "rolling";
    const provenanceLabel = stat.sourceProvenance === "crw_proxy"
      ? " using CRW-derived SST proxy"
      : stat.sourceProvenance === "crw"
        ? " from CRW history"
        : "";

    return {
      triggered: true,
      field: stat.field,
      score,
      reason: `${baselineFieldLabel(stat.field)} anomaly detected at z=${stat.zScore.toFixed(2)} against ${baselineKind} baseline${provenanceLabel}.`,
      title: `${baselineFieldLabel(stat.field)} anomaly`,
      detail: `z-score ${stat.zScore.toFixed(2)} against ${baselineKind} baseline${provenanceLabel}.`,
    };
  });
}

function buildCrwStressSignals(
  current: CrwBaselineInput | null | undefined,
): Array<{ triggered: boolean; reason: string | null; title: string | null; detail: string | null; score: number; field: "crwSstAnomalyC" | "crwHotspotC" | "crwDhw" }> {
  if (!current) {
    return [];
  }

  const signals: Array<{ triggered: boolean; reason: string | null; title: string | null; detail: string | null; score: number; field: "crwSstAnomalyC" | "crwHotspotC" | "crwDhw" }> = [];

  if (typeof current.sstAnomalyC === "number" && current.sstAnomalyC >= 1) {
    signals.push({
      triggered: true,
      field: "crwSstAnomalyC",
      score: clamp(0.12 + Math.min(0.1, (current.sstAnomalyC - 1) * 0.08), 0, 0.22),
      reason: `CRW SST anomaly is elevated at ${current.sstAnomalyC.toFixed(2)} °C in ${current.regionKey}.`,
      title: "CRW SST anomaly elevated",
      detail: `CRW SST anomaly is ${current.sstAnomalyC.toFixed(2)} °C in ${current.regionKey}.`,
    });
  }

  if (typeof current.hotSpotC === "number" && current.hotSpotC > 0) {
    signals.push({
      triggered: true,
      field: "crwHotspotC",
      score: clamp(0.12 + Math.min(0.12, current.hotSpotC * 0.08), 0, 0.24),
      reason: `CRW hotspot is elevated at ${current.hotSpotC.toFixed(2)} °C in ${current.regionKey}.`,
      title: "CRW hotspot elevated",
      detail: `CRW hotspot is ${current.hotSpotC.toFixed(2)} °C in ${current.regionKey}.`,
    });
  }

  if (typeof current.dhw === "number" && current.dhw >= 4) {
    signals.push({
      triggered: true,
      field: "crwDhw",
      score: clamp(0.18 + Math.min(0.18, (current.dhw - 4) * 0.04), 0, 0.36),
      reason: `CRW DHW indicates accumulated reef heat stress at ${current.dhw.toFixed(2)} in ${current.regionKey}.`,
      title: "CRW DHW elevated",
      detail: `CRW DHW is ${current.dhw.toFixed(2)} in ${current.regionKey}.`,
    });
  }

  return signals;
}

function countNeighborFieldValues(
  neighbors: BaselineObservationInput[],
  field: keyof Pick<BaselineObservationInput, "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa">,
): number {
  return neighbors
    .map((neighbor) => neighbor[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .length;
}

function buildNeighborCorroborationSignal(
  stats: BaselineSignalStats[],
  neighborObservations: BaselineObservationInput[],
  threshold: number,
): NeighborCorroborationSignal {
  if (neighborObservations.length === 0) {
    return {
      scoreAdjustment: 0,
      confidenceAdjustment: 0,
      reason: null,
      influence: "none",
    };
  }

  let corroboratedSignals = 0;
  let isolatedSignals = 0;

  for (const stat of stats) {
    const tolerance = NEIGHBOR_DELTA_TOLERANCES[stat.field];
    if (
      stat.zScore === null
      || Math.abs(stat.zScore) < threshold
      || stat.neighborMean === null
      || stat.neighborDelta === null
      || tolerance === undefined
    ) {
      continue;
    }

    const neighborFieldCount = countNeighborFieldValues(
      neighborObservations,
      stat.field as keyof Pick<BaselineObservationInput, "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa">,
    );

    if (neighborFieldCount < 1) {
      continue;
    }

    if (Math.abs(stat.neighborDelta) <= tolerance) {
      corroboratedSignals += 1;
      continue;
    }

    isolatedSignals += 1;
  }

  if (corroboratedSignals === 0 && isolatedSignals === 0) {
    return {
      scoreAdjustment: 0,
      confidenceAdjustment: 0,
      reason: null,
      influence: "none",
    };
  }

  const scoreAdjustment = clamp(
    (corroboratedSignals * 0.05) - (isolatedSignals * 0.04),
    -0.12,
    0.16,
  );
  const confidenceAdjustment = clamp(
    (corroboratedSignals * 0.06) - (isolatedSignals * 0.07),
    -0.18,
    0.18,
  );

  if (corroboratedSignals > 0 && isolatedSignals === 0) {
    return {
      scoreAdjustment,
      confidenceAdjustment,
      reason: `Nearby stations corroborate ${corroboratedSignals} anomalous signal${corroboratedSignals === 1 ? "" : "s"} across the regional snapshot.`,
      influence: "supporting",
    };
  }

  if (isolatedSignals > 0 && corroboratedSignals === 0) {
    return {
      scoreAdjustment,
      confidenceAdjustment,
      reason: `Current anomaly pattern is isolated relative to nearby stations, reducing regional confidence.`,
      influence: "isolated",
    };
  }

  return {
    scoreAdjustment,
    confidenceAdjustment,
    reason: `Regional corroboration is mixed: ${corroboratedSignals} signal${corroboratedSignals === 1 ? "" : "s"} align with nearby stations while ${isolatedSignals} remain isolated.`,
    influence: "mixed",
  };
}

function buildNeighborCoverageSignal(
  neighborObservations: BaselineObservationInput[],
): NeighborCoverageSignal {
  if (neighborObservations.length >= MIN_REGIONAL_NEIGHBOR_COVERAGE) {
    return {
      confidenceAdjustment: 0,
      reason: null,
    };
  }

  const shortfall = MIN_REGIONAL_NEIGHBOR_COVERAGE - neighborObservations.length;

  return {
    confidenceAdjustment: -clamp(shortfall * 0.05, 0.05, 0.15),
    reason: `Regional confidence is reduced because only ${neighborObservations.length} neighboring station snapshot${neighborObservations.length === 1 ? "" : "s"} were available; target coverage is ${MIN_REGIONAL_NEIGHBOR_COVERAGE}.`,
  };
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function recentMetricValues(
  history: BaselineObservationInput[],
  observedAt: number,
  metric: keyof Pick<NdbcMappedObservation, "seaSurfaceTempC" | "windSpeedMps">,
  sampleCount: number,
): number[] {
  return history
    .filter((item) => item.observedAt < observedAt)
    .sort((left, right) => right.observedAt - left.observedAt)
    .map((item) => item[metric])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .slice(0, sampleCount)
    .reverse();
}

function buildSstTrendSignal(
  observation: NdbcMappedObservation,
  history: BaselineObservationInput[],
  crwCurrent: CrwBaselineInput | null | undefined,
  crwHistory: CrwBaselineInput[],
  sampleCount: number,
): TrendSignal {
  if (typeof observation.seaSurfaceTempC === "number" && Number.isFinite(observation.seaSurfaceTempC)) {
    const recent = recentMetricValues(history, observation.observedAt, "seaSurfaceTempC", sampleCount);
    const baselineMean = average(recent);

  if (baselineMean === null) {
      return { triggered: false, reason: null, title: null, detail: null, score: 0, field: "seaSurfaceTempC" };
    }

    const delta = observation.seaSurfaceTempC - baselineMean;

    if (delta <= 0.5) {
      return { triggered: false, reason: null, title: null, detail: null, score: 0, field: "seaSurfaceTempC" };
    }

    return {
      triggered: true,
      field: "seaSurfaceTempC",
      score: clamp(0.1 + Math.min(0.15, delta * 0.06), 0, 0.25),
      reason: `SST is rising versus recent baseline history by ${delta.toFixed(2)} °C.`,
      title: "SST trend rising",
      detail: `SST is ${delta.toFixed(2)} °C above recent baseline trend.`,
    };
  }

  if (
    !crwCurrent
    || typeof crwCurrent.sstAnomalyC !== "number"
    || !Number.isFinite(crwCurrent.sstAnomalyC)
  ) {
    return { triggered: false, reason: null, title: null, detail: null, score: 0, field: null };
  }

  const recentCrw = crwHistory
    .filter((item) => item.observedAt < crwCurrent.observedAt)
    .sort((left, right) => right.observedAt - left.observedAt)
    .map((item) => item.sstAnomalyC)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .slice(0, sampleCount)
    .reverse();
  const baselineMean = average(recentCrw);

  if (baselineMean === null) {
    return { triggered: false, reason: null, title: null, detail: null, score: 0, field: "crwSstAnomalyC" };
  }

  const delta = crwCurrent.sstAnomalyC - baselineMean;
  if (delta <= 0.25) {
    return { triggered: false, reason: null, title: null, detail: null, score: 0, field: "crwSstAnomalyC" };
  }

  return {
    triggered: true,
    field: "crwSstAnomalyC",
    score: clamp(0.08 + Math.min(0.12, delta * 0.08), 0, 0.2),
    reason: `CRW-derived SST proxy is rising versus recent CRW baseline by ${delta.toFixed(2)} °C.`,
    title: "CRW SST trend rising",
    detail: `CRW SST anomaly is ${delta.toFixed(2)} °C above recent CRW baseline trend.`,
  };
}

function buildWindTrendSignal(
  observation: NdbcMappedObservation,
  history: BaselineObservationInput[],
  sampleCount: number,
): TrendSignal {
  if (typeof observation.windSpeedMps !== "number" || !Number.isFinite(observation.windSpeedMps)) {
    return { triggered: false, reason: null, title: null, detail: null, score: 0, field: "windSpeedMps" };
  }

  const recent = recentMetricValues(history, observation.observedAt, "windSpeedMps", sampleCount);
  const baselineMean = average(recent);

  if (baselineMean === null) {
    return { triggered: false, reason: null, title: null, detail: null, score: 0, field: "windSpeedMps" };
  }

  const delta = baselineMean - observation.windSpeedMps;

  if (delta <= 1) {
    return { triggered: false, reason: null, title: null, detail: null, score: 0, field: "windSpeedMps" };
  }

  return {
    triggered: true,
    field: "windSpeedMps",
    score: clamp(0.08 + Math.min(0.12, delta * 0.04), 0, 0.2),
    reason: `Wind speed is falling versus recent baseline history by ${delta.toFixed(2)} m/s.`,
    title: "Wind trend falling",
    detail: `Wind speed is ${delta.toFixed(2)} m/s below recent baseline trend.`,
  };
}

function buildConfidenceContributor(
  baselineStats: BaselineSignalStats[],
  threshold: number,
): SignalFusionContributor | null {
  const populatedSampleCounts = baselineStats
    .filter((stat) => !isCrwField(stat.field) || (stat.zScore !== null && stat.zScore > 0))
    .map((stat) => stat.sampleCount)
    .filter((sampleCount) => Number.isFinite(sampleCount) && sampleCount > 0);
  const minSampleCount = populatedSampleCounts.length > 0 ? Math.min(...populatedSampleCounts) : 0;

  if (minSampleCount >= threshold) {
    return null;
  }

  const penalty = clamp((threshold - minSampleCount) * 0.02, 0.04, 0.18);

  return {
    kind: "confidence",
    field: null,
    title: "Limited baseline depth",
    detail: `Minimum contributing sample count is ${minSampleCount}, below target threshold ${threshold}.`,
    score: 0,
    confidenceAdjustment: -penalty,
  };
}

function determineRiskLevel(score: number): SignalFusionRiskLevel {
  if (score >= 0.95) {
    return "critical";
  }

  if (score >= 0.68) {
    return "high";
  }

  if (score >= 0.36) {
    return "moderate";
  }

  return "low";
}

export function fuseStationSignals(input: SignalFusionInput): SignalFusionResult {
  const baselineWindowDays = input.baselineWindowDays ?? DEFAULT_BASELINE_WINDOW_DAYS;
  const anomalyZScoreThreshold = input.anomalyZScoreThreshold ?? DEFAULT_ANOMALY_Z_SCORE_THRESHOLD;
  const trendSampleCount = input.trendSampleCount ?? DEFAULT_TREND_SAMPLE_COUNT;

  const thresholdSignals = input.thresholds.map((threshold) =>
    buildThresholdSignal(input.observation, threshold),
  );

  const baselineStats = scoreBaselineAnomalies(input.observation, input.baselineHistory, {
    windowDays: baselineWindowDays,
    zScoreThreshold: anomalyZScoreThreshold,
    neighborObservations: input.neighborObservations,
    crwCurrent: input.crwCurrent,
    crwHistory: input.crwHistory,
  });

  const anomalySignals = buildAnomalySignals(baselineStats, anomalyZScoreThreshold);
  const crwStressSignals = buildCrwStressSignals(input.crwCurrent);
  const neighborCorroboration = buildNeighborCorroborationSignal(
    baselineStats,
    input.neighborObservations ?? [],
    anomalyZScoreThreshold,
  );
  const neighborCoverage = buildNeighborCoverageSignal(input.neighborObservations ?? []);
  const sstTrendSignal = buildSstTrendSignal(
    input.observation,
    input.baselineHistory,
    input.crwCurrent,
    input.crwHistory ?? [],
    trendSampleCount,
  );
  const windTrendSignal = buildWindTrendSignal(input.observation, input.baselineHistory, trendSampleCount);
  const confidenceContributor = buildConfidenceContributor(baselineStats, anomalyZScoreThreshold + 5);

  const allScores = [
    ...thresholdSignals.map((signal) => signal.score),
    ...anomalySignals.map((signal) => signal.score),
    ...crwStressSignals.map((signal) => signal.score),
    neighborCorroboration.scoreAdjustment,
    sstTrendSignal.score,
    windTrendSignal.score,
  ];

  const totalScore = clamp(allScores.reduce((sum, score) => sum + score, 0), 0, 1.2);
  const confidenceBase = clamp(0.18 + (Math.min(totalScore, 1.1) * 0.58), 0.18, 0.82);
  const baselineCoverage = baselineStats.filter((stat) => stat.sampleCount > 0).length;
  const contributorConfidenceAdjustment =
    neighborCorroboration.confidenceAdjustment
    + neighborCoverage.confidenceAdjustment
    + (confidenceContributor?.confidenceAdjustment ?? 0);
  const confidence = clamp(
    roundTo(
      confidenceBase
      + Math.min(0.08, baselineCoverage * 0.02)
      + contributorConfidenceAdjustment,
      2,
    ),
    0,
    1,
  );

  const reasons = [
    ...thresholdSignals.map((signal) => signal.reason).filter((reason): reason is string => Boolean(reason)),
    ...anomalySignals.map((signal) => signal.reason).filter((reason): reason is string => Boolean(reason)),
    ...crwStressSignals.map((signal) => signal.reason).filter((reason): reason is string => Boolean(reason)),
    ...[neighborCorroboration.reason].filter((reason): reason is string => Boolean(reason)),
    ...[neighborCoverage.reason].filter((reason): reason is string => Boolean(reason)),
    ...[sstTrendSignal.reason, windTrendSignal.reason].filter((reason): reason is string => Boolean(reason)),
    ...[confidenceContributor?.detail].filter((reason): reason is string => Boolean(reason)),
  ];

  const neighborContributor: SignalFusionContributor | null = neighborCorroboration.reason
    ? {
      kind: "neighbor_corroboration",
      field: null,
      title: "Neighbor corroboration",
      detail: neighborCorroboration.reason,
      score: neighborCorroboration.scoreAdjustment,
      confidenceAdjustment: neighborCorroboration.confidenceAdjustment,
    }
    : null;
  const neighborCoverageContributor: SignalFusionContributor | null = neighborCoverage.reason
    ? {
      kind: "confidence",
      field: null,
      title: "Low regional neighbor coverage",
      detail: neighborCoverage.reason,
      score: 0,
      confidenceAdjustment: neighborCoverage.confidenceAdjustment,
    }
    : null;

  const contributors: SignalFusionContributor[] = [
    ...thresholdSignals
      .filter((signal) => signal.breached && signal.title && signal.detail)
      .map((signal) => ({
        kind: "threshold" as const,
        field: signal.field,
        title: signal.title!,
        detail: signal.detail!,
        score: signal.score,
        confidenceAdjustment: 0,
      })),
    ...anomalySignals
      .filter((signal) => signal.triggered && signal.title && signal.detail)
      .map((signal) => ({
        kind: "baseline_anomaly" as const,
        field: signal.field,
        title: signal.title!,
        detail: signal.detail!,
        score: signal.score,
        confidenceAdjustment: 0,
      })),
    ...crwStressSignals
      .filter((signal) => signal.triggered && signal.title && signal.detail)
      .map((signal) => ({
        kind: "crw_context" as const,
        field: signal.field,
        title: signal.title!,
        detail: signal.detail!,
        score: signal.score,
        confidenceAdjustment: 0,
      })),
    ...[sstTrendSignal, windTrendSignal]
      .filter((signal) => signal.triggered && signal.title && signal.detail)
      .map((signal) => ({
        kind: "trend" as const,
        field: signal.field,
        title: signal.title!,
        detail: signal.detail!,
        score: signal.score,
        confidenceAdjustment: 0,
      })),
    ...[neighborContributor].filter((contributor): contributor is SignalFusionContributor => contributor !== null),
    ...[neighborCoverageContributor].filter((contributor): contributor is SignalFusionContributor => contributor !== null),
    ...[confidenceContributor].filter((contributor): contributor is SignalFusionContributor => contributor !== null),
  ];

  return {
    riskLevel: determineRiskLevel(totalScore),
    confidence,
    reasons,
    contributors,
    neighborInfluence: neighborCorroboration.influence,
  };
}
