import { NextRequest, NextResponse } from "next/server";
import { getDatasetsRoute } from "../../../../api/src/routes/datasets";
import type { DatasetListQuery } from "../../../../api/src/types";

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

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const query: DatasetListQuery = {
    q: searchParams.get("q") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    region: searchParams.get("region") ?? undefined,
    status: searchParams.get("status") ?? undefined,
    sortBy: searchParams.get("sortBy") ?? undefined,
    sortDir: searchParams.get("sortDir") ?? undefined,
    page: normalizeIntParam(searchParams.get("page")),
    pageSize: normalizeIntParam(searchParams.get("pageSize")),
  };

  const response = getDatasetsRoute.handler({ body: undefined, query });
  const telemetry = response.telemetry as
    | { source?: unknown; fallbackReason?: unknown }
    | undefined;

  return NextResponse.json(response.json, {
    status: response.status,
    headers: {
      "x-marine-data-source": toSourceHeader(telemetry?.source),
      "x-marine-fallback-reason": toFallbackHeader(telemetry?.fallbackReason),
    },
  });
}
