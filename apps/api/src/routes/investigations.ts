import { apiMockData } from "../data";
import type {
  InvestigationsResponse,
  InvestigationsTelemetry,
  RouteDefinition,
} from "../types";
import type {
  InvestigationAnalysisTrack,
  InvestigationSpeciesSummary,
} from "../../../web/lib/api/types";

type InvestigationsReadResult =
  | { source: "db"; analysisTracks: InvestigationAnalysisTrack[] }
  | { source: "mock"; fallbackReason: InvestigationsTelemetry["fallbackReason"] };

type InvestigationSpeciesSummaryReadResult =
  | { source: "db"; result: "found"; summary: InvestigationSpeciesSummary }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

function readDatabaseInvestigations(): InvestigationsReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/investigations") as {
      listInvestigations: () => InvestigationsReadResult;
    };

    return repository.listInvestigations();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function readInvestigationSpeciesSummary(
  investigationId: string,
): InvestigationSpeciesSummaryReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/species") as {
      getInvestigationSpeciesSummary: (investigationId: string) => InvestigationSpeciesSummaryReadResult;
    };

    return repository.getInvestigationSpeciesSummary(investigationId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export function buildInvestigationsRouteResponse(
  readResult = readDatabaseInvestigations(),
  speciesSummaryResult?: InvestigationSpeciesSummaryReadResult,
): { status: number; json: InvestigationsResponse; telemetry: InvestigationsTelemetry } {
  const analysisTracks =
    readResult.source === "db"
      ? readResult.analysisTracks
      : apiMockData.investigationsWorkspaceData.analysisTracks;
  const activeInvestigationId = analysisTracks[0]?.id;
  const resolvedSpeciesSummaryResult =
    speciesSummaryResult ?? (activeInvestigationId ? readInvestigationSpeciesSummary(activeInvestigationId) : undefined);
  const speciesSummary =
    readResult.source === "mock"
      ? apiMockData.investigationsWorkspaceData.speciesSummary
      : resolvedSpeciesSummaryResult?.source === "db" && resolvedSpeciesSummaryResult.result === "found"
        ? resolvedSpeciesSummaryResult.summary
        : null;

  const telemetry: InvestigationsTelemetry = {
    route: "GET /investigations",
    source: readResult.source,
    trackCount: analysisTracks.length,
    fallbackReason: readResult.source === "mock" ? readResult.fallbackReason : undefined,
  };

  return {
    status: 200,
    json: {
      workspace: {
        ...apiMockData.investigationsWorkspaceData,
        analysisTracks,
        timeline: [],
        speciesSummary,
      },
    },
    telemetry,
  };
}

export const getInvestigationsRoute: RouteDefinition<InvestigationsResponse> = {
  method: "GET",
  path: "/investigations",
  handler() {
    return buildInvestigationsRouteResponse();
  },
};
