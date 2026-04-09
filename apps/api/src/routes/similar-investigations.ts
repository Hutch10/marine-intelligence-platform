import type {
  SimilarInvestigationsResponse,
  SimilarInvestigationsTelemetry,
} from "@marine/shared";
import type { RouteDefinition, RouteRequest } from "../types";
import type { FindSimilarDependencies, FindSimilarResult } from "../vector/find-similar";

interface SimilarInvestigationsQuery {
  id?: string;
  k?: string;
  stationId?: string;
  windowDays?: string;
}

/**
 * Dynamically require find-similar at runtime to avoid pulling Node.js
 * fs/sqlite modules into the Next.js web bundle (same pattern used by
 * other API routes that access the database).
 */
function loadFindSimilar(
  investigationId: string,
  options: FindSimilarDependencies,
): FindSimilarResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const mod = runtimeRequire("../vector/find-similar") as {
      findSimilarInvestigations: (
        id: string,
        opts: FindSimilarDependencies,
      ) => FindSimilarResult;
    };
    return mod.findSimilarInvestigations(investigationId, options);
  } catch {
    return { source: "empty", fallbackReason: "query_failed" };
  }
}

export function buildSimilarInvestigationsRouteResponse(
  query: SimilarInvestigationsQuery,
  findFn: (
    id: string,
    options: FindSimilarDependencies,
  ) => FindSimilarResult = loadFindSimilar,
): {
  status: number;
  json: SimilarInvestigationsResponse;
  telemetry: SimilarInvestigationsTelemetry;
} {
  const investigationId = query.id?.trim() ?? "";
  const k = query.k ? Math.min(10, Math.max(1, parseInt(query.k, 10) || 5)) : 5;
  const stationId = query.stationId?.trim() || undefined;
  const windowDays = query.windowDays ? Math.min(3650, Math.max(1, parseInt(query.windowDays, 10) || 90)) : 90;
  const generatedAt = new Date().toISOString();

  if (!investigationId) {
    return {
      status: 200,
      json: { investigations: [], queryId: "", generatedAt },
      telemetry: {
        route: "GET /investigations/similar",
        queryId: "",
        resultCount: 0,
        fallbackReason: "not_indexed",
        rankingMode: "keyword",
      },
    };
  }

  const result = findFn(investigationId, { k, stationId, windowDays });

  if (result.source === "empty") {
    return {
      status: 200,
      json: { investigations: [], queryId: investigationId, generatedAt },
      telemetry: {
        route: "GET /investigations/similar",
        queryId: investigationId,
        resultCount: 0,
        fallbackReason: result.fallbackReason,
        rankingMode: "keyword",
      },
    };
  }

  return {
    status: 200,
    json: {
      investigations: result.investigations,
      queryId: investigationId,
      generatedAt,
    },
    telemetry: {
      route: "GET /investigations/similar",
      queryId: investigationId,
      resultCount: result.investigations.length,
      rankingMode: result.rankingMode,
      fallbackReason: result.rankingMode === "keyword" ? "keyword_fallback" : undefined,
    },
  };
}

export const getSimilarInvestigationsRoute: RouteDefinition<
  SimilarInvestigationsResponse,
  undefined,
  SimilarInvestigationsQuery
> = {
  method: "GET",
  path: "/investigations/similar",
  handler(request: RouteRequest<undefined, SimilarInvestigationsQuery>) {
    return buildSimilarInvestigationsRouteResponse(request.query ?? {});
  },
};
