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
  buildMarineWorkflowDecisionRouteResponse,
  buildMarineWorkflowFeedbackRouteResponse,
  buildMarineWorkflowSummaryRouteResponse,
  buildMarineWorkflowTelemetryRouteResponse,
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

const DECISION = {
  id: "MID-001",
  investigationId: INVESTIGATION.id,
  stationId: INVESTIGATION.stationId,
  decision: "delay_operations",
  rationale: "Conditions are too volatile for transit.",
  timestamp: "2026-03-20T12:03:00.000Z",
  createdAt: "2026-03-20T12:03:01.000Z",
  updatedAt: "2026-03-20T12:03:01.000Z",
};

const TELEMETRY_EVENT = {
  id: "MTL-001",
  eventType: "submit_decision" as const,
  investigationId: INVESTIGATION.id,
  stationId: INVESTIGATION.stationId,
  decisionId: DECISION.id,
  timestamp: DECISION.timestamp,
  details: DECISION.rationale,
  createdAt: "2026-03-20T12:03:01.000Z",
};

const FEEDBACK = {
  id: "MFB-001",
  useful: true,
  note: "Grounded recommendation matched the conditions on site.",
  investigationId: INVESTIGATION.id,
  stationId: INVESTIGATION.stationId,
  decisionId: null,
  evaluationId: null,
  signalSnapshot: null,
  timestamp: "2026-03-20T12:04:00.000Z",
  createdAt: "2026-03-20T12:04:01.000Z",
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

test("marine workflow decision route returns created decision payload", () => {
  const response = buildMarineWorkflowDecisionRouteResponse(
    ADMIN_AUTH,
    {
      investigationId: INVESTIGATION.id,
      stationId: INVESTIGATION.stationId,
      decision: DECISION.decision,
      rationale: DECISION.rationale,
      timestamp: DECISION.timestamp,
    },
    {
      source: "db",
      result: {
        ok: true,
        decision: DECISION,
        event: TELEMETRY_EVENT,
      },
    },
  );

  assert.equal(response.status, 200);
  assert.ok("decision" in response.json);
  assert.equal(response.json.decision.id, DECISION.id);
  assert.equal(response.telemetry.route, "POST /marine-intelligence/decisions");
  assert.equal(response.telemetry.result, "created");
});

test("marine workflow telemetry route returns recorded event payload", () => {
  const response = buildMarineWorkflowTelemetryRouteResponse(
    ADMIN_AUTH,
    {
      eventType: "view",
      investigationId: INVESTIGATION.id,
      stationId: INVESTIGATION.stationId,
      decisionId: DECISION.id,
      timestamp: "2026-03-20T12:00:00.000Z",
      details: "Opened the investigation panel",
    },
    {
      source: "db",
      result: {
        ok: true,
        event: {
          id: "MTL-002",
          eventType: "view",
          investigationId: INVESTIGATION.id,
          stationId: INVESTIGATION.stationId,
          decisionId: DECISION.id,
          timestamp: "2026-03-20T12:00:00.000Z",
          details: "Opened the investigation panel",
          createdAt: "2026-03-20T12:00:01.000Z",
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.ok("event" in response.json);
  assert.equal(response.json.event.eventType, "view");
  assert.equal(response.telemetry.route, "POST /marine-intelligence/telemetry");
  assert.equal(response.telemetry.result, "created");
});

test("marine workflow feedback route returns recorded feedback payload", () => {
  const response = buildMarineWorkflowFeedbackRouteResponse(
    ADMIN_AUTH,
    {
      useful: true,
      note: FEEDBACK.note,
      investigationId: INVESTIGATION.id,
      stationId: INVESTIGATION.stationId,
      timestamp: FEEDBACK.timestamp,
    },
    {
      source: "db",
      result: {
        ok: true,
        feedback: FEEDBACK,
      },
    },
  );

  assert.equal(response.status, 200);
  assert.ok("feedback" in response.json);
  assert.equal(response.json.feedback.id, FEEDBACK.id);
  assert.equal(response.telemetry.route, "POST /marine-intelligence/feedback");
  assert.equal(response.telemetry.result, "created");
});

test("marine workflow summary route returns decision and telemetry counts", () => {
  const response = buildMarineWorkflowSummaryRouteResponse(
    ADMIN_AUTH,
    undefined,
    {
      source: "db",
      result: {
        ok: true,
        summary: {
          decisionCount: 1,
          telemetryEventCount: 3,
          viewCount: 1,
          clickCount: 1,
          submitDecisionCount: 1,
          feedbackCount: 1,
          usefulFeedbackCount: 1,
          notUsefulFeedbackCount: 0,
          actionCounts: [{ decision: "delay_operations", count: 1 }],
          decisionsPerWeek: [{ weekStart: "2026-03-16T00:00:00.000Z", count: 1 }],
          feedbackPerWeek: [{ weekStart: "2026-03-16T00:00:00.000Z", count: 1 }],
          latestDecision: DECISION,
          latestTelemetryEvent: TELEMETRY_EVENT,
          latestFeedback: FEEDBACK,
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.ok("summary" in response.json);
  assert.equal(response.json.summary.decisionCount, 1);
  assert.equal(response.json.summary.telemetryEventCount, 3);
  assert.equal(response.json.summary.feedbackCount, 1);
  assert.equal(response.json.summary.actionCounts[0]?.decision, "delay_operations");
  assert.equal(response.json.summary.decisionsPerWeek[0]?.count, 1);
  assert.equal(response.json.summary.feedbackPerWeek[0]?.count, 1);
  assert.equal(response.telemetry.route, "GET /marine-intelligence/summary");
  assert.equal(response.telemetry.decisionCount, 1);
  assert.equal(response.telemetry.telemetryEventCount, 3);
});
