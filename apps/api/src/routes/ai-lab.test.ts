import test from "node:test";
import assert from "node:assert/strict";
import { buildAiLabRouteResponse } from "./ai-lab";

test("ai lab route uses DB-backed prompt and summary when latest analysis exists", () => {
  const response = buildAiLabRouteResponse({
    source: "db",
    analysisCount: 2,
    latestAnalysis: {
      analysisId: "ANL-001",
      prompt: "Summarize reef-edge anomaly from latest merged signals.",
      summary: "Heat stress remains primary, with current shear as amplifier.",
      confidenceLabel: "moderate-high",
      resultPayload: {
        sections: {
          findings: "Payload findings grounded from AI analysis row.",
          evidence: "Payload evidence aligned with buoy + satellite sources.",
          uncertainty: "Payload uncertainty notes for sparse shelf oxygen rows.",
          suggestedNextActions: "Payload recommends oxygen join and follow-up transect.",
        },
        suggestedPrompts: [
          {
            title: "Payload-suggested prompt",
            detail: "Use the latest evidence cluster to draft a field brief.",
          },
        ],
        sources: [
          {
            id: "SRC-DB-1",
            title: "Merged Thermal Analysis",
            type: "Dataset",
            note: "Directly linked to ANL-001 payload.",
            freshness: "Updated 2 min ago",
          },
        ],
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.route, "GET /ai/lab");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.analysisCount, 2);
  assert.equal(response.telemetry.promptSource, "db");
  assert.equal(response.telemetry.summarySource, "db");
  assert.equal(response.telemetry.confidenceSource, "db");
  assert.equal(response.telemetry.resultsSource, "db");
  assert.equal(response.telemetry.sourcesSource, "db");
  assert.equal(response.telemetry.suggestedPromptsSource, "db");
  assert.equal(response.telemetry.fallbackReason, undefined);

  assert.equal(
    response.json.promptContext.prompt,
    "Summarize reef-edge anomaly from latest merged signals.",
  );

  const summary = response.json.results.find((section) => section.title === "Summary");
  assert.equal(summary?.body, "Heat stress remains primary, with current shear as amplifier.");

  const confidence = response.json.results.find((section) => section.title === "Confidence");
  assert.ok(confidence?.body.includes("moderate-high"));

  const findings = response.json.results.find((section) => section.title === "Findings");
  assert.equal(findings?.body, "Payload findings grounded from AI analysis row.");

  assert.deepEqual(response.json.sources, [
    {
      id: "SRC-DB-1",
      title: "Merged Thermal Analysis",
      type: "Dataset",
      note: "Directly linked to ANL-001 payload.",
      freshness: "Updated 2 min ago",
    },
  ]);

  assert.deepEqual(response.json.suggestedPrompts, [
    {
      title: "Payload-suggested prompt",
      detail: "Use the latest evidence cluster to draft a field brief.",
    },
  ]);
});

test("ai lab route keeps DB source and mock fields when DB has no latest analysis row", () => {
  const response = buildAiLabRouteResponse({
    source: "db",
    analysisCount: 0,
    latestAnalysis: null,
  });

  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.analysisCount, 0);
  assert.equal(response.telemetry.promptSource, "mock");
  assert.equal(response.telemetry.summarySource, "mock");
  assert.equal(response.telemetry.confidenceSource, "mock");
  assert.equal(response.telemetry.resultsSource, "mock");
  assert.equal(response.telemetry.sourcesSource, "mock");
  assert.equal(response.telemetry.suggestedPromptsSource, "mock");

  assert.ok(response.json.promptContext.prompt.length > 0);
  assert.ok(response.json.suggestedPrompts.length > 0);
  assert.ok(response.json.sources.length > 0);
});

test("ai lab route preserves contract shape for DB source", () => {
  const response = buildAiLabRouteResponse({
    source: "db",
    analysisCount: 1,
    latestAnalysis: {
      analysisId: "ANL-001",
      prompt: "Prompt from db",
      summary: null,
      confidenceLabel: null,
      resultPayload: null,
    },
  });

  assert.deepEqual(Object.keys(response.json).sort(), [
    "promptContext",
    "results",
    "sources",
    "suggestedPrompts",
  ]);
  assert.equal(response.json.results.length, 6);
});

test("ai lab route falls back to mock suggested prompts when payload omits them", () => {
  const response = buildAiLabRouteResponse({
    source: "db",
    analysisCount: 1,
    latestAnalysis: {
      analysisId: "ANL-MIXED",
      prompt: "Prompt from db",
      summary: "Summary from db",
      confidenceLabel: "high",
      resultPayload: {
        sections: {
          summary: "Payload summary",
        },
        suggestedPrompts: [],
        sources: [
          {
            id: "SRC-DB-2",
            title: "DB source",
            type: "Dataset",
            note: "Only sources provided",
            freshness: "Updated 1 min ago",
          },
        ],
      },
    },
  });

  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.sourcesSource, "db");
  assert.equal(response.telemetry.suggestedPromptsSource, "mock");
  assert.ok(response.json.suggestedPrompts.length > 0);
});

test("ai lab route marks resultsSource as db when payload covers all sections", () => {
  const response = buildAiLabRouteResponse({
    source: "db",
    analysisCount: 1,
    latestAnalysis: {
      analysisId: "ANL-ALL",
      prompt: "Prompt from db",
      summary: "Summary fallback",
      confidenceLabel: "high",
      resultPayload: {
        sections: {
          summary: "Summary payload",
          findings: "Findings payload",
          evidence: "Evidence payload",
          confidence: "Confidence payload",
          uncertainty: "Uncertainty payload",
          suggestedNextActions: "Next actions payload",
        },
        suggestedPrompts: [],
        sources: [],
      },
    },
  });

  assert.equal(response.telemetry.resultsSource, "db");
  const confidence = response.json.results.find((section) => section.title === "Confidence");
  assert.equal(confidence?.body, "Confidence payload");
});

test("ai lab route falls back to mock workspace when db_path_missing", () => {
  const response = buildAiLabRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
  assert.equal(response.telemetry.analysisCount, 0);
  assert.equal(response.telemetry.promptSource, "mock");
  assert.equal(response.telemetry.summarySource, "mock");
  assert.equal(response.telemetry.confidenceSource, "mock");
  assert.equal(response.telemetry.resultsSource, "mock");
  assert.equal(response.telemetry.sourcesSource, "mock");
  assert.equal(response.telemetry.suggestedPromptsSource, "mock");
});

test("ai lab route falls back to mock workspace when db_open_failed", () => {
  const response = buildAiLabRouteResponse({
    source: "mock",
    fallbackReason: "db_open_failed",
  });

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
});

test("ai lab route falls back to mock workspace when db_query_failed", () => {
  const response = buildAiLabRouteResponse({
    source: "mock",
    fallbackReason: "db_query_failed",
  });

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
});
