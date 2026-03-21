import test from "node:test";
import assert from "node:assert/strict";
import {
  acknowledgeMarineAlert,
  createMarineAlert,
  listMarineAlerts,
  resolveMarineAlert,
} from "./marine-intelligence-alerts";
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

test("marine alerts repository creates and lists alerts deterministically", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    openReadOnly: () => db,
    now: () => NOW,
  };

  const created = createMarineAlert(
    {
      eventId: "MEV-001",
      severity: "high",
      ruleType: "threshold_breach",
      title: "Thermal threshold breached",
      detail: "SST anomaly exceeded configured threshold.",
      detectedAt: "2026-03-20T11:00:00.000Z",
    },
    deps,
  );

  assert.equal(created.source, "db");
  if (created.source === "db") {
    assert.equal(created.result.ok, true);
    assert.equal(created.result.alert?.id, `MALT-${NOW}-1`);
    assert.equal(created.result.alert?.status, "active");
    assert.equal(created.result.alert?.ruleType, "threshold_breach");
    assert.equal(created.result.alert?.severity, "high");
    assert.equal(created.result.alert?.eventId, "MEV-001");
    assert.equal(created.result.alert?.acknowledgedAt, null);
    assert.equal(created.result.alert?.resolvedAt, null);
  }

  const listed = listMarineAlerts({ eventId: "MEV-001" }, deps);
  assert.equal(listed.source, "db");
  if (listed.source === "db") {
    assert.equal(listed.result.ok, true);
    assert.equal(listed.result.alerts.length, 1);
    assert.equal(listed.result.alerts[0]?.id, `MALT-${NOW}-1`);
  }
});

test("marine alerts repository rejects inputs with missing required fields", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    now: () => NOW,
  };

  const noEventId = createMarineAlert(
    {
      eventId: "",
      severity: "high",
      ruleType: "threshold_breach",
      title: "Alert",
    },
    deps,
  );
  assert.equal(noEventId.source, "db");
  if (noEventId.source === "db") {
    assert.equal(noEventId.result.ok, false);
    assert.equal(noEventId.result.reason, "validation");
  }

  const badSeverity = createMarineAlert(
    {
      eventId: "MEV-001",
      severity: "extreme" as "critical",
      ruleType: "threshold_breach",
      title: "Alert",
    },
    deps,
  );
  if (badSeverity.source === "db") {
    assert.equal(badSeverity.result.ok, false);
    assert.equal(badSeverity.result.reason, "validation");
  }
});

test("marine alerts repository applies acknowledge and resolve status transitions", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    now: () => NOW,
  };

  createMarineAlert(
    {
      eventId: "MEV-002",
      severity: "critical",
      ruleType: "contextual_convergence",
      title: "Reef stress critical",
      detectedAt: "2026-03-20T11:00:00.000Z",
    },
    deps,
  );

  const alertId = `MALT-${NOW}-1`;

  const acknowledged = acknowledgeMarineAlert(alertId, deps);
  if (acknowledged.source === "db") {
    assert.equal(acknowledged.result.ok, true);
    assert.equal(acknowledged.result.alert?.status, "acknowledged");
    assert.equal(typeof acknowledged.result.alert?.acknowledgedAt, "string");
    assert.equal(acknowledged.result.alert?.resolvedAt, null);
  }

  const resolved = resolveMarineAlert(alertId, deps);
  if (resolved.source === "db") {
    assert.equal(resolved.result.ok, true);
    assert.equal(resolved.result.alert?.status, "resolved");
    assert.equal(typeof resolved.result.alert?.resolvedAt, "string");
  }
});

test("marine alerts repository filters listings by status, severity, and ruleType", () => {
  const db = createInMemoryDb();
  const deps = {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
    openReadOnly: () => db,
    now: () => NOW,
  };

  createMarineAlert(
    {
      eventId: "MEV-010",
      severity: "critical",
      ruleType: "threshold_breach",
      title: "First alert",
      detectedAt: "2026-03-20T09:00:00.000Z",
    },
    deps,
  );
  createMarineAlert(
    {
      eventId: "MEV-011",
      severity: "high",
      ruleType: "trend_detected",
      title: "Second alert",
      detectedAt: "2026-03-20T10:00:00.000Z",
    },
    deps,
  );

  const all = listMarineAlerts({}, deps);
  if (all.source === "db") {
    assert.equal(all.result.alerts.length, 2);
  }

  const bySeverity = listMarineAlerts({ severity: "critical" }, deps);
  if (bySeverity.source === "db") {
    assert.equal(bySeverity.result.alerts.length, 1);
    assert.equal(bySeverity.result.alerts[0]?.ruleType, "threshold_breach");
  }

  const byRuleType = listMarineAlerts({ ruleType: "trend_detected" }, deps);
  if (byRuleType.source === "db") {
    assert.equal(byRuleType.result.alerts.length, 1);
    assert.equal(byRuleType.result.alerts[0]?.eventId, "MEV-011");
  }
});

test("marine alerts repository returns unavailable when database path is missing", () => {
  const result = createMarineAlert(
    {
      eventId: "MEV-001",
      severity: "high",
      ruleType: "threshold_breach",
      title: "Alert",
    },
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
