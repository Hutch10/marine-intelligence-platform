import { beforeEach, expect, test, vi } from "vitest";

const { mockAuth, mockLogUsage } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLogUsage: vi.fn(),
}));

vi.mock("../_auth", () => ({
  requireApiKeyAuth: mockAuth,
  logApiUsageSafely: mockLogUsage,
}));

import { GET } from "./route";

beforeEach(() => {
  mockAuth.mockReset();
  mockLogUsage.mockReset();
  mockAuth.mockResolvedValue({
    ok: true,
    key: { id: "APIKEY-1" },
    auth: {
      actorId: "api-key:APIKEY-1",
      role: "admin",
      permissions: ["station.view_admin"],
      csrfToken: "api-key:mrk_test",
    },
    rateLimit: {
      tier: "free",
      limit: 60,
      remaining: 59,
      requestsUsed: 0,
      windowSeconds: 60,
      resetAt: "2026-03-24T12:01:00.000Z",
    },
  });
});

test("catalog route returns machine-readable public route catalog", async () => {
  const response = await GET(new Request("http://localhost/api/v1/catalog"));

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    version: "v1",
    routes: expect.arrayContaining([
      expect.objectContaining({ route: "/api/v1/risk/score", method: "GET" }),
      expect.objectContaining({ route: "/api/v1/usage/summary", method: "GET" }),
    ]),
  });
  expect(mockLogUsage).toHaveBeenCalledOnce();
});
