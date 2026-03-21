import test from "node:test";
import assert from "node:assert/strict";
import {
  getDatasetById,
  getDatasetRows,
  listDatasetRecords,
  listDatasets,
} from "./datasets";
import type { SqliteDatabaseLike } from "../db/client";

type DatasetTestRow = {
  id: string;
  name: string;
  category: string;
  region: string | null;
  refreshed_at: string | null;
  created_at?: string | null;
  record_count: number | null;
  status: string;
  metadata?: string | null;
};

type AlertTestRow = {
  id: string;
  dataset_id: string;
  title: string;
  status: string;
  severity: string;
  detail: string | null;
  detected_at: string | null;
};

interface TestDatabase extends SqliteDatabaseLike {
  prepare(sql: string): {
    all: (...params: unknown[]) => unknown[];
  };
}

const DATASET_ROWS: DatasetTestRow[] = [
  {
    id: "DST-104",
    name: "Pacific Thermal Front Observations",
    category: "Temperature",
    region: "North Pacific",
    refreshed_at: "2026-03-13T11:52:00.000Z",
    created_at: "2026-03-13T10:52:00.000Z",
    record_count: 1200000,
    status: "Live",
    metadata:
      "{\"Source\":\"NOAA polar composite + buoy fusion\",\"Coverage\":\"34.2N-35.0N / 142.1W-145.4W\",\"Cadence\":\"5 minute ingest / daily consolidation\",\"Schema\":\"temperature_c, depth_m, anomaly_index, grid_id\",\"Owner\":\"Ocean Systems Lab\"}",
  },
  {
    id: "DST-088",
    name: "Coral Reef Stress Survey Bundle",
    category: "Field Reports",
    region: "Sector 14-C",
    refreshed_at: "2026-03-13T11:34:00.000Z",
    created_at: "2026-03-13T09:34:00.000Z",
    record_count: 18400,
    status: "Curated",
    metadata: "{\"Source\":\"Dive team survey\",\"Owner\":\"Reef Team Bravo\"}",
  },
  {
    id: "DST-051",
    name: "Autonomous Buoy Nutrient Profiles",
    category: "Chemistry",
    region: "Eastern Shelf",
    refreshed_at: "2026-03-13T11:06:00.000Z",
    created_at: "2026-03-13T09:06:00.000Z",
    record_count: 642000,
    status: "Live",
    metadata: null,
  },
  {
    id: "DST-133",
    name: "Larval Drift Model Ensemble",
    category: "Model Output",
    region: "Reef Boundary",
    refreshed_at: null,
    created_at: "2026-03-12T08:00:00.000Z",
    record_count: 9800,
    status: "Draft",
    metadata: null,
  },
];

const ALERT_ROWS: AlertTestRow[] = [
  {
    id: "ALT-214",
    dataset_id: "DST-104",
    title: "Thermal spike detected in reef-edge grid",
    status: "Open",
    severity: "high",
    detail: "Elevated surface temperature exceeded the seasonal envelope across two adjacent cells.",
    detected_at: "2026-03-13T11:49:00.000Z",
  },
  {
    id: "ALT-209",
    dataset_id: "DST-104",
    title: "Buoy cross-check flagged warming persistence",
    status: "Monitoring",
    severity: "medium",
    detail: "Subsurface confirmation suggests the front is holding deeper than the last modeled pass.",
    detected_at: "2026-03-13T11:37:00.000Z",
  },
  {
    id: "ALT-180",
    dataset_id: "DST-104",
    title: "Acoustic disturbance follow-up",
    status: "Closed",
    severity: "low",
    detail: "Secondary alert retained for chronology checks.",
    detected_at: "2026-03-13T10:10:00.000Z",
  },
  {
    id: "ALT-175",
    dataset_id: "DST-104",
    title: "Current shear crossover note",
    status: "Open",
    severity: "medium",
    detail: "Current vectors may amplify thermal persistence near the boundary cells.",
    detected_at: "2026-03-13T09:55:00.000Z",
  },
];

function applyListFilters(rows: DatasetTestRow[], params: unknown[], sql: string): DatasetTestRow[] {
  return rows.filter((row) => {
    let nextParamIndex = 0;

    if (sql.includes("(LOWER(d.name) LIKE ? OR LOWER(d.category) LIKE ?)")) {
      const first = String(params[nextParamIndex] ?? "").replace(/%/g, "");
      const second = String(params[nextParamIndex + 1] ?? "").replace(/%/g, "");
      nextParamIndex += 2;

      const name = row.name.toLowerCase();
      const category = row.category.toLowerCase();
      if (!name.includes(first) && !category.includes(second)) {
        return false;
      }
    }

    if (sql.includes("LOWER(d.category) = ?")) {
      const category = String(params[nextParamIndex] ?? "");
      nextParamIndex += 1;
      if (row.category.toLowerCase() !== category) {
        return false;
      }
    }

    if (sql.includes("LOWER(COALESCE(r.name, '')) = ?")) {
      const region = String(params[nextParamIndex] ?? "");
      nextParamIndex += 1;
      if ((row.region ?? "").toLowerCase() !== region) {
        return false;
      }
    }

    if (sql.includes("LOWER(d.status) = ?")) {
      const status = String(params[nextParamIndex] ?? "");
      nextParamIndex += 1;
      if (row.status.toLowerCase() !== status) {
        return false;
      }
    }

    return true;
  });
}

function sortRows(rows: DatasetTestRow[], sql: string): DatasetTestRow[] {
  const direction = sql.includes(" DESC") ? -1 : 1;

  return [...rows].sort((left, right) => {
    let comparison = 0;

    if (sql.includes("ORDER BY LOWER(d.name)")) {
      comparison = left.name.localeCompare(right.name);
    } else if (sql.includes("ORDER BY COALESCE(d.record_count, 0)")) {
      comparison = (left.record_count ?? 0) - (right.record_count ?? 0);
    } else if (sql.includes("ORDER BY LOWER(d.status)")) {
      comparison = left.status.localeCompare(right.status);
    } else {
      const leftUpdated = left.refreshed_at ?? left.created_at ?? "";
      const rightUpdated = right.refreshed_at ?? right.created_at ?? "";
      comparison = leftUpdated.localeCompare(rightUpdated);
    }

    if (comparison === 0) {
      comparison = left.name.localeCompare(right.name);
    }

    return comparison * direction;
  });
}

function sortAlertRows(rows: AlertTestRow[], sql: string): AlertTestRow[] {
  const direction = sql.includes(" DESC") ? -1 : 1;

  return [...rows].sort((left, right) => {
    let comparison = 0;

    if (sql.includes("ORDER BY LOWER(a.status)")) {
      comparison = left.status.localeCompare(right.status);
    } else if (sql.includes("ORDER BY LOWER(a.title)")) {
      comparison = left.title.localeCompare(right.title);
    } else if (sql.includes("ORDER BY 'alert'")) {
      comparison = 0;
    } else {
      comparison = (left.detected_at ?? "").localeCompare(right.detected_at ?? "");
    }

    if (comparison === 0) {
      comparison = left.title.localeCompare(right.title);
    }

    return comparison * direction;
  });
}

function createDatabase(
  datasetRows: DatasetTestRow[],
  alertRows: AlertTestRow[],
  options?: { throwOnQuery?: boolean },
): TestDatabase {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (options?.throwOnQuery) {
            throw new Error("query failed");
          }

          if (sql.includes("COUNT(*) AS total")) {
            if (sql.includes("FROM alerts a")) {
              const datasetId = String(params[0] ?? "");
              return [{ total: alertRows.filter((row) => row.dataset_id === datasetId).length }];
            }
            return [{ total: applyListFilters(datasetRows, params, sql).length }];
          }

          if (sql.includes("FROM alerts a")) {
            const datasetId = String(params[0] ?? "");
            const filtered = alertRows.filter((row) => row.dataset_id === datasetId);
            const sorted = sortAlertRows(filtered, sql);
            const limit = Number(params.at(-2) ?? sorted.length);
            const offset = Number(params.at(-1) ?? 0);

            return sorted.slice(offset, offset + limit);
          }

          if (sql.includes("WHERE d.id = ?")) {
            const datasetId = String(params[0] ?? "");
            return datasetRows.filter((row) => row.id === datasetId);
          }

          const filtered = applyListFilters(datasetRows, params, sql);
          const sorted = sortRows(filtered, sql);
          const limit = Number(params.at(-2) ?? sorted.length);
          const offset = Number(params.at(-1) ?? 0);

          return sorted.slice(offset, offset + limit);
        },
      };
    },
    close() {},
  };
}

const NOW = () => Date.parse("2026-03-13T12:00:00.000Z");

test("dataset repository sorts by updated desc by default", () => {
  const result = listDatasets({}, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.deepEqual(result.datasets.map((dataset) => dataset.id), ["DST-104", "DST-088", "DST-051", "DST-133"]);
  assert.equal(result.pageInfo.sortBy, "updated");
  assert.equal(result.pageInfo.sortDir, "desc");
});

test("dataset repository sorts by name ascending", () => {
  const result = listDatasets({ sortBy: "name", sortDir: "asc" }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.deepEqual(result.datasets.map((dataset) => dataset.id), ["DST-051", "DST-088", "DST-133", "DST-104"]);
});

test("dataset repository sorts by records descending", () => {
  const result = listDatasets({ sortBy: "records", sortDir: "desc" }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.deepEqual(result.datasets.map((dataset) => dataset.id), ["DST-104", "DST-051", "DST-088", "DST-133"]);
});

test("dataset repository sorts by status ascending", () => {
  const result = listDatasets({ sortBy: "status", sortDir: "asc" }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.deepEqual(result.datasets.map((dataset) => dataset.id), ["DST-088", "DST-133", "DST-051", "DST-104"]);
});

test("dataset repository paginates the sorted result slice", () => {
  const result = listDatasets({ page: 2, pageSize: 2 }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.deepEqual(result.datasets.map((dataset) => dataset.id), ["DST-051", "DST-133"]);
  assert.deepEqual(result.pageInfo, {
    page: 2,
    pageSize: 2,
    totalItems: 4,
    totalPages: 2,
    sortBy: "updated",
    sortDir: "desc",
  });
});

test("dataset repository combines filters with pagination", () => {
  const result = listDatasets({ status: "live", sortBy: "name", sortDir: "asc", page: 1, pageSize: 1 }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.deepEqual(result.datasets.map((dataset) => dataset.id), ["DST-051"]);
  assert.equal(result.pageInfo.totalItems, 2);
  assert.equal(result.pageInfo.totalPages, 2);
});

test("dataset repository falls back to default sorting when sortBy is invalid", () => {
  const result = listDatasets({ sortBy: "unknown" }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.equal(result.pageInfo.sortBy, "updated");
});

test("dataset repository returns DB success with an empty list when filters match zero rows", () => {
  const result = listDatasets({ q: "salinity", pageSize: 10 }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.deepEqual(result.datasets, []);
  assert.equal(result.pageInfo.totalItems, 0);
  assert.equal(result.pageInfo.totalPages, 0);
});

test("dataset repository falls back with db_path_missing when the DB file does not exist", () => {
  const result = listDatasets({ sortBy: "name" }, {
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });
});

test("dataset repository falls back with db_open_failed when opening the DB throws", () => {
  const result = listDatasets({ page: 2 }, {
    resolvePath: () => "broken.sqlite",
    hasPath: () => true,
    openDatabase: () => {
      throw new Error("open failed");
    },
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_open_failed",
  });
});

test("dataset repository falls back with db_query_failed when querying throws", () => {
  const result = listDatasets({ sortBy: "records" }, {
    resolvePath: () => "query.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS, { throwOnQuery: true }),
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_query_failed",
  });
});

test("dataset repository returns DB rows when the legacy unfiltered helper is used", () => {
  const result = getDatasetRows({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.equal(result.datasets.length, 4);
});

test("dataset repository returns a matching detail row with full metadata when present", () => {
  const result = getDatasetById("DST-104", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.equal(result.result, "found");
  if (result.source === "db" && result.result === "found") {
    assert.equal(result.metadataSource, "db_full");
    assert.equal(result.dataset.id, "DST-104");
  }
});

test("dataset detail repository returns db not_found when the DB is reachable but no row exists", () => {
  const result = getDatasetById("DST-MISSING", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
  });

  assert.deepEqual(result, {
    source: "db",
    result: "not_found",
  });
});

test("dataset records repository returns related records when the dataset has records", () => {
  const result = listDatasetRecords("DST-104", {}, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.equal(result.result, "found");
  if (result.source === "db" && result.result === "found") {
    assert.equal(result.records.length, 4);
    assert.equal(result.pageInfo.sortBy, "updated");
    assert.equal(result.pageInfo.sortDir, "desc");
  }
});

test("dataset records repository returns empty when the dataset exists with zero records", () => {
  const result = listDatasetRecords("DST-051", {}, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.deepEqual(result, {
    source: "db",
    result: "empty",
    records: [],
    pageInfo: {
      page: 1,
      pageSize: 5,
      totalItems: 0,
      totalPages: 0,
      sortBy: "updated",
      sortDir: "desc",
    },
  });
});

test("dataset records repository sorts by title ascending", () => {
  const result = listDatasetRecords("DST-104", { sortBy: "title", sortDir: "asc" }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.equal(result.result, "found");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.records.map((record) => record.id), ["ALT-180", "ALT-209", "ALT-175", "ALT-214"]);
  }
});

test("dataset records repository sorts by status descending", () => {
  const result = listDatasetRecords("DST-104", { sortBy: "status", sortDir: "desc" }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.equal(result.result, "found");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.records.map((record) => record.status), ["Open", "Open", "Monitoring", "Closed"]);
  }
});

test("dataset records repository paginates the sorted result slice", () => {
  const result = listDatasetRecords("DST-104", { page: 2, pageSize: 2 }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.equal(result.result, "found");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.records.map((record) => record.id), ["ALT-180", "ALT-175"]);
    assert.deepEqual(result.pageInfo, {
      page: 2,
      pageSize: 2,
      totalItems: 4,
      totalPages: 2,
      sortBy: "updated",
      sortDir: "desc",
    });
  }
});

test("dataset records repository falls back to default sorting when sortBy is invalid", () => {
  const result = listDatasetRecords("DST-104", { sortBy: "bad-sort" }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  assert.equal(result.result, "found");
  if (result.source === "db" && result.result === "found") {
    assert.equal(result.pageInfo.sortBy, "updated");
  }
});

test("dataset records repository returns db not_found when the dataset is absent", () => {
  const result = listDatasetRecords("DST-MISSING", {}, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS),
    now: NOW,
  });

  assert.deepEqual(result, {
    source: "db",
    result: "not_found",
  });
});

test("dataset records repository falls back with db_path_missing when the DB file does not exist", () => {
  const result = listDatasetRecords("DST-104", { page: 2 }, {
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });
});

test("dataset records repository falls back with db_open_failed when opening the DB throws", () => {
  const result = listDatasetRecords("DST-104", { sortBy: "title" }, {
    resolvePath: () => "broken.sqlite",
    hasPath: () => true,
    openDatabase: () => {
      throw new Error("open failed");
    },
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_open_failed",
  });
});

test("dataset records repository falls back with db_query_failed when querying throws", () => {
  const result = listDatasetRecords("DST-104", { pageSize: 2 }, {
    resolvePath: () => "query.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(DATASET_ROWS, ALERT_ROWS, { throwOnQuery: true }),
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_query_failed",
  });
});
