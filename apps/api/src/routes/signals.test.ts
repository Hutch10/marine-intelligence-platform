import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSignalCreateRouteResponse,
  buildSignalDetailRouteResponse,
  buildSignalDismissRouteResponse,
  buildSignalPromoteRouteResponse,
  buildSignalsListRouteResponse,
} from "./signals";
import type { SignalDetection } from "@marine/shared";

const BASE_SIGNAL: SignalDetection = {
  id: "SIG-THERMAL-001",
  signalType: "thermal_anomaly",
  severity: "critical",
  confidence: 90,
  sourceType: "dashboard_anomaly_summary",
  sourceId: "dashboard-anomaly-summary",
  region: "North Pacific",
  stationId: null,
  title: "Thermal anomaly escalation",
  summary: "Detected elevated thermal anomaly pressure.",
  detail: "Derived from anomaly summary context.",
  status: "open",
  detectedAt: "2026-03-17T11:48:00.000Z",
  createdAt: "2026-03-17T11:48:00.000Z",
  updatedAt: "2026-03-17T11:48:00.000Z",
  linkedInvestigationId: null,
};

test("signals list route returns DB payload and telemetry", async () => {
  const response = await buildSignalsListRouteResponse(
    { status: "open", limit: 5 },
    { source: "db", signals: [BASE_SIGNAL] },
  );

  assert.equal(response.status, 200);
  assert.equal((response.json as any).signals.length, 1);
  assert.equal(response.telemetry.route, "GET /signals");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.signalCount, 1);
  assert.equal(response.telemetry.filtersApplied, true);
});

test("signals list route supports mock fallback", async () => {
  const response = await buildSignalsListRouteResponse(
    { severity: "critical" },
    { source: "mock", fallbackReason: "db_open_failed" },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
  assert.ok((response.json as any).signals.length > 0);
});

test("signal detail route returns not found when repository misses signal", async () => {
  const response = await buildSignalDetailRouteResponse("SIG-MISSING", {
    source: "db",
    result: "not_found",
  });

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.result, "not_found");
});

test("signal create route validates confidence", async () => {
  const response = await buildSignalCreateRouteResponse({
    signalType: "thermal_anomaly",
    severity: "high",
    confidence: 140,
    sourceType: "source",
    sourceId: "source-id",
    region: "North Pacific",
    title: "Signal",
    summary: "Summary",
    detail: "Detail",
  });

  assert.equal(response.status, 400);
  assert.equal(response.telemetry.result, "invalid");
  assert.equal(response.telemetry.validationError, "invalid_confidence");
});

test("signal create route returns created signal", async () => {
  const response = await buildSignalCreateRouteResponse(
    {
      signalType: "oxygen_depletion",
      severity: "high",
      confidence: 81,
      sourceType: "activity_alert_stream",
      sourceId: "ALT-180",
      region: "Eastern Shelf",
      title: "Oxygen depletion risk cluster",
      summary: "Sustained low dissolved oxygen trend.",
      detail: "Derived from chemistry and alert stream overlap.",
    },
    {
      source: "db",
      result: "created",
      signal: {
        ...BASE_SIGNAL,
        id: "SIG-OXYGEN-002",
        signalType: "oxygen_depletion",
        severity: "high",
        confidence: 81,
        title: "Oxygen depletion risk cluster",
        summary: "Sustained low dissolved oxygen trend.",
        detail: "Derived from chemistry and alert stream overlap.",
      },
    },
  );

  assert.equal(response.status, 201);
  assert.equal(response.telemetry.result, "created");
  assert.ok("signal" in response.json);
});

test("signal promote route validates path and body id alignment", async () => {
  const response = await buildSignalPromoteRouteResponse("SIG-ONE", {
    id: "SIG-TWO",
    investigationId: "TRK-201",
  });

  assert.equal(response.status, 400);
  assert.equal(response.telemetry.result, "invalid");
  assert.equal(response.telemetry.validationError, "id_mismatch");
});

test("signal promote route returns 404 when signal or investigation is missing", async () => {
  const response = await buildSignalPromoteRouteResponse(
    "SIG-THERMAL-001",
    {
      id: "SIG-THERMAL-001",
      investigationId: "TRK-MISSING",
    },
    {
      source: "db",
      result: "not_found",
    },
  );

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.result, "not_found");
});

test("signal dismiss route returns dismissed signal", async () => {
  const response = await buildSignalDismissRouteResponse(
    "SIG-THERMAL-001",
    {
      id: "SIG-THERMAL-001",
      actor: "operator@marine.local",
    },
    {
      source: "db",
      result: "dismissed",
      signal: {
        ...BASE_SIGNAL,
        status: "dismissed",
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "dismissed");
  assert.ok("signal" in response.json);
  if ("signal" in response.json) {
    assert.equal((response.json as any).signal.status, "dismissed");
  }
});

test("signal dismiss route returns fallback telemetry when DB is unavailable", async () => {
  const response = await buildSignalDismissRouteResponse(
    "SIG-THERMAL-001",
    {
      id: "SIG-THERMAL-001",
    },
    {
      source: "mock",
      fallbackReason: "db_query_failed",
    },
  );

  assert.equal(response.status, 503);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
});
