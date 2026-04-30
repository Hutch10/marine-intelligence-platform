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
import { getAsyncAdapter, type AsyncDbAdapter } from "../db/async-client";
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
  risk_level: "low" | "medium" | "high" | "critical" | "unknown" | "insufficient_data" | "conflicting_signals";
  confidence_score: number;
  weight: number;
  weighted_contribution: number;
  observed_at: string;
}

interface InternalRegionStationResponse {
  station_id: string;
  risk_level: "low" | "medium" | "high" | "critical" | "unknown" | "insufficient_data" | "conflicting_signals";
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
  risk_level: "low" | "medium" | "high" | "critical" | "unknown" | "insufficient_data" | "conflicting_signals";
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

type QueryableDb = Pick<SqliteDatabaseLike, "prepare">;

interface TruthSurfaceValidation {
  regionExists: boolean;
  truthBackedStationIds: string[];
}

function normalizeRegionId(value: string): string {
  return value.trim().toLowerCase();
}

function shouldRequireDbBackedTruthEntities(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  return String(process.env.MARINE_ALLOW_CONFIG_ONLY_TRUTH_ENTITIES ?? "false").trim().toLowerCase() !== "true";
}

function hasAnyRows(db: QueryableDb, sql: string, params: unknown[]): boolean {
  try {
    const rows = db.prepare(sql).all(...params) as Array<Record<string, unknown>>;
    return rows.length > 0;
  } catch {
    return false;
  }
}

function hasFieldTruthLineageEvidence(db: QueryableDb, stationId: string): boolean {
  return hasAnyRows(
    db,
    `SELECT 1
     FROM observations
     WHERE station_id = ?
       AND truth_partition = 'FIELD_TRUTH'
       AND source IS NOT NULL
       AND TRIM(source) <> ''
       AND source_reference IS NOT NULL
       AND TRIM(source_reference) <> ''
     LIMIT 1`,
    [stationId],
  ) || hasAnyRows(
    db,
    `SELECT 1
     FROM station_metrics
     WHERE station_id = ?
       AND truth_partition = 'FIELD_TRUTH'
       AND source IS NOT NULL
       AND TRIM(source) <> ''
       AND source_reference IS NOT NULL
       AND TRIM(source_reference) <> ''
     LIMIT 1`,
    [stationId],
  ) || hasAnyRows(
    db,
    `SELECT 1
     FROM derived_signals
     WHERE station_id = ?
       AND truth_partition = 'FIELD_TRUTH'
       AND source IS NOT NULL
       AND TRIM(source) <> ''
       AND source_reference IS NOT NULL
       AND TRIM(source_reference) <> ''
     LIMIT 1`,
    [stationId],
  ) || hasAnyRows(
    db,
    `SELECT 1
     FROM signal_detections
     WHERE station_id = ?
       AND truth_partition = 'FIELD_TRUTH'
       AND source_type IS NOT NULL
       AND TRIM(source_type) <> ''
       AND source_id IS NOT NULL
       AND TRIM(source_id) <> ''
     LIMIT 1`,
    [stationId],
  );
}

function validateRegionTruthSurface(
  db: QueryableDb,
  region: MarineRegionConfig,
): TruthSurfaceValidation {
  const regionExists = hasAnyRows(
    db,
    "SELECT 1 FROM regions WHERE LOWER(id) = LOWER(?) LIMIT 1",
    [region.id],
  );

  if (!regionExists) {
    return { regionExists: false, truthBackedStationIds: [] };
  }

  const truthBackedStationIds = region.stationIds.filter((stationId) => {
    const stationExists = hasAnyRows(
      db,
      `SELECT 1
       FROM stations
       WHERE id = ?
         AND LOWER(region_id) = LOWER(?)
       LIMIT 1`,
      [stationId, region.id],
    );

    if (!stationExists) {
      return false;
    }

    return hasFieldTruthLineageEvidence(db, stationId);
  });

  return {
    regionExists: true,
    truthBackedStationIds,
  };
}

function normalizeSnapshotRiskLevel(
  riskLevel: InternalRegionRiskScoreResponse["risk_level"],
): "low" | "medium" | "high" | "critical" | "unknown" {
  return riskLevel === "insufficient_data" || riskLevel === "conflicting_signals"
    ? "unknown"
    : riskLevel;
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

async function readRegionalCrwContext(
  region: MarineRegionConfig,
  dependencies: RegionRiskRouteDependencies,
  nowMs: number,
): Promise<RegionalCrwContextInput | null> {
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
  let adapter: AsyncDbAdapter;

  try {
    db = openDatabase(dbPath);
    adapter = getAsyncAdapter(false);
  } catch {
    return null;
  }

  try {
    const sinceObservedAt = nowMs - (REGION_CONTEXT_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
    const history = await readCrwHistory(adapter, sinceObservedAt, MAX_REGION_HISTORY_POINTS);
    const filteredHistory = history
      .filter((item: CrwRiskHistoryItem) => item.regionKey === region.crwRegionKey)
      .map(toRegionalCrwContextItem);

    return {
      regionKey: region.crwRegionKey,
      current: filteredHistory[0] ?? null,
      historyCount: filteredHistory.length,
    };
  } catch {
    return null;
  } finally {
    if (db) db.close();
    if (adapter) await adapter.close();
  }
}

export async function readRegionRiskSnapshot(
  regionId: string,
  dependencies: RegionRiskRouteDependencies = {},
): Promise<ReadRegionRiskSnapshotResult> {
  const nowMs = (dependencies.now ?? Date.now)();
  const getRegionConfig = dependencies.getRegionConfig ?? getMarineRegionConfig;
  const readStationHistory = dependencies.readStationHistory ?? readObservationHistory;
  const buildStationRiskAnalysis = dependencies.buildStationRiskAnalysis ?? buildRiskAnalysis;
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const region = getRegionConfig(normalizeRegionId(regionId));

  if (!region) {
    return {
      ok: false,
      status: 404,
      message: `Unknown region ${regionId}`,
    };
  }

  const enforceTruthSurfaceChecks = shouldRequireDbBackedTruthEntities();
  let allowedStationIds = region.stationIds;

  if (enforceTruthSurfaceChecks) {
    const dbPath = resolvePath();

    if (!hasPath(dbPath)) {
      return {
        ok: false,
        status: 404,
        message: `Unknown region ${regionId}`,
      };
    }

    let db: SqliteDatabaseLike;

    try {
      db = openDatabase(dbPath);
    } catch {
      return {
        ok: false,
        status: 404,
        message: `Unknown region ${regionId}`,
      };
    }

    try {
      const validation = validateRegionTruthSurface(db, region);

      if (!validation.regionExists || validation.truthBackedStationIds.length === 0) {
        return {
          ok: false,
          status: 404,
          message: `Unknown region ${regionId}`,
        };
      }

      allowedStationIds = validation.truthBackedStationIds;
    } finally {
      db.close();
    }
  }

  const stationHealthMap = toStationHealthMap(
    (dependencies.listLatestStatusBySource ?? listLatestLiveIngestionStatusBySource)(),
  );

  const stationAnalyses: RegionalStationRiskInput[] = [];

  for (const stationId of allowedStationIds) {
    const historyResult = await readStationHistory(stationId, REGION_BASELINE_WINDOW_DAYS);

    if (!historyResult.ok) {
      continue;
    }

    const analysis = await buildStationRiskAnalysis(
      historyResult.current,
      historyResult.history,
      REGION_BASELINE_WINDOW_DAYS,
      historyResult.crwContext,
      historyResult.neighborContext,
      historyResult.erddapContext,
      historyResult.sourceAgreement,
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
    crwContext: await readRegionalCrwContext(region, dependencies, nowMs),
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

export async function buildRegionRiskScoreRouteResponse(
  regionId: string,
  dependencies: RegionRiskRouteDependencies = {},
): Promise<{ status: 200 | 404 | 503; json: InternalRegionRiskScoreResponse | { message: string } }> {
  const computedAt = new Date((dependencies.now ?? Date.now)()).toISOString();
  const snapshot = await readRegionRiskSnapshot(regionId, dependencies);

  if (!snapshot.ok) {
    return {
      status: snapshot.status,
      json: { message: snapshot.message },
    };
  }
  const aggregate = aggregateRegionalRisk({
    region: snapshot.region,
    stationAnalyses: snapshot.stationAnalyses,
    crwContext: snapshot.crwContext,
    computedAt,
  });

  const impact = await calculateRegionalImpact(regionId, aggregate.weightedRegionalScore);
  
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
    regionalRiskLevel: normalizeSnapshotRiskLevel(aggregate.regionalRiskLevel),
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
  async handler(request) {
    return buildRegionRiskScoreRouteResponse(request.body.regionId);
  },
};
