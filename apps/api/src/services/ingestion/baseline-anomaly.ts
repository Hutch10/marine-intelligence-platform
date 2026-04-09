import type { NdbcMappedObservation } from "../../connectors/ndbc/map";
import type { OperationalAlertAction, OperationalAlertRuleType } from "../operational-alerts";

export type BaselineSignalField =
  | "seaSurfaceTempC"
  | "waveHeightM"
  | "windSpeedMps"
  | "pressureHpa"
  | "crwSstAnomalyC"
  | "crwHotspotC"
  | "crwDhw";

type ObservationBaselineField =
  | "seaSurfaceTempC"
  | "waveHeightM"
  | "windSpeedMps"
  | "pressureHpa";

export interface BaselineObservationInput extends Pick<
  NdbcMappedObservation,
  "stationId" | "observedAt" | "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa" | "sourceTimestamp"
> {
  source?: string | null;
}

export interface CrwBaselineInput {
  stationId: string | null;
  regionKey: string;
  observedAt: number;
  sourceTimestamp: string;
  sstAnomalyC: number | null;
  hotSpotC: number | null;
  dhw: number | null;
  stressLevel: string | null;
}

export interface BaselineSignalStats {
  field: BaselineSignalField;
  value: number | null;
  mean: number | null;
  stdDev: number | null;
  zScore: number | null;
  sampleCount: number;
  usedSeasonalBucket: boolean;
  neighborMean: number | null;
  neighborDelta: number | null;
  sampleCountReason: string | null;
  sourceProvenance: "ndbc" | "crw_proxy" | "crw";
}

export interface BaselineAnomalyOptions {
  windowDays?: number;
  zScoreThreshold?: number;
  minSamples?: number;
  neighborObservations?: BaselineObservationInput[];
  crwCurrent?: CrwBaselineInput | null;
  crwHistory?: CrwBaselineInput[];
  allowCrwSstProxy?: boolean;
}

const DEFAULT_WINDOW_DAYS = 45;
const DEFAULT_Z_SCORE_THRESHOLD = 2;
const DEFAULT_MIN_SAMPLES = 8;
export const GLOBAL_Z_SCORE_CLAMP = 5;
export const GLOBAL_STDDEV_FLOOR = 0.5;

const FIELD_RULE_TYPES: Record<BaselineSignalField, OperationalAlertRuleType> = {
  seaSurfaceTempC: "high_sea_temperature",
  waveHeightM: "high_wave_height",
  windSpeedMps: "high_wind_speed",
  pressureHpa: "low_pressure_system",
  crwSstAnomalyC: "high_sea_temperature",
  crwHotspotC: "high_sea_temperature",
  crwDhw: "high_sea_temperature",
};

function valuesForField(
  history: BaselineObservationInput[],
  field: ObservationBaselineField,
): number[] {
  return history
    .map((item) => item[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function computeMean(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function computeStdDev(values: number[], mean: number | null): number | null {
  if (values.length < 2 || mean === null) {
    return null;
  }

  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function isCrwField(field: BaselineSignalField): field is "crwSstAnomalyC" | "crwHotspotC" | "crwDhw" {
  return field === "crwSstAnomalyC" || field === "crwHotspotC" || field === "crwDhw";
}

function clampZScore(zScore: number | null): number | null {
  if (zScore === null || !Number.isFinite(zScore)) {
    return null;
  }

  return clamp(zScore, -GLOBAL_Z_SCORE_CLAMP, GLOBAL_Z_SCORE_CLAMP);
}

function normalizeStdDev(
  _field: ObservationBaselineField | "sstAnomalyC" | "hotSpotC" | "dhw",
  stdDev: number | null,
): number | null {
  if (stdDev === null) {
    return null;
  }

  return Math.max(stdDev, GLOBAL_STDDEV_FLOOR);
}

function normalizeSignalStdDev(
  field: BaselineSignalField,
  stdDev: number | null,
): number | null {
  if (stdDev === null) {
    return null;
  }

  if (field === "crwDhw") {
    return Math.max(stdDev, GLOBAL_STDDEV_FLOOR);
  }

  return Math.max(stdDev, GLOBAL_STDDEV_FLOOR);
}

function normalizeSignalZScore(
  field: BaselineSignalField,
  value: number | null,
  mean: number | null,
  zScore: number | null,
): number | null {
  if (zScore === null) {
    return null;
  }

  if (field === "crwDhw" && mean !== null && typeof value === "number" && Number.isFinite(value) && value <= mean) {
    return 0;
  }

  if (field === "crwDhw") {
    return Math.max(0, clampZScore(zScore) ?? 0);
  }

  return clampZScore(zScore);
}

export function normalizeBaselineSignalStat(stat: BaselineSignalStats): BaselineSignalStats {
  const normalizedStdDev = normalizeSignalStdDev(stat.field, stat.stdDev);
  const normalizedZScore = normalizeSignalZScore(stat.field, stat.value, stat.mean, stat.zScore);

  return {
    ...stat,
    stdDev: normalizedStdDev,
    zScore: normalizedZScore,
  };
}

export function normalizeBaselineSignalStats(stats: BaselineSignalStats[]): BaselineSignalStats[] {
  return stats.map(normalizeBaselineSignalStat);
}

function computeZScore(
  currentValue: number | null,
  mean: number | null,
  stdDev: number | null,
): number | null {
  if (typeof currentValue !== "number" || !Number.isFinite(currentValue) || mean === null || stdDev === null || stdDev <= 0) {
    return null;
  }

  return clampZScore((currentValue - mean) / stdDev);
}

function computeCrwZScore(
  field: "sstAnomalyC" | "hotSpotC" | "dhw",
  currentValue: number | null,
  mean: number | null,
  stdDev: number | null,
): number | null {
  if (typeof currentValue !== "number" || !Number.isFinite(currentValue) || mean === null || stdDev === null || stdDev <= 0) {
    return null;
  }

  if (field === "dhw") {
    const delta = currentValue - mean;

    if (delta <= 1e-9) {
      return 0;
    }

    return clampZScore(Math.max(0, delta / stdDev));
  }

  return computeZScore(currentValue, mean, stdDev);
}

function buildFilteredHistory(
  current: BaselineObservationInput,
  history: BaselineObservationInput[],
  options: Required<Pick<BaselineAnomalyOptions, "windowDays" | "minSamples">>,
): {
  rollingHistory: BaselineObservationInput[];
  seasonalHistory: BaselineObservationInput[];
} {
  const windowStart = current.observedAt - options.windowDays * 24 * 60 * 60 * 1000;
  const month = new Date(current.observedAt).getUTCMonth();

  const rollingHistory = history.filter(
    (item) => item.observedAt < current.observedAt && item.observedAt >= windowStart,
  );
  const allPriorHistory = history.filter(
    (item) => item.observedAt < current.observedAt,
  );
  const seasonalHistory = allPriorHistory.filter(
    (item) => new Date(item.observedAt).getUTCMonth() === month,
  );

  return {
    rollingHistory,
    seasonalHistory: seasonalHistory.length >= options.minSamples ? seasonalHistory : rollingHistory,
  };
}

function valuesForCrwField(
  history: CrwBaselineInput[],
  field: "sstAnomalyC" | "hotSpotC" | "dhw",
): number[] {
  return history
    .map((item) => item[field])
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function buildFilteredCrwHistory(
  current: CrwBaselineInput,
  history: CrwBaselineInput[],
  options: Required<Pick<BaselineAnomalyOptions, "windowDays" | "minSamples">>,
): {
  rollingHistory: CrwBaselineInput[];
  seasonalHistory: CrwBaselineInput[];
} {
  const windowStart = current.observedAt - options.windowDays * 24 * 60 * 60 * 1000;
  const month = new Date(current.observedAt).getUTCMonth();

  const rollingHistory = history.filter(
    (item) => item.observedAt < current.observedAt && item.observedAt >= windowStart,
  );
  const allPriorHistory = history.filter(
    (item) => item.observedAt < current.observedAt,
  );
  const seasonalHistory = allPriorHistory.filter(
    (item) => new Date(item.observedAt).getUTCMonth() === month,
  );

  return {
    rollingHistory,
    seasonalHistory: seasonalHistory.length >= options.minSamples ? seasonalHistory : rollingHistory,
  };
}

function describeSampleCountReason(
  current: BaselineObservationInput,
  rollingHistory: BaselineObservationInput[],
  historyToUse: BaselineObservationInput[],
  field: ObservationBaselineField,
  options: Required<Pick<BaselineAnomalyOptions, "windowDays" | "minSamples">>,
  usedSeasonalBucket: boolean,
): string | null {
  if (typeof current[field] !== "number" || !Number.isFinite(current[field])) {
    return `Current ${field} is null, so no baseline comparison can be computed.`;
  }

  const rollingCount = rollingHistory.length;
  const rollingFieldSamples = valuesForField(rollingHistory, field).length;
  const bucketFieldSamples = valuesForField(historyToUse, field).length;

  if (rollingCount === 0) {
    return `No prior observations were found within the last ${options.windowDays} days.`;
  }

  if (rollingFieldSamples === 0 && !usedSeasonalBucket) {
    return `${rollingCount} prior observations were found in the ${options.windowDays}-day window, but all ${field} values were null or non-numeric.`;
  }

  if (usedSeasonalBucket && bucketFieldSamples === 0) {
    return `Seasonal fallback was used because the rolling window had fewer than ${options.minSamples} observations, but no prior same-month ${field} values were usable.`;
  }

  if (bucketFieldSamples === 0) {
    return `No usable historical ${field} values were available for baseline scoring.`;
  }

  return null;
}

function describeCrwSampleCountReason(
  current: CrwBaselineInput,
  rollingHistory: CrwBaselineInput[],
  historyToUse: CrwBaselineInput[],
  field: "sstAnomalyC" | "hotSpotC" | "dhw",
  options: Required<Pick<BaselineAnomalyOptions, "windowDays" | "minSamples">>,
  usedSeasonalBucket: boolean,
): string | null {
  if (typeof current[field] !== "number" || !Number.isFinite(current[field])) {
    return `Current CRW ${field} is null, so no CRW baseline comparison can be computed.`;
  }

  const rollingCount = rollingHistory.length;
  const rollingFieldSamples = valuesForCrwField(rollingHistory, field).length;
  const bucketFieldSamples = valuesForCrwField(historyToUse, field).length;

  if (rollingCount === 0) {
    return `No prior CRW observations were found within the last ${options.windowDays} days.`;
  }

  if (rollingFieldSamples === 0 && !usedSeasonalBucket) {
    return `${rollingCount} prior CRW observations were found in the ${options.windowDays}-day window, but all ${field} values were null or non-numeric.`;
  }

  if (usedSeasonalBucket && bucketFieldSamples === 0) {
    return `Seasonal CRW fallback was used because the rolling window had fewer than ${options.minSamples} observations, but no prior same-month ${field} values were usable.`;
  }

  if (bucketFieldSamples === 0) {
    return `No usable historical CRW ${field} values were available for baseline scoring.`;
  }

  return null;
}

export function scoreBaselineAnomalies(
  current: BaselineObservationInput,
  history: BaselineObservationInput[],
  options: BaselineAnomalyOptions = {},
): BaselineSignalStats[] {
  const normalized = {
    windowDays: options.windowDays ?? DEFAULT_WINDOW_DAYS,
    minSamples: options.minSamples ?? DEFAULT_MIN_SAMPLES,
  };
  const { rollingHistory, seasonalHistory } = buildFilteredHistory(current, history, normalized);
  const historyToUse = seasonalHistory;
  const usedSeasonalBucket = seasonalHistory.length >= normalized.minSamples;
  const stats = (["seaSurfaceTempC", "waveHeightM", "windSpeedMps", "pressureHpa"] as const).map((field) => {
    const currentValue = current[field];
    const samples = valuesForField(historyToUse, field);
    const mean = computeMean(samples);
    const stdDev = normalizeStdDev(field, computeStdDev(samples, mean));
    const zScore = computeZScore(currentValue, mean, stdDev);
    const neighborValues = valuesForField(options.neighborObservations ?? [], field);
    const neighborMean = computeMean(neighborValues);

    return {
      field,
      value: currentValue,
      mean,
      stdDev,
      zScore,
      sampleCount: samples.length,
      usedSeasonalBucket,
      neighborMean,
      neighborDelta:
        typeof currentValue === "number" && neighborMean !== null
          ? currentValue - neighborMean
          : null,
      sampleCountReason: samples.length === 0
        ? describeSampleCountReason(current, rollingHistory, historyToUse, field, normalized, usedSeasonalBucket)
        : null,
      sourceProvenance: "ndbc",
    } satisfies BaselineSignalStats;
  });

  if (!options.crwCurrent) {
    return normalizeBaselineSignalStats(stats);
  }

  const crwCurrent = options.crwCurrent;
  const crwHistory = options.crwHistory ?? [];
  const filteredCrwHistory = buildFilteredCrwHistory(crwCurrent, crwHistory, normalized);
  const crwHistoryToUse = filteredCrwHistory.seasonalHistory;
  const usedCrwSeasonalBucket = filteredCrwHistory.seasonalHistory.length >= normalized.minSamples;
  const crwFieldMap: Array<{
    publicField: BaselineSignalField;
    crwField: "sstAnomalyC" | "hotSpotC" | "dhw";
  }> = [
    { publicField: "crwSstAnomalyC", crwField: "sstAnomalyC" },
    { publicField: "crwHotspotC", crwField: "hotSpotC" },
    { publicField: "crwDhw", crwField: "dhw" },
  ];

  const crwStats = crwFieldMap.map(({ publicField, crwField }) => {
    const currentValue = crwCurrent[crwField];
    const samples = valuesForCrwField(crwHistoryToUse, crwField);
    const mean = computeMean(samples);
    const stdDev = normalizeStdDev(crwField, computeStdDev(samples, mean));
    const zScore = computeCrwZScore(crwField, currentValue, mean, stdDev);

    return {
      field: publicField,
      value: currentValue,
      mean,
      stdDev,
      zScore,
      sampleCount: samples.length,
      usedSeasonalBucket: usedCrwSeasonalBucket,
      neighborMean: null,
      neighborDelta: null,
      sampleCountReason: samples.length === 0
        ? describeCrwSampleCountReason(
          crwCurrent,
          filteredCrwHistory.rollingHistory,
          crwHistoryToUse,
          crwField,
          normalized,
          usedCrwSeasonalBucket,
        )
        : null,
      sourceProvenance: "crw",
    } satisfies BaselineSignalStats;
  });

  return normalizeBaselineSignalStats([...stats, ...crwStats]);
}

export function buildBaselineAnomalyAlerts(
  current: BaselineObservationInput,
  history: BaselineObservationInput[],
  options: BaselineAnomalyOptions = {},
): OperationalAlertAction[] {
  const threshold = options.zScoreThreshold ?? DEFAULT_Z_SCORE_THRESHOLD;
  const source = `noaa_ndbc:${current.stationId}`;

  return scoreBaselineAnomalies(current, history, options)
    .filter((metric) => {
      if (metric.zScore === null || Math.abs(metric.zScore) < threshold) {
        return false;
      }

      if (isCrwField(metric.field) && metric.zScore <= 0) {
        return false;
      }

      return true;
    })
    .map((metric) => ({
      type: "create" as const,
      source,
      stationId: current.stationId,
      ruleType: FIELD_RULE_TYPES[metric.field],
      severity: "warning" as const,
      title: `Baseline anomaly at ${current.stationId}: ${metric.field} z=${metric.zScore!.toFixed(2)}`,
      detail: [
        `Observed ${metric.field} deviated from the ${options.windowDays ?? DEFAULT_WINDOW_DAYS}-day baseline.`,
        `z-score ${metric.zScore!.toFixed(2)} against mean ${metric.mean?.toFixed(2) ?? "n/a"}.`,
        metric.neighborDelta !== null
          ? `Neighbor delta ${metric.neighborDelta.toFixed(2)}.`
          : null,
        `Observed at ${current.sourceTimestamp}.`,
      ].filter(Boolean).join(" "),
    }));
}
