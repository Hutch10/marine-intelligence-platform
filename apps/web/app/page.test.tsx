import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import DashboardPage from "@/app/page";
import type { LiveMarineCondition, ReefStressWatchItem, SignalDetection } from "@/lib/api/types";

const LIVE_CONDITIONS: LiveMarineCondition[] = [
  {
    stationId: "46042",
    timestamp: "2026-03-18T10:50:00.000Z",
    sstC: 17.1,
    waveHeightM: 1.24,
    windSpeedMps: 7,
    pressureHpa: 1015.6,
    source: "noaa_ndbc",
  },
];

const REEF_ALERTS: ReefStressWatchItem[] = [
  {
    region: "Southeast Florida",
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

const SIGNALS: SignalDetection[] = [
  {
    id: "SIG-1",
    signalType: "thermal_anomaly",
    severity: "high",
    confidence: 81,
    sourceType: "risk_engine",
    sourceId: "risk-41009",
    region: "Southeast Florida",
    stationId: "41009",
    title: "Thermal anomaly escalation",
    summary: "Station-level warming exceeds baseline.",
    detail: "Station-level warming exceeds baseline.",
    status: "open",
    detectedAt: "2026-03-18T10:50:00.000Z",
    createdAt: "2026-03-18T10:50:00.000Z",
    updatedAt: "2026-03-18T10:50:00.000Z",
    linkedInvestigationId: "TRK-201",
  },
];

const MARINE_SURFACE_DATA = {
  metrics: [
    { label: "Anomalies", value: "4", caption: "public anomaly feed records", tone: "critical" as const, href: "/investigations" },
  ],
  anomalySummary: {
    totalAnomalies: 4,
    elevatedAnomalies: 2,
    criticalAnomalies: 1,
    regionsAffected: 1,
    trendDirection: "up" as const,
  },
  anomalySummaryLinks: {
    totalHref: "/investigations",
    elevatedHref: "/v1/regions/southeast-florida/risk",
    criticalHref: "/investigations",
    regionsHref: "/v1/regions/southeast-florida/risk/trend",
  },
  anomalySummaryStatus: {
    source: "derived" as const,
    label: "Derived summary",
    detail: "Summary is derived from live routes.",
    fallbackReason: null,
    updatedAt: "2026-03-18T10:50:00.000Z",
    freshnessLabel: "2h old",
    isStale: false,
  },
  prioritizedSignals: SIGNALS,
  signalCenterStatus: {
    source: "live" as const,
    label: "Live API-backed",
    detail: "Persisted signals only.",
    fallbackReason: null,
    updatedAt: "2026-03-18T10:50:00.000Z",
    freshnessLabel: "2h old",
    isStale: false,
  },
  liveConditions: LIVE_CONDITIONS,
  liveConditionsStatus: {
    source: "fallback" as const,
    label: "Fallback data",
    detail: "Showing fallback conditions because database is unavailable.",
    fallbackReason: "db_path_missing",
    updatedAt: "2026-03-18T10:50:00.000Z",
    freshnessLabel: "2h old",
    isStale: false,
  },
  reefAlerts: REEF_ALERTS,
  reefAlertsStatus: {
    source: "live" as const,
    label: "Live API-backed",
    detail: "Persisted reef alerts.",
    fallbackReason: null,
    updatedAt: "2026-03-18T10:00:00.000Z",
    freshnessLabel: "3h old",
    isStale: false,
  },
  primaryRegion: {
    id: "southeast-florida",
    name: "Southeast Florida",
  },
  quickLinks: [
    {
      label: "Anomaly Feed",
      description: "Review live anomaly records and open signals.",
      href: "/investigations",
    },
  ],
  notices: [
    {
      title: "Station conditions are in fallback mode",
      detail: "Showing fallback conditions because database is unavailable.",
      tone: "warning" as const,
    },
  ],
  feedHealth: {
    ndbc: { source: "ndbc" as const, label: "NDBC", status: "live" as const, lastIngestedAt: "2026-03-18T08:00:00.000Z", ageLabel: "2h ago" },
    crw: { source: "crw" as const, label: "CRW", status: "live" as const, lastIngestedAt: "2026-03-18T08:00:00.000Z", ageLabel: "2h ago" },
    overallStatus: "live" as const,
    dbAvailable: true,
  },
};

const { mockMarineSurfaceData } = vi.hoisted(() => ({
  mockMarineSurfaceData: {
    getDashboardMarineSurfaceData: vi.fn(),
    getMarineRegionByName: vi.fn(),
    getSignalDetailHref: vi.fn(),
    formatSurfaceStatusLine: vi.fn(),
  },
}));

vi.mock("@/lib/marine-intelligence", () => ({
  getDashboardMarineSurfaceData: mockMarineSurfaceData.getDashboardMarineSurfaceData,
  getMarineRegionByName: mockMarineSurfaceData.getMarineRegionByName,
  getSignalDetailHref: mockMarineSurfaceData.getSignalDetailHref,
  formatSurfaceStatusLine: mockMarineSurfaceData.formatSurfaceStatusLine,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/dashboard/dashboard-anomaly-summary", () => ({
  DashboardAnomalySummaryCard: ({ statusLine }: { statusLine?: string }) => (
    <div data-testid="anomaly-summary">{statusLine}</div>
  ),
}));

vi.mock("@/components/signals/signal-center", () => ({
  SignalCenter: ({ statusLine }: { statusLine?: string }) => <div data-testid="signal-center">{statusLine}</div>,
}));

beforeEach(() => {
  mockMarineSurfaceData.getDashboardMarineSurfaceData.mockReset();
  mockMarineSurfaceData.getMarineRegionByName.mockReset();
  mockMarineSurfaceData.getSignalDetailHref.mockReset();
  mockMarineSurfaceData.formatSurfaceStatusLine.mockReset();

  mockMarineSurfaceData.getDashboardMarineSurfaceData.mockReturnValue(MARINE_SURFACE_DATA);
  mockMarineSurfaceData.formatSurfaceStatusLine.mockImplementation((status) => status.detail);
  mockMarineSurfaceData.getMarineRegionByName.mockReturnValue({
    id: "southeast-florida",
    name: "Southeast Florida",
  });
});

test("dashboard page renders only live-backed marine surfaces and trust notices", async () => {
  const page = await DashboardPage({ searchParams: {} });
  render(page);

  expect(screen.getByText("Live ocean conditions, signal detection, and reef stress monitoring.")).toBeInTheDocument();
  expect(screen.getByText("Station conditions are in fallback mode")).toBeInTheDocument();
  expect(screen.queryByText("Species Activity")).not.toBeInTheDocument();
  expect(screen.queryByText("Active Missions")).not.toBeInTheDocument();
  expect(screen.queryByText("Recent Activity")).not.toBeInTheDocument();
});

test("dashboard page passes surface status into anomaly and signal sections", async () => {
  const page = await DashboardPage({ searchParams: {} });
  render(page);

  expect(screen.getByTestId("anomaly-summary")).toHaveTextContent("Summary is derived from live routes.");
  expect(screen.getByTestId("signal-center")).toHaveTextContent("Persisted signals only.");
});

test("dashboard page station IDs in live conditions link to canonical station risk route", async () => {
  const page = await DashboardPage({ searchParams: {} });
  render(page);

  const stationLink = screen.getByRole("link", { name: "46042" });
  expect(stationLink).toBeInTheDocument();
  expect(stationLink).toHaveAttribute("href", "/v1/risk/46042");
});

test("dashboard page does not surface investigation IDs as text", async () => {
  const page = await DashboardPage({ searchParams: {} });
  render(page);

  expect(screen.queryByText("TRK-201")).not.toBeInTheDocument();
});

test("dashboard page renders live conditions and reef stress panels", async () => {
  const page = await DashboardPage({ searchParams: {} });
  render(page);

  expect(screen.getByText("Live Ocean Conditions")).toBeInTheDocument();
  expect(screen.getByText("46042")).toBeInTheDocument();
  expect(screen.getByText("Reef Stress Watch")).toBeInTheDocument();
  expect(screen.getByText("Alert Level 1")).toBeInTheDocument();
});

test("exact operator_access_required notice renders role='alert'", async () => {
  const page = await DashboardPage({ searchParams: { notice: "operator_access_required" } });
  render(page);

  const alert = screen.getByRole("alert");
  expect(alert).toBeInTheDocument();
  expect(alert).toHaveTextContent("Operator access required");
});

test("missing notice renders no alert", async () => {
  const page = await DashboardPage({ searchParams: {} });
  render(page);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("unknown notice renders no alert", async () => {
  const page = await DashboardPage({ searchParams: { notice: "unknown_notice_type" } });
  render(page);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("array/malformed notice values render no alert", async () => {
  const page = await DashboardPage({ searchParams: { notice: ["operator_access_required", "other"] } });
  render(page);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("no arbitrary query content is reflected", async () => {
  const page = await DashboardPage({ searchParams: { notice: "<script>alert('XSS')</script>" } });
  render(page);
  expect(screen.queryByText(/XSS/i)).not.toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("banner copy contains no token, header, secret, or authentication implementation details", async () => {
  const page = await DashboardPage({ searchParams: { notice: "operator_access_required" } });
  render(page);
  const alert = screen.getByRole("alert");
  const text = alert.textContent?.toLowerCase() || "";

  expect(text).not.toContain("token");
  expect(text).not.toContain("header");
  expect(text).not.toContain("secret");
  expect(text).not.toContain("x-operator-token");
});
