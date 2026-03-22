import { apiMockData } from "../data";
import type { AiLabWorkspaceData } from "@marine/shared";
import type { AiLabFallbackReason, AiLabTelemetry, RouteDefinition } from "../types";

type AiLabSectionKey =
  | "summary"
  | "findings"
  | "evidence"
  | "confidence"
  | "uncertainty"
  | "suggestedNextActions";

const SECTION_TITLE_TO_KEY: Record<AiLabWorkspaceData["results"][number]["title"], AiLabSectionKey> = {
  Summary: "summary",
  Findings: "findings",
  Evidence: "evidence",
  Confidence: "confidence",
  Uncertainty: "uncertainty",
  "Suggested Next Actions": "suggestedNextActions",
};

type AiLabLatestAnalysis = {
  analysisId: string;
  prompt: string;
  summary: string | null;
  confidenceLabel: string | null;
  resultPayload: {
    sections: Partial<Record<AiLabSectionKey, string>>;
    sources: AiLabWorkspaceData["sources"];
    suggestedPrompts: AiLabWorkspaceData["suggestedPrompts"];
  } | null;
} | null;

type AiLabReadResult =
  | {
      source: "db";
      analysisCount: number;
      latestAnalysis: AiLabLatestAnalysis;
    }
  | { source: "mock"; fallbackReason: AiLabFallbackReason };

function readDatabaseAiLab(): AiLabReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/ai-lab") as {
      getAiLabWorkspaceSummary: () => AiLabReadResult;
    };

    return repository.getAiLabWorkspaceSummary();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function mergeDbAnalysisIntoResults(
  baseResults: AiLabWorkspaceData["results"],
  latestAnalysis: AiLabLatestAnalysis,
): {
  results: AiLabWorkspaceData["results"];
  summarySource: "db" | "mock";
  confidenceSource: "db" | "mock";
  resultsSource: "db" | "mixed" | "mock";
} {
  let summarySource: "db" | "mock" = "mock";
  let confidenceSource: "db" | "mock" = "mock";
  let dbBackedSections = 0;
  const sectionBodies = latestAnalysis?.resultPayload?.sections ?? {};

  const results = baseResults.map((section) => {
    const sectionKey = SECTION_TITLE_TO_KEY[section.title];
    const payloadBody = sectionBodies[sectionKey];

    if (payloadBody) {
      dbBackedSections += 1;

      if (sectionKey === "summary") {
        summarySource = "db";
      }

      if (sectionKey === "confidence") {
        confidenceSource = "db";
      }

      return {
        ...section,
        body: payloadBody,
      };
    }

    if (section.title === "Summary" && latestAnalysis?.summary) {
      dbBackedSections += 1;
      summarySource = "db";

      return {
        ...section,
        body: latestAnalysis.summary,
      };
    }

    if (section.title === "Confidence" && latestAnalysis?.confidenceLabel) {
      dbBackedSections += 1;
      confidenceSource = "db";

      return {
        ...section,
        body: `Overall confidence label: ${latestAnalysis.confidenceLabel}. ${section.body}`,
      };
    }

    return section;
  });

  const resultsSource: "db" | "mixed" | "mock" =
    dbBackedSections === 0
      ? "mock"
      : dbBackedSections === baseResults.length
        ? "db"
        : "mixed";

  return {
    results,
    summarySource,
    confidenceSource,
    resultsSource,
  };
}

function resolveSources(
  latestAnalysis: AiLabLatestAnalysis,
): {
  sources: AiLabWorkspaceData["sources"];
  sourcesSource: "db" | "mock";
} {
  const payloadSources = latestAnalysis?.resultPayload?.sources;

  if (payloadSources && payloadSources.length > 0) {
    return {
      sources: payloadSources,
      sourcesSource: "db",
    };
  }

  return {
    sources: apiMockData.aiLabWorkspaceData.sources,
    sourcesSource: "mock",
  };
}

function resolveSuggestedPrompts(
  latestAnalysis: AiLabLatestAnalysis,
): {
  suggestedPrompts: AiLabWorkspaceData["suggestedPrompts"];
  suggestedPromptsSource: "db" | "mock";
} {
  const payloadPrompts = latestAnalysis?.resultPayload?.suggestedPrompts;

  if (payloadPrompts && payloadPrompts.length > 0) {
    return {
      suggestedPrompts: payloadPrompts,
      suggestedPromptsSource: "db",
    };
  }

  return {
    suggestedPrompts: apiMockData.aiLabWorkspaceData.suggestedPrompts,
    suggestedPromptsSource: "mock",
  };
}

export function buildAiLabRouteResponse(
  readResult = readDatabaseAiLab(),
): { status: number; json: AiLabWorkspaceData; telemetry: AiLabTelemetry } {
  if (readResult.source === "db") {
    const latest = readResult.latestAnalysis;
    const promptSource = latest?.prompt ? ("db" as const) : ("mock" as const);
    const { results, summarySource, confidenceSource, resultsSource } = mergeDbAnalysisIntoResults(
      apiMockData.aiLabWorkspaceData.results,
      latest,
    );
    const { sources, sourcesSource } = resolveSources(latest);
    const { suggestedPrompts, suggestedPromptsSource } = resolveSuggestedPrompts(latest);

    return {
      status: 200,
      json: {
        ...apiMockData.aiLabWorkspaceData,
        promptContext: {
          ...apiMockData.aiLabWorkspaceData.promptContext,
          prompt: latest?.prompt || apiMockData.aiLabWorkspaceData.promptContext.prompt,
        },
        suggestedPrompts,
        results,
        sources,
      },
      telemetry: {
        route: "GET /ai/lab",
        source: "db",
        analysisCount: readResult.analysisCount,
        promptSource,
        summarySource,
        confidenceSource,
        resultsSource,
        sourcesSource,
        suggestedPromptsSource,
      },
    };
  }

  return {
    status: 200,
    json: apiMockData.aiLabWorkspaceData,
    telemetry: {
      route: "GET /ai/lab",
      source: "mock",
      analysisCount: 0,
      promptSource: "mock",
      summarySource: "mock",
      confidenceSource: "mock",
      resultsSource: "mock",
      sourcesSource: "mock",
      suggestedPromptsSource: "mock",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getAiLabRoute: RouteDefinition<AiLabWorkspaceData> = {
  method: "GET",
  path: "/ai/lab",
  handler() {
    return buildAiLabRouteResponse();
  },
};
