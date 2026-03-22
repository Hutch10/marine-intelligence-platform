import test from "node:test";
import assert from "node:assert/strict";
import {
  buildInvestigationEventCreateRouteResponse,
  buildInvestigationTimelineRouteResponse,
} from "./investigation-events";
import type { InvestigationTimelineItem } from "@marine/shared";

const DB_TIMELINE: InvestigationTimelineItem[] = [
  {
    id: "INV-EVT-2",
    timestamp: "2026-03-17T10:30:00.000Z",
    eventType: "track_escalated",
    source: "Analysis workspace",
    summary: "Track escalated",
    detail: "Confidence crossed threshold",
  },
  {
    id: "INV-EVT-1",
    timestamp: "2026-03-17T09:15:00.000Z",
    eventType: "case_opened",
    source: "Investigation workspace",
    summary: "Case opened",
  },
];

test("investigation timeline route returns DB timeline and telemetry", () => {
  const response = buildInvestigationTimelineRouteResponse(
    "TRK-201",
    { limit: 25 },
    { source: "db", timeline: DB_TIMELINE },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.route, "GET /investigations/:id/timeline");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.eventCount, 2);
  assert.equal(response.telemetry.filtersApplied, true);
  assert.equal(response.json.timeline.length, 2);
});

test("investigation timeline route supports mock fallback filtering", () => {
  const response = buildInvestigationTimelineRouteResponse(
    "TRK-201",
    { eventType: "track_escalated", limit: 10 },
    { source: "mock", fallbackReason: "db_open_failed" },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
  assert.ok(response.json.timeline.length > 0);
  assert.ok(response.json.timeline.every((item) => item.eventType === "track_escalated"));
});

test("investigation event create route validates event type", () => {
  const response = buildInvestigationEventCreateRouteResponse("TRK-201", {
    id: "TRK-201",
    eventType: "invalid_type" as never,
    source: "Analyst",
    summary: "Invalid event",
  });

  assert.equal(response.status, 400);
  assert.equal(response.telemetry.result, "invalid");
  assert.equal(response.telemetry.validationError, "invalid_event_type");
});

test("investigation event create route returns created event", () => {
  const response = buildInvestigationEventCreateRouteResponse(
    "TRK-201",
    {
      id: "TRK-201",
      eventType: "signal_linked",
      source: "Signal fusion engine",
      actor: "pilot.analyst@marine.local",
      summary: "Linked buoy signal",
      detail: "ATLAS-19 signal joined to case",
      confidence: 78,
    },
    {
      source: "db",
      result: "created",
      event: {
        id: "INV-EVT-NEW",
        timestamp: "2026-03-17T12:00:00.000Z",
        eventType: "signal_linked",
        source: "Signal fusion engine",
        summary: "Linked buoy signal",
        detail: "ATLAS-19 signal joined to case",
      },
    },
  );

  assert.equal(response.status, 201);
  assert.equal(response.telemetry.result, "created");
  assert.ok("event" in response.json);
  if ("event" in response.json) {
    assert.equal(response.json.event.eventType, "signal_linked");
  }
});

test("investigation event create route returns 404 when investigation is missing", () => {
  const response = buildInvestigationEventCreateRouteResponse(
    "TRK-MISSING",
    {
      id: "TRK-MISSING",
      eventType: "signal_linked",
      source: "Signal fusion engine",
      summary: "Linked buoy signal",
    },
    {
      source: "db",
      result: "not_found",
    },
  );

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.result, "not_found");
});

test("investigation event create route returns 503 on DB fallback", () => {
  const response = buildInvestigationEventCreateRouteResponse(
    "TRK-201",
    {
      id: "TRK-201",
      eventType: "signal_linked",
      source: "Signal fusion engine",
      summary: "Linked buoy signal",
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
