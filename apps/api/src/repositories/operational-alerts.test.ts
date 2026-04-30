import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureOperationalAlertsTable,
  getOperationalAlerts,
  getOperationalAlertsWithSummary,
} from "./operational-alerts";
import type { OperationalAlertRuleType, OperationalAlertStatus } from "./operational-alerts";
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
      resourceId: "mock-alerts",
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

async function seedAlert(
  db: MockDatabase,
  input: {
    id: string;
    source: string;
    ruleType: OperationalAlertRuleType;
    severity: "critical" | "warning" | "info";
    status: OperationalAlertStatus;
    detectedAt: number;
    resolvedAt?: number | null;
    investigationId?: string | null;
  },
) {
  const createdAt = new Date(input.detectedAt).toISOString();
  const updatedAtSeed = new Date((input.resolvedAt ?? input.detectedAt) + 1000).toISOString();

  await db.execute(
    `INSERT INTO operational_alerts (id, source, rule_type, severity, status, title, detail, metadata_json, detected_at, resolved_at, created_at, updated_at, investigation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.id,
      input.source,
      input.ruleType,
      input.severity,
      input.status,
      `Alert ${input.id}`,
      null,
      null,
      input.detectedAt,
      input.resolvedAt ?? null,
      createdAt,
      updatedAtSeed,
      input.investigationId ?? null,
    ]
  );
}

async function seedSampleAlerts(db: MockDatabase, idPrefix = "") {
  await ensureOperationalAlertsTable(db.adapter);
  await db.execute(
    `CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT,
      summary TEXT,
      state TEXT,
      confidence INTEGER
    )`
  );

  await seedAlert(db, {
    id: `${idPrefix}alert-active-ioos`,
    source: "ioos_regional",
    ruleType: "source_stale",
    severity: "warning",
    status: "active",
    detectedAt: 170,
  });
  await seedAlert(db, {
    id: `${idPrefix}alert-active-ndbc`,
    source: "noaa_ndbc",
    ruleType: "source_failed",
    severity: "critical",
    status: "active",
    detectedAt: 150,
  });
  await seedAlert(db, {
    id: `${idPrefix}alert-resolved-ioos`,
    source: "ioos_regional",
    ruleType: "source_stale",
    severity: "warning",
    status: "resolved",
    detectedAt: 160,
    resolvedAt: 190,
  });
  await seedAlert(db, {
    id: `${idPrefix}alert-resolved-ndbc`,
    source: "noaa_ndbc",
    ruleType: "source_failed",
    severity: "critical",
    status: "resolved",
    detectedAt: 140,
    resolvedAt: 180,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("operational alerts repository supports active-only filtering", async () => {
  const db1 = new MockDatabase();
  await seedSampleAlerts(db1, "one-");

  const result = await getOperationalAlertsWithSummary(db1.adapter, { status: "active" });

  assert.equal(result.activeAlerts.length, 2);
  assert.ok(result.activeAlerts.every((alert) => alert.status === "active"));
  assert.ok(result.recentHistory.every((alert) => alert.status === "active"));
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), [
    "one-alert-active-ioos",
    "one-alert-active-ndbc",
  ]);

  const db2 = new MockDatabase();
  await ensureOperationalAlertsTable(db2.adapter);
  await db2.execute(
    `CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT,
      summary TEXT,
      state TEXT,
      confidence INTEGER
    )`
  );
  await db2.execute(
    `INSERT INTO investigations (id, title, summary, state, confidence) VALUES (?, ?, ?, ?, ?)`,
    ["INV-1", "Test Investigation", "Summary", "Watch", 80]
  );
  await seedAlert(db2, {
    id: "alert-link-1",
    source: "ioos_regional",
    ruleType: "source_stale",
    severity: "warning",
    status: "active",
    detectedAt: 200,
    investigationId: "INV-1",
  });
  const alerts = await getOperationalAlertsWithSummary(db2.adapter, { status: "active" });
  const alert = alerts.activeAlerts.find(a => a.id === "alert-link-1");
  assert.ok(alert);
  assert.equal(alert.investigationId, "INV-1");
});

test("operational alerts repository supports resolved-only filtering with resolved timestamp ordering", async () => {
  const db = new MockDatabase();
  await seedSampleAlerts(db, "resolved-");

  const result = await getOperationalAlertsWithSummary(db.adapter, { status: "resolved" });

  assert.equal(result.activeAlerts.length, 2);
  assert.equal(result.recentHistory.length, 2);
  assert.ok(result.recentHistory.every((alert) => alert.status === "resolved"));
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), [
    "resolved-alert-resolved-ioos",
    "resolved-alert-resolved-ndbc",
  ]);
});

test("operational alerts repository supports source filtering", async () => {
  const db = new MockDatabase();
  await seedSampleAlerts(db, "src-");

  const result = await getOperationalAlertsWithSummary(db.adapter, { source: "ioos_regional" });

  assert.ok(result.activeAlerts.every((alert) => alert.source === "ioos_regional"));
  assert.ok(result.recentHistory.every((alert) => alert.source === "ioos_regional"));
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), [
    "src-alert-resolved-ioos",
    "src-alert-active-ioos",
  ]);
});

test("operational alerts repository supports ruleType filtering", async () => {
  const db = new MockDatabase();
  await seedSampleAlerts(db, "rt-");

  const result = await getOperationalAlertsWithSummary(db.adapter, { ruleType: "source_failed" });

  assert.ok(result.activeAlerts.every((alert) => alert.ruleType === "source_failed"));
  assert.ok(result.recentHistory.every((alert) => alert.ruleType === "source_failed"));
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), [
    "rt-alert-resolved-ndbc",
    "rt-alert-active-ndbc",
  ]);
});

test("operational alerts repository supports combined status, source, ruleType, and limit filters", async () => {
  const db = new MockDatabase();
  await seedSampleAlerts(db, "combo-");

  const result = await getOperationalAlertsWithSummary(db.adapter, {
    status: "resolved",
    source: "ioos_regional",
    ruleType: "source_stale",
    limit: 1,
  });

  assert.equal(result.activeAlerts.length, 1);
  assert.equal(result.recentHistory.length, 1);
  assert.deepEqual(result.activeAlerts.map((alert) => alert.id), ["combo-alert-active-ioos"]);
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), ["combo-alert-resolved-ioos"]);
});

test("operational alerts repository enforces bounded limit", async () => {
  const db = new MockDatabase();
  await ensureOperationalAlertsTable(db.adapter);
  await db.execute(
    `CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT,
      summary TEXT,
      state TEXT,
      confidence INTEGER
    )`
  );

  for (let index = 0; index < 620; index += 1) {
    await seedAlert(db, {
      id: `bulk-${index}`,
      source: `bulk_source_${index}`,
      ruleType: "source_stale",
      severity: "warning",
      status: "active",
      detectedAt: 1000 + index,
    });
  }

  const capped = await getOperationalAlertsWithSummary(db.adapter, { status: "active", limit: 9999 });
  assert.equal(capped.activeAlerts.length, 500);
  assert.equal(capped.recentHistory.length, 500);

  const floored = await getOperationalAlertsWithSummary(db.adapter, { status: "active", limit: 0 });
  assert.equal(floored.activeAlerts.length, 1);
  assert.equal(floored.recentHistory.length, 1);
});

test("operational alerts repository returns safe empty state", async () => {
  const db = new MockDatabase();
  await ensureOperationalAlertsTable(db.adapter);

  const result = await getOperationalAlertsWithSummary(db.adapter, {});
  assert.equal(result.activeAlerts.length, 0);
  assert.equal(result.recentHistory.length, 0);
});

test("operational alerts repository returns unavailable fallback when db path is missing", async () => {
  const result = await getOperationalAlerts({
    hasPath: () => false,
    resolvePath: () => "missing.sqlite",
  });

  assert.deepEqual(result, {
    source: "unavailable",
    fallbackReason: "db_path_missing",
  });
});

test("operational alerts repository returns unavailable fallback when query fails", async () => {
  const mockAdapter: AsyncDbAdapter = {
    resourceId: "failing-mock",
    execute: async () => {
      throw new Error("query failed");
    },
    close: async () => {},
  };

  const result = await getOperationalAlerts({
    hasPath: () => true,
    resolvePath: () => "marine.sqlite",
    getAdapter: () => mockAdapter,
  });

  assert.deepEqual(result, {
    source: "unavailable",
    fallbackReason: "db_query_failed",
  });
});
