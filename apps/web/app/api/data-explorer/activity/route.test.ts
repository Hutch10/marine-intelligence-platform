import { beforeEach, expect, test, vi } from "vitest";

const { mockApiClient, mockAppendDataExplorerBehaviorEvent, mockListDataExplorerBehaviorEvents, mockSessionCookie } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockAppendDataExplorerBehaviorEvent: vi.fn(),
  mockListDataExplorerBehaviorEvents: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  appendDataExplorerBehaviorEvent: mockAppendDataExplorerBehaviorEvent,
  listDataExplorerBehaviorEvents: mockListDataExplorerBehaviorEvents,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../presets/scope";
import { GET, POST } from "./route";

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockAppendDataExplorerBehaviorEvent.mockReset();
  mockListDataExplorerBehaviorEvents.mockReset();

  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockAppendDataExplorerBehaviorEvent.mockReturnValue({ ok: true });
  mockListDataExplorerBehaviorEvents.mockReturnValue({ ok: true, events: [] });
});

test("GET recent usage allows shared scope without session lookup", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/activity?scope=shared&limit=5"));

  expect(response.status).toBe(200);
  expect(mockApiClient.stationAdminAuth.getSession).not.toHaveBeenCalled();
  expect(mockListDataExplorerBehaviorEvents).toHaveBeenCalledWith({
    scope: "shared",
    ownerId: undefined,
    limit: 5,
  });
});

test("GET personal recent usage rejects unauthenticated requests", async () => {
  const response = await GET(new Request("http://localhost/api/data-explorer/activity?scope=personal"));

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    events: [],
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockListDataExplorerBehaviorEvents).not.toHaveBeenCalled();
});

test("POST personal behavior events derive actor identity from trusted station-admin session", async () => {
  mockSessionCookie.mockReturnValue("session-21");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "operator-21",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-21",
  });

  const response = await POST(
    new Request("http://localhost/api/data-explorer/activity?scope=personal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: "dataset_detail_viewed",
        scope: "personal",
        datasetId: "DST-100",
        datasetName: "Atlantic Thermal",
        sourceContext: {
          interaction: "detail-load",
        },
      }),
    }),
  );

  expect(response.status).toBe(200);
  expect(mockAppendDataExplorerBehaviorEvent).toHaveBeenCalledWith(expect.objectContaining({
    eventType: "dataset_detail_viewed",
    scope: "personal",
    ownerId: "operator-21",
    actor: {
      actorId: "operator-21",
      actorType: "station_admin",
    },
    actorLabel: "operator-21",
    datasetId: "DST-100",
    datasetName: "Atlantic Thermal",
  }));
});

test("POST shared behavior events are accepted without station-admin session and attributed as unknown", async () => {
  const response = await POST(
    new Request("http://localhost/api/data-explorer/activity?scope=shared", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: "dataset_selected",
        scope: "shared",
        datasetId: "DST-300",
        datasetName: "Shared Dataset",
      }),
    }),
  );

  expect(response.status).toBe(200);
  expect(mockAppendDataExplorerBehaviorEvent).toHaveBeenCalledWith(expect.objectContaining({
    eventType: "dataset_selected",
    scope: "shared",
    ownerId: undefined,
    actor: {
      actorId: null,
      actorType: "unknown",
    },
    actorLabel: "Unknown actor",
    datasetId: "DST-300",
    datasetName: "Shared Dataset",
  }));
});

test("POST personal behavior events reject unauthenticated requests", async () => {
  const response = await POST(
    new Request("http://localhost/api/data-explorer/activity?scope=personal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        eventType: "dataset_selected",
        scope: "personal",
        datasetId: "DST-100",
      }),
    }),
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockAppendDataExplorerBehaviorEvent).not.toHaveBeenCalled();
});
