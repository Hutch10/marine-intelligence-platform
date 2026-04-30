
import {
  AnomalyListResponse,
  DegradedDataReason,
  PublicAnomalyItem,
  IntegrityStatus,
  RiskAppliedThreshold,
  RiskEvaluateRequest,
  RiskEvaluateResponse,
  RiskScoreResponse,
  RiskSignalSummary,
  RiskTriggeredRule,
  SignalDetection,
  SystemIntegrityStatus,
} from "@marine/shared";
import { SovereignTrustService } from "../services/sovereign-trust";
import type { NdbcMappedObservation } from "../connectors/ndbc/map";
import {
  resolveDatabasePath,
  hasDatabasePath,
} from "../db/client";
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
import { buildRiskSignal } from "../services/signal-fusion";
import {
  readLatestObservationSnapshotsFromDb,
  readRecentObservationHistoryFromDb,
  type ObservationHistoryItem,
} from "../repositories/observations";
import {
  readRecentStationMetricHistoryFromDb,
  type StationMetricHistoryItem,
} from "../repositories/station-metrics";
import {
  readRecentCrwRiskHistoryFromDb,
  type CrwRiskHistoryItem,
} from "../repositories/reef-stress";
import { listSignals } from "../repositories/signals";
import {
  collectTriggeredStationThresholds,
  resolveStationRiskThresholds,
  type ResolvedStationRiskThreshold,
} from "../repositories/station-risk-thresholds";
import {
  scoreBaselineAnomalies,
  GLOBAL_Z_SCORE_CLAMP,
  type BaselineObservationInput,
  type BaselineSignalStats,
  type CrwBaselineInput,
} from "../services/ingestion/baseline-anomaly";
import {
  fuseStationSignals,
  type SignalFusionResult,
} from "../services/signal-fusion";
import { listNeighborStationIds } from "../services/neighbor-stations";
import { toFailClosedPublicRiskLevel } from "../services/contradiction-policy";
import type { RouteDefinition } from "../types";

const DEFAULT_WINDOW_DAYS = 45;
const BASELINE_HISTORY_LOOKBACK_DAYS = 365;
const DEFAULT_ANOMALY_LOOKBACK_DAYS = 30;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MAX_HISTORY_POINTS = 500;
const MIN_SUFFICIENT_SAMPLE_SIZE = 7;
const HIGH_QUALITY_SAMPLE_SIZE = 12;
const LOW_QUALITY_DISPLAY_Z_CAP = 2.99;
const MEDIUM_QUALITY_DISPLAY_Z_CAP = 6;

const RULE_TYPE_TO_FIELD: Record<string, RiskSignalSummary["field"]> = {
  high_sea_temperature: "seaSurfaceTempC",
  high_wave_height: "waveHeightM",
  high_wind_speed: "windSpeedMps",
  low_pressure_system: "pressureHpa",
};

const FIELD_LABELS: Record<RiskSignalSummary["field"], string> = {
  seaSurfaceTempC: "surface warming",
  waveHeightM: "higher seas",
  windSpeedMps: "stronger winds",
  pressureHpa: "falling pressure",
  salinityPsu: "salinity stress",
  dissolvedOxygenMgL: "low dissolved oxygen",
  crwSstAnomalyC: "CRW-derived warming",
  crwHotspotC: "CRW hotspot",
  crwDhw: "CRW DHW",
};

interface RiskScoreQuery {
  stationId?: string;
  window?: number | string;
}

interface AnomaliesQuery {
  stationId?: string;
  since?: string;
  limit?: number | string;
}

interface ReadObservationHistoryResultSuccess {
  ok: true;
  current: NdbcMappedObservation;
  history: BaselineObservationInput[];
  crwContext: CrwBaselineContext;
  neighborContext: NeighborStationContext;
  erddapContext: ErddapMetricContext;
  sourceAgreement: SourceAgreementAssessment;
}

interface ReadObservationHistoryResultFailure {
  ok: false;
  status: 404 | 503;
  message: string;
  fallbackReason?: DegradedDataReason;
}

interface RiskTrustAssessment {
  confidenceScore: number;
  baselineQuality: RiskScoreResponse["baselineQuality"];
  sampleSize: number;
  sampleSufficiency: boolean;
  warningMessages: string[];
}

interface RiskAnalysisResult {
  appliedThresholds: RiskAppliedThreshold[];
  confidenceScore: number;
  baselineQuality: RiskScoreResponse["baselineQuality"];
  fusion: SignalFusionResult;
  sampleSize: number;
  sampleSufficiency: boolean;
  warningMessages: string[];
  operatorSummary: string;
  overallRisk: RiskScoreResponse["overallRisk"] | "unknown";
  signals: RiskSignalSummary[];
  triggeredRules: RiskTriggeredRule[];
  sovereignVerification?: {
    status: IntegrityStatus;
    claimId: string;
    contradictions: string[];
    verifiedAt: string;
  };
}

interface CrwBaselineContext {
  current: CrwBaselineInput | null;
  history: CrwBaselineInput[];
}

interface NeighborStationContext {
  neighborStationIds: string[];
  neighborObservations: BaselineObservationInput[];
}

interface ErddapMetricContext {
  salinity: StationMetricHistoryItem[];
  dissolvedOxygen: StationMetricHistoryItem[];
}

interface SourceAgreementAssessment {
  confidenceAdjustment: number;
  detail: string | null;
}

interface ErddapSignalImpact {
  confidenceAdjustment: number;
  riskLevelBump: 0 | 1;
  warnings: string[];
}

const PUBLIC_BASELINE_FIELDS: RiskSignalSummary["field"][] = [
  "seaSurfaceTempC",
  "waveHeightM",
  "windSpeedMps",
  "pressureHpa",
  "crwSstAnomalyC",
];

function mapDbFallbackReason(fallbackReason: string | undefined): DegradedDataReason {
  return fallbackReason === "db_path_missing" ? "db_path_missing" : "db_unavailable";
}

function degradedRiskWarning(reason: DegradedDataReason): string {
  return reason === "db_path_missing"
    ? "Field-truth database path is missing; live truth-bearing risk data is unavailable in this deployment."
    : "Field-truth database is unavailable; live truth-bearing risk data cannot be verified in this deployment.";
}

function buildDegradedRiskScoreResponse(
  stationId: string,
  window: number,
  reason: DegradedDataReason,
): { status: 200; json: RiskScoreResponse } {
  return {
    status: 200,
    json: {
      stationId,
      window,
      triggeredRules: [],
      signals: [],
      overallRisk: "unknown",
      computedAt: new Date().toISOString(),
      appliedThresholds: [],
      confidenceScore: 0,
      baselineQuality: "low",
      sampleSize: 0,
      sampleSufficiency: false,
      warningMessages: [degradedRiskWarning(reason)],
      operatorSummary: "Truth-bearing risk assessment is blocked until a production backing database is configured.",
      confidenceClassification: "UNTRUSTED",
      conflictTaxonomy: "none",
      systemIntegrity: SystemIntegrityStatus.TRUST_BLOCKED,
      integritySummary: {
        verifiedCount: 0,
        unverifiedCount: 0,
        rejectedCount: 0,
        exclusionReasonCounts: {},
      },
      coverage: {
        acceptedCount: 0,
        rejectedCount: 0,
        conflictCount: 0,
        missingCoverageSummary: degradedRiskWarning(reason),
        sourcesConsidered: [],
        stationsConsidered: [stationId],
      },
      degraded: true,
      reason,
      trustStatus: SystemIntegrityStatus.TRUST_BLOCKED,
    },
  };
}

function buildDegradedRiskEvaluateResponse(
  stationId: string,
  reason: DegradedDataReason,
): { status: 200; json: RiskEvaluateResponse } {
  return {
    status: 200,
    json: {
      stationId,
      triggeredRules: [],
      baselineStats: [],
      riskLevel: "unknown",
      evaluatedAt: new Date().toISOString(),
      appliedThresholds: [],
      confidenceScore: 0,
      baselineQuality: "low",
      sampleSize: 0,
      sampleSufficiency: false,
      warningMessages: [degradedRiskWarning(reason)],
      operatorSummary: "Truth-bearing risk evaluation is blocked until a production backing database is configured.",
      degraded: true,
      reason,
      trustStatus: SystemIntegrityStatus.TRUST_BLOCKED,
    },
  };
}

function buildDegradedAnomaliesResponse(
  stationId: string | null,
  since: string,
  limit: number,
  defaultsApplied: string[],
  reason: DegradedDataReason,
): { status: 200; json: AnomalyListResponse } {
  return {
    status: 200,
    json: {
      anomalies: [],
      total: 0,
      stationId,
      since,
      appliedFilters: {
        stationId,
        since,
        limit,
      },
      pagination: {
        limit,
        returned: 0,
        total: 0,
        hasMore: false,
        maxLimit: MAX_LIMIT,
        defaultsApplied,
      },
      degraded: true,
      reason,
      trustStatus: SystemIntegrityStatus.TRUST_BLOCKED,
    },
  };
}

function normalizeText(value: string | undefined | null): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePositiveInteger(
  value: number | string | undefined,
  fallback: number,
  max: number,
): number {
  if (value === undefined) {
    return fallback;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(Math.max(1, Math.floor(parsed)), max);
}

function normalizeOptionalMetric(value: unknown): number | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function parseIsoToEpochMs(value: string | undefined | null): number | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toBaselineInput(item: ObservationHistoryItem | NdbcMappedObservation): BaselineObservationInput {
  return {
    stationId: item.stationId,
    observedAt: item.observedAt,
    seaSurfaceTempC: item.seaSurfaceTempC,
    waveHeightM: item.waveHeightM,
    windSpeedMps: item.windSpeedMps,
    pressureHpa: item.pressureHpa,
    source: item.source,
    sourceTimestamp: item.sourceTimestamp,
  };
}

function toCrwBaselineInput(item: CrwRiskHistoryItem): CrwBaselineInput {
  return {
    stationId: item.stationId,
    regionKey: item.regionKey,
    observedAt: item.observedAt,
    sourceTimestamp: item.sourceTimestamp,
    sstAnomalyC: item.sstAnomalyC,
    hotSpotC: item.hotSpotC,
    dhw: item.dhw,
    stressLevel: item.stressLevel,
  };
}

function roundNumber(value: number | null, digits = 2): number | null {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: number[], mean: number): number {
  if (values.length <= 1) {
    return 0;
  }

  const variance = values
    .map((value) => (value - mean) ** 2)
    .reduce((sum, value) => sum + value, 0) / values.length;

  return Math.sqrt(variance);
}

function normalizeRiskFieldSourceLabel(source: string | null | undefined): string {
  if (!source) {
    return "unknown";
  }

  if (source === "noaa_ndbc") {
    return "NDBC";
  }

  if (source === "ioos_erddap") {
    return "ERDDAP";
  }

  return source;
}

function logRiskDiagnostic(message: string) {
  console.log(`[risk] ${message}`);
}

function formatObservationFieldPresence(observation: NdbcMappedObservation): string {
  const metrics: Array<keyof Pick<NdbcMappedObservation, "seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa">> = [
    "seaSurfaceTempC",
    "waveHeightM",
    "windSpeedMps",
    "pressureHpa",
  ];

  return metrics
    .map((field) => `${field}=${typeof observation[field] === "number" && Number.isFinite(observation[field]) ? "present" : "null"}`)
    .join(", ");
}

function toAuthoritativeOverallRisk(
  fusionRiskLevel: SignalFusionResult["riskLevel"],
): RiskScoreResponse["overallRisk"] | null {
  switch (fusionRiskLevel) {
    case "low":
      return "low";
    case "moderate":
      return "medium";
    case "high":
      return "high";
    case "critical":
      return "critical";
    default:
      return null;
  }
}

function getDisplayZCap(sampleSize: number): number {
  if (sampleSize < MIN_SUFFICIENT_SAMPLE_SIZE) {
    return LOW_QUALITY_DISPLAY_Z_CAP;
  }

  if (sampleSize < HIGH_QUALITY_SAMPLE_SIZE) {
    return MEDIUM_QUALITY_DISPLAY_Z_CAP;
  }

  return Number.POSITIVE_INFINITY;
}

function assessBaselineTrust(
  rawStats: BaselineSignalStats[],
  absoluteTriggeredRuleCount: number,
): RiskTrustAssessment {
  const populatedSampleCounts = rawStats
    .map((stat) => stat.sampleCount)
    .filter((sampleCount) => Number.isFinite(sampleCount) && sampleCount > 0);
  const sampleSize = populatedSampleCounts.length > 0 ? Math.min(...populatedSampleCounts) : 0;
  const metricsWithHistory = populatedSampleCounts.length;
  const sampleSufficiency = sampleSize >= MIN_SUFFICIENT_SAMPLE_SIZE;
  let baselineQuality: RiskScoreResponse["baselineQuality"] =
    sampleSize >= HIGH_QUALITY_SAMPLE_SIZE ? "high" : sampleSufficiency ? "medium" : "low";

  if (metricsWithHistory <= 1 && baselineQuality === "high") {
    baselineQuality = "medium";
  } else if (metricsWithHistory <= 1 && baselineQuality === "medium") {
    baselineQuality = "low";
  }

  const warningMessages: string[] = [];
  const usedCrwProxy = rawStats.some((stat) => stat.field === "crwSstAnomalyC" && stat.sourceProvenance === "crw");

  if (sampleSize === 0) {
    warningMessages.push("No usable baseline history was available; anomaly confidence is low.");
  } else if (!sampleSufficiency) {
    warningMessages.push(
      `Only ${sampleSize} historical sample${sampleSize === 1 ? "" : "s"} were available; baseline-driven anomalies are low confidence.`,
    );
  }

  if (metricsWithHistory <= 1) {
    warningMessages.push("Only one metric had usable baseline history, which reduces cross-signal confidence.");
  }

  if (usedCrwProxy) {
    warningMessages.push("Sea-surface temperature scoring used a CRW-derived proxy because live NDBC SST was unavailable.");
  }

  const baseConfidence =
    baselineQuality === "high"
      ? 0.84
      : baselineQuality === "medium"
        ? 0.64
        : 0.36;
  const corroborationBoost = Math.min(0.12, absoluteTriggeredRuleCount * 0.04);
  const coverageBoost = metricsWithHistory >= 3 ? 0.05 : metricsWithHistory >= 2 ? 0.02 : 0;
  const warningPenalty = warningMessages.length >= 2 ? 0.06 : 0;
  const confidenceScore = Math.min(
    0.97,
    Math.max(0.18, roundNumber(baseConfidence + corroborationBoost + coverageBoost - warningPenalty, 2) ?? 0.18),
  );

  return {
    confidenceScore,
    baselineQuality,
    sampleSize,
    sampleSufficiency,
    warningMessages,
  };
}

function sanitizeBaselineStatsForResponse(
  rawStats: BaselineSignalStats[],
  trust: RiskTrustAssessment,
): { signals: RiskSignalSummary[]; cappedForDisplay: boolean } {
  const displayZCap = getDisplayZCap(trust.sampleSize);
  let cappedForDisplay = false;

  const signals = rawStats
    .filter((metric): metric is BaselineSignalStats & { field: RiskSignalSummary["field"] } =>
      PUBLIC_BASELINE_FIELDS.includes(metric.field as RiskSignalSummary["field"]))
    .map((metric) => {
      const rawZScore = typeof metric.zScore === "number" ? metric.zScore : null;
      let displayZScore = typeof rawZScore === "number"
        ? clamp(rawZScore, -GLOBAL_Z_SCORE_CLAMP, GLOBAL_Z_SCORE_CLAMP)
        : rawZScore;

      if (metric.field === "crwSstAnomalyC" && typeof displayZScore === "number") {
        displayZScore = clamp(displayZScore, -GLOBAL_Z_SCORE_CLAMP, GLOBAL_Z_SCORE_CLAMP);
      }

      if (displayZCap !== Number.POSITIVE_INFINITY && typeof displayZScore === "number") {
        if (Math.abs(displayZScore) > displayZCap) {
          displayZScore = Math.sign(displayZScore) * displayZCap;
          cappedForDisplay = true;
        }
      }

      // Use canonical builder
      return buildRiskSignal({
        field: metric.field,
        value: roundNumber(metric.value),
        mean: roundNumber(metric.mean),
        stdDev: roundNumber(metric.stdDev, 3),
        zScore: roundNumber(displayZScore),
        sampleCount: metric.sampleCount,
        neighborMean: roundNumber(metric.neighborMean),
        neighborDelta: roundNumber(metric.neighborDelta),
        sources: ["NDBC"],
        fusionState: "single",
      });
    });

  return { signals, cappedForDisplay };
}

function scoreErddapMetricSignal(
  field: "salinityPsu" | "dissolvedOxygenMgL",
  rows: StationMetricHistoryItem[],
): RiskSignalSummary | null {
  if (rows.length === 0) {
    return null;
  }

  const current = rows[0];
  if (!current) {
    return null;
  }

  const historyValues = rows.slice(1).map((row) => row.metricValue).filter(Number.isFinite);
  if (historyValues.length < MIN_SUFFICIENT_SAMPLE_SIZE) {
    return null;
  }

  const mean = average(historyValues);
  if (mean === null) return null;
  const stdDev = standardDeviation(historyValues, mean);
  const zScore = stdDev > 0 ? (current.metricValue - mean) / stdDev : null;
  // Use canonical builder
  return buildRiskSignal({
    field,
    value: current.metricValue,
    mean,
    stdDev,
    zScore,
    sampleCount: rows.length,
    neighborMean: null,
    neighborDelta: null,
    sources: ["ERDDAP"],
    fusionState: "single",
  });
}

function assessObservationSourceAgreement(
  current: NdbcMappedObservation,
  history: BaselineObservationInput[],
): SourceAgreementAssessment {
  const observationRows = [
    {
      source: normalizeRiskFieldSourceLabel(current.source),
      observedAt: current.observedAt,
      seaSurfaceTempC: current.seaSurfaceTempC,
      waveHeightM: current.waveHeightM,
      windSpeedMps: current.windSpeedMps,
      pressureHpa: current.pressureHpa,
    },
    ...history
      .slice(0, 24)
      .map((item) => ({
        source: normalizeRiskFieldSourceLabel(item.source),
        observedAt: item.observedAt,
        seaSurfaceTempC: item.seaSurfaceTempC,
        waveHeightM: item.waveHeightM,
        windSpeedMps: item.windSpeedMps,
        pressureHpa: item.pressureHpa,
      })),
  ];

  const sources = Array.from(new Set(observationRows.map((row) => row.source)));
  if (sources.length < 2) {
    return { confidenceAdjustment: 0, detail: null };
  }

  const referenceObservedAt = current.observedAt;
  const windowMs = 6 * 60 * 60 * 1000;
  const latestBySource = new Map<string, typeof observationRows[number]>();

  for (const row of observationRows) {
    if (Math.abs(referenceObservedAt - row.observedAt) > windowMs) {
      continue;
    }

    if (!latestBySource.has(row.source)) {
      latestBySource.set(row.source, row);
    }
  }

  if (latestBySource.size < 2) {
    return { confidenceAdjustment: 0, detail: null };
  }

  const toleranceByMetric: Record<"seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa", number> = {
    seaSurfaceTempC: 0.8,
    waveHeightM: 0.6,
    windSpeedMps: 2,
    pressureHpa: 4,
  };

  let agreements = 0;
  let conflicts = 0;
  const candidateRows = Array.from(latestBySource.values());

  (Object.keys(toleranceByMetric) as Array<keyof typeof toleranceByMetric>).forEach((metric) => {
    const values = candidateRows
      .map((row) => row[metric])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (values.length < 2) {
      return;
    }

    const spread = Math.max(...values) - Math.min(...values);
    if (spread <= toleranceByMetric[metric]) {
      agreements += 1;
    } else {
      conflicts += 1;
    }
  });

  if (agreements === 0 && conflicts === 0) {
    return { confidenceAdjustment: 0, detail: null };
  }

  const adjustment = clamp((agreements * 0.05) - (conflicts * 0.08), -0.22, 0.16);
  const sourceList = Array.from(latestBySource.keys()).join(" + ");
  const detail = conflicts > 0
    ? `${sourceList} disagree on ${conflicts} overlapping metric${conflicts === 1 ? "" : "s"}; confidence reduced.`
    : `${sourceList} agree across ${agreements} overlapping metric${agreements === 1 ? "" : "s"}; confidence increased.`;

  return {
    confidenceAdjustment: roundNumber(adjustment, 2) ?? 0,
    detail,
  };
}

function evaluateErddapSignalImpact(signals: RiskSignalSummary[]): ErddapSignalImpact {
  const relevant = signals.filter((signal) => signal.field === "salinityPsu" || signal.field === "dissolvedOxygenMgL");

  if (relevant.length === 0) {
    return {
      confidenceAdjustment: 0,
      riskLevelBump: 0,
      warnings: [],
    };
  }

  let confidenceAdjustment = 0;
  let riskLevelBump: 0 | 1 = 0;
  const warnings: string[] = [];

  for (const signal of relevant) {
    const absZ = Math.abs(signal.zScore ?? 0);
    if (absZ < 2) {
      continue;
    }

    if (signal.sampleCount >= MIN_SUFFICIENT_SAMPLE_SIZE) {
      confidenceAdjustment += 0.04;
    } else {
      confidenceAdjustment += 0.01;
    }

    if (absZ >= 2.8) {
      riskLevelBump = 1;
    }

    warnings.push(
      `${signal.field === "salinityPsu" ? "ERDDAP salinity" : "ERDDAP dissolved oxygen"} is anomalous (z=${roundNumber(absZ, 2)}).`,
    );
  }

  return {
    confidenceAdjustment: clamp(roundNumber(confidenceAdjustment, 2) ?? 0, 0, 0.12),
    riskLevelBump,
    warnings,
  };
}

function elevateRiskLevel(
  current: RiskScoreResponse["overallRisk"],
  bump: 0 | 1,
): RiskScoreResponse["overallRisk"] {
  if (bump === 0) {
    return current;
  }

  if (current === "low") {
    return "medium";
  }

  if (current === "medium") {
    return "high";
  }

  if (current === "high") {
    return "critical";
  }

  return current;
}

function toAppliedThresholds(thresholds: ResolvedStationRiskThreshold[]): RiskAppliedThreshold[] {
  return thresholds.map((threshold) => ({
    metric: threshold.metric,
    thresholdValue: threshold.thresholdValue,
    comparator: threshold.comparator,
    source: threshold.source,
  }));
}

function severityFromFusion(
  riskLevel: RiskScoreResponse["overallRisk"],
  score: number,
): RiskTriggeredRule["severity"] {
  if (riskLevel === "critical" || (riskLevel === "high" && score >= 0.3)) {
    return "critical";
  }

  return "warning";
}

function contributorFieldToRuleType(
  field: SignalFusionResult["contributors"][number]["field"],
): string {
  if (!field) {
    return "regional_corroboration";
  }

  return FIELD_RULE_TYPES_BY_METRIC[field] ?? "contextual_signal";
}

const FIELD_RULE_TYPES_BY_METRIC: Record<string, string> = {
  seaSurfaceTempC: "high_sea_temperature",
  waveHeightM: "high_wave_height",
  windSpeedMps: "high_wind_speed",
  pressureHpa: "low_pressure_system",
  crwSstAnomalyC: "high_sea_temperature",
  crwHotspotC: "high_sea_temperature",
  crwDhw: "high_sea_temperature",
};

function buildFusionTriggeredRules(
  fusion: SignalFusionResult,
  overallRisk: RiskScoreResponse["overallRisk"],
): RiskTriggeredRule[] {
  return fusion.contributors
    .filter((contributor) =>
      (contributor.kind === "threshold"
        || contributor.kind === "baseline_anomaly"
        || contributor.kind === "crw_context")
      && contributor.score > 0)
    .map((contributor) => ({
      ruleType: contributorFieldToRuleType(contributor.field),
      severity: severityFromFusion(overallRisk, contributor.score),
      title: contributor.title,
      detail: contributor.detail,
    }));
}

function buildErddapTriggeredRules(signals: RiskSignalSummary[]): RiskTriggeredRule[] {
  return signals
    .filter((signal) => (signal.field === "salinityPsu" || signal.field === "dissolvedOxygenMgL") && Math.abs(signal.zScore ?? 0) >= 2)
    .map((signal) => ({
      ruleType: signal.field === "salinityPsu" ? "salinity_anomaly" : "dissolved_oxygen_anomaly",
      severity: Math.abs(signal.zScore ?? 0) >= 2.8 ? "critical" : "warning",
      title: signal.field === "salinityPsu" ? "Salinity anomaly detected" : "Dissolved oxygen anomaly detected",
      detail:
        signal.field === "salinityPsu"
          ? `Salinity diverged from baseline (z=${roundNumber(signal.zScore ?? 0, 2)}).`
          : `Dissolved oxygen diverged from baseline (z=${roundNumber(signal.zScore ?? 0, 2)}).`,
    } satisfies RiskTriggeredRule));
}

function formatDriverList(drivers: string[]): string {
  if (drivers.length === 0) {
    return "changing conditions";
  }

  if (drivers.length === 1) {
    return drivers[0];
  }

  if (drivers.length === 2) {
    return `${drivers[0]} and ${drivers[1]}`;
  }

  return `${drivers.slice(0, -1).join(", ")}, and ${drivers[drivers.length - 1]}`;
}

function signalDisplayLabel(field: RiskSignalSummary["field"]): string {
  return FIELD_LABELS[field];
}

function topDominantSignals(stats: RiskSignalSummary[]): RiskSignalSummary[] {
  return [...stats]
    .filter((stat) => typeof stat.zScore === "number")
    .sort((left, right) => Math.abs((right.zScore ?? 0)) - Math.abs((left.zScore ?? 0)))
    .slice(0, 2);
}

function buildFusionAlignedSummary(
  observation: NdbcMappedObservation,
  riskLevel: RiskScoreResponse["overallRisk"],
  stats: RiskSignalSummary[],
  fusion: SignalFusionResult,
  trust: RiskTrustAssessment,
  rawStatsByField: Partial<Record<BaselineSignalStats["field"], BaselineSignalStats>>,
): string {
  const topSignals = topDominantSignals(stats);
  const topSignalLabels = topSignals.map((signal) => signalDisplayLabel(signal.field));
  const dominantSignalText = topSignalLabels.length > 0
    ? ` Dominant signals: ${formatDriverList(topSignalLabels)}.`
    : "";
  const fusionReasonText = fusion.reasons.length > 0
    ? ` ${fusion.reasons.slice(0, 2).join(" ")}`
    : "";
  const lowConfidenceText = !trust.sampleSufficiency
    ? ` Baseline confidence is limited because only ${trust.sampleSize} historical sample${trust.sampleSize === 1 ? "" : "s"} were available.`
    : "";
  const crwSuffix = rawStatsByField.crwSstAnomalyC?.sourceProvenance === "crw"
    ? " CRW-derived SST anomaly is being used as a temperature-context signal because live NDBC SST is unavailable."
    : "";

  switch (riskLevel) {
    case "critical":
      return `Critical marine risk at station ${observation.stationId}.${dominantSignalText}${fusionReasonText}${lowConfidenceText}${crwSuffix}`.trim();
    case "high":
      return `High marine risk at station ${observation.stationId}.${dominantSignalText}${fusionReasonText}${lowConfidenceText}${crwSuffix}`.trim();
    case "medium":
      return `Elevated marine risk at station ${observation.stationId}.${dominantSignalText}${fusionReasonText}${lowConfidenceText}${crwSuffix}`.trim();
    default:
      return `Low marine risk at station ${observation.stationId}.${dominantSignalText}${fusionReasonText}${lowConfidenceText}${crwSuffix}`.trim();
  }
}

function logFusionAssessment(
  observation: NdbcMappedObservation,
  fusion: SignalFusionResult,
  signals: RiskSignalSummary[],
) {
  logRiskDiagnostic(JSON.stringify({
    stationId: observation.stationId,
    observedAt: observation.sourceTimestamp,
    event: "fusion_assessment",
    finalRiskLevel: fusion.riskLevel,
    confidence: fusion.confidence,
    neighborInfluence: fusion.neighborInfluence,
    signals: signals.map((signal) => ({
      field: signal.field,
      value: signal.value,
      zScore: signal.zScore,
      sampleCount: signal.sampleCount,
      neighborMean: signal.neighborMean,
      neighborDelta: signal.neighborDelta,
    })),
    contributors: fusion.contributors.map((contributor) => ({
      kind: contributor.kind,
      field: contributor.field,
      title: contributor.title,
      score: contributor.score,
      confidenceAdjustment: contributor.confidenceAdjustment,
    })),
  }));
}

export async function readObservationHistory(
  stationId: string,
  windowDays: number,
): Promise<ReadObservationHistoryResultSuccess | ReadObservationHistoryResultFailure> {
  const dbPath = resolveDatabasePath();

  if (!hasDatabasePath(dbPath)) {
    return {
      ok: false,
      status: 503,
      message: "Observation database unavailable",
      fallbackReason: "db_path_missing",
    };
  }

  let adapter: AsyncDbAdapter;
  try {
    adapter = getAsyncAdapter(true);
  } catch {
    return {
      ok: false,
      status: 503,
      message: "Observation database unavailable",
      fallbackReason: "db_unavailable",
    };
  }

  try {
    const lookbackDays = Math.max(windowDays, BASELINE_HISTORY_LOOKBACK_DAYS);
    const sinceObservedAt = Date.now() - (lookbackDays * 24 * 60 * 60 * 1000);
    const history = await readRecentObservationHistoryFromDb(
      adapter,
      stationId,
      sinceObservedAt,
      MAX_HISTORY_POINTS,
    );
    const crwHistory = await readRecentCrwRiskHistoryFromDb(
      adapter,
      sinceObservedAt,
      MAX_HISTORY_POINTS,
    );
    const latest = history[0];
    const preferredCurrent = history.find((row) => row.source === "noaa_ndbc") ?? latest;

    if (!preferredCurrent) {
      return {
        ok: false,
        status: 404,
        message: `No observations found for station ${stationId}`,
      };
    }

    logRiskDiagnostic(
      `station ${stationId} loaded ${history.length} historical observations within ${lookbackDays} days for baseline analysis.`,
    );
    logRiskDiagnostic(
      `station ${stationId} latest observation fields: ${formatObservationFieldPresence({
        stationId: preferredCurrent.stationId,
        observedAt: preferredCurrent.observedAt,
        seaSurfaceTempC: preferredCurrent.seaSurfaceTempC,
        waveHeightM: preferredCurrent.waveHeightM,
        windSpeedMps: preferredCurrent.windSpeedMps,
        pressureHpa: preferredCurrent.pressureHpa,
        source: "noaa_ndbc",
        sourceFeed: "observations",
        sourceTimestamp: preferredCurrent.sourceTimestamp,
        rawLine: "",
      })}`,
    );
    logRiskDiagnostic(
      `station ${stationId} loaded ${crwHistory.length} CRW contextual records within ${lookbackDays} days for auxiliary baseline analysis.`,
    );
    const erddapSalinity = await readRecentStationMetricHistoryFromDb(adapter, {
      stationId,
      metricType: "salinity_psu",
      sinceObservedAt,
      limit: MAX_HISTORY_POINTS,
      sources: ["ioos_erddap"],
    });
    const erddapDissolvedOxygen = await readRecentStationMetricHistoryFromDb(adapter, {
      stationId,
      metricType: "dissolved_oxygen_mg_l",
      sinceObservedAt,
      limit: MAX_HISTORY_POINTS,
      sources: ["ioos_erddap"],
    });
    logRiskDiagnostic(
      `station ${stationId} loaded ${erddapSalinity.length} salinity and ${erddapDissolvedOxygen.length} dissolved oxygen ERDDAP records for anomaly augmentation.`,
    );
    const configuredNeighborStationIds = listNeighborStationIds(stationId);
    const neighborObservations = (await readLatestObservationSnapshotsFromDb(
      adapter,
      configuredNeighborStationIds,
      preferredCurrent.observedAt,
    )).map(toBaselineInput);
    logRiskDiagnostic(
      `station ${stationId} loaded ${neighborObservations.length} neighbor station snapshots for regional corroboration.`,
    );

    return {
      ok: true,
      current: {
        stationId: preferredCurrent.stationId,
        observedAt: preferredCurrent.observedAt,
        seaSurfaceTempC: preferredCurrent.seaSurfaceTempC,
        waveHeightM: preferredCurrent.waveHeightM,
        windSpeedMps: preferredCurrent.windSpeedMps,
        pressureHpa: preferredCurrent.pressureHpa,
        source: "noaa_ndbc",
        sourceFeed: "observations",
        sourceTimestamp: preferredCurrent.sourceTimestamp,
        rawLine: "",
      },
      history: history.map(toBaselineInput),
      crwContext: {
        current: crwHistory[0] ? toCrwBaselineInput(crwHistory[0]) : null,
        history: crwHistory.map(toCrwBaselineInput),
      },
      neighborContext: {
        neighborStationIds: configuredNeighborStationIds,
        neighborObservations,
      },
      erddapContext: {
        salinity: erddapSalinity,
        dissolvedOxygen: erddapDissolvedOxygen,
      },
      sourceAgreement: assessObservationSourceAgreement(
        {
          stationId: preferredCurrent.stationId,
          observedAt: preferredCurrent.observedAt,
          seaSurfaceTempC: preferredCurrent.seaSurfaceTempC,
          waveHeightM: preferredCurrent.waveHeightM,
          windSpeedMps: preferredCurrent.windSpeedMps,
          pressureHpa: preferredCurrent.pressureHpa,
          source: "noaa_ndbc",
          sourceFeed: "observations",
          sourceTimestamp: preferredCurrent.sourceTimestamp,
          rawLine: "",
        },
        history.map(toBaselineInput),
      ),
    };
  } catch {
    return {
      ok: false,
      status: 503,
      message: "Observation lookup failed",
      fallbackReason: "db_unavailable",
    };
  } finally {
    if (adapter) await adapter.close();
  }
}

function mapRiskEvaluateBodyToObservation(
  body: RiskEvaluateRequest,
): {
  ok: true;
  observation: NdbcMappedObservation;
  history: BaselineObservationInput[] | null;
} | {
  ok: false;
  message: string;
} {
  const stationId = normalizeText(body.stationId);
  const observedAt = parseIsoToEpochMs(body.observedAt);
  const seaSurfaceTempC = normalizeOptionalMetric(body.seaSurfaceTempC);
  const waveHeightM = normalizeOptionalMetric(body.waveHeightM);
  const windSpeedMps = normalizeOptionalMetric(body.windSpeedMps);
  const pressureHpa = normalizeOptionalMetric(body.pressureHpa);

  if (!stationId) {
    return { ok: false, message: "stationId is required" };
  }

  if (observedAt === null) {
    return { ok: false, message: "observedAt must be a valid ISO timestamp" };
  }

  if (
    seaSurfaceTempC === undefined
    || waveHeightM === undefined
    || windSpeedMps === undefined
    || pressureHpa === undefined
  ) {
    return {
      ok: false,
      message: "seaSurfaceTempC, waveHeightM, windSpeedMps, and pressureHpa must be numbers or null",
    };
  }

  const history = body.history?.map((item) => {
    const historyObservedAt = parseIsoToEpochMs(item.observedAt);
    const historySst = normalizeOptionalMetric(item.seaSurfaceTempC);
    const historyWave = normalizeOptionalMetric(item.waveHeightM);
    const historyWind = normalizeOptionalMetric(item.windSpeedMps);
    const historyPressure = normalizeOptionalMetric(item.pressureHpa);

    if (
      historyObservedAt === null
      || historySst === undefined
      || historyWave === undefined
      || historyWind === undefined
      || historyPressure === undefined
    ) {
      return null;
    }

    return {
      stationId,
      observedAt: historyObservedAt,
      seaSurfaceTempC: historySst,
      waveHeightM: historyWave,
      windSpeedMps: historyWind,
      pressureHpa: historyPressure,
      sourceTimestamp: new Date(historyObservedAt).toISOString(),
    } satisfies BaselineObservationInput;
  }) ?? null;

  if (body.history && history?.some((item) => item === null)) {
    return {
      ok: false,
      message: "history entries must include valid observedAt timestamps and numeric or null metrics",
    };
  }

  return {
    ok: true,
    observation: {
      stationId,
      observedAt,
      seaSurfaceTempC,
      waveHeightM,
      windSpeedMps,
      pressureHpa,
      source: "noaa_ndbc",
      sourceFeed: "api",
      sourceTimestamp: new Date(observedAt).toISOString(),
      rawLine: "",
    },
    history: history as BaselineObservationInput[] | null,
  };
}

export async function buildRiskAnalysis(
  observation: NdbcMappedObservation,
  history: BaselineObservationInput[],
  windowDays: number,
  crwContext: CrwBaselineContext = { current: null, history: [] },
  neighborContext: NeighborStationContext = { neighborStationIds: [], neighborObservations: [] },
  erddapContext: ErddapMetricContext = { salinity: [], dissolvedOxygen: [] },
  sourceAgreement: SourceAgreementAssessment = { confidenceAdjustment: 0, detail: null },
): Promise<RiskAnalysisResult> {
  const resolvedThresholds = await resolveStationRiskThresholds(observation.stationId);
  const fusion = fuseStationSignals({
    observation,
    thresholds: resolvedThresholds,
    baselineHistory: history,
    neighborObservations: neighborContext.neighborObservations,
    crwCurrent: crwContext.current,
    crwHistory: crwContext.history,
    baselineWindowDays: windowDays,
    anomalyZScoreThreshold: 2,
  });
  const rawStats = scoreBaselineAnomalies(observation, history, {
    windowDays,
    neighborObservations: neighborContext.neighborObservations,
    crwCurrent: crwContext.current,
    crwHistory: crwContext.history,
  });
  for (const stat of rawStats) {
    if (stat.sampleCount === 0 && stat.sampleCountReason) {
      logRiskDiagnostic(
        `station ${observation.stationId} signal ${stat.field} sampleCount=0: ${stat.sampleCountReason}`,
      );
    }
  }
  const absoluteTriggeredRuleTypes = new Set(
    collectTriggeredStationThresholds(observation, resolvedThresholds).map((threshold) => threshold.ruleType),
  );
  const trust = assessBaselineTrust(rawStats, absoluteTriggeredRuleTypes.size);
  const presentation = sanitizeBaselineStatsForResponse(rawStats, trust);
  const salinitySignal = scoreErddapMetricSignal("salinityPsu", erddapContext.salinity);
  const dissolvedOxygenSignal = scoreErddapMetricSignal("dissolvedOxygenMgL", erddapContext.dissolvedOxygen);
  const erddapSignals = [salinitySignal, dissolvedOxygenSignal].filter(
    (signal): signal is RiskSignalSummary => signal !== null,
  );
  // Attach sources and fusionState to every signal using central fusion logic
  const signals: RiskSignalSummary[] = [...presentation.signals, ...erddapSignals];
  const rawStatsByField = Object.fromEntries(
    rawStats.map((signal) => [signal.field, signal]),
  ) as Partial<Record<BaselineSignalStats["field"], BaselineSignalStats>>;
  const warningMessages = [...trust.warningMessages];

  if (presentation.cappedForDisplay) {
    warningMessages.push("Displayed z-scores were capped to reduce overstatement from a thin baseline history.");
  }
  if (sourceAgreement.detail) {
    warningMessages.push(sourceAgreement.detail);
  }

  const erddapImpact = evaluateErddapSignalImpact(erddapSignals);
  if (erddapImpact.warnings.length > 0) {
    warningMessages.push(...erddapImpact.warnings);
  }

  const baseOverallRisk = toAuthoritativeOverallRisk(fusion.riskLevel) ?? "low";
  const rawOverallRisk = elevateRiskLevel(baseOverallRisk, erddapImpact.riskLevelBump);
  const adjustedConfidence = clamp(
    (roundNumber(fusion.confidence + sourceAgreement.confidenceAdjustment + erddapImpact.confidenceAdjustment, 2) ?? fusion.confidence),
    0.1,
    0.99,
  );
  const effectiveFusion: SignalFusionResult = {
    ...fusion,
    confidence: adjustedConfidence,
    reasons: sourceAgreement.detail ? [...fusion.reasons, sourceAgreement.detail] : fusion.reasons,
  };
  const triggeredRules = [
    ...buildFusionTriggeredRules(effectiveFusion, rawOverallRisk),
    ...buildErddapTriggeredRules(erddapSignals),
  ];
  let operatorSummary = buildFusionAlignedSummary(
    observation,
    rawOverallRisk,
    signals,
    effectiveFusion,
    trust,
    rawStatsByField,
  );
  let overallRisk: RiskScoreResponse["overallRisk"] | "unknown" = rawOverallRisk;
  // Confidence gating: if sampleSufficiency is false or confidenceScore < 0.35, mask risk
  if (!trust.sampleSufficiency || adjustedConfidence < 0.35) {
    overallRisk = "unknown";
    operatorSummary =
      "Insufficient data for reliable risk classification. " +
      operatorSummary;
    if (!warningMessages.some((m) => m.includes("Insufficient data for reliable risk classification"))) {
      warningMessages.unshift("Insufficient data for reliable risk classification: sample size or confidence too low.");
    }
  }
  logFusionAssessment(observation, effectiveFusion, signals);

  // ── Sovereign Trust Verification ──────────────────────────────────────────
  const sovereignResult = await SovereignTrustService.verifyRiskClaim(
    observation.stationId,
    overallRisk,
    adjustedConfidence,
    effectiveFusion.reasons
  );

  if (sovereignResult.status === IntegrityStatus.REJECTED) {
    overallRisk = "unknown";
    operatorSummary = `[SOVEREIGN CONTRADICTION] ${operatorSummary}`;
    if (!warningMessages.some(m => m.includes("Sovereign Verification failed"))) {
      warningMessages.unshift("Sovereign Verification failed: Signal contradicts verified reality claims.");
    }
  }

  // Apply contradiction-policy to ensure fail-closed public visibility.
  const finalPublicRisk = toFailClosedPublicRiskLevel(overallRisk as any);
  
  return {
    appliedThresholds: toAppliedThresholds(resolvedThresholds),
    confidenceScore: adjustedConfidence,
    baselineQuality: trust.baselineQuality,
    fusion: effectiveFusion,
    sampleSize: trust.sampleSize,
    sampleSufficiency: trust.sampleSufficiency,
    warningMessages,
    operatorSummary,
    overallRisk: finalPublicRisk,
    signals,
    triggeredRules,
    sovereignVerification: {
      status: sovereignResult.status,
      claimId: sovereignResult.claimId,
      contradictions: sovereignResult.contradictions,
      verifiedAt: new Date().toISOString()
    }
  };
}

async function readObservationEvidenceMap(
  stationIds: string[],
  sinceMs: number,
): Promise<Map<string, ObservationHistoryItem[]>> {
  const evidenceByStation = new Map<string, ObservationHistoryItem[]>();
  const uniqueStationIds = Array.from(new Set(stationIds.filter((stationId) => stationId.trim().length > 0)));

  if (uniqueStationIds.length === 0) {
    return evidenceByStation;
  }

  const dbPath = resolveDatabasePath();

  if (!hasDatabasePath(dbPath)) {
    return evidenceByStation;
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAsyncAdapter(true);
  } catch {
    return evidenceByStation;
  }

  try {
    for (const stationId of uniqueStationIds) {
      const history = await readRecentObservationHistoryFromDb(adapter, stationId, sinceMs, 3);
      evidenceByStation.set(stationId, history);
    }
  } catch {
    return new Map<string, ObservationHistoryItem[]>();
  } finally {
    await adapter.close();
  }

  return evidenceByStation;
}

async function readErddapMetricEvidenceMap(
  stationIds: string[],
  sinceMs: number,
): Promise<Map<string, ErddapMetricContext>> {
  const evidenceByStation = new Map<string, ErddapMetricContext>();
  const uniqueStationIds = Array.from(new Set(stationIds.filter((stationId) => stationId.trim().length > 0)));

  if (uniqueStationIds.length === 0) {
    return evidenceByStation;
  }

  const dbPath = resolveDatabasePath();
  if (!hasDatabasePath(dbPath)) {
    return evidenceByStation;
  }

  let adapter: AsyncDbAdapter;

  try {
    adapter = getAsyncAdapter(true);
  } catch {
    return evidenceByStation;
  }

  try {
    for (const stationId of uniqueStationIds) {
      evidenceByStation.set(stationId, {
        salinity: await readRecentStationMetricHistoryFromDb(adapter, {
          stationId,
          metricType: "salinity_psu",
          sinceObservedAt: sinceMs,
          limit: 180,
          sources: ["ioos_erddap"],
        }),
        dissolvedOxygen: await readRecentStationMetricHistoryFromDb(adapter, {
          stationId,
          metricType: "dissolved_oxygen_mg_l",
          sinceObservedAt: sinceMs,
          limit: 180,
          sources: ["ioos_erddap"],
        }),
      });
    }
  } catch {
    return new Map<string, ErddapMetricContext>();
  } finally {
    if (adapter) await adapter.close();
  }

  return evidenceByStation;
}

function deriveSourceMetrics(
  signal: SignalDetection,
  evidence: ObservationHistoryItem[],
): Array<"seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa"> {
  if (signal.signalType === "thermal_anomaly") {
    return ["seaSurfaceTempC"];
  }

  const metrics = new Set<"seaSurfaceTempC" | "waveHeightM" | "windSpeedMps" | "pressureHpa">();

  for (const item of evidence) {
    if (item.seaSurfaceTempC !== null) metrics.add("seaSurfaceTempC");
    if (item.waveHeightM !== null) metrics.add("waveHeightM");
    if (item.windSpeedMps !== null) metrics.add("windSpeedMps");
    if (item.pressureHpa !== null) metrics.add("pressureHpa");
  }

  return Array.from(metrics);
}

function buildAnomalyItem(
  signal: SignalDetection,
  evidence: ObservationHistoryItem[],
): PublicAnomalyItem {
  const timestamps = evidence.map((item) => item.sourceTimestamp);
  const sourceMetrics = deriveSourceMetrics(signal, evidence);
  return {
    id: signal.id,
    stationId: signal.stationId,
    signalType: signal.signalType,
    severity: signal.severity,
    status: signal.status,
    title: signal.title,
    summary: signal.summary,
    detectedAt: signal.detectedAt,
    provenance: {
      sourceObservationTimestamps: timestamps,
      sourceMetrics,
      sourceRecordIds: signal.sourceId ? [signal.sourceId] : [],
      evidenceSummary:
        timestamps.length > 0
          ? `Backed by ${timestamps.length} recent observation${timestamps.length === 1 ? "" : "s"} for station ${signal.stationId ?? "unknown"} and source record ${signal.sourceId}.`
          : `Derived from signal source ${signal.sourceType} and record ${signal.sourceId}.`,
      sources: [signal.sourceType ?? "unknown"],
    },
    sources: [signal.sourceType ?? "unknown"],
    fusionState: "single",
  };
}

function buildErddapMetricAnomalyItems(
  stationId: string,
  metricContext: ErddapMetricContext,
): PublicAnomalyItem[] {
  const salinitySignal = scoreErddapMetricSignal("salinityPsu", metricContext.salinity);
  const oxygenSignal = scoreErddapMetricSignal("dissolvedOxygenMgL", metricContext.dissolvedOxygen);
  const candidateSignals = [salinitySignal, oxygenSignal].filter(
    (signal): signal is RiskSignalSummary => signal !== null,
  );

  return candidateSignals
    .filter((signal) => Math.abs(signal.zScore ?? 0) >= 2)
    .map((signal) => {
      const evidenceRows = signal.field === "salinityPsu" ? metricContext.salinity : metricContext.dissolvedOxygen;
      const latest = evidenceRows[0];
      const detectedAt = latest?.sourceTimestamp ?? new Date().toISOString();
      const sourceRefs = evidenceRows.slice(0, 3).map((row) => row.sourceReference);
      const sourceTimestamps = evidenceRows.slice(0, 3).map((row) => row.sourceTimestamp);
      const z = roundNumber(signal.zScore ?? 0, 2) ?? 0;
      const metricLabel = signal.field === "salinityPsu" ? "Salinity" : "Dissolved oxygen";
      const provenanceMetric: "salinityPsu" | "dissolvedOxygenMgL" =
        signal.field === "salinityPsu" ? "salinityPsu" : "dissolvedOxygenMgL";

      return {
        id: `ERDDAP-${stationId}-${signal.field}-${latest?.observedAt ?? Date.now()}`,
        stationId,
        signalType: signal.field === "salinityPsu" ? "salinity_anomaly" : "dissolved_oxygen_anomaly",
        severity: Math.abs(z) >= 2.8 ? "critical" : "warning",
        status: "active",
        title: `${metricLabel} anomaly detected`,
        summary: `${metricLabel} deviated from recent ERDDAP baseline (z=${z}).`,
        detectedAt,
        provenance: {
          sourceObservationTimestamps: sourceTimestamps,
          sourceMetrics: [provenanceMetric],
          sourceRecordIds: sourceRefs,
          sources: ["ERDDAP"],
          evidenceSummary: `Derived from ${evidenceRows.length} ERDDAP ${metricLabel.toLowerCase()} sample${evidenceRows.length === 1 ? "" : "s"}.`,
        },
        sources: ["ERDDAP"],
        fusionState: "single",
      } satisfies PublicAnomalyItem;
    });
}

export async function buildRiskScoreRouteResponse(query: RiskScoreQuery = {}): Promise<{
  status: 200 | 400 | 404 | 503;
  json: RiskScoreResponse | { message: string };
}> {
  const stationId = normalizeText(query.stationId);
  const window = normalizePositiveInteger(query.window, DEFAULT_WINDOW_DAYS, 90);

  if (!stationId) {
    return {
      status: 400,
      json: { message: "stationId is required" },
    };
  }

  const result = await readObservationHistory(stationId, window);

  if (!result.ok) {
    if (result.fallbackReason) {
      return buildDegradedRiskScoreResponse(stationId, window, result.fallbackReason);
    }

    return {
      status: result.status,
      json: { message: result.message },
    };
  }

  const analysis = await buildRiskAnalysis(
    result.current,
    result.history,
    window,
    result.crwContext,
    result.neighborContext,
    result.erddapContext,
    result.sourceAgreement,
  );

  return {
    status: 200,
    json: {
      stationId: result.current.stationId,
      window: window,
      triggeredRules: analysis.triggeredRules,
      signals: analysis.signals,
      overallRisk: toFailClosedPublicRiskLevel(analysis.overallRisk),
      computedAt: new Date().toISOString(),
      appliedThresholds: analysis.appliedThresholds,
      confidenceScore: analysis.confidenceScore,
      baselineQuality: analysis.baselineQuality,
      sampleSize: analysis.sampleSize,
      sampleSufficiency: analysis.sampleSufficiency,
      warningMessages: analysis.warningMessages,
      operatorSummary: analysis.operatorSummary,
      confidenceClassification: !analysis.sampleSufficiency
        ? "INSUFFICIENT_DATA"
        : analysis.overallRisk === "conflicting_signals"
          ? "CONFLICTING_SIGNALS"
          : analysis.confidenceScore >= 0.75
            ? "VERIFIED"
            : analysis.confidenceScore >= 0.5
              ? "PARTIAL"
              : analysis.confidenceScore >= 0.3
                ? "WEAK"
                : "UNTRUSTED",
      conflictTaxonomy: analysis.overallRisk === "conflicting_signals" ? "conflict" : "none",
      systemIntegrity: analysis.overallRisk === "conflicting_signals" ? "DEGRADED" : "NORMAL",
      integritySummary: {
        verifiedCount: 0,
        unverifiedCount: 0,
        rejectedCount: 0,
        exclusionReasonCounts: {},
      },
      coverage: {
        acceptedCount: analysis.signals.length,
        rejectedCount: 0,
        conflictCount: analysis.overallRisk === "conflicting_signals" ? 1 : 0,
        missingCoverageSummary: "",
        sourcesConsidered: [],
        stationsConsidered: [result.current.stationId],
      },
    },
  };
}

export async function buildRiskEvaluateRouteResponse(body: RiskEvaluateRequest): Promise<{
  status: 200 | 400 | 404 | 503;
  json: RiskEvaluateResponse | { message: string };
}> {
  const mapped = mapRiskEvaluateBodyToObservation(body);
  if (!mapped.ok) {
    return {
      status: 400,
      json: { message: mapped.message },
    };
  }

  const dbHistoryResult = mapped.history === null
    ? await readObservationHistory(mapped.observation.stationId, DEFAULT_WINDOW_DAYS)
    : null;
  const dbHistory = mapped.history ?? (dbHistoryResult?.ok ? dbHistoryResult.history : null);

  if (mapped.history === null && dbHistory === null) {
    const reason = dbHistoryResult?.ok === false && dbHistoryResult.fallbackReason
      ? dbHistoryResult.fallbackReason
      : "db_unavailable";
    return {
      ...buildDegradedRiskEvaluateResponse(mapped.observation.stationId, reason),
    };
  }

  const analysis = await buildRiskAnalysis(
    mapped.observation,
    dbHistory ?? [],
    DEFAULT_WINDOW_DAYS,
    dbHistoryResult?.ok ? dbHistoryResult.crwContext : undefined,
    dbHistoryResult?.ok ? dbHistoryResult.neighborContext : undefined,
    dbHistoryResult?.ok ? dbHistoryResult.erddapContext : undefined,
    dbHistoryResult?.ok ? dbHistoryResult.sourceAgreement : undefined,
  );

  return {
    status: 200,
    json: {
      stationId: mapped.observation.stationId,
      triggeredRules: analysis.triggeredRules,
      baselineStats: analysis.signals,
      riskLevel: analysis.overallRisk,
      evaluatedAt: new Date().toISOString(),
      appliedThresholds: analysis.appliedThresholds,
      confidenceScore: analysis.confidenceScore,
      baselineQuality: analysis.baselineQuality,
      sampleSize: analysis.sampleSize,
      sampleSufficiency: analysis.sampleSufficiency,
      warningMessages: analysis.warningMessages,
      operatorSummary: analysis.operatorSummary,
      fusion: analysis.fusion,
    } as RiskEvaluateResponse & { fusion: SignalFusionResult },
  };
}

export async function buildAnomaliesRouteResponse(query: AnomaliesQuery = {}): Promise<{
  status: 200 | 400 | 503;
  json: AnomalyListResponse | { message: string };
}> {
  const stationId = normalizeText(query.stationId);
  const limit = normalizePositiveInteger(query.limit, DEFAULT_LIMIT, MAX_LIMIT);
  const defaultSince = new Date(Date.now() - (DEFAULT_ANOMALY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000)).toISOString();
  const sinceIso = normalizeText(query.since) ?? defaultSince;
  const sinceMs = parseIsoToEpochMs(sinceIso);
  const defaultsApplied: string[] = [];
  const rawLimit = query.limit;
  const parsedLimit = rawLimit === undefined ? Number.NaN : typeof rawLimit === "number" ? rawLimit : Number(rawLimit);

  if (rawLimit === undefined || !Number.isFinite(parsedLimit) || parsedLimit <= 0) {
    defaultsApplied.push("limit");
  }

  if (!normalizeText(query.since)) {
    defaultsApplied.push("since");
  }

  if (query.since !== undefined && sinceMs === null) {
    return {
      status: 400,
      json: { message: "since must be a valid ISO timestamp" },
    };
  }

  const signalResult = await listSignals({
    stationId: stationId ?? undefined,
    limit: MAX_LIMIT,
  });

  const since = sinceMs ?? Date.parse(defaultSince);

  if (signalResult.source !== "db") {
    return buildDegradedAnomaliesResponse(
      stationId ?? null,
      new Date(since).toISOString(),
      limit,
      defaultsApplied,
      mapDbFallbackReason(signalResult.fallbackReason),
    );
  }

  const filteredSignals = signalResult.signals.filter((signal) => Date.parse(signal.detectedAt) >= since);
  const observationEvidence = await readObservationEvidenceMap(
    filteredSignals.map((signal) => signal.stationId ?? ""),
    since,
  );
  const stationScope = stationId
    ? [stationId]
    : Array.from(new Set(filteredSignals.map((signal) => signal.stationId ?? "").filter((id) => id.length > 0)));
  const erddapMetricEvidence = await readErddapMetricEvidenceMap(stationScope, since);
  const signalAnomalies = filteredSignals
    .slice(0, limit)
    .map((signal) => buildAnomalyItem(signal, observationEvidence.get(signal.stationId ?? "") ?? []));
  const erddapAnomalies = stationScope.flatMap((id) => buildErddapMetricAnomalyItems(id, erddapMetricEvidence.get(id) ?? {
    salinity: [],
    dissolvedOxygen: [],
  }));
  const anomalies = [...signalAnomalies, ...erddapAnomalies]
    .sort((a, b) => Date.parse(b.detectedAt) - Date.parse(a.detectedAt))
    .slice(0, limit);
  const totalAnomalyCount = filteredSignals.length + erddapAnomalies.length;

  return {
    status: 200,
    json: {
      anomalies,
      total: totalAnomalyCount,
      stationId: stationId ?? null,
      since: new Date(since).toISOString(),
      appliedFilters: {
        stationId: stationId ?? null,
        since: new Date(since).toISOString(),
        limit,
      },
      pagination: {
        limit,
        returned: anomalies.length,
        total: totalAnomalyCount,
        hasMore: totalAnomalyCount > limit,
        maxLimit: MAX_LIMIT,
        defaultsApplied,
      },
    },
  };
}

export const getRiskScoreRoute: RouteDefinition<
  RiskScoreResponse | { message: string },
  undefined,
  RiskScoreQuery
> = {
  method: "GET",
  path: "/risk/score",
  async handler(request) {
    return await buildRiskScoreRouteResponse(request.query ?? {});
  },
};

export const postRiskEvaluateRoute: RouteDefinition<
  RiskEvaluateResponse | { message: string },
  RiskEvaluateRequest
> = {
  method: "POST",
  path: "/risk/evaluate",
  async handler(request) {
    return await buildRiskEvaluateRouteResponse(request.body);
  },
};

export const getAnomaliesRoute: RouteDefinition<
  AnomalyListResponse | { message: string },
  undefined,
  AnomaliesQuery
> = {
  method: "GET",
  path: "/anomalies",
  async handler(request) {
    return await buildAnomaliesRouteResponse(request.query ?? {});
  },
};
