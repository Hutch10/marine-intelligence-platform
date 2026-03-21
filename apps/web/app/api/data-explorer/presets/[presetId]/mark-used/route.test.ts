import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockMarkDataExplorerPresetUsed, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockMarkDataExplorerPresetUsed: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  markDataExplorerPresetUsed: mockMarkDataExplorerPresetUsed,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../../scope";
import { POST } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockMarkDataExplorerPresetUsed.mockReset();
  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockMarkDataExplorerPresetUsed.mockReturnValue({ ok: true, presets: [] });
});

test("mark-used rejects personal preset usage updates without an authenticated station admin session", async () => {
  const response = await POST(
    new Request("http://localhost/api/data-explorer/presets/preset-1/mark-used?scope=personal", { method: "POST" }),
    { params: Promise.resolve({ presetId: "preset-1" }) },
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    presets: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockMarkDataExplorerPresetUsed).not.toHaveBeenCalled();
});

test("mark-used scopes personal preset updates to the authenticated station admin actor", async () => {
  mockSessionCookie.mockReturnValue("session-9");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-9",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-9",
  });

  const response = await POST(
    new Request("http://localhost/api/data-explorer/presets/preset-9/mark-used?scope=personal", { method: "POST" }),
    { params: Promise.resolve({ presetId: "preset-9" }) },
  );

  expect(response.status).toBe(200);
  expect(mockMarkDataExplorerPresetUsed).toHaveBeenCalledWith("preset-9", {
    scope: "personal",
    ownerId: "operator-9",
    actor: {
      actorId: "operator-9",
      actorType: "station_admin",
    },
  });
});

test("mark-used tags shared preset mutations with unknown actor when session is unavailable", async () => {
  const response = await POST(
    new Request("http://localhost/api/data-explorer/presets/preset-shared/mark-used?scope=shared", { method: "POST" }),
    { params: Promise.resolve({ presetId: "preset-shared" }) },
  );

  expect(response.status).toBe(200);
  expect(mockMarkDataExplorerPresetUsed).toHaveBeenCalledWith("preset-shared", {
    scope: "shared",
    actor: {
      actorId: null,
      actorType: "unknown",
    },
  });
});