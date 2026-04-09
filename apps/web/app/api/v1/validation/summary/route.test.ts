import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.stubEnv("MARINE_API_BASE_URL", "http://test-api:4000");

const { mockAuth, mockLogUsage } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLogUsage: vi.fn(),
}));

vi.mock("../../_auth", () => ({
  requireApiKeyAuth: mockAuth,
  logApiUsageSafely: mockLogUsage,
}));

import { GET } from "./route";

const RATE_LIMIT = {
  tier: "free",
  limit: 60,
  remaining: 59,
  requestsUsed: 0,
  windowSeconds: 60,
  resetAt: "2026-03-24T12:01:00.000Z",
};

const SUMMARY_FIXTURE = {
  generatedAt: "2026-03-24T12:00:00.000Z",
  summaryWindow: { since: null, stationId: "46042" },
  reliability: {
    totalEvaluations: 5,
    completedEvaluations: 4,
    outcomeCoverage: 0.8,
    empiricalAccuracy: 0.625,
    averagePredictedConfidence: 0.74,
    averageAdjustedConfidence: 0.69,
    overallCalibrationGap: 0.115,
    overconfidentBands: 1,
    underconfidentBands: 0,
  },
  confidenceBands: [],
  calibrationCurve: [],
  topFailureModes: [],
  feedbackTrendFlags: [],
};

beforeEach(() => {
  mockAuth.mockReset();
  mockLogUsage.mockReset();

  mockAuth.mockResolvedValue({
    ok: true,
    key: { id: "APIKEY-1" },
    auth: { actorId: "api-key:APIKEY-1", role: "admin", permissions: ["station.view_admin"], csrfToken: "api-key:mrk_test" },
    rateLimit: RATE_LIMIT,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("validation summary route proxies 200 response and logs usage", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => SUMMARY_FIXTURE,
  }));

  const response = await GET(
    new NextRequest("http://localhost/api/v1/validation/summary?stationId=46042&since=2026-03-01T00:00:00.000Z"),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    summaryWindow: { stationId: "46042" },
    reliability: { totalEvaluations: 5, averageAdjustedConfidence: 0.69 },
  });
  expect(mockLogUsage).toHaveBeenCalledOnce();
});

test("validation summary route forwards query parameters to upstream", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => SUMMARY_FIXTURE,
  });
  vi.stubGlobal("fetch", mockFetch);

  await GET(new NextRequest("http://localhost/api/v1/validation/summary?stationId=46042&since=2026-03-01T00:00:00.000Z"));

  expect(mockFetch).toHaveBeenCalledOnce();
  const [url] = mockFetch.mock.calls[0] as [string];
  expect(url).toContain("stationId=46042");
  expect(url).toContain("since=");
});

test("validation summary route proxies 400 error and returns standardized contract", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ message: "since must be a valid ISO timestamp" }),
  }));

  const response = await GET(
    new NextRequest("http://localhost/api/v1/validation/summary?since=bad"),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    code: "validation_summary_invalid_request",
    message: "since must be a valid ISO timestamp",
    retryable: false,
    rateLimit: RATE_LIMIT,
  });
});

test("validation summary route returns 502 when upstream is unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  const response = await GET(new NextRequest("http://localhost/api/v1/validation/summary"));

  expect(response.status).toBe(502);
  await expect(response.json()).resolves.toMatchObject({
    code: "validation_summary_unavailable",
    retryable: true,
  });
});
