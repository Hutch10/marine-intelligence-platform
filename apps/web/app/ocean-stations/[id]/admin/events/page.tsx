import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { EventAcknowledgeButton } from "@/components/ocean-stations/event-acknowledge-button";
import { MarineAlertStatusActions } from "@/components/ocean-stations/marine-alert-status-actions";
import { MarineInvestigationCreateButton } from "@/components/ocean-stations/marine-investigation-create-button";
import { apiClient } from "@/lib/api/client";
import type {
  MarineWorkflowAlertStatus,
  MarineWorkflowEventSeverity,
  MarineWorkflowEventStatus,
  MarineWorkflowInvestigationStatus,
  OceanStationAdminAuthContext,
  OceanStationAdminPermission,
  StationEventStatus,
  StationEventSeverity,
  StationEventDetail,
} from "@/lib/api/types";

interface OceanStationEventsPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    status?: string;
    severity?: string;
    cursor?: string;
    eventId?: string;
    marineEventStatus?: string;
    marineEventSeverity?: string;
    marineInvestigationStatus?: string;
    marineAlertStatus?: string;
    marineAlertSeverity?: string;
  };
}

export const metadata: Metadata = {
  title: "Station Events",
};

const DEFAULT_STATION_ADMIN_SESSION_COOKIE = "station_admin_session";

function getStationAdminSessionIdFromRequest(): string | null {
  const cookieStore = cookies();
  const cookieName = process.env.STATION_ADMIN_SESSION_COOKIE_NAME?.trim() || DEFAULT_STATION_ADMIN_SESSION_COOKIE;
  const sessionId = cookieStore.get(cookieName)?.value?.trim() ?? "";

  if (sessionId) {
    return sessionId;
  }

  if (process.env.NODE_ENV !== "production") {
    const devSessionId = process.env.STATION_ADMIN_DEV_SESSION_ID?.trim() ?? "";

    if (devSessionId) {
      return devSessionId;
    }
  }

  return null;
}

async function getStationAdminAuthContext(): Promise<OceanStationAdminAuthContext | null> {
  const sessionId = getStationAdminSessionIdFromRequest();

  if (!sessionId) {
    return null;
  }

  return apiClient.stationAdminAuth.getSession(sessionId);
}

function hasPermission(
  auth: OceanStationAdminAuthContext,
  permission: OceanStationAdminPermission,
): boolean {
  return auth.permissions.includes(permission);
}

function formatEventType(eventType: string): string {
  return eventType
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function severityBadgeClass(severity: string): string {
  if (severity === "critical") return "rounded-full border border-fuchsia-500/25 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-fuchsia-300";
  if (severity === "high") return "rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-rose-300";
  if (severity === "medium") return "rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-amber-300";
  return "rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em] text-cyan-300";
}

function statusBadgeClass(status: string): string {
  if (status === "resolved") return "rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-300";
  if (status === "investigating") return "rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-300";
  if (status === "acknowledged") return "rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-300";
  if (status === "archived") return "rounded-full border border-slate-500/25 bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400";
  return "rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-rose-300";
}

function investigationStatusBadgeClass(status: string): string {
  if (status === "closed") return "rounded-full border border-slate-500/25 bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-400";
  if (status === "monitoring") return "rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300";
  if (status === "archived") return "rounded-full border border-slate-600/25 bg-slate-600/10 px-2 py-0.5 text-[10px] font-medium text-slate-500";
  return "rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300";
}

function marineEventStatusBadgeClass(status: string): string {
  if (status === "resolved") return "rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-300";
  if (status === "dismissed") return "rounded-full border border-slate-500/25 bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-400";
  if (status === "confirmed") return "rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-violet-300";
  if (status === "monitoring") return "rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-300";
  return "rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-rose-300";
}

function marineInvestigationStatusBadgeClass(status: string): string {
  if (status === "resolved") return "rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300";
  if (status === "dismissed") return "rounded-full border border-slate-500/25 bg-slate-500/10 px-2 py-0.5 text-[10px] font-medium text-slate-400";
  if (status === "in_review") return "rounded-full border border-violet-500/25 bg-violet-500/10 px-2 py-0.5 text-[10px] font-medium text-violet-300";
  if (status === "acknowledged") return "rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-300";
  return "rounded-full border border-cyan-500/25 bg-cyan-500/10 px-2 py-0.5 text-[10px] font-medium text-cyan-300";
}

function marineAlertStatusBadgeClass(status: string): string {
  if (status === "resolved") return "rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-emerald-300";
  if (status === "acknowledged") return "rounded-full border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-amber-300";
  return "rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.12em] text-rose-300";
}

function validateEventStatus(value: string | undefined): StationEventStatus | undefined {
  if (!value) return undefined;
  const validStatuses: StationEventStatus[] = ["new", "acknowledged", "investigating", "resolved", "archived"];
  return validStatuses.includes(value as StationEventStatus) ? (value as StationEventStatus) : undefined;
}

function validateEventSeverity(value: string | undefined): StationEventSeverity | undefined {
  if (!value) return undefined;
  const validSeverities: StationEventSeverity[] = ["low", "medium", "high"];
  return validSeverities.includes(value as StationEventSeverity) ? (value as StationEventSeverity) : undefined;
}

function validateMarineEventStatus(value: string | undefined): MarineWorkflowEventStatus | undefined {
  if (!value) return undefined;
  const validStatuses: MarineWorkflowEventStatus[] = ["detected", "monitoring", "confirmed", "resolved", "dismissed"];
  return validStatuses.includes(value as MarineWorkflowEventStatus)
    ? (value as MarineWorkflowEventStatus)
    : undefined;
}

function validateMarineEventSeverity(value: string | undefined): MarineWorkflowEventSeverity | undefined {
  if (!value) return undefined;
  const validSeverities: MarineWorkflowEventSeverity[] = ["low", "medium", "high", "critical"];
  return validSeverities.includes(value as MarineWorkflowEventSeverity)
    ? (value as MarineWorkflowEventSeverity)
    : undefined;
}

function validateMarineInvestigationStatus(
  value: string | undefined,
): MarineWorkflowInvestigationStatus | undefined {
  if (!value) return undefined;
  const validStatuses: MarineWorkflowInvestigationStatus[] = [
    "open",
    "acknowledged",
    "in_review",
    "resolved",
    "dismissed",
  ];
  return validStatuses.includes(value as MarineWorkflowInvestigationStatus)
    ? (value as MarineWorkflowInvestigationStatus)
    : undefined;
}

function validateMarineAlertStatus(value: string | undefined): MarineWorkflowAlertStatus | undefined {
  if (!value) return undefined;
  const validStatuses: MarineWorkflowAlertStatus[] = ["active", "acknowledged", "resolved"];
  return validStatuses.includes(value as MarineWorkflowAlertStatus)
    ? (value as MarineWorkflowAlertStatus)
    : undefined;
}

function buildFilterQueryString(filters: {
  status?: StationEventStatus;
  severity?: StationEventSeverity;
  cursor?: string;
  eventId?: string;
}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.eventId) params.set("eventId", filters.eventId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function buildMarineFilterQueryString(filters: {
  status?: StationEventStatus;
  severity?: StationEventSeverity;
  cursor?: string;
  eventId?: string;
  marineEventStatus?: MarineWorkflowEventStatus;
  marineEventSeverity?: MarineWorkflowEventSeverity;
  marineInvestigationStatus?: MarineWorkflowInvestigationStatus;
  marineAlertStatus?: MarineWorkflowAlertStatus;
  marineAlertSeverity?: MarineWorkflowEventSeverity;
}): string {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.severity) params.set("severity", filters.severity);
  if (filters.cursor) params.set("cursor", filters.cursor);
  if (filters.eventId) params.set("eventId", filters.eventId);
  if (filters.marineEventStatus) params.set("marineEventStatus", filters.marineEventStatus);
  if (filters.marineEventSeverity) params.set("marineEventSeverity", filters.marineEventSeverity);
  if (filters.marineInvestigationStatus) params.set("marineInvestigationStatus", filters.marineInvestigationStatus);
  if (filters.marineAlertStatus) params.set("marineAlertStatus", filters.marineAlertStatus);
  if (filters.marineAlertSeverity) params.set("marineAlertSeverity", filters.marineAlertSeverity);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export default async function OceanStationEventsPage({ params, searchParams }: OceanStationEventsPageProps) {
  const adminContext = await getStationAdminAuthContext();

  if (!adminContext) {
    redirect(`/ocean-stations/${params.id}/admin/login?next=events`);
  }

  if (!hasPermission(adminContext, "station.view_admin")) {
    notFound();
  }

  const auth: OceanStationAdminAuthContext = adminContext;

  const validatedStatus = validateEventStatus(searchParams?.status);
  const validatedSeverity = validateEventSeverity(searchParams?.severity);
  const validatedMarineEventStatus = validateMarineEventStatus(searchParams?.marineEventStatus);
  const validatedMarineEventSeverity = validateMarineEventSeverity(searchParams?.marineEventSeverity);
  const validatedMarineInvestigationStatus = validateMarineInvestigationStatus(
    searchParams?.marineInvestigationStatus,
  );
  const validatedMarineAlertStatus = validateMarineAlertStatus(searchParams?.marineAlertStatus);
  const validatedMarineAlertSeverity = validateMarineEventSeverity(searchParams?.marineAlertSeverity);

  const eventsPage = await apiClient.stationEvents.queryEvents(
    params.id,
    {
      status: validatedStatus,
      severity: validatedSeverity,
      cursor: searchParams?.cursor,
      limit: 20,
    },
    auth,
  );

  const investigationsPage = await apiClient.stationEvents.queryInvestigations(
    params.id,
    { limit: 10 },
    auth,
  );

  const events = eventsPage?.events ?? [];
  const investigations = investigationsPage?.investigations ?? [];
  const nextCursor = eventsPage?.nextCursor ?? null;
  const marineWorkflow = await apiClient.marineIntelligence.getStationWorkflow(
    params.id,
    auth,
    {
      eventStatus: validatedMarineEventStatus,
      eventSeverity: validatedMarineEventSeverity,
      investigationStatus: validatedMarineInvestigationStatus,
      alertStatus: validatedMarineAlertStatus,
      alertSeverity: validatedMarineAlertSeverity,
    },
  );
  const marineEvents = marineWorkflow.events;
  const marineInvestigations = marineWorkflow.investigations;
  const marineAlerts = marineWorkflow.alerts;
  const marineInvestigationByEventId = new Map(
    marineInvestigations.map((investigation) => [investigation.eventId, investigation]),
  );

  let selectedEventDetail: StationEventDetail | null = null;
  const eventId = searchParams?.eventId?.trim();
  if (eventId) {
    selectedEventDetail = await apiClient.stationEvents.getEventDetail(params.id, eventId, auth);
  }

  return (
    <AppShell
      pageTitle="Station Events"
      pageSubtitle="Ocean Intelligence Platform — station event log and investigation tracker"
    >
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Event Log</h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Sensor-triggered events for station {params.id}. Read-only view.
            </p>
          </div>
          <a
            href={`/ocean-stations/${params.id}/admin`}
            className="text-[11px] text-slate-500 hover:text-slate-300 transition-colors"
          >
            ← Back to admin
          </a>
        </div>

        {/* Filter chips */}
        <section className="space-y-2">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-600">
            Filters
          </h3>
          <div className="flex flex-wrap gap-2">
            {/* Status filters */}
            {(["new", "acknowledged", "investigating", "resolved", "archived"] as StationEventStatus[]).map((status) => {
              const isActive = validatedStatus === status;
              const url = isActive
                ? `/ocean-stations/${params.id}/admin/events${buildFilterQueryString({ severity: validatedSeverity })}`
                : `/ocean-stations/${params.id}/admin/events${buildFilterQueryString({ status, severity: validatedSeverity })}`;
              return (
                <a
                  key={status}
                  href={url}
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
                    isActive
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                      : "border-slate-600/30 bg-slate-800/40 text-slate-400 hover:border-slate-500/40 hover:text-slate-300"
                  }`}
                >
                  {status}
                </a>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            {/* Severity filters */}
            {(["low", "medium", "high"] as StationEventSeverity[]).map((severity) => {
              const isActive = validatedSeverity === severity;
              const url = isActive
                ? `/ocean-stations/${params.id}/admin/events${buildFilterQueryString({ status: validatedStatus })}`
                : `/ocean-stations/${params.id}/admin/events${buildFilterQueryString({ status: validatedStatus, severity })}`;
              return (
                <a
                  key={severity}
                  href={url}
                  className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
                    isActive
                      ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                      : "border-slate-600/30 bg-slate-800/40 text-slate-400 hover:border-slate-500/40 hover:text-slate-300"
                  }`}
                >
                  {severity}
                </a>
              );
            })}
          </div>
        </section>

        {/* Main content grid: events + detail panel */}
        <div className="grid gap-8 lg:grid-cols-3">
          {/* Events table */}
          <section className="lg:col-span-2">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Recent Events
            </h3>
            {events.length === 0 ? (
              <p className="text-xs text-slate-500">No events found.</p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-borderSubtle">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-surface-borderSubtle bg-ocean-900/50">
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Event</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Type</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Severity</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Status</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Detected</th>
                      <th className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Investigation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-borderSubtle">
                    {events.map((event) => {
                      const isSelected = selectedEventDetail?.id === event.id;
                      return (
                        <tr
                          key={event.id}
                          className={`transition-colors cursor-pointer ${
                            isSelected
                              ? "bg-cyan-500/10 hover:bg-cyan-500/15"
                              : "bg-ocean-850/50 hover:bg-ocean-800/40"
                          }`}
                        >
                          <td className="px-4 py-3">
                            <a
                              href={`/ocean-stations/${params.id}/admin/events${buildFilterQueryString({ status: validatedStatus, severity: validatedSeverity, cursor: searchParams?.cursor, eventId: event.id })}`}
                              className="block"
                            >
                              <p className="font-medium text-slate-200">{event.title}</p>
                              <p className="mt-0.5 text-[10px] text-slate-500 line-clamp-1">{event.summary}</p>
                            </a>
                          </td>
                          <td className="px-4 py-3 text-[10px] text-slate-400">
                            {formatEventType(event.eventType)}
                          </td>
                          <td className="px-4 py-3">
                            <span className={severityBadgeClass(event.severity)}>{event.severity}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={statusBadgeClass(event.status)}>{event.status}</span>
                          </td>
                          <td className="px-4 py-3 text-[10px] text-slate-400">
                            {new Date(event.detectedAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-[10px] text-slate-400">
                            {event.investigationId ?? <span className="text-slate-600">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {nextCursor ? (
              <div className="mt-3">
                <a
                  href={`/ocean-stations/${params.id}/admin/events${buildFilterQueryString({ status: validatedStatus, severity: validatedSeverity, cursor: nextCursor })}`}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  Load more events →
                </a>
              </div>
            ) : null}
          </section>

          {/* Event detail panel */}
          {selectedEventDetail ? (
            <section className="lg:col-span-1">
              <div className="rounded-xl border border-surface-borderSubtle bg-ocean-900/50 p-4 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-100">{selectedEventDetail.title}</h3>
                  <a
                    href={`/ocean-stations/${params.id}/admin/events${buildFilterQueryString({ status: validatedStatus, severity: validatedSeverity, cursor: searchParams?.cursor })}`}
                    className="text-slate-500 hover:text-slate-300 transition-colors text-lg"
                    title="Close detail panel"
                  >
                    ×
                  </a>
                </div>

                {/* Summary */}
                <div className="space-y-1.5 pb-3 border-b border-slate-700/50">
                  <p className="text-xs text-slate-400">Summary</p>
                  <p className="text-xs text-slate-200 leading-relaxed">{selectedEventDetail.summary}</p>
                </div>

                {/* Event metadata */}
                <div className="space-y-2 pb-3 border-b border-slate-700/50">
                  <div className="flex items-center gap-2 justify-between text-[10px]">
                    <span className="text-slate-500">Severity</span>
                    <span className={severityBadgeClass(selectedEventDetail.severity)}>
                      {selectedEventDetail.severity}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 justify-between text-[10px]">
                    <span className="text-slate-500">Status</span>
                    <span className={statusBadgeClass(selectedEventDetail.status)}>
                      {selectedEventDetail.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 justify-between text-[10px]">
                    <span className="text-slate-500">Type</span>
                    <span className="text-slate-300">{formatEventType(selectedEventDetail.eventType)}</span>
                  </div>
                </div>

                {/* Evidence */}
                {selectedEventDetail.evidence.length > 0 ? (
                  <div className="space-y-2 pb-3 border-b border-slate-700/50">
                    <p className="text-xs text-slate-400 font-medium">Evidence ({selectedEventDetail.evidence.length})</p>
                    <div className="space-y-1.5 text-[10px]">
                      {selectedEventDetail.evidence.map((item) => (
                        <div key={item.id} className="bg-slate-900/40 rounded px-2 py-1">
                          <div className="font-medium text-slate-300">
                            {item.source} — {item.kind}
                          </div>
                          <div className="text-slate-500 mt-0.5">
                            {new Date(item.capturedAt).toLocaleString()}
                          </div>
                          <div className="text-slate-400 mt-0.5 line-clamp-2">{item.detail}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Notes */}
                {selectedEventDetail.notes.length > 0 ? (
                  <div className="space-y-2 pb-3 border-b border-slate-700/50">
                    <p className="text-xs text-slate-400 font-medium">Notes ({selectedEventDetail.notes.length})</p>
                    <div className="space-y-1.5 text-[10px]">
                      {selectedEventDetail.notes.map((item) => (
                        <div key={item.id} className="bg-slate-900/40 rounded px-2 py-1">
                          <div className="font-medium text-slate-300">{item.authorId}</div>
                          <div className="text-slate-500 text-[9px] mt-0.5">
                            {new Date(item.createdAt).toLocaleString()}
                          </div>
                          <div className="text-slate-200 mt-0.5">{item.body}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Actions */}
                {selectedEventDetail.actions.length > 0 ? (
                  <div className="space-y-2 pb-3 border-b border-slate-700/50">
                    <p className="text-xs text-slate-400 font-medium">Actions ({selectedEventDetail.actions.length})</p>
                    <div className="space-y-1.5 text-[10px]">
                      {selectedEventDetail.actions.map((item) => (
                        <div key={item.id} className="bg-slate-900/40 rounded px-2 py-1">
                          <div className="font-medium text-slate-300">{item.label}</div>
                          <div className="text-slate-500 text-[9px] mt-0.5">
                            {item.actorId} · {new Date(item.performedAt).toLocaleString()}
                          </div>
                          {item.detail ? (
                            <div className="text-slate-400 mt-0.5">{item.detail}</div>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* History */}
                {selectedEventDetail.history.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-400 font-medium">Status History</p>
                    <div className="space-y-1 text-[10px]">
                      {selectedEventDetail.history.map((item) => (
                        <div key={item.id} className="flex items-center gap-2 text-slate-400">
                          <span className="text-slate-600">{item.fromStatus || "—"}</span>
                          <span className="text-slate-700">→</span>
                          <span className="text-cyan-400">{item.toStatus}</span>
                          <span className="text-slate-600">by {item.changedBy}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {/* Linked investigation */}
                {selectedEventDetail.investigationId ? (
                  <div className="pt-3 border-t border-slate-700/50">
                    <p className="text-xs text-slate-400 font-medium mb-2">Linked Investigation</p>
                    <p className="text-xs text-slate-300">{selectedEventDetail.investigationId}</p>
                  </div>
                ) : null}

                {/* Acknowledge action */}
                {selectedEventDetail.status === "new" ? (
                  <div className="pt-3 border-t border-slate-700/50">
                    <EventAcknowledgeButton
                      stationId={params.id}
                      eventId={selectedEventDetail.id}
                      actorId={auth.actorId}
                    />
                  </div>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>

        {/* Investigations */}
        <section>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
            Investigations
          </h3>
          {investigations.length === 0 ? (
            <p className="text-xs text-slate-500">No investigations found.</p>
          ) : (
            <div className="space-y-2">
              {investigations.map((inv) => (
                <div key={inv.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-100">{inv.title}</p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Opened {new Date(inv.openedAt).toLocaleDateString()}
                        {inv.owner ? ` · ${inv.owner}` : ""}
                        {" · "}
                        {inv.linkedEventCount} linked event{inv.linkedEventCount !== 1 ? "s" : ""}
                      </p>
                    </div>
                    <span className={investigationStatusBadgeClass(inv.status)}>{inv.status}</span>
                  </div>
                  {inv.closedAt ? (
                    <p className="mt-1.5 text-[10px] text-slate-500">
                      Closed {new Date(inv.closedAt).toLocaleDateString()}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Marine Intelligence Workflow
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Modeled events, linked investigations, and alerts derived from the Step 20-21 marine workflow.
            </p>
          </div>

          <div className="grid gap-6 xl:grid-cols-3">
            <section className="space-y-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/40 p-4">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Events</p>
                <div className="flex flex-wrap gap-2">
                  {(["detected", "monitoring", "confirmed", "resolved", "dismissed"] as MarineWorkflowEventStatus[]).map((status) => {
                    const isActive = validatedMarineEventStatus === status;
                    const url = isActive
                      ? `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventSeverity: validatedMarineEventSeverity,
                        marineInvestigationStatus: validatedMarineInvestigationStatus,
                        marineAlertStatus: validatedMarineAlertStatus,
                        marineAlertSeverity: validatedMarineAlertSeverity,
                      })}`
                      : `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: status,
                        marineEventSeverity: validatedMarineEventSeverity,
                        marineInvestigationStatus: validatedMarineInvestigationStatus,
                        marineAlertStatus: validatedMarineAlertStatus,
                        marineAlertSeverity: validatedMarineAlertSeverity,
                      })}`;

                    return (
                      <a
                        key={status}
                        href={url}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
                          isActive
                            ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                            : "border-slate-600/30 bg-slate-800/40 text-slate-400 hover:border-slate-500/40 hover:text-slate-300"
                        }`}
                      >
                        {status}
                      </a>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["low", "medium", "high", "critical"] as MarineWorkflowEventSeverity[]).map((severity) => {
                    const isActive = validatedMarineEventSeverity === severity;
                    const url = isActive
                      ? `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: validatedMarineEventStatus,
                        marineInvestigationStatus: validatedMarineInvestigationStatus,
                        marineAlertStatus: validatedMarineAlertStatus,
                        marineAlertSeverity: validatedMarineAlertSeverity,
                      })}`
                      : `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: validatedMarineEventStatus,
                        marineEventSeverity: severity,
                        marineInvestigationStatus: validatedMarineInvestigationStatus,
                        marineAlertStatus: validatedMarineAlertStatus,
                        marineAlertSeverity: validatedMarineAlertSeverity,
                      })}`;

                    return (
                      <a
                        key={severity}
                        href={url}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
                          isActive
                            ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                            : "border-slate-600/30 bg-slate-800/40 text-slate-400 hover:border-slate-500/40 hover:text-slate-300"
                        }`}
                      >
                        {severity}
                      </a>
                    );
                  })}
                </div>
              </div>

              {marineEvents.length === 0 ? (
                <p className="text-xs text-slate-500">No marine intelligence events found.</p>
              ) : (
                <div className="space-y-3">
                  {marineEvents.map((event) => {
                    const linkedInvestigation = marineInvestigationByEventId.get(event.id) ?? null;
                    return (
                      <div key={event.id} className="rounded-xl border border-slate-700/40 bg-ocean-850/60 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-slate-100">{event.title}</p>
                            <p className="mt-1 text-[10px] text-slate-400">{event.summary}</p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <span className={severityBadgeClass(event.severity)}>{event.severity}</span>
                            <span className={marineEventStatusBadgeClass(event.status)}>{event.status}</span>
                          </div>
                        </div>
                        <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                          <p>Ontology: {event.ontologyTermId}</p>
                          <p>Confidence: {event.confidence}%</p>
                          <p>
                            Provenance: {event.lineage.source} · {event.lineage.sourceRecordId} · {new Date(event.lineage.observedAt).toLocaleString()}
                          </p>
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-700/40 pt-3">
                          <div className="text-[10px] text-slate-500">
                            {linkedInvestigation ? (
                              <span>Linked investigation: {linkedInvestigation.title}</span>
                            ) : (
                              <span>No linked investigation</span>
                            )}
                          </div>
                          {linkedInvestigation ? null : (
                            <MarineInvestigationCreateButton
                              eventId={event.id}
                              title={`Investigate ${event.title}`}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/40 p-4">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Investigations</p>
                <div className="flex flex-wrap gap-2">
                  {(["open", "acknowledged", "in_review", "resolved", "dismissed"] as MarineWorkflowInvestigationStatus[]).map((status) => {
                    const isActive = validatedMarineInvestigationStatus === status;
                    const url = isActive
                      ? `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: validatedMarineEventStatus,
                        marineEventSeverity: validatedMarineEventSeverity,
                        marineAlertStatus: validatedMarineAlertStatus,
                        marineAlertSeverity: validatedMarineAlertSeverity,
                      })}`
                      : `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: validatedMarineEventStatus,
                        marineEventSeverity: validatedMarineEventSeverity,
                        marineInvestigationStatus: status,
                        marineAlertStatus: validatedMarineAlertStatus,
                        marineAlertSeverity: validatedMarineAlertSeverity,
                      })}`;

                    return (
                      <a
                        key={status}
                        href={url}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
                          isActive
                            ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                            : "border-slate-600/30 bg-slate-800/40 text-slate-400 hover:border-slate-500/40 hover:text-slate-300"
                        }`}
                      >
                        {status}
                      </a>
                    );
                  })}
                </div>
              </div>

              {marineInvestigations.length === 0 ? (
                <p className="text-xs text-slate-500">No marine investigations found.</p>
              ) : (
                <div className="space-y-3">
                  {marineInvestigations.map((investigation) => (
                    <div key={investigation.id} className="rounded-xl border border-slate-700/40 bg-ocean-850/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-100">{investigation.title}</p>
                          <p className="mt-1 text-[10px] text-slate-500">
                            {investigation.eventTitle ?? investigation.eventId}
                            {investigation.ownerId ? ` · ${investigation.ownerId}` : ""}
                          </p>
                        </div>
                        <span className={marineInvestigationStatusBadgeClass(investigation.status)}>
                          {investigation.status}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                        <p>Region: {investigation.region ?? "—"}</p>
                        <p>Opened: {new Date(investigation.createdAt).toLocaleString()}</p>
                        <p>Updated: {new Date(investigation.updatedAt).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/40 p-4">
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Alerts</p>
                <div className="flex flex-wrap gap-2">
                  {(["active", "acknowledged", "resolved"] as MarineWorkflowAlertStatus[]).map((status) => {
                    const isActive = validatedMarineAlertStatus === status;
                    const url = isActive
                      ? `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: validatedMarineEventStatus,
                        marineEventSeverity: validatedMarineEventSeverity,
                        marineInvestigationStatus: validatedMarineInvestigationStatus,
                        marineAlertSeverity: validatedMarineAlertSeverity,
                      })}`
                      : `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: validatedMarineEventStatus,
                        marineEventSeverity: validatedMarineEventSeverity,
                        marineInvestigationStatus: validatedMarineInvestigationStatus,
                        marineAlertStatus: status,
                        marineAlertSeverity: validatedMarineAlertSeverity,
                      })}`;

                    return (
                      <a
                        key={status}
                        href={url}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
                          isActive
                            ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                            : "border-slate-600/30 bg-slate-800/40 text-slate-400 hover:border-slate-500/40 hover:text-slate-300"
                        }`}
                      >
                        {status}
                      </a>
                    );
                  })}
                </div>
                <div className="flex flex-wrap gap-2">
                  {(["low", "medium", "high", "critical"] as MarineWorkflowEventSeverity[]).map((severity) => {
                    const isActive = validatedMarineAlertSeverity === severity;
                    const url = isActive
                      ? `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: validatedMarineEventStatus,
                        marineEventSeverity: validatedMarineEventSeverity,
                        marineInvestigationStatus: validatedMarineInvestigationStatus,
                        marineAlertStatus: validatedMarineAlertStatus,
                      })}`
                      : `/ocean-stations/${params.id}/admin/events${buildMarineFilterQueryString({
                        status: validatedStatus,
                        severity: validatedSeverity,
                        cursor: searchParams?.cursor,
                        eventId,
                        marineEventStatus: validatedMarineEventStatus,
                        marineEventSeverity: validatedMarineEventSeverity,
                        marineInvestigationStatus: validatedMarineInvestigationStatus,
                        marineAlertStatus: validatedMarineAlertStatus,
                        marineAlertSeverity: severity,
                      })}`;

                    return (
                      <a
                        key={severity}
                        href={url}
                        className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.08em] transition-colors ${
                          isActive
                            ? "border-cyan-500/50 bg-cyan-500/15 text-cyan-300"
                            : "border-slate-600/30 bg-slate-800/40 text-slate-400 hover:border-slate-500/40 hover:text-slate-300"
                        }`}
                      >
                        {severity}
                      </a>
                    );
                  })}
                </div>
              </div>

              {marineAlerts.length === 0 ? (
                <p className="text-xs text-slate-500">No marine alerts found.</p>
              ) : (
                <div className="space-y-3">
                  {marineAlerts.map((alert) => (
                    <div key={alert.id} className="rounded-xl border border-slate-700/40 bg-ocean-850/60 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-slate-100">{alert.title}</p>
                          <p className="mt-1 text-[10px] text-slate-400">{alert.detail ?? alert.eventTitle ?? alert.eventId}</p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={severityBadgeClass(alert.severity)}>{alert.severity}</span>
                          <span className={marineAlertStatusBadgeClass(alert.status)}>{alert.status}</span>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1 text-[10px] text-slate-500">
                        <p>Event: {alert.eventTitle ?? alert.eventId}</p>
                        <p>Rule: {alert.ruleType}</p>
                        <p>Detected: {new Date(alert.detectedAt).toLocaleString()}</p>
                      </div>
                      <div className="mt-3 border-t border-slate-700/40 pt-3">
                        <MarineAlertStatusActions alertId={alert.id} status={alert.status} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
