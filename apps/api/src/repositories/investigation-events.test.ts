import test from "node:test";
import assert from "node:assert/strict";
import {
  getInvestigationTimeline,
  recordInvestigationEvent,
} from "./investigation-events";
import { AsyncDbAdapter } from "../db/async-client";

// ---------------------------------------------------------------------------
// Mock DB factory
// ---------------------------------------------------------------------------

class MockDatabase {
  private runtimeRequire = eval("require") as NodeRequire;
  private db: any;

  constructor() {
    const { DatabaseSync } = this.runtimeRequire("node:sqlite") as any;
    this.db = new DatabaseSync(":memory:");
  }

  get adapter(): AsyncDbAdapter {
    return {
      resourceId: "mock-investigation-events",
      execute: async (sql: string, params: unknown[] = []) => {
        const stmt = this.db.prepare(sql);
        if (sql.trim().toUpperCase().startsWith("SELECT")) {
          return stmt.all(...params);
        } else {
          return stmt.run(...params);
        }
      },
      close: async () => {},
    };
  }

  async execute(sql: string, params: unknown[] = []) {
    const stmt = this.db.prepare(sql);
    if (sql.trim().toUpperCase().startsWith("SELECT")) {
      return stmt.all(...params);
    } else {
      return stmt.run(...params);
    }
  }
}

async function seedTimeline(db: MockDatabase, investigationId: string) {
  await db.execute(
    `CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT,
      summary TEXT,
      state TEXT,
      confidence INTEGER
    )`
  );
  await db.execute(
    `INSERT INTO investigations (id, title, summary, state, confidence) VALUES (?, ?, ?, ?, ?)`,
    [investigationId, "Test Investigation", "Summary", "active", 50]
  );

  await db.execute(
    `CREATE TABLE IF NOT EXISTS investigation_events (
      id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id),
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      actor TEXT,
      summary TEXT NOT NULL,
      detail TEXT,
      confidence INTEGER,
      created_at INTEGER NOT NULL
    )`
  );

  await db.execute(
    `INSERT INTO investigation_events (id, investigation_id, event_type, source, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["evt-1", investigationId, "case_opened", "system", "Case opened", 1000]
  );
  await db.execute(
    `INSERT INTO investigation_events (id, investigation_id, event_type, source, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["evt-2", investigationId, "signal_linked", "sensor", "Signal linked", 2000]
  );
  await db.execute(
    `INSERT INTO investigation_events (id, investigation_id, event_type, source, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["evt-3", investigationId, "hypothesis_tested", "analyst", "Hypothesis tested", 1500]
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("investigation events repository returns timeline ordered by created_at descending", async () => {
  const db = new MockDatabase();
  const investigationId = "INV-001";
  await seedTimeline(db, investigationId);

  const result = await getInvestigationTimeline(investigationId, {}, {
    hasPath: () => true,
    getAdapter: () => db.adapter,
    now: () => 3000,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.timeline.length, 3);
    assert.equal(result.timeline[0].id, "evt-2"); // 2000
    assert.equal(result.timeline[1].id, "evt-3"); // 1500
    assert.equal(result.timeline[2].id, "evt-1"); // 1000
  }
});

test("investigation events repository supports event type filtering", async () => {
  const db = new MockDatabase();
  const investigationId = "INV-002";
  await seedTimeline(db, investigationId);

  const result = await getInvestigationTimeline(investigationId, { eventType: "signal_linked" }, {
    hasPath: () => true,
    getAdapter: () => db.adapter,
    now: () => 3000,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.timeline.length, 1);
    assert.equal(result.timeline[0].eventType, "signal_linked");
  }
});

test("recordInvestigationEvent creates a timeline event", async () => {
  const db = new MockDatabase();
  const investigationId = "INV-003";
  await seedTimeline(db, investigationId);

  const result = await recordInvestigationEvent({
    investigationId,
    eventType: "evidence_promoted",
    source: "analyst-1",
    summary: "Promoted evidence",
    detail: "High confidence correlation",
  }, {
    hasPath: () => true,
    getAdapter: () => db.adapter,
    now: () => 4000,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "created");
    assert.equal(result.event.eventType, "evidence_promoted");
    assert.equal(result.event.summary, "Promoted evidence");
  }

  // Verify DB state
  const rows = await db.execute("SELECT * FROM investigation_events WHERE investigation_id = ? AND event_type = ?", [investigationId, "evidence_promoted"]);
  assert.equal(rows.length, 1);
});

test("recordInvestigationEvent returns not_found for unknown investigation", async () => {
  const db = new MockDatabase();
  await db.execute(
    `CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT,
      summary TEXT,
      state TEXT,
      confidence INTEGER
    )`
  );

  const result = await recordInvestigationEvent({
    investigationId: "INV-MISSING",
    eventType: "signal_linked",
    source: "test",
    summary: "test",
  }, {
    hasPath: () => true,
    getAdapter: () => db.adapter,
    now: () => 4000,
  });

  assert.deepEqual(result, {
    source: "db",
    result: "not_found",
  });
});

test("investigation events repository falls back when DB path is missing", async () => {
  const result = await getInvestigationTimeline("INV-001", {}, {
    hasPath: () => false,
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });
});
