/**
 * Tests for the HTTP boundary in marine-intelligence.ts.
 *
 * These tests verify that the facade correctly handles API responses,
 * including timeout, 5xx errors, and malformed JSON. All live fetch calls
 * are mocked — no real network requests are made.
 */

import { vi, afterEach, test, expect } from "vitest";

// Mock @marine/shared so getMarineRegionConfig and listMarineRegionConfigs are
// available as stubs. The real implementation performs Node.js I/O that is not
// available in the web test environment.
vi.mock("@marine/shared", () => ({
  getMarineRegionConfig: vi.fn().mockReturnValue(null),
  listMarineRegionConfigs: vi.fn().mockReturnValue([]),
}));

// Stub the API base URL before importing the module so getApiBase() picks it up.
vi.stubEnv("MARINE_API_BASE_URL", "http://test-api:4000");

import {
  getStationRiskAssessment,
  getRegionRiskAssessment,
  getRegionRiskTrend,
} from "@/lib/marine-intelligence";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const STATION_RISK_FIXTURE = {
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
    coverageNote: "Good baseline coverage.",
  },
};

const REGION_RISK_FIXTURE = {
  regionId: "southeast-florida",
  regionName: "Southeast Florida",
  evaluatedAt: "2026-03-25T18:00:00.000Z",
  riskLevel: "high",
  summary: "Multiple stations elevated.",
  dominantDrivers: ["SST anomaly"],
  topStations: [{ stationId: "41009", riskLevel: "high" }],
  coverage: {
    configuredStations: 6,
    analyzedStations: 5,
    healthyStations: 4,
    minimumHealthyStations: 3,
  },
  confidence: { score: 0.82, quality: "high" },
};

const REGION_TREND_FIXTURE = {
  regionId: "southeast-florida",
  regionName: "Southeast Florida",
  evaluatedAt: "2026-03-25T18:00:00.000Z",
  currentRisk: { riskLevel: "high", confidenceScore: 0.82 },
  trend: { direction: "rising", strength: "moderate", deltaScore: 0.4, persistence: 0.6 },
  forecast: {
    next12h: { riskLevel: "high", confidence: 0.75 },
    next24h: { riskLevel: "critical", confidence: 0.6 },
  },
  summary: "Regional risk rising.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function mockFetchOk(body: unknown, status = 200): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
}

function mockFetchError(status: number, body: unknown): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => body,
  }));
}

function mockFetchServerError(status: number): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => ({ message: `Server error ${status}` }),
  }));
}

function mockFetchAbort(): void {
  vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => {
    const error = new Error("The operation was aborted");
    error.name = "AbortError";
    throw error;
  }));
}

function mockFetchMalformedJson(): void {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => { throw new SyntaxError("Unexpected token < in JSON"); },
  }));
}

function mockFetchNetworkDown(): void {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(
    new TypeError("fetch failed"),
  ));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── getStationRiskAssessment ─────────────────────────────────────────────────

test("getStationRiskAssessment returns structured data when API returns 200", async () => {
  mockFetchOk(STATION_RISK_FIXTURE);

  const result = await getStationRiskAssessment("41009");

  expect(result.ok).toBe(true);
  expect(result.data?.stationId).toBe("41009");
  expect(result.data?.riskLevel).toBe("high");
  expect(result.data?.summary).toBe("Elevated warming and wave activity are active.");
  expect(result.data?.provenance.source).toBe("live");
  expect(result.data?.provenance.detail).toBe("Public v1 station risk endpoint.");
});

test("getStationRiskAssessment adds freshness and dataQuality overlays", async () => {
  mockFetchOk(STATION_RISK_FIXTURE);

  const result = await getStationRiskAssessment("41009");

  expect(result.ok).toBe(true);
  expect(result.data?.freshness).toBeDefined();
  expect(typeof result.data?.freshness.stale).toBe("boolean");
  expect(result.data?.dataQuality).toBeDefined();
  // Wave height is present in fixture so no missing metric warning
  expect(result.data?.dataQuality.warning).toBeNull();
});

test("getStationRiskAssessment returns error when API returns 503", async () => {
  mockFetchServerError(503);

  const result = await getStationRiskAssessment("41009");

  expect(result.ok).toBe(false);
  expect(result.data).toBeNull();
  expect(result.message).toMatch(/503/);
});

test("getStationRiskAssessment returns error when API returns 500", async () => {
  mockFetchServerError(500);

  const result = await getStationRiskAssessment("41009");

  expect(result.ok).toBe(false);
  expect(result.message).toMatch(/500/);
});

test("getStationRiskAssessment returns error when API returns 404", async () => {
  mockFetchError(404, { message: "Station not found" });

  const result = await getStationRiskAssessment("41009");

  expect(result.ok).toBe(false);
  expect(result.message).toBe("Station not found");
});

test("getStationRiskAssessment returns timeout error on AbortError", async () => {
  mockFetchAbort();

  const result = await getStationRiskAssessment("41009");

  expect(result.ok).toBe(false);
  expect(result.message).toMatch(/timed out/i);
  expect(result.status).toBe(504);
});

test("getStationRiskAssessment returns unreachable error when network is down", async () => {
  mockFetchNetworkDown();

  const result = await getStationRiskAssessment("41009");

  expect(result.ok).toBe(false);
  expect(result.message).toMatch(/unreachable/i);
  expect(result.status).toBe(503);
});

test("getStationRiskAssessment returns error when API returns malformed JSON", async () => {
  mockFetchMalformedJson();

  const result = await getStationRiskAssessment("41009");

  expect(result.ok).toBe(false);
  expect(result.message).toMatch(/malformed/i);
});

// ─── getRegionRiskAssessment ──────────────────────────────────────────────────

test("getRegionRiskAssessment returns region data when API returns 200", async () => {
  mockFetchOk(REGION_RISK_FIXTURE);

  const result = await getRegionRiskAssessment("southeast-florida");

  expect(result.ok).toBe(true);
  expect(result.data?.regionId).toBe("southeast-florida");
  expect(result.data?.riskLevel).toBe("high");
  expect(result.data?.provenance.source).toBe("live");
  // 5 of 6 configured stations analyzed — coverage warning is expected
  expect(result.data?.coverageWarning).toMatch(/5 of 6 configured stations/i);
});

test("getRegionRiskAssessment builds coverage warning when healthy stations below minimum", async () => {
  mockFetchOk({
    ...REGION_RISK_FIXTURE,
    coverage: {
      configuredStations: 6,
      analyzedStations: 4,
      healthyStations: 2,
      minimumHealthyStations: 3,
    },
  });

  const result = await getRegionRiskAssessment("southeast-florida");

  expect(result.ok).toBe(true);
  expect(result.data?.coverageWarning).toMatch(/weak/i);
  expect(result.data?.coverageWarning).toMatch(/2/);
});

test("getRegionRiskAssessment returns error when API returns 404", async () => {
  mockFetchError(404, { message: "Region not found" });

  const result = await getRegionRiskAssessment("unknown-region");

  expect(result.ok).toBe(false);
  expect(result.message).toBe("Region not found");
});

test("getRegionRiskAssessment returns error on API timeout", async () => {
  mockFetchAbort();

  const result = await getRegionRiskAssessment("southeast-florida");

  expect(result.ok).toBe(false);
  expect(result.status).toBe(504);
});

// ─── getRegionRiskTrend ───────────────────────────────────────────────────────

test("getRegionRiskTrend returns trend data when API returns 200", async () => {
  mockFetchOk(REGION_TREND_FIXTURE);

  const result = await getRegionRiskTrend("southeast-florida");

  expect(result.ok).toBe(true);
  expect(result.data?.regionId).toBe("southeast-florida");
  expect(result.data?.trend.direction).toBe("rising");
  expect(result.data?.forecast.next12h.riskLevel).toBe("high");
  expect(result.data?.provenance.source).toBe("live");
  expect(result.data?.forecastMethod).toMatch(/rule-based/i);
  expect(result.data?.coverageWarning).toBeNull();
});

test("getRegionRiskTrend returns error when API returns 503", async () => {
  mockFetchServerError(503);

  const result = await getRegionRiskTrend("southeast-florida");

  expect(result.ok).toBe(false);
  expect(result.message).toMatch(/503/);
});
