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

function resolveInvestigationIdFromRequest(request: AnalyzeRequestBody): string {
  const candidates = [request.prompt, ...(request.context ?? [])].filter(Boolean).join(" ");
  const match = candidates.match(/TRK-\d+/i);

  if (match) {
    return match[0].toUpperCase();
  }

  return "TRK-201";
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

export const postAiAnalyzeRoute: RouteDefinition<AnalyzeResponse, AnalyzeRequestBody> = {
  method: "POST",
  path: "/ai/analyze",
  handler(request) {
    recordAiAnalysisEvents(request.body ?? { prompt: "" });
    return {
      status: 200,
      json: buildStructuredAnalysisResponse(request.body ?? { prompt: "" }),
    };
  },
};
