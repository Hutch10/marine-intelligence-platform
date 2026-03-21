import test from "node:test";
import assert from "node:assert/strict";
import { getAiLabWorkspaceSummary } from "./ai-lab";
import type { SqliteDatabaseLike } from "../db/client";

interface AnalysisRow {
  id: string;
  prompt: string;
  summary: string | null;
  confidence_label: string | null;
  result_payload: unknown;
}

const ANALYSIS_ROWS: AnalysisRow[] = [
  {
    id: "ANL-001",
    prompt: "Summarize reef-edge anomaly using thermal and field inputs.",
    summary: "Heat stress remains the primary driver.",
    confidence_label: "moderate-high",
    result_payload: JSON.stringify({
      sections: {
        summary: "Summary from payload",
        findings: "Findings from payload",
      },
      suggestedPrompts: [
        {
          title: "Payload prompt one",
          detail: "Grounded prompt detail from payload.",
        },
      ],
      sources: [
        {
          id: "SRC-21",
          title: "Pacific Thermal Front Observations",
          type: "Dataset",
          note: "Core thermal anomaly feed aligned with the current research prompt.",
          freshness: "Updated 8 min ago",
        },
      ],
    }),
  },
  {
    id: "ANL-000",
    prompt: "Older prompt",
    summary: "Older summary",
    confidence_label: "moderate",
    result_payload: null,
  },
];

const INVALID_PAYLOAD_ROWS: AnalysisRow[] = [
  {
    id: "ANL-BAD",
    prompt: "Prompt with bad payload",
    summary: "Summary",
    confidence_label: "low",
    result_payload: "{not-valid-json}",
  },
];

const PARTIAL_INVALID_PROMPTS_ROWS: AnalysisRow[] = [
  {
    id: "ANL-PROMPTS",
    prompt: "Prompt with mixed suggestions",
    summary: "Summary",
    confidence_label: "medium",
    result_payload: JSON.stringify({
      suggestedPrompts: [
        { title: "  Keep me  ", detail: "  Valid detail  " },
        { title: "", detail: "Missing title" },
        { title: "Missing detail", detail: "" },
        { title: 123, detail: "bad" },
      ],
    }),
  },
];

function createDatabase(
  analysisRows: AnalysisRow[],
  options?: { throwOnQuery?: boolean },
): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all() {
          if (options?.throwOnQuery) {
            throw new Error("query failed");
          }

          if (sql.includes("COUNT(*) AS total") && sql.includes("FROM ai_analyses")) {
            return [{ total: analysisRows.length }];
          }

          if (sql.includes("FROM ai_analyses")) {
            return analysisRows.length > 0 ? [analysisRows[0]] : [];
          }

          return [];
        },
      };
    },
    close() {},
  };
}

test("ai lab repository returns DB count and latest analysis snapshot", () => {
  const result = getAiLabWorkspaceSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(ANALYSIS_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.analysisCount, 2);
    assert.deepEqual(result.latestAnalysis, {
      analysisId: "ANL-001",
      prompt: "Summarize reef-edge anomaly using thermal and field inputs.",
      summary: "Heat stress remains the primary driver.",
      confidenceLabel: "moderate-high",
      resultPayload: {
        sections: {
          summary: "Summary from payload",
          findings: "Findings from payload",
        },
        sources: [
          {
            id: "SRC-21",
            title: "Pacific Thermal Front Observations",
            type: "Dataset",
            note: "Core thermal anomaly feed aligned with the current research prompt.",
            freshness: "Updated 8 min ago",
          },
        ],
        suggestedPrompts: [
          {
            title: "Payload prompt one",
            detail: "Grounded prompt detail from payload.",
          },
        ],
      },
    });
  }
});

test("ai lab repository keeps only valid suggested prompts from payload", () => {
  const result = getAiLabWorkspaceSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(PARTIAL_INVALID_PROMPTS_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.latestAnalysis?.resultPayload?.suggestedPrompts, [
      {
        title: "Keep me",
        detail: "Valid detail",
      },
    ]);
  }
});

test("ai lab repository returns DB success with null latest analysis when table is empty", () => {
  const result = getAiLabWorkspaceSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase([]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.analysisCount, 0);
    assert.equal(result.latestAnalysis, null);
  }
});

test("ai lab repository ignores invalid result payload and keeps DB result", () => {
  const result = getAiLabWorkspaceSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(INVALID_PAYLOAD_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.analysisCount, 1);
    assert.deepEqual(result.latestAnalysis, {
      analysisId: "ANL-BAD",
      prompt: "Prompt with bad payload",
      summary: "Summary",
      confidenceLabel: "low",
      resultPayload: null,
    });
  }
});

test("ai lab repository falls back with db_path_missing when the DB file does not exist", () => {
  const result = getAiLabWorkspaceSummary({
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_path_missing" });
});

test("ai lab repository falls back with db_open_failed when opening the DB throws", () => {
  const result = getAiLabWorkspaceSummary({
    resolvePath: () => "broken.sqlite",
    hasPath: () => true,
    openDatabase: () => {
      throw new Error("open failed");
    },
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_open_failed" });
});

test("ai lab repository falls back with db_query_failed when querying throws", () => {
  const result = getAiLabWorkspaceSummary({
    resolvePath: () => "query.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(ANALYSIS_ROWS, { throwOnQuery: true }),
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_query_failed" });
});
