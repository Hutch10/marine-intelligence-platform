import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOperationalAlertsRouteResponse,
  parseOperationalAlertsQuery,
  readDatabaseOperationalAlerts,
} from "./operational-alerts";
import type { OperationalAlertsReadResultResponse } from "../repositories/operational-alerts";

const DB_READ_RESULT: OperationalAlertsReadResultResponse = {
  source: "db",
  result: {
    activeAlerts: [
      {
        id: "alert-active-1",
        source: "ioos_regional",
        ruleType: "source_stale",
        severity: "warning",
        status: "active",
        title: "Active alert",
        detail: null,
        metadataJson: null,
        detectedAt: 200,
        resolvedAt: null,
        createdAt: "2026-03-18T10:00:00.000Z",
        updatedAt: "2026-03-18T10:00:01.000Z",
      },
    ],
    recentHistory: [
      {
        id: "alert-resolved-1",
        source: "ioos_regional",
        ruleType: "source_stale",
        severity: "warning",
        status: "resolved",
        title: "Resolved alert",
        detail: null,
        metadataJson: null,
        detectedAt: 150,
        resolvedAt: 190,
        createdAt: "2026-03-18T09:00:00.000Z",
        updatedAt: "2026-03-18T09:00:01.000Z",
      },
    ],
  },
};

test("operational-alerts route parser supports active status", () => {
  const parsed = parseOperationalAlertsQuery({ status: "active" });
  assert.equal(parsed.status, "active");
});

test("operational-alerts route parser supports resolved status", () => {
  const parsed = parseOperationalAlertsQuery({ status: "resolved" });
  assert.equal(parsed.status, "resolved");
});

test("operational-alerts route parser ignores invalid status", () => {
  const parsed = parseOperationalAlertsQuery({ status: "unexpected" });
  assert.equal(parsed.status, undefined);
});

test("operational-alerts route parser ignores invalid ruleType", () => {
  const parsed = parseOperationalAlertsQuery({ ruleType: "not_a_rule" });
  assert.equal(parsed.ruleType, undefined);
});

test("operational-alerts route forwards source filter", () => {
  const captured: Array<Record<string, unknown>> = [];

  readDatabaseOperationalAlerts(
    { source: "ioos_regional" },
    {
      readOperationalAlerts(options) {
        captured.push(options as Record<string, unknown>);
        return DB_READ_RESULT;
      },
    },
  );

  assert.equal(captured[0]?.source, "ioos_regional");
});

test("operational-alerts route forwards combined filters", () => {
  const captured: Array<Record<string, unknown>> = [];

  readDatabaseOperationalAlerts(
    {
      status: "resolved",
      source: "ioos_regional",
      ruleType: "source_stale",
      limit: "5",
    },
    {
      readOperationalAlerts(options) {
        captured.push(options as Record<string, unknown>);
        return DB_READ_RESULT;
      },
    },
  );

  assert.equal(captured[0]?.status, "resolved");
  assert.equal(captured[0]?.source, "ioos_regional");
  assert.equal(captured[0]?.ruleType, "source_stale");
  assert.equal(captured[0]?.limit, 5);
});

test("operational-alerts route forwards ruleType filter", () => {
  const captured: Array<Record<string, unknown>> = [];

  readDatabaseOperationalAlerts(
    { ruleType: "source_stale" },
    {
      readOperationalAlerts(options) {
        captured.push(options as Record<string, unknown>);
        return DB_READ_RESULT;
      },
    },
  );

  assert.equal(captured[0]?.ruleType, "source_stale");
});

test("operational-alerts route enforces limit bounds", () => {
  const capturedHigh: Array<Record<string, unknown>> = [];
  const capturedLow: Array<Record<string, unknown>> = [];

  readDatabaseOperationalAlerts(
    { limit: "9999" },
    {
      readOperationalAlerts(options) {
        capturedHigh.push(options as Record<string, unknown>);
        return DB_READ_RESULT;
      },
    },
  );

  readDatabaseOperationalAlerts(
    { limit: "0" },
    {
      readOperationalAlerts(options) {
        capturedLow.push(options as Record<string, unknown>);
        return DB_READ_RESULT;
      },
    },
  );

  assert.equal(capturedHigh[0]?.limit, 500);
  assert.equal(capturedLow[0]?.limit, 1);
});

test("operational-alerts route keeps historyLimit compatibility when limit is omitted", () => {
  const parsed = parseOperationalAlertsQuery({ historyLimit: "7" });
  assert.equal(parsed.limit, 7);
});

test("operational-alerts route uses limit over historyLimit when both are provided", () => {
  const parsed = parseOperationalAlertsQuery({ limit: "3", historyLimit: "99" });
  assert.equal(parsed.limit, 3);
});

test("operational-alerts route returns safe empty db state", () => {
  const response = buildOperationalAlertsRouteResponse({
    source: "db",
    result: {
      activeAlerts: [],
      recentHistory: [],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.source, "db");
  assert.equal(response.json.active_alerts.length, 0);
  assert.equal(response.json.recent_history.length, 0);
  assert.equal(response.json.summary.active_alert_count, 0);
});

test("operational-alerts route returns unavailable fallback state", () => {
  const response = buildOperationalAlertsRouteResponse({
    source: "unavailable",
    fallbackReason: "db_open_failed",
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.source, "unavailable");
  assert.equal(response.json.fallback_reason, "db_open_failed");
  assert.equal(response.json.active_alerts.length, 0);
  assert.equal(response.json.recent_history.length, 0);
  assert.equal(response.telemetry.source, "unavailable");
});
