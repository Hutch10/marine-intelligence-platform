import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { DataExplorerWorkspace } from "@/components/data-explorer/data-explorer-workspace";
import { dataExplorerWorkspaceData } from "@/lib/api/mock-data";
import type {
  DataExplorerDatasetDetail,
  DataExplorerFetchMeta,
  DataExplorerDatasetRow,
  DataExplorerPageInfo,
  DataExplorerRelatedRecord,
  DataExplorerRelatedRecordsResult,
  DataExplorerWorkspaceData,
} from "@/lib/api/types";
import type { DataExplorerPresetMutationResult } from "@/lib/persistence/types";

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    dataExplorer: {
      getWorkspace: vi.fn(),
      getDatasetDetail: vi.fn(),
      getDatasetRecords: vi.fn(),
      getPresetSessionStatus: vi.fn(),
      listBehaviorEvents: vi.fn(),
      listBehaviorDedupeDropSummary: vi.fn(),
      exportBehaviorDedupeSummary: vi.fn(),
      writeBehaviorEvent: vi.fn(),
      listPresetAuditEvents: vi.fn(),
      listPresets: vi.fn(),
      upsertPreset: vi.fn(),
      deletePreset: vi.fn(),
      markPresetUsed: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

const BASE_DATASETS = dataExplorerWorkspaceData.datasets.slice(0, 3);

function createPageInfo(
  datasets: DataExplorerDatasetRow[],
  overrides: Partial<DataExplorerPageInfo> = {},
): DataExplorerPageInfo {
  return {
    page: 1,
    pageSize: 25,
    totalItems: datasets.length,
    totalPages: datasets.length > 0 ? 1 : 0,
    sortBy: "updated",
    sortDir: "desc",
    ...overrides,
  };
}

function createWorkspace(
  datasets: DataExplorerDatasetRow[] = BASE_DATASETS,
  overrides: Partial<DataExplorerWorkspaceData> = {},
): DataExplorerWorkspaceData {
  return {
    ...dataExplorerWorkspaceData,
    datasets,
    pageInfo: createPageInfo(datasets),
    ...overrides,
  };
}

function createDetail(dataset: DataExplorerDatasetRow): DataExplorerDatasetDetail {
  return {
    ...dataset,
    metadata: {
      Source: "Mocked Source",
      Coverage: dataset.region,
      Cadence: "5 minute ingest",
      Schema: "temperature_c, anomaly_index",
      Owner: "Ocean Systems Lab",
    },
  };
}

function createRecords(datasetId: string): DataExplorerRelatedRecord[] {
  return [
    {
      id: `${datasetId}-REC-1`,
      title: `Related record for ${datasetId}`,
      type: "Alert",
      status: "Open",
      updated: "4 min ago",
      summary: "Localized anomaly cluster persisted through the latest ingest window.",
    },
  ];
}

function createRecordsResult(
  records: DataExplorerRelatedRecord[],
  overrides: Partial<DataExplorerRelatedRecordsResult["pageInfo"]> = {},
): DataExplorerRelatedRecordsResult {
  return {
    records,
    pageInfo: {
      page: 1,
      pageSize: 5,
      totalItems: records.length,
      totalPages: records.length > 0 ? 1 : 0,
      sortBy: "updated",
      sortDir: "desc",
      ...overrides,
    },
  };
}

function createMeta(
  section: DataExplorerFetchMeta["section"],
  overrides: Partial<DataExplorerFetchMeta> = {},
): DataExplorerFetchMeta {
  return {
    section,
    state: "success",
    startedAt: "2026-03-14T12:00:00.000Z",
    finishedAt: "2026-03-14T12:00:00.012Z",
    durationMs: 12,
    delivery: "browser_api",
    source: "db",
    ...overrides,
  };
}

function createWorkspaceResponse(data: DataExplorerWorkspaceData) {
  return {
    data,
    meta: createMeta("workspace"),
  };
}

function createDetailResponse(data: DataExplorerDatasetDetail | null, datasetId: string) {
  return {
    data,
    meta: createMeta("detail", {
      datasetId,
      state: data ? "success" : "not_found",
    }),
  };
}

function createRecordsResponse(data: DataExplorerRelatedRecordsResult | null, datasetId: string) {
  return {
    data,
    meta: createMeta("records", {
      datasetId,
      state: data ? "success" : "not_found",
    }),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function sharedPresetsUnavailable(): DataExplorerPresetMutationResult {
  return {
    ok: false,
    presets: [],
    reason: "storage_unavailable",
    error: "Shared preset store unavailable.",
  };
}

function renderWorkspace(
  data = createWorkspace(),
  initialMeta: DataExplorerFetchMeta | null = null,
) {
  return render(<DataExplorerWorkspace data={data} initialMeta={initialMeta} />);
}

beforeEach(() => {
  window.localStorage.clear();
  mockApiClient.dataExplorer.getWorkspace.mockReset();
  mockApiClient.dataExplorer.getDatasetDetail.mockReset();
  mockApiClient.dataExplorer.getDatasetRecords.mockReset();
  mockApiClient.dataExplorer.getPresetSessionStatus.mockReset();
  mockApiClient.dataExplorer.listBehaviorEvents.mockReset();
  mockApiClient.dataExplorer.listBehaviorDedupeDropSummary.mockReset();
  mockApiClient.dataExplorer.exportBehaviorDedupeSummary.mockReset();
  mockApiClient.dataExplorer.writeBehaviorEvent.mockReset();
  mockApiClient.dataExplorer.listPresetAuditEvents.mockReset();
  mockApiClient.dataExplorer.listPresets.mockReset();
  mockApiClient.dataExplorer.upsertPreset.mockReset();
  mockApiClient.dataExplorer.deletePreset.mockReset();
  mockApiClient.dataExplorer.markPresetUsed.mockReset();

  mockApiClient.dataExplorer.listPresets.mockResolvedValue(sharedPresetsUnavailable());
  mockApiClient.dataExplorer.upsertPreset.mockResolvedValue(sharedPresetsUnavailable());
  mockApiClient.dataExplorer.deletePreset.mockResolvedValue(sharedPresetsUnavailable());
  mockApiClient.dataExplorer.markPresetUsed.mockResolvedValue(sharedPresetsUnavailable());
  mockApiClient.dataExplorer.getPresetSessionStatus.mockResolvedValue({
    ok: true,
    status: {
      sessionActive: true,
      actorLabel: "Captain Mira",
      personalScopeAvailable: true,
    },
  });
  mockApiClient.dataExplorer.listBehaviorEvents.mockResolvedValue({ ok: true, events: [] });
  mockApiClient.dataExplorer.listBehaviorDedupeDropSummary.mockResolvedValue({
    ok: true,
    summary: [],
    windowMinutes: 60,
  });
  mockApiClient.dataExplorer.exportBehaviorDedupeSummary.mockResolvedValue({
    ok: true,
    format: "json",
    snapshot: {
      schemaVersion: 1,
      exportedAt: "2026-03-20T16:20:30.000Z",
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
        exportHistory: [],
      },
    },
    filename: "data-explorer-dedupe-summary-shared-2026-03-20T16-20-30-000Z.json",
    content: JSON.stringify({
      schemaVersion: 1,
      exportedAt: "2026-03-20T16:20:30.000Z",
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
        exportHistory: [],
      },
    }, null, 2),
    contentType: "application/json; charset=utf-8",
  });
  mockApiClient.dataExplorer.writeBehaviorEvent.mockResolvedValue({ ok: true });
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValue({ ok: true, events: [] });

  mockApiClient.dataExplorer.getDatasetDetail.mockImplementation(async (datasetId: string) => {
    const dataset = BASE_DATASETS.find((item) => item.id === datasetId);
    return createDetailResponse(dataset ? createDetail(dataset) : null, datasetId);
  });

  mockApiClient.dataExplorer.getDatasetRecords.mockImplementation(async (datasetId: string) => {
    const dataset = BASE_DATASETS.find((item) => item.id === datasetId);
    return createRecordsResponse(dataset ? createRecordsResult(createRecords(datasetId)) : null, datasetId);
  });
});

test("applying filters triggers a dataset list refresh with the current query", async () => {
  const user = userEvent.setup();
  const filteredWorkspace = createWorkspace([BASE_DATASETS[2]!]);
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(createWorkspaceResponse(filteredWorkspace));

  renderWorkspace();

  await user.type(screen.getByLabelText("Dataset search"), "chemistry");
  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "chemistry",
        sortBy: "updated",
        sortDir: "desc",
        page: 1,
        pageSize: 25,
      }),
    );
  });
});

test("changing sort triggers a dataset list refresh", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(createWorkspace([...BASE_DATASETS].reverse())),
  );

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Dataset sort field"), "name");

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        sortBy: "name",
        sortDir: "desc",
        page: 1,
      }),
    );
  });
});

test("changing page triggers a dataset list refresh", async () => {
  const user = userEvent.setup();
  const pageOne = createWorkspace([BASE_DATASETS[0]!], {
    pageInfo: createPageInfo([BASE_DATASETS[0]!], {
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    }),
  });
  const pageTwo = createWorkspace([BASE_DATASETS[1]!], {
    pageInfo: createPageInfo([BASE_DATASETS[1]!], {
      page: 2,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    }),
  });
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(createWorkspaceResponse(pageTwo));

  renderWorkspace(pageOne);

  await user.click(screen.getByRole("button", { name: "Next" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        pageSize: 25,
      }),
    );
  });
});

test("selection is preserved when the selected dataset still exists after refresh", async () => {
  const user = userEvent.setup();
  const preservedDataset = BASE_DATASETS[1]!;
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(createWorkspace([BASE_DATASETS[0]!, preservedDataset])),
  );

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: new RegExp(preservedDataset.name, "i") }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: preservedDataset.name })).toBeInTheDocument();
  });

  const detailCallsBeforeRefresh = mockApiClient.dataExplorer.getDatasetDetail.mock.calls.length;

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: preservedDataset.name })).toBeInTheDocument();
  });

  expect(mockApiClient.dataExplorer.getDatasetDetail.mock.calls).toHaveLength(detailCallsBeforeRefresh);
});

test("selection resets to the first dataset when the previous selection is absent after refresh", async () => {
  const user = userEvent.setup();
  const selectedDataset = BASE_DATASETS[1]!;
  const nextDataset = BASE_DATASETS[0]!;
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(createWorkspaceResponse(createWorkspace([nextDataset])));

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: new RegExp(selectedDataset.name, "i") }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: selectedDataset.name })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: nextDataset.name })).toBeInTheDocument();
  });

  expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenLastCalledWith(nextDataset.id);
});

test("empty refresh results clear the selected detail and related-record panels safely", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(
      createWorkspace([], {
        pageInfo: createPageInfo([], {
          page: 1,
          pageSize: 25,
          totalItems: 0,
          totalPages: 0,
        }),
      }),
    ),
  );

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(screen.getByText("No datasets match the current filters")).toBeInTheDocument();
    expect(screen.getByText("No dataset selected")).toBeInTheDocument();
    expect(screen.getByText("No metadata available")).toBeInTheDocument();
  });
});

test("list loading state appears during refresh", async () => {
  const user = userEvent.setup();
  const pendingResponse = deferred<ReturnType<typeof createWorkspaceResponse>>();
  mockApiClient.dataExplorer.getWorkspace.mockReturnValue(pendingResponse.promise);

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  expect(screen.getByText("Refreshing dataset list")).toBeInTheDocument();

  pendingResponse.resolve(createWorkspaceResponse(createWorkspace([BASE_DATASETS[0]!])));

  await waitFor(() => {
    expect(screen.queryByText("Refreshing dataset list")).not.toBeInTheDocument();
  });
});

test("initial degraded workspace state is visible without becoming noisy", async () => {
  renderWorkspace(
    createWorkspace(),
    createMeta("workspace", {
      source: "mock",
      fallbackReason: "db_query_failed",
      state: "success",
    }),
  );

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenCalled();
  });

  expect(screen.getByText("Fallback data mode (DB query failed)")).toBeInTheDocument();
  expect(screen.getByTestId("workspace-degraded-state")).toHaveTextContent("Backend degraded mode");
  expect(screen.queryByText("Unable to refresh datasets right now.")).not.toBeInTheDocument();
});

test("empty and degraded states remain distinguishable", async () => {
  renderWorkspace(
    createWorkspace([], {
      pageInfo: createPageInfo([], {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
      }),
    }),
    createMeta("workspace", {
      source: "mock",
      fallbackReason: "db_open_failed",
      state: "success",
    }),
  );

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).not.toHaveBeenCalled();
  });

  expect(screen.getByText("Live dataset catalog unavailable")).toBeInTheDocument();
  expect(screen.getByTestId("workspace-degraded-state")).toHaveTextContent(
    "Showing fallback dataset output because the live repository is unavailable (DB open failed).",
  );
});

test("list errors preserve the last known good list and selection", async () => {
  const user = userEvent.setup();
  const selectedDataset = BASE_DATASETS[1]!;
  mockApiClient.dataExplorer.getWorkspace.mockRejectedValue(new Error("refresh failed"));

  renderWorkspace();

  await user.click(screen.getByRole("button", { name: new RegExp(selectedDataset.name, "i") }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: selectedDataset.name })).toBeInTheDocument();
  });

  await user.click(screen.getByRole("button", { name: "Apply Filters" }));

  await waitFor(() => {
    expect(screen.getByText("Unable to refresh datasets right now.")).toBeInTheDocument();
  });

  expect(screen.getByRole("heading", { name: selectedDataset.name })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: new RegExp(selectedDataset.name, "i") })).toBeInTheDocument();
});

test("changing related-record sort triggers a related-record refresh", async () => {
  const user = userEvent.setup();
  const dataset = BASE_DATASETS[0]!;

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenCalledWith(
      dataset.id,
      expect.objectContaining({
        sortBy: "updated",
        sortDir: "desc",
        page: 1,
        pageSize: 5,
      }),
    );
  });

  await user.selectOptions(screen.getByLabelText("Related records sort field"), "title");

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenLastCalledWith(
      dataset.id,
      expect.objectContaining({
        sortBy: "title",
        sortDir: "desc",
        page: 1,
        pageSize: 5,
      }),
    );
  });
});

test("changing related-record page triggers a related-record refresh", async () => {
  const user = userEvent.setup();
  const dataset = BASE_DATASETS[0]!;
  const firstPageRecords = createRecordsResult(
    [
      {
        id: `${dataset.id}-REC-1`,
        title: `First page record for ${dataset.id}`,
        type: "Alert",
        status: "Open",
        updated: "4 min ago",
      },
      {
        id: `${dataset.id}-REC-2`,
        title: `Second page record for ${dataset.id}`,
        type: "Alert",
        status: "Monitoring",
        updated: "8 min ago",
      },
      {
        id: `${dataset.id}-REC-3`,
        title: `Third page record for ${dataset.id}`,
        type: "Alert",
        status: "Review",
        updated: "12 min ago",
      },
      {
        id: `${dataset.id}-REC-4`,
        title: `Fourth page record for ${dataset.id}`,
        type: "Alert",
        status: "Closed",
        updated: "16 min ago",
      },
      {
        id: `${dataset.id}-REC-5`,
        title: `Fifth page record for ${dataset.id}`,
        type: "Alert",
        status: "Open",
        updated: "20 min ago",
      },
    ],
    {
      page: 1,
      pageSize: 5,
      totalItems: 6,
      totalPages: 2,
    },
  );
  const secondPageRecords = createRecordsResult(
    [
      {
        id: `${dataset.id}-REC-6`,
        title: `Second page record for ${dataset.id}`,
        type: "Alert",
        status: "Monitoring",
        updated: "12 min ago",
      },
    ],
    {
      page: 2,
      pageSize: 5,
      totalItems: 6,
      totalPages: 2,
    },
  );

  mockApiClient.dataExplorer.getDatasetRecords
    .mockResolvedValueOnce(createRecordsResponse(firstPageRecords, dataset.id))
    .mockResolvedValueOnce(createRecordsResponse(secondPageRecords, dataset.id));

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Next records" })).toBeEnabled();
  });

  await user.click(screen.getByRole("button", { name: "Next records" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenLastCalledWith(
      dataset.id,
      expect.objectContaining({
        page: 2,
        pageSize: 5,
      }),
    );
  });
});

test("empty related-record results render safely", async () => {
  const user = userEvent.setup();
  const dataset = BASE_DATASETS[0]!;
  mockApiClient.dataExplorer.getDatasetRecords.mockResolvedValueOnce(
    createRecordsResponse(
      createRecordsResult([], {
        totalItems: 0,
        totalPages: 0,
      }),
      dataset.id,
    ),
  );

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByText("No related records yet")).toBeInTheDocument();
  });

  await user.selectOptions(screen.getByLabelText("Related records sort field"), "status");

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenLastCalledWith(
      dataset.id,
      expect.objectContaining({
        sortBy: "status",
      }),
    );
  });
});

test("degraded related-record responses render explicit degraded messaging", async () => {
  const dataset = BASE_DATASETS[0]!;

  mockApiClient.dataExplorer.getDatasetRecords.mockResolvedValueOnce({
    data: createRecordsResult([], {
      totalItems: 0,
      totalPages: 0,
    }),
    meta: createMeta("records", {
      datasetId: dataset.id,
      state: "success",
      source: "mock",
      fallbackReason: "db_path_missing",
    }),
  });

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByText("Related records unavailable in degraded mode")).toBeInTheDocument();
  });

  expect(screen.getByText("The related-record repository is currently degraded (DB path missing).")).toBeInTheDocument();
});

test("related-record errors remain local and non-fatal", async () => {
  const dataset = BASE_DATASETS[0]!;
  mockApiClient.dataExplorer.getDatasetRecords.mockResolvedValueOnce({
    data: null,
    meta: createMeta("records", {
      datasetId: dataset.id,
      state: "error",
      source: "mock",
      fallbackReason: "db_query_failed",
      errorMessage: "records failed",
    }),
  });

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByText("Related records unavailable")).toBeInTheDocument();
  });

  expect(screen.getByRole("heading", { name: dataset.name })).toBeInTheDocument();
  expect(screen.getByText("Preview Metrics")).toBeInTheDocument();
});

test("dev-only debug info renders source and fallback metadata", async () => {
  const dataset = BASE_DATASETS[0]!;
  mockApiClient.dataExplorer.getDatasetRecords.mockResolvedValueOnce({
    data: createRecordsResult(createRecords(dataset.id)),
    meta: createMeta("records", {
      datasetId: dataset.id,
      source: "mock",
      fallbackReason: "db_query_failed",
      durationMs: 21,
    }),
  });

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByTestId("debug-records")).toHaveTextContent("records");
    expect(screen.getByTestId("debug-records")).toHaveTextContent("browser_api");
    expect(screen.getByTestId("debug-records")).toHaveTextContent("mock");
    expect(screen.getByTestId("debug-records")).toHaveTextContent("db_query_failed");
  });
});

test("saved presets are sorted by recent usage and display usage metadata", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "preset-beta",
          name: "Beta",
          filters: {
            q: "beta",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
          lastUsedAt: "2026-03-14T11:00:00.000Z",
          useCount: 3,
        },
        {
          id: "preset-zeta",
          name: "Zeta",
          filters: {
            q: "zeta",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
          lastUsedAt: "2026-03-14T12:00:00.000Z",
          useCount: 5,
        },
        {
          id: "preset-alpha",
          name: "Alpha",
          filters: {
            q: "alpha",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
          lastUsedAt: "2026-03-14T11:00:00.000Z",
          useCount: 1,
        },
        {
          id: "preset-none",
          name: "No History",
          filters: {
            q: "none",
            category: "",
            region: "",
            status: "",
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
  );

  renderWorkspace();

  const presetSelect = screen.getByLabelText("Saved presets");
  const optionLabels = within(presetSelect).getAllByRole("option").map((option) => option.textContent);

  expect(optionLabels).toEqual(["Saved presets", "Zeta", "Alpha", "Beta", "No History"]);

  const zetaOption = within(presetSelect).getByRole("option", { name: "Zeta" }) as HTMLOptionElement;
  await user.selectOptions(presetSelect, zetaOption.value);

  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Uses: 5");
  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Last used: 2026-03-14 12:00");
});

test("saving a preset stores the current control state", async () => {
  const user = userEvent.setup();

  renderWorkspace();

  await user.type(screen.getByLabelText("Dataset search"), "thermal");
  await user.selectOptions(screen.getByLabelText("Dataset status filter"), "Live");
  await user.selectOptions(screen.getByLabelText("Dataset sort field"), "name");
  await user.selectOptions(screen.getByLabelText("Dataset sort direction"), "asc");
  await user.type(screen.getByLabelText("Preset name"), "Thermal Live");
  await user.click(screen.getByRole("button", { name: "Save preset" }));

  await waitFor(() => {
    const raw = window.localStorage.getItem("marine.dataExplorer.presets.v1");
    expect(raw).not.toBeNull();
  });

  const raw = window.localStorage.getItem("marine.dataExplorer.presets.v1");
  const parsed = JSON.parse(raw ?? "null") as {
    version: number;
    presets: Array<{
      id: string;
      name: string;
      filters: {
        q: string;
        status: string;
        sortBy: string;
        sortDir: string;
      };
    }>;
  };
  const savedPreset = parsed.presets.find((preset) => preset.name === "Thermal Live");

  expect(savedPreset).toBeDefined();
  expect(savedPreset?.id).toEqual(expect.any(String));
  expect(savedPreset?.filters.q).toBe("thermal");
  expect(savedPreset?.filters.status).toBe("Live");
  expect(savedPreset?.filters.sortBy).toBe("name");
  expect(savedPreset?.filters.sortDir).toBe("asc");

  const presetSelect = screen.getByLabelText("Saved presets") as HTMLSelectElement;
  const presetOption = screen.getByRole("option", { name: "Thermal Live" }) as HTMLOptionElement;

  expect(presetOption.value).toBe(savedPreset?.id);
  expect(presetSelect.value).toBe(savedPreset?.id);
});

test("updating a selected preset replaces its filter snapshot without creating a duplicate", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "preset-update",
          name: "Update Target",
          filters: {
            q: "before",
            category: "",
            region: "",
            status: "",
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
  );

  renderWorkspace();

  const presetSelect = screen.getByLabelText("Saved presets");
  const presetOption = await within(presetSelect).findByRole("option", { name: "Update Target" });
  const presetId = (presetOption as HTMLOptionElement).value;

  await user.selectOptions(presetSelect, presetId);
  expect(screen.getByTestId("saved-preset-sync-status")).toHaveTextContent(
    "Current filters differ from selected preset.",
  );
  expect(screen.getByRole("button", { name: "Update preset" })).toBeEnabled();

  await user.clear(screen.getByLabelText("Dataset search"));
  await user.type(screen.getByLabelText("Dataset search"), "after");
  expect(screen.getByTestId("saved-preset-sync-status")).toHaveTextContent(
    "Current filters differ from selected preset.",
  );
  expect(screen.getByRole("button", { name: "Update preset" })).toBeEnabled();

  await user.click(screen.getByRole("button", { name: "Update preset" }));

  await waitFor(() => {
    const current = window.localStorage.getItem("marine.dataExplorer.presets.v1");
    expect(current).not.toBeNull();
  });

  const raw = window.localStorage.getItem("marine.dataExplorer.presets.v1");
  const parsed = JSON.parse(raw ?? "null") as {
    presets: Array<{
      id: string;
      name: string;
      filters: {
        q: string;
      };
    }>;
  };

  expect(parsed.presets).toHaveLength(1);
  expect(parsed.presets[0]).toMatchObject({
    id: "preset-update",
    name: "Update Target",
    filters: {
      q: "after",
    },
  });
  expect(screen.getByLabelText("Saved presets")).toHaveValue("preset-update");
  expect(screen.getByTestId("saved-preset-sync-status")).toHaveTextContent(
    "Preset is in sync with current filters.",
  );
  expect(screen.getByRole("button", { name: "Update preset" })).toBeDisabled();
});

test("applying a preset updates controls, triggers refresh, and resets page to 1", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Chemistry Live",
          filters: {
            q: "chemistry",
            category: "",
            region: "",
            status: "Live",
            sortBy: "name",
            sortDir: "asc",
            pageSize: 10,
          },
        },
      ],
    }),
  );
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(
      createWorkspace([BASE_DATASETS[2]!], {
        pageInfo: createPageInfo([BASE_DATASETS[2]!], {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
          sortBy: "name",
          sortDir: "asc",
        }),
      }),
    ),
  );

  renderWorkspace(
    createWorkspace(BASE_DATASETS, {
      pageInfo: createPageInfo(BASE_DATASETS, {
        page: 2,
        pageSize: 1,
        totalItems: 3,
        totalPages: 3,
      }),
    }),
  );

  const migratedPresetOption = await screen.findByRole("option", { name: "Chemistry Live" });
  const migratedPresetId = (migratedPresetOption as HTMLOptionElement).value;

  expect(migratedPresetId).not.toBe("");
  expect(migratedPresetId).not.toBe("Chemistry Live");

  await user.selectOptions(screen.getByLabelText("Saved presets"), migratedPresetId);
  expect(screen.getByLabelText("Saved presets")).toHaveValue(migratedPresetId);
  await user.click(screen.getByRole("button", { name: "Apply preset" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "chemistry",
        status: "Live",
        sortBy: "name",
        sortDir: "asc",
        page: 1,
        pageSize: 10,
      }),
    );
  });

  expect(screen.getByLabelText("Dataset search")).toHaveValue("chemistry");
  expect(screen.getByLabelText("Dataset status filter")).toHaveValue("Live");
  expect(screen.getByLabelText("Dataset sort field")).toHaveValue("name");
});

test("applying a preset updates rendered usage metadata", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "preset-usage-update",
          name: "Usage Update",
          filters: {
            q: "usage",
            category: "",
            region: "",
            status: "Live",
            sortBy: "name",
            sortDir: "asc",
            pageSize: 10,
          },
          createdAt: "2026-03-14T12:00:00.000Z",
          updatedAt: "2026-03-14T12:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(
      createWorkspace([BASE_DATASETS[2]!], {
        pageInfo: createPageInfo([BASE_DATASETS[2]!], {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
          sortBy: "name",
          sortDir: "asc",
        }),
      }),
    ),
  );

  renderWorkspace();

  const presetSelect = screen.getByLabelText("Saved presets");
  const presetOption = await within(presetSelect).findByRole("option", { name: "Usage Update" });
  const presetId = (presetOption as HTMLOptionElement).value;

  await user.selectOptions(presetSelect, presetId);
  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Uses: 0");
  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Last used: Never");

  await user.click(screen.getByRole("button", { name: "Apply preset" }));

  await waitFor(() => {
    expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Uses: 1");
  });
  expect(screen.getByTestId("saved-preset-usage-meta")).not.toHaveTextContent("Last used: Never");
});

test("presets without usage history render usage metadata safely", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Legacy No Usage",
          filters: {
            q: "legacy",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
        },
      ],
    }),
  );

  renderWorkspace();

  const presetSelect = screen.getByLabelText("Saved presets");
  const legacyOption = await within(presetSelect).findByRole("option", { name: "Legacy No Usage" });
  await user.selectOptions(presetSelect, (legacyOption as HTMLOptionElement).value);

  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Uses: 0");
  expect(screen.getByTestId("saved-preset-usage-meta")).toHaveTextContent("Last used: Never");
});

test("applying a preset still works when usage tracking fails", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "preset-usage-failure",
          name: "Chemistry Live",
          filters: {
            q: "chemistry",
            category: "",
            region: "",
            status: "Live",
            sortBy: "name",
            sortDir: "asc",
            pageSize: 10,
          },
          createdAt: "2026-03-14T12:00:00.000Z",
          updatedAt: "2026-03-14T12:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue(
    createWorkspaceResponse(
      createWorkspace([BASE_DATASETS[2]!], {
        pageInfo: createPageInfo([BASE_DATASETS[2]!], {
          page: 1,
          pageSize: 10,
          totalItems: 1,
          totalPages: 1,
          sortBy: "name",
          sortDir: "asc",
        }),
      }),
    ),
  );

  renderWorkspace();

  const presetOption = await screen.findByRole("option", { name: "Chemistry Live" });
  const presetId = (presetOption as HTMLOptionElement).value;
  await user.selectOptions(screen.getByLabelText("Saved presets"), presetId);

  const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("storage write failed");
  });

  await user.click(screen.getByRole("button", { name: "Apply preset" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        q: "chemistry",
        status: "Live",
        sortBy: "name",
        sortDir: "asc",
        page: 1,
        pageSize: 10,
      }),
    );
  });

  expect(screen.getByLabelText("Dataset search")).toHaveValue("chemistry");
  expect(screen.getByLabelText("Dataset status filter")).toHaveValue("Live");
  expect(screen.queryByText("Unable to update presets in this browser.")).not.toBeInTheDocument();

  setItemSpy.mockRestore();
});

test("deleting a preset removes it from storage and the preset list", async () => {
  const user = userEvent.setup();
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 1,
      presets: [
        {
          name: "Delete Me",
          filters: {
            q: "",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
        },
      ],
    }),
  );

  renderWorkspace();

  const presetOption = await screen.findByRole("option", { name: "Delete Me" });
  const presetId = (presetOption as HTMLOptionElement).value;

  expect(presetId).not.toBe("");
  expect(presetId).not.toBe("Delete Me");

  await user.selectOptions(screen.getByLabelText("Saved presets"), presetId);
  expect(screen.getByLabelText("Saved presets")).toHaveValue(presetId);
  await user.click(screen.getByRole("button", { name: "Delete" }));

  await waitFor(() => {
    expect(screen.queryByRole("option", { name: "Delete Me" })).not.toBeInTheDocument();
  });

  const updatedRaw = window.localStorage.getItem("marine.dataExplorer.presets.v1");
  const updated = JSON.parse(updatedRaw ?? "null") as {
    presets: Array<{ id: string; name: string }>;
  };

  expect(updated.presets).toEqual([]);
});

test("corrupt preset storage fails safely", async () => {
  window.localStorage.setItem("marine.dataExplorer.presets.v1", "{bad-json");

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenCalledTimes(1);
    expect(mockApiClient.dataExplorer.getDatasetRecords).toHaveBeenCalledTimes(1);
  });

  await screen.findByText(/^Related record for /i);

  expect(screen.getByLabelText("Saved presets")).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Delete Me" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save preset" })).toBeEnabled();
});

test("shared preset load overrides local presets when shared store is available", async () => {
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 2,
      presets: [
        {
          id: "local-only",
          name: "Local Only",
          filters: {
            q: "local",
            category: "",
            region: "",
            status: "",
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
  );
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
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
        lastUsedAt: "2026-03-14T12:00:00.000Z",
        useCount: 2,
      },
    ],
  });

  renderWorkspace();

  await screen.findByRole("option", { name: "Shared Thermal" });
  expect(screen.queryByRole("option", { name: "Local Only" })).not.toBeInTheDocument();
});

test("preset scope selector switches the visible preset catalog and labels the active mode", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({
      ok: true,
      presets: [
        {
          id: "personal-remote",
          name: "Personal Remote",
          scope: "personal",
          filters: {
            q: "personal-remote",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T11:30:00.000Z",
          updatedAt: "2026-03-14T11:30:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 3,
      presets: [
        {
          id: "shared-local",
          name: "Shared Local",
          scope: "shared",
          filters: {
            q: "shared",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T10:00:00.000Z",
          updatedAt: "2026-03-14T10:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
        {
          id: "personal-local",
          name: "Personal Local",
          scope: "personal",
          filters: {
            q: "personal",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T11:00:00.000Z",
          updatedAt: "2026-03-14T11:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );

  renderWorkspace();

  expect(screen.getByTestId("selected-preset-scope")).toHaveTextContent("Scope: Shared");
  expect(screen.getByTestId("preset-scope-description")).toHaveTextContent("repository-backed preset catalog");
  expect(await screen.findByRole("option", { name: "Shared Local" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Personal Local" })).not.toBeInTheDocument();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");

  await waitFor(() => {
    expect(screen.getByTestId("selected-preset-scope")).toHaveTextContent("Scope: Personal");
  });
  expect(screen.getByTestId("preset-scope-description")).toHaveTextContent("active station admin session");
  expect(await screen.findByRole("option", { name: "Personal Remote" })).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Shared Local" })).not.toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "Personal Local" })).not.toBeInTheDocument();
});

test("preset session panel shows trusted actor and personal availability", async () => {
  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getPresetSessionStatus).toHaveBeenCalledTimes(1);
  });

  expect(screen.getByTestId("preset-session-actor")).toHaveTextContent("Actor: Captain Mira");
  expect(screen.getByTestId("preset-session-availability")).toHaveTextContent("Personal preset scope is available.");
  expect(screen.getByRole("option", { name: "Personal preset scope" })).not.toBeDisabled();
});

test("personal preset scope is disabled when trusted session status is unavailable", async () => {
  mockApiClient.dataExplorer.getPresetSessionStatus.mockResolvedValueOnce({
    ok: true,
    status: {
      sessionActive: false,
      actorLabel: null,
      personalScopeAvailable: false,
    },
  });

  renderWorkspace();

  await waitFor(() => {
    expect(screen.getByTestId("preset-session-availability")).toHaveTextContent(
      "Personal preset scope unavailable until a station admin session is active.",
    );
  });

  expect(screen.getByTestId("preset-session-actor")).toHaveTextContent("Actor: No active station admin session");
  expect(screen.getByRole("option", { name: "Personal preset scope" })).toBeDisabled();
  expect(screen.getByTestId("selected-preset-scope")).toHaveTextContent("Scope: Shared");
});

test("saving a preset in personal scope passes scope through the shared API path", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({ ok: true, presets: [] });
  mockApiClient.dataExplorer.upsertPreset.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "personal-1",
        name: "Personal Thermal",
        scope: "personal",
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
  });

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");
  await user.type(screen.getByLabelText("Dataset search"), "thermal");
  await user.selectOptions(screen.getByLabelText("Dataset status filter"), "Live");
  await user.type(screen.getByLabelText("Preset name"), "Personal Thermal");
  await user.click(screen.getByRole("button", { name: "Save preset" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.upsertPreset).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Personal Thermal",
        scope: "personal",
      }),
    );
  });
  expect(screen.getByLabelText("Saved presets")).toHaveValue("personal-1");
});

test("personal scope does not fall back to browser-local presets when authenticated loading fails", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({
      ok: false,
      presets: [],
      reason: "validation",
      error: "Personal preset scope requires an authenticated station admin session.",
    });
  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 3,
      presets: [
        {
          id: "personal-local",
          name: "Personal Local",
          scope: "personal",
          filters: {
            q: "personal",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-14T11:00:00.000Z",
          updatedAt: "2026-03-14T11:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");

  await waitFor(() => {
    expect(screen.getByText("Personal preset scope requires an authenticated station admin session.")).toBeInTheDocument();
  });
  expect(screen.queryByRole("option", { name: "Personal Local" })).not.toBeInTheDocument();
});

test("personal scope save failures do not write browser-local fallback presets", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({ ok: true, presets: [] });
  mockApiClient.dataExplorer.upsertPreset.mockResolvedValueOnce({
    ok: false,
    presets: [],
    reason: "storage_unavailable",
    error: "Personal preset store unavailable.",
  });

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");
  await user.type(screen.getByLabelText("Dataset search"), "thermal");
  await user.type(screen.getByLabelText("Preset name"), "Personal Local Blocked");
  await user.click(screen.getByRole("button", { name: "Save preset" }));

  await waitFor(() => {
    expect(screen.getByText("Personal preset store unavailable.")).toBeInTheDocument();
  });

  const persisted = window.localStorage.getItem("marine.dataExplorer.presets.v1");
  expect(persisted).toBeNull();
});

test("recent preset activity renders compact event rows when audit history exists", async () => {
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValueOnce({
    ok: true,
    events: [
      {
        id: "audit-1",
        presetId: "shared-1",
        presetName: "Shared Thermal",
        scope: "shared",
        action: "created",
        actorId: "operator-1",
        actorType: "station_admin",
        ownerId: null,
        outcome: "success",
        createdAt: "2026-03-20T12:00:00.000Z",
      },
    ],
  });

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.listPresetAuditEvents).toHaveBeenCalledWith({
      scope: "shared",
      limit: 5,
    });
  });

  const activityList = await screen.findByTestId("preset-activity-list");
  expect(activityList).toHaveTextContent("Created Shared Thermal (Shared)");
  expect(activityList).toHaveTextContent("operator-1");
});

test("recent preset activity shows an empty state when no scope activity exists", async () => {
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
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
          status: "",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-20T10:00:00.000Z",
        updatedAt: "2026-03-20T10:00:00.000Z",
        lastUsedAt: null,
        useCount: 0,
      },
    ],
  });
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValueOnce({
    ok: true,
    events: [],
  });

  renderWorkspace();

  expect(await screen.findByRole("option", { name: "Shared Thermal" })).toBeInTheDocument();
  expect(await screen.findByTestId("preset-activity-empty")).toHaveTextContent(
    "No recent preset activity for this scope.",
  );
});

test("recent preset activity fetch failures are non-fatal and keep preset controls usable", async () => {
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "shared-2",
        name: "Shared Stable",
        scope: "shared",
        filters: {
          q: "stable",
          category: "",
          region: "",
          status: "",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-20T10:10:00.000Z",
        updatedAt: "2026-03-20T10:10:00.000Z",
        lastUsedAt: null,
        useCount: 0,
      },
    ],
  });
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValueOnce({
    ok: false,
    events: [],
    reason: "read_failed",
    error: "Preset audit history unavailable.",
  });

  renderWorkspace();

  expect(await screen.findByRole("option", { name: "Shared Stable" })).toBeInTheDocument();
  expect(await screen.findByTestId("preset-activity-error")).toHaveTextContent(
    "Preset audit history unavailable.",
  );
  expect(screen.getByRole("button", { name: "Save preset" })).toBeEnabled();
});

test("preset history detail surface opens, renders rows, and closes from preset activity panel", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "shared-history",
        name: "Shared History",
        scope: "shared",
        filters: {
          q: "history",
          category: "",
          region: "",
          status: "",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-20T10:10:00.000Z",
        updatedAt: "2026-03-20T10:10:00.000Z",
        lastUsedAt: null,
        useCount: 0,
      },
    ],
  });
  mockApiClient.dataExplorer.listPresetAuditEvents
    .mockResolvedValueOnce({
      ok: true,
      events: [
        {
          id: "recent-audit-1",
          presetId: "shared-history",
          presetName: "Shared History",
          scope: "shared",
          action: "created",
          actorId: "operator-1",
          actorType: "station_admin",
          ownerId: null,
          outcome: "success",
          createdAt: "2026-03-20T12:00:00.000Z",
        },
      ],
    })
    .mockResolvedValueOnce({
      ok: true,
      events: [
        {
          id: "detail-audit-1",
          presetId: "shared-history",
          presetName: "Shared History",
          scope: "shared",
          action: "updated",
          actorId: "operator-2",
          actorType: "station_admin",
          ownerId: null,
          outcome: "success",
          createdAt: "2026-03-20T12:10:00.000Z",
        },
        {
          id: "detail-audit-2",
          presetId: "shared-history",
          presetName: "Shared History",
          scope: "shared",
          action: "marked_used",
          actorId: "operator-3",
          actorType: "station_admin",
          ownerId: null,
          outcome: "success",
          createdAt: "2026-03-20T12:11:00.000Z",
        },
      ],
    });

  renderWorkspace();

  expect(await screen.findByRole("option", { name: "Shared History" })).toBeInTheDocument();
  expect(await screen.findByTestId("preset-activity-list")).toHaveTextContent("Created Shared History");

  await user.click(screen.getByRole("button", { name: "View full history" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.listPresetAuditEvents).toHaveBeenCalledWith({
      scope: "shared",
      action: undefined,
      presetId: undefined,
      limit: 25,
    });
  });

  const historyRows = await screen.findByTestId("preset-history-list");
  expect(historyRows).toHaveTextContent("Updated");
  expect(historyRows).toHaveTextContent("Shared History");
  expect(historyRows).toHaveTextContent("Shared");
  expect(historyRows).toHaveTextContent("operator-2");
  expect(historyRows).toHaveTextContent("2026-03-20 12:10:00Z");
  expect(screen.getByTestId("preset-activity-list")).toHaveTextContent("Created Shared History");

  await user.click(screen.getByRole("button", { name: "Close history" }));
  await waitFor(() => {
    expect(screen.queryByTestId("preset-history-detail")).not.toBeInTheDocument();
  });
});

test("preset history detail filters request action and selected preset context", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "preset-target",
        name: "Target Preset",
        scope: "shared",
        filters: {
          q: "target",
          category: "",
          region: "",
          status: "",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-20T10:10:00.000Z",
        updatedAt: "2026-03-20T10:10:00.000Z",
        lastUsedAt: null,
        useCount: 0,
      },
    ],
  });
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValue({
    ok: true,
    events: [],
  });

  renderWorkspace();

  expect(await screen.findByRole("option", { name: "Target Preset" })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Saved presets"), "preset-target");
  await user.click(screen.getByRole("button", { name: "View full history" }));
  await user.selectOptions(screen.getByLabelText("Preset history action filter"), "updated");
  await user.selectOptions(screen.getByLabelText("Preset history preset filter"), "selected");

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.listPresetAuditEvents).toHaveBeenCalledWith({
      scope: "shared",
      action: "updated",
      presetId: "preset-target",
      limit: 25,
    });
  });
});

test("preset history detail uses personal scope when personal mode is active", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets
    .mockResolvedValueOnce(sharedPresetsUnavailable())
    .mockResolvedValueOnce({
      ok: true,
      presets: [
        {
          id: "personal-remote",
          name: "Personal Remote",
          scope: "personal",
          filters: {
            q: "personal",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-20T11:00:00.000Z",
          updatedAt: "2026-03-20T11:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    });
  mockApiClient.dataExplorer.listPresetAuditEvents.mockResolvedValue({
    ok: true,
    events: [],
  });

  renderWorkspace();

  await user.selectOptions(screen.getByLabelText("Preset scope"), "personal");
  expect(await screen.findByRole("option", { name: "Personal Remote" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View full history" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.listPresetAuditEvents).toHaveBeenCalledWith({
      scope: "personal",
      action: undefined,
      presetId: undefined,
      limit: 25,
    });
  });
});

test("preset history detail fetch failures are non-fatal", async () => {
  const user = userEvent.setup();
  mockApiClient.dataExplorer.listPresets.mockResolvedValueOnce({
    ok: true,
    presets: [
      {
        id: "shared-history-error",
        name: "Shared History Error",
        scope: "shared",
        filters: {
          q: "history",
          category: "",
          region: "",
          status: "",
          sortBy: "updated",
          sortDir: "desc",
          pageSize: 25,
        },
        createdAt: "2026-03-20T10:10:00.000Z",
        updatedAt: "2026-03-20T10:10:00.000Z",
        lastUsedAt: null,
        useCount: 0,
      },
    ],
  });
  mockApiClient.dataExplorer.listPresetAuditEvents
    .mockResolvedValueOnce({
      ok: true,
      events: [],
    })
    .mockResolvedValueOnce({
      ok: false,
      events: [],
      reason: "read_failed",
      error: "Preset audit history unavailable.",
    });

  renderWorkspace();

  expect(await screen.findByRole("option", { name: "Shared History Error" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "View full history" }));

  expect(await screen.findByTestId("preset-history-error")).toHaveTextContent(
    "Preset audit history unavailable.",
  );
  expect(screen.getByRole("button", { name: "Save preset" })).toBeEnabled();
});

test("recent operator activity renders compact behavior rows", async () => {
  mockApiClient.dataExplorer.listBehaviorEvents.mockResolvedValueOnce({
    ok: true,
    events: [
      {
        id: "behavior-1",
        eventType: "dataset_selected",
        scope: "shared",
        actorId: "operator-1",
        actorLabel: "operator-1",
        ownerId: null,
        presetId: null,
        presetName: null,
        datasetId: "DST-101",
        datasetName: "Atlantic Thermal",
        createdAt: "2026-03-20T14:00:00.000Z",
      },
    ],
  });

  renderWorkspace();

  const activity = await screen.findByTestId("behavior-activity-list");
  expect(activity).toHaveTextContent("Dataset selected Atlantic Thermal");
  expect(activity).toHaveTextContent("Shared");
  expect(activity).toHaveTextContent("operator-1");
});

test("dedupe diagnostics render a compact summary when dropped detail events exist", async () => {
  mockApiClient.dataExplorer.listBehaviorDedupeDropSummary.mockResolvedValue({
    ok: true,
    summary: [
      {
        datasetId: "DST-101",
        dropCount: 3,
        mostRecentDroppedAt: "2026-03-20T16:10:00.000Z",
      },
    ],
    windowMinutes: 60,
  });

  renderWorkspace();

  expect(await screen.findByTestId("behavior-dedupe-diagnostics")).toHaveTextContent("Dedupe diagnostics (60m window)");
  expect(await screen.findByText(/DST-101/i)).toBeInTheDocument();
  expect(screen.getByText(/3 drops/i)).toBeInTheDocument();
});

test("dedupe diagnostics failures are non-fatal and keep operator activity usable", async () => {
  mockApiClient.dataExplorer.listBehaviorEvents.mockResolvedValue({
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
        createdAt: "2026-03-20T14:00:00.000Z",
      },
    ],
  });
  mockApiClient.dataExplorer.listBehaviorDedupeDropSummary.mockResolvedValueOnce({
    ok: false,
    summary: [],
    windowMinutes: 60,
    reason: "read_failed",
    error: "Data Explorer dedupe diagnostics unavailable.",
  });

  renderWorkspace();

  expect(await screen.findByTestId("behavior-dedupe-diagnostics-error")).toHaveTextContent(
    "Data Explorer dedupe diagnostics unavailable.",
  );
  await waitFor(() => {
    expect(screen.getByTestId("behavior-activity-list")).toHaveTextContent("Dataset selected Atlantic Thermal");
  });
});

test("dedupe diagnostics export failures are non-fatal and keep operator activity usable", async () => {
  const user = userEvent.setup();

  mockApiClient.dataExplorer.listBehaviorEvents.mockResolvedValue({
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
        createdAt: "2026-03-20T14:00:00.000Z",
      },
    ],
  });
  mockApiClient.dataExplorer.listBehaviorDedupeDropSummary.mockResolvedValue({
    ok: true,
    summary: [
      {
        datasetId: "DST-101",
        dropCount: 3,
        mostRecentDroppedAt: "2026-03-20T16:10:00.000Z",
      },
    ],
    windowMinutes: 60,
  });
  mockApiClient.dataExplorer.exportBehaviorDedupeSummary.mockResolvedValueOnce({
    ok: false,
    format: "json",
    snapshot: null,
    filename: null,
    content: null,
    contentType: null,
    reason: "read_failed",
    error: "Data Explorer dedupe export unavailable.",
  });

  renderWorkspace();

  await user.click(await screen.findByTestId("behavior-dedupe-export-action"));

  expect(await screen.findByTestId("behavior-dedupe-export-error")).toHaveTextContent(
    "Data Explorer dedupe export unavailable.",
  );
  await waitFor(() => {
    expect(screen.getByTestId("behavior-activity-list")).toHaveTextContent("Dataset selected Atlantic Thermal");
  });
  expect(mockApiClient.dataExplorer.exportBehaviorDedupeSummary).toHaveBeenCalledWith({
    scope: "shared",
    windowMinutes: 60,
    limit: 3,
  });
});

test("recent operator activity fetch failures are non-fatal", async () => {
  mockApiClient.dataExplorer.listBehaviorEvents.mockResolvedValueOnce({
    ok: false,
    events: [],
    reason: "read_failed",
    error: "Data Explorer behavior audit unavailable.",
  });

  renderWorkspace();

  expect(await screen.findByTestId("behavior-activity-error")).toHaveTextContent(
    "Data Explorer behavior audit unavailable.",
  );
  expect(screen.getByRole("button", { name: "Save preset" })).toBeEnabled();
});

test("dataset selection writes a dataset_selected behavior event", async () => {
  const user = userEvent.setup();

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenCalled();
  });

  mockApiClient.dataExplorer.writeBehaviorEvent.mockClear();

  await user.click(screen.getByRole("button", { name: new RegExp(BASE_DATASETS[1]!.name, "i") }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.writeBehaviorEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "dataset_selected",
      datasetId: BASE_DATASETS[1]!.id,
      datasetName: BASE_DATASETS[1]!.name,
      scope: "shared",
    }));
  });
});

test("dataset detail load writes a single dataset_detail_viewed behavior event for each dataset switch", async () => {
  const user = userEvent.setup();

  renderWorkspace();

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenCalledWith(BASE_DATASETS[0]!.id);
  });

  mockApiClient.dataExplorer.writeBehaviorEvent.mockClear();

  await user.click(screen.getByRole("button", { name: new RegExp(BASE_DATASETS[1]!.name, "i") }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.getDatasetDetail).toHaveBeenCalledWith(BASE_DATASETS[1]!.id);
  });

  await waitFor(() => {
    const detailEvents = mockApiClient.dataExplorer.writeBehaviorEvent.mock.calls.filter((call) => {
      const payload = call[0] as { eventType?: string; datasetId?: string } | undefined;
      return payload?.eventType === "dataset_detail_viewed" && payload.datasetId === BASE_DATASETS[1]!.id;
    });

    expect(detailEvents).toHaveLength(1);
  });
});

test("applying a preset writes a preset_applied behavior event", async () => {
  const user = userEvent.setup();

  window.localStorage.setItem(
    "marine.dataExplorer.presets.v1",
    JSON.stringify({
      version: 3,
      presets: [
        {
          id: "shared-local-preset",
          name: "Shared Local Preset",
          scope: "shared",
          filters: {
            q: "local",
            category: "",
            region: "",
            status: "",
            sortBy: "updated",
            sortDir: "desc",
            pageSize: 25,
          },
          createdAt: "2026-03-20T10:00:00.000Z",
          updatedAt: "2026-03-20T10:00:00.000Z",
          lastUsedAt: null,
          useCount: 0,
        },
      ],
    }),
  );

  renderWorkspace();

  await screen.findByRole("option", { name: "Shared Local Preset" });

  mockApiClient.dataExplorer.writeBehaviorEvent.mockClear();
  await user.selectOptions(screen.getByLabelText("Saved presets"), "shared-local-preset");
  await user.click(screen.getByRole("button", { name: "Apply preset" }));

  await waitFor(() => {
    expect(mockApiClient.dataExplorer.writeBehaviorEvent).toHaveBeenCalledWith(expect.objectContaining({
      eventType: "preset_applied",
      presetId: "shared-local-preset",
      presetName: "Shared Local Preset",
      scope: "shared",
    }));
  });
});
