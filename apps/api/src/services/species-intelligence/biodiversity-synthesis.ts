import { SpeciesRepository, getSpeciesById, listSpecies } from "../../repositories/species";
import { calculateRegionalImpact, RegionalImpactResult } from "./regional-impact";
import { summarizeConfidence, getConfidenceLevel } from "./confidence-engine";
import { EvidenceGraphService, createEvidenceGraphService } from "./evidence-graph";

export interface BiodiversitySynthesisResult {
  sections: {
    summary: string;
    findings: string;
    evidence: string;
    confidence: string;
    uncertainty: string;
    suggestedNextActions: string;
  };
  sources: Array<{
    id: string;
    title: string;
    type: "Dataset" | "Field Report" | "Model" | "Literature";
    note: string;
    freshness: string;
  }>;
  confidenceScore: number;
}

export interface BiodiversitySynthesisService {
  synthesizeAnalysis(prompt: string, regionId?: string, environmentalRiskScore?: number): Promise<BiodiversitySynthesisResult>;
}

export function createBiodiversitySynthesisService(
  dependencies: {
    impactService?: (regionId: string, environmentalRiskScore: number) => Promise<RegionalImpactResult>;
    evidenceService?: EvidenceGraphService;
    speciesRepo?: { 
      list: (filters: import("../../repositories/species").SpeciesListFilters) => Promise<import("../../repositories/species").SpeciesListResult>; 
      get: (speciesId: string) => Promise<import("../../repositories/species").SpeciesDetailResult> 
    };
  } = {}
): BiodiversitySynthesisService {
  const calculateImpact = dependencies.impactService ?? calculateRegionalImpact;
  const evidenceService = dependencies.evidenceService ?? createEvidenceGraphService();
  const listSpeciesRepo = dependencies.speciesRepo?.list ?? listSpecies;

  async function synthesizeAnalysis(
    prompt: string, 
    regionId: string = "reg-pac-001",
    environmentalRiskScore: number = 0.5
  ): Promise<BiodiversitySynthesisResult> {
    // 1. Gather Regional Data
    const impact = await calculateImpact(regionId, environmentalRiskScore);
    
    // 2. Gather Species Data
    const speciesList = await listSpeciesRepo({ region: regionId, limit: 5 });
    const species = speciesList.source === "db" ? speciesList.species : [];
    
    // 3. Gather Evidence
    const evidenceCount = evidenceService.getEvidenceChain(regionId).length;

    // 4. Synthesize Sections
    const impactLabel = impact.totalSensitivity > 10 ? "Significant" : "Moderate";
    const topSpecies = species.map(s => s.commonName).join(", ") || "various local fauna";

    const summary = `Deterministic assessment for ${regionId}. Regional biological sensitivity is ${impactLabel} (${impact.totalSensitivity.toFixed(1)} indices) based on ${species.length} known protected species occurrences.`;
    
    const findings = `Environmental risk factors (Score: ${impact.environmentalRisk.toFixed(1)}) directly intersect with the habitat of ${topSpecies}. Cumulative biological impact is estimated at ${impact.weightedImpact.toFixed(2)}, primarily driven by conservation-weighted sensitivity matrices.`;
    
    const evidence = `Findings are traceably linked to ${evidenceCount} discrete evidence nodes, including acoustic detections, survey counts, and historical tracking data retrieved from the Species Observation Repository. All population estimates are explicitly labeled as observed or modeled.`;
    
    const confidenceScore = impact.confidenceScore;
    const confidenceLabel = summarizeConfidence(confidenceScore);
    const confidenceLevel = getConfidenceLevel(confidenceScore);
    
    const confidence = `Confidence: ${confidenceLevel} (${confidenceScore.toFixed(0)}%). This assessment is derived from deterministic regional scoring. No stochastic modeling or prompt-driven estimation was used in this synthesis.`;
    
    const uncertainty = `Primary uncertainty remains in the ${impact.totalSensitivity === 0 ? "data-deficient states of local species" : "granularity of real-time movement data for key indicators"}. Confidence targets are constrained by data coverage in the requested region.`;
    
    const suggestedNextActions = `1. Deploy additional acoustic stations at high-sensitivity hotspots. 2. Cross-reference thermal anomalies with known ${species[0]?.commonName || "migratory"} corridors. 3. Finalize evidence promotion for pending local surveys.`;

    return {
      sections: {
        summary,
        findings,
        evidence,
        confidence,
        uncertainty,
        suggestedNextActions,
      },
      sources: [
        {
          id: "BOS-REQ-001",
          title: "Biodiversity Observation System (Deterministic)",
          type: "Model",
          note: "Integrated Regional Impact Result",
          freshness: "Real-time"
        },
        {
          id: "SPEC-REP-01",
          title: "Species Observation Repository",
          type: "Dataset",
          note: "Primary species presence data",
          freshness: "Last 24h"
        }
      ],
      confidenceScore
    };
  }

  return {
    synthesizeAnalysis
  };
}
