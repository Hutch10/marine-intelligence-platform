import type {
  SpeciesProfile,
  SpeciesPopulationEstimate,
  SpeciesSurveyCount,
  SpeciesAcousticDetection,
  SpeciesTrack,
  SpeciesStrandingEvent,
  SpeciesDistributionRegion,
  SpeciesThreatProfile,
} from "@marine/shared";
import { getSpeciesById } from "../../repositories/species";
import { createBiodiversityRepository } from "../../repositories/biodiversity";

export class SpeciesIntelligenceService {
  private bioRepo = createBiodiversityRepository();

  public async getSpeciesDetailedInsight(speciesId: string): Promise<{
    profile: SpeciesProfile | null;
    populations: SpeciesPopulationEstimate[];
    surveys: SpeciesSurveyCount[];
    acoustics: SpeciesAcousticDetection[];
    tracks: SpeciesTrack[];
    strandings: SpeciesStrandingEvent[];
    distribution: SpeciesDistributionRegion[];
    threats: SpeciesThreatProfile | null;
    anatomy: any[];
    fossils: any[];
    ecosystems: any[];
    evidence: any[];
  }> {
    const speciesResult = await getSpeciesById(speciesId);
    if (speciesResult.source !== "db" || speciesResult.result !== "found") {
      return {
        profile: null,
        populations: [],
        surveys: [],
        acoustics: [],
        tracks: [],
        strandings: [],
        distribution: [],
        threats: null,
        anatomy: [],
        fossils: [],
        ecosystems: [],
        evidence: [],
      };
    }

    return {
      profile: speciesResult.species,
      populations: this.bioRepo.listPopulationEstimates(speciesId),
      surveys: this.bioRepo.listSurveyCounts(speciesId),
      acoustics: this.bioRepo.listAcousticDetections(speciesId),
      tracks: this.bioRepo.listTracks(speciesId),
      strandings: this.bioRepo.listStrandingEvents(speciesId),
      distribution: this.bioRepo.getDistributionRegions(speciesId),
      threats: this.bioRepo.getThreatProfile(speciesId),
      anatomy: this.bioRepo.listAnatomy(speciesId),
      fossils: this.bioRepo.listFossils(speciesId),
      ecosystems: this.bioRepo.listEcosystems(speciesId),
      evidence: this.bioRepo.listEvidenceForTarget(speciesId, "species"),
    };
  }
}

export const speciesIntelligenceService = new SpeciesIntelligenceService();
