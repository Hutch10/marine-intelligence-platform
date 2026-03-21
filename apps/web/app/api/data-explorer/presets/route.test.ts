import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockLoadDataExplorerPresets, mockUpsertDataExplorerPreset, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockLoadDataExplorerPresets: vi.fn(),
  mockUpsertDataExplorerPreset: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  loadDataExplorerPresets: mockLoadDataExplorerPresets,
  upsertDataExplorerPreset: mockUpsertDataExplorerPreset,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "./scope";
import { GET, POST } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockLoadDataExplorerPresets.mockReset();
  mockUpsertDataExplorerPreset.mockReset();
  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockLoadDataExplorerPresets.mockReturnValue({ ok: true, presets: [] });
  mockUpsertDataExplorerPreset.mockReturnValue({ ok: true, presets: [] });
});

test("GET rejects personal preset reads without an authenticated station admin session", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/presets?scope=personal"));

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    presets: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockLoadDataExplorerPresets).not.toHaveBeenCalled();
});

test("GET shared preset reads do not require actor-resolution session lookups", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/presets?scope=shared"));

  expect(response.status).toBe(200);
  expect(mockApiClient.stationAdminAuth.getSession).not.toHaveBeenCalled();
  expect(mockLoadDataExplorerPresets).toHaveBeenCalledWith({
    scope: "shared",
  });
});

test("POST resolves the personal preset owner from the authenticated station admin session", async () => {
  mockSessionCookie.mockReturnValue("session-42");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-42",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-42",
  });

  const response = await POST(new Request("http://localhost/api/data-explorer/presets?scope=personal", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Personal Thermal",
      scope: "personal",
      filters: { q: "thermal" },
    }),
  }));

  expect(response.status).toBe(200);
  expect(mockUpsertDataExplorerPreset).toHaveBeenCalledWith(expect.objectContaining({
    name: "Personal Thermal",
    scope: "personal",
    ownerId: "operator-42",
    actor: {
      actorId: "operator-42",
      actorType: "station_admin",
    },
  }));
});

test("POST tags shared preset mutations with unknown actor when no station admin session is available", async () => {
  const response = await POST(new Request("http://localhost/api/data-explorer/presets?scope=shared", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Shared Thermal",
      scope: "shared",
      filters: { q: "thermal" },
    }),
  }));

  expect(response.status).toBe(200);
  expect(mockUpsertDataExplorerPreset).toHaveBeenCalledWith(expect.objectContaining({
    name: "Shared Thermal",
    scope: "shared",
    ownerId: undefined,
    actor: {
      actorId: null,
      actorType: "unknown",
    },
  }));
});

test("POST tags shared preset mutations with station admin actor when session exists", async () => {
  mockSessionCookie.mockReturnValue("session-10");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-10",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-10",
  });

  const response = await POST(new Request("http://localhost/api/data-explorer/presets?scope=shared", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Shared With Actor",
      scope: "shared",
      filters: { q: "shared" },
    }),
  }));

  expect(response.status).toBe(200);
  expect(mockUpsertDataExplorerPreset).toHaveBeenCalledWith(expect.objectContaining({
    name: "Shared With Actor",
    scope: "shared",
    actor: {
      actorId: "operator-10",
      actorType: "station_admin",
    },
  }));
});