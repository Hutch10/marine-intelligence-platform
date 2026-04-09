import { apiMockData } from "../data";
import type { AiLabResultSection } from "@marine/shared";
import type {
  AnalyzeRequestBody,
  AnalyzeResponse,
  AnalyzeResponseSection,
  RouteDefinition,
} from "../types";

type AnalysisSectionKey =
  | "summary"
  | "findings"
  | "evidence"
  | "confidence"
  | "uncertainty"
  | "suggestedNextActions";

const SECTION_TITLE_MAP: Record<AnalysisSectionKey, string> = {
  summary: "Summary",
  findings: "Findings",
  evidence: "Evidence",
  confidence: "Confidence",
  uncertainty: "Uncertainty",
  suggestedNextActions: "Suggested Next Actions",
};

function getSectionByTitle(
  sections: AiLabResultSection[],
  key: AnalysisSectionKey,
): AnalyzeResponseSection {
  const fallbackSection = sections[0];
  const matchingSection = sections.find((section) => section.title === SECTION_TITLE_MAP[key]);

  if (!matchingSection) {
    return {
      ...fallbackSection,
      title: SECTION_TITLE_MAP[key],
    };
  }

  return matchingSection;
}

function summarizeContext(context: string[] | undefined): string {
  if (!context || context.length === 0) {
    return "thermal observations, buoy profiles, field reports, and model outputs";
  }

  return context.join(", ");
}

function buildStructuredAnalysisResponse(request: AnalyzeRequestBody): AnalyzeResponse {
  const prompt = request.prompt?.trim() || apiMockData.aiLabWorkspaceData.promptContext.prompt;
  const contextSummary = summarizeContext(request.context);
  const sections = apiMockData.aiLabWorkspaceData.results;

  const summary = getSectionByTitle(sections, "summary");
  const findings = getSectionByTitle(sections, "findings");
  const evidence = getSectionByTitle(sections, "evidence");
  const confidence = getSectionByTitle(sections, "confidence");
  const uncertainty = getSectionByTitle(sections, "uncertainty");
  const suggestedNextActions = getSectionByTitle(sections, "suggestedNextActions");

  return {
    prompt,
    summary: {
      ...summary,
      body: `${summary.body} Prompt focus: ${prompt}.`,
    },
    findings: {
      ...findings,
      body: `${findings.body} Active context considered: ${contextSummary}.`,
    },
    evidence: {
      ...evidence,
      body: `${evidence.body} Evidence was assembled from ${contextSummary}.`,
    },
    confidence: {
      ...confidence,
      body: `${confidence.body} This remains a structured mock assessment pending live model scoring.`,
    },
    uncertainty: {
      ...uncertainty,
      body: `${uncertainty.body} Additional context requested: ${contextSummary}.`,
    },
    suggestedNextActions: {
      ...suggestedNextActions,
      body: `${suggestedNextActions.body} Prioritize follow-up work that directly answers: ${prompt}`,
    },
    sources: apiMockData.aiLabWorkspaceData.sources,
  };
}

function resolveRegionIdFromRequest(request: AnalyzeRequestBody): string {
  const candidates = [request.prompt, ...(request.context ?? [])].filter(Boolean).join(" ");
  const match = candidates.match(/reg-[a-z0-9-]+/i);

  if (match) {
    return match[0].toLowerCase();
  }

  return "reg-pac-001";
}

function recordAiAnalysisEvents(request: AnalyzeRequestBody) {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/investigation-events") as {
      recordInvestigationEvent: (input: {
        investigationId: string;
        eventType: "hypothesis_tested" | "evidence_promoted";
        source: string;
        actor?: string;
        summary: string;
        detail?: string;
      }) => unknown;
    };

    const investigationId = resolveInvestigationIdFromRequest(request);
    const prompt = request.prompt?.trim() || "AI analysis";

    repository.recordInvestigationEvent({
      investigationId,
      eventType: "hypothesis_tested",
      source: "AI analysis route",
      actor: "AI assistant",
      summary: `Hypothesis updated from prompt: ${prompt}`,
      detail: "Analysis response generated and attached to active investigation context.",
    });

    repository.recordInvestigationEvent({
      investigationId,
      eventType: "evidence_promoted",
      source: "AI analysis route",
      actor: "AI assistant",
      summary: `Evidence promoted from analysis prompt: ${prompt}`,
      detail: "Evidence section refreshed from generated synthesis.",
    });
  } catch {
    // Event logging is best-effort and must not block analysis responses.
  }
}

import { createBiodiversitySynthesisService } from "../services/species-intelligence/biodiversity-synthesis";

export const postAiAnalyzeRoute: RouteDefinition<AnalyzeResponse, AnalyzeRequestBody> = {
  method: "POST",
  path: "/ai/analyze",
  async handler(request) {
    const synthesisService = createBiodiversitySynthesisService();
    const regionId = resolveRegionIdFromRequest(request.body ?? { prompt: "" });
    
    const synthesis = await synthesisService.synthesizeAnalysis(
      request.body?.prompt ?? "",
      regionId
    );

    // Record events for traceability
    recordAiAnalysisEvents(request.body ?? { prompt: "" });

    return {
      status: 200,
      json: {
        prompt: request.body?.prompt ?? "",
        summary: {
          title: "Summary",
          body: synthesis.sections.summary
        },
        findings: {
          title: "Findings",
          body: synthesis.sections.findings
        },
        evidence: {
          title: "Evidence",
          body: synthesis.sections.evidence
        },
        confidence: {
          title: "Confidence",
          body: synthesis.sections.confidence
        },
        uncertainty: {
          title: "Uncertainty",
          body: synthesis.sections.uncertainty
        },
        suggestedNextActions: {
          title: "Suggested Next Actions",
          body: synthesis.sections.suggestedNextActions
        },
        sources: synthesis.sources as any,
      },
    };
  },
};
