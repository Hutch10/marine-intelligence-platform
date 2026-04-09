import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import StationRiskPage from "@/app/v1/risk/[stationId]/page";

const { mockMarineIntelligence } = vi.hoisted(() => ({
  mockMarineIntelligence: {
    getStationRiskAssessment: vi.fn(),
    getStationRecentAnomalyEvidence: vi.fn(),
    getMarineRegionForStation: vi.fn(),
    formatSurfaceStatusLine: vi.fn(),
  },
}));

vi.mock("@/lib/marine-intelligence", () => ({
  getStationRiskAssessment: mockMarineIntelligence.getStationRiskAssessment,
  getStationRecentAnomalyEvidence: mockMarineIntelligence.getStationRecentAnomalyEvidence,
  getMarineRegionForStation: mockMarineIntelligence.getMarineRegionForStation,
  formatSurfaceStatusLine: mockMarineIntelligence.formatSurfaceStatusLine,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  mockMarineIntelligence.getStationRiskAssessment.mockReset();
  mockMarineIntelligence.getStationRecentAnomalyEvidence.mockReset();
  mockMarineIntelligence.getMarineRegionForStation.mockReset();
  mockMarineIntelligence.formatSurfaceStatusLine.mockReset();

  mockMarineIntelligence.getStationRiskAssessment.mockReturnValue({
    ok: true,
    status: 200,
    message: null,
    data: {
      stationId: "41009",
      evaluatedAt: "2026-03-25T18:00:00.000Z",
      riskLevel: "high",
      summary: "Elevated warming and wave activity are active.",
      conditions: {
        observedAt: "2026-03-25T12:00:00.000Z",
        seaSurfaceTemperatureC: 28.4,
        waveHeightM: 2.1,
        windSpeedMps: 6.5,
        pressureHpa: 1012.8,
      },
      alerts: [],
      signals: [
        {
          metric: "sea_surface_temperature",
          unit: "°C",
          currentValue: 28.4,
          anomalyScore: 2.7,
          direction: "above_normal",
        },
      ],
      baselineCoverage: {
        score: 0.78,
        quality: "high",
        historicalDataPoints: 18,
        coverageNote: "Reflects how many historical data points are available for this station.",
      },
      provenance: {
        source: "live",
        label: "Live API-backed",
        detail: "Public v1 station risk endpoint.",
        fallbackReason: null,
        updatedAt: "2026-03-25T18:00:00.000Z",
        freshnessLabel: "6h old",
        isStale: false,
      },
      freshness: {
        observedAgeHours: 6,
        evaluatedAgeHours: 0.5,
        stale: true,
        label: "Latest observation is 6h old. Treat this station as stale until a newer reading arrives.",
      },
      dataQuality: {
        missingMetrics: ["Wave height"],
        warning: "Wave height is missing from the latest observation.",
        actionability: "Review the active threshold alerts first, then inspect the per-metric anomaly breakdown before escalating.",
      },
    },
  });
  mockMarineIntelligence.getStationRecentAnomalyEvidence.mockReturnValue({
    state: "available",
    windowDays: 14,
    summaryLine: "1 anomaly detected in past 48 hours",
    exportHref: "data:text/csv;charset=utf-8,test",
    exportFileName: "station-41009-recent-anomalies.csv",
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
  mockMarineIntelligence.getMarineRegionForStation.mockReturnValue({
    id: "southeast-florida",
    name: "Southeast Florida",
  });
  mockMarineIntelligence.formatSurfaceStatusLine.mockImplementation((status) => status.detail);
});

test("station risk page renders provenance, stale warnings, actionability, and recent anomaly evidence", async () => {
  const page = await StationRiskPage({ params: { stationId: "41009" } });
  render(page);

  expect(screen.getByText("41009")).toBeInTheDocument();
  expect(screen.getByText("Elevated warming and wave activity are active.")).toBeInTheDocument();
  expect(screen.getByText("Public v1 station risk endpoint.")).toBeInTheDocument();
  expect(screen.getByText(/Latest observation is stale/i)).toBeInTheDocument();
  expect(screen.getByText("Wave height is missing from the latest observation.")).toBeInTheDocument();
  expect(screen.getByText(/Elevated conditions detected\. Review active signals and monitor closely\./i)).toBeInTheDocument();
  expect(screen.getByText("No active threshold alerts")).toBeInTheDocument();
  expect(screen.getByText("Recent anomalies")).toBeInTheDocument();
  expect(screen.getByText("1 anomaly detected in past 48 hours")).toBeInTheDocument();
  expect(screen.getByText("Thermal Anomaly")).toBeInTheDocument();
  expect(screen.getAllByText("Baseline anomaly at 41009: seaSurfaceTempC z=2.70").length).toBeGreaterThan(0);
  expect(screen.getByText("Sea surface temperature deviated from the station baseline.")).toBeInTheDocument();
  expect(screen.getByText(/Backed by 1 recent observation/i)).toBeInTheDocument();
  expect(screen.getByText("Elevated temperature — potential thermal stress")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute("download", "station-41009-recent-anomalies.csv");
});

test("station risk page renders unavailable history honestly when recent anomalies cannot be loaded", async () => {
  mockMarineIntelligence.getStationRecentAnomalyEvidence.mockReturnValueOnce({
    state: "unavailable",
    windowDays: 14,
    summaryLine: "Recent anomaly history unavailable",
    exportHref: null,
    exportFileName: null,
    anomalies: [],
  });

  const page = await StationRiskPage({ params: { stationId: "41009" } });
  render(page);

  expect(screen.getAllByText("Recent anomaly history unavailable").length).toBeGreaterThan(0);
});

test("station risk page renders an honest error state when the API response is unavailable", async () => {
  mockMarineIntelligence.getStationRiskAssessment.mockReturnValueOnce({
    ok: false,
    status: 503,
    data: null,
    message: "Station risk is unavailable.",
  });

  const page = await StationRiskPage({ params: { stationId: "missing" } });
  render(page);

  expect(screen.getByText("Station risk unavailable")).toBeInTheDocument();
  expect(screen.getByText("Station risk is unavailable.")).toBeInTheDocument();
});
