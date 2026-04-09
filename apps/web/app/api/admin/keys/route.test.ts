import { beforeEach, expect, test, vi } from "vitest";

const { mockRequireSession, mockGenerateKey } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
  mockGenerateKey: vi.fn(),
}));

vi.mock("@/lib/server/public-api-store", () => ({
  generatePublicApiKey: mockGenerateKey,
}));

vi.mock("../../marine-intelligence/_utils", () => ({
  requireMarineIntelligenceAdminSession: mockRequireSession,
}));

import { POST } from "./route";

beforeEach(() => {
  mockRequireSession.mockReset();
  mockGenerateKey.mockReset();

  mockRequireSession.mockResolvedValue({
    ok: true,
    auth: {
      actorId: "ops.lead@marine.local",
      role: "admin",
      permissions: ["station.view_admin"],
      csrfToken: "csrf-token",
    },
  });
});

test("admin keys route returns standardized validation errors", async () => {
  const response = await POST(
    new Request("http://localhost/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "pro" }),
    }),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    code: "api_key_name_required",
    message: "name is required",
    retryable: false,
  });
});

test("admin keys route rejects unsupported tiers", async () => {
  const response = await POST(
    new Request("http://localhost/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pilot", tier: "gold" }),
    }),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    code: "api_key_tier_invalid",
    message: "tier is invalid",
    retryable: false,
  });
});

test("admin keys route provisions API keys", async () => {
  mockGenerateKey.mockResolvedValueOnce({
    ok: true,
    key: {
      id: "APIKEY-1",
      prefix: "mrk_12345678",
      tier: "pro",
      billingAccountId: "BACC-1",
    },
    rawKey: "mrk_secret",
  });

  const response = await POST(
    new Request("http://localhost/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pilot", tier: "pro" }),
    }),
  );

  expect(response.status).toBe(201);
  await expect(response.json()).resolves.toMatchObject({
    keyId: "APIKEY-1",
    rawKey: "mrk_secret",
    tier: "pro",
    billingAccountId: "BACC-1",
  });
});
