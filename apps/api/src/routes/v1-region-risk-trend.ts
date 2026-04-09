import type { RouteDefinition } from "../types";
import {
  buildRegionRiskTrendRouteResponse,
  type InternalRegionRiskTrendResponse,
} from "./region-risk-trend";

interface V1RegionRiskTrendResponse {
  regionId: string;
  regionName: string;
  evaluatedAt: string;
  currentRisk: {
    riskLevel: "low" | "medium" | "high" | "critical" | "unknown";
    confidenceScore: number;
  };
  trend: {
    direction: "rising" | "falling" | "stable";
    strength: "weak" | "moderate" | "strong";
    deltaScore: number;
    persistence: number;
  };
  forecast: {
    next12h: {
      riskLevel: "low" | "medium" | "high" | "critical" | "unknown";
      confidence: number;
    };
    next24h: {
      riskLevel: "low" | "medium" | "high" | "critical" | "unknown";
      confidence: number;
    };
  };
  summary: string;
}

export function buildV1RegionRiskTrendRouteResponse(
  regionId: string,
  buildInternalResponse: typeof buildRegionRiskTrendRouteResponse = buildRegionRiskTrendRouteResponse,
): {
  status: 200 | 404 | 503;
  json: V1RegionRiskTrendResponse | { message: string };
  headers: Record<string, string>;
} {
  const response = buildInternalResponse(regionId);

  if (response.status !== 200) {
    return {
      status: response.status,
      json: response.json as { message: string },
      headers: {},
    };
  }

  const internal = response.json as InternalRegionRiskTrendResponse;

  return {
    status: 200,
    json: {
      regionId: internal.region_id,
      regionName: internal.region_name,
      evaluatedAt: internal.computed_at,
      currentRisk: {
        riskLevel: internal.current.risk_level,
        confidenceScore: internal.current.confidence_score,
      },
      trend: {
        direction: internal.trend.direction,
        strength: internal.trend.strength,
        deltaScore: internal.trend.delta_score,
        persistence: internal.trend.persistence,
      },
      forecast: {
        next12h: {
          riskLevel: internal.forecast.next_12h.risk_level,
          confidence: internal.forecast.next_12h.confidence,
        },
        next24h: {
          riskLevel: internal.forecast.next_24h.risk_level,
          confidence: internal.forecast.next_24h.confidence,
        },
      },
      summary: internal.operator_summary,
    },
    headers: {
      "X-Marine-Risk-API": "public-read-only",
      "X-Data-Source": "NOAA_CRW",
    },
  };
}

export const getV1RegionRiskTrendRoute: RouteDefinition<
  V1RegionRiskTrendResponse | { message: string },
  { regionId: string }
> = {
  method: "GET",
  path: "/v1/regions/:regionId/risk/trend",
  handler(request) {
    return buildV1RegionRiskTrendRouteResponse(request.body.regionId);
  },
};
