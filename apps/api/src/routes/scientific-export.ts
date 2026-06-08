import type { RouteDefinition } from "../types";
import {
  buildScientificExport,
  scientificExportToCsv,
  type ScientificExportRow,
} from "../services/scientific-export";

interface ScientificExportQuery {
  stationId?: string;
  limit?: string;
  format?: string;
}

interface ScientificExportResponse {
  source: "db" | "unavailable";
  rows: ScientificExportRow[];
}

export async function buildScientificExportRouteResponse(query: ScientificExportQuery = {}): Promise<{
  status: number;
  json?: ScientificExportResponse;
  text?: string;
  headers?: Record<string, string>;
}> {
  const limit = query.limit ? Number(query.limit) : 200;
  const exportResult = await buildScientificExport({
    stationId: query.stationId,
    limit: Number.isFinite(limit) ? limit : 200,
  });

  if (query.format === "csv") {
    return {
      status: 200,
      text: scientificExportToCsv(exportResult.rows),
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": "attachment; filename=scientific-observations-export.csv",
      },
    };
  }

  return {
    status: exportResult.source === "db" ? 200 : 503,
    json: exportResult,
  };
}

export const getScientificExportRoute: RouteDefinition<ScientificExportResponse, undefined, ScientificExportQuery> = {
  method: "GET",
  path: "/internal/scientific/export",
  async handler({ query }) {
    const result = await buildScientificExportRouteResponse(query ?? {});
    if (result.text) {
      return {
        status: result.status,
        text: result.text,
        headers: result.headers,
        json: { source: "db", rows: [] },
      };
    }

    return {
      status: result.status,
      json: result.json ?? { source: "unavailable", rows: [] },
    };
  },
};
