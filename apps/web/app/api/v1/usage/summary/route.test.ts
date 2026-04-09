import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";

const { mockAuth, mockLogUsage, mockUsageSummary, mockRecentUsage, mockRateLimit, mockBillingSummary } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLogUsage: vi.fn(),
  mockUsageSummary: vi.fn(),
  mockRecentUsage: vi.fn(),
  mockRateLimit: vi.fn(),
  mockBillingSummary: vi.fn(),
}));

vi.mock("../../_auth", () => ({
  requireApiKeyAuth: mockAuth,
  logApiUsageSafely: mockLogUsage,
}));

vi.mock("@/lib/server/public-api-store", () => ({
  getPublicApiUsageSummary: mockUsageSummary,
  getRecentPublicApiUsage: mockRecentUsage,
  getPublicApiRateLimitStatus: mockRateLimit,
  getPublicBillingUsageSummary: mockBillingSummary,
}));

import { GET } from "./route";

beforeEach(() => {
  mockAuth.mockReset();
  mockLogUsage.mockReset();
  mockUsageSummary.mockReset();
  mockRecentUsage.mockReset();
  mockRateLimit.mockReset();
  mockBillingSummary.mockReset();

  mockAuth.mockResolvedValue({
    ok: true,
    key: { id: "APIKEY-1", tier: "pro", billingAccountId: "BACC-1" },
    billingAccount: { id: "BACC-1" },
    auth: {
      actorId: "api-key:APIKEY-1",
      role: "admin",
      permissions: ["station.view_admin"],
      csrfToken: "api-key:mrk_test",
    },
    rateLimit: {
      tier: "pro",
      limit: 300,
      remaining: 257,
      requestsUsed: 42,
      windowSeconds: 60,
      resetAt: "2026-03-24T12:01:00.000Z",
    },
    quota: {
      tier: "pro",
      monthlyQuota: 10000,
      remainingQuota: 9958,
      requestsUsed: 42,
      billingMonth: "2026-03",
    },
  });
  mockUsageSummary.mockResolvedValue({
    keyId: "APIKEY-1",
    from: "2026-03-23T12:00:00.000Z",
    to: "2026-03-24T12:00:00.000Z",
    totalRequests: 42,
    errorCount: 3,
    averageDurationMs: 37.5,
    lastRequestAt: "2026-03-24T11:59:30.000Z",
    routeCounts: [{ route: "/api/v1/risk/score", count: 20 }],
  });
  mockRecentUsage.mockResolvedValue([
    {
      id: "APILOG-1",
      keyId: "APIKEY-1",
      route: "/api/v1/risk/score",
      statusCode: 200,
      durationMs: 34,
      requestAt: "2026-03-24T11:59:30.000Z",
    },
  ]);
  mockRateLimit.mockResolvedValue({
    tier: "pro",
    limit: 300,
    remaining: 257,
    requestsUsed: 42,
    windowSeconds: 60,
    resetAt: "2026-03-24T12:01:00.000Z",
  });
  mockBillingSummary.mockResolvedValue({
    provider: "manual",
    keyId: "APIKEY-1",
    billingAccountId: "BACC-1",
    billingMonth: "2026-03",
    billableRequests: 42,
    estimatedCostCents: 84,
    estimatedCostUsd: 0.84,
    costPerRequestCents: 2,
    remainingQuota: 9958,
  });
});

test("usage summary route returns customer-facing usage data", async () => {
  const response = await GET(
    new NextRequest("http://localhost/api/v1/usage/summary?limit=5"),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    keyId: "APIKEY-1",
    tier: "pro",
    billingAccountId: "BACC-1",
    summary: {
      totalRequests: 42,
      errorCount: 3,
    },
    recentRouteUsage: [{ route: "/api/v1/risk/score", count: 20 }],
    recentRequests: [{ id: "APILOG-1" }],
    rateLimit: {
      tier: "pro",
      limit: 300,
      remaining: 257,
    },
    quota: {
      monthlyQuota: 10000,
      remainingQuota: 9958,
    },
    billing: {
      billableRequests: 42,
      estimatedCostCents: 84,
      remainingQuota: 9958,
    },
  });
});
