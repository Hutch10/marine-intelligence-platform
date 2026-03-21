import test from "node:test";
import assert from "node:assert/strict";
import { createMarineEvent, listMarineEvents } from "./marine-events";
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

test("marine events repository creates and lists events deterministically", () => {
  const db = createInMemoryDb();

  const createdA = createMarineEvent(
    {
      ontologyTermId: "mdl.threshold_alert",
      eventClass: "threshold_alert",
      severity: "high",
      title: "Thermal threshold exceeded",
      summary: "SST anomaly crossed configured threshold.",
      region: "North Pacific",
      stationId: "STA-001",
      confidence: 88,
      lineage: {
        source: "crw",
        sourceRecordId: "record-1",
        ingestionRunId: "run-1",
        observedAt: "2026-03-20T11:00:00.000Z",
        ingestedAt: "2026-03-20T11:05:00.000Z",
      },
      detectedAt: "2026-03-20T11:06:00.000Z",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openWritable: () => db,
      now: () => NOW,
    },
  );

  const createdB = createMarineEvent(
    {
      ontologyTermId: "mdl.trend_signal",
      eventClass: "trend_signal",
      severity: "medium",
      title: "Trend acceleration",
      summary: "Warming trend accelerated over baseline.",
      region: "North Pacific",
      stationId: "STA-001",
      confidence: 76,
      lineage: {
        source: "ndbc",
        sourceRecordId: "record-2",
        ingestionRunId: "run-2",
        observedAt: "2026-03-20T11:10:00.000Z",
        ingestedAt: "2026-03-20T11:12:00.000Z",
      },
      detectedAt: "2026-03-20T11:13:00.000Z",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openWritable: () => db,
      now: () => NOW,
    },
  );

  assert.equal(createdA.source, "db");
  assert.equal(createdB.source, "db");

  if (createdA.source === "db" && createdB.source === "db") {
    assert.equal(createdA.result.ok, true);
    assert.equal(createdB.result.ok, true);
    assert.equal(createdA.result.event?.id, `MEV-${NOW}-1`);
    assert.equal(createdB.result.event?.id, `MEV-${NOW}-2`);
  }

  const listed = listMarineEvents(
    {
      region: "north pacific",
      limit: 10,
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openReadOnly: () => db,
    },
  );

  assert.equal(listed.source, "db");

  if (listed.source === "db") {
    assert.equal(listed.result.ok, true);
    assert.equal(listed.result.events.length, 2);
    assert.equal(listed.result.events[0]?.id, `MEV-${NOW}-2`);
    assert.equal(listed.result.events[1]?.id, `MEV-${NOW}-1`);
  }
});

test("marine events repository validates required fields", () => {
  const db = createInMemoryDb();

  const result = createMarineEvent(
    {
      ontologyTermId: "",
      eventClass: "threshold_alert",
      severity: "high",
      title: "Invalid event",
      summary: "Missing ontology term",
      region: "North Pacific",
      confidence: 30,
      lineage: {
        source: "crw",
        sourceRecordId: "record-1",
        ingestionRunId: "run-1",
        observedAt: "invalid",
        ingestedAt: "2026-03-20T11:05:00.000Z",
      },
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openWritable: () => db,
      now: () => NOW,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result.ok, false);
    assert.equal(result.result.reason, "validation");
    assert.ok(result.result.error);
  }
});

test("marine events repository returns unavailable when database path is missing", () => {
  const result = listMarineEvents(
    {},
    {
      resolvePath: () => "missing.sqlite",
      hasPath: () => false,
    },
  );

  assert.deepEqual(result, {
    source: "unavailable",
    fallbackReason: "db_path_missing",
  });
});
