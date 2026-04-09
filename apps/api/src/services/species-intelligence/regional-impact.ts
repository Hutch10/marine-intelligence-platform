import type {
  SpeciesConservationStatus,
  SpeciesProfile,
} from "@marine/shared";
import { listSpecies } from "../../repositories/species";

const CONSERVATION_WEIGHTS: Record<SpeciesConservationStatus, number> = {
  critically_endangered: 2.0,
  endangered: 1.5,
  vulnerable: 1.2,
  near_threatened: 1.1,
  least_concern: 1.0,
  data_deficient: 1.0,
};

export interface RegionalImpactResult {
  regionId: string;
  environmentalRiskLevel: string;
  environmentalRisk: number;
  biologicalImpactLevel: "low" | "medium" | "high" | "critical";
  impactScore: number;
  weightedImpact: number;
  totalSensitivity: number;
  confidenceScore: number;
  sensitiveSpeciesCount: number;
  topSensitiveSpecies: Array<{
    id: string;
    commonName: string;
    status: string;
    impactContribution: number;
  }>;
  summary: string;
}

export function calculateRegionalImpact(regionId: string, environmentalRiskScore: number): RegionalImpactResult {
  const speciesResult = listSpecies({ region: regionId });
  const speciesList = speciesResult.source === "db" ? speciesResult.species : [];

  let totalSensitivity = 0;
  const sensitiveSpecies: Array<{ id: string; commonName: string; status: string; impactContribution: number }> = [];

  for (const species of speciesList) {
    const weight = CONSERVATION_WEIGHTS[species.conservationStatus] || 1.0;
    if (weight > 1.0) {
      const contribution = weight - 1.0;
      totalSensitivity += contribution;
      sensitiveSpecies.push({
        id: species.id,
        commonName: species.commonName,
        status: species.conservationStatus,
        impactContribution: contribution
      });
    }
  }

  // Final impact score is a product of environmental stress and biological sensitivity
  // Multiplier scales from 1.0 (no sensitivity) to 3.0+
  const impactMultiplier = 1.0 + (totalSensitivity * 0.5); 
  const impactScore = Math.min(1.0, environmentalRiskScore * impactMultiplier);

  let biologicalImpactLevel: RegionalImpactResult["biologicalImpactLevel"] = "low";
  if (impactScore >= 0.8) biologicalImpactLevel = "critical";
  else if (impactScore >= 0.6) biologicalImpactLevel = "high";
  else if (impactScore >= 0.4) biologicalImpactLevel = "medium";

  const summary = `Region ${regionId} has a high biological sensitivity due to ${sensitiveSpecies.length} protected species. ` +
    `Environmental risk is multiplied by ${impactMultiplier.toFixed(2)}x to reflect potential biodiversity loss.`;

  return {
    regionId,
    environmentalRiskLevel: environmentalRiskScore >= 0.75 ? "high" : environmentalRiskScore >= 0.5 ? "medium" : "low",
    environmentalRisk: environmentalRiskScore,
    biologicalImpactLevel,
    impactScore,
    weightedImpact: impactScore,
    totalSensitivity,
    confidenceScore: 75, // Baseline confidence for regional data
    sensitiveSpeciesCount: sensitiveSpecies.length,
    topSensitiveSpecies: sensitiveSpecies.sort((a, b) => b.impactContribution - a.impactContribution).slice(0, 5),
    summary,
  };
}
