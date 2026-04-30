import test from "node:test";
import assert from "node:assert/strict";
import {
  attachFeedbackToMarineRiskEvaluation,
  attachMarineRiskEvaluationOutcome,
  ensureMarineValidationTables,
  listMarineRiskEvaluations,
  recordMarineRiskEvaluationPrediction,
} from "./marine-intelligence-validation";
import type { SqliteDatabaseLike } from "../db/client";

const NOW = Date.parse("2026-03-24T12:00:00.000Z");

function createInMemoryDb(): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown[];
        run: (...params: unknown[]) => unknown;
      };
    };
  };

  const raw = new DatabaseSync(":memory:");

  return {
    prepare(sql: string) {
      return raw.prepare(sql);
    },
    close() {
      return undefined;
    },
  };
}

test("marine validation repository records predictions outcomes and feedback linkage", async () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => ({
      execute: async (sql: string, params: unknown[] = []) => {
        const stmt = db.prepare(sql);
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith("SELECT") || upper.startsWith("PRAGMA")) {
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      },
      close: async () => {},
      resourceId: "mock-async",
    }),
    now: () => NOW,
  };

  const createResult = await recordMarineRiskEvaluationPrediction(
    {
      stationId: "46042",
      route: "/api/v1/risk/score",
      apiKeyId: "APIKEY-1",
      predictedAt: "2026-03-24T12:00:00.000Z",
      predictedRiskLevel: "high",
      recommendationAction: "Storm risk advisory",
      recommendationUrgency: "high",
      confidenceScore: 0.81,
      calibrationAdjustedConfidenceScore: 0.73,
      operatorSummary: "Storm-like conditions driven by falling pressure and higher seas.",
      warningMessages: ["Displayed z-scores were capped."],
      contributingSignals: [
        {
          kind: "observation",
          label: "Low pressure",
          source: "station:46042",
          timestamp: "2026-03-24T12:00:00.000Z",
          detail: "Pressure dropped below threshold.",
        },
      ],
      triggeredRules: [
        {
          ruleType: "low_pressure_system",
          severity: "warning",
          title: "Low pressure alert",
          detail: "Pressure below 960 hPa.",
        },
      ],
    },
    deps,
  );

  assert.equal(createResult.source, "db");
  if (createResult.source !== "db" || !createResult.result.ok || !createResult.result.evaluation) {
    return;
  }

  const outcomeResult = await attachMarineRiskEvaluationOutcome(
    {
      evaluationId: createResult.result.evaluation.id,
      observedAt: "2026-03-24T13:00:00.000Z",
      actualRiskLevel: "critical",
      classification: "partial",
      summary: "Conditions intensified into a critical storm window.",
      source: "simulated",
      notes: "Pressure continued to fall.",
    },
    deps,
  );

  assert.equal(outcomeResult.source, "db");
  if (outcomeResult.source === "db") {
    assert.equal(outcomeResult.result.ok, true);
    assert.equal(outcomeResult.result.evaluation?.actualOutcome?.classification, "partial");
  }

  const feedbackResult = await attachFeedbackToMarineRiskEvaluation(
    {
      evaluationId: createResult.result.evaluation.id,
      useful: false,
      note: "Recommendation was directionally right but late.",
    },
    deps,
  );

  assert.equal(feedbackResult.source, "db");
  if (feedbackResult.source === "db") {
    assert.equal(feedbackResult.result.ok, true);
    assert.equal(feedbackResult.result.evaluation?.feedbackUseful, false);
    assert.equal(feedbackResult.result.evaluation?.feedbackCount, 1);
  }

  const listResult = await listMarineRiskEvaluations({ stationId: "46042" }, deps);
  assert.equal(listResult.source, "db");
  if (listResult.source === "db") {
    assert.equal(listResult.result.evaluations.length, 1);
    assert.equal(listResult.result.evaluations[0]?.id, createResult.result.evaluation.id);
  }
});

test("marine validation repository generates UUID-format ids", async () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => ({
      execute: async (sql: string, params: unknown[] = []) => {
        const stmt = db.prepare(sql);
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith("SELECT") || upper.startsWith("PRAGMA")) {
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      },
      close: async () => {},
      resourceId: "mock-async",
    }),
    now: () => NOW,
  };

  const result1 = await recordMarineRiskEvaluationPrediction(
    {
      stationId: "46042",
      route: "/api/v1/risk/score",
      predictedAt: "2026-03-24T12:00:00.000Z",
      predictedRiskLevel: "low",
      confidenceScore: 0.5,
      operatorSummary: "Test",
      contributingSignals: [],
      triggeredRules: [],
    },
    deps,
  );

  const result2 = await recordMarineRiskEvaluationPrediction(
    {
      stationId: "46042",
      route: "/api/v1/risk/score",
      predictedAt: "2026-03-24T12:00:01.000Z",
      predictedRiskLevel: "low",
      confidenceScore: 0.5,
      operatorSummary: "Test 2",
      contributingSignals: [],
      triggeredRules: [],
    },
    deps,
  );

  assert.equal(result1.source, "db");
  assert.equal(result2.source, "db");

  if (result1.source === "db" && result1.result.ok && result2.source === "db" && result2.result.ok) {
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert.match(result1.result.evaluation.id, uuidPattern);
    assert.match(result2.result.evaluation.id, uuidPattern);
    assert.notEqual(result1.result.evaluation.id, result2.result.evaluation.id);
  }
});

test("marine validation repository rejects outcome attachment for mismatched api key", async () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => ({
      execute: async (sql: string, params: unknown[] = []) => {
        const stmt = db.prepare(sql);
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith("SELECT") || upper.startsWith("PRAGMA")) {
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      },
      close: async () => {},
      resourceId: "mock-async",
    }),
    now: () => NOW,
  };

  const createResult = await recordMarineRiskEvaluationPrediction(
    {
      stationId: "46042",
      route: "/api/v1/risk/score",
      apiKeyId: "APIKEY-1",
      predictedAt: "2026-03-24T12:00:00.000Z",
      predictedRiskLevel: "high",
      confidenceScore: 0.8,
      operatorSummary: "Test",
      contributingSignals: [],
      triggeredRules: [],
    },
    deps,
  );

  assert.equal(createResult.source, "db");
  if (createResult.source !== "db" || !createResult.result.ok || !createResult.result.evaluation) return;

  const wrongKeyResult = await attachMarineRiskEvaluationOutcome(
    {
      evaluationId: createResult.result.evaluation.id,
      apiKeyId: "APIKEY-WRONG",
      observedAt: "2026-03-24T13:00:00.000Z",
      actualRiskLevel: "high",
      classification: "correct",
      summary: "Confirmed",
      source: "manual",
    },
    deps,
  );

  assert.equal(wrongKeyResult.source, "db");
  if (wrongKeyResult.source === "db") {
    assert.equal(wrongKeyResult.result.ok, false);
    assert.equal(wrongKeyResult.result.reason, "not_found");
  }

  const correctKeyResult = await attachMarineRiskEvaluationOutcome(
    {
      evaluationId: createResult.result.evaluation.id,
      apiKeyId: "APIKEY-1",
      observedAt: "2026-03-24T13:00:00.000Z",
      actualRiskLevel: "high",
      classification: "correct",
      summary: "Confirmed",
      source: "manual",
    },
    deps,
  );

  assert.equal(correctKeyResult.source, "db");
  if (correctKeyResult.source === "db") {
    assert.equal(correctKeyResult.result.ok, true);
  }
});

test("marine validation repository rejects feedback attachment for mismatched api key", async () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => ({
      execute: async (sql: string, params: unknown[] = []) => {
        const stmt = db.prepare(sql);
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith("SELECT") || upper.startsWith("PRAGMA")) {
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      },
      close: async () => {},
      resourceId: "mock-async",
    }),
    now: () => NOW,
  };

  const createResult = await recordMarineRiskEvaluationPrediction(
    {
      stationId: "46042",
      route: "/api/v1/risk/score",
      apiKeyId: "APIKEY-1",
      predictedAt: "2026-03-24T12:00:00.000Z",
      predictedRiskLevel: "high",
      confidenceScore: 0.8,
      operatorSummary: "Test",
      contributingSignals: [],
      triggeredRules: [],
    },
    deps,
  );

  if (createResult.source !== "db" || !createResult.result.ok || !createResult.result.evaluation) return;

  const wrongKeyResult = await attachFeedbackToMarineRiskEvaluation(
    {
      evaluationId: createResult.result.evaluation.id,
      apiKeyId: "APIKEY-WRONG",
      useful: true,
    },
    deps,
  );

  assert.equal(wrongKeyResult.source, "db");
  if (wrongKeyResult.source === "db") {
    assert.equal(wrongKeyResult.result.ok, false);
    assert.equal(wrongKeyResult.result.reason, "not_found");
  }
});

test("marine validation repository listMarineRiskEvaluations respects limit", async () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => ({
      execute: async (sql: string, params: unknown[] = []) => {
        const stmt = db.prepare(sql);
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith("SELECT") || upper.startsWith("PRAGMA")) {
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      },
      close: async () => {},
      resourceId: "mock-async",
    }),
    now: () => NOW,
  };

  for (let i = 0; i < 5; i++) {
    await recordMarineRiskEvaluationPrediction(
      {
        stationId: "46042",
        route: "/api/v1/risk/score",
        predictedAt: `2026-03-24T12:0${i}:00.000Z`,
        predictedRiskLevel: "low",
        confidenceScore: 0.5,
        operatorSummary: `Test ${i}`,
        contributingSignals: [],
        triggeredRules: [],
      },
      deps,
    );
  }

  const limitedResult = await listMarineRiskEvaluations({ limit: 3 }, deps);
  assert.equal(limitedResult.source, "db");
  if (limitedResult.source === "db") {
    assert.equal(limitedResult.result.evaluations.length, 3);
  }

  const allResult = await listMarineRiskEvaluations({}, deps);
  assert.equal(allResult.source, "db");
  if (allResult.source === "db") {
    assert.equal(allResult.result.evaluations.length, 5);
  }
});

test("marine validation repository sinceDays filter excludes old evaluations", async () => {
  const db = createInMemoryDb();
  const REFERENCE_MS = Date.parse("2026-03-24T12:00:00.000Z");
  const recentAt = new Date(REFERENCE_MS - 5 * 86400000).toISOString();
  const oldAt = new Date(REFERENCE_MS - 40 * 86400000).toISOString();
 
  const baseDeps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => ({
      execute: async (sql: string, params: unknown[] = []) => {
        const stmt = db.prepare(sql);
        const upper = sql.trim().toUpperCase();
        if (upper.startsWith("SELECT") || upper.startsWith("PRAGMA")) {
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      },
      close: async () => {},
      resourceId: "mock-async",
    }),
    now: () => REFERENCE_MS,
  };

  await recordMarineRiskEvaluationPrediction(
    {
      stationId: "46042",
      route: "/api/v1/risk/score",
      predictedAt: recentAt,
      predictedRiskLevel: "low",
      confidenceScore: 0.5,
      operatorSummary: "Recent",
      contributingSignals: [],
      triggeredRules: [],
    },
    baseDeps,
  );

  await recordMarineRiskEvaluationPrediction(
    {
      stationId: "46042",
      route: "/api/v1/risk/score",
      predictedAt: oldAt,
      predictedRiskLevel: "low",
      confidenceScore: 0.5,
      operatorSummary: "Old",
      contributingSignals: [],
      triggeredRules: [],
    },
    baseDeps,
  );

  const allResult = await listMarineRiskEvaluations({}, baseDeps);
  assert.equal(allResult.source, "db");
  if (allResult.source === "db") {
    assert.equal(allResult.result.evaluations.length, 2);
  }

  const recentResult = await listMarineRiskEvaluations({ sinceDays: 30 }, baseDeps);
  assert.equal(recentResult.source, "db");
  if (recentResult.source === "db") {
    assert.equal(recentResult.result.evaluations.length, 1);
    assert.equal(recentResult.result.evaluations[0]?.operatorSummary, "Recent");
  }
});

test("marine validation repository validates required fields and handles missing storage", async () => {
  const db = createInMemoryDb();
  const mockAdapter: AsyncDbAdapter = {
    execute: async (sql: string, params: unknown[] = []) => {
      const stmt = db.prepare(sql);
      const upper = sql.trim().toUpperCase();
      if (upper.startsWith("SELECT") || upper.startsWith("PRAGMA")) {
        return stmt.all(...params);
      } else {
        return stmt.run(...params);
      }
    },
    close: async () => {},
    resourceId: "mock-async",
  };
  await ensureMarineValidationTables(mockAdapter);
 
  const invalidPrediction = await recordMarineRiskEvaluationPrediction(
    {
      stationId: "",
      route: "/api/v1/risk/score",
      predictedAt: "2026-03-24T12:00:00.000Z",
      predictedRiskLevel: "medium",
      confidenceScore: 0.55,
      operatorSummary: "Summary",
      contributingSignals: [],
      triggeredRules: [],
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => mockAdapter,
      now: () => NOW,
    },
  );

  assert.equal(invalidPrediction.source, "db");
  if (invalidPrediction.source === "db") {
    assert.equal(invalidPrediction.result.ok, false);
    assert.equal(invalidPrediction.result.reason, "validation");
  }

  const unavailable = await listMarineRiskEvaluations(
    {},
    {
      resolvePath: () => "missing.sqlite",
      hasPath: () => false,
    },
  );

  assert.equal(unavailable.source, "unavailable");
});
