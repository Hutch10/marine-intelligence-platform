import { apiMockData } from "../data";
import type {
  InvestigationsResponse,
  InvestigationsTelemetry,
  RouteDefinition,
} from "../types";
import type {
  InvestigationAnalysisTrack,
  InvestigationSpeciesSummary,
} from "@marine/shared";
import { SystemIntegrityStatus } from "@marine/shared";

type InvestigationsReadResult =
  | { source: "db"; analysisTracks: InvestigationAnalysisTrack[] }
  | { source: "mock"; fallbackReason: InvestigationsTelemetry["fallbackReason"] };

type InvestigationSpeciesSummaryReadResult =
  | { source: "db"; result: "found"; summary: InvestigationSpeciesSummary }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: "db_path_missing" | "db_open_failed" | "db_query_failed" };

async function readDatabaseInvestigations(): Promise<InvestigationsReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/investigations") as {
      listInvestigations: () => Promise<InvestigationsReadResult>;
    };

    return await repository.listInvestigations();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readInvestigationSpeciesSummary(
  investigationId: string,
): Promise<InvestigationSpeciesSummaryReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/species") as {
      getInvestigationSpeciesSummary: (investigationId: string) => Promise<InvestigationSpeciesSummaryReadResult>;
    };

    return await repository.getInvestigationSpeciesSummary(investigationId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export async function buildInvestigationsRouteResponse(
  readResult?: InvestigationsReadResult,
  speciesSummaryResult?: InvestigationSpeciesSummaryReadResult,
): Promise<{ status: number; json: InvestigationsResponse; telemetry: InvestigationsTelemetry }> {
  const actualReadResult = readResult ?? await readDatabaseInvestigations();
  
  const analysisTracks =
    actualReadResult.source === "db"
      ? actualReadResult.analysisTracks
      : apiMockData.investigationsWorkspaceData.analysisTracks;

  const activeInvestigationId = analysisTracks[0]?.id;
  const resolvedSpeciesSummaryResult =
    speciesSummaryResult ?? (activeInvestigationId ? await readInvestigationSpeciesSummary(activeInvestigationId) : undefined);
  
  const speciesSummary =
    actualReadResult.source === "mock"
      ? apiMockData.investigationsWorkspaceData.speciesSummary
      : resolvedSpeciesSummaryResult?.source === "db" && resolvedSpeciesSummaryResult.result === "found"
        ? resolvedSpeciesSummaryResult.summary
        : null;

  const telemetry: InvestigationsTelemetry = {
    route: "GET /investigations",
    source: actualReadResult.source,
    trackCount: analysisTracks.length,
    fallbackReason: actualReadResult.source === "mock" ? actualReadResult.fallbackReason : undefined,
  };

  // Always preserve mock workspace fields alongside DB tracks
  const mockWorkspace = apiMockData.investigationsWorkspaceData;
  return {
    status: 200,
    json: {
      workspace: {
        ...mockWorkspace,
        analysisTracks,
        timeline: [],
        speciesSummary,
        filterGroups: mockWorkspace.filterGroups,
        signalMetrics: mockWorkspace.signalMetrics,
        hypothesisLog: mockWorkspace.hypothesisLog,
        evidenceItems: mockWorkspace.evidenceItems,
      },
      systemIntegrity:
        actualReadResult.source === "db"
          ? SystemIntegrityStatus.NORMAL
          : SystemIntegrityStatus.DEGRADED,
    },
    telemetry,
  };
}

export const getInvestigationsRoute: RouteDefinition<InvestigationsResponse> = {
  method: "GET",
  path: "/investigations",
  async handler() {
    return await buildInvestigationsRouteResponse();
  },
};
