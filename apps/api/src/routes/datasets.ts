import { apiMockData } from "../data";
import type {
  DatasetDetailResponse,
  DatasetDetailTelemetry,
  DatasetListQuery,
  DatasetRecordsQuery,
  DatasetRecordsResponse,
  DatasetRecordsTelemetry,
  DatasetsResponse,
  DatasetsTelemetry,
  RouteDefinition,
} from "../types";

type DatasetListReadResult =
  | {
      source: "db";
      datasets: DatasetsResponse["datasets"];
      filters: DatasetListQuery;
      pageInfo: NonNullable<DatasetsResponse["pageInfo"]>;
    }
  | {
      source: "mock";
      datasets: DatasetsResponse["datasets"];
      filters: DatasetListQuery;
      pageInfo: NonNullable<DatasetsResponse["pageInfo"]>;
      fallbackReason: DatasetsTelemetry["fallbackReason"];
    };

function normalizeDatasetListOptions(query: DatasetListQuery = {}): {
  filters: DatasetListQuery;
  sortBy: DatasetsTelemetry["sortBy"];
  sortDir: DatasetsTelemetry["sortDir"];
  page: number;
  pageSize: number;
} {
  const filters = {
    q: query.q?.trim().toLowerCase() || undefined,
    category: query.category?.trim().toLowerCase() || undefined,
    region: query.region?.trim().toLowerCase() || undefined,
    status: query.status?.trim().toLowerCase() || undefined,
  };

  const sortBy =
    query.sortBy === "name" || query.sortBy === "records" || query.sortBy === "status" || query.sortBy === "updated"
      ? query.sortBy
      : "updated";
  const sortDir = query.sortDir === "asc" || query.sortDir === "desc" ? query.sortDir : "desc";
  const page =
    typeof query.page === "number" ? query.page : Number.parseInt(String(query.page ?? "1"), 10) || 1;
  const pageSize =
    typeof query.pageSize === "number"
      ? query.pageSize
      : Number.parseInt(String(query.pageSize ?? "25"), 10) || 25;

  return {
    filters,
    sortBy,
    sortDir,
    page,
    pageSize,
  };
}

function readDatabaseDatasets(query: DatasetListQuery = {}): DatasetListReadResult {
  const safeOptions = normalizeDatasetListOptions(query);

  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/datasets") as {
      extractDatasetListOptions: (query: DatasetListQuery | undefined) => {
        filters: DatasetListQuery;
        sortBy: DatasetsTelemetry["sortBy"];
        sortDir: DatasetsTelemetry["sortDir"];
        page: number;
        pageSize: number;
      };
      listDatasets: (
        query: DatasetListQuery,
      ) =>
        | {
            source: "db";
            datasets: DatasetsResponse["datasets"];
            pageInfo: NonNullable<DatasetsResponse["pageInfo"]>;
          }
        | { source: "mock"; fallbackReason: DatasetsTelemetry["fallbackReason"] };
    };

    const options = repository.extractDatasetListOptions(query);
    const readResult = repository.listDatasets(query);

    if (readResult.source === "db") {
      return {
        source: "db",
        datasets: readResult.datasets,
        filters: options.filters,
        pageInfo: readResult.pageInfo,
      };
    }

    return {
      source: "mock",
      datasets: [],
      filters: options.filters,
      pageInfo: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems: 0,
        totalPages: 0,
        sortBy: options.sortBy,
        sortDir: options.sortDir,
      },
      fallbackReason: readResult.fallbackReason,
    };
  } catch {
    return {
      source: "mock",
      datasets: [],
      filters: safeOptions.filters,
      pageInfo: {
        page: safeOptions.page,
        pageSize: safeOptions.pageSize,
        totalItems: 0,
        totalPages: 0,
        sortBy: safeOptions.sortBy,
        sortDir: safeOptions.sortDir,
      },
      fallbackReason: "db_query_failed",
    };
  }
}

function buildFilterSummary(filters: DatasetListQuery): DatasetListQuery | undefined {
  const filterSummary = Object.fromEntries(
    Object.entries(filters).filter(([, value]) => Boolean(value)),
  ) as DatasetListQuery;

  return Object.keys(filterSummary).length > 0 ? filterSummary : undefined;
}

function buildDatasetSummarySignals(
  readResult: DatasetListReadResult,
): DatasetsResponse["summarySignals"] {
  if (readResult.source === "mock") {
    return [
      {
        title: "Repository status",
        detail: `Live dataset repository unavailable (${readResult.fallbackReason}).`,
        tone: "amber",
      },
      {
        title: "Catalog availability",
        detail: "Dataset rows are intentionally withheld in degraded mode to avoid synthetic fallback data.",
        tone: "amber",
      },
      {
        title: "Operator guidance",
        detail: "Retry after backend recovery or verify database path and access controls.",
        tone: "cyan",
      },
    ];
  }

  const datasets = readResult.datasets;
  const pageInfo = readResult.pageInfo;
  const liveCount = datasets.filter((dataset) => dataset.status === "Live").length;
  const curatedCount = datasets.filter((dataset) => dataset.status === "Curated").length;
  const draftCount = datasets.filter((dataset) => dataset.status === "Draft").length;
  const pageCount = datasets.length;

  return [
    {
      title: "Coverage in view",
      detail: `${pageCount} datasets on page ${pageInfo.page} (${pageInfo.totalItems} matching total).`,
      tone: "cyan",
    },
    {
      title: "Live feed ratio",
      detail: `${liveCount} Live, ${curatedCount} Curated, ${draftCount} Draft in the current slice.`,
      tone: liveCount >= Math.max(1, Math.ceil(pageCount / 2)) ? "emerald" : "amber",
    },
    {
      title: "Draft validation queue",
      detail: draftCount > 0
        ? `${draftCount} Draft datasets need validation before operational promotion.`
        : "No Draft datasets in the current result slice.",
      tone: draftCount > 0 ? "amber" : "emerald",
    },
  ];
}

function parseDatasetRecordCount(value: string): number {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    return 0;
  }

  const suffix = normalized.slice(-1);
  const multiplier = suffix === "M" ? 1_000_000 : suffix === "K" ? 1_000 : 1;
  const numericPart = multiplier === 1 ? normalized : normalized.slice(0, -1);
  const parsed = Number.parseFloat(numericPart.replace(/,/g, ""));

  if (Number.isNaN(parsed) || parsed < 0) {
    return 0;
  }

  return parsed * multiplier;
}

function buildDatasetPreviewSeries(
  datasets: DatasetsResponse["datasets"],
): DatasetsResponse["previewSeries"] {
  const seededPoints = datasets.slice(0, 6).map((dataset, index) => ({
    label: dataset.id.replace("DST-", "") || `S${index + 1}`,
    count: parseDatasetRecordCount(dataset.records),
  }));

  if (seededPoints.length === 0) {
    return ["S1", "S2", "S3", "S4", "S5", "S6"].map((label) => ({
      label,
      value: 12,
    }));
  }

  const maxCount = Math.max(1, ...seededPoints.map((point) => point.count));
  const points = seededPoints.map((point) => ({
    label: point.label,
    value: Math.max(12, Math.round((point.count / maxCount) * 100)),
  }));
  const averageValue = Math.max(
    12,
    Math.round(points.reduce((total, point) => total + point.value, 0) / points.length),
  );

  while (points.length < 6) {
    points.push({
      label: `S${points.length + 1}`,
      value: averageValue,
    });
  }

  return points;
}

function buildDatasetMetadata(
  readResult: DatasetListReadResult,
): DatasetsResponse["metadata"] {
  const datasets = readResult.datasets;
  const pageInfo = readResult.pageInfo;
  const uniqueRegions = new Set(datasets.map((dataset) => dataset.region)).size;
  const uniqueCategories = new Set(datasets.map((dataset) => dataset.category)).size;
  const liveCount = datasets.filter((dataset) => dataset.status === "Live").length;
  const curatedCount = datasets.filter((dataset) => dataset.status === "Curated").length;
  const draftCount = datasets.filter((dataset) => dataset.status === "Draft").length;
  const coverage =
    datasets.length > 0
      ? `${uniqueRegions} regions, ${uniqueCategories} categories in this page slice`
      : "No datasets in this page slice";

  return [
    {
      label: "Source",
      value:
        readResult.source === "db"
          ? "Route-backed dataset repository"
          : `Degraded backend mode (${readResult.fallbackReason})`,
    },
    {
      label: "Coverage",
      value: readResult.source === "db" ? coverage : "Live dataset coverage unavailable while backend is degraded",
    },
    {
      label: "Cadence",
      value: `Sort ${pageInfo.sortBy} ${pageInfo.sortDir}; page ${pageInfo.page}/${Math.max(pageInfo.totalPages, 1)}`,
    },
    {
      label: "Schema",
      value: "id, name, category, region, updated, records, status",
    },
    {
      label: "Owner",
      value:
        readResult.source === "db"
          ? `Live ${liveCount} | Curated ${curatedCount} | Draft ${draftCount}`
          : "Provenance locked to explicit degraded backend mode",
    },
  ];
}

function buildDatasetActions(
  readResult: DatasetListReadResult,
): DatasetsResponse["actions"] {
  if (readResult.source === "mock") {
    return [
      {
        label: "Review Degraded Mode",
        icon: "play",
        tone: "primary",
      },
      {
        label: "Export Unavailable",
        icon: "download",
        tone: "secondary",
      },
      {
        label: "View Fallback Context",
        icon: "layers",
        tone: "secondary",
      },
    ];
  }

  const hasFilters = Boolean(
    readResult.filters.q
      || readResult.filters.category
      || readResult.filters.region
      || readResult.filters.status,
  );
  const rowCount = readResult.datasets.length;

  return [
    {
      label: hasFilters ? "Run Filtered Query" : "Run Query",
      icon: "play",
      tone: "primary",
    },
    {
      label: rowCount > 0 ? `Export ${rowCount} Rows` : "Export CSV",
      icon: "download",
      tone: "secondary",
    },
    {
      label: readResult.source === "db" ? "Open Schema" : "Open Fallback Schema",
      icon: "layers",
      tone: "secondary",
    },
  ];
}

export function buildDatasetsRouteResponse(
  query: DatasetListQuery = {},
  readResult = readDatabaseDatasets(query),
): { json: DatasetsResponse; telemetry: DatasetsTelemetry } {
  const datasets = readResult.datasets;
  const filterSummary = buildFilterSummary(readResult.filters);

  return {
    json: {
      actions: buildDatasetActions(readResult),
      datasets,
      previewSeries: buildDatasetPreviewSeries(datasets),
      metadata: buildDatasetMetadata(readResult),
      summarySignals: buildDatasetSummarySignals(readResult),
      pageInfo: readResult.pageInfo,
    },
    telemetry: {
      route: "GET /datasets",
      source: readResult.source,
      datasetCount: datasets.length,
      filtersApplied: Boolean(filterSummary),
      filterSummary,
      sortBy: readResult.pageInfo.sortBy,
      sortDir: readResult.pageInfo.sortDir,
      page: readResult.pageInfo.page,
      pageSize: readResult.pageInfo.pageSize,
      fallbackReason: readResult.source === "mock" ? readResult.fallbackReason : undefined,
    },
  };
}

function readDatabaseDatasetById(datasetId: string) {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/datasets") as {
      getDatasetById: (
        id: string,
      ) =>
        | {
            source: "db";
            result: "found";
            dataset: DatasetDetailResponse;
            metadataSource: "db_full" | "db_partial";
          }
        | { source: "db"; result: "not_found" }
        | { source: "mock"; fallbackReason: DatasetDetailTelemetry["fallbackReason"] };
    };

    return repository.getDatasetById(datasetId);
  } catch {
    return {
      source: "mock" as const,
      fallbackReason: "db_query_failed" as const,
    };
  }
}

type DatasetRecordsReadResult =
  | {
      source: "db";
      result: "found" | "empty";
      records: DatasetRecordsResponse["records"];
      pageInfo: NonNullable<DatasetRecordsResponse["pageInfo"]>;
    }
  | {
      source: "mock";
      fallbackReason: DatasetRecordsTelemetry["fallbackReason"];
      pageInfo: NonNullable<DatasetRecordsResponse["pageInfo"]>;
    }
  | { source: "db"; result: "not_found" };

function normalizeDatasetRecordsOptions(query: DatasetRecordsQuery = {}): {
  sortBy: DatasetRecordsTelemetry["sortBy"];
  sortDir: DatasetRecordsTelemetry["sortDir"];
  page: number;
  pageSize: number;
} {
  const sortBy =
    query.sortBy === "updated" || query.sortBy === "status" || query.sortBy === "title" || query.sortBy === "type"
      ? query.sortBy
      : "updated";
  const sortDir = query.sortDir === "asc" || query.sortDir === "desc" ? query.sortDir : "desc";
  const page =
    typeof query.page === "number" ? query.page : Number.parseInt(String(query.page ?? "1"), 10) || 1;
  const pageSize =
    typeof query.pageSize === "number"
      ? query.pageSize
      : Number.parseInt(String(query.pageSize ?? "5"), 10) || 5;

  return {
    sortBy,
    sortDir,
    page,
    pageSize,
  };
}

function readDatabaseDatasetRecords(datasetId: string, query: DatasetRecordsQuery = {}): DatasetRecordsReadResult {
  const safeOptions = normalizeDatasetRecordsOptions(query);

  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/datasets") as {
      extractDatasetRecordsListOptions: (query: DatasetRecordsQuery | undefined) => {
        sortBy: DatasetRecordsTelemetry["sortBy"];
        sortDir: DatasetRecordsTelemetry["sortDir"];
        page: number;
        pageSize: number;
      };
      listDatasetRecords: (
        id: string,
        query: DatasetRecordsQuery,
      ) =>
        | {
            source: "db";
            result: "found" | "empty";
            records: DatasetRecordsResponse["records"];
            pageInfo: NonNullable<DatasetRecordsResponse["pageInfo"]>;
          }
        | { source: "db"; result: "not_found" }
        | { source: "mock"; fallbackReason: DatasetRecordsTelemetry["fallbackReason"] };
    };

    const options = repository.extractDatasetRecordsListOptions(query);
    const readResult = repository.listDatasetRecords(datasetId, query);

    if (readResult.source === "db") {
      return readResult;
    }

    return {
      source: "mock",
      fallbackReason: readResult.fallbackReason,
      pageInfo: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems: 0,
        totalPages: 0,
        sortBy: options.sortBy,
        sortDir: options.sortDir,
      },
    };
  } catch {
    return {
      source: "mock" as const,
      fallbackReason: "db_query_failed" as const,
      pageInfo: {
        page: safeOptions.page,
        pageSize: safeOptions.pageSize,
        totalItems: 0,
        totalPages: 0,
        sortBy: safeOptions.sortBy,
        sortDir: safeOptions.sortDir,
      },
    };
  }
}

function findMockDatasetById(datasetId: string): DatasetDetailResponse | null {
  const dataset = apiMockData.dataExplorerWorkspaceData.datasets.find((item) => item.id === datasetId);

  if (!dataset) {
    return null;
  }

  return {
    id: dataset.id,
    name: dataset.name,
    category: dataset.category,
    region: dataset.region,
    updated: dataset.updated,
    records: dataset.records,
    status: dataset.status,
    metadata: Object.fromEntries(
      apiMockData.dataExplorerWorkspaceData.metadata.map((item) => [item.label, item.value]),
    ),
  };
}

export function buildDatasetDetailRouteResponse(
  datasetId: string,
  readResult = readDatabaseDatasetById(datasetId),
): {
  status: 200 | 404;
  json: DatasetDetailResponse | { message: string };
  telemetry: DatasetDetailTelemetry;
} {
  if (readResult.source === "db") {
    if (readResult.result === "found") {
      return {
        status: 200,
        json: readResult.dataset,
        telemetry: {
          route: "GET /datasets/:id",
          datasetId,
          source: "db",
          result: "found",
          metadataSource: readResult.metadataSource,
        },
      };
    }

    return {
      status: 404,
      json: { message: "Dataset not found" },
      telemetry: {
        route: "GET /datasets/:id",
        datasetId,
        source: "db",
        result: "not_found",
      },
    };
  }

  const mockDataset = findMockDatasetById(datasetId);

  if (mockDataset) {
    return {
      status: 200,
      json: mockDataset,
      telemetry: {
        route: "GET /datasets/:id",
        datasetId,
        source: "mock",
        result: "found",
        metadataSource: "mock",
        fallbackReason: readResult.fallbackReason,
      },
    };
  }

  return {
    status: 404,
    json: { message: "Dataset not found" },
    telemetry: {
      route: "GET /datasets/:id",
      datasetId,
      source: "mock",
      result: "not_found",
      metadataSource: "mock",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export function buildDatasetRecordsRouteResponse(
  datasetId: string,
  query: DatasetRecordsQuery = {},
  readResult = readDatabaseDatasetRecords(datasetId, query),
): {
  status: 200 | 404;
  json: DatasetRecordsResponse | { message: string };
  telemetry: DatasetRecordsTelemetry;
} {
  if (readResult.source === "db") {
    if (readResult.result === "not_found") {
      return {
        status: 404,
        json: { message: "Dataset not found" },
        telemetry: {
          route: "GET /datasets/:id/records",
          datasetId,
          source: "db",
          recordCount: 0,
          result: "not_found",
          sortBy: query.sortBy === "status" || query.sortBy === "title" || query.sortBy === "type" || query.sortBy === "updated" ? query.sortBy : "updated",
          sortDir: query.sortDir === "asc" || query.sortDir === "desc" ? query.sortDir : "desc",
          page: typeof query.page === "number" ? query.page : Number.parseInt(String(query.page ?? "1"), 10) || 1,
          pageSize: typeof query.pageSize === "number" ? query.pageSize : Number.parseInt(String(query.pageSize ?? "5"), 10) || 5,
        },
      };
    }

    return {
      status: 200,
      json: { records: readResult.records, pageInfo: readResult.pageInfo },
      telemetry: {
        route: "GET /datasets/:id/records",
        datasetId,
        source: "db",
        recordCount: readResult.records.length,
        result: readResult.result,
        sortBy: readResult.pageInfo.sortBy,
        sortDir: readResult.pageInfo.sortDir,
        page: readResult.pageInfo.page,
        pageSize: readResult.pageInfo.pageSize,
      },
    };
  }

  return {
    status: 200,
    json: {
      records: [],
      pageInfo: {
        ...readResult.pageInfo,
        totalItems: 0,
        totalPages: 0,
      },
    },
    telemetry: {
      route: "GET /datasets/:id/records",
      datasetId,
      source: "mock",
      recordCount: 0,
      result: "empty",
      sortBy: readResult.pageInfo.sortBy,
      sortDir: readResult.pageInfo.sortDir,
      page: readResult.pageInfo.page,
      pageSize: readResult.pageInfo.pageSize,
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getDatasetsRoute: RouteDefinition<DatasetsResponse, undefined, DatasetListQuery> = {
  method: "GET",
  path: "/datasets",
  handler(request) {
    const response = buildDatasetsRouteResponse(request.query ?? {});

    return {
      status: 200,
      json: response.json,
      telemetry: response.telemetry,
    };
  },
};

export const getDatasetByIdRoute: RouteDefinition<DatasetDetailResponse | { message: string }, { id: string }> = {
  method: "GET",
  path: "/datasets/:id",
  handler(request) {
    const datasetId = request.body.id;
    const response = buildDatasetDetailRouteResponse(datasetId);

    return {
      status: response.status,
      json: response.json,
      telemetry: response.telemetry,
    };
  },
};

export const getDatasetRecordsRoute: RouteDefinition<
  DatasetRecordsResponse | { message: string },
  { id: string },
  DatasetRecordsQuery
> = {
  method: "GET",
  path: "/datasets/:id/records",
  handler(request) {
    const datasetId = request.body.id;
    const response = buildDatasetRecordsRouteResponse(datasetId, request.query ?? {});

    return {
      status: response.status,
      json: response.json,
      telemetry: response.telemetry,
    };
  },
};
