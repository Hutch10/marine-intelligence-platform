import { vi, test, expect, beforeEach, afterEach } from "vitest";

const { mockListInvestigations, mockGetMarineRegionConfig, mockListMarineRegionConfigs, mockGetFeedHealth, mockGetFeedHealthDiagnostics } = vi.hoisted(() => ({
  mockListInvestigations: vi.fn(),
  mockGetMarineRegionConfig: vi.fn().mockReturnValue(null),
  mockListMarineRegionConfigs: vi.fn().mockReturnValue([]),
  mockGetFeedHealth: vi.fn(),
  mockGetFeedHealthDiagnostics: vi.fn(),
}));

// Mock the investigation list and fetch
vi.mock("@/lib/server/investigations", () => ({
  listInvestigations: mockListInvestigations,
}));

vi.mock("@marine/shared", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@marine/shared")>();
  return {
    ...actual,
    getMarineRegionConfig: mockGetMarineRegionConfig,
    listMarineRegionConfigs: mockListMarineRegionConfigs,
  };
});

vi.mock("@/lib/feed-health", () => ({
  getFeedHealth: mockGetFeedHealth,
  getFeedHealthDiagnostics: mockGetFeedHealthDiagnostics,
}));

import { getDashboardMarineSurfaceData } from "./marine-intelligence";

const investigationList = [
  { id: "TRK-201", title: "Thermal Spike", summary: "Test", confidence: 0.9, state: "Escalated", outcome: null },
];

const emptyInvestigationList: unknown[] = [];

function mockFetchOk(body: unknown, status = 200): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

function mockDashboardFetchSuccess(): void {
  const fetchMock = vi.fn().mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);

    if (url.includes("/live-conditions")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ conditions: [] }),
      };
    }

    if (url.includes("/reef-alerts")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ alerts: [] }),
      };
    }

    if (url.includes("/signals")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ signals: [] }),
      };
    }

    if (url.includes("/anomalies")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ anomalies: [] }),
      };
    }

    return {
      ok: false,
      status: 404,
      json: async () => ({ message: "not found" }),
    };
  });

  vi.stubGlobal("fetch", fetchMock);
}

function makeFeedHealthStatus(overrides: Record<string, unknown> = {}) {
  return {
    ndbc: { source: "ndbc", label: "NDBC", status: "live", lastIngestedAt: "2026-03-18T10:00:00.000Z", ageLabel: "2h ago" },
    crw: { source: "crw", label: "CRW", status: "live", lastIngestedAt: "2026-03-18T10:00:00.000Z", ageLabel: "2h ago" },
    ioos: { source: "ioos", label: "IOOS", status: "live", lastIngestedAt: "2026-03-18T10:00:00.000Z", ageLabel: "2h ago" },
    erddap: { source: "erddap", label: "ERDDAP", status: "live", lastIngestedAt: "2026-03-18T10:00:00.000Z", ageLabel: "2h ago" },
    overallStatus: "live",
    dbAvailable: true,
    ...overrides,
  };
}

beforeEach(() => {
  mockGetMarineRegionConfig.mockReturnValue(null);
  mockListMarineRegionConfigs.mockReturnValue([]);
  mockGetFeedHealth.mockReturnValue(makeFeedHealthStatus());
  mockGetFeedHealthDiagnostics.mockReturnValue([]);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

test("dashboard emits clickable investigation link only if canonical investigation exists", async () => {
  // Investigation exists
  mockListInvestigations.mockResolvedValue(investigationList);
  mockFetchOk({ conditions: [], alerts: [], signals: [], anomalies: [] }); // for all fetches

  const data = await getDashboardMarineSurfaceData();
  expect(data.anomalySummaryLinks.criticalHref).toBe("/investigations/TRK-201");
});

test("dashboard emits non-clickable investigation link if no canonical investigation exists", async () => {
  // No investigation exists
  mockListInvestigations.mockResolvedValue(emptyInvestigationList);
  mockFetchOk({ conditions: [], alerts: [], signals: [], anomalies: [] }); // for all fetches

  const data = await getDashboardMarineSurfaceData();
  expect(data.anomalySummaryLinks.criticalHref).toBeNull();
});

test("dashboard emits ERDDAP stale warning when station APIs are available", async () => {
  mockListInvestigations.mockResolvedValue(emptyInvestigationList);
  mockDashboardFetchSuccess();
  mockGetFeedHealth.mockReturnValue(makeFeedHealthStatus({
    erddap: { source: "erddap", label: "ERDDAP", status: "stale", lastIngestedAt: "2026-03-18T00:00:00.000Z", ageLabel: "10h ago" },
    overallStatus: "stale",
  }));

  const data = await getDashboardMarineSurfaceData();
  expect(data.notices.some((notice) => notice.title.includes("ERDDAP data is stale"))).toBe(true);
});

test("dashboard emits IOOS failed warning when station APIs are available", async () => {
  mockListInvestigations.mockResolvedValue(emptyInvestigationList);
  mockDashboardFetchSuccess();
  mockGetFeedHealth.mockReturnValue(makeFeedHealthStatus({
    ioos: { source: "ioos", label: "IOOS", status: "failed", lastIngestedAt: "2026-03-17T00:00:00.000Z", ageLabel: "1d ago" },
    overallStatus: "failed",
  }));

  const data = await getDashboardMarineSurfaceData();
  expect(data.notices.some((notice) => notice.title.includes("IOOS ingestion has not run recently"))).toBe(true);
});

test("dashboard emits ERDDAP never-ran warning when station APIs are available", async () => {
  mockListInvestigations.mockResolvedValue(emptyInvestigationList);
  mockDashboardFetchSuccess();
  mockGetFeedHealth.mockReturnValue(makeFeedHealthStatus({
    erddap: { source: "erddap", label: "ERDDAP", status: "unknown", lastIngestedAt: null, ageLabel: null },
    overallStatus: "unknown",
  }));

  const data = await getDashboardMarineSurfaceData();
  expect(data.notices.some((notice) => notice.title.includes("ERDDAP ingestion has not run yet"))).toBe(true);
});

test("dashboard does not emit IOOS warning when IOOS is live", async () => {
  mockListInvestigations.mockResolvedValue(emptyInvestigationList);
  mockDashboardFetchSuccess();
  mockGetFeedHealth.mockReturnValue(makeFeedHealthStatus({
    ioos: { source: "ioos", label: "IOOS", status: "live", lastIngestedAt: "2026-03-18T11:00:00.000Z", ageLabel: "1h ago" },
  }));

  const data = await getDashboardMarineSurfaceData();
  expect(data.notices.some((notice) => notice.title.includes("IOOS"))).toBe(false);
});
