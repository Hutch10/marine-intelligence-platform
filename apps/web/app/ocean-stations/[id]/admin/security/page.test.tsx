import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import OceanStationSecurityPage from "@/app/ocean-stations/[id]/admin/security/page";
import { oceanStationDetails } from "@/lib/api/mock-data";

const { captured, mockApiClient, navigationSignals, requestCookies } = vi.hoisted(() => ({
  captured: {
    summaryActiveSessionCount: 0,
    alertCount: 0,
    authEventCount: 0,
    authEventNextCursor: null as string | null,
    sessionCount: 0,
    canRevokeSessions: false,
    currentSessionId: null as string | null,
    initialInvestigationFilters: {
      actor: undefined as string | undefined,
      ip: undefined as string | undefined,
      eventType: undefined as string | undefined,
      since: undefined as string | undefined,
      until: undefined as string | undefined,
    },
    initialOperationalAlertFilters: {
      source: undefined as string | undefined,
      status: undefined as string | undefined,
      ruleType: undefined as string | undefined,
      limit: 20,
    },
  },
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
      getSecuritySummary: vi.fn(),
      queryEvents: vi.fn(),
      getSessions: vi.fn(),
      getSecurityAlerts: vi.fn(),
    },
    ingestionOperations: {
      getOperationalAlerts: vi.fn(),
    },
    oceanStations: {
      getStationAdmin: vi.fn(),
    },
  },
  navigationSignals: {
    redirects: [] as string[],
    notFoundCalls: 0,
  },
  requestCookies: {
    stationAdminSession: null as string | null,
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("next/navigation", () => ({
  redirect: (target: string): never => {
    navigationSignals.redirects.push(target);
    throw new Error(`NEXT_REDIRECT:${target}`);
  },
  notFound: (): never => {
    navigationSignals.notFoundCalls += 1;
    throw new Error("NEXT_NOT_FOUND");
  },
}));

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: (name: string): { name: string; value: string } | undefined => {
      if (name === "station_admin_session") {
        return requestCookies.stationAdminSession
          ? { name, value: requestCookies.stationAdminSession }
          : undefined;
      }

      return undefined;
    },
  }),
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ocean-stations/ocean-station-security-console", () => ({
  OceanStationSecurityConsole: ({
    summary,
    alerts,
    authEventNextCursor,
    authContext,
    authEvents,
    sessions,
    canRevokeSessions,
    currentSessionId,
    initialInvestigationFilters,
    initialOperationalAlertFilters,
  }: {
    summary: { activeSessionCount: number };
    alerts: unknown[];
    authEventNextCursor: string | null;
    authContext: { actorId: string };
    authEvents: unknown[];
    sessions: unknown[];
    canRevokeSessions: boolean;
    currentSessionId: string;
    initialInvestigationFilters?: {
      actor?: string;
      ip?: string;
      eventType?: string;
      since?: string;
      until?: string;
    };
    initialOperationalAlertFilters?: {
      source?: string;
      status?: string;
      ruleType?: string;
      limit?: number;
    };
  }) => {
    captured.summaryActiveSessionCount = summary.activeSessionCount;
    captured.alertCount = alerts.length;
    captured.authEventCount = authEvents.length;
    captured.authEventNextCursor = authEventNextCursor;
    captured.sessionCount = sessions.length;
    captured.canRevokeSessions = canRevokeSessions;
    captured.currentSessionId = currentSessionId;
    captured.initialInvestigationFilters = {
      actor: initialInvestigationFilters?.actor,
      ip: initialInvestigationFilters?.ip,
      eventType: initialInvestigationFilters?.eventType,
      since: initialInvestigationFilters?.since,
      until: initialInvestigationFilters?.until,
    };
    captured.initialOperationalAlertFilters = {
      source: initialOperationalAlertFilters?.source,
      status: initialOperationalAlertFilters?.status,
      ruleType: initialOperationalAlertFilters?.ruleType,
      limit: initialOperationalAlertFilters?.limit ?? 20,
    };
    expect(authContext.actorId).toBe("ops.lead@marine.local");
    return <div data-testid="station-security-console" />;
  },
}));

const STATION = oceanStationDetails["STA-NPC-01"];
const FULL_AUTH = {
  actorId: "ops.lead@marine.local",
  role: "admin" as const,
  permissions: [
    "station.view_admin",
    "station.edit_branding",
    "station.edit_content",
    "station.view_audit",
    "station.publish",
  ],
  csrfToken: "csrf-security-page-001",
};

beforeEach(() => {
  captured.summaryActiveSessionCount = 0;
  captured.alertCount = 0;
  captured.authEventCount = 0;
  captured.authEventNextCursor = null;
  captured.sessionCount = 0;
  captured.canRevokeSessions = false;
  captured.currentSessionId = null;
  captured.initialInvestigationFilters = {
    actor: undefined,
    ip: undefined,
    eventType: undefined,
    since: undefined,
    until: undefined,
  };
  captured.initialOperationalAlertFilters = {
    source: undefined,
    status: undefined,
    ruleType: undefined,
    limit: 20,
  };
  navigationSignals.redirects.length = 0;
  navigationSignals.notFoundCalls = 0;
  requestCookies.stationAdminSession = "sess-admin-001";

  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockApiClient.stationAdminAuth.getSecuritySummary.mockReset();
  mockApiClient.stationAdminAuth.queryEvents.mockReset();
  mockApiClient.stationAdminAuth.getSessions.mockReset();
  mockApiClient.stationAdminAuth.getSecurityAlerts.mockReset();
  mockApiClient.ingestionOperations.getOperationalAlerts.mockReset();
  mockApiClient.oceanStations.getStationAdmin.mockReset();

  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(FULL_AUTH);
  mockApiClient.stationAdminAuth.getSecuritySummary.mockResolvedValue({
    activeSessionCount: 2,
    loginSuccessCount24h: 4,
    loginFailureCount24h: 1,
    lockoutCount24h: 1,
    revokeCount24h: 0,
    uniqueIpCount24h: 2,
    lastEventAt: "2026-03-16T11:55:00.000Z",
  });
  mockApiClient.stationAdminAuth.queryEvents.mockResolvedValue({
    events: [
      {
        id: "EVT-1",
        eventType: "login_success",
        actorId: "ops.lead@marine.local",
        sessionId: "sess-admin-001",
        occurredAt: "2026-03-16T11:55:00.000Z",
        ip: "203.0.113.42",
        userAgent: "Ops Browser",
        source: "POST /api/station-admin/login",
      },
    ],
    nextCursor: "2026-03-16T11:55:00.000Z|EVT-1",
  });
  mockApiClient.stationAdminAuth.getSecurityAlerts.mockResolvedValue([
    {
      alertType: "repeated_login_failures_same_ip",
      severity: "high",
      actorId: null,
      ip: "203.0.113.50",
      eventCount: 8,
      timeWindow: "24h",
    },
  ]);
  mockApiClient.stationAdminAuth.getSessions.mockResolvedValue([
    {
      id: "sess-admin-001",
      actorId: "ops.lead@marine.local",
      actorRole: "admin",
      issuedAt: "2026-03-16T08:00:00.000Z",
      expiresAt: "2026-03-16T16:00:00.000Z",
      lastActiveAt: "2026-03-16T11:40:00.000Z",
      ip: "203.0.113.42",
      userAgent: "Ops Browser",
      source: "POST /api/station-admin/login",
    },
  ]);
  mockApiClient.ingestionOperations.getOperationalAlerts.mockResolvedValue({
    source: "db",
    fallbackReason: null,
    generatedAt: "2026-03-16T12:00:00.000Z",
    summary: {
      activeAlertCount: 1,
      criticalCount: 1,
      warningCount: 0,
      infoCount: 0,
      failedSourceCount: 1,
      staleSourceCount: 0,
      lastUpdatedAt: "2026-03-16T12:00:00.000Z",
    },
    activeAlerts: [],
    recentHistory: [],
  });
  mockApiClient.oceanStations.getStationAdmin.mockResolvedValue(STATION);
});

test("station security page redirects to login when session is missing", async () => {
  requestCookies.stationAdminSession = null;

  await expect(
    OceanStationSecurityPage({
      params: { id: STATION.id },
      searchParams: {},
    }),
  ).rejects.toThrow(`NEXT_REDIRECT:/ocean-stations/${STATION.id}/admin/login?next=security`);
});

test("station security page requires station.view_audit", async () => {
  mockApiClient.stationAdminAuth.getSession.mockResolvedValueOnce({
    actorId: "viewer@marine.local",
    role: "viewer",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-viewer-001",
  });

  await expect(
    OceanStationSecurityPage({
      params: { id: STATION.id },
      searchParams: {},
    }),
  ).rejects.toThrow("NEXT_NOT_FOUND");

  expect(navigationSignals.notFoundCalls).toBe(1);
});

test("station security page fetches summary events and sessions", async () => {
  const page = await OceanStationSecurityPage({
    params: { id: STATION.id },
    searchParams: {},
  });

  render(page);

  expect(mockApiClient.stationAdminAuth.getSession).toHaveBeenCalledWith("sess-admin-001");
  expect(mockApiClient.oceanStations.getStationAdmin).toHaveBeenCalledWith(STATION.id, FULL_AUTH);
  expect(mockApiClient.stationAdminAuth.getSecuritySummary).toHaveBeenCalledWith(FULL_AUTH);
  expect(mockApiClient.stationAdminAuth.queryEvents).toHaveBeenCalledWith({ limit: 12 }, FULL_AUTH);
  expect(mockApiClient.stationAdminAuth.getSessions).toHaveBeenCalledWith({ limit: 12 }, FULL_AUTH);
  expect(mockApiClient.stationAdminAuth.getSecurityAlerts).toHaveBeenCalledWith(FULL_AUTH);
  expect(mockApiClient.ingestionOperations.getOperationalAlerts).toHaveBeenCalledWith({ limit: 20 });
  expect(captured.summaryActiveSessionCount).toBe(2);
  expect(captured.alertCount).toBe(1);
  expect(captured.authEventCount).toBe(1);
  expect(captured.authEventNextCursor).toBe("2026-03-16T11:55:00.000Z|EVT-1");
  expect(captured.sessionCount).toBe(1);
  expect(captured.canRevokeSessions).toBe(true);
  expect(captured.currentSessionId).toBe("sess-admin-001");
  expect(captured.initialInvestigationFilters).toEqual({
    actor: undefined,
    ip: undefined,
    eventType: undefined,
    since: undefined,
    until: undefined,
  });
  expect(captured.initialOperationalAlertFilters).toEqual({
    source: undefined,
    status: undefined,
    ruleType: undefined,
    limit: 20,
  });
});

test("station security page hydrates operational alert filters from URL query", async () => {
  const page = await OceanStationSecurityPage({
    params: { id: STATION.id },
    searchParams: {
      actor: " ops.lead@marine.local ",
      ip: " 203.0.113.42 ",
      eventType: "login_failure",
      since: "2026-03-16T08:30",
      until: "2026-03-16T10:45",
      source: " ioos_regional ",
      status: "resolved",
      ruleType: "source_stale",
      limit: "50",
    },
  });

  render(page);

  expect(mockApiClient.ingestionOperations.getOperationalAlerts).toHaveBeenCalledWith({
    source: "ioos_regional",
    status: "resolved",
    ruleType: "source_stale",
    limit: 50,
  });
  expect(captured.initialOperationalAlertFilters).toEqual({
    source: "ioos_regional",
    status: "resolved",
    ruleType: "source_stale",
    limit: 50,
  });
  expect(captured.initialInvestigationFilters).toEqual({
    actor: "ops.lead@marine.local",
    ip: "203.0.113.42",
    eventType: "login_failure",
    since: "2026-03-16T08:30",
    until: "2026-03-16T10:45",
  });
});

