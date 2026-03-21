import { beforeEach, expect, test, vi } from "vitest";

const {
  mockApiClient,
  mockListDataExplorerBehaviorDedupeDropSummary,
  mockSessionCookie,
} = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockListDataExplorerBehaviorDedupeDropSummary: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  listDataExplorerBehaviorDedupeDropSummary: mockListDataExplorerBehaviorDedupeDropSummary,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../../presets/scope";
import { GET } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockListDataExplorerBehaviorDedupeDropSummary.mockReset();

  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockListDataExplorerBehaviorDedupeDropSummary.mockReturnValue({
    ok: true,
    summary: [],
    windowMinutes: 60,
  });
});

test("GET dedupe summary allows shared scope and passes bounded query options", async () => {
  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary?scope=shared&windowMinutes=30&limit=3"),
  );

  expect(response.status).toBe(200);
  expect(mockApiClient.stationAdminAuth.getSession).not.toHaveBeenCalled();
  expect(mockListDataExplorerBehaviorDedupeDropSummary).toHaveBeenCalledWith({
    scope: "shared",
    ownerId: undefined,
    windowMinutes: 30,
    limit: 3,
  });
});

test("GET dedupe summary personal scope rejects unauthenticated requests", async () => {
  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary?scope=personal"),
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    summary: [],
    windowMinutes: 60,
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockListDataExplorerBehaviorDedupeDropSummary).not.toHaveBeenCalled();
});

test("GET dedupe summary returns 400 on validation errors", async () => {
  mockListDataExplorerBehaviorDedupeDropSummary.mockReturnValueOnce({
    ok: false,
    summary: [],
    windowMinutes: 60,
    reason: "validation",
    error: "Window minutes must be a positive number.",
  });

  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary?scope=shared&windowMinutes=0"),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    summary: [],
    windowMinutes: 60,
    reason: "validation",
    error: "Window minutes must be a positive number.",
  });
});

test("GET dedupe summary returns 503 when diagnostics are unavailable", async () => {
  mockListDataExplorerBehaviorDedupeDropSummary.mockReturnValueOnce({
    ok: false,
    summary: [],
    windowMinutes: 60,
    reason: "read_failed",
    error: "Data Explorer dedupe diagnostics unavailable.",
  });

  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary?scope=shared"),
  );

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    summary: [],
    windowMinutes: 60,
    reason: "read_failed",
    error: "Data Explorer dedupe diagnostics unavailable.",
  });
});
