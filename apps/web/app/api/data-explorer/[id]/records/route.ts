import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import type {
  DataExplorerRelatedRecordSortBy,
  DataExplorerRelatedRecordsQuery,
  DataExplorerSortDirection,
} from "@/lib/api/types";

function toSourceHeader(value: unknown): string {
  return value === "db" || value === "mock" ? value : "mock";
}

function toFallbackHeader(value: unknown): string {
  return value === "db_path_missing" || value === "db_open_failed" || value === "db_query_failed"
    ? value
    : "";
}

interface DatasetRecordsRouteContext {
  params: {
    id: string;
  };
}

function normalizeIntParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeSortBy(value: string | null): DataExplorerRelatedRecordSortBy | undefined {
  return value === "title" || value === "type" || value === "status" || value === "updated"
    ? value
    : undefined;
}

function normalizeSortDir(value: string | null): DataExplorerSortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export async function GET(request: NextRequest, context: DatasetRecordsRouteContext) {
  const searchParams = request.nextUrl.searchParams;
  const query: DataExplorerRelatedRecordsQuery = {
    sortBy: normalizeSortBy(searchParams.get("sortBy")),
    sortDir: normalizeSortDir(searchParams.get("sortDir")),
    page: normalizeIntParam(searchParams.get("page")),
    pageSize: normalizeIntParam(searchParams.get("pageSize")),
  };

  const datasetId = context.params.id;
  const response = await apiClient.dataExplorer.getDatasetRecords(datasetId, query);

  return NextResponse.json(response.data ?? { message: "Dataset not found" }, {
    status: response.meta.state === "not_found" ? 404 : 200,
    headers: {
      "x-marine-data-source": toSourceHeader(response.meta.source),
      "x-marine-fallback-reason": toFallbackHeader(response.meta.fallbackReason),
    },
  });
}
