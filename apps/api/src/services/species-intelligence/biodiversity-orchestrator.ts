import { BiodiversityEventService, createBiodiversityEventService } from "./biodiversity-events";
import { MarineEventFoundationService, createMarineEventFoundationService } from "../marine-intelligence-events";
import { listRegions } from "../../repositories/regions";

/**
 * Orchestrates the biological intelligence cycle.
 * Scans all regions for biological impact risks and records events.
 */
export interface BiodiversityOrchestrator {
  runRegionalCycle(): Promise<void>;
}

export function createBiodiversityOrchestrator(
  dependencies: {
    eventService?: BiodiversityEventService;
    foundationService?: MarineEventFoundationService;
    listRegionsRepo?: typeof listRegions;
  } = {}
): BiodiversityOrchestrator {
  const eventService = dependencies.eventService ?? createBiodiversityEventService();
  const foundationService = dependencies.foundationService ?? createMarineEventFoundationService();
  const listRegionsRepo = dependencies.listRegionsRepo ?? listRegions;

  async function runRegionalCycle(): Promise<void> {
    const regionResult = listRegionsRepo();
    const regions = regionResult.source === "db" ? regionResult.regions : [];

    for (const region of regions) {
      try {
        const potentialEvent = await eventService.evaluateRegionalBiodiversityRisk(region.id);
        
        if (potentialEvent) {
          foundationService.recordEvent(potentialEvent);
          console.log(`[Bio-Orchestrator] Recorded biodiversity event for region: ${region.id}`);
        }
      } catch (error) {
        console.error(`[Bio-Orchestrator] Failed to evaluate region ${region.id}:`, error);
      }
    }
  }

  return {
    runRegionalCycle
  };
}
