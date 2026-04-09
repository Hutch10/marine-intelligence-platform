import { afterEach, beforeEach, expect, test, vi } from "vitest";

const { lookupByHash, lookupById, recordLastUsed, appendUsage, appendBillingUsage, getUsageSummary, getRateLimitStatus, getBillingAccount, getQuotaStatus } = vi.hoisted(() => ({
  lookupByHash: vi.fn(),
  lookupById: vi.fn(),
  recordLastUsed: vi.fn(),
  appendUsage: vi.fn(),
  appendBillingUsage: vi.fn(),
  getUsageSummary: vi.fn(),
  getRateLimitStatus: vi.fn(),
  getBillingAccount: vi.fn(),
  getQuotaStatus: vi.fn(),
}));

vi.mock("@/lib/server/public-api-store", () => ({
  authenticatePublicApiKeyRequest: lookupByHash,
  getPublicApiKeyById: lookupById,
  recordPublicApiKeyLastUsed: recordLastUsed,
  appendPublicApiUsage: appendUsage,
  recordPublicBillingUsage: appendBillingUsage,
  getPublicApiUsageSummary: getUsageSummary,
  getPublicApiRateLimitStatus: getRateLimitStatus,
  getPublicBillingAccount: getBillingAccount,
  getPublicBillingQuotaStatus: getQuotaStatus,
}));

import { logApiUsageSafely, requireApiKeyAuth } from "./_auth";

beforeEach(() => {
  lookupByHash.mockReset();
  lookupById.mockReset();
  recordLastUsed.mockReset();
  appendUsage.mockReset();
  appendBillingUsage.mockReset();
  getUsageSummary.mockReset();
  getRateLimitStatus.mockReset();
  getBillingAccount.mockReset();
  getQuotaStatus.mockReset();

  getUsageSummary.mockResolvedValue({
    totalRequests: 0,
  });
  getRateLimitStatus.mockResolvedValue({
    tier: "free",
    limit: 60,
    remaining: 60,
    requestsUsed: 0,
    windowSeconds: 60,
    resetAt: "2026-03-24T12:01:00.000Z",
  });
  getBillingAccount.mockResolvedValue(null);
  getQuotaStatus.mockResolvedValue({
    allowed: true,
    quota: {
      tier: "free",
      monthlyQuota: 1000,
      remainingQuota: 1000,
      requestsUsed: 0,
      billingMonth: "2026-03",
    },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

test("api key auth rejects requests without a key", async () => {
  const result = await requireApiKeyAuth(new Request("http://localhost/api/v1/risk/score"));

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.response.status).toBe(401);
    await expect(result.response.json()).resolves.toEqual({
      code: "api_key_required",
      message: "API key required",
      retryable: false,
    });
  }
});

test("api key auth rejects invalid or revoked keys", async () => {
  lookupByHash.mockResolvedValueOnce(null);

  const invalid = await requireApiKeyAuth(
    new Request("http://localhost/api/v1/risk/score", {
      headers: { "x-api-key": "mrk_invalid" },
    }),
  );

  expect(invalid.ok).toBe(false);
  if (!invalid.ok) {
    expect(invalid.response.status).toBe(401);
  }

  lookupByHash.mockResolvedValueOnce({
    id: "APIKEY-1",
    prefix: "mrk_revoked",
    name: "Revoked",
    tier: "free",
    scopes: ["read"],
    createdAt: "2026-03-24T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: "2026-03-24T13:00:00.000Z",
  });

  const revoked = await requireApiKeyAuth(
    new Request("http://localhost/api/v1/risk/score", {
      headers: { "x-api-key": "mrk_revoked" },
    }),
  );

  expect(revoked.ok).toBe(false);
  if (!revoked.ok) {
    expect(revoked.response.status).toBe(401);
  }
});

test("api key auth returns the key and synthetic admin auth context", async () => {
  lookupByHash.mockResolvedValueOnce({
    id: "APIKEY-1",
    prefix: "mrk_abcd1234",
    name: "North Pacific client",
    tier: "pro",
    scopes: ["read"],
    billingAccountId: "BACC-1",
    createdAt: "2026-03-24T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  recordLastUsed.mockResolvedValueOnce({
    id: "APIKEY-1",
  });

  const result = await requireApiKeyAuth(
    new Request("http://localhost/api/v1/risk/score", {
      headers: { "x-api-key": "mrk_valid" },
    }),
  );

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.key.id).toBe("APIKEY-1");
    expect(result.auth.actorId).toBe("api-key:APIKEY-1");
    expect(result.auth.permissions).toEqual(["station.view_admin"]);
    expect(result.rateLimit.remaining).toBe(59);
    expect(result.quota.monthlyQuota).toBe(1000);
  }
});

test("api key auth enforces rate limits with structured 429 response", async () => {
  lookupByHash.mockResolvedValueOnce({
    id: "APIKEY-1",
    prefix: "mrk_abcd1234",
    name: "Free client",
    tier: "free",
    scopes: ["read"],
    billingAccountId: "BACC-1",
    createdAt: "2026-03-24T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  getUsageSummary.mockResolvedValueOnce({
    totalRequests: 60,
  });
  getRateLimitStatus.mockResolvedValueOnce({
    tier: "free",
    limit: 60,
    remaining: 0,
    requestsUsed: 60,
    windowSeconds: 60,
    resetAt: "2026-03-24T12:01:00.000Z",
  });

  const result = await requireApiKeyAuth(
    new Request("http://localhost/api/v1/risk/score", {
      headers: { "x-api-key": "mrk_valid" },
    }),
  );

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.response.status).toBe(429);
    await expect(result.response.json()).resolves.toMatchObject({
      code: "rate_limit_exceeded",
      retryable: true,
      rateLimit: {
        tier: "free",
        limit: 60,
        remaining: 0,
      },
      quota: {
        tier: "free",
      },
    });
  }
});

test("api key auth enforces monthly quota with structured 429 response", async () => {
  lookupByHash.mockResolvedValueOnce({
    id: "APIKEY-3",
    prefix: "mrk_quota",
    name: "Quota client",
    tier: "free",
    scopes: ["read"],
    billingAccountId: "BACC-9",
    createdAt: "2026-03-24T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  getQuotaStatus.mockResolvedValueOnce({
    allowed: false,
    code: "quota_exceeded",
    message: "Monthly quota exceeded for tier free",
    retryable: false,
    quota: {
      tier: "free",
      monthlyQuota: 1000,
      remainingQuota: 0,
      requestsUsed: 1000,
      billingMonth: "2026-03",
    },
  });

  const result = await requireApiKeyAuth(
    new Request("http://localhost/api/v1/risk/score", {
      headers: { "x-api-key": "mrk_quota" },
    }),
  );

  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.response.status).toBe(429);
    await expect(result.response.json()).resolves.toMatchObject({
      code: "quota_exceeded",
      retryable: false,
      quota: {
        monthlyQuota: 1000,
        remainingQuota: 0,
      },
    });
  }
});

test("api key auth reflects tier differences in returned rate-limit state", async () => {
  lookupByHash.mockResolvedValueOnce({
    id: "APIKEY-2",
    prefix: "mrk_pro1234",
    name: "Pro client",
    tier: "pro",
    scopes: ["read"],
    billingAccountId: "BACC-2",
    createdAt: "2026-03-24T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  getUsageSummary.mockResolvedValueOnce({
    totalRequests: 42,
  });
  getRateLimitStatus.mockResolvedValueOnce({
    tier: "pro",
    limit: 300,
    remaining: 258,
    requestsUsed: 42,
    windowSeconds: 60,
    resetAt: "2026-03-24T12:01:00.000Z",
  });

  const result = await requireApiKeyAuth(
    new Request("http://localhost/api/v1/risk/score", {
      headers: { "x-api-key": "mrk_pro" },
    }),
  );

  expect(result.ok).toBe(true);
  if (result.ok) {
    expect(result.rateLimit.tier).toBe("pro");
    expect(result.rateLimit.limit).toBe(300);
    expect(result.rateLimit.remaining).toBe(257);
  }
});

test("usage logging is best-effort and swallows failures", async () => {
  const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  appendUsage.mockRejectedValueOnce(new Error("sqlite unavailable"));

  await expect(
    logApiUsageSafely({
      keyId: "APIKEY-1",
      route: "/api/v1/risk/score",
      statusCode: 200,
      durationMs: 12,
    }),
  ).resolves.toBeUndefined();

  expect(warning).toHaveBeenCalledOnce();
});

test("usage logging records billable usage when the key can be resolved", async () => {
  lookupById.mockResolvedValueOnce({
    id: "APIKEY-1",
    prefix: "mrk_live",
    name: "Pilot Key",
    tier: "pro",
    scopes: ["read"],
    billingAccountId: "BACC-1",
    createdAt: "2026-03-24T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
  });
  getBillingAccount.mockResolvedValueOnce({
    id: "BACC-1",
    provider: "manual",
    externalCustomerId: null,
    name: "Pilot Customer",
    email: null,
    tier: "pro",
    status: "active",
    monthlyQuota: 10000,
    costPerRequestCents: 2,
    createdAt: "2026-03-24T12:00:00.000Z",
    updatedAt: "2026-03-24T12:00:00.000Z",
  });

  await logApiUsageSafely({
    keyId: "APIKEY-1",
    route: "/api/v1/risk/score",
    statusCode: 200,
    durationMs: 12,
  });

  expect(appendUsage).toHaveBeenCalledOnce();
  expect(appendBillingUsage).toHaveBeenCalledOnce();
});
