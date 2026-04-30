import test from "node:test";
import assert from "node:assert/strict";
import {
  createMarineInvestigation,
  getMarineInvestigation,
  listMarineInvestigations,
  transitionMarineInvestigation,
} from "./marine-investigations";
import type { AsyncDbAdapter } from "../db/async-client";

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
      resourceId: "mock-marine-investigations",
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("createMarineInvestigation issues a MIID and stores investigation", async () => {
  const db = new MockDatabase();
  const result = await createMarineInvestigation(
    { eventId: "evt-001", title: "Anomalous Pressure Reading" },
    { getAdapter: () => db.adapter, now: () => 1700000000000 }
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.result.ok);
    assert.ok(result.result.investigation?.id.startsWith("MIID-1700000000000-1"));
    assert.equal(result.result.investigation?.title, "Anomalous Pressure Reading");
  }
});

test("getMarineInvestigation retrieves an existing record", async () => {
  const db = new MockDatabase();
  const createResult = await createMarineInvestigation(
    { eventId: "evt-002", title: "Cavitation Event" },
    { getAdapter: () => db.adapter, now: () => 1700000000000 }
  );

  assert.equal(createResult.source, "db");
  if (createResult.source === "db" && createResult.result.ok && createResult.result.investigation) {
    const id = createResult.result.investigation.id;
    const getResult = await getMarineInvestigation(id, { getAdapter: () => db.adapter });
    assert.equal(getResult.source, "db");
    if (getResult.source === "db") {
      assert.ok(getResult.result.ok);
      assert.equal(getResult.result.investigation?.id, id);
    }
  }
});

test("listMarineInvestigations supports filtering by eventId", async () => {
  const db = new MockDatabase();
  await createMarineInvestigation({ eventId: "E1", title: "T1" }, { getAdapter: () => db.adapter });
  await createMarineInvestigation({ eventId: "E2", title: "T2" }, { getAdapter: () => db.adapter });

  const result = await listMarineInvestigations({ eventId: "E1" }, { getAdapter: () => db.adapter });
  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result.investigations.length, 1);
    assert.equal(result.result.investigations[0].eventId, "E1");
  }
});

test("transitionMarineInvestigation follows status lifecycle", async () => {
  const db = new MockDatabase();
  const createResult = await createMarineInvestigation(
    { eventId: "evt-003", title: "Structural Fatigue" },
    { getAdapter: () => db.adapter }
  );

  assert.equal(createResult.source, "db");
  if (createResult.source === "db" && createResult.result.ok && createResult.result.investigation) {
    const id = createResult.result.investigation.id;

    // Open -> Acknowledged
    const trans1 = await transitionMarineInvestigation(id, "acknowledge", "Acknowledged by Ops", { getAdapter: () => db.adapter });
    assert.equal(trans1.source, "db");
    if (trans1.source === "db") {
      assert.ok(trans1.result.ok);
      assert.equal(trans1.result.investigation?.status, "acknowledged");
    }

    // Acknowledged -> In Review
    const trans2 = await transitionMarineInvestigation(id, "start_review", null, { getAdapter: () => db.adapter });
    assert.equal(trans2.source, "db");
    if (trans2.source === "db") {
      assert.ok(trans2.result.ok);
      assert.equal(trans2.result.investigation?.status, "in_review");
    }
  }
});

test("transitionMarineInvestigation rejects invalid transitions", async () => {
  const db = new MockDatabase();
  const createResult = await createMarineInvestigation(
    { eventId: "evt-004", title: "Ghost Signal" },
    { getAdapter: () => db.adapter }
  );

  assert.equal(createResult.source, "db");
  if (createResult.source === "db" && createResult.result.ok && createResult.result.investigation) {
    const id = createResult.result.investigation.id;

    // Open -> Resolve (Invalid, must go through In Review)
    const result = await transitionMarineInvestigation(id, "resolve", null, { getAdapter: () => db.adapter });
    assert.equal(result.source, "db");
    if (result.source === "db") {
      assert.equal(result.result.ok, false);
      assert.equal(result.result.reason, "invalid_transition");
    }
  }
});
