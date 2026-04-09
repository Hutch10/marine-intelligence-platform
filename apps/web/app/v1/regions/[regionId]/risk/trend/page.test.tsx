import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import RegionRiskTrendPage from "@/app/v1/regions/[regionId]/risk/trend/page";

const { mockMarineIntelligence } = vi.hoisted(() => ({
  mockMarineIntelligence: {
    getRegionRiskTrend: vi.fn(),
    formatSurfaceStatusLine: vi.fn(),
  },
}));

vi.mock("@/lib/marine-intelligence", () => ({
  getRegionRiskTrend: mockMarineIntelligence.getRegionRiskTrend,
  formatSurfaceStatusLine: mockMarineIntelligence.formatSurfaceStatusLine,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  mockMarineIntelligence.getRegionRiskTrend.mockReset();
  mockMarineIntelligence.formatSurfaceStatusLine.mockReset();
  mockMarineIntelligence.getRegionRiskTrend.mockReturnValue({
    ok: true,
    status: 200,
    message: null,
    data: {
      regionId: "southeast-florida",
      regionName: "Southeast Florida",
      evaluatedAt: "2026-03-25T18:00:00.000Z",
      currentRisk: {
        riskLevel: "high",
        confidenceScore: 0.81,
      },
      trend: {
        direction: "rising",
        strength: "moderate",
        deltaScore: 0.18,
        persistence: 0.66,
      },
      forecast: {
        next12h: {
          riskLevel: "high",
          confidence: 0.84,
        },
        next24h: {
          riskLevel: "critical",
          confidence: 0.79,
        },
      },
      summary: "Regional risk is trending upward with strong corroboration.",
      provenance: {
        source: "live",
        label: "Live API-backed",
        detail: "Public v1 regional trend endpoint.",
        fallbackReason: null,
        updatedAt: "2026-03-25T18:00:00.000Z",
        freshnessLabel: "1h old",
        isStale: false,
      },
      forecastMethod: "Forecasts on this page are rule-based projections from regional score change, corroboration, CRW support, and coverage quality. They are not observed conditions.",
      coverageWarning: "Coverage is weak: 2 healthy stations are available, below the minimum 3.",
    },
  });
  mockMarineIntelligence.formatSurfaceStatusLine.mockImplementation((status) => status.detail);
});

test("region trend page renders forecast caveats and coverage warnings", async () => {
  const page = await RegionRiskTrendPage({ params: { regionId: "southeast-florida" } });
  render(page);

  expect(screen.getByText("Southeast Florida")).toBeInTheDocument();
  expect(screen.getByText("Regional risk is trending upward with strong corroboration.")).toBeInTheDocument();
  expect(screen.getByText("Public v1 regional trend endpoint.")).toBeInTheDocument();
  expect(screen.getByText(/rule-based projections/i)).toBeInTheDocument();
  expect(screen.getByText("Coverage is weak: 2 healthy stations are available, below the minimum 3.")).toBeInTheDocument();
  expect(screen.getByText(/Projected outlook · 12h/i)).toBeInTheDocument();
  expect(screen.getByText("critical")).toBeInTheDocument();
});

test("region trend page shows an honest error state when trend data is unavailable", async () => {
  mockMarineIntelligence.getRegionRiskTrend.mockReturnValueOnce({
    ok: false,
    status: 503,
    data: null,
    message: "Regional trend is unavailable.",
  });

  const page = await RegionRiskTrendPage({ params: { regionId: "missing" } });
  render(page);

  expect(screen.getByText("Regional trend unavailable")).toBeInTheDocument();
  expect(screen.getByText("Regional trend is unavailable.")).toBeInTheDocument();
});
