import type {
  DataExplorerDatasetRow,
  DataExplorerDatasetSortBy,
  DataExplorerPageInfo,
  DataExplorerRelatedRecord,
  DataExplorerRelatedRecordsPageInfo,
  DataExplorerRelatedRecordSortBy,
  DataExplorerSortDirection,
} from "@marine/shared";
import { dataExplorerWorkspaceData } from "../../../web/lib/api/mock-data";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { DatasetFallbackReason, DatasetListQuery, DatasetRecordsQuery } from "../types";

interface DatasetRecordRow {
  id: string;
  name: string;
  category: string;
  region: string | null;
  refreshed_at: string | null;
  record_count: number | null;
  status: DataExplorerDatasetRow["status"];
}

interface DatasetDetailRow extends DatasetRecordRow {
  metadata: string | null;
}

interface DatasetRelatedRecordRow {
  id: string;
  title: string;
  status: string;
  severity: string;
  detail: string | null;
  detected_at: string | null;
}

export interface DatasetListFilters {
  q?: string;
  category?: string;
  region?: string;
  status?: string;
}

export interface DatasetListOptions {
  filters: DatasetListFilters;
  sortBy: DataExplorerDatasetSortBy;
  sortDir: DataExplorerSortDirection;
  page: number;
  pageSize: number;
}

export interface DatasetRecordsListOptions {
  sortBy: DataExplorerRelatedRecordSortBy;
  sortDir: DataExplorerSortDirection;
  page: number;
  pageSize: number;
}

export type DatasetReadResult =
  | { source: "db"; datasets: DataExplorerDatasetRow[]; pageInfo: DataExplorerPageInfo }
  | { source: "mock"; fallbackReason: DatasetFallbackReason };

interface DatasetRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  now?: () => number;
}

export interface DatasetDetailRecord {
  id: string;
  name: string;
  category: string;
  region: string;
  updated: string;
  records: string;
  status: DataExplorerDatasetRow["status"];
  metadata: Record<string, unknown> | null;
}

export type DatasetDetailReadResult =
  | {
      source: "db";
      result: "found";
      dataset: DatasetDetailRecord;
      metadataSource: "db_full" | "db_partial";
    }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: DatasetFallbackReason };

export type DatasetRecordsReadResult =
  | {
      source: "db";
      result: "found" | "empty";
      records: DataExplorerRelatedRecord[];
      pageInfo: DataExplorerRelatedRecordsPageInfo;
    }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: DatasetFallbackReason };

const DEFAULT_METADATA = Object.fromEntries(
  dataExplorerWorkspaceData.metadata.map((item) => [item.label, item.value]),
) as Record<string, string>;

const CANONICAL_METADATA_KEYS = ["Source", "Coverage", "Cadence", "Schema", "Owner"] as const;
const DEFAULT_SORT_BY: DataExplorerDatasetSortBy = "updated";
const DEFAULT_SORT_DIR: DataExplorerSortDirection = "desc";
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 50;
const DEFAULT_RECORD_SORT_BY: DataExplorerRelatedRecordSortBy = "updated";
const DEFAULT_RECORD_PAGE_SIZE = 5;

function normalizeFilterValue(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized ? normalized : undefined;
}

function normalizeSortBy(value: DatasetListQuery["sortBy"]): DataExplorerDatasetSortBy {
  if (value === "name" || value === "records" || value === "status" || value === "updated") {
    return value;
  }

  return DEFAULT_SORT_BY;
}

function normalizeSortDir(value: DatasetListQuery["sortDir"]): DataExplorerSortDirection {
  if (value === "asc" || value === "desc") {
    return value;
  }

  return DEFAULT_SORT_DIR;
}

function normalizeRecordSortBy(
  value: DatasetRecordsQuery["sortBy"],
): DataExplorerRelatedRecordSortBy {
  if (value === "updated" || value === "status" || value === "title" || value === "type") {
    return value;
  }

  return DEFAULT_RECORD_SORT_BY;
}

function normalizePositiveInteger(value: DatasetListQuery["page"], fallback: number): number {
  const parsed = typeof value === "string" ? Number.parseInt(value, 10) : value;

  if (!parsed || Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

export function normalizeDatasetFilters(filters: DatasetListFilters = {}): DatasetListFilters {
  return {
    q: normalizeFilterValue(filters.q),
    category: normalizeFilterValue(filters.category),
    region: normalizeFilterValue(filters.region),
    status: normalizeFilterValue(filters.status),
  };
}

export function extractDatasetFilters(query: DatasetListQuery | undefined): DatasetListFilters {
  return normalizeDatasetFilters({
    q: query?.q,
    category: query?.category,
    region: query?.region,
    status: query?.status,
  });
}

export function extractDatasetListOptions(query: DatasetListQuery | undefined): DatasetListOptions {
  return {
    filters: extractDatasetFilters(query),
    sortBy: normalizeSortBy(query?.sortBy),
    sortDir: normalizeSortDir(query?.sortDir),
    page: normalizePositiveInteger(query?.page, DEFAULT_PAGE),
    pageSize: Math.min(
      normalizePositiveInteger(query?.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    ),
  };
}

export function extractDatasetRecordsListOptions(
  query: DatasetRecordsQuery | undefined,
): DatasetRecordsListOptions {
  return {
    sortBy: normalizeRecordSortBy(query?.sortBy),
    sortDir: normalizeSortDir(query?.sortDir),
    page: normalizePositiveInteger(query?.page, DEFAULT_PAGE),
    pageSize: Math.min(
      normalizePositiveInteger(query?.pageSize, DEFAULT_RECORD_PAGE_SIZE),
      MAX_PAGE_SIZE,
    ),
  };
}

export function hasDatasetFilters(filters: DatasetListFilters): boolean {
  return Boolean(filters.q || filters.category || filters.region || filters.status);
}

function formatRecordCount(value: number | null): string {
  if (!value || value <= 0) {
    return "0";
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(1)}K`;
  }

  return value.toString();
}

function formatRelativeUpdated(value: string | null, now = Date.now()): string {
  if (!value) {
    return "Unknown";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown";
  }

  const diffMs = now - timestamp.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function toDatasetRow(row: DatasetRecordRow, now: number): DataExplorerDatasetRow {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    region: row.region ?? "Unassigned",
    updated: formatRelativeUpdated(row.refreshed_at, now),
    records: formatRecordCount(row.record_count),
    status: row.status,
  };
}

function buildDatasetListQuery(options: DatasetListOptions) {
  const { filters, sortBy, sortDir, page, pageSize } = options;
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (filters.q) {
    conditions.push("(LOWER(d.name) LIKE ? OR LOWER(d.category) LIKE ?)");
    const searchValue = `%${filters.q}%`;
    params.push(searchValue, searchValue);
  }

  if (filters.category) {
    conditions.push("LOWER(d.category) = ?");
    params.push(filters.category);
  }

  if (filters.region) {
    conditions.push("LOWER(COALESCE(r.name, '')) = ?");
    params.push(filters.region);
  }

  if (filters.status) {
    conditions.push("LOWER(d.status) = ?");
    params.push(filters.status);
  }

  const sortSqlBy: Record<DataExplorerDatasetSortBy, string> = {
    updated: "COALESCE(d.refreshed_at, d.created_at)",
    name: "LOWER(d.name)",
    records: "COALESCE(d.record_count, 0)",
    status: "LOWER(d.status)",
  };
  const directionSql = sortDir === "asc" ? "ASC" : "DESC";
  const offset = (page - 1) * pageSize;
  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  return {
    countSql: `
      SELECT COUNT(*) AS total
      FROM datasets d
      LEFT JOIN regions r ON r.id = d.region_id
      ${whereClause}
    `,
    sql: `
      SELECT
        d.id,
        d.name,
        d.category,
        r.name AS region,
        d.refreshed_at,
        d.record_count,
        d.status
      FROM datasets d
      LEFT JOIN regions r ON r.id = d.region_id
      ${whereClause}
      ORDER BY ${sortSqlBy[sortBy]} ${directionSql}, LOWER(d.name) ASC
      LIMIT ? OFFSET ?
    `,
    params: [...params, pageSize, offset],
    countParams: params,
  };
}

function queryDatasetRows(
  db: SqliteDatabaseLike,
  options: DatasetListOptions,
  now: number,
): { datasets: DataExplorerDatasetRow[]; pageInfo: DataExplorerPageInfo } {
  const query = buildDatasetListQuery(options);
  const statement = db.prepare(query.sql);
  const rows = statement.all(...query.params) as DatasetRecordRow[];
  const countStatement = db.prepare(query.countSql);
  const countRow = countStatement.all(...query.countParams)[0] as { total: number } | undefined;
  const totalItems = countRow?.total ?? 0;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / options.pageSize);

  return {
    datasets: rows.map((row) => toDatasetRow(row, now)),
    pageInfo: {
      page: options.page,
      pageSize: options.pageSize,
      totalItems,
      totalPages,
      sortBy: options.sortBy,
      sortDir: options.sortDir,
    },
  };
}

function parseMetadataValue(rawMetadata: string | null): Record<string, unknown> {
  if (!rawMetadata) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawMetadata) as unknown;

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}

function resolveMetadataField(
  metadata: Record<string, unknown>,
  key: (typeof CANONICAL_METADATA_KEYS)[number],
): unknown {
  const aliasMap: Record<(typeof CANONICAL_METADATA_KEYS)[number], string[]> = {
    Source: ["source"],
    Coverage: ["coverage"],
    Cadence: ["cadence"],
    Schema: ["schema"],
    Owner: ["owner"],
  };

  if (metadata[key] !== undefined) {
    return metadata[key];
  }

  for (const alias of aliasMap[key]) {
    if (metadata[alias] !== undefined) {
      return metadata[alias];
    }
  }

  return undefined;
}

function buildDatasetMetadata(rawMetadata: string | null): {
  metadata: Record<string, unknown>;
  metadataSource: "db_full" | "db_partial";
} {
  const parsedMetadata = parseMetadataValue(rawMetadata);
  const metadata = { ...parsedMetadata } as Record<string, unknown>;
  let usedDefault = false;

  for (const key of CANONICAL_METADATA_KEYS) {
    const resolvedValue = resolveMetadataField(parsedMetadata, key);

    if (resolvedValue === undefined) {
      metadata[key] = DEFAULT_METADATA[key];
      usedDefault = true;
    } else {
      metadata[key] = resolvedValue;
    }
  }

  return {
    metadata,
    metadataSource: usedDefault ? "db_partial" : "db_full",
  };
}

function toDatasetRelatedRecord(
  row: DatasetRelatedRecordRow,
  now: number,
): DataExplorerRelatedRecord {
  return {
    id: row.id,
    title: row.title,
    type: "Alert",
    status: row.status,
    updated: formatRelativeUpdated(row.detected_at, now),
    summary: row.detail ?? `${row.severity} severity alert linked to the selected dataset.`,
  };
}

function buildDatasetRecordsQuery(
  datasetId: string,
  options: DatasetRecordsListOptions,
) {
  const sortSqlBy: Record<DataExplorerRelatedRecordSortBy, string> = {
    updated: "COALESCE(a.detected_at, a.updated_at, a.created_at)",
    status: "LOWER(a.status)",
    title: "LOWER(a.title)",
    type: "'alert'",
  };
  const directionSql = options.sortDir === "asc" ? "ASC" : "DESC";
  const offset = (options.page - 1) * options.pageSize;

  return {
    countSql: `
      SELECT COUNT(*) AS total
      FROM alerts a
      WHERE a.dataset_id = ?
    `,
    sql: `
      SELECT
        a.id,
        a.title,
        a.status,
        a.severity,
        a.detail,
        a.detected_at
      FROM alerts a
      WHERE a.dataset_id = ?
      ORDER BY ${sortSqlBy[options.sortBy]} ${directionSql}, LOWER(a.title) ASC
      LIMIT ? OFFSET ?
    `,
    countParams: [datasetId],
    params: [datasetId, options.pageSize, offset],
  };
}

export function filterMockDatasets(
  datasets: DataExplorerDatasetRow[],
  filters: DatasetListFilters,
): DataExplorerDatasetRow[] {
  const normalizedFilters = normalizeDatasetFilters(filters);

  return datasets.filter((dataset) => {
    const name = dataset.name.toLowerCase();
    const category = dataset.category.toLowerCase();
    const region = dataset.region.toLowerCase();
    const status = dataset.status.toLowerCase();

    if (
      normalizedFilters.q &&
      !name.includes(normalizedFilters.q) &&
      !category.includes(normalizedFilters.q)
    ) {
      return false;
    }

    if (normalizedFilters.category && category !== normalizedFilters.category) {
      return false;
    }

    if (normalizedFilters.region && region !== normalizedFilters.region) {
      return false;
    }

    if (normalizedFilters.status && status !== normalizedFilters.status) {
      return false;
    }

    return true;
  });
}

function sortMockDatasets(
  datasets: DataExplorerDatasetRow[],
  sortBy: DataExplorerDatasetSortBy,
  sortDir: DataExplorerSortDirection,
): DataExplorerDatasetRow[] {
  const direction = sortDir === "asc" ? 1 : -1;

  return [...datasets].sort((left, right) => {
    let comparison = 0;

    if (sortBy === "name") {
      comparison = left.name.localeCompare(right.name);
    } else if (sortBy === "status") {
      comparison = left.status.localeCompare(right.status);
    } else if (sortBy === "records") {
      const parseRecords = (value: string) =>
        value.endsWith("M")
          ? Number.parseFloat(value) * 1_000_000
          : value.endsWith("K")
            ? Number.parseFloat(value) * 1_000
            : Number.parseFloat(value);
      comparison = parseRecords(left.records) - parseRecords(right.records);
    } else {
      const rankUpdated = (value: string) => {
        if (value === "Unknown") {
          return Number.POSITIVE_INFINITY;
        }
        const [amountString] = value.split(" ");
        const amount = Number.parseInt(amountString, 10) || 0;
        if (value.includes("min")) {
          return amount;
        }
        if (value.includes("hr")) {
          return amount * 60;
        }
        if (value.includes("day")) {
          return amount * 60 * 24;
        }
        return 0;
      };
      comparison = rankUpdated(left.updated) - rankUpdated(right.updated);
      comparison *= -1;
    }

    if (comparison === 0) {
      comparison = left.name.localeCompare(right.name);
    }

    return comparison * direction;
  });
}

export function queryMockDatasets(
  datasets: DataExplorerDatasetRow[],
  options: DatasetListOptions,
): { datasets: DataExplorerDatasetRow[]; pageInfo: DataExplorerPageInfo } {
  const filtered = filterMockDatasets(datasets, options.filters);
  const sorted = sortMockDatasets(filtered, options.sortBy, options.sortDir);
  const totalItems = sorted.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / options.pageSize);
  const offset = (options.page - 1) * options.pageSize;

  return {
    datasets: sorted.slice(offset, offset + options.pageSize),
    pageInfo: {
      page: options.page,
      pageSize: options.pageSize,
      totalItems,
      totalPages,
      sortBy: options.sortBy,
      sortDir: options.sortDir,
    },
  };
}

function sortMockDatasetRecords(
  records: DataExplorerRelatedRecord[],
  sortBy: DataExplorerRelatedRecordSortBy,
  sortDir: DataExplorerSortDirection,
): DataExplorerRelatedRecord[] {
  const direction = sortDir === "asc" ? 1 : -1;

  return [...records].sort((left, right) => {
    let comparison = 0;

    if (sortBy === "status") {
      comparison = left.status.localeCompare(right.status);
    } else if (sortBy === "title") {
      comparison = left.title.localeCompare(right.title);
    } else if (sortBy === "type") {
      comparison = left.type.localeCompare(right.type);
    } else {
      const rankUpdated = (value: string) => {
        if (value === "Unknown") {
          return Number.POSITIVE_INFINITY;
        }
        const [amountString] = value.split(" ");
        const amount = Number.parseInt(amountString, 10) || 0;
        if (value.includes("min")) return amount;
        if (value.includes("hr")) return amount * 60;
        if (value.includes("day")) return amount * 60 * 24;
        return 0;
      };

      comparison = rankUpdated(left.updated) - rankUpdated(right.updated);
      comparison *= -1;
    }

    if (comparison === 0) {
      comparison = left.title.localeCompare(right.title);
    }

    return comparison * direction;
  });
}

export function queryMockDatasetRecords(
  records: DataExplorerRelatedRecord[],
  options: DatasetRecordsListOptions,
): { records: DataExplorerRelatedRecord[]; pageInfo: DataExplorerRelatedRecordsPageInfo } {
  const sorted = sortMockDatasetRecords(records, options.sortBy, options.sortDir);
  const totalItems = sorted.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / options.pageSize);
  const offset = (options.page - 1) * options.pageSize;

  return {
    records: sorted.slice(offset, offset + options.pageSize),
    pageInfo: {
      page: options.page,
      pageSize: options.pageSize,
      totalItems,
      totalPages,
      sortBy: options.sortBy,
      sortDir: options.sortDir,
    },
  };
}

export function listDatasets(
  query: DatasetListQuery = {},
  dependencies: DatasetRepositoryDependencies = {},
): DatasetReadResult {
  const options = extractDatasetListOptions(query);
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return {
      source: "mock",
      fallbackReason: "db_path_missing",
    };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_open_failed",
    };
  }

  try {
    const result = queryDatasetRows(db, options, now());
    return {
      source: "db",
      datasets: result.datasets,
      pageInfo: result.pageInfo,
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
    };
  } finally {
    db.close();
  }
}

export function getDatasetRows(
  dependencies: DatasetRepositoryDependencies = {},
): DatasetReadResult {
  return listDatasets(undefined, dependencies);
}

export function getDatasetById(
  datasetId: string,
  dependencies: DatasetRepositoryDependencies = {},
): DatasetDetailReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return {
      source: "mock",
      fallbackReason: "db_path_missing",
    };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_open_failed",
    };
  }

  try {
    const statement = db.prepare(`
      SELECT
        d.id,
        d.name,
        d.category,
        r.name AS region,
        d.refreshed_at,
        d.record_count,
        d.status,
        d.metadata
      FROM datasets d
      LEFT JOIN regions r ON r.id = d.region_id
      WHERE d.id = ?
      LIMIT 1
    `);

    const row = statement.all(datasetId)[0] as DatasetDetailRow | undefined;

    if (!row) {
      return {
        source: "db",
        result: "not_found",
      };
    }

    const { metadata, metadataSource } = buildDatasetMetadata(row.metadata);

    return {
      source: "db",
      result: "found",
      metadataSource,
      dataset: {
        id: row.id,
        name: row.name,
        category: row.category,
        region: row.region ?? "Unassigned",
        updated: formatRelativeUpdated(row.refreshed_at, now()),
        records: formatRecordCount(row.record_count),
        status: row.status,
        metadata,
      },
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
    };
  } finally {
    db.close();
  }
}

export function listDatasetRecords(
  datasetId: string,
  query: DatasetRecordsQuery = {},
  dependencies: DatasetRepositoryDependencies = {},
): DatasetRecordsReadResult {
  const options = extractDatasetRecordsListOptions(query);
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return {
      source: "mock",
      fallbackReason: "db_path_missing",
    };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_open_failed",
    };
  }

  try {
    const datasetStatement = db.prepare(`
      SELECT d.id
      FROM datasets d
      WHERE d.id = ?
      LIMIT 1
    `);

    const datasetRow = datasetStatement.all(datasetId)[0] as { id: string } | undefined;

    if (!datasetRow) {
      return {
        source: "db",
        result: "not_found",
      };
    }

    const recordsQuery = buildDatasetRecordsQuery(datasetId, options);
    const recordStatement = db.prepare(recordsQuery.sql);
    const countStatement = db.prepare(recordsQuery.countSql);
    const rows = recordStatement.all(...recordsQuery.params) as DatasetRelatedRecordRow[];
    const countRow = countStatement.all(...recordsQuery.countParams)[0] as { total: number } | undefined;
    const totalItems = countRow?.total ?? 0;
    const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / options.pageSize);
    const records = rows.map((row) => toDatasetRelatedRecord(row, now()));

    return {
      source: "db",
      result: records.length > 0 ? "found" : "empty",
      records,
      pageInfo: {
        page: options.page,
        pageSize: options.pageSize,
        totalItems,
        totalPages,
        sortBy: options.sortBy,
        sortDir: options.sortDir,
      },
    };
  } catch {
    return {
      source: "mock",
      fallbackReason: "db_query_failed",
    };
  } finally {
    db.close();
  }
}
