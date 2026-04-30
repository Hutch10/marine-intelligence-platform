import test from "node:test";
import assert from "node:assert/strict";
import { createMarineEvent, listMarineEvents } from "./marine-events";
import type { AsyncDbAdapter, AsyncDbRow } from "../db/async-client";

const NOW = Date.parse("2026-03-20T12:00:00.000Z");

function createMockAdapter(): AsyncDbAdapter {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string, options?: { open?: boolean; readOnly?: boolean }) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown[];
        run: (...params: unknown[]) => unknown;
      };
      close: () => void;
    };
  };

  const raw = new DatabaseSync(":memory:");

  return {
    async execute(sql: string, params: unknown[] = []): Promise<AsyncDbRow[]> {
      const stmt = raw.prepare(sql);
      if (sql.trim().toUpperCase().startsWith("SELECT")) {
        return stmt.all(...params) as AsyncDbRow[];
      } else {
        stmt.run(...params);
        return [];
      }
    },
    close() {
      raw.close();
    },
    resourceId: "mock-sqlite-memory",
  };
}

test("marine events repository creates and lists events deterministically", async () => {
  const adapter = createMockAdapter();

  try {
    const createdA = await createMarineEvent(
      adapter,
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
      NOW,
    );

    const createdB = await createMarineEvent(
      adapter,
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
      NOW,
    );

    assert.equal(createdA.ok, true);
    assert.equal(createdB.ok, true);
    // IDs now use timestamp and index
    assert.ok(createdA.event?.id);
    assert.ok(createdB.event?.id);

    const listed = await listMarineEvents(
      adapter,
      {
        region: "north pacific",
        limit: 10,
      }
    );

    assert.equal(listed.ok, true);
    assert.equal(listed.events.length, 2);
    // Sorted by detectedAt DESC
    assert.equal(listed.events[0]?.id, createdB.event?.id);
    assert.equal(listed.events[1]?.id, createdA.event?.id);
  } finally {
    adapter.close();
  }
});

test("marine events repository validates required fields", async () => {
  const adapter = createMockAdapter();

  try {
    const result = await createMarineEvent(
      adapter,
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
      NOW
    );

    assert.equal(result.ok, false);
    assert.equal(result.reason, "validation");
    assert.ok(result.error);
  } finally {
    adapter.close();
  }
});
