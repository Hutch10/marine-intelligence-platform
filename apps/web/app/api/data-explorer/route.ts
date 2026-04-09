import { NextRequest, NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";
import type {
  DataExplorerDatasetFilters,
  DataExplorerDatasetSortBy,
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

function normalizeIntParam(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function normalizeSortBy(value: string | null): DataExplorerDatasetSortBy | undefined {
  return value === "name" || value === "updated" || value === "records" || value === "status"
    ? value
    : undefined;
}

function normalizeSortDir(value: string | null): DataExplorerSortDirection | undefined {
  return value === "asc" || value === "desc" ? value : undefined;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const query: DataExplorerDatasetFilters = {
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    region: searchParams.get("region") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    sortBy: normalizeSortBy(searchParams.get("sortBy")),
    sortDir: normalizeSortDir(searchParams.get("sortDir")),
    page: normalizeIntParam(searchParams.get("page")),
    pageSize: normalizeIntParam(searchParams.get("pageSize")),
  };

  const response = await apiClient.dataExplorer.getWorkspace(query);

  return NextResponse.json(response.data, {
    status: 200,
    headers: {
      "x-marine-data-source": toSourceHeader(response.meta.source),
      "x-marine-fallback-reason": toFallbackHeader(response.meta.fallbackReason),
    },
  });
}
