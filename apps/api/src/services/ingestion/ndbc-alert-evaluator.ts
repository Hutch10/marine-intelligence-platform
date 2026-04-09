/**
 * NDBC Anomaly Alert Evaluator
 *
 * Pure, deterministic function that evaluates a single NdbcMappedObservation
 * against threshold rules and returns OperationalAlertActions for any exceeded
 * thresholds. No DB access, no async, no side effects.
 *
 * Threshold rules are resolved per-station from the station risk threshold
 * repository. System defaults remain:
 *  - SST > 30 °C
 *  - Wave height > 5 m
 *  - Wind speed > 20 m/s
 *  - Pressure < 960 hPa
 */

import type { NdbcMappedObservation } from "../../connectors/ndbc/map";
import type {
  OperationalAlertAction,
} from "../operational-alerts";
import {
  collectTriggeredStationThresholds,
  resolveStationRiskThresholds,
  type ResolvedStationRiskThreshold,
} from "../../repositories/station-risk-thresholds";
import {
  buildBaselineAnomalyAlerts,
  type BaselineObservationInput,
  type BaselineAnomalyOptions,
  type BaselineSignalStats,
  scoreBaselineAnomalies,
} from "./baseline-anomaly";

interface HybridThresholdEvaluation {
  adjustedThreshold: ResolvedStationRiskThreshold;
  baselineStat: BaselineSignalStats | null;
  adjustmentReason: string | null;
}

const DEFAULT_HYBRID_Z_SCORE_THRESHOLD = 2;

function formatThresholdValue(metric: ResolvedStationRiskThreshold["metric"], value: number): string {
  if (metric === "pressureHpa") {
    return `${value.toFixed(0)} hPa`;
  }

  if (metric === "seaSurfaceTempC") {
    return `${value.toFixed(1)} °C`;
  }

  if (metric === "waveHeightM") {
    return `${value.toFixed(1)} m`;
  }

  return `${value.toFixed(1)} m/s`;
}

function buildThresholdAlertTitle(
  stationId: string,
  threshold: ResolvedStationRiskThreshold,
  observedValue: number,
): string {
  switch (threshold.ruleType) {
    case "high_sea_temperature":
      return `High sea surface temperature at ${stationId}: ${observedValue.toFixed(1)} °C`;
    case "high_wave_height":
      return `High wave height at ${stationId}: ${observedValue.toFixed(1)} m`;
    case "high_wind_speed":
      return `High wind speed at ${stationId}: ${observedValue.toFixed(1)} m/s`;
    case "low_pressure_system":
      return `Low pressure system at ${stationId}: ${observedValue.toFixed(0)} hPa`;
    default:
      return `Threshold exceeded at ${stationId}`;
  }
}

function buildThresholdAlertDetail(
  stationId: string,
  threshold: ResolvedStationRiskThreshold,
  observedValue: number,
  timestamp: string,
  baselineStat?: BaselineSignalStats | null,
  adjustmentReason?: string | null,
): string {
  const observed = formatThresholdValue(threshold.metric, observedValue);
  const thresholdValue = formatThresholdValue(threshold.metric, threshold.thresholdValue);
  const comparator = threshold.comparator === "above" ? ">" : "<";
  const hybridSuffix = adjustmentReason && baselineStat != null && baselineStat.zScore !== null
    ? ` Baseline-adjusted threshold applied from a ${baselineStat.usedSeasonalBucket ? "seasonal" : "rolling"} baseline (z-score ${baselineStat.zScore.toFixed(2)}; ${adjustmentReason}).`
    : "";

  switch (threshold.ruleType) {
    case "high_sea_temperature":
      return `Station ${stationId} reported SST of ${observed} (threshold: ${comparator} ${thresholdValue}) at ${timestamp}.${hybridSuffix}`;
    case "high_wave_height":
      return `Station ${stationId} reported wave height of ${observed} (threshold: ${comparator} ${thresholdValue}) at ${timestamp}.${hybridSuffix}`;
    case "high_wind_speed":
      return `Station ${stationId} reported wind speed of ${observed} (threshold: ${comparator} ${thresholdValue}) at ${timestamp}.${hybridSuffix}`;
    case "low_pressure_system":
      return `Station ${stationId} reported pressure of ${observed} (threshold: ${comparator} ${thresholdValue}) at ${timestamp}.${hybridSuffix}`;
    default:
      return `Station ${stationId} exceeded configured threshold ${comparator} ${thresholdValue} at ${timestamp}.${hybridSuffix}`;
  }
}

function buildBaselineStatMap(stats: BaselineSignalStats[]): Partial<Record<ResolvedStationRiskThreshold["metric"], BaselineSignalStats>> {
  return Object.fromEntries(
    stats.map((stat) => [stat.field, stat]),
  ) as Partial<Record<ResolvedStationRiskThreshold["metric"], BaselineSignalStats>>;
}

function evaluateHybridThreshold(
  threshold: ResolvedStationRiskThreshold,
  baselineStat: BaselineSignalStats | null,
  zScoreThreshold: number,
): HybridThresholdEvaluation {
  if (
    !baselineStat
    || baselineStat.zScore === null
    || baselineStat.mean === null
    || baselineStat.stdDev === null
    || baselineStat.stdDev <= 0
  ) {
    return {
      adjustedThreshold: threshold,
      baselineStat,
      adjustmentReason: null,
    };
  }

  if (threshold.comparator === "above") {
    if (baselineStat.zScore < zScoreThreshold) {
      return {
        adjustedThreshold: threshold,
        baselineStat,
        adjustmentReason: null,
      };
    }

    const baselineThreshold = baselineStat.mean + (zScoreThreshold * baselineStat.stdDev);
    const adjustedThresholdValue = Math.min(threshold.thresholdValue, baselineThreshold);

    if (!(adjustedThresholdValue < threshold.thresholdValue)) {
      return {
        adjustedThreshold: threshold,
        baselineStat,
        adjustmentReason: null,
      };
    }

    return {
      adjustedThreshold: {
        ...threshold,
        thresholdValue: adjustedThresholdValue,
      },
      baselineStat,
      adjustmentReason: `baseline mean ${formatThresholdValue(threshold.metric, baselineStat.mean)} + ${zScoreThreshold.toFixed(1)}σ`,
    };
  }

  if (baselineStat.zScore > -zScoreThreshold) {
    return {
      adjustedThreshold: threshold,
      baselineStat,
      adjustmentReason: null,
    };
  }

  const baselineThreshold = baselineStat.mean - (zScoreThreshold * baselineStat.stdDev);
  const adjustedThresholdValue = Math.max(threshold.thresholdValue, baselineThreshold);

  if (!(adjustedThresholdValue > threshold.thresholdValue)) {
    return {
      adjustedThreshold: threshold,
      baselineStat,
      adjustmentReason: null,
    };
  }

  return {
    adjustedThreshold: {
      ...threshold,
      thresholdValue: adjustedThresholdValue,
    },
    baselineStat,
    adjustmentReason: `baseline mean ${formatThresholdValue(threshold.metric, baselineStat.mean)} - ${zScoreThreshold.toFixed(1)}σ`,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Evaluate a mapped NDBC observation against all threshold rules.
 *
 * Returns an OperationalAlertAction for every exceeded threshold.
 * Returns an empty array when all values are within bounds or null.
 *
 * The alert source is formatted as "noaa_ndbc:{stationId}" so that
 * operational alerts can be grouped and resolved per-station.
 */
export function evaluateNdbcAnomalies(
  observation: NdbcMappedObservation,
  options: {
    baselineHistory?: BaselineObservationInput[];
    baseline?: BaselineAnomalyOptions;
    thresholds?: ResolvedStationRiskThreshold[];
  } = {},
): OperationalAlertAction[] {
  const actions: OperationalAlertAction[] = [];
  const source = `noaa_ndbc:${observation.stationId}`;
  const thresholds = options.thresholds ?? resolveStationRiskThresholds(observation.stationId);
  const baselineStats = options.baselineHistory?.length
    ? scoreBaselineAnomalies(observation, options.baselineHistory, options.baseline)
    : [];
  const baselineStatMap = buildBaselineStatMap(baselineStats);
  const hybridZScoreThreshold = options.baseline?.zScoreThreshold ?? DEFAULT_HYBRID_Z_SCORE_THRESHOLD;
  const thresholdEvaluations = thresholds.map((threshold) => evaluateHybridThreshold(
    threshold,
    baselineStatMap[threshold.metric] ?? null,
    hybridZScoreThreshold,
  ));
  const triggeredThresholds = collectTriggeredStationThresholds(
    observation,
    thresholdEvaluations.map((evaluation) => evaluation.adjustedThreshold),
  );

  for (const threshold of triggeredThresholds) {
    const value = observation[threshold.metric];
    const thresholdEvaluation = thresholdEvaluations.find((evaluation) => evaluation.adjustedThreshold.metric === threshold.metric);

    if (value === null) {
      continue;
    }

    actions.push({
      type: "create",
      source,
      stationId: observation.stationId,
      ruleType: threshold.ruleType,
      severity: threshold.severity,
      title: buildThresholdAlertTitle(observation.stationId, threshold, value),
      detail: buildThresholdAlertDetail(
        observation.stationId,
        threshold,
        value,
        observation.sourceTimestamp,
        thresholdEvaluation?.baselineStat ?? null,
        thresholdEvaluation?.adjustmentReason ?? null,
      ),
    });
  }

  const baselineActions = options.baselineHistory?.length
    ? buildBaselineAnomalyAlerts(observation, options.baselineHistory, options.baseline)
    : [];

  for (const action of baselineActions) {
    if (actions.some((existing) => existing.ruleType === action.ruleType)) {
      continue;
    }

    actions.push({ ...action, source });
  }

  return actions;
}
