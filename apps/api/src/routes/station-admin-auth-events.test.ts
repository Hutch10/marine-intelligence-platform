import test from "node:test";
import assert from "node:assert/strict";
import {
  buildStationAdminAuthEventsExportRouteResponse,
  buildStationAdminAuthEventsRouteResponse,
} from "./station-admin-auth-events";

test("station admin auth events route rejects sessions without station.view_audit", () => {
  const response = buildStationAdminAuthEventsRouteResponse(
    {
      actorId: "viewer@marine.local",
      role: "viewer",
      permissions: ["station.view_admin"],
      csrfToken: "csrf-001",
    },
    {},
    {
      source: "db",
      filters: { limit: 25 },
      events: [],
      nextCursor: null,
    },
  );

  assert.equal(response.status, 403);
  assert.equal(response.telemetry.result, "forbidden");
});

test("station admin auth events route returns DB-backed filtered events", () => {
  const response = buildStationAdminAuthEventsRouteResponse(
    {
      actorId: "ops.lead@marine.local",
      role: "admin",
      permissions: [
        "station.view_admin",
        "station.edit_branding",
        "station.edit_content",
        "station.view_audit",
        "station.publish",
      ],
      csrfToken: "csrf-002",
    },
    {
      eventType: "login_failure",
      actor: "ops.lead@marine.local",
      ip: "198.51.100.7",
      since: "2026-03-16T08:00:00.000Z",
      limit: 10,
      cursor: "2026-03-16T08:30:00.000Z|EVT-LOGIN-FAIL-001",
    },
    {
      source: "db",
      filters: {
        eventType: "login_failure",
        actor: "ops.lead@marine.local",
        ip: "198.51.100.7",
        since: "2026-03-16T08:00:00.000Z",
        until: undefined,
        limit: 25,
        cursor: undefined,
      },
      events: [
        {
          id: "EVT-LOGIN-FAIL-001",
          eventType: "login_failure",
          actorId: "ops.lead@marine.local",
          sessionId: null,
          occurredAt: "2026-03-16T08:30:00.000Z",
          ip: "198.51.100.7",
          userAgent: "Ops Browser",
          source: "POST /api/station-admin/login",
        },
      ],
      nextCursor: "2026-03-16T08:30:00.000Z|EVT-LOGIN-FAIL-001",
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.filtersApplied, true);
  if ("events" in response.json) {
    assert.equal(response.json.events.length, 1);
    assert.equal(response.json.events[0].ip, "198.51.100.7");
    assert.equal(response.json.nextCursor, "2026-03-16T08:30:00.000Z|EVT-LOGIN-FAIL-001");
  }
});

test("station admin auth events export route returns JSON export payload", () => {
  const response = buildStationAdminAuthEventsExportRouteResponse(
    {
      actorId: "ops.lead@marine.local",
      role: "admin",
      permissions: [
        "station.view_admin",
        "station.edit_branding",
        "station.edit_content",
        "station.view_audit",
        "station.publish",
      ],
      csrfToken: "csrf-003",
    },
    {
      eventType: "login_failure",
      actor: "ops.lead@marine.local",
      ip: "198.51.100.7",
    },
    {
      source: "db",
      filters: {
        eventType: "login_failure",
        actor: "ops.lead@marine.local",
        ip: "198.51.100.7",
        since: undefined,
        until: undefined,
        limit: 500,
        cursor: undefined,
      },
      export: {
        format: "json",
        fileName: "station-admin-events-export.json",
        exportedAt: "2026-03-16T12:00:00.000Z",
        filters: {
          eventType: "login_failure",
          actor: "ops.lead@marine.local",
          ip: "198.51.100.7",
          since: undefined,
          until: undefined,
          limit: 500,
          cursor: undefined,
        },
        events: [
          {
            id: "EVT-LOGIN-FAIL-001",
            eventType: "login_failure",
            actorId: "ops.lead@marine.local",
            sessionId: null,
            occurredAt: "2026-03-16T08:30:00.000Z",
            ip: "198.51.100.7",
            userAgent: "Ops Browser",
            source: "POST /api/station-admin/login",
          },
        ],
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "exported");
  if ("export" in response.json) {
    assert.equal(response.json.export.format, "json");
    assert.equal(response.json.export.events.length, 1);
  }
});
