import type { RouteDefinition } from "../types";
import {
  buildRiskAnalysis,
  readObservationHistory,
} from "./risk";
import { buildRegionResponse } from "../services/regional-risk";
import {
  getMarineRegionConfig,
  type MarineRegionConfig,
} from "../services/region-config";
import {
  aggregateRegionalRisk,
  type RegionalCrwContextInput,
  type RegionalStationRiskInput,
} from "../services/regional-risk";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import {
  listLatestLiveIngestionStatusBySource,
  type LiveIngestionLatestStatusReadResult,
} from "../repositories/live-ingestion-reports";
import { persistRegionalRiskSnapshot } from "../repositories/regional-risk-snapshots";
import {
  readRecentCrwRiskHistoryFromDb,
  type CrwRiskHistoryItem,
} from "../repositories/reef-stress";
import { calculateRegionalImpact } from "../services/species-intelligence/regional-impact";
import type { NdbcStationIngestionDiagnostic } from "../services/ingestion/run-ndbc";

const REGION_BASELINE_WINDOW_DAYS = 45;
const REGION_CONTEXT_LOOKBACK_DAYS = 365;
const MAX_REGION_HISTORY_POINTS = 500;

interface RegionRiskScoreRouteParams {
  regionId: string;
}

interface InternalRegionCoverageResponse {
  configured_station_count: number;
  analyzed_station_count: number;
  healthy_station_count: number;
  minimum_healthy_station_requirement: number;
  coverage_ratio: number;
  meets_minimum_healthy_stations: boolean;
}

interface InternalRegionTopStationResponse {
  station_id: string;
  risk_level: "low" | "medium" | "high" | "critical" | "unknown";
  confidence_score: number;
  weight: number;
  weighted_contribution: number;
  observed_at: string;
}

interface InternalRegionStationResponse {
  station_id: string;
  risk_level: "low" | "medium" | "high" | "critical" | "unknown";
  confidence_score: number;
  observed_at: string;
  neighbor_influence: "none" | "supporting" | "isolated" | "mixed";
  health_status: "healthy" | "degraded" | "failed" | "unknown";
  operator_summary: string;
}

export interface InternalRegionRiskScoreResponse {
  region_id: string;
  region_name: string;
  computed_at: string;
  risk_level: "low" | "medium" | "high" | "critical" | "unknown";
  confidence_score: number;
  weighted_score: number;
  coverage: InternalRegionCoverageResponse;
  dominant_drivers: string[];
  top_contributing_stations: InternalRegionTopStationResponse[];
  station_count_with_elevated_risk: number;
  corroborating_healthy_station_count: number;
  crw_support: {
    supported: boolean;
    reason: string | null;
    region_key: string | null;
  };
  operator_summary: string;
  stations: InternalRegionStationResponse[];
  biological_impact?: {
    level: "low" | "medium" | "high" | "critical";
    impact_score: number;
    sensitive_species_count: number;
    summary: string;
  };
}

type ReadRegionRiskSnapshotResult = {
  ok: true;
  region: MarineRegionConfig;
  stationAnalyses: RegionalStationRiskInput[];
  crwContext: RegionalCrwContextInput | null;
} | {
  ok: false;
  status: 404 | 503;
  message: string;
};

interface RegionRiskRouteDependencies {
  getRegionConfig?: typeof getMarineRegionConfig;
  readStationHistory?: typeof readObservationHistory;
  buildStationRiskAnalysis?: typeof buildRiskAnalysis;
  listLatestStatusBySource?: typeof listLatestLiveIngestionStatusBySource;
  persistSnapshot?: typeof persistRegionalRiskSnapshot;
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  readCrwHistory?: typeof readRecentCrwRiskHistoryFromDb;
  now?: () => number;
}

function normalizeRegionId(value: string): string {
  return value.trim().toLowerCase();
}

function toStationHealthMap(
  readResult: LiveIngestionLatestStatusReadResult,
): Map<string, NdbcStationIngestionDiagnostic> {
  if (readResult.source !== "db") {
    return new Map<string, NdbcStationIngestionDiagnostic>();
  }

  const latestNdbc = readResult.latest.find((item) => item.source === "noaa_ndbc");

  return new Map((latestNdbc?.stationDiagnostics ?? []).map((diagnostic) => [diagnostic.stationId, diagnostic]));
}

function toRegionalCrwContextItem(item: CrwRiskHistoryItem) {
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

function readRegionalCrwContext(
  region: MarineRegionConfig,
  dependencies: RegionRiskRouteDependencies,
  nowMs: number,
): RegionalCrwContextInput | null {
  if (!region.crwRegionKey) {
    return null;
  }

  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const readCrwHistory = dependencies.readCrwHistory ?? readRecentCrwRiskHistoryFromDb;
  const dbPath = resolvePath();

  if (!hasPath(dbPath)) {
    return null;
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(dbPath);
  } catch {
    return null;
  }

  try {
    const sinceObservedAt = nowMs - (REGION_CONTEXT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const history = readCrwHistory(db, sinceObservedAt, MAX_REGION_HISTORY_POINTS)
      .filter((item) => item.regionKey === region.crwRegionKey)
      .map(toRegionalCrwContextItem);

    return {
      regionKey: region.crwRegionKey,
      current: history[0] ?? null,
      historyCount: history.length,
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export function readRegionRiskSnapshot(
  regionId: string,
  dependencies: RegionRiskRouteDependencies = {},
): ReadRegionRiskSnapshotResult {
  const nowMs = (dependencies.now ?? Date.now)();
  const getRegionConfig = dependencies.getRegionConfig ?? getMarineRegionConfig;
  const readStationHistory = dependencies.readStationHistory ?? readObservationHistory;
  const buildStationRiskAnalysis = dependencies.buildStationRiskAnalysis ?? buildRiskAnalysis;
  const region = getRegionConfig(normalizeRegionId(regionId));

  if (!region) {
    return {
      ok: false,
      status: 404,
      message: `Unknown region ${regionId}`,
    };
  }

  const stationHealthMap = toStationHealthMap(
    (dependencies.listLatestStatusBySource ?? listLatestLiveIngestionStatusBySource)(),
  );

  const stationAnalyses: RegionalStationRiskInput[] = [];

  for (const stationId of region.stationIds) {
    const historyResult = readStationHistory(stationId, REGION_BASELINE_WINDOW_DAYS);

    if (!historyResult.ok) {
      continue;
    }

    const analysis = buildStationRiskAnalysis(
      historyResult.current,
      historyResult.history,
      REGION_BASELINE_WINDOW_DAYS,
      historyResult.crwContext,
      historyResult.neighborContext,
    );

    stationAnalyses.push({
      stationId,
      observedAt: historyResult.current.sourceTimestamp,
      riskLevel: analysis.overallRisk === "unknown" ? "low" : analysis.overallRisk,
      confidenceScore: analysis.confidenceScore,
      operatorSummary: analysis.operatorSummary,
      signals: analysis.signals,
      fusion: {
        neighborInfluence: analysis.fusion.neighborInfluence,
        contributors: analysis.fusion.contributors,
        reasons: analysis.fusion.reasons,
      },
      stationHealth: stationHealthMap.get(stationId) ?? null,
    });
  }

  if (stationAnalyses.length === 0) {
    return {
      ok: false,
      status: 503,
      message: `No station risk analyses were available for region ${region.name}`,
    };
  }

  return {
    ok: true,
    region,
    stationAnalyses,
    crwContext: readRegionalCrwContext(region, dependencies, nowMs),
  };
}


function mapRegionAggregateToInternalResponse(
  aggregate: ReturnType<typeof aggregateRegionalRisk>,
  computedAt: string,
  stationAnalyses: RegionalStationRiskInput[],
): InternalRegionRiskScoreResponse {
  return {
    region_id: aggregate.regionId,
    region_name: aggregate.regionName,
    computed_at: computedAt,
    risk_level: aggregate.regionalRiskLevel,
    confidence_score: aggregate.regionalConfidence,
    weighted_score: aggregate.weightedRegionalScore,
    coverage: {
      configured_station_count: aggregate.coverage.configuredStationCount,
      analyzed_station_count: aggregate.coverage.analyzedStationCount,
      healthy_station_count: aggregate.coverage.healthyStationCount,
      minimum_healthy_station_requirement: aggregate.coverage.minimumHealthyStationRequirement,
      coverage_ratio: aggregate.coverage.coverageRatio,
      meets_minimum_healthy_stations: aggregate.coverage.meetsMinimumHealthyStations,
    },
    dominant_drivers: aggregate.dominantDrivers,
    top_contributing_stations: aggregate.topContributingStations.map((s) => ({
      station_id: s.stationId,
      risk_level: s.riskLevel,
      confidence_score: s.confidenceScore,
      weight: s.weight,
      weighted_contribution: s.weightedContribution,
      observed_at: s.observedAt,
    })),
    station_count_with_elevated_risk: aggregate.stationCountWithElevatedRisk,
    corroborating_healthy_station_count: aggregate.corroboratingHealthyStationCount,
    crw_support: {
      supported: aggregate.crwSupport.supported,
      reason: aggregate.crwSupport.reason,
      region_key: aggregate.crwSupport.regionKey,
    },
    operator_summary: aggregate.operatorSummary,
    stations: stationAnalyses.map((s) => ({
      station_id: s.stationId,
      risk_level: s.riskLevel,
      confidence_score: s.confidenceScore,
      observed_at: s.observedAt,
      neighbor_influence: s.fusion.neighborInfluence,
      health_status: s.stationHealth?.status ?? "unknown",
      operator_summary: s.operatorSummary,
    })),
    biological_impact: aggregate.biologicalImpact ? {
      level: aggregate.biologicalImpact.level,
      impact_score: aggregate.biologicalImpact.impactScore,
      sensitive_species_count: aggregate.biologicalImpact.sensitiveSpeciesCount,
      summary: aggregate.biologicalImpact.summary,
    } : undefined,
  };
}

export function buildRegionRiskScoreRouteResponse(
  regionId: string,
  dependencies: RegionRiskRouteDependencies = {},
): { status: 200 | 404 | 503; json: InternalRegionRiskScoreResponse | { message: string } } {
  const computedAt = new Date((dependencies.now ?? Date.now)()).toISOString();
  const snapshot = readRegionRiskSnapshot(regionId, dependencies);

  if (!snapshot.ok) {
    return {
      status: snapshot.status,
      json: { message: snapshot.message },
    };
  }
  const aggregate = aggregateRegionalRisk(snapshot.stationAnalyses, {
    regionId,
    regionName: snapshot.regionName,
    computedAt,
  });

  const impact = calculateRegionalImpact(regionId, aggregate.weightedRegionalScore);
  
  const finalAggregate = {
    ...aggregate,
    biologicalImpact: {
      level: impact.biologicalImpactLevel,
      impactScore: impact.impactScore,
      sensitiveSpeciesCount: impact.sensitiveSpeciesCount,
      summary: impact.summary,
    }
  };

  const responseJson = mapRegionAggregateToInternalResponse(
    finalAggregate,
    computedAt,
    snapshot.stationAnalyses,
  );

  (dependencies.persistSnapshot ?? persistRegionalRiskSnapshot)({
    regionId: aggregate.regionId,
    regionName: aggregate.regionName,
    computedAt,
    regionalRiskLevel: aggregate.regionalRiskLevel,
    regionalConfidence: aggregate.regionalConfidence,
    weightedRegionalScore: aggregate.weightedRegionalScore,
    healthyStationCount: aggregate.coverage.healthyStationCount,
    analyzedStationCount: aggregate.coverage.analyzedStationCount,
    stationCountWithElevatedRisk: aggregate.stationCountWithElevatedRisk,
    corroboratingHealthyStationCount: aggregate.corroboratingHealthyStationCount,
    dominantDrivers: aggregate.dominantDrivers,
    crwSupported: aggregate.crwSupport.supported,
    operatorSummary: aggregate.operatorSummary,
  });

  return {
    status: 200,
    json: responseJson,
  };
}

export const getRegionRiskScoreRoute: RouteDefinition<
  InternalRegionRiskScoreResponse | { message: string },
  RegionRiskScoreRouteParams
> = {
  method: "GET",
  path: "/regions/:regionId/risk/score",
  handler(request) {
    return buildRegionRiskScoreRouteResponse(request.body.regionId);
  },
};
