import { NextRequest } from "next/server";
import { beforeEach, expect, test, vi } from "vitest";

const { mockAuth, mockLogUsage, mockBuildAlerts } = vi.hoisted(() => ({
  mockAuth: vi.fn(),
  mockLogUsage: vi.fn(),
  mockBuildAlerts: vi.fn(),
}));

vi.mock("../_auth", () => ({
  requireApiKeyAuth: mockAuth,
  logApiUsageSafely: mockLogUsage,
}));

vi.mock("../../../../../api/src/routes/marine-intelligence", () => ({
  buildMarineWorkflowAlertsRouteResponse: mockBuildAlerts,
}));

import { GET } from "./route";

beforeEach(() => {
  mockAuth.mockReset();
  mockLogUsage.mockReset();
  mockBuildAlerts.mockReset();

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
  mockBuildAlerts.mockReturnValue({
    status: 200,
    json: {
      alerts: [
        {
          id: "MALT-1",
          eventId: "MEV-1",
          eventTitle: "Composite anomaly",
          eventStatus: "detected",
          stationId: "46042",
          region: "North Pacific",
          investigationId: null,
          severity: "high",
          status: "active",
          ruleType: "threshold_breach",
          title: "Escalate review",
          detail: "High-risk anomaly cluster.",
          detectedAt: "2026-03-24T12:00:00.000Z",
          acknowledgedAt: null,
          resolvedAt: null,
          createdAt: "2026-03-24T12:00:00.000Z",
          updatedAt: "2026-03-24T12:00:00.000Z",
        },
      ],
    },
    telemetry: {
      route: "GET /marine-intelligence/alerts",
      source: "db",
      result: "found",
      alertCount: 1,
      filtersApplied: true,
    },
  });
});

test("alerts route returns standardized error contracts", async () => {
  const response = await GET(
    new NextRequest("http://localhost/api/v1/alerts?severity=severe"),
  );

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({
    code: "alerts_invalid_severity",
    message: "severity is invalid",
    retryable: false,
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

test("alerts route echoes normalized filters and defaults", async () => {
  const response = await GET(
    new NextRequest("http://localhost/api/v1/alerts?stationId=46042&severity=high&status=active"),
  );

  expect(response.status).toBe(200);
  expect(response.headers.get("x-ratelimit-limit")).toBe("60");
  expect(response.headers.get("x-ratelimit-remaining")).toBe("59");
  expect(mockBuildAlerts).toHaveBeenCalledWith(
    expect.objectContaining({ actorId: "api-key:APIKEY-1" }),
    {
      stationId: "46042",
      status: "active",
      severity: "high",
      limit: 50,
    },
  );
  await expect(response.json()).resolves.toMatchObject({
    total: 1,
    appliedFilters: {
      stationId: "46042",
      severity: "high",
      status: "active",
      limit: 50,
    },
    pagination: {
      limit: 50,
      returned: 1,
      total: 1,
      maxLimit: 200,
      defaultsApplied: ["limit"],
    },
  });
});

test("alerts route clamps oversized limits to the server maximum", async () => {
  const response = await GET(
    new NextRequest("http://localhost/api/v1/alerts?limit=999"),
  );

  expect(response.status).toBe(200);
  expect(mockBuildAlerts).toHaveBeenCalledWith(
    expect.anything(),
    expect.objectContaining({ limit: 200 }),
  );
  await expect(response.json()).resolves.toMatchObject({
    appliedFilters: {
      stationId: null,
      severity: null,
      status: null,
      limit: 200,
    },
    pagination: {
      limit: 200,
    },
  });
});
