import { calculateRegionalImpact } from "./services/species-intelligence/regional-impact";
import { createBiodiversitySynthesisService } from "./services/species-intelligence/biodiversity-synthesis";
import { createBiodiversityOrchestrator } from "./services/species-intelligence/biodiversity-orchestrator";

async function verify() {
  console.log("=== Biodiversity System Audit ===");

  // 1. Regional Impact Result
  console.log("\n1. Testing Regional Impact Calculation (reg-pac-001)...");
  const impact = calculateRegionalImpact("reg-pac-001", 0.5);
  console.log("Impact Result:", JSON.stringify(impact, null, 2));

  // 2. Synthesis Engine
  console.log("\n2. Testing Biodiversity Synthesis Engine...");
  const synthesisService = createBiodiversitySynthesisService();
  const synthesis = await synthesisService.synthesizeAnalysis("Analyze local biodiversity risk", "reg-pac-001");
  console.log("Synthesized Analysis (Summary):", synthesis.sections.summary);
  console.log("Synthesized Analysis (Evidence):", synthesis.sections.evidence);
  console.log("Confidence Score:", synthesis.confidenceScore);

  // 3. Orchestration
  console.log("\n3. Testing Biodiversity Orchestrator (Dry Run)...");
  const orchestrator = createBiodiversityOrchestrator();
  await orchestrator.runRegionalCycle();
  console.log("Orchestration cycle completed (check logs for event records).");

  console.log("\n=== Audit Complete ===");
}

verify().catch(console.error);
