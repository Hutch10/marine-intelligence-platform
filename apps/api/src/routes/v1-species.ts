import type { RouteDefinition } from "../types";
import { speciesIntelligenceService } from "../services/species-intelligence/species-intelligence";

export const getV1SpeciesIntelligenceRoute: RouteDefinition<any> = {
  method: "GET",
  path: "/v1/species/:id/intelligence",
  handler: async (req) => {
    const speciesId = req.params.id;
    if (!speciesId) {
      return {
        status: 400,
        json: { message: "Species ID is required" },
      };
    }

    const insight = await speciesIntelligenceService.getSpeciesDetailedInsight(speciesId);

    if (!insight.profile) {
      return {
        status: 404,
        json: { message: "Species not found" },
      };
    }

    return {
      status: 200,
      json: insight,
      telemetry: {
        route: "GET /v1/species/:id/intelligence",
        speciesId,
        source: "db",
        intelligenceType: "detailed_insight",
      },
    };
  },
};
