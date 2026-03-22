import test from "node:test";
import assert from "node:assert/strict";
import type { OceanStationAdminPermission, StationEventListItem } from "@marine/shared";
import { buildStationEventAcknowledgeRouteResponse } from "./station-events";

const ADMIN_AUTH = {
  actorId: "pilot.admin@marine.local",
  role: "admin" as const,
  permissions: ["station.view_admin"] as OceanStationAdminPermission[],
  csrfToken: "test-csrf-001",
};

const ACKNOWLEDGED_EVENT: StationEventListItem = {
  id: "EVT-001",
  eventType: "thermal_spike",
  severity: "high",
  status: "acknowledged",
  title: "Thermal spike detected",
  summary: "Temperature exceeded threshold",
  detectedAt: "2026-03-17T10:00:00.000Z",
  resolvedAt: null,
  investigationId: null,
};

// ---------------------------------------------------------------------------
// Acknowledge route
// ---------------------------------------------------------------------------

test("event acknowledge route returns 200 with updated event on successful acknowledge", () => {
  const response = buildStationEventAcknowledgeRouteResponse(
    ADMIN_AUTH,
    "STA-001",
    "EVT-001",
    "pilot.admin@marine.local",
    { source: "db", result: "acknowledged", event: ACKNOWLEDGED_EVENT },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.route, "POST /stations/:id/events/:eventId/acknowledge");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.result, "acknowledged");
  assert.ok("event" in response.json && (response.json as { event: StationEventListItem }).event.status === "acknowledged");
});

test("event acknowledge route returns 409 when event is already acknowledged", () => {
  const response = buildStationEventAcknowledgeRouteResponse(
    ADMIN_AUTH,
    "STA-001",
    "EVT-001",
    "pilot.admin@marine.local",
    { source: "db", result: "already_acknowledged", event: ACKNOWLEDGED_EVENT },
  );

  assert.equal(response.status, 409);
  assert.equal(response.telemetry.result, "already_acknowledged");
  assert.ok("message" in response.json);
});

test("event acknowledge route returns 404 when station or event is not found", () => {
  const response = buildStationEventAcknowledgeRouteResponse(
    ADMIN_AUTH,
    "STA-MISSING",
    "EVT-MISSING",
    "pilot.admin@marine.local",
    { source: "db", result: "not_found" },
  );

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.result, "not_found");
});

test("event acknowledge route returns 403 when auth is missing", () => {
  const response = buildStationEventAcknowledgeRouteResponse(
    undefined,
    "STA-001",
    "EVT-001",
    "pilot.admin@marine.local",
    { source: "db", result: "acknowledged", event: ACKNOWLEDGED_EVENT },
  );

  assert.equal(response.status, 403);
  assert.equal(response.telemetry.result, "forbidden");
});

test("event acknowledge route returns 404 on mock fallback", () => {
  const response = buildStationEventAcknowledgeRouteResponse(
    ADMIN_AUTH,
    "STA-001",
    "EVT-001",
    "pilot.admin@marine.local",
    { source: "mock", fallbackReason: "db_path_missing" },
  );

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
});
