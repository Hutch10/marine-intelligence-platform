import test from "node:test";
import assert from "node:assert/strict";
import type { OceanStationAdminPermission } from "@marine/shared";
import {
  buildStationAdminSecurityAlertsRouteResponse,
  buildStationAdminSecuritySummaryRouteResponse,
  buildStationAdminSessionsRouteResponse,
} from "./station-admin-security";

const FULL_PERMISSIONS: OceanStationAdminPermission[] = [
  "station.view_admin",
  "station.edit_branding",
  "station.edit_content",
  "station.view_audit",
  "station.publish",
];

const VIEW_ADMIN_ONLY_PERMISSIONS: OceanStationAdminPermission[] = ["station.view_admin"];

const AUDIT_AUTH = {
  actorId: "ops.lead@marine.local",
  role: "admin" as const,
  permissions: FULL_PERMISSIONS,
  csrfToken: "csrf-001",
};

test("station admin sessions route rejects sessions without station.view_audit", () => {
  const response = buildStationAdminSessionsRouteResponse(
    {
      actorId: "viewer@marine.local",
      role: "viewer",
      permissions: VIEW_ADMIN_ONLY_PERMISSIONS,
      csrfToken: "csrf-002",
    },
    {},
    {
      source: "db",
      filters: { limit: 25 },
      sessions: [],
    },
  );

  assert.equal(response.status, 403);
  assert.equal(response.telemetry.result, "forbidden");
});

test("station admin sessions route returns DB-backed active sessions", () => {
  const response = buildStationAdminSessionsRouteResponse(
    AUDIT_AUTH,
    { limit: 5 },
    {
      source: "db",
      filters: { limit: 5 },
      sessions: [
        {
          id: "sess-admin-001",
          actorId: "ops.lead@marine.local",
          actorRole: "admin",
          issuedAt: "2026-03-16T08:00:00.000Z",
          expiresAt: "2026-03-16T16:00:00.000Z",
          lastActiveAt: "2026-03-16T11:40:00.000Z",
          ip: "203.0.113.42",
          userAgent: "Ops Browser",
          source: "POST /api/station-admin/login",
        },
      ],
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.sessionCount, 1);
  if ("sessions" in response.json) {
    assert.equal(response.json.sessions[0].id, "sess-admin-001");
  }
});

test("station admin security summary route returns DB-backed metrics", () => {
  const response = buildStationAdminSecuritySummaryRouteResponse(
    AUDIT_AUTH,
    {
      source: "db",
      summary: {
        activeSessionCount: 3,
        loginSuccessCount24h: 5,
        loginFailureCount24h: 2,
        lockoutCount24h: 1,
        revokeCount24h: 1,
        uniqueIpCount24h: 4,
        lastEventAt: "2026-03-16T11:55:00.000Z",
      },
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "found");
  if ("summary" in response.json) {
    assert.equal(response.json.summary.activeSessionCount, 3);
    assert.equal(response.json.summary.uniqueIpCount24h, 4);
  }
});

test("station admin security alerts route returns DB-backed alerts", () => {
  const response = buildStationAdminSecurityAlertsRouteResponse(
    AUDIT_AUTH,
    {
      source: "db",
      alerts: [
        {
          alertType: "repeated_login_failures_same_ip",
          severity: "high",
          actorId: null,
          ip: "203.0.113.50",
          eventCount: 8,
          timeWindow: "24h",
        },
      ],
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "found");
  if ("alerts" in response.json) {
    assert.equal(response.json.alerts.length, 1);
    assert.equal(response.json.alerts[0].severity, "high");
  }
});
