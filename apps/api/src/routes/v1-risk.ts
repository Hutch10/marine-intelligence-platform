/**
 * GET /v1/risk/:stationId
 *
 * Public risk assessment endpoint. Returns a structured, consumer-facing
 * snapshot of current conditions, triggered alerts, anomaly signals, and
 * baseline coverage metadata for a given monitoring station.
 *
 * No internal implementation details (rule types, DB column names, raw stats,
 * or calibration internals) are exposed.
 */

import type { RiskSignalSummary, RiskTriggeredRule, RouteDefinition } from "../types";
import { buildRiskAnalysis, readObservationHistory } from "./risk";

// ─── Window ───────────────────────────────────────────────────────────────────

const BASELINE_WINDOW_DAYS = 45;

// ─── Public response types ────────────────────────────────────────────────────

export type V1RiskLevel = "low" | "medium" | "high" | "critical" | "unknown";
export type V1SignalDirection = "above_normal" | "below_normal" | "normal";
export type V1BaselineCoverageQuality = "high" | "medium" | "low";

/**
 * The latest sensor readings at this station, as of the most recent ingested
 * observation. Null values indicate the sensor did not report that metric.
 */
export interface V1Conditions {
  /** ISO 8601 timestamp of the source observation this snapshot was built from. */
  observedAt: string;
  /** Sea surface temperature in degrees Celsius. */
  seaSurfaceTemperatureC: number | null;
  /** Significant wave height in metres. */
  waveHeightM: number | null;
  /** Wind speed in metres per second. */
  windSpeedMps: number | null;
  /** Barometric pressure in hectopascals. */
  pressureHpa: number | null;
}

/**
 * A concrete threshold alert: a sensor reading has exceeded a configured limit.
 */
export interface V1Alert {
  severity: "warning" | "critical";
  /** Human-readable title, e.g. "High wave height at 46042: 6.8 m". */
  title: string;
  /** Contextual detail including the observed value and the limit breached. */
  detail: string;
}

/**
 * Per-metric anomaly context relative to the station's recent baseline.
 * anomalyScore is a normalised deviation score (higher magnitude = more unusual).
 * Null when insufficient history exists to compute a baseline.
 */
export interface V1Signal {
  metric:
    | "sea_surface_temperature"
    | "wave_height"
    | "wind_speed"
    | "pressure"
    | "crw_sst_anomaly"
    | "salinity"
    | "dissolved_oxygen";
  unit: "°C" | "m" | "m/s" | "hPa" | "psu" | "mg/L";
  currentValue: number | null;
  anomalyScore: number | null;
  direction: V1SignalDirection;
}

/**
 * How much historical data is available to underpin this risk assessment.
 *
 * IMPORTANT — this is NOT a probability or a model confidence score.
 * score: 0.0 (very few historical points) → 1.0 (rich historical baseline).
 * quality: summarises the depth of the historical baseline.
 * historicalDataPoints: number of past observations used to build the baseline.
 *
 * Use coverageNote for a human-readable explanation of what this metric means.
 */
export interface V1BaselineCoverage {
  score: number;
  quality: V1BaselineCoverageQuality;
  historicalDataPoints: number;
  /** Plain-language description of what this metric represents. */
  coverageNote: string;
}

export interface V1RiskAssessment {
  /** NOAA / partner station identifier. */
  stationId: string;
  /** ISO 8601 timestamp of when this assessment was computed. */
  evaluatedAt: string;
  /** Overall risk classification for this station right now. */
  riskLevel: V1RiskLevel;
  /** Plain-language summary of the dominant risk drivers. */
  summary: string;
  /** Most-recent sensor readings. */
  conditions: V1Conditions;
  /**
   * Active threshold alerts. Empty array means no limits are currently exceeded.
   * Statistical baseline anomalies (where no hard limit was crossed) are
   * captured in `signals` via anomalyScore instead.
   */
  alerts: V1Alert[];
  /** Per-metric anomaly context, including CRW-derived SST anomaly when available. */
  signals: V1Signal[];
  /**
   * Baseline data coverage — reflects how many historical observations are
   * available for this station, not a probability estimate.
   */
  baselineCoverage: V1BaselineCoverage;
}

// ─── Mapping helpers ──────────────────────────────────────────────────────────

const METRIC_META: Record<
  RiskSignalSummary["field"],
  { metric: V1Signal["metric"]; unit: V1Signal["unit"] }
> = {
  seaSurfaceTempC: { metric: "sea_surface_temperature", unit: "°C" },
  waveHeightM: { metric: "wave_height", unit: "m" },
  windSpeedMps: { metric: "wind_speed", unit: "m/s" },
  pressureHpa: { metric: "pressure", unit: "hPa" },
  salinityPsu: { metric: "salinity", unit: "psu" },
  dissolvedOxygenMgL: { metric: "dissolved_oxygen", unit: "mg/L" },
  crwSstAnomalyC: { metric: "crw_sst_anomaly", unit: "°C" },
};

function toDirection(zScore: number | null): V1SignalDirection {
  if (zScore === null) return "normal";
  if (zScore >= 0.5) return "above_normal";
  if (zScore <= -0.5) return "below_normal";
  return "normal";
}

function toV1Signal(signal: RiskSignalSummary): V1Signal {
  const meta = METRIC_META[signal.field];
  return {
    metric: meta.metric,
    unit: meta.unit,
    currentValue: signal.value,
    anomalyScore: signal.zScore,
    direction: toDirection(signal.zScore),
  };
}

/** Threshold alerts only — baseline-only anomaly titles start with "Baseline anomaly". */
function toV1Alert(rule: RiskTriggeredRule): V1Alert {
  return {
    severity: rule.severity === "critical" ? "critical" : "warning",
    title: rule.title,
    detail: rule.detail ?? "",
  };
}

function isThresholdAlert(rule: RiskTriggeredRule): boolean {
  return !rule.title.startsWith("Baseline anomaly");
}

const COVERAGE_NOTE =
  "Reflects how many historical data points are available for this station. " +
  "Not a probability estimate — higher values mean the baseline is better established.";

// ─── Route builder ────────────────────────────────────────────────────────────

export function buildV1RiskRouteResponse(
  stationId: string,
): {
  status: 200 | 400 | 404 | 503;
  json: V1RiskAssessment | { message: string };
  headers: Record<string, string>;
} {
  const normalized = stationId.trim();

  if (normalized.length === 0) {
    return {
      status: 400,
      json: { message: "stationId is required" },
      headers: {},
    };
  }

  const obsResult = readObservationHistory(normalized, BASELINE_WINDOW_DAYS);

  if (!obsResult.ok) {
    return {
      status: obsResult.status,
      json: { message: obsResult.message },
      headers: {},
    };
  }

  const analysis = buildRiskAnalysis(
    obsResult.current,
    obsResult.history,
    BASELINE_WINDOW_DAYS,
    obsResult.crwContext,
    obsResult.neighborContext,
  );

  return {
    status: 200,
    json: {
      stationId: normalized,
      evaluatedAt: new Date().toISOString(),
      riskLevel: analysis.overallRisk === "unknown" ? "low" : analysis.overallRisk,
      summary: analysis.operatorSummary,
      conditions: {
        observedAt: obsResult.current.sourceTimestamp,
        seaSurfaceTemperatureC: obsResult.current.seaSurfaceTempC,
        waveHeightM: obsResult.current.waveHeightM,
        windSpeedMps: obsResult.current.windSpeedMps,
        pressureHpa: obsResult.current.pressureHpa,
      },
      alerts: analysis.triggeredRules.filter(isThresholdAlert).map(toV1Alert),
      signals: analysis.signals.map(toV1Signal),
      baselineCoverage: {
        score: analysis.confidenceScore,
        quality: analysis.baselineQuality,
        historicalDataPoints: analysis.sampleSize,
        coverageNote: COVERAGE_NOTE,
      },
    },
    headers: {
      "X-Marine-Risk-API": "public-read-only",
      "X-Data-Source": "NOAA_NDBC",
    },
  };
}

// ─── Route definition ─────────────────────────────────────────────────────────

export const getV1RiskRoute: RouteDefinition<
  V1RiskAssessment | { message: string },
  { stationId: string }
> = {
  method: "GET",
  path: "/v1/risk/:stationId",
  handler(request) {
    return buildV1RiskRouteResponse(request.body.stationId);
  },
};
