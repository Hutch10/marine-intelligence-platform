import { beforeEach, expect, test, vi } from "vitest";

const { mockRequireSession } = vi.hoisted(() => ({
  mockRequireSession: vi.fn(),
}));

vi.mock("../../marine-intelligence/_utils", () => ({
  requireMarineIntelligenceAdminSession: mockRequireSession,
}));

import { POST } from "./route";

beforeEach(() => {
  mockRequireSession.mockReset();

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

const DISABLED_BODY = {
  code: "api_key_admin_disabled",
  message: "Admin API key provisioning is disabled in this deployment.",
  retryable: false,
};

test("admin keys route returns 503 — provisioning disabled (missing name)", async () => {
  const response = await POST(
    new Request("http://localhost/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tier: "pro" }),
    }),
  );

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual(DISABLED_BODY);
});

test("admin keys route returns 503 — provisioning disabled (invalid tier)", async () => {
  const response = await POST(
    new Request("http://localhost/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pilot", tier: "gold" }),
    }),
  );

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual(DISABLED_BODY);
});

test("admin keys route returns 503 — provisioning disabled (valid payload)", async () => {
  const response = await POST(
    new Request("http://localhost/api/admin/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Pilot", tier: "pro" }),
    }),
  );

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual(DISABLED_BODY);
});
