import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import RegionRiskPage from "@/app/v1/regions/[regionId]/risk/page";

const { mockMarineIntelligence } = vi.hoisted(() => ({
  mockMarineIntelligence: {
    getRegionRiskAssessment: vi.fn(),
    getRegionRecentAnomalyEvidence: vi.fn(),
    formatSurfaceStatusLine: vi.fn(),
  },
}));

vi.mock("@/lib/marine-intelligence", () => ({
  getRegionRiskAssessment: mockMarineIntelligence.getRegionRiskAssessment,
  getRegionRecentAnomalyEvidence: mockMarineIntelligence.getRegionRecentAnomalyEvidence,
  formatSurfaceStatusLine: mockMarineIntelligence.formatSurfaceStatusLine,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  mockMarineIntelligence.getRegionRiskAssessment.mockReset();
  mockMarineIntelligence.getRegionRecentAnomalyEvidence.mockReset();
  mockMarineIntelligence.formatSurfaceStatusLine.mockReset();
  mockMarineIntelligence.getRegionRiskAssessment.mockReturnValue({
    ok: true,
    status: 200,
    message: null,
    data: {
      regionId: "southeast-florida",
      regionName: "Southeast Florida",
      evaluatedAt: "2026-03-25T18:00:00.000Z",
      riskLevel: "high",
      summary: "Regional warming remains elevated.",
      dominantDrivers: ["surface warming", "higher seas"],
      topStations: [{ stationId: "41009", riskLevel: "high" }],
      coverage: {
        configuredStations: 6,
        analyzedStations: 4,
        healthyStations: 2,
        minimumHealthyStations: 3,
      },
      confidence: {
        score: 0.82,
        quality: "high",
      },
      provenance: {
        source: "live",
        label: "Live API-backed",
        detail: "Public v1 regional risk endpoint.",
        fallbackReason: null,
        updatedAt: "2026-03-25T18:00:00.000Z",
        freshnessLabel: "1h old",
        isStale: false,
      },
      coverageWarning: "Coverage is weak: 2 healthy stations are available, below the minimum 3.",
    },
  });
  mockMarineIntelligence.getRegionRecentAnomalyEvidence.mockReturnValue({
    state: "available",
    windowDays: 14,
    summaryLine: "2 anomalies detected in past 48 hours",
    exportHref: "data:text/csv;charset=utf-8,test",
    exportFileName: "region-southeast-florida-recent-anomalies.csv",
    anomalies: [
      {
        id: "SIG-41009-1",
        stationId: "41009",
        detectedAt: "2026-03-25T16:00:00.000Z",
        detectedAtLabel: "2026-03-25 16:00 UTC",
        signalType: "thermal_anomaly",
        signalTypeLabel: "Thermal Anomaly",
        severity: "high",
        deviation: "Baseline anomaly at 41009: seaSurfaceTempC z=2.70",
        description: "Sea surface temperature deviated from the station baseline.",
        evidenceSummary: "Backed by 1 recent observation for station 41009 and source record risk-score-41009.",
      },
    ],
  });
  mockMarineIntelligence.formatSurfaceStatusLine.mockImplementation((status) => status.detail);
});

test("region risk page renders provenance, weak-coverage warnings, and aggregated recent anomalies", async () => {
  const page = await RegionRiskPage({ params: { regionId: "southeast-florida" } });
  render(page);

  expect(screen.getByText("Southeast Florida")).toBeInTheDocument();
  expect(screen.getByText("Regional warming remains elevated.")).toBeInTheDocument();
  expect(screen.getByText("Public v1 regional risk endpoint.")).toBeInTheDocument();
  expect(screen.getByText("Coverage is weak: 2 healthy stations are available, below the minimum 3.")).toBeInTheDocument();
  expect(screen.getByText("surface warming")).toBeInTheDocument();
  expect(screen.getByText("41009")).toBeInTheDocument();
  expect(screen.getByText("Recent anomalies")).toBeInTheDocument();
  expect(screen.getByText("2 anomalies detected in past 48 hours")).toBeInTheDocument();
  expect(screen.getByText("Thermal Anomaly")).toBeInTheDocument();
  expect(screen.getByText("Sea surface temperature deviated from the station baseline.")).toBeInTheDocument();
  expect(screen.getByText("Elevated temperature — potential thermal stress")).toBeInTheDocument();
  expect(screen.getByText("Temperature anomaly detected")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute("download", "region-southeast-florida-recent-anomalies.csv");
});

test("region risk page renders no-anomaly state honestly", async () => {
  mockMarineIntelligence.getRegionRecentAnomalyEvidence.mockReturnValueOnce({
    state: "available",
    windowDays: 14,
    summaryLine: "No anomalies in past 14 days",
    exportHref: null,
    exportFileName: null,
    anomalies: [],
  });

  const page = await RegionRiskPage({ params: { regionId: "southeast-florida" } });
  render(page);

  expect(screen.getByText("No recent anomalies detected")).toBeInTheDocument();
});

test("region risk page renders unavailable anomaly history honestly", async () => {
  mockMarineIntelligence.getRegionRecentAnomalyEvidence.mockReturnValueOnce({
    state: "unavailable",
    windowDays: 14,
    summaryLine: "Recent anomaly history unavailable",
    exportHref: null,
    exportFileName: null,
    anomalies: [],
  });

  const page = await RegionRiskPage({ params: { regionId: "southeast-florida" } });
  render(page);

  expect(screen.getAllByText("Recent anomaly history unavailable").length).toBeGreaterThan(0);
});

test("region risk page renders anomaly station ID as a link to canonical station risk route", async () => {
  const page = await RegionRiskPage({ params: { regionId: "southeast-florida" } });
  render(page);

  // The station badge in the recent anomalies section must be a real link, not plain text.
  // This ensures displayed station IDs are never dead references.
  const stationLink = screen.getByRole("link", { name: /station 41009/i });
  expect(stationLink).toBeInTheDocument();
  expect(stationLink).toHaveAttribute("href", "/v1/risk/41009");
});

test("region risk page top-station cards link to canonical station risk route", async () => {
  const page = await RegionRiskPage({ params: { regionId: "southeast-florida" } });
  render(page);

  // Top contributing stations must also be navigable — same canonical route.
  // The link wraps both the station ID and the risk badge, so match by partial name.
  const stationLinks = screen.getAllByRole("link", { name: /41009/ });
  expect(stationLinks.length).toBeGreaterThan(0);
  for (const link of stationLinks) {
    expect(link).toHaveAttribute("href", "/v1/risk/41009");
  }
});

test("region risk page shows an honest error state when data is unavailable", async () => {
  mockMarineIntelligence.getRegionRiskAssessment.mockReturnValueOnce({
    ok: false,
    status: 404,
    data: null,
    message: "Unknown region",
  });

  const page = await RegionRiskPage({ params: { regionId: "missing" } });
  render(page);

  expect(screen.getByText("Regional risk unavailable")).toBeInTheDocument();
  expect(screen.getByText("Unknown region")).toBeInTheDocument();
});
