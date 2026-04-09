import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.stubEnv("MARINE_API_BASE_URL", "http://test-api:4000");

const { mockAuth, mockLogUsage, mockRecordEvaluation } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLogUsage: vi.fn(),
  mockRecordEvaluation: vi.fn(),
}));

vi.mock("../../_auth", () => ({
  requireApiKeyAuth: mockAuth,
  logApiUsageSafely: mockLogUsage,
}));

vi.mock("../_recommendation", () => ({
  attachRecommendationToRiskScoreResponse: (payload: unknown) => payload,
}));

vi.mock("@/lib/server/public-api-store", () => ({
  recordPublicRiskEvaluationPrediction: mockRecordEvaluation,
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

const RISK_SCORE_FIXTURE = {
  stationId: "41009",
  computedAt: "2026-03-24T12:00:00.000Z",
  overallRisk: "high",
  riskScore: 0.82,
  confidenceScore: 0.78,
  operatorSummary: "Elevated SST anomaly.",
  warningMessages: [],
  signals: [{ field: "seaSurfaceTempC", value: 28.4, zScore: 2.7 }],
  triggeredRules: [],
};

beforeEach(() => {
  mockAuth.mockReset();
  mockLogUsage.mockReset();
  mockRecordEvaluation.mockReset();

  mockAuth.mockResolvedValue({
    ok: true,
    key: { id: "APIKEY-1" },
    auth: { actorId: "api-key:APIKEY-1", role: "admin", permissions: ["station.view_admin"], csrfToken: "api-key:mrk_test" },
    rateLimit: RATE_LIMIT,
  });
  mockRecordEvaluation.mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("risk score route proxies 400 error and returns standardized contract", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ message: "stationId is required" }),
  }));

  const response = await GET(new NextRequest("http://localhost/api/v1/risk/score"));

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    code: "risk_score_invalid_request",
    message: "stationId is required",
    retryable: false,
    rateLimit: RATE_LIMIT,
  });
});

test("risk score route proxies 200 response and runs recommendation post-processing", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => RISK_SCORE_FIXTURE,
  }));

  const response = await GET(new NextRequest("http://localhost/api/v1/risk/score?stationId=41009"));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    stationId: "41009",
    overallRisk: "high",
  });
  expect(mockRecordEvaluation).toHaveBeenCalledOnce();
  expect(mockLogUsage).toHaveBeenCalledOnce();
});

test("risk score route returns 502 when upstream is unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  const response = await GET(new NextRequest("http://localhost/api/v1/risk/score?stationId=41009"));

  expect(response.status).toBe(502);
  await expect(response.json()).resolves.toMatchObject({
    code: "risk_score_unavailable",
    retryable: true,
  });
});
