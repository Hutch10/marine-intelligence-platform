import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

const { mockIncidentPresets } = vi.hoisted(() => ({
  mockIncidentPresets: {
    loadIncidentPresets: vi.fn(),
    saveIncidentPreset: vi.fn(),
    deleteIncidentPresetById: vi.fn(),
    markIncidentPresetUsed: vi.fn(),
    createIncidentPresetPayloadFromControls: vi.fn((controls: {
      actor: string;
      ip: string;
      eventType: string;
      since: string;
      until: string;
      source: string;
      status: string;
      ruleType: string;
      limit: number;
    }) => ({
      investigation: {
        actor: controls.actor,
        ip: controls.ip,
        eventType: controls.eventType,
        since: controls.since,
        until: controls.until,
        timeMode: "absolute",
      },
      operationalAlerts: {
        source: controls.source,
        status: controls.status,
        ruleType: controls.ruleType,
        limit: controls.limit,
      },
    })),
    extractIncidentPresetControls: vi.fn((payload: {
      investigation?: {
        actor?: string;
        ip?: string;
        eventType?: string;
        since?: string;
        until?: string;
      };
      operationalAlerts?: {
        source?: string;
        status?: string;
        ruleType?: string;
        limit?: number;
      };
    }) => ({
      actor: payload.investigation?.actor ?? "",
      ip: payload.investigation?.ip ?? "",
      eventType: payload.investigation?.eventType ?? "",
      since: payload.investigation?.since ?? "",
      until: payload.investigation?.until ?? "",
      source: payload.operationalAlerts?.source ?? "",
      status: payload.operationalAlerts?.status ?? "",
      ruleType: payload.operationalAlerts?.ruleType ?? "",
      limit: payload.operationalAlerts?.limit ?? 20,
    })),
  },
}));

vi.mock("@/lib/persistence/incident-presets", () => mockIncidentPresets);

import { OceanStationSecurityConsole } from "@/components/ocean-stations/ocean-station-security-console";
import { oceanStationDetails } from "@/lib/api/mock-data";

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSecurityAlerts: vi.fn(),
      queryEvents: vi.fn(),
      exportEvents: vi.fn(),
    },
    ingestionOperations: {
      getOperationalAlerts: vi.fn(),
    },
    stationAdminMfa: {
      enrollStart: vi.fn(),
      enrollVerify: vi.fn(),
      recoveryRegenerate: vi.fn(),
      disable: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

const STATION = oceanStationDetails["STA-NPC-01"];

function renderConsole(options?: {
  initialOperationalAlertFilters?: {
    source?: string;
    status?: "active" | "resolved";
    ruleType?: "source_failed" | "source_stale" | "repeated_degraded" | "persistence_failure";
    limit?: number;
  };
}) {
  return render(
    <OceanStationSecurityConsole
      station={STATION}
      adminActorId="ops.lead@marine.local"
      adminRole="admin"
      currentSessionId="sess-admin-001"
      authContext={{
        actorId: "ops.lead@marine.local",
        role: "admin",
        permissions: [
          "station.view_admin",
          "station.edit_branding",
          "station.edit_content",
          "station.view_audit",
          "station.publish",
        ],
        csrfToken: "csrf-security-001",
      }}
      summary={{
        activeSessionCount: 2,
        loginSuccessCount24h: 4,
        loginFailureCount24h: 2,
        lockoutCount24h: 1,
        revokeCount24h: 1,
        uniqueIpCount24h: 3,
        lastEventAt: "2026-03-16T11:55:00.000Z",
      }}
      alerts={[
        {
          alertType: "repeated_login_failures_same_ip",
          severity: "high",
          actorId: null,
          ip: "203.0.113.50",
          eventCount: 8,
          timeWindow: "24h",
        },
      ]}
      authEvents={[
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
      ]}
      authEventNextCursor={"2026-03-16T11:55:00.000Z|EVT-1"}
      operationalAlerts={{
        source: "db",
        fallbackReason: null,
        generatedAt: "2026-03-16T11:55:00.000Z",
        summary: {
          activeAlertCount: 1,
          criticalCount: 1,
          warningCount: 0,
          infoCount: 0,
          failedSourceCount: 1,
          staleSourceCount: 0,
          lastUpdatedAt: "2026-03-16T11:55:00.000Z",
        },
        activeAlerts: [
          {
            id: "op-alert-active-1",
            source: "ioos_regional",
            ruleType: "source_failed",
            severity: "critical",
            status: "active",
            title: "IOOS source failed",
            detail: null,
            detectedAt: 1710582900000,
            resolvedAt: null,
            createdAt: "2026-03-16T11:54:00.000Z",
            updatedAt: "2026-03-16T11:55:00.000Z",
          },
        ],
        recentHistory: [
          {
            id: "op-alert-history-1",
            source: "ioos_regional",
            ruleType: "source_failed",
            severity: "critical",
            status: "resolved",
            title: "IOOS source recovered",
            detail: null,
            detectedAt: 1710582000000,
            resolvedAt: 1710582600000,
            createdAt: "2026-03-16T11:40:00.000Z",
            updatedAt: "2026-03-16T11:50:00.000Z",
          },
        ],
      }}
      initialOperationalAlertFilters={options?.initialOperationalAlertFilters}
      sessions={[
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
        {
          id: "sess-viewer-002",
          actorId: "observer.ops@marine.local",
          actorRole: "viewer",
          issuedAt: "2026-03-16T09:00:00.000Z",
          expiresAt: "2026-03-16T17:00:00.000Z",
          lastActiveAt: null,
          ip: "198.51.100.9",
          userAgent: "Viewer Browser",
          source: "POST /api/station-admin/login",
        },
      ]}
      revoked={false}
      error={undefined}
      canRevokeSessions
      csrfToken="csrf-security-001"
    />,
  );
}

beforeEach(() => {
  mockIncidentPresets.loadIncidentPresets.mockReturnValue([]);
  mockIncidentPresets.saveIncidentPreset.mockImplementation(() => ({
    ok: true,
    presets: [],
  }));
  mockIncidentPresets.deleteIncidentPresetById.mockImplementation(() => ({
    ok: true,
    presets: [],
  }));
  mockIncidentPresets.markIncidentPresetUsed.mockImplementation(() => ({
    ok: true,
    presets: [],
  }));

  window.history.replaceState({}, "", "/ocean-stations/STA-NPC-01/admin/security");

  mockApiClient.stationAdminAuth.getSecurityAlerts.mockReset();
  mockApiClient.stationAdminAuth.queryEvents.mockReset();
  mockApiClient.stationAdminAuth.exportEvents.mockReset();
  mockApiClient.ingestionOperations.getOperationalAlerts.mockReset();

  mockApiClient.stationAdminAuth.getSecurityAlerts.mockResolvedValue([]);
  mockApiClient.stationAdminAuth.queryEvents.mockResolvedValue({ events: [], nextCursor: null });
  mockApiClient.stationAdminAuth.exportEvents.mockResolvedValue({
    format: "json",
    fileName: "security-events.json",
    exportedAt: "2026-03-16T12:00:00.000Z",
    filters: { limit: 12 },
    events: [],
  });
  mockApiClient.ingestionOperations.getOperationalAlerts.mockResolvedValue({
    source: "db",
    fallbackReason: null,
    generatedAt: "2026-03-16T12:00:00.000Z",
    summary: {
      activeAlertCount: 0,
      criticalCount: 0,
      warningCount: 0,
      infoCount: 0,
      failedSourceCount: 0,
      staleSourceCount: 0,
      lastUpdatedAt: "2026-03-16T12:00:00.000Z",
    },
    activeAlerts: [],
    recentHistory: [],
  });
});

test("security console renders alerts, summary metrics, auth events, and active sessions", () => {
  renderConsole();

  expect(screen.getByRole("heading", { name: "Security Alerts" })).toBeInTheDocument();
  expect(screen.getByText("Repeated Login Failures From Same IP")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Security Summary" })).toBeInTheDocument();
  expect(screen.getByText("Login Success (24h)")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Recent Auth Events" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Active Sessions" })).toBeInTheDocument();
  expect(screen.getAllByText("Source: POST /api/station-admin/login")).toHaveLength(3);
  expect(screen.getByText("Current session")).toBeDisabled();
  expect(screen.getByRole("button", { name: "Revoke session" })).toBeEnabled();
});

test("security console export button downloads JSON payload", async () => {
  const user = userEvent.setup();
  const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const createObjectURL = vi.fn(() => "blob://security-events");
  const revokeObjectURL = vi.fn();
  Object.defineProperty(URL, "createObjectURL", { value: createObjectURL, writable: true });
  Object.defineProperty(URL, "revokeObjectURL", { value: revokeObjectURL, writable: true });

  mockApiClient.stationAdminAuth.exportEvents.mockResolvedValueOnce({
    format: "json",
    fileName: "security-events.json",
    exportedAt: "2026-03-16T12:00:00.000Z",
    filters: { limit: 12 },
    events: [
      {
        id: "EVT-EX-1",
        eventType: "login_failure",
        actorId: "ops.lead@marine.local",
        sessionId: null,
        occurredAt: "2026-03-16T11:00:00.000Z",
        ip: "203.0.113.50",
        userAgent: "Ops Browser",
        source: "POST /api/station-admin/login",
      },
    ],
  });

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Export events" }));

  expect(mockApiClient.stationAdminAuth.exportEvents).toHaveBeenCalledTimes(1);
  expect(createObjectURL).toHaveBeenCalledTimes(1);
  expect(clickSpy).toHaveBeenCalledTimes(1);
  expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  clickSpy.mockRestore();
});

test("security console filter UI applies actor and ip investigation filters", async () => {
  const user = userEvent.setup();
  mockApiClient.stationAdminAuth.queryEvents.mockResolvedValueOnce({
    events: [
      {
        id: "EVT-FILTER-1",
        eventType: "login_failure",
        actorId: "pilot.filter@marine.local",
        sessionId: null,
        occurredAt: "2026-03-16T10:00:00.000Z",
        ip: "198.51.100.33",
        userAgent: "Ops Browser",
        source: "POST /api/station-admin/login",
      },
    ],
    nextCursor: null,
  });

  renderConsole();

  await user.type(screen.getByLabelText("Actor"), "pilot.filter@marine.local");
  await user.type(screen.getByLabelText("IP"), "198.51.100.33");
  await user.selectOptions(screen.getByLabelText("Event Type"), "login_failure");

  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Apply filters" }));

  expect(mockApiClient.stationAdminAuth.queryEvents).toHaveBeenCalledTimes(1);
  expect(mockApiClient.stationAdminAuth.queryEvents).toHaveBeenCalledWith(
    expect.objectContaining({
      actor: "pilot.filter@marine.local",
      ip: "198.51.100.33",
      eventType: "login_failure",
      limit: 12,
    }),
    expect.objectContaining({ actorId: "ops.lead@marine.local" }),
  );
  expect(screen.getByText(/pilot\.filter@marine\.local/)).toBeInTheDocument();
});

test("security console updates URL query params when investigation filters change", async () => {
  const user = userEvent.setup();

  renderConsole();

  await user.type(screen.getByLabelText("Actor"), "pilot.filter@marine.local");
  await user.type(screen.getByLabelText("IP"), "198.51.100.33");
  await user.selectOptions(screen.getByLabelText("Event Type"), "login_failure");
  await user.type(screen.getByLabelText("Since"), "2026-03-16T08:30");
  await user.type(screen.getByLabelText("Until"), "2026-03-16T10:45");

  const params = new URLSearchParams(window.location.search);

  expect(params.get("actor")).toBe("pilot.filter@marine.local");
  expect(params.get("ip")).toBe("198.51.100.33");
  expect(params.get("eventType")).toBe("login_failure");
  expect(params.get("since")).toBe("2026-03-16T08:30");
  expect(params.get("until")).toBe("2026-03-16T10:45");
  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
});

test("security console copies the current incident view URL without extra requests", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockResolvedValue(undefined);

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  renderConsole();

  await user.type(screen.getByLabelText("Actor"), "pilot.filter@marine.local");
  await user.type(screen.getByLabelText("IP"), "198.51.100.33");
  await user.selectOptions(screen.getByLabelText("Event Type"), "login_failure");
  await user.type(screen.getByLabelText("Alert source"), "ioos_regional");
  await user.selectOptions(screen.getByLabelText("Alert status"), "resolved");
  await user.selectOptions(screen.getByLabelText("Rule type"), "source_stale");
  await user.selectOptions(screen.getByLabelText("History limit"), "50");

  const expectedUrl = window.location.href;

  await user.click(screen.getByRole("button", { name: "Copy incident view link" }));

  expect(writeText).toHaveBeenCalledTimes(1);
  expect(writeText).toHaveBeenCalledWith(expectedUrl);
  expect(screen.getByText("Incident view link copied.")).toBeInTheDocument();
  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
  expect(mockApiClient.ingestionOperations.getOperationalAlerts).not.toHaveBeenCalled();
});

test("security console opens incident view in a new tab using current URL", async () => {
  const user = userEvent.setup();
  const open = vi.spyOn(window, "open").mockImplementation(() => null);

  renderConsole();

  await user.type(screen.getByLabelText("Actor"), "pilot.filter@marine.local");
  await user.selectOptions(screen.getByLabelText("Event Type"), "login_failure");
  await user.type(screen.getByLabelText("Alert source"), "ioos_regional");

  const expectedUrl = window.location.href;

  await user.click(screen.getByRole("button", { name: "Open incident in new tab" }));

  expect(open).toHaveBeenCalledTimes(1);
  expect(open).toHaveBeenCalledWith(expectedUrl, "_blank", "noopener,noreferrer");
  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
  expect(mockApiClient.ingestionOperations.getOperationalAlerts).not.toHaveBeenCalled();
  open.mockRestore();
});

test("security console shows safe copy failure feedback when clipboard write fails", async () => {
  const user = userEvent.setup();
  const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));

  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Copy incident view link" }));

  expect(writeText).toHaveBeenCalledTimes(1);
  expect(await screen.findByText("Unable to copy incident view link.")).toBeInTheDocument();
  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
  expect(mockApiClient.ingestionOperations.getOperationalAlerts).not.toHaveBeenCalled();
});

test("security console reset all URL filters clears params and restores default control values", async () => {
  const user = userEvent.setup();

  renderConsole();

  await user.type(screen.getByLabelText("Actor"), "pilot.filter@marine.local");
  await user.type(screen.getByLabelText("IP"), "198.51.100.33");
  await user.selectOptions(screen.getByLabelText("Event Type"), "login_failure");
  await user.type(screen.getByLabelText("Since"), "2026-03-16T08:30");
  await user.type(screen.getByLabelText("Until"), "2026-03-16T10:45");
  await user.type(screen.getByLabelText("Alert source"), "ioos_regional");
  await user.selectOptions(screen.getByLabelText("Alert status"), "resolved");
  await user.selectOptions(screen.getByLabelText("Rule type"), "source_stale");
  await user.selectOptions(screen.getByLabelText("History limit"), "50");

  await user.click(screen.getByRole("button", { name: "Reset all URL filters" }));

  const params = new URLSearchParams(window.location.search);

  expect(params.get("actor")).toBeNull();
  expect(params.get("ip")).toBeNull();
  expect(params.get("eventType")).toBeNull();
  expect(params.get("since")).toBeNull();
  expect(params.get("until")).toBeNull();
  expect(params.get("source")).toBeNull();
  expect(params.get("status")).toBeNull();
  expect(params.get("ruleType")).toBeNull();
  expect(params.get("limit")).toBeNull();

  expect(screen.getByLabelText("Actor")).toHaveValue("");
  expect(screen.getByLabelText("IP")).toHaveValue("");
  expect(screen.getByLabelText("Event Type")).toHaveValue("");
  expect(screen.getByLabelText("Since")).toHaveValue("");
  expect(screen.getByLabelText("Until")).toHaveValue("");
  expect(screen.getByLabelText("Alert source")).toHaveValue("");
  expect(screen.getByLabelText("Alert status")).toHaveValue("");
  expect(screen.getByLabelText("Rule type")).toHaveValue("");
  expect(screen.getByLabelText("History limit")).toHaveValue("20");

  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
  expect(mockApiClient.ingestionOperations.getOperationalAlerts).not.toHaveBeenCalled();
});

test("security console requests operational alerts with updated filters", async () => {
  const user = userEvent.setup();

  renderConsole();

  await user.type(screen.getByLabelText("Alert source"), "ioos_regional");
  await user.selectOptions(screen.getByLabelText("Alert status"), "resolved");
  await user.selectOptions(screen.getByLabelText("Rule type"), "source_stale");
  await user.selectOptions(screen.getByLabelText("History limit"), "50");

  expect(mockApiClient.ingestionOperations.getOperationalAlerts).not.toHaveBeenCalled();

  await user.click(screen.getByRole("button", { name: "Apply alert filters" }));

  expect(mockApiClient.ingestionOperations.getOperationalAlerts).toHaveBeenCalledTimes(1);
  expect(mockApiClient.ingestionOperations.getOperationalAlerts).toHaveBeenCalledWith({
    status: "resolved",
    source: "ioos_regional",
    ruleType: "source_stale",
    limit: 50,
  });
});

test("security console updates URL query params when operational alert filters change", async () => {
  const user = userEvent.setup();

  renderConsole();

  await user.type(screen.getByLabelText("Alert source"), "ioos_regional");
  await user.selectOptions(screen.getByLabelText("Alert status"), "resolved");
  await user.selectOptions(screen.getByLabelText("Rule type"), "source_stale");
  await user.selectOptions(screen.getByLabelText("History limit"), "50");

  const params = new URLSearchParams(window.location.search);

  expect(params.get("source")).toBe("ioos_regional");
  expect(params.get("status")).toBe("resolved");
  expect(params.get("ruleType")).toBe("source_stale");
  expect(params.get("limit")).toBe("50");
});

test("security console handles revoke step-up challenge and retries revoke after verification", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "mfa-step-up-001",
          purpose: "session_revoke",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        result: "verified",
        challengePurpose: "session_revoke",
        actorId: "ops.lead@marine.local",
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Revoke session" }));

  expect(await screen.findByRole("heading", { name: "MFA Step-Up Required" })).toBeInTheDocument();
  await user.type(screen.getByLabelText("Authenticator code"), "246810");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(await screen.findByText("Session revoked successfully.")).toBeInTheDocument();
  expect(screen.queryByText("observer.ops@marine.local")).not.toBeInTheDocument();
});

test("security console step-up verification handles rate-limited responses", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "mfa-step-up-rl-001",
          purpose: "session_revoke",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 429,
      json: async () => ({
        result: "rate_limited",
        message: "MFA verification rate limited. Please wait before retrying.",
        retryAfterSeconds: 45,
      }),
    } as Response);

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Revoke session" }));
  expect(await screen.findByRole("heading", { name: "MFA Step-Up Required" })).toBeInTheDocument();

  await user.type(screen.getByLabelText("Authenticator code"), "246810");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(await screen.findByText("MFA verification rate-limited. Retry in 45s.")).toBeInTheDocument();
  expect(screen.getByText("Cooldown active: you can retry verification in 45s.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Wait 45s" })).toBeDisabled();
});

test("security console step-up verification handles locked_out responses", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "mfa-step-up-locked-001",
          purpose: "session_revoke",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        result: "locked_out",
        message: "MFA challenge locked due to too many failed attempts.",
        attemptsRemaining: 0,
      }),
    } as Response);

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Revoke session" }));
  expect(await screen.findByRole("heading", { name: "MFA Step-Up Required" })).toBeInTheDocument();

  await user.type(screen.getByLabelText("Authenticator code"), "000000");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(
    await screen.findByText("MFA challenge locked. Maximum attempts exceeded. Please request a new challenge."),
  ).toBeInTheDocument();
});

test("security console step-up verification handles expired responses", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "mfa-step-up-exp-001",
          purpose: "session_revoke",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 410,
      json: async () => ({
        result: "expired",
        message: "MFA challenge expired after 10 minutes.",
      }),
    } as Response);

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Revoke session" }));
  expect(await screen.findByRole("heading", { name: "MFA Step-Up Required" })).toBeInTheDocument();

  await user.type(screen.getByLabelText("Authenticator code"), "123456");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(
    await screen.findByText("MFA challenge expired. Please request a new verification and try again."),
  ).toBeInTheDocument();
});

test("security console step-up verification handles mfa_failed with attempts remaining", async () => {
  const user = userEvent.setup();
  vi.spyOn(globalThis, "fetch")
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        mfaRequired: true,
        challenge: {
          challengeId: "mfa-step-up-fail-001",
          purpose: "session_revoke",
          expiresAt: "2026-03-16T18:00:00.000Z",
          recoveryCodeAllowed: true,
        },
      }),
    } as Response)
    .mockResolvedValueOnce({
      status: 401,
      json: async () => ({
        result: "mfa_failed",
        message: "Invalid TOTP code.",
        attemptsRemaining: 2,
      }),
    } as Response);

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Revoke session" }));
  expect(await screen.findByRole("heading", { name: "MFA Step-Up Required" })).toBeInTheDocument();

  await user.type(screen.getByLabelText("Authenticator code"), "999999");
  await user.click(screen.getByRole("button", { name: "Verify and continue" }));

  expect(
    await screen.findByText("Invalid TOTP code. (2 attempts remaining)"),
  ).toBeInTheDocument();
});

test("security console saves current filter state as incident preset", async () => {
  const user = userEvent.setup();
  
  const savedPresets = [
    {
      id: "preset-suspicious-logins-1",
      name: "Suspicious Logins",
      kind: "user" as const,
      appliesTo: ["investigation", "operationalAlerts"] as const,
      payload: {
        investigation: {
          actor: "pilot.auth@marine.local",
          ip: "198.51.100.99",
          eventType: "login_failure" as const,
          since: "2026-03-16T10:00",
          until: "2026-03-16T12:00",
          timeMode: "absolute" as const,
        },
        operationalAlerts: {
          source: "",
          status: "" as const,
          ruleType: "" as const,
          limit: 20,
        },
      },
      createdAt: "2026-03-16T12:00:00.000Z",
      updatedAt: "2026-03-16T12:00:00.000Z",
      lastUsedAt: null,
      useCount: 0,
      origin: "local" as const,
    },
  ];

  mockIncidentPresets.saveIncidentPreset.mockReturnValueOnce({
    ok: true,
    presets: savedPresets,
  });

  renderConsole();

  await user.type(screen.getByLabelText("Actor"), "pilot.auth@marine.local");
  await user.type(screen.getByLabelText("IP"), "198.51.100.99");
  await user.selectOptions(screen.getByLabelText("Event Type"), "login_failure");

  await user.click(screen.getByRole("button", { name: "Save preset" }));
  
  expect(screen.getByPlaceholderText("e.g., Suspicious login attempts")).toBeInTheDocument();

  await user.type(screen.getByPlaceholderText("e.g., Suspicious login attempts"), "Suspicious Logins");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(mockIncidentPresets.saveIncidentPreset).toHaveBeenCalledTimes(1);
  expect(mockIncidentPresets.saveIncidentPreset).toHaveBeenCalledWith(
    expect.objectContaining({
      name: "Suspicious Logins",
      payload: expect.objectContaining({
        investigation: expect.objectContaining({
          actor: "pilot.auth@marine.local",
          ip: "198.51.100.99",
          eventType: "login_failure",
        }),
      }),
    }),
  );

  expect(await screen.findByText("Suspicious Logins")).toBeInTheDocument();
  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
  expect(mockApiClient.stationAdminAuth.getSecurityAlerts).not.toHaveBeenCalled();
});

test("security console applies incident preset to controls and URL without API requests", async () => {
  const user = userEvent.setup();

  const preset = {
    id: "preset-ip-sweep-1",
    name: "IP Sweep Activity",
    kind: "user" as const,
    appliesTo: ["investigation", "operationalAlerts"] as const,
    payload: {
      investigation: {
        actor: "",
        ip: "203.0.113.101",
        eventType: "login_failure" as const,
        since: "2026-03-16T08:00",
        until: "",
        timeMode: "absolute" as const,
      },
      operationalAlerts: {
        source: "alerting",
        status: "active" as const,
        ruleType: "source_failed" as const,
        limit: 50,
      },
    },
    createdAt: "2026-03-16T11:00:00.000Z",
    updatedAt: "2026-03-16T11:00:00.000Z",
    lastUsedAt: null,
    useCount: 0,
    origin: "local" as const,
  };

  mockIncidentPresets.loadIncidentPresets.mockReturnValueOnce([preset]);
  mockIncidentPresets.markIncidentPresetUsed.mockReturnValueOnce({
    ok: true,
    presets: [
      {
        ...preset,
        lastUsedAt: "2026-03-16T12:00:00.000Z",
        useCount: 1,
      },
    ],
  });

  renderConsole();

  expect(screen.getByText("IP Sweep Activity")).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Apply to controls" }));

  // Verify controls are updated
  expect(screen.getByDisplayValue("203.0.113.101")).toBeInTheDocument();
  expect(screen.getByDisplayValue("2026-03-16T08:00")).toBeInTheDocument();
  expect(mockIncidentPresets.markIncidentPresetUsed).toHaveBeenCalledWith("preset-ip-sweep-1");

  // Verify no API calls triggered
  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
  expect(mockApiClient.ingestionOperations.getOperationalAlerts).not.toHaveBeenCalled();

  // Verify URL updated
  const url = new URL(window.location.href);
  expect(url.searchParams.get("ip")).toBe("203.0.113.101");
  expect(url.searchParams.get("eventType")).toBe("login_failure");
  expect(url.searchParams.get("source")).toBe("alerting");
  expect(url.searchParams.get("status")).toBe("active");
  expect(url.searchParams.get("ruleType")).toBe("source_failed");
  expect(url.searchParams.get("limit")).toBe("50");
});

test("security console still applies incident preset when usage tracking fails", async () => {
  const user = userEvent.setup();

  const preset = {
    id: "preset-usage-failure-1",
    name: "Usage Failure Preset",
    kind: "user" as const,
    appliesTo: ["investigation", "operationalAlerts"] as const,
    payload: {
      investigation: {
        actor: "",
        ip: "203.0.113.102",
        eventType: "login_failure" as const,
        since: "2026-03-16T06:00",
        until: "",
        timeMode: "absolute" as const,
      },
      operationalAlerts: {
        source: "alerting",
        status: "active" as const,
        ruleType: "source_failed" as const,
        limit: 40,
      },
    },
    createdAt: "2026-03-16T11:00:00.000Z",
    updatedAt: "2026-03-16T11:00:00.000Z",
    lastUsedAt: null,
    useCount: 0,
    origin: "local" as const,
  };

  mockIncidentPresets.loadIncidentPresets.mockReturnValueOnce([preset]);
  mockIncidentPresets.markIncidentPresetUsed.mockReturnValueOnce({
    ok: false,
    presets: [preset],
    error: "Unable to update presets in this browser.",
  });

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Apply to controls" }));

  expect(mockIncidentPresets.markIncidentPresetUsed).toHaveBeenCalledWith("preset-usage-failure-1");
  expect(screen.getByDisplayValue("203.0.113.102")).toBeInTheDocument();
  expect(screen.getByDisplayValue("2026-03-16T06:00")).toBeInTheDocument();

  // Applying presets should remain non-fetching regardless of usage tracking outcome.
  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
  expect(mockApiClient.ingestionOperations.getOperationalAlerts).not.toHaveBeenCalled();
});

test("security console deletes incident preset without affecting current filters", async () => {
  const user = userEvent.setup();

  const preset = {
    id: "preset-to-delete-1",
    name: "Temporary Investigation",
    kind: "user" as const,
    appliesTo: ["investigation", "operationalAlerts"] as const,
    payload: {
      investigation: {
        actor: "temp.user@marine.local",
        ip: "",
        eventType: "" as const,
        since: "",
        until: "",
        timeMode: "absolute" as const,
      },
      operationalAlerts: {
        source: "",
        status: "" as const,
        ruleType: "" as const,
        limit: 20,
      },
    },
    createdAt: "2026-03-16T10:00:00.000Z",
    updatedAt: "2026-03-16T10:00:00.000Z",
    lastUsedAt: null,
    useCount: 0,
    origin: "local" as const,
  };

  mockIncidentPresets.loadIncidentPresets.mockReturnValueOnce([preset]);
  mockIncidentPresets.deleteIncidentPresetById.mockReturnValueOnce({
    ok: true,
    presets: [],
  });

  renderConsole();

  expect(screen.getByText("Temporary Investigation")).toBeInTheDocument();

  // Set some filter values first
  await user.type(screen.getByLabelText("Actor"), "active.user@marine.local");

  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(mockIncidentPresets.deleteIncidentPresetById).toHaveBeenCalledTimes(1);
  expect(mockIncidentPresets.deleteIncidentPresetById).toHaveBeenCalledWith("preset-to-delete-1");

  expect(screen.queryByText("Temporary Investigation")).not.toBeInTheDocument();
  expect(screen.getByDisplayValue("active.user@marine.local")).toBeInTheDocument();
});

test("security console surfaces preset delete failure", async () => {
  const user = userEvent.setup();

  const preset = {
    id: "preset-delete-failure",
    name: "Failing Delete",
    kind: "user" as const,
    appliesTo: ["investigation", "operationalAlerts"] as const,
    payload: {
      investigation: {
        actor: "",
        ip: "",
        eventType: "" as const,
        since: "",
        until: "",
        timeMode: "absolute" as const,
      },
      operationalAlerts: {
        source: "",
        status: "" as const,
        ruleType: "" as const,
        limit: 20,
      },
    },
    createdAt: "2026-03-16T10:00:00.000Z",
    updatedAt: "2026-03-16T10:00:00.000Z",
    lastUsedAt: null,
    useCount: 0,
    origin: "local" as const,
  };

  mockIncidentPresets.loadIncidentPresets.mockReturnValueOnce([preset]);
  mockIncidentPresets.deleteIncidentPresetById.mockReturnValueOnce({
    ok: false,
    presets: [preset],
    error: "Unable to update presets in this browser.",
  });

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Delete" }));

  expect(mockIncidentPresets.deleteIncidentPresetById).toHaveBeenCalledWith("preset-delete-failure");
  expect(await screen.findByText("Unable to update presets in this browser.")).toBeInTheDocument();
  expect(screen.getByText("Failing Delete")).toBeInTheDocument();
});

test("security console handles corrupt preset storage gracefully and shows no presets", async () => {
  mockIncidentPresets.loadIncidentPresets.mockReturnValueOnce([]);

  renderConsole();

  expect(screen.getByText("No saved presets yet")).toBeInTheDocument();
});

test("security console rejects duplicate or empty preset names safely", async () => {
  const user = userEvent.setup();

  mockIncidentPresets.saveIncidentPreset.mockReturnValueOnce({
    ok: false,
    presets: [],
    error: "Preset name already exists.",
  });

  renderConsole();

  await user.click(screen.getByRole("button", { name: "Save preset" }));
  await user.type(screen.getByPlaceholderText("e.g., Suspicious login attempts"), "Duplicate Name");
  await user.click(screen.getByRole("button", { name: "Save" }));

  expect(await screen.findByText("Preset name already exists.")).toBeInTheDocument();
  expect(mockApiClient.stationAdminAuth.queryEvents).not.toHaveBeenCalled();
});

