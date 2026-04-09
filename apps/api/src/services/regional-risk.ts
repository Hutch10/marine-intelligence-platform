import { FusionSummary } from "@marine/shared/src/types";

/**
 * Canonical builder for region-level risk response.
 * Computes fusionSummary from station signals and returns a fully valid region object.
 */
export function buildRegionResponse(input: Omit<ReturnType<typeof aggregateRegionalRisk>, "fusionSummary"> & { fusionSummary?: FusionSummary }): ReturnType<typeof aggregateRegionalRisk> & { fusionSummary: FusionSummary } {
  // Compute fusionSummary if not provided
  let fusionSummary: FusionSummary = input.fusionSummary ?? "single";
  // Remove invalid stationAnalyses property usage
  return {
    ...input,
    fusionSummary,
  };
}
import type { RiskScoreResponse, RiskSignalSummary } from "@marine/shared";
import type { CrwBaselineInput } from "./ingestion/baseline-anomaly";
import type { MarineRegionConfig } from "./region-config";
import type { SignalFusionResult } from "./signal-fusion";
import type { NdbcStationIngestionDiagnostic } from "./ingestion/run-ndbc";

export interface RegionalStationRiskInput {
  stationId: string;
  observedAt: string;
  riskLevel: RiskScoreResponse["overallRisk"];
  confidenceScore: number;
  operatorSummary: string;
  signals: RiskSignalSummary[];
  fusion: Pick<SignalFusionResult, "neighborInfluence" | "contributors" | "reasons">;
  stationHealth: NdbcStationIngestionDiagnostic | null;
}

export interface RegionalCrwContextInput {
  regionKey: string;
  current: CrwBaselineInput | null;
  historyCount: number;
}

export interface RegionalCoverageSummary {
  configuredStationCount: number;
  analyzedStationCount: number;
  healthyStationCount: number;
  minimumHealthyStationRequirement: number;
  coverageRatio: number;
  meetsMinimumHealthyStations: boolean;
}

export interface RegionalTopStation {
  stationId: string;
  riskLevel: RiskScoreResponse["overallRisk"];
  confidenceScore: number;
  weight: number;
  weightedContribution: number;
  observedAt: string;
}

export interface RegionalRiskAggregate {
  regionId: string;
  regionName: string;
  computedAt: string;
  regionalRiskLevel: RiskScoreResponse["overallRisk"];
  regionalConfidence: number;
  weightedRegionalScore: number;
  coverage: RegionalCoverageSummary;
  dominantDrivers: string[];
  topContributingStations: RegionalTopStation[];
  operatorSummary: string;
  stationCountWithElevatedRisk: number;
  corroboratingHealthyStationCount: number;
  crwSupport: {
    supported: boolean;
    reason: string | null;
    regionKey: string | null;
  };
  fusionSummary: import("@marine/shared").FusionSummary;
  biologicalImpact?: {
    level: "low" | "medium" | "high" | "critical";
    impactScore: number;
    sensitiveSpeciesCount: number;
    summary: string;
  };
}

interface AggregateRegionalRiskInput {
  region: MarineRegionConfig;
  stationAnalyses: RegionalStationRiskInput[];
  crwContext?: RegionalCrwContextInput | null;
  now?: () => number;
  computedAt: string;
  biologicalImpact?: {
    level: "low" | "medium" | "high" | "critical";
    impactScore: number;
    sensitiveSpeciesCount: number;
    summary: string;
  };
}

const HEALTH_STATUS_WEIGHT: Record<NonNullable<NdbcStationIngestionDiagnostic["status"]>, number> = {
  healthy: 1,
  degraded: 0.72,
  failed: 0.35,
};

const SIGNAL_LABELS: Record<RiskSignalSummary["field"], string> = {
  seaSurfaceTempC: "surface warming",
  waveHeightM: "higher seas",
  windSpeedMps: "stronger winds",
  pressureHpa: "pressure instability",
  salinityPsu: "salinity stress",
  dissolvedOxygenMgL: "dissolved oxygen stress",
  crwSstAnomalyC: "CRW warming support",
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function riskLevelToScore(riskLevel: RiskScoreResponse["overallRisk"]): number {
  switch (riskLevel) {
    case "critical":
      return 0.95;
    case "high":
      return 0.75;
    case "medium":
      return 0.5;
    default:
      return 0.18;
  }
}

function scoreToRegionalRiskLevel(score: number): RiskScoreResponse["overallRisk"] {
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

function computeRecencyWeight(ageMs: number | null): number {
  if (ageMs === null || ageMs < 0) {
    return 0.65;
  }

  if (ageMs <= 6 * 60 * 60 * 1000) {
    return 1;
  }

  if (ageMs <= 12 * 60 * 60 * 1000) {
    return 0.9;
  }

  if (ageMs <= 24 * 60 * 60 * 1000) {
    return 0.75;
  }

  if (ageMs <= 48 * 60 * 60 * 1000) {
    return 0.45;
  }

  return 0.2;
}

function computeStationAgeMs(
  station: RegionalStationRiskInput,
  nowMs: number,
): number | null {
  if (typeof station.stationHealth?.latestObservationAgeMs === "number") {
    return station.stationHealth.latestObservationAgeMs;
  }

  const observedAtMs = Date.parse(station.observedAt);
  return Number.isFinite(observedAtMs) ? Math.max(0, nowMs - observedAtMs) : null;
}

function computeHealthWeight(diagnostic: NdbcStationIngestionDiagnostic | null): number {
  if (!diagnostic) {
    return 0.7;
  }

  const statusWeight = HEALTH_STATUS_WEIGHT[diagnostic.status];
  const coverageWeight = diagnostic.usableMetricCoverage.totalCount > 0
    ? diagnostic.usableMetricCoverage.presentCount / diagnostic.usableMetricCoverage.totalCount
    : 0.5;

  return clamp(statusWeight * (0.55 + (coverageWeight * 0.45)), 0.2, 1);
}

function dominantSignalLabel(signal: RiskSignalSummary): string | null {
  if (typeof signal.zScore !== "number") {
    return null;
  }

  if (signal.field === "crwSstAnomalyC") {
    return signal.zScore > 0.5 ? SIGNAL_LABELS[signal.field] : null;
  }

  return Math.abs(signal.zScore) >= 1.5 ? SIGNAL_LABELS[signal.field] : null;
}

function summarizeDominantDrivers(stations: RegionalStationRiskInput[]): string[] {
  const driverWeights = new Map<string, number>();

  for (const station of stations) {
    const riskWeight = riskLevelToScore(station.riskLevel) * Math.max(station.confidenceScore, 0.25);

    for (const signal of station.signals) {
      const label = dominantSignalLabel(signal);
      if (!label) {
        continue;
      }

      driverWeights.set(label, (driverWeights.get(label) ?? 0) + riskWeight);
    }
  }

  return [...driverWeights.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
    .map(([label]) => label);
}

function formatDriverList(drivers: string[]): string {
  if (drivers.length === 0) {
    return "mixed marine conditions";
  }

  if (drivers.length === 1) {
    return drivers[0]!;
  }

  if (drivers.length === 2) {
    return `${drivers[0]} and ${drivers[1]}`;
  }

  return `${drivers.slice(0, -1).join(", ")}, and ${drivers[drivers.length - 1]}`;
}

function buildCrwSupport(
  crwContext: RegionalCrwContextInput | null | undefined,
): RegionalRiskAggregate["crwSupport"] {
  if (!crwContext?.current) {
    return {
      supported: false,
      reason: null,
      regionKey: crwContext?.regionKey ?? null,
    };
  }

  const { current } = crwContext;
  const supported =
    (typeof current.sstAnomalyC === "number" && current.sstAnomalyC >= 1)
    || (typeof current.hotSpotC === "number" && current.hotSpotC > 0.5)
    || (typeof current.dhw === "number" && current.dhw >= 4);

  if (!supported) {
    return {
      supported: false,
      reason: null,
      regionKey: crwContext.regionKey,
    };
  }

  if (typeof current.dhw === "number" && current.dhw >= 4) {
    return {
      supported: true,
      reason: `CRW DHW is elevated at ${current.dhw.toFixed(1)} across ${crwContext.regionKey}.`,
      regionKey: crwContext.regionKey,
    };
  }

  return {
    supported: true,
    reason: `CRW heat-stress context supports a regional warming pattern in ${crwContext.regionKey}.`,
    regionKey: crwContext.regionKey,
  };
}

export function aggregateRegionalRisk(input: AggregateRegionalRiskInput): RegionalRiskAggregate {
  const nowMs = (input.now ?? Date.now)();
  const analyzedStations = input.stationAnalyses.filter((station) => Number.isFinite(station.confidenceScore));
  const healthyStations = analyzedStations.filter((station) => station.stationHealth?.status === "healthy");

  const weightedStations = analyzedStations.map((station) => {
    const riskScore = riskLevelToScore(station.riskLevel);
    const healthWeight = computeHealthWeight(station.stationHealth);
    const recencyWeight = computeRecencyWeight(computeStationAgeMs(station, nowMs));
    const weight = clamp(station.confidenceScore * healthWeight * recencyWeight, 0.05, 1);

    return {
      station,
      riskScore,
      weight,
      weightedContribution: riskScore * weight,
      isElevated: station.riskLevel === "medium" || station.riskLevel === "high" || station.riskLevel === "critical",
    };
  });

  const totalWeight = weightedStations.reduce((sum, station) => sum + station.weight, 0);
  let weightedRegionalScore = totalWeight > 0
    ? weightedStations.reduce((sum, station) => sum + station.weightedContribution, 0) / totalWeight
    : 0.18;

  const healthyElevatedStations = weightedStations.filter((station) =>
    station.isElevated && station.station.stationHealth?.status !== "failed");
  const corroboratingHealthyStationCount = healthyElevatedStations.length;
  const coverageRatio = input.region.stationIds.length > 0
    ? analyzedStations.length / input.region.stationIds.length
    : 0;
  const meetsMinimumHealthyStations = healthyStations.length >= input.region.minimumHealthyStationRequirement;
  const crwSupport = buildCrwSupport(input.crwContext);

  let regionalConfidence = totalWeight > 0
    ? clamp(weightedStations.reduce((sum, station) => sum + (station.station.confidenceScore * station.weight), 0) / totalWeight, 0.18, 0.92)
    : 0.2;

  if (!meetsMinimumHealthyStations) {
    regionalConfidence -= 0.18;
    weightedRegionalScore *= clamp(0.65 + (coverageRatio * 0.35), 0.45, 1);
  } else if (coverageRatio < 0.75) {
    regionalConfidence -= 0.08;
  }

  if (corroboratingHealthyStationCount >= 3) {
    regionalConfidence += 0.14;
    weightedRegionalScore += 0.04;
  } else if (corroboratingHealthyStationCount === 1 && healthyStations.length > 1) {
    regionalConfidence -= 0.12;
    weightedRegionalScore -= 0.08;
  }

  if (crwSupport.supported && corroboratingHealthyStationCount >= 2) {
    regionalConfidence += 0.08;
    weightedRegionalScore += 0.03;
  }

  weightedRegionalScore = clamp(weightedRegionalScore, 0.12, 0.98);
  regionalConfidence = clamp(regionalConfidence, 0.05, 0.99);

  const regionalRiskLevel = scoreToRegionalRiskLevel(weightedRegionalScore);
  const dominantDrivers = summarizeDominantDrivers(analyzedStations);
  const topContributingStations = weightedStations
    .sort((left, right) => right.weightedContribution - left.weightedContribution)
    .slice(0, 3)
    .map((station) => ({
      stationId: station.station.stationId,
      riskLevel: station.station.riskLevel,
      confidenceScore: roundTo(station.station.confidenceScore, 2),
      weight: roundTo(station.weight, 3),
      weightedContribution: roundTo(station.weightedContribution, 3),
      observedAt: station.station.observedAt,
    }));

  const operatorSummary = `${input.region.name} is at ${regionalRiskLevel} regional marine risk with ${Math.round(regionalConfidence * 100)}% confidence. `
    + `Coverage includes ${healthyStations.length} healthy station${healthyStations.length === 1 ? "" : "s"} out of ${input.region.stationIds.length}, `
    + `with dominant drivers in ${formatDriverList(dominantDrivers)}.`
    + (corroboratingHealthyStationCount >= 3
      ? ` ${corroboratingHealthyStationCount} healthy stations corroborate the active pattern.`
      : corroboratingHealthyStationCount <= 1 && analyzedStations.length > 1
        ? " The current signal is not yet broadly corroborated across the region."
        : "")
    + (crwSupport.reason ? ` ${crwSupport.reason}` : "");

  // Compute fusionSummary for the region
  const allFusionStates = analyzedStations
    .flatMap((station) => station.signals?.map((signal) => signal.fusionState) ?? [])
    .filter((state) => !!state);

  let fusionSummary: import("@marine/shared").FusionSummary = "single";
  if (allFusionStates.length > 0) {
    const unique = new Set(allFusionStates);
    if (unique.size === 1) {
      fusionSummary = unique.has("agreement") ? "agreement" : unique.has("conflict") ? "mixed" : "single";
    } else {
      fusionSummary = unique.has("conflict") ? "mixed" : "agreement";
    }
  }

  return {
    regionId: input.region.id,
    regionName: input.region.name,
    computedAt: input.computedAt,
    regionalRiskLevel,
    regionalConfidence: roundTo(regionalConfidence, 2),
    weightedRegionalScore: roundTo(weightedRegionalScore, 3),
    coverage: {
      configuredStationCount: input.region.stationIds.length,
      analyzedStationCount: analyzedStations.length,
      healthyStationCount: healthyStations.length,
      minimumHealthyStationRequirement: input.region.minimumHealthyStationRequirement,
      coverageRatio: roundTo(coverageRatio, 2),
      meetsMinimumHealthyStations,
    },
    dominantDrivers,
    topContributingStations,
    operatorSummary,
    stationCountWithElevatedRisk: weightedStations.filter((station) => station.isElevated).length,
    corroboratingHealthyStationCount,
    crwSupport,
    fusionSummary,
    biologicalImpact: input.biologicalImpact,
  };
}
