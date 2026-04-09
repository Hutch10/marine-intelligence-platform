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
        stationId: null,
        ruleType: "source_stale",
        severity: "warning",
        status: "active",
        lifecycleStatus: "open",
        title: "Active alert",
        detail: null,
        metadataJson: null,
        detectedAt: 200,
        resolvedAt: null,
        occurrenceCount: 1,
        windowStartedAt: 200,
        windowEndsAt: 3800,
        createdAt: "2026-03-18T10:00:00.000Z",
        updatedAt: "2026-03-18T10:00:01.000Z",
        investigationId: null,
      },
    ],
    recentHistory: [
      {
        id: "alert-resolved-1",
        source: "ioos_regional",
        stationId: null,
        ruleType: "source_stale",
        severity: "warning",
        status: "resolved",
        lifecycleStatus: "resolved",
        title: "Resolved alert",
        detail: null,
        metadataJson: null,
        detectedAt: 150,
        resolvedAt: 190,
        occurrenceCount: 1,
        windowStartedAt: 150,
        windowEndsAt: 3750,
        createdAt: "2026-03-18T09:00:00.000Z",
        updatedAt: "2026-03-18T09:00:01.000Z",
        investigationId: "INV-123",
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

test("operational-alerts route emits investigationId only when real linked investigation exists", () => {
  // Alert with real investigationId
  const response = buildOperationalAlertsRouteResponse({
    source: "db",
    result: {
      activeAlerts: [
        {
          id: "alert-1",
          source: "ioos_regional",
          stationId: null,
          ruleType: "source_stale",
          severity: "warning",
          status: "active",
          lifecycleStatus: "open",
          title: "Active alert",
          detail: null,
          metadataJson: null,
          detectedAt: 200,
          resolvedAt: null,
          occurrenceCount: 1,
          windowStartedAt: 200,
          windowEndsAt: 3800,
          createdAt: "2026-03-18T10:00:00.000Z",
          updatedAt: "2026-03-18T10:00:01.000Z",
          investigationId: "INV-REAL-1",
        },
      ],
      recentHistory: [
        {
          id: "alert-2",
          source: "ioos_regional",
          stationId: null,
          ruleType: "source_stale",
          severity: "warning",
          status: "resolved",
          lifecycleStatus: "resolved",
          title: "Resolved alert",
          detail: null,
          metadataJson: null,
          detectedAt: 150,
          resolvedAt: 190,
          occurrenceCount: 1,
          windowStartedAt: 150,
          windowEndsAt: 3750,
          createdAt: "2026-03-18T09:00:00.000Z",
          updatedAt: "2026-03-18T09:00:01.000Z",
          investigationId: null,
        },
      ],
    },
  });
  // Should emit investigationId for alert-1, not for alert-2
  assert.equal(response.json.active_alerts[0].investigationId, "INV-REAL-1");
  assert.ok(!("investigationId" in response.json.recent_history[0]) || response.json.recent_history[0].investigationId == null);
});

test("operational-alerts route does not emit investigationId for alerts with null/empty investigationId", () => {
  const response = buildOperationalAlertsRouteResponse({
    source: "db",
    result: {
      activeAlerts: [
        {
          id: "alert-3",
          source: "ioos_regional",
          stationId: null,
          ruleType: "source_stale",
          severity: "warning",
          status: "active",
          lifecycleStatus: "open",
          title: "Active alert",
          detail: null,
          metadataJson: null,
          detectedAt: 200,
          resolvedAt: null,
          occurrenceCount: 1,
          windowStartedAt: 200,
          windowEndsAt: 3800,
          createdAt: "2026-03-18T10:00:00.000Z",
          updatedAt: "2026-03-18T10:00:01.000Z",
          investigationId: null,
        },
        {
          id: "alert-4",
          source: "ioos_regional",
          stationId: null,
          ruleType: "source_stale",
          severity: "warning",
          status: "active",
          lifecycleStatus: "open",
          title: "Active alert",
          detail: null,
          metadataJson: null,
          detectedAt: 200,
          resolvedAt: null,
          occurrenceCount: 1,
          windowStartedAt: 200,
          windowEndsAt: 3800,
          createdAt: "2026-03-18T10:00:00.000Z",
          updatedAt: "2026-03-18T10:00:01.000Z",
          investigationId: "",
        },
      ],
      recentHistory: [],
    },
  });
  // Should not emit investigationId at all for null/empty
  assert.ok(!("investigationId" in response.json.active_alerts[0]) || response.json.active_alerts[0].investigationId == null);
  assert.ok(!("investigationId" in response.json.active_alerts[1]) || response.json.active_alerts[1].investigationId == null);
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
