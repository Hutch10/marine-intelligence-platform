import { beforeEach, expect, test, vi } from "vitest";

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

import { GET } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
});

test("session-status reports personal scope unavailable without trusted station-admin session", async () => {
  const response = await GET();

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    status: {
      sessionActive: false,
      actorLabel: null,
      personalScopeAvailable: false,
    },
  });
});

test("session-status reports active actor label when trusted station-admin session exists", async () => {
  mockSessionCookie.mockReturnValue("session-31");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-31",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-31",
  });

  const response = await GET();

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    ok: true,
    status: {
      sessionActive: true,
      actorLabel: "operator-31",
      personalScopeAvailable: true,
    },
  });
});
