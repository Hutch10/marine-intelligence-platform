import { NextResponse } from "next/server";
import { getDatasetByIdRoute } from "../../../../../api/src/routes/datasets";

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
  const response = getDatasetByIdRoute.handler({ body: { id: datasetId } });
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
