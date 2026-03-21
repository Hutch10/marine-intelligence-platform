import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockListPresetAuditEvents, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockListPresetAuditEvents: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  listPresetAuditEvents: mockListPresetAuditEvents,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../scope";
import { GET } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockListPresetAuditEvents.mockReset();
  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockListPresetAuditEvents.mockReturnValue({ ok: true, events: [] });
});

test("GET returns shared preset activity without requiring station-admin session auth", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/presets/audit?scope=shared&limit=5"));

  expect(response.status).toBe(200);
  expect(mockApiClient.stationAdminAuth.getSession).not.toHaveBeenCalled();
  expect(mockListPresetAuditEvents).toHaveBeenCalledWith({
    scope: "shared",
    ownerId: undefined,
    presetId: undefined,
    actorId: undefined,
    action: undefined,
    limit: 5,
  });
});

test("GET rejects personal preset activity reads without an authenticated station admin session", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/presets/audit?scope=personal"));

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    events: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockListPresetAuditEvents).not.toHaveBeenCalled();
});

test("GET scopes personal preset activity reads to the authenticated station admin actor", async () => {
  mockSessionCookie.mockReturnValue("session-11");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-11",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-11",
  });

  const response = await GET(
    new Request("http://localhost/api/data-explorer/presets/audit?scope=personal&presetId=preset-1&actorId=operator-11&action=updated&limit=10"),
  );

  expect(response.status).toBe(200);
  expect(mockListPresetAuditEvents).toHaveBeenCalledWith({
    scope: "personal",
    ownerId: "operator-11",
    presetId: "preset-1",
    actorId: "operator-11",
    action: "updated",
    limit: 10,
  });
});
