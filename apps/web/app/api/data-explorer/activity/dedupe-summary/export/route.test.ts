import { beforeEach, expect, test, vi } from "vitest";

const {
  mockApiClient,
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot,
  mockSessionCookie,
} = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
  },
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot: vi.fn(),
  mockSessionCookie: vi.fn(),
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/lib/api/session-cookies", () => ({
  getStationAdminSessionCookie: mockSessionCookie,
}));

vi.mock("@/lib/server/data-explorer-preset-store", () => ({
  exportDataExplorerBehaviorDedupeDropSummarySnapshot: mockExportDataExplorerBehaviorDedupeDropSummarySnapshot,
}));

import { DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR } from "../../../presets/scope";
import { DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE } from "@/lib/persistence/types";
import { GET } from "./route";

const sharedSnapshot = {
  schemaVersion: 1 as const,
  exportedAt: "2026-03-20T16:20:30.000Z",
  scope: "shared" as const,
  windowMinutes: 60,
  totalDatasets: 1,
  summary: [
    {
      datasetId: "DST-101",
      dropCount: 3,
      mostRecentDroppedAt: "2026-03-20T16:10:00.000Z",
    },
  ],
  provenance: {
    source: "repository" as const,
    route: "/api/data-explorer/activity/dedupe-summary/export" as const,
    requestedFormat: "json" as const,
    requestedLimit: 3,
    ordering: {
      primary: "dropCount:desc" as const,
      secondary: "datasetId:asc" as const,
    },
    requestedBy: {
      actorId: null,
      actorType: "unknown" as const,
      ownerId: null,
    },
    exportHistory: [
      {
        exportedAt: "2026-03-20T16:20:30.000Z",
        format: "json" as const,
        scope: "shared" as const,
        totalDatasets: 1,
        actorId: null,
      },
    ],
  },
};

beforeEach(() => {
  mockSessionCookie.mockReset();
  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot.mockReset();

  mockSessionCookie.mockReturnValue(null);
  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(null);
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot.mockReturnValue({
    ok: true,
    format: "json",
    snapshot: sharedSnapshot,
    filename: "data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.json",
    content: JSON.stringify(sharedSnapshot, null, 2),
    contentType: "application/json; charset=utf-8",
  });
});

test("GET dedupe summary export returns downloadable JSON for shared scope", async () => {
  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared&windowMinutes=30&limit=3"),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("application/json; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe(
    "attachment; filename=\"data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.json\"",
  );
  await expect(response.json()).resolves.toEqual({
    schemaVersion: 1,
    exportedAt: "2026-03-20T16:20:30.000Z",
    scope: "shared",
    windowMinutes: 60,
    totalDatasets: 1,
    summary: [
      {
        datasetId: "DST-101",
        dropCount: 3,
        mostRecentDroppedAt: "2026-03-20T16:10:00.000Z",
      },
    ],
    provenance: {
      source: "repository",
      route: "/api/data-explorer/activity/dedupe-summary/export",
      requestedFormat: "json",
      requestedLimit: 3,
      ordering: {
        primary: "dropCount:desc",
        secondary: "datasetId:asc",
      },
      requestedBy: {
        actorId: null,
        actorType: "unknown",
        ownerId: null,
      },
      exportHistory: [
        {
          exportedAt: "2026-03-20T16:20:30.000Z",
          format: "json",
          scope: "shared",
          totalDatasets: 1,
          actorId: null,
        },
      ],
    },
  });
  expect(mockExportDataExplorerBehaviorDedupeDropSummarySnapshot).toHaveBeenCalledWith({
    scope: "shared",
    ownerId: undefined,
    actor: {
      actorId: null,
      actorType: "unknown",
    },
    format: "json",
    windowMinutes: 30,
    limit: 3,
  });
});

test("GET dedupe summary export returns 200 with empty summary snapshot", async () => {
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot.mockReturnValueOnce({
    ok: true,
    format: "json",
    snapshot: {
      schemaVersion: 1,
      exportedAt: "2026-03-20T16:21:00.000Z",
      scope: "shared",
      windowMinutes: 60,
      totalDatasets: 0,
      summary: [],
      provenance: {
        source: "repository",
        route: "/api/data-explorer/activity/dedupe-summary/export",
        requestedFormat: "json",
        ordering: {
          primary: "dropCount:desc",
          secondary: "datasetId:asc",
        },
        requestedBy: {
          actorId: null,
          actorType: "unknown",
          ownerId: null,
        },
        exportHistory: [
          {
            exportedAt: "2026-03-20T16:21:00.000Z",
            format: "json",
            scope: "shared",
            totalDatasets: 0,
            actorId: null,
          },
        ],
      },
    },
    filename: "data-explorer-dedupe-summary-shared-2026-03-20T16-21-00-000Z.json",
    content: JSON.stringify({
      schemaVersion: 1,
      exportedAt: "2026-03-20T16:21:00.000Z",
      scope: "shared",
      windowMinutes: 60,
      totalDatasets: 0,
      summary: [],
      provenance: {
        source: "repository",
        route: "/api/data-explorer/activity/dedupe-summary/export",
        requestedFormat: "json",
        ordering: {
          primary: "dropCount:desc",
          secondary: "datasetId:asc",
        },
        requestedBy: {
          actorId: null,
          actorType: "unknown",
          ownerId: null,
        },
        exportHistory: [
          {
            exportedAt: "2026-03-20T16:21:00.000Z",
            format: "json",
            scope: "shared",
            totalDatasets: 0,
            actorId: null,
          },
        ],
      },
    }, null, 2),
    contentType: "application/json; charset=utf-8",
  });

  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared"),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({
    schemaVersion: 1,
    exportedAt: "2026-03-20T16:21:00.000Z",
    scope: "shared",
    windowMinutes: 60,
    totalDatasets: 0,
    summary: [],
    provenance: {
      source: "repository",
      route: "/api/data-explorer/activity/dedupe-summary/export",
      requestedFormat: "json",
      ordering: {
        primary: "dropCount:desc",
        secondary: "datasetId:asc",
      },
      requestedBy: {
        actorId: null,
        actorType: "unknown",
        ownerId: null,
      },
      exportHistory: [
        {
          exportedAt: "2026-03-20T16:21:00.000Z",
          format: "json",
          scope: "shared",
          totalDatasets: 0,
          actorId: null,
        },
      ],
    },
  });
});

test("GET dedupe summary export returns downloadable CSV when requested", async () => {
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot.mockReturnValueOnce({
    ok: true,
    format: "csv",
    snapshot: {
      ...sharedSnapshot,
      provenance: {
        ...sharedSnapshot.provenance,
        requestedFormat: "csv",
      },
    },
    filename: "data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.csv",
    content: [
      "# schemaVersion=1",
      "# exportedAt=2026-03-20T16:20:30.000Z",
      "# scope=shared",
      "# windowMinutes=60",
      "# totalDatasets=1",
      "# source=repository",
      "# route=/api/data-explorer/activity/dedupe-summary/export",
      "# requestedFormat=csv",
      "# orderingPrimary=dropCount:desc",
      "# orderingSecondary=datasetId:asc",
      "# requestedByActorId=",
      "# requestedByActorType=unknown",
      "# requestedByOwnerId=",
      "# exportHistory=[{\"exportedAt\":\"2026-03-20T16:20:30.000Z\",\"format\":\"json\",\"scope\":\"shared\",\"totalDatasets\":1,\"actorId\":null}]",
      "datasetId,dropCount,mostRecentDroppedAt",
      "DST-101,3,2026-03-20T16:10:00.000Z",
    ].join("\n"),
    contentType: "text/csv; charset=utf-8",
  });

  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared&format=csv"),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe(
    "attachment; filename=\"data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.csv\"",
  );
  await expect(response.text()).resolves.toContain("datasetId,dropCount,mostRecentDroppedAt");
  expect(mockExportDataExplorerBehaviorDedupeDropSummarySnapshot).toHaveBeenCalledWith({
    scope: "shared",
    ownerId: undefined,
    actor: {
      actorId: null,
      actorType: "unknown",
    },
    format: "csv",
    windowMinutes: undefined,
    limit: undefined,
  });
});

test("GET dedupe summary export personal scope includes authenticated actor context", async () => {
  mockSessionCookie.mockReturnValue("session-123");
  mockApiClient.stationAdminAuth.getSession.mockResolvedValueOnce({
    actorId: "captain-mira",
  });

  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=personal"),
  );

  expect(response.status).toBe(200);
  expect(mockExportDataExplorerBehaviorDedupeDropSummarySnapshot).toHaveBeenCalledWith({
    scope: "personal",
    ownerId: "captain-mira",
    actor: {
      actorId: "captain-mira",
      actorType: "station_admin",
    },
    format: "json",
    windowMinutes: undefined,
    limit: undefined,
  });
});

test("GET dedupe summary export personal scope rejects unauthenticated requests", async () => {
  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=personal"),
  );

  expect(response.status).toBe(401);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    reason: "validation",
    error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
  });
  expect(mockExportDataExplorerBehaviorDedupeDropSummarySnapshot).not.toHaveBeenCalled();
});

test("GET dedupe summary export returns 400 on validation errors", async () => {
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot.mockReturnValueOnce({
    ok: false,
    format: "json",
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "validation",
    error: "Window minutes must be a positive number.",
  });

  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared&windowMinutes=0"),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    format: "json",
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "validation",
    error: "Window minutes must be a positive number.",
  });
});

test("GET dedupe summary export returns 400 on unsupported formats", async () => {
  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared&format=xml"),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    format: "json",
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "validation",
    error: "Export format is not supported.",
  });
  expect(mockExportDataExplorerBehaviorDedupeDropSummarySnapshot).not.toHaveBeenCalled();
});

test("GET dedupe summary export returns 503 when diagnostics are unavailable", async () => {
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot.mockReturnValueOnce({
    ok: false,
    format: "json",
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "read_failed",
    error: "Data Explorer dedupe diagnostics unavailable.",
  });

  const response = await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared"),
  );

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
    ok: false,
    format: "json",
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "read_failed",
    error: "Data Explorer dedupe diagnostics unavailable.",
  });
});

test("GET dedupe summary export logs request telemetry on every invocation", async () => {
  const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

  await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared"),
  );

  const exportCalls = debugSpy.mock.calls.filter(
    ([prefix]) => prefix === DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE,
  );
  expect(exportCalls.some(([, data]) => {
    const record = data as Record<string, unknown>;
    return record.layer === "route" && record.event === "request";
  })).toBe(true);

  debugSpy.mockRestore();
});

test("GET dedupe summary export logs empty telemetry when summary is empty", async () => {
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot.mockReturnValueOnce({
    ok: true,
    format: "json",
    snapshot: {
      schemaVersion: 1,
      exportedAt: "2026-03-20T16:21:00.000Z",
      scope: "shared",
      windowMinutes: 60,
      totalDatasets: 0,
      summary: [],
      provenance: {
        source: "repository",
        route: "/api/data-explorer/activity/dedupe-summary/export",
        requestedFormat: "json",
        ordering: { primary: "dropCount:desc", secondary: "datasetId:asc" },
        requestedBy: { actorId: null, actorType: "unknown", ownerId: null },
        exportHistory: [],
      },
    },
    filename: "data-explorer-dedupe-summary-shared-2026-03-20T16-21-00-000Z.json",
    content: "{}",
    contentType: "application/json; charset=utf-8",
  });

  const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

  await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared"),
  );

  const exportCalls = debugSpy.mock.calls.filter(
    ([prefix]) => prefix === DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE,
  );
  expect(exportCalls.some(([, data]) => {
    const record = data as Record<string, unknown>;
    return record.layer === "route" && record.event === "empty";
  })).toBe(true);

  debugSpy.mockRestore();
});

test("GET dedupe summary export logs failure telemetry on store errors", async () => {
  mockExportDataExplorerBehaviorDedupeDropSummarySnapshot.mockReturnValueOnce({
    ok: false,
    format: "json",
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "read_failed",
    error: "Store unavailable.",
  });

  const debugSpy = vi.spyOn(console, "debug").mockImplementation(() => {});

  await GET(
    new Request("http://localhost/api/data-explorer/activity/dedupe-summary/export?scope=shared"),
  );

  const exportCalls = debugSpy.mock.calls.filter(
    ([prefix]) => prefix === DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE,
  );
  expect(exportCalls.some(([, data]) => {
    const record = data as Record<string, unknown>;
    return record.layer === "route" && record.event === "failure";
  })).toBe(true);

  debugSpy.mockRestore();
});
