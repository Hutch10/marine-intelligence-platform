
// Provide a minimal implementation for seedSampleAlerts for test use
function ensureStation(db: SqliteDatabaseLike, stationId: string) {
  if (!stationId) return;
  try {
    runStatement(
      db,
      `INSERT OR IGNORE INTO stations (id, name, slug, region_id, status, summary, location_label, created_at, updated_at)
       VALUES (?, ?, ?, NULL, 'active', '', '', ?, ?)`,
      stationId,
      stationId,
      stationId,
      new Date().toISOString(),
      new Date().toISOString()
    );
  } catch {}
}

function seedSampleAlerts(db: SqliteDatabaseLike, idPrefix = "") {
  ensureOperationalAlertsTable(db);
  runStatement(
    db,
    `CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT,
      summary TEXT,
      state TEXT,
      confidence INTEGER
    )`
  );
  // Always insert required stations
  ensureStation(db, "station-1");
  ensureStation(db, "station-parity");
  seedAlert(db, {
    id: `${idPrefix}alert-active-ioos`,
    source: "ioos_regional",
    ruleType: "source_stale",
    severity: "warning",
    status: "active",
    detectedAt: 170,
    // stationId: "station-1" // add if needed
  });
  seedAlert(db, {
    id: `${idPrefix}alert-active-ndbc`,
    source: "noaa_ndbc",
    ruleType: "source_failed",
    severity: "critical",
    status: "active",
    detectedAt: 150,
    // stationId: "station-1"
  });
  seedAlert(db, {
    id: `${idPrefix}alert-resolved-ioos`,
    source: "ioos_regional",
    ruleType: "source_stale",
    severity: "warning",
    status: "resolved",
    detectedAt: 160,
    resolvedAt: 190,
    // stationId: "station-1"
  });
  seedAlert(db, {
    id: `${idPrefix}alert-resolved-ndbc`,
    source: "noaa_ndbc",
    ruleType: "source_failed",
    severity: "critical",
    status: "resolved",
    detectedAt: 140,
    resolvedAt: 180,
    // stationId: "station-1"
  });
}

import test from "node:test";
import assert from "node:assert/strict";
import {
  ensureOperationalAlertsTable,
  getOperationalAlerts,
  getOperationalAlertsWithSummary,
} from "./operational-alerts";
import type { OperationalAlertRuleType, OperationalAlertStatus } from "./operational-alerts";
import type { SqliteDatabaseLike } from "../db/client";

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

function runStatement(db: SqliteDatabaseLike, sql: string, ...params: unknown[]) {
  const statement = db.prepare(sql);

  if (typeof statement.run === "function") {
    statement.run(...params);
  }

  statement.all(...params);
}

function seedAlert(
  db: SqliteDatabaseLike,
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

  runStatement(
    db,
    `INSERT INTO operational_alerts (id, source, rule_type, severity, status, title, detail, metadata_json, detected_at, resolved_at, created_at, updated_at, investigation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
  );
    // Removed stray duplicated SQL fragment
  const updatedAt2 = new Date((input.resolvedAt ?? input.detectedAt) + 1000).toISOString();
  runStatement(
    db,
    `INSERT INTO operational_alerts
      (id, source, rule_type, severity, status, title, detail, metadata_json, detected_at, resolved_at, created_at, updated_at, investigation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
    updatedAt2,
    input.investigationId ?? null,
  // Provide a minimal implementation for seedSampleAlerts for test use
  function seedSampleAlerts(db: SqliteDatabaseLike) {
    seedAlert(db, {
      id: "alert-active-ioos",
      source: "ioos_regional",
      ruleType: "source_stale",
      severity: "warning",
      status: "active",
      detectedAt: 170,
    });
    seedAlert(db, {
      id: "alert-active-ndbc",
      source: "noaa_ndbc",
      ruleType: "source_failed",
      severity: "critical",
      status: "active",
      detectedAt: 150,
    });
    seedAlert(db, {
      id: "alert-resolved-ioos",
      source: "ioos_regional",
      ruleType: "source_stale",
      severity: "warning",
      status: "resolved",
      detectedAt: 160,
      resolvedAt: 190,
    });
    seedAlert(db, {
      id: "alert-resolved-ndbc",
      source: "noaa_ndbc",
      ruleType: "source_failed",
      severity: "critical",
      status: "resolved",
      detectedAt: 140,
      resolvedAt: 180,
    });
  }
  );
  // ...existing code...
}

test("operational alerts repository supports active-only filtering", () => {
  const db1 = createInMemoryDb();
  seedSampleAlerts(db1, "one-");

  const result = getOperationalAlertsWithSummary(db1, { status: "active" });

  assert.equal(result.activeAlerts.length, 2);
  assert.ok(result.activeAlerts.every((alert) => alert.status === "active"));
  assert.ok(result.recentHistory.every((alert) => alert.status === "active"));
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), [
    "one-alert-active-ioos",
    "one-alert-active-ndbc",
  ]);

  const db2 = createInMemoryDb();
  ensureOperationalAlertsTable(db2);
  runStatement(
    db2,
    `CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT,
      summary TEXT,
      state TEXT,
      confidence INTEGER
    )`
  );
  runStatement(
    db2,
    `INSERT INTO investigations (id, title, summary, state, confidence) VALUES (?, ?, ?, ?, ?)`,
    "INV-1", "Test Investigation", "Summary", "Watch", 80
  );
  seedAlert(db2, {
    id: "alert-link-1",
    source: "ioos_regional",
    ruleType: "source_stale",
    severity: "warning",
    status: "active",
    detectedAt: 200,
    investigationId: "INV-1",
  });
  const alerts = getOperationalAlertsWithSummary(db2, { status: "active" });
  const alert = alerts.activeAlerts.find(a => a.id === "alert-link-1");
  assert.ok(alert);
  assert.equal(alert.investigationId, "INV-1");
});

test("operational alerts repository supports resolved-only filtering with resolved timestamp ordering", () => {
  const db = createInMemoryDb();
  seedSampleAlerts(db, "resolved-");

  const result = getOperationalAlertsWithSummary(db, { status: "resolved" });

  assert.equal(result.activeAlerts.length, 2);
  assert.equal(result.recentHistory.length, 2);
  assert.ok(result.recentHistory.every((alert) => alert.status === "resolved"));
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), [
    "resolved-alert-resolved-ioos",
    "resolved-alert-resolved-ndbc",
  ]);
});

test("operational alerts repository supports source filtering", () => {
  const db = createInMemoryDb();
  seedSampleAlerts(db, "src-");

  const result = getOperationalAlertsWithSummary(db, { source: "ioos_regional" });

  assert.ok(result.activeAlerts.every((alert) => alert.source === "ioos_regional"));
  assert.ok(result.recentHistory.every((alert) => alert.source === "ioos_regional"));
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), [
    "src-alert-resolved-ioos",
    "src-alert-active-ioos",
  ]);
});

test("operational alerts repository supports ruleType filtering", () => {
  const db = createInMemoryDb();
  seedSampleAlerts(db, "rt-");

  const result = getOperationalAlertsWithSummary(db, { ruleType: "source_failed" });

  assert.ok(result.activeAlerts.every((alert) => alert.ruleType === "source_failed"));
  assert.ok(result.recentHistory.every((alert) => alert.ruleType === "source_failed"));
  assert.deepEqual(result.recentHistory.map((alert) => alert.id), [
    "rt-alert-resolved-ndbc",
    "rt-alert-active-ndbc",
  ]);
});

test("operational alerts repository supports combined status, source, ruleType, and limit filters", () => {
  const db = createInMemoryDb();
  seedSampleAlerts(db, "combo-");

  const result = getOperationalAlertsWithSummary(db, {
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

test("operational alerts repository enforces bounded limit", () => {
  const db = createInMemoryDb();
  ensureOperationalAlertsTable(db);

  for (let index = 0; index < 620; index += 1) {
    seedAlert(db, {
      id: `bulk-${index}`,
      source: `bulk_source_${index}`,
      ruleType: "source_stale",
      severity: "warning",
      status: "active",
      detectedAt: 1000 + index,
    });
  }

  const capped = getOperationalAlertsWithSummary(db, { status: "active", limit: 9999 });
  assert.equal(capped.activeAlerts.length, 500);
  assert.equal(capped.recentHistory.length, 500);

  const floored = getOperationalAlertsWithSummary(db, { status: "active", limit: 0 });
  assert.equal(floored.activeAlerts.length, 1);
  assert.equal(floored.recentHistory.length, 1);
});

test("operational alerts repository returns safe empty state", () => {
  const db = createInMemoryDb();
  ensureOperationalAlertsTable(db);

  const result = getOperationalAlertsWithSummary(db, {});
  assert.equal(result.activeAlerts.length, 0);
  assert.equal(result.recentHistory.length, 0);
});

test("operational alerts repository returns unavailable fallback when db path is missing", () => {
  const result = getOperationalAlerts({
    hasPath: () => false,
    resolvePath: () => "missing.sqlite",
  });

  assert.deepEqual(result, {
    source: "unavailable",
    fallbackReason: "db_path_missing",
  });
});

test("operational alerts repository returns unavailable fallback when query fails", () => {
  const failingDb: SqliteDatabaseLike = {
    prepare() {
      throw new Error("query failed");
    },
    close() {
      return undefined;
    },
  };

  const result = getOperationalAlerts({
    hasPath: () => true,
    resolvePath: () => "marine.sqlite",
    openReadOnly: () => failingDb,
  });

  assert.deepEqual(result, {
    source: "unavailable",
    fallbackReason: "db_query_failed",
  });
});
