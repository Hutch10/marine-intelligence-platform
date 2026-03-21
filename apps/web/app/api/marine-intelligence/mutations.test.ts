import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
    marineIntelligence: {
      createInvestigation: vi.fn(),
      acknowledgeAlert: vi.fn(),
      resolveAlert: vi.fn(),
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

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockApiClient.marineIntelligence.createInvestigation.mockReset();
  mockApiClient.marineIntelligence.acknowledgeAlert.mockReset();
  mockApiClient.marineIntelligence.resolveAlert.mockReset();

  mockSessionCookie.mockReturnValue("session-001");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "ops.lead@marine.local",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-001",
  });
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
  mockApiClient.marineIntelligence.createInvestigation.mockResolvedValueOnce({
    ok: true,
    investigation: { id: "MIID-001" },
  });

  const response = await createInvestigation(
    new Request("http://localhost/api/marine-intelligence/investigations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: "MEV-001", title: "Investigate threshold alert" }),
    }),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    investigation: { id: "MIID-001" },
  });
});

test("marine alert acknowledge mutation route returns client errors non-destructively", async () => {
  mockApiClient.marineIntelligence.acknowledgeAlert.mockResolvedValueOnce({
    ok: false,
    status: 404,
    message: "Marine alert not found",
  });

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
  mockApiClient.marineIntelligence.resolveAlert.mockResolvedValueOnce({
    ok: true,
    alert: { id: "MALT-001", status: "resolved" },
  });

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