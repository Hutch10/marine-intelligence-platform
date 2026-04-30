import type { RouteDefinition } from "../types";
import {
  buildRegionRiskScoreRouteResponse,
  type InternalRegionRiskScoreResponse,
} from "./region-risk";
import { buildRegionalRiskTrend } from "../services/regional-risk-trend";
import { listRecentRegionalRiskSnapshots } from "../repositories/regional-risk-snapshots";

interface RegionRiskTrendRouteParams {
  regionId: string;
}

export interface InternalRegionRiskTrendResponse {
  region_id: string;
  region_name: string;
  computed_at: string;
  current: {
    risk_level: "low" | "medium" | "high" | "critical" | "unknown" | "insufficient_data" | "conflicting_signals";
    confidence_score: number;
    weighted_score: number;
    coverage: InternalRegionRiskScoreResponse["coverage"];
    dominant_drivers: string[];
    corroborating_healthy_station_count: number;
    crw_support: InternalRegionRiskScoreResponse["crw_support"];
    operator_summary: string;
  };
  trend: {
    direction: "rising" | "falling" | "stable";
    strength: "weak" | "moderate" | "strong";
    delta_score: number;
    persistence: number;
    prior_6h_score: number | null;
    prior_12h_score: number | null;
    prior_24h_score: number | null;
  };
  forecast: {
    next_12h: {
      risk_level: "low" | "medium" | "high" | "critical" | "unknown";
      projected_score: number;
      confidence: number;
    };
    next_24h: {
      risk_level: "low" | "medium" | "high" | "critical" | "unknown";
      projected_score: number;
      confidence: number;
    };
  };
  operator_summary: string;
}

interface RegionRiskTrendRouteDependencies {
  buildScoreResponse?: typeof buildRegionRiskScoreRouteResponse;
  listSnapshots?: typeof listRecentRegionalRiskSnapshots;
  now?: () => number;
}

export async function buildRegionRiskTrendRouteResponse(
  regionId: string,
  dependencies: RegionRiskTrendRouteDependencies = {},
): Promise<{ status: 200 | 404 | 503; json: InternalRegionRiskTrendResponse | { message: string } }> {
  const buildScoreResponse = dependencies.buildScoreResponse ?? buildRegionRiskScoreRouteResponse;
  const scoreResponse = await buildScoreResponse(regionId);

  if (scoreResponse.status !== 200) {
    return {
      status: scoreResponse.status,
      json: scoreResponse.json as { message: string },
    };
  }

  const current = scoreResponse.json as InternalRegionRiskScoreResponse;
  const computedAtMs = Date.parse(current.computed_at);
  const snapshotsResult = (dependencies.listSnapshots ?? listRecentRegionalRiskSnapshots)(
    current.region_id,
    computedAtMs - (24 * 60 * 60 * 1000),
    48,
  );
  const history = snapshotsResult.source === "db"
    ? snapshotsResult.snapshots.filter((snapshot) => snapshot.computedAt !== current.computed_at)
    : [];
  const trend = buildRegionalRiskTrend({
    current,
    history,
  });

  return {
    status: 200,
    json: {
      region_id: current.region_id,
      region_name: current.region_name,
      computed_at: current.computed_at,
      current: {
        risk_level: current.risk_level,
        confidence_score: current.confidence_score,
        weighted_score: current.weighted_score,
        coverage: current.coverage,
        dominant_drivers: current.dominant_drivers,
        corroborating_healthy_station_count: current.corroborating_healthy_station_count,
        crw_support: current.crw_support,
        operator_summary: current.operator_summary,
      },
      trend: {
        direction: trend.trendDirection,
        strength: trend.trendStrength,
        delta_score: trend.deltaScore,
        persistence: trend.persistence,
        prior_6h_score: trend.prior6hScore,
        prior_12h_score: trend.prior12hScore,
        prior_24h_score: trend.prior24hScore,
      },
      forecast: {
        next_12h: {
          risk_level: trend.next12h.riskLevel,
          projected_score: trend.next12h.projectedScore,
          confidence: trend.next12h.confidence,
        },
        next_24h: {
          risk_level: trend.next24h.riskLevel,
          projected_score: trend.next24h.projectedScore,
          confidence: trend.next24h.confidence,
        },
      },
      operator_summary: trend.operatorSummary,
    },
  };
}

export const getRegionRiskTrendRoute: RouteDefinition<
  InternalRegionRiskTrendResponse | { message: string },
  RegionRiskTrendRouteParams
> = {
  method: "GET",
  path: "/regions/:regionId/risk/trend",
  async handler(request) {
    return buildRegionRiskTrendRouteResponse(request.body.regionId);
  },
};
