import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { apiClient } from "@/lib/api/client";
import { dataExplorerWorkspaceData } from "@/lib/api/mock-data";
import * as datasetsRoutes from "../../../api/src/routes/datasets";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.restoreAllMocks();
  fetchMock.mockReset();
  fetchMock.mockRejectedValue(new Error("network unavailable"));
  vi.stubGlobal("fetch", fetchMock);
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("workspace fetch uses network API boundary in browser mode when available", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ...dataExplorerWorkspaceData,
        datasets: [dataExplorerWorkspaceData.datasets[0]!],
        pageInfo: {
          page: 1,
          pageSize: 25,
          totalItems: 1,
          totalPages: 1,
          sortBy: "updated",
          sortDir: "desc",
        },
      }),
      {
        status: 200,
        headers: {
          "x-marine-data-source": "db",
          "x-marine-fallback-reason": "",
        },
      },
    ),
  );

  const result = await apiClient.dataExplorer.getWorkspace({ q: "thermal" });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer?q=thermal",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.meta.delivery).toBe("browser_api");
  expect(result.meta.source).toBe("db");
  expect(result.meta.state).toBe("success");
  expect(result.data.datasets).toHaveLength(1);
});

test("dataset detail fetch maps network 404 to not_found", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ message: "Dataset not found" }), {
      status: 404,
      headers: {
        "x-marine-data-source": "db",
      },
    }),
  );

  const result = await apiClient.dataExplorer.getDatasetDetail("DST-MISSING");

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/DST-MISSING",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.data).toBeNull();
  expect(result.meta.state).toBe("not_found");
  expect(result.meta.source).toBe("db");
});

test("workspace fetch falls back through typed dataset route builder when route handler throws", async () => {
  vi.spyOn(datasetsRoutes.getDatasetsRoute, "handler").mockImplementation(() => {
    throw new Error("handler failed");
  });

  const buildSpy = vi.spyOn(datasetsRoutes, "buildDatasetsRouteResponse").mockReturnValue({
    json: {
      ...dataExplorerWorkspaceData,
      datasets: [dataExplorerWorkspaceData.datasets[0]!],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 1,
        totalPages: 1,
        sortBy: "updated",
        sortDir: "desc",
      },
    },
    telemetry: {
      route: "GET /datasets",
      source: "db",
      datasetCount: 1,
      filtersApplied: true,
      filterSummary: {
        q: "thermal",
      },
      sortBy: "updated",
      sortDir: "desc",
      page: 1,
      pageSize: 25,
    },
  });

  const result = await apiClient.dataExplorer.getWorkspace({ q: "  thermal " });

  expect(buildSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      q: "thermal",
    }),
  );
  expect(result.data.datasets).toHaveLength(1);
  expect(result.meta.state).toBe("success");
  expect(result.meta.source).toBe("db");
});

test("dataset detail fetch falls back through typed dataset detail route builder when route handler throws", async () => {
  vi.spyOn(datasetsRoutes.getDatasetByIdRoute, "handler").mockImplementation(() => {
    throw new Error("handler failed");
  });

  vi.spyOn(datasetsRoutes, "buildDatasetDetailRouteResponse").mockReturnValue({
    status: 200,
    json: {
      id: "DST-104",
      name: "Pacific Thermal Front Observations",
      category: "Temperature",
      region: "North Pacific",
      updated: "5 min ago",
      records: "1.2M",
      status: "Live",
      metadata: {
        Owner: "Ocean Systems Lab",
      },
    },
    telemetry: {
      route: "GET /datasets/:id",
      datasetId: "DST-104",
      source: "db",
      result: "found",
      metadataSource: "db_full",
    },
  });

  const result = await apiClient.dataExplorer.getDatasetDetail("DST-104");

  expect(result.meta.state).toBe("success");
  expect(result.meta.source).toBe("db");
  expect(result.data?.id).toBe("DST-104");
});

test("dataset records fetch falls back through typed dataset records route builder when route handler throws", async () => {
  vi.spyOn(datasetsRoutes.getDatasetRecordsRoute, "handler").mockImplementation(() => {
    throw new Error("handler failed");
  });

  vi.spyOn(datasetsRoutes, "buildDatasetRecordsRouteResponse").mockReturnValue({
    status: 200,
    json: {
      records: [
        {
          id: "ALT-214",
          title: "Thermal spike detected in reef-edge grid",
          type: "Alert",
          status: "Open",
          updated: "11 min ago",
          summary: "Elevated surface temperature exceeded the seasonal envelope.",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 5,
        totalItems: 1,
        totalPages: 1,
        sortBy: "updated",
        sortDir: "desc",
      },
    },
    telemetry: {
      route: "GET /datasets/:id/records",
      datasetId: "DST-104",
      source: "db",
      recordCount: 1,
      result: "found",
      sortBy: "updated",
      sortDir: "desc",
      page: 1,
      pageSize: 5,
    },
  });

  const result = await apiClient.dataExplorer.getDatasetRecords("DST-104", {
    sortBy: "updated",
    sortDir: "desc",
    page: 1,
    pageSize: 5,
  });

  expect(result.meta.state).toBe("success");
  expect(result.meta.source).toBe("db");
  expect(result.data?.records).toHaveLength(1);
});

test("listPresets fetches shared presets from browser API boundary", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        presets: [
          {
            id: "shared-1",
            name: "Shared Thermal",
            scope: "shared",
            filters: {
              q: "thermal",
              category: "",
              region: "",
              status: "Live",
              sortBy: "updated",
              sortDir: "desc",
              pageSize: 25,
            },
            createdAt: "2026-03-14T10:00:00.000Z",
            updatedAt: "2026-03-14T10:00:00.000Z",
            lastUsedAt: null,
            useCount: 0,
          },
        ],
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listPresets();

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets?scope=shared",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.ok).toBe(true);
  expect(result.presets).toHaveLength(1);
  expect(result.presets[0]?.name).toBe("Shared Thermal");
});

test("listPresets does not send a client owner header for personal scope", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        presets: [],
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listPresets("personal");

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets?scope=personal",
    expect.objectContaining({ method: "GET" }),
  );
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    headers: {
      Accept: "application/json",
    },
  });
  expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");
  expect(result.ok).toBe(true);
});

test("upsertPreset returns storage_unavailable when shared preset API call fails", async () => {
  fetchMock.mockRejectedValueOnce(new Error("network unavailable"));

  const result = await apiClient.dataExplorer.upsertPreset({
    name: "Thermal Live",
    filters: {
      q: "thermal",
      status: "Live",
      sortBy: "updated",
      sortDir: "desc",
      pageSize: 25,
    },
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets?scope=shared",
    expect.objectContaining({ method: "POST" }),
  );
  expect(result.ok).toBe(false);
  expect(result.reason).toBe("storage_unavailable");
});

test("preset mutations keep personal scope in the route path without a client owner header", async () => {
  fetchMock
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, presets: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, presets: [] }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, presets: [] }), { status: 200 }));

  await apiClient.dataExplorer.upsertPreset({
    name: "Personal Thermal",
    scope: "personal",
    filters: { q: "thermal" },
  });
  await apiClient.dataExplorer.deletePreset("preset-1", "personal");
  await apiClient.dataExplorer.markPresetUsed("preset-1", "personal");

  expect(fetchMock).toHaveBeenNthCalledWith(
    1,
    "/api/data-explorer/presets?scope=personal",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        name: "Personal Thermal",
        scope: "personal",
        filters: { q: "thermal" },
      }),
    }),
  );
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");

  expect(fetchMock).toHaveBeenNthCalledWith(
    2,
    "/api/data-explorer/presets/preset-1?scope=personal",
    expect.objectContaining({
      method: "DELETE",
    }),
  );
  expect(fetchMock.mock.calls[1]?.[1]?.headers).toEqual({
    Accept: "application/json",
  });
  expect(fetchMock.mock.calls[1]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");

  expect(fetchMock).toHaveBeenNthCalledWith(
    3,
    "/api/data-explorer/presets/preset-1/mark-used?scope=personal",
    expect.objectContaining({
      method: "POST",
    }),
  );
  expect(fetchMock.mock.calls[2]?.[1]?.headers).toEqual({
    Accept: "application/json",
  });
  expect(fetchMock.mock.calls[2]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");
});

test("listPresetAuditEvents fetches scoped preset activity from browser API boundary", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        events: [
          {
            id: "audit-1",
            presetId: "shared-1",
            presetName: "Shared Thermal",
            scope: "shared",
            action: "created",
            actorId: null,
            actorType: "unknown",
            ownerId: null,
            outcome: "success",
            createdAt: "2026-03-20T10:00:00.000Z",
            metadata: {
              filters: {
                q: "thermal",
              },
            },
          },
        ],
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listPresetAuditEvents({
    scope: "shared",
    limit: 5,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets/audit?scope=shared&limit=5",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.ok).toBe(true);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]?.action).toBe("created");
});

test("listPresetAuditEvents keeps personal scope route query and no client owner header", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, events: [] }), { status: 200 }));

  const result = await apiClient.dataExplorer.listPresetAuditEvents({
    scope: "personal",
    presetId: "preset-1",
    actorId: "operator-1",
    action: "updated",
    limit: 10,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets/audit?scope=personal&presetId=preset-1&actorId=operator-1&action=updated&limit=10",
    expect.objectContaining({ method: "GET" }),
  );
  expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
    headers: {
      Accept: "application/json",
    },
  });
  expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");
  expect(result.ok).toBe(true);
});

test("getPresetSessionStatus reads trusted preset session availability", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        status: {
          sessionActive: true,
          actorLabel: "Captain Mira",
          personalScopeAvailable: true,
        },
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.getPresetSessionStatus();

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/presets/session-status",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.ok).toBe(true);
  expect(result.status?.actorLabel).toBe("Captain Mira");
  expect(result.status?.personalScopeAvailable).toBe(true);
});

test("getPresetSessionStatus returns storage_unavailable when preset status call fails", async () => {
  fetchMock.mockRejectedValueOnce(new Error("network unavailable"));

  const result = await apiClient.dataExplorer.getPresetSessionStatus();

  expect(result.ok).toBe(false);
  expect(result.status).toBeNull();
  expect(result.reason).toBe("storage_unavailable");
});

test("listBehaviorEvents fetches recent usage rows from browser API boundary", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        events: [
          {
            id: "behavior-1",
            eventType: "dataset_selected",
            scope: "shared",
            actorId: null,
            actorLabel: "Unknown actor",
            ownerId: null,
            presetId: null,
            presetName: null,
            datasetId: "DST-101",
            datasetName: "Atlantic Thermal",
            createdAt: "2026-03-20T13:00:00.000Z",
          },
        ],
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listBehaviorEvents({
    scope: "shared",
    limit: 5,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/activity?scope=shared&limit=5",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.ok).toBe(true);
  expect(result.events).toHaveLength(1);
  expect(result.events[0]?.eventType).toBe("dataset_selected");
});

test("listBehaviorDedupeDropSummary fetches bounded summary from browser API boundary", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: true,
        summary: [
          {
            datasetId: "DST-101",
            dropCount: 3,
            mostRecentDroppedAt: "2026-03-20T16:10:00.000Z",
          },
        ],
        windowMinutes: 60,
      }),
      { status: 200 },
    ),
  );

  const result = await apiClient.dataExplorer.listBehaviorDedupeDropSummary({
    scope: "shared",
    windowMinutes: 60,
    limit: 3,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/activity/dedupe-summary?scope=shared&windowMinutes=60&limit=3",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result.ok).toBe(true);
  expect(result.windowMinutes).toBe(60);
  expect(result.summary).toHaveLength(1);
  expect(result.summary[0]?.datasetId).toBe("DST-101");
});

test("listBehaviorDedupeDropSummary returns storage_unavailable when diagnostics call fails", async () => {
  fetchMock.mockRejectedValueOnce(new Error("network unavailable"));

  const result = await apiClient.dataExplorer.listBehaviorDedupeDropSummary({
    scope: "personal",
  });

  expect(result.ok).toBe(false);
  expect(result.summary).toEqual([]);
  expect(result.reason).toBe("storage_unavailable");
});

test("exportBehaviorDedupeSummary fetches downloadable dedupe snapshot from browser API boundary", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
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
      }),
      {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": "attachment; filename=\"data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.json\"",
        },
      },
    ),
  );

  const result = await apiClient.dataExplorer.exportBehaviorDedupeSummary({
    scope: "shared",
    windowMinutes: 60,
    limit: 3,
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/activity/dedupe-summary/export?scope=shared&windowMinutes=60&limit=3",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result).toEqual({
    ok: true,
    format: "json",
    filename: "data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.json",
    content: JSON.stringify({
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
    }, null, 2),
    contentType: "application/json; charset=utf-8",
    snapshot: {
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
    },
  });
});

test("exportBehaviorDedupeSummary returns CSV content when requested", async () => {
  const csvContent = [
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
    "# exportHistory=[]",
    "datasetId,dropCount,mostRecentDroppedAt",
    "DST-101,3,2026-03-20T16:10:00.000Z",
  ].join("\n");

  fetchMock.mockResolvedValueOnce(
    new Response(csvContent, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": "attachment; filename=\"data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.csv\"",
      },
    }),
  );

  const result = await apiClient.dataExplorer.exportBehaviorDedupeSummary({
    scope: "shared",
    format: "csv",
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/activity/dedupe-summary/export?scope=shared&format=csv",
    expect.objectContaining({ method: "GET" }),
  );
  expect(result).toEqual({
    ok: true,
    format: "csv",
    snapshot: null,
    filename: "data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.csv",
    content: csvContent,
    contentType: "text/csv; charset=utf-8",
  });
});

test("exportBehaviorDedupeSummary surfaces typed validation failures without throwing", async () => {
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        ok: false,
        format: "json",
        snapshot: null,
        filename: null,
        content: null,
        contentType: null,
        reason: "validation",
        error: "Window minutes must be a positive number.",
      }),
      { status: 400 },
    ),
  );

  const result = await apiClient.dataExplorer.exportBehaviorDedupeSummary({
    scope: "shared",
    windowMinutes: 0,
  });

  expect(result).toEqual({
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

test("writeBehaviorEvent posts scoped activity without client owner headers", async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

  const result = await apiClient.dataExplorer.writeBehaviorEvent({
    eventType: "preset_applied",
    scope: "personal",
    presetId: "preset-1",
    presetName: "Personal Thermal",
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/data-explorer/activity?scope=personal",
    expect.objectContaining({
      method: "POST",
      body: JSON.stringify({
        eventType: "preset_applied",
        scope: "personal",
        presetId: "preset-1",
        presetName: "Personal Thermal",
      }),
    }),
  );
  expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual({
    Accept: "application/json",
    "Content-Type": "application/json",
  });
  expect(fetchMock.mock.calls[0]?.[1]?.headers).not.toHaveProperty("x-marine-preset-owner");
  expect(result.ok).toBe(true);
});
