import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import InvestigationsPage from "@/app/investigations/page";
import type { InvestigationsWorkspaceData } from "@/lib/api/types";

const WORKSPACE: InvestigationsWorkspaceData = {
  filterGroups: [],
  signalMetrics: [],
  analysisTracks: [
    {
      id: "TRK-201",
      title: "Surface temperature acceleration",
      summary: "Elevated SST continues to widen eastward.",
      confidence: 86,
      state: "Escalated",
    },
  ],
  hypothesisLog: [],
  evidenceItems: [],
  timeline: [],
  speciesSummary: {
    investigationId: "TRK-201",
    generatedAt: "2026-03-17T12:00:00.000Z",
    speciesCount: 1,
    linkedMovementSignalCount: 1,
    verifiedSightingCount: 1,
    pendingVerificationCount: 0,
    entries: [
      {
        speciesId: "SP-BLUE-WHALE",
        commonName: "Blue Whale",
        scientificName: "Balaenoptera musculus",
        movementSignalCount: 1,
        verifiedSightingCount: 1,
        pendingVerificationCount: 0,
        matchedStationCount: 1,
        lastObservedAt: "2026-03-13T11:04:00.000Z",
        maxMovementConfidence: 84,
        relevanceScore: 75,
        responseTier: "priority",
        reasonTrail: [],
      },
    ],
    explainabilityNote: "deterministic",
  },
};

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    investigations: {
      getWorkspace: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/investigations/investigation-workspace", () => ({
  InvestigationWorkspace: ({ data }: { data: InvestigationsWorkspaceData }) => (
    <div data-testid="investigation-workspace">
      {data.analysisTracks[0]?.id}:{data.speciesSummary?.speciesCount ?? 0}
    </div>
  ),
}));

beforeEach(() => {
  mockApiClient.investigations.getWorkspace.mockReset();
  mockApiClient.investigations.getWorkspace.mockResolvedValue(WORKSPACE);
});

test("investigations page loads workspace with species summary", async () => {
  const page = await InvestigationsPage();
  render(page);

  expect(mockApiClient.investigations.getWorkspace).toHaveBeenCalled();
  expect(screen.getByTestId("investigation-workspace")).toHaveTextContent("TRK-201:1");
});
