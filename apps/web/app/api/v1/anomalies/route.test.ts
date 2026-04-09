import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.stubEnv("MARINE_API_BASE_URL", "http://test-api:4000");

const { mockAuth, mockLogUsage } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLogUsage: vi.fn(),
}));

vi.mock("../_auth", () => ({
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

test("anomalies route proxies 400 error from upstream and returns standardized contract", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: false,
    status: 400,
    json: async () => ({ message: "since must be a valid ISO timestamp" }),
  }));

  const response = await GET(
    new NextRequest("http://localhost/api/v1/anomalies?since=bad"),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    code: "anomalies_invalid_request",
    message: "since must be a valid ISO timestamp",
    retryable: false,
    rateLimit: RATE_LIMIT,
  });
});

test("anomalies route proxies 200 response from upstream", async () => {
  const ANOMALIES_FIXTURE = { anomalies: [{ stationId: "41009", metric: "sst", zScore: 2.4 }] };

  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ANOMALIES_FIXTURE,
  }));

  const response = await GET(
    new NextRequest("http://localhost/api/v1/anomalies?stationId=41009"),
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({ anomalies: expect.any(Array) });
  expect(mockLogUsage).toHaveBeenCalledOnce();
});

test("anomalies route returns 502 when upstream is unreachable", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

  const response = await GET(
    new NextRequest("http://localhost/api/v1/anomalies"),
  );

  expect(response.status).toBe(502);
  await expect(response.json()).resolves.toMatchObject({
    code: "anomalies_unavailable",
    retryable: true,
  });
});

test("anomalies route forwards query parameters to upstream", async () => {
  const mockFetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ anomalies: [] }),
  });
  vi.stubGlobal("fetch", mockFetch);

  await GET(new NextRequest("http://localhost/api/v1/anomalies?stationId=41009&since=2026-01-01T00:00:00Z&limit=20"));

  expect(mockFetch).toHaveBeenCalledOnce();
  const [url] = mockFetch.mock.calls[0] as [string];
  expect(url).toContain("stationId=41009");
  expect(url).toContain("since=2026-01-01T00%3A00%3A00Z");
  expect(url).toContain("limit=20");
});
