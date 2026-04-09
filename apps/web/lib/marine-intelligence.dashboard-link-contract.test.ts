import { vi, test, expect, beforeEach, afterEach } from "vitest";

const { mockListInvestigations, mockGetMarineRegionConfig, mockListMarineRegionConfigs } = vi.hoisted(() => ({
  mockListInvestigations: vi.fn(),
  mockGetMarineRegionConfig: vi.fn().mockReturnValue(null),
  mockListMarineRegionConfigs: vi.fn().mockReturnValue([]),
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

beforeEach(() => {
  mockGetMarineRegionConfig.mockReturnValue(null);
  mockListMarineRegionConfigs.mockReturnValue([]);
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
