import { calculateRegionalImpact } from "./regional-impact";
import { MarineEventCreateInput, MarineEventSeverity } from "../../marine-intelligence-types";
import { MarineEventFoundationService } from "../marine-intelligence-events";

/**
 * Service for deterministic detection of biological impact events.
 * Transitions from stochastic/prompt-driven observation to rule-based deterministic alerts.
 */
export interface BiodiversityEventService {
  evaluateRegionalBiodiversityRisk(regionId: string): Promise<MarineEventCreateInput | null>;
}

export function createBiodiversityEventService(
  dependencies: {
    impactService?: typeof calculateRegionalImpact;
    eventService?: MarineEventFoundationService;
    now?: () => number;
  } = {}
): BiodiversityEventService {
  const calculateImpact = dependencies.impactService ?? calculateRegionalImpact;
  const now = dependencies.now ?? Date.now;

  async function evaluateRegionalBiodiversityRisk(regionId: string): Promise<MarineEventCreateInput | null> {
    const impact = calculateImpact(regionId, 0.5);
    
    // Threshold-based deterministic event generation
    // Rule: Total sensitivity > 5 AND Weighted Impact > 1.5 triggers an event
    if (impact.totalSensitivity > 5 && impact.weightedImpact > 1.5) {
      const severity: MarineEventSeverity = impact.weightedImpact > 3.0 ? "critical" : "high";
      
      const title = `Biological Impact Threshold Breach: ${regionId}`;
      const summary = `Deterministic analysis detected high biological impact risk. ` +
        `Environmental risk score (${impact.environmentalRisk.toFixed(1)}) intersects with ` +
        `${impact.totalSensitivity.toFixed(1)} sensitivity units. ` +
        `Weighted impact calculated at ${impact.weightedImpact.toFixed(2)}.`;

      return {
        ontologyTermId: "mdl.contextual_signal",
        eventClass: "contextual_signal",
        severity,
        status: "detected",
        title,
        summary,
        region: regionId,
        confidence: Math.round(impact.confidenceScore),
        lineage: {
          source: "BiodiversityImpactEngine",
          sourceRecordId: `BIE-${regionId}-${now()}`,
          ingestionRunId: `IR-${now()}`,
          observedAt: new Date(now()).toISOString(),
          ingestedAt: new Date(now()).toISOString(),
        },
        detectedAt: new Date(now()).toISOString(),
      };
    }

    return null;
  }

  return {
    evaluateRegionalBiodiversityRisk
  };
}
