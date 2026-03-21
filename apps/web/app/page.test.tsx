import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import DashboardPage from "@/app/page";
import type {
  DashboardOverviewData,
  DashboardSpeciesActivity,
  LiveMarineCondition,
  ReefStressWatchItem,
} from "@/lib/api/types";

const SPECIES_ACTIVITY: DashboardSpeciesActivity = {
  recentSightingCount: 3,
  recentMovementSignalCount: 2,
  topMovementTypes: ["route_deviation", "aggregation_shift"],
  topActiveSpecies: [{ speciesId: "SP-BLUE-WHALE", commonName: "Blue Whale", sightingCount: 3 }],
  ecologicalReasons: [
    {
      kind: "increased_sighting_rate",
      label: "3 sightings in last 14 days",
      detail: "Sighting frequency exceeds baseline threshold.",
    },
    {
      kind: "migration_shift_detected",
      label: "Migration shift: route deviation",
      detail: "Detected route deviation in recent movement signals.",
    },
  ],
  windowDays: 14,
  generatedAt: "2026-03-13T12:00:00.000Z",
};

const OVERVIEW: DashboardOverviewData = {
  metrics: [],
  missions: [],
  activity: [],
  quickAccess: [],
  speciesActivity: SPECIES_ACTIVITY,
};

const LIVE_CONDITIONS: LiveMarineCondition[] = [
  {
    stationId: "46042",
    timestamp: "2026-03-18T10:50:00.000Z",
    sstC: 17.1,
    waveHeightM: 1.24,
    windSpeedMps: 7,
    pressureHpa: 1015.6,
  },
];

const REEF_ALERTS: ReefStressWatchItem[] = [
  {
    region: "Great Barrier Reef",
    stationId: null,
    timestamp: "2026-03-18T10:00:00.000Z",
    sstAnomalyC: 1.8,
    hotSpotC: 1.4,
    dhw: 6.2,
    stressLevel: "alert_level_1",
    source: "noaa_coral_reef_watch",
    outputClass: "derived",
  },
];

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    dashboard: {
      getOverview: vi.fn(),
    },
    signals: {
      list: vi.fn(),
    },
    liveConditions: {
      getLatest: vi.fn(),
    },
    reefAlerts: {
      getLatest: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/dashboard/dashboard-anomaly-summary", () => ({
  DashboardAnomalySummaryCard: () => <div data-testid="anomaly-summary" />,
}));

vi.mock("@/components/signals/signal-center", () => ({
  SignalCenter: () => <div data-testid="signal-center" />,
}));

beforeEach(() => {
  mockApiClient.dashboard.getOverview.mockReset();
  mockApiClient.signals.list.mockReset();
  mockApiClient.liveConditions.getLatest.mockReset();
  mockApiClient.reefAlerts.getLatest.mockReset();

  mockApiClient.dashboard.getOverview.mockResolvedValue(OVERVIEW);
  mockApiClient.signals.list.mockResolvedValue([]);
  mockApiClient.liveConditions.getLatest.mockResolvedValue(LIVE_CONDITIONS);
  mockApiClient.reefAlerts.getLatest.mockResolvedValue(REEF_ALERTS);
});

test("dashboard page renders species activity from overview", async () => {
  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("Species Activity")).toBeInTheDocument();
  expect(screen.getByText("Blue Whale")).toBeInTheDocument();
  expect(screen.getByText("3 sightings in last 14 days")).toBeInTheDocument();
  expect(screen.getByText(/Migration shift/i)).toBeInTheDocument();
});

test("dashboard page only requests overview and signals", async () => {
  await DashboardPage();

  expect(mockApiClient.dashboard.getOverview).toHaveBeenCalledTimes(1);
  expect(mockApiClient.signals.list).toHaveBeenCalledTimes(1);
  expect(mockApiClient.liveConditions.getLatest).toHaveBeenCalledTimes(1);
  expect(mockApiClient.reefAlerts.getLatest).toHaveBeenCalledTimes(1);
});

test("dashboard page renders live marine conditions panel", async () => {
  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("Live Marine Conditions")).toBeInTheDocument();
  expect(screen.getByText("46042")).toBeInTheDocument();
  expect(screen.getByText(/17.1 °C/)).toBeInTheDocument();
});

test("dashboard page renders reef stress watch panel", async () => {
  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("Reef Stress Watch")).toBeInTheDocument();
  expect(screen.getByText("Great Barrier Reef")).toBeInTheDocument();
  expect(screen.getByText("Alert Level 1")).toBeInTheDocument();
});

test("dashboard page shows empty species activity state when unavailable", async () => {
  mockApiClient.dashboard.getOverview.mockResolvedValue({
    ...OVERVIEW,
    speciesActivity: undefined,
  });

  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("No recent species activity data available.")).toBeInTheDocument();
});

test("dashboard page renders ecological reasons section when reasons exist", async () => {
  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("Ecological signals")).toBeInTheDocument();
  expect(screen.getByText("Sighting frequency exceeds baseline threshold.")).toBeInTheDocument();
});

test("dashboard page shows empty reef stress state when alerts unavailable", async () => {
  mockApiClient.reefAlerts.getLatest.mockResolvedValue([]);

  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("No reef stress alerts available.")).toBeInTheDocument();
});
