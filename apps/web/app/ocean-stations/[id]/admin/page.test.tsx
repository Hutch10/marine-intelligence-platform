import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import OceanStationAdminPage from "@/app/ocean-stations/[id]/admin/page";
import { oceanStationDetails } from "@/lib/api/mock-data";

const { captured, mockApiClient, navigationSignals, requestCookies } = vi.hoisted(() => ({
  captured: {
    saveAction: null as null | ((formData: FormData) => Promise<void>),
    adminActorId: null as null | string,
    auditCount: 0,
    authEventCount: 0,
    canEditBranding: false,
    canEditContent: false,
    canViewAudit: false,
    csrfToken: null as null | string,
  },
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
      getEvents: vi.fn(),
    },
    oceanStations: {
      getStationAdmin: vi.fn(),
      getStationAdminAudit: vi.fn(),
      updateStationBranding: vi.fn(),
      updateStationContent: vi.fn(),
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

vi.mock("@/components/ocean-stations/ocean-station-admin-workspace", () => ({
  OceanStationAdminWorkspace: ({
    saveAction,
    adminActorId,
    auditHistory,
    authEvents,
    canEditBranding,
    canEditContent,
    canViewAudit,
    csrfToken,
  }: {
    saveAction: (formData: FormData) => Promise<void>;
    adminActorId: string;
    auditHistory: unknown[];
    authEvents: unknown[];
    canEditBranding: boolean;
    canEditContent: boolean;
    canViewAudit: boolean;
    csrfToken: string;
  }) => {
    captured.saveAction = saveAction;
    captured.adminActorId = adminActorId;
    captured.auditCount = auditHistory.length;
    captured.authEventCount = authEvents.length;
    captured.canEditBranding = canEditBranding;
    captured.canEditContent = canEditContent;
    captured.canViewAudit = canViewAudit;
    captured.csrfToken = csrfToken;
    return <div data-testid="station-admin-workspace" />;
  },
}));

const STATION = oceanStationDetails["STA-NPC-01"];

const FULL_PERMISSIONS = [
  "station.view_admin",
  "station.edit_branding",
  "station.edit_content",
  "station.view_audit",
  "station.publish",
] as const;

const FULL_AUTH = {
  actorId: "pilot.admin@marine.local",
  role: "admin" as const,
  permissions: [...FULL_PERMISSIONS],
  csrfToken: "test-csrf-full-auth-001",
};

async function loadSaveAction(): Promise<(formData: FormData) => Promise<void>> {
  const page = await OceanStationAdminPage({
    params: { id: STATION.id },
    searchParams: {},
  });

  render(page);

  if (!captured.saveAction) {
    throw new Error("Expected save action to be captured from workspace props.");
  }

  return captured.saveAction;
}

function createBaseFormData(): FormData {
  const formData = new FormData();
  formData.set("csrfToken", "test-csrf-full-auth-001");
  formData.set("exhibitTitle", "North Pacific Admin Exhibit");
  formData.set("publicDescription", "Updated public messaging");
  formData.set("sponsorName", "Updated Sponsor");
  formData.set("operatorName", "Updated Operator");
  formData.set("accentColor", "emerald");
  return formData;
}

function setValidStructuredEditors(formData: FormData) {
  formData.append("speciesName", "Admin species");
  formData.append("speciesStatus", "Monitoring");
  formData.append("speciesPopulationTrend", "Stable");
  formData.append("speciesNotes", "Operator updated");

  formData.append("alertsTitle", "Admin alert");
  formData.append("alertsSeverity", "low");
  formData.append("alertsStatus", "Open");
  formData.append("alertsDetail", "Operator updated");

  formData.append("timelineLabel", "Admin timeline");
  formData.append("timelinePhase", "Active");
  formData.append("timelineDetail", "Operator updated");

  formData.append("contentType", "guide");
  formData.append("contentTitle", "Admin card");
  formData.append("contentSummary", "Operator updated");
  formData.append("contentHref", "/ai-lab");
}

beforeEach(() => {
  captured.saveAction = null;
  captured.adminActorId = null;
  captured.auditCount = 0;
  captured.authEventCount = 0;
  captured.canEditBranding = false;
  captured.canEditContent = false;
  captured.canViewAudit = false;
  captured.csrfToken = null;
  navigationSignals.redirects.length = 0;
  navigationSignals.notFoundCalls = 0;
  requestCookies.stationAdminSession = "sess-admin-ops-001";
  delete process.env.STATION_ADMIN_SESSION_COOKIE_NAME;
  delete process.env.STATION_ADMIN_DEV_SESSION_ID;

  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockApiClient.oceanStations.getStationAdmin.mockReset();
  mockApiClient.oceanStations.getStationAdminAudit.mockReset();
  mockApiClient.oceanStations.updateStationBranding.mockReset();
  mockApiClient.oceanStations.updateStationContent.mockReset();
  mockApiClient.stationAdminAuth.getEvents.mockReset();

  mockApiClient.stationAdminAuth.getSession.mockResolvedValue(FULL_AUTH);
  mockApiClient.stationAdminAuth.getEvents.mockResolvedValue([]);
  mockApiClient.oceanStations.getStationAdmin.mockResolvedValue(STATION);
  mockApiClient.oceanStations.getStationAdminAudit.mockResolvedValue([]);
  mockApiClient.oceanStations.updateStationBranding.mockResolvedValue(STATION);
  mockApiClient.oceanStations.updateStationContent.mockResolvedValue(STATION);
});

test("station admin page is blocked when no session is present", async () => {
  requestCookies.stationAdminSession = null;

  await expect(
    OceanStationAdminPage({
      params: { id: STATION.id },
      searchParams: {},
    }),
  ).rejects.toThrow(`NEXT_REDIRECT:/ocean-stations/${STATION.id}/admin/login?next=admin`);

  expect(navigationSignals.notFoundCalls).toBe(0);
  expect(mockApiClient.stationAdminAuth.getSession).not.toHaveBeenCalled();
  expect(mockApiClient.oceanStations.getStationAdmin).not.toHaveBeenCalled();
});

test("station admin page allows authenticated user with only station.view_admin", async () => {
  mockApiClient.stationAdminAuth.getSession.mockResolvedValueOnce({
    actorId: "pilot.viewer@marine.local",
    role: "viewer",
    permissions: ["station.view_admin"],
    csrfToken: "test-csrf-view-only-001",
  });

  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();

  expect(typeof saveAction).toBe("function");
  expect(mockApiClient.stationAdminAuth.getSession).toHaveBeenCalledWith("sess-admin-ops-001");
  expect(mockApiClient.oceanStations.getStationAdmin).toHaveBeenCalledWith(STATION.id, {
    actorId: "pilot.viewer@marine.local",
    role: "viewer",
    permissions: ["station.view_admin"],
    csrfToken: "test-csrf-view-only-001",
  });
  expect(mockApiClient.stationAdminAuth.getEvents).not.toHaveBeenCalled();
  expect(mockApiClient.oceanStations.getStationAdminAudit).not.toHaveBeenCalled();
  expect(captured.canEditBranding).toBe(false);
  expect(captured.canEditContent).toBe(false);
  expect(captured.canViewAudit).toBe(false);

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?error=forbidden`,
  );
  expect(mockApiClient.oceanStations.updateStationBranding).not.toHaveBeenCalled();
  expect(mockApiClient.oceanStations.updateStationContent).not.toHaveBeenCalled();
});

test("station admin page allows full permissions and fetches audit history", async () => {
  mockApiClient.stationAdminAuth.getEvents.mockResolvedValueOnce([
    {
      id: "EVT-1",
      eventType: "login_success",
      actorId: "pilot.admin@marine.local",
      sessionId: "sess-admin-ops-001",
      occurredAt: "2026-03-16T01:20:00.000Z",
      ip: "203.0.113.42",
      userAgent: "Vitest Browser",
      source: "POST /api/station-admin/login",
    },
  ]);
  mockApiClient.oceanStations.getStationAdminAudit.mockResolvedValueOnce([
    {
      id: "AUD-1",
      stationId: STATION.id,
      actorId: "pilot.admin@marine.local",
      actorRole: "admin",
      area: "branding",
      changedAt: "2026-03-16T01:30:00.000Z",
      changedFields: ["exhibitTitle"],
    },
  ]);

  const saveAction = await loadSaveAction();
  expect(typeof saveAction).toBe("function");
  expect(mockApiClient.stationAdminAuth.getSession).toHaveBeenCalledWith("sess-admin-ops-001");
  expect(mockApiClient.stationAdminAuth.getEvents).toHaveBeenCalledWith({ limit: 8 }, FULL_AUTH);
  expect(mockApiClient.oceanStations.getStationAdmin).toHaveBeenCalledWith(STATION.id, FULL_AUTH);
  expect(mockApiClient.oceanStations.getStationAdminAudit).toHaveBeenCalledWith(STATION.id, FULL_AUTH);
  expect(captured.adminActorId).toBe("pilot.admin@marine.local");
  expect(captured.auditCount).toBe(1);
  expect(captured.authEventCount).toBe(1);
  expect(captured.canEditBranding).toBe(true);
  expect(captured.canEditContent).toBe(true);
  expect(captured.canViewAudit).toBe(true);
  expect(captured.csrfToken).toBe("test-csrf-full-auth-001");
});

test("station admin page allows branding edits but not content edits", async () => {
  mockApiClient.stationAdminAuth.getSession.mockResolvedValueOnce({
    actorId: "brand.editor@marine.local",
    role: "viewer",
    permissions: ["station.view_admin", "station.edit_branding"],
    csrfToken: "test-csrf-branding-001",
  });

  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();
  formData.set("csrfToken", "test-csrf-branding-001");
  setValidStructuredEditors(formData);

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?saved=1`,
  );

  expect(mockApiClient.oceanStations.updateStationBranding).toHaveBeenCalledWith(STATION.id, {
    exhibitTitle: "North Pacific Admin Exhibit",
    publicDescription: "Updated public messaging",
    sponsorName: "Updated Sponsor",
    operatorName: "Updated Operator",
    accentColor: "emerald",
  }, {
    actorId: "brand.editor@marine.local",
    role: "viewer",
    permissions: ["station.view_admin", "station.edit_branding"],
    csrfToken: "test-csrf-branding-001",
  });
  expect(mockApiClient.oceanStations.updateStationContent).not.toHaveBeenCalled();
  expect(captured.canEditBranding).toBe(true);
  expect(captured.canEditContent).toBe(false);
  expect(captured.canViewAudit).toBe(false);
});

test("station admin page allows admin view but blocks audit when station.view_audit is missing", async () => {
  mockApiClient.stationAdminAuth.getSession.mockResolvedValueOnce({
    actorId: "ops.editor@marine.local",
    role: "admin",
    permissions: ["station.view_admin", "station.edit_branding", "station.edit_content"],
    csrfToken: "test-csrf-no-audit-001",
  });

  await loadSaveAction();

  expect(mockApiClient.oceanStations.getStationAdmin).toHaveBeenCalledWith(STATION.id, {
    actorId: "ops.editor@marine.local",
    role: "admin",
    permissions: ["station.view_admin", "station.edit_branding", "station.edit_content"],
    csrfToken: "test-csrf-no-audit-001",
  });
  expect(mockApiClient.oceanStations.getStationAdminAudit).not.toHaveBeenCalled();
  expect(captured.canViewAudit).toBe(false);
});

test("station admin save action redirects with invalid_json when JSON fields are malformed", async () => {
  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();
  formData.set("speciesJson", "{ malformed");
  formData.set("alertsJson", "[]");
  formData.set("timelineJson", "[]");
  formData.set("contentJson", "[]");

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?error=invalid_json`,
  );

  expect(navigationSignals.redirects).toEqual([
    `/ocean-stations/${STATION.slug}/admin?error=invalid_json`,
  ]);
  expect(mockApiClient.oceanStations.updateStationBranding).not.toHaveBeenCalled();
  expect(mockApiClient.oceanStations.updateStationContent).not.toHaveBeenCalled();
});

test("station admin save action redirects with saved=1 after successful branding and content updates", async () => {
  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();
  const species = [
    {
      name: "Admin species",
      status: "Monitoring",
      populationTrend: "Stable",
      notes: "Operator updated",
    },
  ];
  const alerts = [
    {
      title: "Admin alert",
      severity: "low",
      status: "Open",
      detail: "Operator updated",
    },
  ];
  const timeline = [
    {
      label: "Admin timeline",
      phase: "Active",
      detail: "Operator updated",
    },
  ];
  const content = [
    {
      contentType: "guide",
      title: "Admin card",
      summary: "Operator updated",
      href: "/ai-lab",
    },
  ];

  setValidStructuredEditors(formData);

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?saved=1`,
  );

  expect(mockApiClient.oceanStations.updateStationBranding).toHaveBeenCalledWith(STATION.id, {
    exhibitTitle: "North Pacific Admin Exhibit",
    publicDescription: "Updated public messaging",
    sponsorName: "Updated Sponsor",
    operatorName: "Updated Operator",
    accentColor: "emerald",
  }, FULL_AUTH);
  expect(mockApiClient.oceanStations.updateStationContent).toHaveBeenCalledWith(STATION.id, {
    species,
    alerts,
    timeline,
    content,
  }, FULL_AUTH);
  expect(navigationSignals.redirects).toEqual([
    `/ocean-stations/${STATION.slug}/admin?saved=1`,
  ]);
});

test("station admin save action prioritizes JSON overrides when provided", async () => {
  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();
  setValidStructuredEditors(formData);

  const speciesOverride = [
    {
      name: "Override species",
      status: "Protected",
      populationTrend: "Increasing",
      notes: "Loaded from JSON",
    },
  ];
  const alertsOverride = [
    {
      title: "Override alert",
      severity: "high",
      status: "Escalated",
      detail: "Loaded from JSON",
    },
  ];
  const timelineOverride = [
    {
      label: "Override timeline",
      phase: "Phase 2",
      detail: "Loaded from JSON",
    },
  ];
  const contentOverride = [
    {
      contentType: "spotlight",
      title: "Override content",
      summary: "Loaded from JSON",
      href: "/station/mock",
    },
  ];

  formData.set("speciesJson", JSON.stringify(speciesOverride));
  formData.set("alertsJson", JSON.stringify(alertsOverride));
  formData.set("timelineJson", JSON.stringify(timelineOverride));
  formData.set("contentJson", JSON.stringify(contentOverride));

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?saved=1`,
  );

  expect(mockApiClient.oceanStations.updateStationContent).toHaveBeenCalledWith(STATION.id, {
    species: speciesOverride,
    alerts: alertsOverride,
    timeline: timelineOverride,
    content: contentOverride,
  }, FULL_AUTH);
});

test("station admin save action redirects with save_failed when branding update returns null", async () => {
  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();
  setValidStructuredEditors(formData);
  mockApiClient.oceanStations.updateStationBranding.mockResolvedValueOnce(null);

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?error=save_failed`,
  );

  expect(mockApiClient.oceanStations.updateStationBranding).toHaveBeenCalledTimes(1);
  expect(mockApiClient.oceanStations.updateStationContent).not.toHaveBeenCalled();
  expect(navigationSignals.redirects).toEqual([
    `/ocean-stations/${STATION.slug}/admin?error=save_failed`,
  ]);
  expect(navigationSignals.redirects).not.toContain(
    `/ocean-stations/${STATION.slug}/admin?saved=1`,
  );
});

test("station admin save action redirects with save_failed when content update returns null", async () => {
  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();
  setValidStructuredEditors(formData);
  mockApiClient.oceanStations.updateStationBranding.mockResolvedValueOnce(STATION);
  mockApiClient.oceanStations.updateStationContent.mockResolvedValueOnce(null);

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?error=save_failed`,
  );

  expect(mockApiClient.oceanStations.updateStationBranding).toHaveBeenCalledTimes(1);
  expect(mockApiClient.oceanStations.updateStationContent).toHaveBeenCalledTimes(1);
  expect(navigationSignals.redirects).toEqual([
    `/ocean-stations/${STATION.slug}/admin?error=save_failed`,
  ]);
  expect(navigationSignals.redirects).not.toContain(
    `/ocean-stations/${STATION.slug}/admin?saved=1`,
  );
});

test("station admin save action uses save_failed when branding succeeds but content fails", async () => {
  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();
  setValidStructuredEditors(formData);
  mockApiClient.oceanStations.updateStationBranding.mockResolvedValueOnce(STATION);
  mockApiClient.oceanStations.updateStationContent.mockResolvedValueOnce(null);

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?error=save_failed`,
  );

  expect(mockApiClient.oceanStations.updateStationBranding).toHaveBeenCalledTimes(1);
  expect(mockApiClient.oceanStations.updateStationContent).toHaveBeenCalledTimes(1);
  const brandingCallOrder = mockApiClient.oceanStations.updateStationBranding.mock.invocationCallOrder[0];
  const contentCallOrder = mockApiClient.oceanStations.updateStationContent.mock.invocationCallOrder[0];
  expect(brandingCallOrder).toBeLessThan(contentCallOrder);
  expect(navigationSignals.redirects).toEqual([
    `/ocean-stations/${STATION.slug}/admin?error=save_failed`,
  ]);
  expect(navigationSignals.redirects).not.toContain(
    `/ocean-stations/${STATION.slug}/admin?saved=1`,
  );
});

test("station admin save action blocks mutation when csrf token is missing", async () => {
  const saveAction = await loadSaveAction();
  const formData = createBaseFormData();
  formData.delete("csrfToken");

  await expect(saveAction(formData)).rejects.toThrow(
    `NEXT_REDIRECT:/ocean-stations/${STATION.slug}/admin?error=forbidden`,
  );

  expect(mockApiClient.oceanStations.updateStationBranding).not.toHaveBeenCalled();
  expect(mockApiClient.oceanStations.updateStationContent).not.toHaveBeenCalled();
});