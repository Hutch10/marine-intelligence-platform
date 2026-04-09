import type { RouteDefinition } from "../types";
import { buildRegionRiskScoreRouteResponse, type InternalRegionRiskScoreResponse } from "./region-risk";
import { calculateRegionalImpact } from "../services/species-intelligence/regional-impact";

export const getV1RegionImpactRoute: RouteDefinition<any> = {
  method: "GET",
  path: "/v1/regions/:id/impact",
  handler: async (req) => {
    const regionId = req.params.id;
    if (!regionId) {
      return {
        status: 400,
        json: { message: "Region ID is required" },
      };
    }

    const riskResponse = buildRegionRiskScoreRouteResponse(regionId);
    
    if (riskResponse.status !== 200) {
      return riskResponse;
    }

    const riskData = riskResponse.json as InternalRegionRiskScoreResponse;
    const environmentalScore = riskData.weighted_score;

    const impact = await calculateRegionalImpact(regionId, environmentalScore);

    return {
      status: 200,
      json: impact,
      telemetry: {
        route: "GET /v1/regions/:id/impact",
        regionId,
        source: "db",
        environmentalScore,
        impactScore: impact.impactScore,
      },
    };
  },
};
