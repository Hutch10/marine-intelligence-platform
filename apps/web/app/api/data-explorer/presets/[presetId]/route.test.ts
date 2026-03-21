import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockDeleteDataExplorerPresetById, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockDeleteDataExplorerPresetById: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  deleteDataExplorerPresetById: mockDeleteDataExplorerPresetById,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../scope";
import { DELETE } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockDeleteDataExplorerPresetById.mockReset();
  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockDeleteDataExplorerPresetById.mockReturnValue({ ok: true, presets: [] });
});

test("DELETE rejects personal preset mutations without an authenticated station admin session", async () => {
  const response = await DELETE(
    new Request("http://localhost/api/data-explorer/presets/preset-1?scope=personal", { method: "DELETE" }),
    { params: Promise.resolve({ presetId: "preset-1" }) },
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    presets: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockDeleteDataExplorerPresetById).not.toHaveBeenCalled();
});

test("DELETE scopes personal preset mutations to the authenticated station admin actor", async () => {
  mockSessionCookie.mockReturnValue("session-7");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-7",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-7",
  });

  const response = await DELETE(
    new Request("http://localhost/api/data-explorer/presets/preset-7?scope=personal", { method: "DELETE" }),
    { params: Promise.resolve({ presetId: "preset-7" }) },
  );

  expect(response.status).toBe(200);
  expect(mockDeleteDataExplorerPresetById).toHaveBeenCalledWith("preset-7", {
    scope: "personal",
    ownerId: "operator-7",
    actor: {
      actorId: "operator-7",
      actorType: "station_admin",
    },
  });
});

test("DELETE tags shared preset mutations with unknown actor when session is unavailable", async () => {
  const response = await DELETE(
    new Request("http://localhost/api/data-explorer/presets/preset-shared?scope=shared", { method: "DELETE" }),
    { params: Promise.resolve({ presetId: "preset-shared" }) },
  );

  expect(response.status).toBe(200);
  expect(mockDeleteDataExplorerPresetById).toHaveBeenCalledWith("preset-shared", {
    scope: "shared",
    actor: {
      actorId: null,
      actorType: "unknown",
    },
  });
});