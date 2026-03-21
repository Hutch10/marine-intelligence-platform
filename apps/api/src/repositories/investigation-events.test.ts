import test from "node:test";
import assert from "node:assert/strict";
import {
  getInvestigationTimeline,
  recordInvestigationEvent,
  type RecordInvestigationEventInput,
} from "./investigation-events";
import type { SqliteDatabaseLike } from "../db/client";

type EventRow = {
  id: string;
  investigation_id: string;
  event_type: string;
  source: string;
  actor: string | null;
  summary: string;
  detail: string | null;
  confidence: number | null;
  created_at: number;
};

function createFakeDatabase(initialEvents: EventRow[] = []): SqliteDatabaseLike {
  const investigations = new Set<string>(["TRK-201", "TRK-187"]);
  const events: EventRow[] = [...initialEvents];

  return {
    prepare(sql: string) {
      const normalized = sql.replace(/\s+/g, " ").trim();

      if (normalized.startsWith("CREATE TABLE IF NOT EXISTS investigation_events")) {
        return {
          run() {
            return undefined;
          },
          all() {
            return [];
          },
        };
      }

      if (normalized.startsWith("SELECT id FROM investigations WHERE id = ?")) {
        return {
          all(investigationId: unknown) {
            return investigations.has(String(investigationId)) ? [{ id: String(investigationId) }] : [];
          },
        };
      }

      if (normalized.includes("WHERE investigation_id = ? AND event_type = ? AND source = ? AND summary = ?")) {
        return {
          all(investigationId: unknown, eventType: unknown, source: unknown, summary: unknown) {
            return events
              .filter(
                (row) =>
                  row.investigation_id === String(investigationId)
                  && row.event_type === String(eventType)
                  && row.source === String(source)
                  && row.summary === String(summary),
              )
              .sort((a, b) => b.created_at - a.created_at)
              .slice(0, 1)
              .map((row) => ({
                id: row.id,
                event_type: row.event_type,
                source: row.source,
                summary: row.summary,
                detail: row.detail,
                created_at: row.created_at,
              }));
          },
        };
      }

      if (normalized.startsWith("INSERT INTO investigation_events")) {
        return {
          run(
            id: unknown,
            investigationId: unknown,
            eventType: unknown,
            source: unknown,
            actor: unknown,
            summary: unknown,
            detail: unknown,
            confidence: unknown,
            createdAt: unknown,
          ) {
            events.push({
              id: String(id),
              investigation_id: String(investigationId),
              event_type: String(eventType),
              source: String(source),
              actor: actor == null ? null : String(actor),
              summary: String(summary),
              detail: detail == null ? null : String(detail),
              confidence: confidence == null ? null : Number(confidence),
              created_at: Number(createdAt),
            });
          },
          all() {
            return [];
          },
        };
      }

      if (normalized.includes("WHERE investigation_id = ? AND event_type = ? ORDER BY created_at DESC")) {
        return {
          all(investigationId: unknown, eventType: unknown, limit: unknown) {
            const bounded = Number(limit);
            return events
              .filter(
                (row) => row.investigation_id === String(investigationId) && row.event_type === String(eventType),
              )
              .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
              .slice(0, bounded)
              .map((row) => ({
                id: row.id,
                event_type: row.event_type,
                source: row.source,
                summary: row.summary,
                detail: row.detail,
                created_at: row.created_at,
              }));
          },
        };
      }

      if (normalized.includes("WHERE investigation_id = ? ORDER BY created_at DESC")) {
        return {
          all(investigationId: unknown, limit: unknown) {
            const bounded = Number(limit);
            return events
              .filter((row) => row.investigation_id === String(investigationId))
              .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
              .slice(0, bounded)
              .map((row) => ({
                id: row.id,
                event_type: row.event_type,
                source: row.source,
                summary: row.summary,
                detail: row.detail,
                created_at: row.created_at,
              }));
          },
        };
      }

      throw new Error(`Unhandled SQL in test fake: ${normalized}`);
    },
    close() {
      return undefined;
    },
  };
}

function baseEvent(overrides: Partial<EventRow>): EventRow {
  return {
    id: "EVT-BASE",
    investigation_id: "TRK-201",
    event_type: "signal_linked",
    source: "System",
    actor: null,
    summary: "Signal linked",
    detail: null,
    confidence: null,
    created_at: 1_710_000_000_000,
    ...overrides,
  };
}

function runRecord(
  input: RecordInvestigationEventInput,
  db: SqliteDatabaseLike,
  nowValue = 1_710_100_000_000,
) {
  return recordInvestigationEvent(input, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    now: () => nowValue,
  });
}

test("investigation events repository returns timeline ordered by created_at descending", () => {
  const db = createFakeDatabase([
    baseEvent({ id: "EVT-1", created_at: 1_710_000_000_000, summary: "old" }),
    baseEvent({ id: "EVT-2", created_at: 1_710_000_100_000, summary: "newest" }),
    baseEvent({ id: "EVT-3", created_at: 1_710_000_050_000, summary: "middle" }),
  ]);

  const result = getInvestigationTimeline("TRK-201", {}, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openReadOnly: () => db,
    now: () => 1_710_100_000_000,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.timeline.map((item) => item.summary), ["newest", "middle", "old"]);
  }
});

test("investigation events repository supports event type filtering", () => {
  const db = createFakeDatabase([
    baseEvent({ id: "EVT-1", event_type: "signal_linked", summary: "signal" }),
    baseEvent({ id: "EVT-2", event_type: "hypothesis_tested", summary: "hypothesis" }),
  ]);

  const result = getInvestigationTimeline(
    "TRK-201",
    { eventType: "hypothesis_tested" },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openReadOnly: () => db,
      now: () => 1_710_100_000_000,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.timeline.length, 1);
    assert.equal(result.timeline[0]?.eventType, "hypothesis_tested");
    assert.equal(result.timeline[0]?.summary, "hypothesis");
  }
});

test("recordInvestigationEvent creates a timeline event", () => {
  const db = createFakeDatabase();

  const recordResult = runRecord(
    {
      investigationId: "TRK-201",
      eventType: "evidence_promoted",
      source: "Analyst",
      actor: "pilot.analyst@marine.local",
      summary: "Promoted EV-900",
      detail: "Field report promoted into active evidence stack.",
      confidence: 83,
    },
    db,
  );

  assert.equal(recordResult.source, "db");
  if (recordResult.source === "db") {
    assert.equal(recordResult.result, "created");
    if (recordResult.result === "created") {
      assert.equal(recordResult.event.eventType, "evidence_promoted");
      assert.equal(recordResult.event.source, "Analyst");
      assert.equal(recordResult.event.summary, "Promoted EV-900");
    }
  }

  const timeline = getInvestigationTimeline("TRK-201", {}, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openReadOnly: () => db,
    now: () => 1_710_100_000_000,
  });

  assert.equal(timeline.source, "db");
  if (timeline.source === "db") {
    assert.equal(timeline.timeline.length, 1);
    assert.equal(timeline.timeline[0]?.eventType, "evidence_promoted");
  }
});

test("recordInvestigationEvent returns not_found for unknown investigation", () => {
  const db = createFakeDatabase();

  const result = runRecord(
    {
      investigationId: "TRK-MISSING",
      eventType: "signal_linked",
      source: "System",
      summary: "Unknown investigation",
    },
    db,
  );

  assert.deepEqual(result, {
    source: "db",
    result: "not_found",
  });
});

test("investigation events repository falls back when DB path is missing", () => {
  const timelineResult = getInvestigationTimeline("TRK-201", {}, {
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(timelineResult, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  const recordResult = recordInvestigationEvent(
    {
      investigationId: "TRK-201",
      eventType: "signal_linked",
      source: "System",
      summary: "Should fallback",
    },
    {
      resolvePath: () => "missing.sqlite",
      hasPath: () => false,
    },
  );

  assert.deepEqual(recordResult, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });
});
