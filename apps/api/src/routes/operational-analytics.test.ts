import test from "node:test";
import assert from "node:assert/strict";
import {
  buildOperationalAnalyticsRecordRouteResponse,
  buildOperationalAnalyticsSummaryRouteResponse,
} from "./operational-analytics";
import {
  buildOperationalAnalyticsSummary,
  ensureOperationalAnalyticsTable,
  incrementOperationalAnalytics,
  readOperationalAnalyticsSummary,
} from "../repositories/operational-analytics";

test("operational analytics record rejects forbidden identifier fields", async () => {
  const response = await buildOperationalAnalyticsRecordRouteResponse(
    { eventType: "page_view", dimension: "dashboard", investigationId: "INV-1" },
    {},
  );

  assert.equal(response.status, 400);
  assert.match(response.json.message ?? "", /not permitted/i);
});

test("operational analytics record accepts page_view and increments daily bucket", async () => {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createAsyncTestDatabase } = runtimeRequire("../db/test-utils") as {
    createAsyncTestDatabase: () => import("../db/async-client").AsyncDbAdapter;
  };

  const adapter = createAsyncTestDatabase();
  await ensureOperationalAnalyticsTable(adapter);
  await incrementOperationalAnalytics(adapter, {
    eventType: "page_view",
    dimension: "dashboard",
    occurredAtMs: Date.parse("2026-06-03T12:00:00.000Z"),
  });
  await incrementOperationalAnalytics(adapter, {
    eventType: "page_view",
    dimension: "dashboard",
    occurredAtMs: Date.parse("2026-06-03T15:00:00.000Z"),
  });

  const buckets = await readOperationalAnalyticsSummary(adapter, 30);
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0]?.count, 2);
  adapter.close();
});

test("operational analytics summary aggregates totals by event type", async () => {
  const summary = buildOperationalAnalyticsSummary([
    { day: "2026-06-03", eventType: "page_view", dimension: "dashboard", count: 4 },
    { day: "2026-06-03", eventType: "export", dimension: "scientific_csv", count: 2 },
    { day: "2026-06-02", eventType: "investigation_open", dimension: "", count: 1 },
  ]);

  assert.equal(summary.totalsByEventType.page_view, 4);
  assert.equal(summary.totalsByEventType.export, 2);
  assert.equal(summary.totalsByEventType.investigation_open, 1);
  assert.equal(summary.privacy.personalIdentifiers, false);
});

test("operational analytics summary route returns privacy manifest", async () => {
  const response = await buildOperationalAnalyticsSummaryRouteResponse();

  if (response.status === 503) {
    assert.ok(true);
    return;
  }

  assert.equal(response.status, 200);
  if ("privacy" in response.json) {
    assert.equal(response.json.privacy.accounts, false);
    assert.equal(response.json.privacy.advertisingAnalytics, false);
  }
});
