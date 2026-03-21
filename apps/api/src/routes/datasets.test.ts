import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDatasetDetailRouteResponse,
  buildDatasetRecordsRouteResponse,
  buildDatasetsRouteResponse,
} from "./datasets";

const PAGE_INFO = {
  page: 1,
  pageSize: 25,
  totalItems: 1,
  totalPages: 1,
  sortBy: "updated" as const,
  sortDir: "desc" as const,
};

test("datasets route preserves the existing contract with no filters from DB", () => {
  const response = buildDatasetsRouteResponse(
    {},
    {
      source: "db",
      filters: {},
      datasets: [
        {
          id: "DST-DB-1",
          name: "DB dataset",
          category: "Temperature",
          region: "North Pacific",
          updated: "5 min ago",
          records: "1.2M",
          status: "Live",
        },
      ],
      pageInfo: PAGE_INFO,
    },
  );

  assert.equal(response.telemetry.route, "GET /datasets");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.datasetCount, 1);
  assert.equal(response.telemetry.filtersApplied, false);
  assert.equal(response.telemetry.filterSummary, undefined);
  assert.equal(response.telemetry.sortBy, "updated");
  assert.equal(response.telemetry.sortDir, "desc");
  assert.equal(response.telemetry.page, 1);
  assert.equal(response.telemetry.pageSize, 25);
  assert.equal(response.telemetry.fallbackReason, undefined);
  assert.deepEqual(Object.keys(response.json).sort(), [
    "actions",
    "datasets",
    "metadata",
    "pageInfo",
    "previewSeries",
    "summarySignals",
  ]);
  assert.deepEqual(response.json.pageInfo, PAGE_INFO);
  assert.deepEqual(response.json.actions, [
    { label: "Run Query", icon: "play", tone: "primary" },
    { label: "Export 1 Rows", icon: "download", tone: "secondary" },
    { label: "Open Schema", icon: "layers", tone: "secondary" },
  ]);
  assert.deepEqual(response.json.previewSeries, [
    { label: "DB-1", value: 100 },
    { label: "S2", value: 100 },
    { label: "S3", value: 100 },
    { label: "S4", value: 100 },
    { label: "S5", value: 100 },
    { label: "S6", value: 100 },
  ]);
  assert.deepEqual(response.json.metadata, [
    { label: "Source", value: "Route-backed dataset repository" },
    { label: "Coverage", value: "1 regions, 1 categories in this page slice" },
    { label: "Cadence", value: "Sort updated desc; page 1/1" },
    { label: "Schema", value: "id, name, category, region, updated, records, status" },
    { label: "Owner", value: "Live 1 | Curated 0 | Draft 0" },
  ]);
  assert.deepEqual(response.json.summarySignals, [
    {
      title: "Coverage in view",
      detail: "1 datasets on page 1 (1 matching total).",
      tone: "cyan",
    },
    {
      title: "Live feed ratio",
      detail: "1 Live, 0 Curated, 0 Draft in the current slice.",
      tone: "emerald",
    },
    {
      title: "Draft validation queue",
      detail: "No Draft datasets in the current result slice.",
      tone: "emerald",
    },
  ]);
});

test("datasets route returns DB-backed sorted results", () => {
  const response = buildDatasetsRouteResponse(
    { sortBy: "name", sortDir: "asc" },
    {
      source: "db",
      filters: { sortBy: "name", sortDir: "asc" },
      datasets: [
        {
          id: "DST-051",
          name: "Autonomous Buoy Nutrient Profiles",
          category: "Chemistry",
          region: "Eastern Shelf",
          updated: "54 min ago",
          records: "642K",
          status: "Live",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 4,
        totalPages: 1,
        sortBy: "name",
        sortDir: "asc",
      },
    },
  );

  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.sortBy, "name");
  assert.equal(response.telemetry.sortDir, "asc");
  assert.equal(response.json.datasets[0]?.id, "DST-051");
});

test("datasets route returns DB-backed paginated results", () => {
  const response = buildDatasetsRouteResponse(
    { page: 2, pageSize: 1 },
    {
      source: "db",
      filters: { page: 2, pageSize: 1 },
      datasets: [
        {
          id: "DST-088",
          name: "Coral Reef Stress Survey Bundle",
          category: "Field Reports",
          region: "Sector 14-C",
          updated: "26 min ago",
          records: "18.4K",
          status: "Curated",
        },
      ],
      pageInfo: {
        page: 2,
        pageSize: 1,
        totalItems: 4,
        totalPages: 4,
        sortBy: "updated",
        sortDir: "desc",
      },
    },
  );

  assert.equal(response.telemetry.page, 2);
  assert.equal(response.telemetry.pageSize, 1);
  assert.equal(response.json.pageInfo?.totalPages, 4);
});

test("datasets route returns DB-backed filtered, sorted, paginated results", () => {
  const response = buildDatasetsRouteResponse(
    { status: "live", sortBy: "records", sortDir: "desc", page: 1, pageSize: 1 },
    {
      source: "db",
      filters: { status: "live", sortBy: "records", sortDir: "desc", page: 1, pageSize: 1 },
      datasets: [
        {
          id: "DST-104",
          name: "Pacific Thermal Front Observations",
          category: "Temperature",
          region: "North Pacific",
          updated: "8 min ago",
          records: "1.2M",
          status: "Live",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 1,
        totalItems: 2,
        totalPages: 2,
        sortBy: "records",
        sortDir: "desc",
      },
    },
  );

  assert.equal(response.telemetry.filtersApplied, true);
  assert.deepEqual(response.telemetry.filterSummary, {
    status: "live",
    sortBy: "records",
    sortDir: "desc",
    page: 1,
    pageSize: 1,
  });
  assert.equal(response.telemetry.sortBy, "records");
  assert.equal(response.telemetry.pageSize, 1);
  assert.equal(response.json.summarySignals[0]?.detail, "1 datasets on page 1 (2 matching total).");
  assert.equal(response.json.summarySignals[1]?.detail, "1 Live, 0 Curated, 0 Draft in the current slice.");
});

test("datasets route computes dynamic summary signals for mixed status results", () => {
  const response = buildDatasetsRouteResponse(
    { page: 1, pageSize: 3 },
    {
      source: "db",
      filters: { page: 1, pageSize: 3 },
      datasets: [
        {
          id: "DST-104",
          name: "Pacific Thermal Front Observations",
          category: "Temperature",
          region: "North Pacific",
          updated: "8 min ago",
          records: "1.2M",
          status: "Live",
        },
        {
          id: "DST-088",
          name: "Coral Reef Stress Survey Bundle",
          category: "Field Reports",
          region: "Sector 14-C",
          updated: "26 min ago",
          records: "18.4K",
          status: "Curated",
        },
        {
          id: "DST-133",
          name: "Larval Drift Model Ensemble",
          category: "Model Output",
          region: "Reef Boundary",
          updated: "2 days ago",
          records: "9.8K",
          status: "Draft",
        },
      ],
      pageInfo: {
        page: 1,
        pageSize: 3,
        totalItems: 3,
        totalPages: 1,
        sortBy: "updated",
        sortDir: "desc",
      },
    },
  );

  assert.deepEqual(response.json.summarySignals, [
    {
      title: "Coverage in view",
      detail: "3 datasets on page 1 (3 matching total).",
      tone: "cyan",
    },
    {
      title: "Live feed ratio",
      detail: "1 Live, 1 Curated, 1 Draft in the current slice.",
      tone: "amber",
    },
    {
      title: "Draft validation queue",
      detail: "1 Draft datasets need validation before operational promotion.",
      tone: "amber",
    },
  ]);
});

test("datasets route returns an empty real DB dataset list when filters match zero rows", () => {
  const response = buildDatasetsRouteResponse(
    { q: "missing", page: 1, pageSize: 10 },
    {
      source: "db",
      filters: { q: "missing", page: 1, pageSize: 10 },
      datasets: [],
      pageInfo: {
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
        sortBy: "updated",
        sortDir: "desc",
      },
    },
  );

  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.datasetCount, 0);
  assert.equal(response.telemetry.filtersApplied, true);
  assert.deepEqual(response.json.datasets, []);
});

test("datasets route returns explicit degraded empty results when the DB path is missing", () => {
  const response = buildDatasetsRouteResponse(
    { status: "live", sortBy: "name", sortDir: "asc", page: 1, pageSize: 2 },
    {
      source: "mock",
      filters: { status: "live", sortBy: "name", sortDir: "asc", page: 1, pageSize: 2 },
      datasets: [],
      pageInfo: {
        page: 1,
        pageSize: 2,
        totalItems: 0,
        totalPages: 0,
        sortBy: "name",
        sortDir: "asc",
      },
      fallbackReason: "db_path_missing",
    },
  );

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
  assert.equal(response.telemetry.sortBy, "name");
  assert.equal(response.telemetry.pageSize, 2);
  assert.deepEqual(response.json.datasets, []);
  assert.equal(response.json.actions[0]?.label, "Review Degraded Mode");
  assert.equal(response.json.metadata[0]?.value, "Degraded backend mode (db_path_missing)");
  assert.equal(response.json.summarySignals[0]?.title, "Repository status");
});

test("datasets route returns explicit degraded empty results when DB open fails", () => {
  const response = buildDatasetsRouteResponse(
    { region: "north pacific", page: 1, pageSize: 10 },
    {
      source: "mock",
      filters: { region: "north pacific", page: 1, pageSize: 10 },
      datasets: [],
      pageInfo: {
        page: 1,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
        sortBy: "updated",
        sortDir: "desc",
      },
      fallbackReason: "db_open_failed",
    },
  );

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
  assert.deepEqual(response.json.datasets, []);
});

test("datasets route returns explicit degraded empty results when DB querying fails", () => {
  const response = buildDatasetsRouteResponse(
    { category: "field reports", sortBy: "updated", sortDir: "desc" },
    {
      source: "mock",
      filters: { category: "field reports", sortBy: "updated", sortDir: "desc" },
      datasets: [],
      pageInfo: {
        page: 1,
        pageSize: 25,
        totalItems: 0,
        totalPages: 0,
        sortBy: "updated",
        sortDir: "desc",
      },
      fallbackReason: "db_query_failed",
    },
  );

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
  assert.equal(response.json.actions[2]?.label, "View Fallback Context");
  assert.equal(response.json.metadata[0]?.value, "Degraded backend mode (db_query_failed)");
});

test("datasets route returns an unchanged contract with empty filtered mock results", () => {
  const response = buildDatasetsRouteResponse(
    { q: "missing", page: 2, pageSize: 10 },
    {
      source: "mock",
      filters: { q: "missing", page: 2, pageSize: 10 },
      datasets: [],
      pageInfo: {
        page: 2,
        pageSize: 10,
        totalItems: 0,
        totalPages: 0,
        sortBy: "updated",
        sortDir: "desc",
      },
      fallbackReason: "db_query_failed",
    },
  );

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.datasetCount, 0);
  assert.equal(response.telemetry.page, 2);
  assert.deepEqual(response.json.datasets, []);
  assert.deepEqual(response.json.previewSeries, [
    { label: "S1", value: 12 },
    { label: "S2", value: 12 },
    { label: "S3", value: 12 },
    { label: "S4", value: 12 },
    { label: "S5", value: 12 },
    { label: "S6", value: 12 },
  ]);
  assert.equal(response.json.metadata[1]?.value, "Live dataset coverage unavailable while backend is degraded");
});

test("dataset detail route returns 200 from DB when the record is found", () => {
  const response = buildDatasetDetailRouteResponse("DST-DB-1", {
    source: "db",
    result: "found",
    metadataSource: "db_full",
    dataset: {
      id: "DST-DB-1",
      name: "DB dataset",
      category: "Temperature",
      region: "North Pacific",
      updated: "5 min ago",
      records: "1.2M",
      status: "Live",
      metadata: {
        Owner: "Ocean Systems Lab",
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.metadataSource, "db_full");
});

test("dataset detail route returns 200 from DB with partial metadata when metadata is incomplete", () => {
  const response = buildDatasetDetailRouteResponse("DST-DB-2", {
    source: "db",
    result: "found",
    metadataSource: "db_partial",
    dataset: {
      id: "DST-DB-2",
      name: "Partial dataset",
      category: "Chemistry",
      region: "Eastern Shelf",
      updated: "1 hr ago",
      records: "9.8K",
      status: "Draft",
      metadata: {
        Source: "Custom source",
        Coverage: "34.2N-35.0N / 142.1W-145.4W",
      },
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.metadataSource, "db_partial");
});

test("dataset detail route returns 404 from DB when no matching record exists", () => {
  const response = buildDatasetDetailRouteResponse("DST-MISSING", {
    source: "db",
    result: "not_found",
  });

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.result, "not_found");
  assert.equal(response.telemetry.metadataSource, undefined);
});

test("dataset detail route falls back to mock with db_path_missing when mock record exists", () => {
  const response = buildDatasetDetailRouteResponse("DST-104", {
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.metadataSource, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
});

test("dataset detail route falls back to mock with db_open_failed when mock record exists", () => {
  const response = buildDatasetDetailRouteResponse("DST-104", {
    source: "mock",
    fallbackReason: "db_open_failed",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.metadataSource, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
});

test("dataset detail route falls back to mock with db_query_failed when mock record exists", () => {
  const response = buildDatasetDetailRouteResponse("DST-104", {
    source: "mock",
    fallbackReason: "db_query_failed",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.metadataSource, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
});

test("dataset detail route returns 404 from mock fallback when no equivalent mock record exists", () => {
  const response = buildDatasetDetailRouteResponse("DST-MISSING", {
    source: "mock",
    fallbackReason: "db_query_failed",
  });

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.result, "not_found");
  assert.equal(response.telemetry.metadataSource, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
});

test("dataset records route returns 200 from DB when records are found", () => {
  const response = buildDatasetRecordsRouteResponse("DST-104", { sortBy: "title", sortDir: "asc", page: 1, pageSize: 2 }, {
    source: "db",
    result: "found",
    records: [
      {
        id: "ALT-214",
        title: "Thermal spike detected in reef-edge grid",
        type: "Alert",
        status: "Open",
        updated: "11 min ago",
        summary:
          "Elevated surface temperature exceeded the seasonal envelope across two adjacent cells.",
      },
    ],
    pageInfo: {
      page: 1,
      pageSize: 2,
      totalItems: 4,
      totalPages: 2,
      sortBy: "title",
      sortDir: "asc",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.recordCount, 1);
  assert.equal(response.telemetry.sortBy, "title");
  assert.equal(response.telemetry.pageSize, 2);
  if ("records" in response.json) {
    assert.equal(response.json.pageInfo?.totalItems, 4);
  }
});

test("dataset records route returns 200 with empty records when the dataset has no related records", () => {
  const response = buildDatasetRecordsRouteResponse("DST-051", { page: 2, pageSize: 2 }, {
    source: "db",
    result: "empty",
    records: [],
    pageInfo: {
      page: 2,
      pageSize: 2,
      totalItems: 0,
      totalPages: 0,
      sortBy: "updated",
      sortDir: "desc",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.result, "empty");
  assert.equal(response.telemetry.recordCount, 0);
  assert.equal(response.telemetry.page, 2);
  assert.deepEqual(response.json, {
    records: [],
    pageInfo: {
      page: 2,
      pageSize: 2,
      totalItems: 0,
      totalPages: 0,
      sortBy: "updated",
      sortDir: "desc",
    },
  });
});

test("dataset records route returns 404 from DB when the dataset is absent", () => {
  const response = buildDatasetRecordsRouteResponse("DST-MISSING", { sortBy: "status", sortDir: "asc", page: 3, pageSize: 1 }, {
    source: "db",
    result: "not_found",
  });

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.result, "not_found");
  assert.equal(response.telemetry.recordCount, 0);
  assert.equal(response.telemetry.sortBy, "status");
  assert.equal(response.telemetry.page, 3);
});

test("dataset records route returns explicit degraded empty results when the DB path is missing", () => {
  const response = buildDatasetRecordsRouteResponse("DST-104", { page: 1, pageSize: 1, sortBy: "updated", sortDir: "desc" }, {
    source: "mock",
    pageInfo: {
      page: 1,
      pageSize: 1,
      totalItems: 0,
      totalPages: 0,
      sortBy: "updated",
      sortDir: "desc",
    },
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.result, "empty");
  assert.equal(response.telemetry.recordCount, 0);
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
  if ("records" in response.json) {
    assert.equal(response.json.pageInfo?.totalPages, 0);
  }
});

test("dataset records route returns an empty mock record list when no safe mock records exist", () => {
  const response = buildDatasetRecordsRouteResponse("DST-088", { page: 2, pageSize: 2 }, {
    source: "mock",
    pageInfo: {
      page: 2,
      pageSize: 2,
      totalItems: 0,
      totalPages: 0,
      sortBy: "updated",
      sortDir: "desc",
    },
    fallbackReason: "db_open_failed",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.result, "empty");
  assert.equal(response.telemetry.recordCount, 0);
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
  assert.deepEqual(response.json, {
    records: [],
    pageInfo: {
      page: 2,
      pageSize: 2,
      totalItems: 0,
      totalPages: 0,
      sortBy: "updated",
      sortDir: "desc",
    },
  });
});

test("dataset records route keeps degraded behavior explicit and does not infer not_found in fallback mode", () => {
  const response = buildDatasetRecordsRouteResponse("DST-MISSING", { sortBy: "title", sortDir: "asc", page: 1, pageSize: 5 }, {
    source: "mock",
    pageInfo: {
      page: 1,
      pageSize: 5,
      totalItems: 0,
      totalPages: 0,
      sortBy: "title",
      sortDir: "asc",
    },
    fallbackReason: "db_query_failed",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.result, "empty");
  assert.equal(response.telemetry.recordCount, 0);
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
  assert.equal(response.telemetry.sortBy, "title");
  assert.deepEqual(response.json, {
    records: [],
    pageInfo: {
      page: 1,
      pageSize: 5,
      totalItems: 0,
      totalPages: 0,
      sortBy: "title",
      sortDir: "asc",
    },
  });
});
