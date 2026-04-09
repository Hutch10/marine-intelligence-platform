import test from "node:test";
import assert from "node:assert/strict";
import { createBiodiversitySynthesisService } from "./biodiversity-synthesis";
import { RegionalImpactResult } from "./regional-impact";

test("BiodiversitySynthesisService - should synthesize a coherent report from deterministic inputs", async () => {
  const mockImpact: RegionalImpactResult = {
    regionId: "reg-pac-001",
    environmentalRiskLevel: "medium",
    environmentalRisk: 8.2,
    biologicalImpactLevel: "high",
    impactScore: 4.5,
    weightedImpact: 4.5,
    totalSensitivity: 15.5,
    confidenceScore: 85,
    sensitiveSpeciesCount: 3,
    topSensitiveSpecies: [
      { id: "sp1", commonName: "Green Sea Turtle", status: "endangered", impactContribution: 10 }
    ],
    summary: "Mock summary",
  };

  const mockSpeciesResult = {
    source: "db" as const,
    species: [
      { id: "sp1", commonName: "Green Sea Turtle", conservationStatus: "endangered" } as any,
      { id: "sp2", commonName: "Whale Shark", conservationStatus: "vulnerable" } as any,
    ]
  };

  const mockEvidenceChain = [
    { id: "ev1", summary: "Acoustic detection" },
    { id: "ev2", summary: "Visual survey" },
  ];

  const service = createBiodiversitySynthesisService({
    impactService: () => mockImpact,
    evidenceService: { getEvidenceChain: () => mockEvidenceChain as any } as any,
    speciesRepo: { 
      list: () => mockSpeciesResult,
      get: () => ({ source: "db", result: "found", species: mockSpeciesResult.species[0] } as any)
    }
  });

  const result = await service.synthesizeAnalysis("Analyze region Pacific North");

  // Verify sections exist and contain deterministic data
  assert.ok(result.sections.summary.includes("15.5 indices"));
  assert.ok(result.sections.findings.includes("4.50"));
  assert.ok(result.sections.findings.includes("Green Sea Turtle"));
  assert.ok(result.sections.evidence.includes("2 discrete evidence nodes"));
  
  // Verify confidence labeling
  assert.ok(result.sections.confidence.includes("85%"));
  assert.ok(result.sections.confidence.includes("High"));
  
  // Verify sources
  assert.ok(result.sources.length > 0);
  assert.equal(result.sources[0].title, "Biodiversity Observation System (Deterministic)");
});

test("BiodiversitySynthesisService - should handle empty species lists gracefully", async () => {
  const service = createBiodiversitySynthesisService({
    impactService: () => ({ 
      regionId: "Empty region",
      environmentalRiskLevel: "low",
      environmentalRisk: 1.0,
      biologicalImpactLevel: "low",
      impactScore: 0,
      weightedImpact: 0,
      totalSensitivity: 0, 
      confidenceScore: 40,
      sensitiveSpeciesCount: 0,
      topSensitiveSpecies: [],
      summary: "Empty summary",
    }),
    evidenceService: { getEvidenceChain: () => [] } as any,
    speciesRepo: { list: () => ({ source: "db", species: [] }), get: () => null as any }
  });

  const result = await service.synthesizeAnalysis("Empty region");
  assert.ok(result.sections.summary.includes("0.0 indices"));
  assert.ok(result.sections.findings.includes("various local fauna"));
});
