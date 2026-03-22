import test from "node:test";
import assert from "node:assert/strict";
import { buildDashboardRouteResponse } from "./dashboard";
import type { DashboardSpeciesActivity } from "@marine/shared";

const MOCK_COUNTS = { openAlertCount: 3, totalDatasets: 4, totalInvestigations: 3 };

const DB_ACTIVITY = [
  { type: "alert" as const, text: "Thermal spike detected", time: "11 min ago" },
  { type: "report" as const, text: "North Pacific Report", time: "2 hr ago" },
];

test("dashboard route overrides Anomalies Detected metric with DB count", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: { ...MOCK_COUNTS, openAlertCount: 5 },
    activity: DB_ACTIVITY,
  });

  assert.equal(response.status, 200);
  const anomalyMetric = response.json.metrics.find((m) => m.label === "Anomalies Detected");
  assert.ok(anomalyMetric, "Anomalies Detected metric should exist");
  assert.equal(anomalyMetric?.value, "5");
});

test("dashboard route does not override other metrics", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: MOCK_COUNTS,
    activity: DB_ACTIVITY,
  });

  const speciesMetric = response.json.metrics.find((m) => m.label === "Species Tracked");
  assert.equal(speciesMetric?.value, "2,847");
  const tempMetric = response.json.metrics.find((m) => m.label === "Sea Surface Temp");
  assert.equal(tempMetric?.value, "18.4");
});

test("dashboard route uses DB activity items when non-empty", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: MOCK_COUNTS,
    activity: DB_ACTIVITY,
  });

  assert.equal(response.json.activity, DB_ACTIVITY);
  assert.equal(response.telemetry.activitySource, "db");
  assert.equal(response.telemetry.activityItemCount, 2);
});

test("dashboard route falls back to mock activity when DB activity is empty", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: MOCK_COUNTS,
    activity: [],
  });

  assert.ok(response.json.activity.length > 0, "Should use mock activity not empty array");
  assert.equal(response.telemetry.activitySource, "mock");
  assert.equal(response.telemetry.source, "db");
});

test("dashboard route emits correct telemetry for DB source", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: { ...MOCK_COUNTS, openAlertCount: 7 },
    activity: DB_ACTIVITY,
  });

  assert.equal(response.telemetry.route, "GET /dashboard");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.openAlertCount, 7);
  assert.equal(response.telemetry.activityItemCount, 2);
  assert.equal(response.telemetry.activitySource, "db");
  assert.equal(response.telemetry.fallbackReason, undefined);
});

test("dashboard route preserves missions and quickAccess from mock", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: MOCK_COUNTS,
    activity: DB_ACTIVITY,
  });

  assert.ok(response.json.missions.length > 0);
  assert.ok(response.json.quickAccess.length > 0);
  assert.equal(response.json.missions[0]?.id, "MSN-041");
});

test("dashboard route returns full mock data when db_path_missing", () => {
  const response = buildDashboardRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
  assert.equal(response.telemetry.activitySource, "mock");
  assert.equal(response.telemetry.openAlertCount, undefined);
  const anomalyMetric = response.json.metrics.find((m) => m.label === "Anomalies Detected");
  assert.equal(anomalyMetric?.value, "7");
});

test("dashboard route returns full mock data when db_open_failed", () => {
  const response = buildDashboardRouteResponse({
    source: "mock",
    fallbackReason: "db_open_failed",
  });

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
  assert.ok(response.json.activity.length > 0);
});

test("dashboard route returns full mock data when db_query_failed", () => {
  const response = buildDashboardRouteResponse({
    source: "mock",
    fallbackReason: "db_query_failed",
  });

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
});

test("dashboard route response shape always contains metrics missions activity quickAccess", () => {
  for (const readResult of [
    { source: "db" as const, counts: MOCK_COUNTS, activity: DB_ACTIVITY },
    { source: "mock" as const, fallbackReason: "db_path_missing" as const },
  ]) {
    const response = buildDashboardRouteResponse(readResult);
    assert.deepEqual(Object.keys(response.json).sort(), [
      "activity",
      "anomalySummary",
      "metrics",
      "missions",
      "quickAccess",
    ]);
    assert.equal(response.json.metrics.length, 6);
  }
});

const SPECIES_ACTIVITY: DashboardSpeciesActivity = {
  recentSightingCount: 5,
  recentMovementSignalCount: 3,
  topMovementTypes: ["route_deviation", "aggregation_shift"],
  topActiveSpecies: [{ speciesId: "SP-001", commonName: "Blue Whale", sightingCount: 5 }],
  ecologicalReasons: [
    {
      kind: "increased_sighting_rate" as const,
      label: "5 sightings in last 14 days",
      detail: "Sighting frequency exceeds baseline threshold.",
    },
  ],
  windowDays: 14,
  generatedAt: "2026-03-13T12:00:00.000Z",
};

test("dashboard route includes speciesActivity in json when provided", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: MOCK_COUNTS,
    activity: DB_ACTIVITY,
    speciesActivity: SPECIES_ACTIVITY,
  });

  assert.deepEqual(Object.keys(response.json).sort(), [
    "activity",
    "anomalySummary",
    "metrics",
    "missions",
    "quickAccess",
    "speciesActivity",
  ]);
  assert.deepEqual(response.json.speciesActivity, SPECIES_ACTIVITY);
  assert.equal(response.telemetry.speciesActivitySource, "db");
});

test("dashboard route omits speciesActivity from json when null", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: MOCK_COUNTS,
    activity: DB_ACTIVITY,
    speciesActivity: null,
  });

  assert.ok(!Object.keys(response.json).includes("speciesActivity"));
  assert.equal(response.telemetry.speciesActivitySource, "unavailable");
});

test("dashboard route omits speciesActivity from json when not present in readResult", () => {
  const response = buildDashboardRouteResponse({
    source: "db",
    counts: MOCK_COUNTS,
    activity: DB_ACTIVITY,
  });

  assert.ok(!Object.keys(response.json).includes("speciesActivity"));
  assert.equal(response.telemetry.speciesActivitySource, "unavailable");
});
