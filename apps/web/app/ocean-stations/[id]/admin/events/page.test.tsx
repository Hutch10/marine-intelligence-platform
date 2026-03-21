import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import OceanStationEventsPage from "@/app/ocean-stations/[id]/admin/events/page";

const { mockApiClient, navigationSignals, requestCookies } = vi.hoisted(() => ({
  mockApiClient: {
    stationAdminAuth: {
      getSession: vi.fn(),
    },
    stationEvents: {
      queryEvents: vi.fn(),
      queryInvestigations: vi.fn(),
      getEventDetail: vi.fn(),
    },
    marineIntelligence: {
      getStationWorkflow: vi.fn(),
    },
  },
  navigationSignals: {
    redirects: [] as string[],
    notFoundCalls: 0,
  },
  requestCookies: {
    stationAdminSession: "sess-events-001",
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
      if (name === "station_admin_session" && requestCookies.stationAdminSession) {
        return { name, value: requestCookies.stationAdminSession };
      }

      return undefined;
    },
  }),
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ocean-stations/event-acknowledge-button", () => ({
  EventAcknowledgeButton: () => <div data-testid="event-acknowledge-button" />,
}));

vi.mock("@/components/ocean-stations/marine-investigation-create-button", () => ({
  MarineInvestigationCreateButton: ({ eventId }: { eventId: string }) => (
    <div data-testid={`marine-investigation-create-${eventId}`} />
  ),
}));

vi.mock("@/components/ocean-stations/marine-alert-status-actions", () => ({
  MarineAlertStatusActions: ({ alertId }: { alertId: string }) => (
    <div data-testid={`marine-alert-actions-${alertId}`} />
  ),
}));

beforeEach(() => {
  navigationSignals.redirects.length = 0;
  navigationSignals.notFoundCalls = 0;
  requestCookies.stationAdminSession = "sess-events-001";

  mockApiClient.stationAdminAuth.getSession.mockReset();
  mockApiClient.stationEvents.queryEvents.mockReset();
  mockApiClient.stationEvents.queryInvestigations.mockReset();
  mockApiClient.stationEvents.getEventDetail.mockReset();
  mockApiClient.marineIntelligence.getStationWorkflow.mockReset();

  mockApiClient.stationAdminAuth.getSession.mockResolvedValue({
    actorId: "ops.lead@marine.local",
    role: "admin",
    permissions: ["station.view_admin"],
    csrfToken: "csrf-001",
  });
  mockApiClient.stationEvents.queryEvents.mockResolvedValue({ events: [], nextCursor: null });
  mockApiClient.stationEvents.queryInvestigations.mockResolvedValue({ investigations: [], nextCursor: null });
  mockApiClient.stationEvents.getEventDetail.mockResolvedValue(null);
  mockApiClient.marineIntelligence.getStationWorkflow.mockResolvedValue({
    events: [
      {
        id: "MEV-001",
        ontologyTermId: "mdl.threshold_alert",
        eventClass: "threshold_alert",
        severity: "critical",
        status: "detected",
        title: "Thermal threshold exceeded",
        summary: "SST anomaly crossed the configured threshold.",
        region: "North Pacific",
        stationId: "STA-001",
        confidence: 92,
        lineage: {
          source: "crw",
          sourceRecordId: "rec-001",
          ingestionRunId: "run-001",
          observedAt: "2026-03-20T11:00:00.000Z",
          ingestedAt: "2026-03-20T11:05:00.000Z",
        },
        detectedAt: "2026-03-20T11:06:00.000Z",
        resolvedAt: null,
        createdAt: "2026-03-20T11:06:00.000Z",
        updatedAt: "2026-03-20T11:06:00.000Z",
      },
    ],
    investigations: [
      {
        id: "MIID-001",
        eventId: "MEV-001",
        eventTitle: "Thermal threshold exceeded",
        stationId: "STA-001",
        region: "North Pacific",
        detectedAt: "2026-03-20T11:06:00.000Z",
        title: "North Pacific follow-up",
        status: "open",
        ownerId: "ops.lead@marine.local",
        notes: null,
        createdAt: "2026-03-20T11:10:00.000Z",
        updatedAt: "2026-03-20T11:10:00.000Z",
        acknowledgedAt: null,
        resolvedAt: null,
        dismissedAt: null,
      },
    ],
    alerts: [
      {
        id: "MALT-001",
        eventId: "MEV-001",
        eventTitle: "Thermal threshold exceeded",
        eventStatus: "detected",
        stationId: "STA-001",
        region: "North Pacific",
        investigationId: "MIID-001",
        severity: "high",
        status: "active",
        ruleType: "threshold_breach",
        title: "Thermal threshold breached",
        detail: "Threshold exceeded at the station.",
        detectedAt: "2026-03-20T11:07:00.000Z",
        acknowledgedAt: null,
        resolvedAt: null,
        createdAt: "2026-03-20T11:07:00.000Z",
        updatedAt: "2026-03-20T11:07:00.000Z",
      },
    ],
  });
});

test("station admin events page renders marine workflow data with provenance and actions", async () => {
  const page = await OceanStationEventsPage({
    params: { id: "STA-001" },
    searchParams: {},
  });

  render(page);

  expect(screen.getByText("Marine Intelligence Workflow")).toBeInTheDocument();
  expect(screen.getByText("Thermal threshold exceeded")).toBeInTheDocument();
  expect(screen.getByText(/Provenance: crw · rec-001/)).toBeInTheDocument();
  expect(screen.getByText("North Pacific follow-up")).toBeInTheDocument();
  expect(screen.getByText("Thermal threshold breached")).toBeInTheDocument();
  expect(screen.getByTestId("marine-alert-actions-MALT-001")).toBeInTheDocument();
  expect(mockApiClient.marineIntelligence.getStationWorkflow).toHaveBeenCalledWith(
    "STA-001",
    expect.objectContaining({ actorId: "ops.lead@marine.local" }),
    expect.any(Object),
  );
});

test("station admin events page keeps rendering when marine workflow data is unavailable", async () => {
  mockApiClient.marineIntelligence.getStationWorkflow.mockResolvedValueOnce({
    events: [],
    investigations: [],
    alerts: [],
  });

  const page = await OceanStationEventsPage({
    params: { id: "STA-001" },
    searchParams: {},
  });

  render(page);

  expect(screen.getByText("No marine intelligence events found.")).toBeInTheDocument();
  expect(screen.getByText("No marine investigations found.")).toBeInTheDocument();
  expect(screen.getByText("No marine alerts found.")).toBeInTheDocument();
});