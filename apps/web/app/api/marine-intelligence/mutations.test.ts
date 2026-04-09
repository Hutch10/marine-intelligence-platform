import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

import { POST as createInvestigation } from "./investigations/route";
import { POST as acknowledgeAlert } from "./alerts/[alertId]/acknowledge/route";
import { POST as resolveAlert } from "./alerts/[alertId]/resolve/route";
import { POST as createDecision } from "./decisions/route";
import { POST as createFeedback } from "./feedback/route";
import { POST as createTelemetry } from "./telemetry/route";
import { GET as getSummary } from "./summary/route";

const fetchMock = vi.fn();

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);

  mockSessionCookie.mockReturnValue("session-001");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "ops.lead@marine.local",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-001",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("marine investigation mutation route requires a station admin session", async () => {
  mockSessionCookie.mockReturnValue(null);

  const response = await createInvestigation(
    new Request("http://localhost/api/marine-intelligence/investigations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "MEV-001", title: "Investigate threshold alert" }),
    }),
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({ message: "Session required" });
});

test("marine investigation mutation route enforces station.view_admin", async () => {
  mockApiClient.stationAdminAuth.getSession.mockResolvedValueOnce({
    actorId: "viewer@marine.local",
    role: "viewer",
    permissions: [],
    csrfToken: "csrf-viewer",
  });

  const response = await createInvestigation(
    new Request("http://localhost/api/marine-intelligence/investigations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "MEV-001", title: "Investigate threshold alert" }),
    }),
  );

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({ message: "Missing permission: station.view_admin" });
});

test("marine investigation mutation route returns created investigation payload", async () => {
  vi.stubEnv("MARINE_API_BASE_URL", "https://api.marine.test");
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ investigation: { id: "MIID-001" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const response = await createInvestigation(
    new Request("http://localhost/api/marine-intelligence/investigations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "MEV-001", title: "Investigate threshold alert" }),
    }),
  );

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    investigation: { id: "MIID-001" },
  });
});

test("marine alert acknowledge mutation route returns client errors non-destructively", async () => {
  vi.stubEnv("MARINE_API_BASE_URL", "https://api.marine.test");
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ message: "Marine alert not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const response = await acknowledgeAlert(
    new Request("http://localhost/api/marine-intelligence/alerts/MALT-001/acknowledge", {
      method: "POST",
    }),
    { params: { alertId: "MALT-001" } },
  );

  expect(response.status).toBe(404);
  await expect(response.json()).resolves.toEqual({ message: "Marine alert not found" });
});

test("marine alert resolve mutation route returns updated alert payload", async () => {
  vi.stubEnv("MARINE_API_BASE_URL", "https://api.marine.test");
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ alert: { id: "MALT-001", status: "resolved" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const response = await resolveAlert(
    new Request("http://localhost/api/marine-intelligence/alerts/MALT-001/resolve", {
      method: "POST",
    }),
    { params: { alertId: "MALT-001" } },
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    alert: { id: "MALT-001", status: "resolved" },
  });
});

test("marine decision mutation route proxies to the API service", async () => {
  vi.stubEnv("MARINE_API_BASE_URL", "https://api.marine.test");
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ decision: { id: "MID-001", decision: "delay_operations" } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const response = await createDecision(
    new Request("http://localhost/api/marine-intelligence/decisions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        investigationId: "TRK-201",
        stationId: "STA-NPC-01",
        decision: "delay_operations",
        rationale: "Wave energy remains above the safe limit.",
        timestamp: "2026-03-22T12:00:00.000Z",
      }),
    }),
  );

  expect(response.status).toBe(200);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    decision: { id: "MID-001", decision: "delay_operations" },
  });
});

test("marine telemetry mutation route validates event type", async () => {
  const response = await createTelemetry(
    new Request("http://localhost/api/marine-intelligence/telemetry", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventType: "invalid",
        timestamp: "2026-03-22T12:00:00.000Z",
      }),
    }),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ message: "eventType is invalid" });
});

test("marine feedback mutation route proxies to the API service", async () => {
  vi.stubEnv("MARINE_API_BASE_URL", "https://api.marine.test");
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ feedback: { id: "MFB-001", useful: true } }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );

  const response = await createFeedback(
    new Request("http://localhost/api/marine-intelligence/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        useful: true,
        note: "Helpful recommendation",
        investigationId: "TRK-201",
        stationId: "STA-NPC-01",
        timestamp: "2026-03-22T12:00:00.000Z",
      }),
    }),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    feedback: { id: "MFB-001", useful: true },
  });
});

test("marine summary route proxies summary payload from the API service", async () => {
  vi.stubEnv("MARINE_API_BASE_URL", "https://api.marine.test");
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        summary: {
          decisionCount: 2,
          telemetryEventCount: 7,
          viewCount: 2,
          clickCount: 3,
          submitDecisionCount: 2,
          feedbackCount: 1,
          usefulFeedbackCount: 1,
          notUsefulFeedbackCount: 0,
          actionCounts: [{ decision: "delay_operations", count: 2 }],
          decisionsPerWeek: [{ weekStart: "2026-03-16T00:00:00.000Z", count: 2 }],
          feedbackPerWeek: [{ weekStart: "2026-03-16T00:00:00.000Z", count: 1 }],
          latestDecision: null,
          latestTelemetryEvent: null,
          latestFeedback: null,
        },
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );

  const response = await getSummary(
    new Request("http://localhost/api/marine-intelligence/summary"),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    summary: {
      decisionCount: 2,
      telemetryEventCount: 7,
      viewCount: 2,
      clickCount: 3,
      submitDecisionCount: 2,
      feedbackCount: 1,
      usefulFeedbackCount: 1,
      notUsefulFeedbackCount: 0,
      actionCounts: [{ decision: "delay_operations", count: 2 }],
      decisionsPerWeek: [{ weekStart: "2026-03-16T00:00:00.000Z", count: 2 }],
      feedbackPerWeek: [{ weekStart: "2026-03-16T00:00:00.000Z", count: 1 }],
      latestDecision: null,
      latestTelemetryEvent: null,
      latestFeedback: null,
    },
  });
});
