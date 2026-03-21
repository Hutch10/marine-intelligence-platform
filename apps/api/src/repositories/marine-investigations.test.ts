import test from "node:test";
import assert from "node:assert/strict";
import {
  correlateOrCreateMarineEvent,
} from "./marine-event-correlation";
import {
  createMarineInvestigation,
  getMarineInvestigation,
  listMarineInvestigations,
  transitionMarineInvestigation,
} from "./marine-investigations";
import type { SqliteDatabaseLike } from "../db/client";

const NOW = Date.parse("2026-03-20T12:00:00.000Z");

function createInMemoryDb(): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (
      path: string,
      options?: { open?: boolean; readOnly?: boolean },
    ) => {
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

// --- Investigation repository tests ---

test("marine investigations repository creates and retrieves an investigation", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    openReadOnly: () => db,
    now: () => NOW,
  };

  const created = createMarineInvestigation(
    { eventId: "MEV-001", title: "Investigate reef stress event" },
    deps,
  );

  assert.equal(created.source, "db");
  if (created.source === "db") {
    assert.equal(created.result.ok, true);
    assert.equal(created.result.investigation?.id, `MIID-${NOW}-1`);
    assert.equal(created.result.investigation?.status, "open");
    assert.equal(created.result.investigation?.eventId, "MEV-001");
    assert.equal(created.result.investigation?.title, "Investigate reef stress event");
    assert.equal(created.result.investigation?.acknowledgedAt, null);
  }

  const retrieved = getMarineInvestigation(`MIID-${NOW}-1`, deps);
  assert.equal(retrieved.source, "db");
  if (retrieved.source === "db") {
    assert.equal(retrieved.result.ok, true);
    assert.equal(
      retrieved.result.investigation?.title,
      "Investigate reef stress event",
    );
  }
});

test("marine investigations repository rejects missing eventId and missing title", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    now: () => NOW,
  };

  const noEventId = createMarineInvestigation(
    { eventId: "", title: "Valid title" },
    deps,
  );
  assert.equal(noEventId.source, "db");
  if (noEventId.source === "db") {
    assert.equal(noEventId.result.ok, false);
    assert.equal(noEventId.result.reason, "validation");
  }

  const blankTitle = createMarineInvestigation(
    { eventId: "MEV-002", title: "  " },
    deps,
  );
  assert.equal(blankTitle.source, "db");
  if (blankTitle.source === "db") {
    assert.equal(blankTitle.result.ok, false);
    assert.equal(blankTitle.result.reason, "validation");
  }
});

test("marine investigations repository applies full open-to-resolved lifecycle", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    openReadOnly: () => db,
    now: () => NOW,
  };

  createMarineInvestigation(
    { eventId: "MEV-002", title: "Full lifecycle test" },
    deps,
  );

  const inv1 = `MIID-${NOW}-1`;

  const acked = transitionMarineInvestigation(inv1, "acknowledge", null, deps);
  assert.equal(acked.source, "db");
  if (acked.source === "db") {
    assert.equal(acked.result.ok, true);
    assert.equal(acked.result.investigation?.status, "acknowledged");
    assert.equal(typeof acked.result.investigation?.acknowledgedAt, "string");
    assert.equal(acked.result.investigation?.resolvedAt, null);
  }

  const reviewed = transitionMarineInvestigation(inv1, "start_review", null, deps);
  if (reviewed.source === "db") {
    assert.equal(reviewed.result.ok, true);
    assert.equal(reviewed.result.investigation?.status, "in_review");
  }

  const resolved = transitionMarineInvestigation(
    inv1,
    "resolve",
    "Confirmed and addressed.",
    deps,
  );
  if (resolved.source === "db") {
    assert.equal(resolved.result.ok, true);
    assert.equal(resolved.result.investigation?.status, "resolved");
    assert.equal(
      resolved.result.investigation?.notes,
      "Confirmed and addressed.",
    );
    assert.equal(typeof resolved.result.investigation?.resolvedAt, "string");
  }
});

test("marine investigations repository rejects invalid state machine transitions", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    now: () => NOW,
  };

  createMarineInvestigation(
    { eventId: "MEV-003", title: "Invalid transition test" },
    deps,
  );

  // Cannot resolve an open investigation directly.
  const bad = transitionMarineInvestigation(
    `MIID-${NOW}-1`,
    "resolve",
    null,
    deps,
  );
  if (bad.source === "db") {
    assert.equal(bad.result.ok, false);
    assert.equal(bad.result.reason, "invalid_transition");
  }

  // Cannot dismiss either — also invalid from open.
  const bad2 = transitionMarineInvestigation(
    `MIID-${NOW}-1`,
    "dismiss",
    null,
    deps,
  );
  if (bad2.source === "db") {
    assert.equal(bad2.result.ok, false);
    assert.equal(bad2.result.reason, "invalid_transition");
  }
});

test("marine investigations repository lists by eventId and status filters", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    openReadOnly: () => db,
    now: () => NOW,
  };

  createMarineInvestigation({ eventId: "MEV-010", title: "Alpha" }, deps);
  createMarineInvestigation({ eventId: "MEV-011", title: "Beta" }, deps);

  const all = listMarineInvestigations({}, deps);
  assert.equal(all.source, "db");
  if (all.source === "db") {
    assert.equal(all.result.investigations.length, 2);
  }

  const byEvent = listMarineInvestigations({ eventId: "MEV-010" }, deps);
  if (byEvent.source === "db") {
    assert.equal(byEvent.result.investigations.length, 1);
    assert.equal(byEvent.result.investigations[0]?.eventId, "MEV-010");
  }

  const byStatus = listMarineInvestigations({ status: "open" }, deps);
  if (byStatus.source === "db") {
    assert.equal(byStatus.result.investigations.length, 2);
  }
});

test("marine investigations repository returns unavailable when database path is missing", () => {
  const result = createMarineInvestigation(
    { eventId: "MEV-001", title: "test" },
    {
      resolvePath: () => "nonexistent.sqlite",
      hasPath: () => false,
    },
  );
  assert.equal(result.source, "unavailable");
  if (result.source === "unavailable") {
    assert.equal(result.fallbackReason, "db_path_missing");
  }
});

// --- Correlation repository tests ---

test("correlateOrCreateMarineEvent creates a new event when no duplicate exists", () => {
  const db = createInMemoryDb();

  const result = correlateOrCreateMarineEvent(
    {
      ontologyTermId: "mdl.threshold_alert",
      eventClass: "threshold_alert",
      severity: "high",
      status: "detected",
      title: "Thermal alert",
      summary: "SST exceeded threshold.",
      region: "North Pacific",
      stationId: "STA-001",
      confidence: 82,
      lineage: {
        source: "crw",
        sourceRecordId: "rec-corr-1",
        ingestionRunId: "run-corr-1",
        observedAt: "2026-03-20T10:00:00.000Z",
        ingestedAt: "2026-03-20T10:05:00.000Z",
      },
      detectedAt: "2026-03-20T10:05:00.000Z",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openWritable: () => db,
      now: () => NOW,
      correlationWindowMs: 60 * 60 * 1000,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.matched, false);
    if (!result.matched) {
      assert.equal(result.newEvent.id, `MEV-${NOW}-1`);
      assert.equal(result.newEvent.region, "North Pacific");
    }
  }
});

test("correlateOrCreateMarineEvent deduplicates an event within the correlation window", () => {
  const db = createInMemoryDb();
  const baseInput = {
    ontologyTermId: "mdl.threshold_alert",
    eventClass: "threshold_alert" as const,
    severity: "high" as const,
    status: "detected" as const,
    title: "Thermal alert",
    summary: "SST exceeded threshold.",
    region: "Coral Sea",
    stationId: "STA-002",
    confidence: 80,
    lineage: {
      source: "crw",
      sourceRecordId: "rec-dedup-1",
      ingestionRunId: "run-dedup-1",
      observedAt: "2026-03-20T11:00:00.000Z",
      ingestedAt: "2026-03-20T11:05:00.000Z",
    },
    detectedAt: "2026-03-20T11:05:00.000Z",
  };

  const first = correlateOrCreateMarineEvent(baseInput, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    now: () => NOW,
    correlationWindowMs: 60 * 60 * 1000,
  });

  assert.equal(first.source, "db");

  // Second call for the same event within the window — should deduplicate.
  const second = correlateOrCreateMarineEvent(
    { ...baseInput, lineage: { ...baseInput.lineage, sourceRecordId: "rec-dedup-2" } },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openWritable: () => db,
      now: () => NOW, // same wall-clock snapshot keeps the window anchored identically
      correlationWindowMs: 60 * 60 * 1000,
    },
  );

  assert.equal(second.source, "db");
  if (second.source === "db") {
    assert.equal(second.matched, true);
    if (second.matched) {
      assert.equal(second.existingEventId, `MEV-${NOW}-1`);
    }
  }
});
