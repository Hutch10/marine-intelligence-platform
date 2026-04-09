import { NextResponse } from "next/server";
import { apiClient } from "@/lib/api/client";

function toSourceHeader(value: unknown): string {
  return value === "db" || value === "mock" ? value : "mock";
}

function toFallbackHeader(value: unknown): string {
  return value === "db_path_missing" || value === "db_open_failed" || value === "db_query_failed"
    ? value
    : "";
}

interface DatasetRouteContext {
  params: {
    id: string;
  };
}

export async function GET(_request: Request, context: DatasetRouteContext) {
  const datasetId = context.params.id;
  const response = await apiClient.dataExplorer.getDatasetDetail(datasetId);

  return NextResponse.json(response.data ?? { message: "Dataset not found" }, {
    status: response.meta.state === "not_found" ? 404 : 200,
    headers: {
      "x-marine-data-source": toSourceHeader(response.meta.source),
      "x-marine-fallback-reason": toFallbackHeader(response.meta.fallbackReason),
    },
  });
}
