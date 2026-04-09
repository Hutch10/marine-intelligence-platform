import { createBiodiversityRepository } from "../../repositories/biodiversity";

export interface EvidenceNode {
  id: string;
  summary: string;
}

export class EvidenceGraphService {
  private bioRepo = createBiodiversityRepository();

  public async getEvidenceForTarget(targetId: string, targetTable: string) {
    return this.bioRepo.listEvidenceForTarget(targetId, targetTable);
  }

  public getEvidenceChain(regionId: string): EvidenceNode[] {
    // Deterministic evidence retrieval logic
    // In production, this would traverse the link graph.
    // In this MVP, we return linked evidence for the region from the bioRepo.
    return (this.bioRepo as any).listEvidenceForTarget?.(regionId, "regions") || [];
  }

  public async linkEvidence(input: {
    targetId: string;
    targetTable: string;
    signalType: string;
    contribution: string;
    confidenceContribution: number;
    source: string;
    sourceUrl?: string;
  }) {
    return this.bioRepo.linkEvidence(input);
  }
}

export const evidenceGraphService = new EvidenceGraphService();

export function createEvidenceGraphService(): EvidenceGraphService {
  return new EvidenceGraphService();
}
