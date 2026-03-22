import test from "node:test";
import assert from "node:assert/strict";
import type { OceanStationAdminPermission } from "@marine/shared";
import {
  buildMarineWorkflowAcknowledgeAlertRouteResponse,
  buildMarineWorkflowAlertsRouteResponse,
  buildMarineWorkflowCreateInvestigationRouteResponse,
  buildMarineWorkflowEventsRouteResponse,
  buildMarineWorkflowInvestigationsRouteResponse,
  buildMarineWorkflowResolveAlertRouteResponse,
} from "./marine-intelligence";

const ADMIN_AUTH = {
  actorId: "ops.lead@marine.local",
  role: "admin" as const,
  permissions: ["station.view_admin"] as OceanStationAdminPermission[],
  csrfToken: "csrf-001",
};

const EVENT = {
  id: "MEV-001",
  ontologyTermId: "mdl.threshold_alert",
  eventClass: "threshold_alert" as const,
  severity: "high" as const,
  status: "detected" as const,
  title: "Thermal threshold exceeded",
  summary: "SST anomaly crossed threshold.",
  region: "North Pacific",
  stationId: "STA-001",
  confidence: 88,
  lineage: {
    source: "crw",
    sourceRecordId: "rec-001",
    ingestionRunId: "run-001",
    observedAt: "2026-03-20T11:00:00.000Z",
    ingestedAt: "2026-03-20T11:05:00.000Z",
  },
  detectedAt: "2026-03-20T11:06:00.000Z",
  resolvedAt: null,
  createdAt: "2026-03-20T11:06:00.000Z",
  updatedAt: "2026-03-20T11:06:00.000Z",
};

const INVESTIGATION = {
  id: "MIID-001",
  eventId: "MEV-001",
  eventTitle: EVENT.title,
  stationId: EVENT.stationId,
  region: EVENT.region,
  detectedAt: EVENT.detectedAt,
  title: "North Pacific follow-up",
  status: "open" as const,
  ownerId: "ops.lead@marine.local",
  notes: null,
  createdAt: "2026-03-20T11:10:00.000Z",
  updatedAt: "2026-03-20T11:10:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
  dismissedAt: null,
};

const ALERT = {
  id: "MALT-001",
  eventId: "MEV-001",
  eventTitle: EVENT.title,
  eventStatus: EVENT.status,
  stationId: EVENT.stationId,
  region: EVENT.region,
  investigationId: INVESTIGATION.id,
  severity: "high" as const,
  status: "active" as const,
  ruleType: "threshold_breach" as const,
  title: "Thermal threshold breached",
  detail: "SST anomaly exceeded threshold.",
  detectedAt: "2026-03-20T11:07:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
  createdAt: "2026-03-20T11:07:00.000Z",
  updatedAt: "2026-03-20T11:07:00.000Z",
};

test("marine workflow events route returns db payload and telemetry", () => {
  const response = buildMarineWorkflowEventsRouteResponse(
    ADMIN_AUTH,
    { stationId: "STA-001" },
    { ok: true, events: [EVENT] },
  );

  assert.equal(response.status, 200);
  assert.ok("events" in response.json);
  assert.equal(response.json.events[0]?.id, "MEV-001");
  assert.equal(response.telemetry.route, "GET /marine-intelligence/events");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.eventCount, 1);
  assert.equal(response.telemetry.filtersApplied, true);
});

test("marine workflow events route enforces station.view_admin scope", () => {
  const response = buildMarineWorkflowEventsRouteResponse(undefined, {}, { ok: true, events: [EVENT] });

  assert.equal(response.status, 403);
  assert.ok("message" in response.json);
  assert.equal(response.telemetry.result, "forbidden");
});

test("marine workflow investigations route returns deterministic list payload", () => {
  const response = buildMarineWorkflowInvestigationsRouteResponse(
    ADMIN_AUTH,
    { stationId: "STA-001", status: "open" },
    { ok: true, investigations: [INVESTIGATION] },
  );

  assert.equal(response.status, 200);
  assert.ok("investigations" in response.json);
  assert.equal(response.json.investigations[0]?.eventTitle, EVENT.title);
  assert.equal(response.telemetry.investigationCount, 1);
  assert.equal(response.telemetry.filtersApplied, true);
});

test("marine workflow create investigation route returns 200 with created investigation", () => {
  const response = buildMarineWorkflowCreateInvestigationRouteResponse(
    ADMIN_AUTH,
    { eventId: EVENT.id, title: INVESTIGATION.title, ownerId: ADMIN_AUTH.actorId },
    { ok: true, investigation: INVESTIGATION },
  );

  assert.equal(response.status, 200);
  assert.ok("investigation" in response.json);
  assert.equal(response.json.investigation.id, INVESTIGATION.id);
  assert.equal(response.telemetry.result, "created");
});

test("marine workflow create investigation route maps missing event to 404", () => {
  const response = buildMarineWorkflowCreateInvestigationRouteResponse(
    ADMIN_AUTH,
    { eventId: "MEV-MISSING", title: "Missing", ownerId: ADMIN_AUTH.actorId },
    {
      ok: false,
      reason: "not_found",
      error: "Marine event not found",
      investigation: null,
    },
  );

  assert.equal(response.status, 404);
  assert.ok("message" in response.json);
  assert.equal(response.telemetry.result, "not_found");
});

test("marine workflow alerts route returns alert payload and unavailable telemetry when degraded", () => {
  const degraded = buildMarineWorkflowAlertsRouteResponse(
    ADMIN_AUTH,
    { status: "active" },
    { ok: false, alerts: [], fallbackReason: "db_path_missing" },
  );

  assert.equal(degraded.status, 200);
  assert.ok("alerts" in degraded.json);
  assert.equal(degraded.json.alerts.length, 0);
  assert.equal(degraded.telemetry.source, "unavailable");
  assert.equal(degraded.telemetry.fallbackReason, "db_path_missing");
});

test("marine workflow acknowledge alert route returns updated alert", () => {
  const response = buildMarineWorkflowAcknowledgeAlertRouteResponse(
    ADMIN_AUTH,
    { alertId: ALERT.id },
    {
      ok: true,
      alert: { ...ALERT, status: "acknowledged", acknowledgedAt: "2026-03-20T11:08:00.000Z" },
    },
  );

  assert.equal(response.status, 200);
  assert.ok("alert" in response.json);
  assert.equal(response.json.alert.status, "acknowledged");
  assert.equal(response.telemetry.route, "POST /marine-intelligence/alerts/:alertId/acknowledge");
});

test("marine workflow resolve alert route maps not_found to 404", () => {
  const response = buildMarineWorkflowResolveAlertRouteResponse(
    ADMIN_AUTH,
    { alertId: ALERT.id },
    {
      ok: false,
      reason: "not_found",
      error: "Alert not found",
      alert: null,
    },
  );

  assert.equal(response.status, 404);
  assert.ok("message" in response.json);
  assert.equal(response.telemetry.result, "not_found");
});

test("marine workflow alert mutation routes enforce station.view_admin scope", () => {
  const response = buildMarineWorkflowAcknowledgeAlertRouteResponse(
    undefined,
    { alertId: ALERT.id },
    { ok: true, alert: ALERT },
  );

  assert.equal(response.status, 403);
  assert.equal(response.telemetry.result, "forbidden");
});