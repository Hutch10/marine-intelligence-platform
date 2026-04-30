import type { RouteDefinition } from "../types";
import {
  buildRegionRiskScoreRouteResponse,
  type InternalRegionRiskScoreResponse,
} from "./region-risk";

export type V1RegionRiskLevel = "low" | "medium" | "high" | "critical" | "unknown" | "insufficient_data";

interface V1RegionRiskResponse {
  regionId: string;
  regionName: string;
  evaluatedAt: string;
  riskLevel: V1RegionRiskLevel;
  summary: string;
  dominantDrivers: string[];
  topStations: Array<{
    stationId: string;
    riskLevel: "low" | "medium" | "high" | "critical" | "unknown";
  }>;
  coverage: {
    configuredStations: number;
    analyzedStations: number;
    healthyStations: number;
    minimumHealthyStations: number;
  };
  confidence: {
    score: number;
    quality: "high" | "medium" | "low";
  };
}

function confidenceQuality(score: number): "high" | "medium" | "low" {
  if (score >= 0.75) {
    return "high";
  }

  if (score >= 0.45) {
    return "medium";
  }

  return "low";
}

export async function buildV1RegionRiskRouteResponse(
  regionId: string,
  buildInternalResponse: typeof buildRegionRiskScoreRouteResponse = buildRegionRiskScoreRouteResponse,
): Promise<{
  status: 200 | 404 | 503;
  json: V1RegionRiskResponse | { message: string };
  headers: Record<string, string>;
}> {
  const response = await buildInternalResponse(regionId);

  if (response.status !== 200) {
    return {
      status: response.status,
      json: response.json as { message: string },
      headers: {},
    };
  }

  const score = response.json as InternalRegionRiskScoreResponse;
  const healthyStations = score.coverage.healthy_station_count;
  const minimumHealthyStations = score.coverage.minimum_healthy_station_requirement;
  const riskLevel: V1RegionRiskLevel = healthyStations < minimumHealthyStations
    ? "insufficient_data"
    : (score.risk_level === "conflicting_signals" ? "unknown" : score.risk_level);

  return {
    status: 200,
    json: {
      regionId: score.region_id,
      regionName: score.region_name,
      evaluatedAt: score.computed_at,
      riskLevel,
      summary:
        riskLevel === "insufficient_data"
          ? `Insufficient station coverage for a reliable risk assessment. ${healthyStations} of ${minimumHealthyStations} required healthy stations are available.`
          : score.operator_summary,
      dominantDrivers: score.dominant_drivers,
      topStations: score.top_contributing_stations.map((station) => ({
        stationId: station.station_id,
        riskLevel: station.risk_level === "conflicting_signals" || station.risk_level === "insufficient_data"
          ? "unknown"
          : station.risk_level,
      })),
      coverage: {
        configuredStations: score.coverage.configured_station_count,
        analyzedStations: score.coverage.analyzed_station_count,
        healthyStations,
        minimumHealthyStations,
      },
      confidence: {
        score: score.confidence_score,
        quality: confidenceQuality(score.confidence_score),
      },
    },
    headers: {
      "X-Marine-Risk-API": "public-read-only",
      "X-Data-Source": "NOAA_CRW",
    },
  };
}

export const getV1RegionRiskRoute: RouteDefinition<
  V1RegionRiskResponse | { message: string },
  { regionId: string }
> = {
  method: "GET",
  path: "/v1/regions/:regionId/risk",
  async handler(request) {
    return buildV1RegionRiskRouteResponse(request.body.regionId);
  },
};
