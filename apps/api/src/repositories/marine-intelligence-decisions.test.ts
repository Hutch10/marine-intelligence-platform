import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureMarineIntelligenceDecisionTables,
  getMarineIntelligenceDecisionSummary,
  recordMarineIntelligenceDecision,
  recordMarineIntelligenceFeedback,
  recordMarineIntelligenceTelemetryEvent,
} from "./marine-intelligence-decisions";
import type { SqliteDatabaseLike } from "../db/client";

const NOW = Date.parse("2026-03-20T12:00:00.000Z");

function createInMemoryDb(): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string, options?: { open?: boolean; readOnly?: boolean }) => {
      exec: (sql: string) => void;
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

test("marine intelligence decisions repository records decisions and telemetry events", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    openReadOnly: () => db,
    now: () => NOW,
  };

  const decisionResult = recordMarineIntelligenceDecision(
    {
      investigationId: "MI-001",
      stationId: "STA-001",
      decision: "delay_operations",
      rationale: "High wave energy and wind make transit unsafe.",
      timestamp: "2026-03-20T12:03:00.000Z",
    },
    deps,
  );

  assert.equal(decisionResult.source, "db");
  if (decisionResult.source === "db") {
    assert.equal(decisionResult.result.ok, true);
    assert.equal(decisionResult.result.decision?.id, `MID-${NOW}-1`);
    assert.equal(decisionResult.result.event?.eventType, "submit_decision");
    assert.equal(decisionResult.result.event?.decisionId, `MID-${NOW}-1`);
  }

  const viewEvent = recordMarineIntelligenceTelemetryEvent(
    {
      eventType: "view",
      investigationId: "MI-001",
      stationId: "STA-001",
      timestamp: "2026-03-20T12:00:00.000Z",
      details: "Opened decision panel",
    },
    deps,
  );

  const clickEvent = recordMarineIntelligenceTelemetryEvent(
    {
      eventType: "click",
      investigationId: "MI-001",
      stationId: "STA-001",
      timestamp: "2026-03-20T12:01:00.000Z",
      details: "Clicked similar events",
    },
    deps,
  );

  assert.equal(viewEvent.source, "db");
  assert.equal(clickEvent.source, "db");

  const feedbackResult = recordMarineIntelligenceFeedback(
    {
      useful: true,
      note: "Recommendation matched field conditions.",
      investigationId: "MI-001",
      stationId: "STA-001",
      evaluationId: "MVAL-123",
      signalSnapshot: ["Low pressure", "High wave height"],
      timestamp: "2026-03-20T12:04:00.000Z",
    },
    deps,
  );

  assert.equal(feedbackResult.source, "db");
  if (feedbackResult.source === "db" && feedbackResult.result.ok) {
    assert.equal(feedbackResult.result.feedback?.evaluationId, "MVAL-123");
    assert.deepEqual(feedbackResult.result.feedback?.signalSnapshot, ["Low pressure", "High wave height"]);
  }

  const summary = getMarineIntelligenceDecisionSummary(deps);
  assert.equal(summary.source, "db");

  if (summary.source === "db") {
    assert.equal(summary.result.ok, true);
    assert.equal(summary.result.summary.decisionCount, 1);
    assert.equal(summary.result.summary.telemetryEventCount, 3);
    assert.equal(summary.result.summary.viewCount, 1);
    assert.equal(summary.result.summary.clickCount, 1);
    assert.equal(summary.result.summary.submitDecisionCount, 1);
    assert.equal(summary.result.summary.feedbackCount, 1);
    assert.equal(summary.result.summary.usefulFeedbackCount, 1);
    assert.equal(summary.result.summary.notUsefulFeedbackCount, 0);
    assert.equal(summary.result.summary.feedbackPerWeek[0]?.count, 1);
    assert.equal(summary.result.summary.latestDecision?.id, `MID-${NOW}-1`);
    assert.equal(summary.result.summary.latestTelemetryEvent?.eventType, "submit_decision");
    assert.equal(summary.result.summary.latestFeedback?.useful, true);
  }
});

test("marine intelligence decisions repository validates inputs and handles missing storage", () => {
  const db = createInMemoryDb();

  const invalidDecision = recordMarineIntelligenceDecision(
    {
      investigationId: "",
      stationId: "STA-001",
      decision: "monitor",
      rationale: "Needs follow-up",
      timestamp: "2026-03-20T12:03:00.000Z",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openWritable: () => db,
      now: () => NOW,
    },
  );

  assert.equal(invalidDecision.source, "db");
  if (invalidDecision.source === "db") {
    assert.equal(invalidDecision.result.ok, false);
    assert.equal(invalidDecision.result.reason, "validation");
  }

  const unavailable = recordMarineIntelligenceTelemetryEvent(
    {
      eventType: "view",
      investigationId: "MI-001",
      stationId: "STA-001",
      timestamp: "2026-03-20T12:00:00.000Z",
    },
    {
      resolvePath: () => "missing.sqlite",
      hasPath: () => false,
    },
  );

  assert.equal(unavailable.source, "unavailable");

  const invalidFeedback = recordMarineIntelligenceFeedback(
    {
      useful: true,
      timestamp: "not-a-timestamp",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openWritable: () => db,
      now: () => NOW,
    },
  );

  assert.equal(invalidFeedback.source, "db");
  if (invalidFeedback.source === "db") {
    assert.equal(invalidFeedback.result.ok, false);
    assert.equal(invalidFeedback.result.reason, "validation");
  }

  ensureMarineIntelligenceDecisionTables(db);
});
