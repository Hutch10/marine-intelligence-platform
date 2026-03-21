"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type {
  OceanStationAdminAlertItem,
  StationAdminAuthEvent,
  OceanStationAdminAuditEntry,
  OceanStationAdminContentItem,
  OceanStationAdminPermission,
  OceanStationAdminSpeciesItem,
  OceanStationAdminTimelineItem,
  OceanStationDetail,
  OceanStationThemeAccent,
} from "@/lib/api/types";

interface OceanStationAdminWorkspaceProps {
  station: OceanStationDetail;
  saved: boolean;
  error: string | undefined;
  adminActorId: string;
  permissions: OceanStationAdminPermission[];
  canEditBranding: boolean;
  canEditContent: boolean;
  canViewAudit: boolean;
  auditHistory: OceanStationAdminAuditEntry[];
  authEvents: StationAdminAuthEvent[];
  saveAction: (formData: FormData) => Promise<void>;
  csrfToken: string;
}

type SpeciesDraftRow = OceanStationAdminSpeciesItem & { rowId: string };
type AlertDraftRow = OceanStationAdminAlertItem & { rowId: string };
type TimelineDraftRow = OceanStationAdminTimelineItem & { rowId: string };
type ContentDraftRow = OceanStationAdminContentItem & { rowId: string };

const ACCENT_OPTIONS: OceanStationThemeAccent[] = ["cyan", "emerald", "amber", "violet", "rose"];
const ALERT_SEVERITY_OPTIONS: OceanStationAdminAlertItem["severity"][] = ["high", "medium", "low"];

function prettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}

function toSpeciesDraft(station: OceanStationDetail): OceanStationAdminSpeciesItem[] {
  return [
    ...station.species.map((item) => ({
      name: item.name,
      status: item.status,
      populationTrend: item.populationTrend,
      notes: item.notes,
    })),
    { name: "", status: "", populationTrend: "", notes: "" },
  ];
}

function toAlertDraft(station: OceanStationDetail): OceanStationAdminAlertItem[] {
  return [
    ...station.alerts.map((item) => ({
      title: item.title,
      severity: item.severity,
      status: item.status,
      detail: item.detail,
    })),
    { title: "", severity: "medium", status: "", detail: "" },
  ];
}

function toTimelineDraft(station: OceanStationDetail): OceanStationAdminTimelineItem[] {
  return [
    ...station.timeline.map((item) => ({
      label: item.label,
      phase: item.phase,
      detail: item.detail,
    })),
    { label: "", phase: "", detail: "" },
  ];
}

function toContentDraft(station: OceanStationDetail): OceanStationAdminContentItem[] {
  return [
    ...station.content.map((item) => ({
      contentType: item.contentType,
      title: item.title,
      summary: item.summary,
      href: item.href,
    })),
    { contentType: "", title: "", summary: "", href: "" },
  ];
}

function toSpeciesRows(station: OceanStationDetail): SpeciesDraftRow[] {
  return toSpeciesDraft(station).map((item, index) => ({
    rowId: `species-${index + 1}`,
    ...item,
  }));
}

function toAlertRows(station: OceanStationDetail): AlertDraftRow[] {
  return toAlertDraft(station).map((item, index) => ({
    rowId: `alert-${index + 1}`,
    ...item,
  }));
}

function toTimelineRows(station: OceanStationDetail): TimelineDraftRow[] {
  return toTimelineDraft(station).map((item, index) => ({
    rowId: `timeline-${index + 1}`,
    ...item,
  }));
}

function toContentRows(station: OceanStationDetail): ContentDraftRow[] {
  return toContentDraft(station).map((item, index) => ({
    rowId: `content-${index + 1}`,
    ...item,
  }));
}

export function OceanStationAdminWorkspace({
  station,
  saved,
  error,
  adminActorId,
  permissions,
  canEditBranding,
  canEditContent,
  canViewAudit,
  auditHistory,
  authEvents,
  saveAction,
  csrfToken,
}: OceanStationAdminWorkspaceProps) {
  const speciesCounter = useRef(1);
  const alertsCounter = useRef(1);
  const timelineCounter = useRef(1);
  const contentCounter = useRef(1);

  const [speciesDraft, setSpeciesDraft] = useState<SpeciesDraftRow[]>(() => {
    const rows = toSpeciesRows(station);
    speciesCounter.current = rows.length + 1;
    return rows;
  });
  const [alertDraft, setAlertDraft] = useState<AlertDraftRow[]>(() => {
    const rows = toAlertRows(station);
    alertsCounter.current = rows.length + 1;
    return rows;
  });
  const [timelineDraft, setTimelineDraft] = useState<TimelineDraftRow[]>(() => {
    const rows = toTimelineRows(station);
    timelineCounter.current = rows.length + 1;
    return rows;
  });
  const [contentDraft, setContentDraft] = useState<ContentDraftRow[]>(() => {
    const rows = toContentRows(station);
    contentCounter.current = rows.length + 1;
    return rows;
  });
  const [isDirty, setIsDirty] = useState(false);
  const canEditAny = canEditBranding || canEditContent;

  useEffect(() => {
    const nextSpeciesRows = toSpeciesRows(station);
    const nextAlertRows = toAlertRows(station);
    const nextTimelineRows = toTimelineRows(station);
    const nextContentRows = toContentRows(station);

    setSpeciesDraft(nextSpeciesRows);
    setAlertDraft(nextAlertRows);
    setTimelineDraft(nextTimelineRows);
    setContentDraft(nextContentRows);

    speciesCounter.current = nextSpeciesRows.length + 1;
    alertsCounter.current = nextAlertRows.length + 1;
    timelineCounter.current = nextTimelineRows.length + 1;
    contentCounter.current = nextContentRows.length + 1;

    setIsDirty(false);
  }, [station]);

  useEffect(() => {
    if (saved) {
      setIsDirty(false);
    }
  }, [saved]);

  function markDirty() {
    if (!canEditAny) {
      return;
    }

    setIsDirty(true);
  }

  function addSpeciesRow() {
    if (!canEditContent) {
      return;
    }

    setSpeciesDraft((current) => [
      ...current,
      {
        rowId: `species-${speciesCounter.current++}`,
        name: "",
        status: "",
        populationTrend: "",
        notes: "",
      },
    ]);
    setIsDirty(true);
  }

  function removeSpeciesRow(rowId: string) {
    if (!canEditContent) {
      return;
    }

    setSpeciesDraft((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((row) => row.rowId !== rowId);
    });
    setIsDirty(true);
  }

  function addAlertRow() {
    if (!canEditContent) {
      return;
    }

    setAlertDraft((current) => [
      ...current,
      {
        rowId: `alert-${alertsCounter.current++}`,
        title: "",
        severity: "medium",
        status: "",
        detail: "",
      },
    ]);
    setIsDirty(true);
  }

  function removeAlertRow(rowId: string) {
    if (!canEditContent) {
      return;
    }

    setAlertDraft((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((row) => row.rowId !== rowId);
    });
    setIsDirty(true);
  }

  function addTimelineRow() {
    if (!canEditContent) {
      return;
    }

    setTimelineDraft((current) => [
      ...current,
      {
        rowId: `timeline-${timelineCounter.current++}`,
        label: "",
        phase: "",
        detail: "",
      },
    ]);
    setIsDirty(true);
  }

  function removeTimelineRow(rowId: string) {
    if (!canEditContent) {
      return;
    }

    setTimelineDraft((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((row) => row.rowId !== rowId);
    });
    setIsDirty(true);
  }

  function addContentRow() {
    if (!canEditContent) {
      return;
    }

    setContentDraft((current) => [
      ...current,
      {
        rowId: `content-${contentCounter.current++}`,
        contentType: "",
        title: "",
        summary: "",
        href: "",
      },
    ]);
    setIsDirty(true);
  }

  function removeContentRow(rowId: string) {
    if (!canEditContent) {
      return;
    }

    setContentDraft((current) => {
      if (current.length <= 1) {
        return current;
      }

      return current.filter((row) => row.rowId !== rowId);
    });
    setIsDirty(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 p-6">
      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
        <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-400">Internal Station Admin</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-100">{station.name} Admin Console</h2>
        <p className="mt-2 text-sm text-slate-400">
          Edit station branding and visitor-facing content with focused form sections. Changes publish to detail, exhibit, and public views.
        </p>
        <div className="mt-4 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
          <p className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Station ID</span>
            <span className="mt-1 block font-mono text-slate-300">{station.id}</span>
          </p>
          <p className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Slug</span>
            <span className="mt-1 block font-mono text-slate-300">{station.slug}</span>
          </p>
          <p className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Current Status</span>
            <span className="mt-1 block text-slate-300">{station.status}</span>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Link
            href={`/ocean-stations/${station.slug}`}
            className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-slate-300 transition-colors hover:text-cyan-300"
          >
            Back to station detail
          </Link>
          <Link
            href={`/ocean-stations/${station.slug}/exhibit`}
            className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-slate-300 transition-colors hover:text-cyan-300"
          >
            View exhibit
          </Link>
          <Link
            href={`/station/${station.slug}`}
            className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-slate-300 transition-colors hover:text-cyan-300"
          >
            View public page
          </Link>
          <Link
            href={`/ocean-stations/${station.slug}/admin/security`}
            className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-slate-300 transition-colors hover:text-cyan-300"
          >
            Security console
          </Link>
        </div>
        <div className="mt-4 rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-3 py-2 text-[11px] text-slate-400">
          <p className="uppercase tracking-[0.14em] text-slate-500">Session Permissions</p>
          <p className="mt-1">{permissions.join(", ") || "No scoped permissions assigned"}</p>
        </div>
      </section>

      {saved && !isDirty ? (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Station content updated successfully and is now live on detail, exhibit, and public pages.
        </section>
      ) : null}

      {error ? (
        <section className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          Save failed. {error}
        </section>
      ) : null}

      {isDirty && canEditAny ? (
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
          You have unsaved changes.
        </section>
      ) : null}

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Admin Audit History</h3>
            <p className="mt-1 text-xs text-slate-500">Internal log of who changed branding or content and when.</p>
          </div>
          <span className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-300">
            Signed in as {adminActorId}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {!canViewAudit ? (
            <p className="rounded-lg border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-3 text-xs text-slate-500">
              This session does not include station.view_audit.
            </p>
          ) : auditHistory.length > 0 ? (
            auditHistory.slice(0, 8).map((entry) => (
              <article key={entry.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {entry.area} update · {entry.actorRole}
                </p>
                <p className="mt-1">
                  <span className="text-slate-400">Actor:</span> {entry.actorId}
                </p>
                <p className="mt-1">
                  <span className="text-slate-400">When:</span> {new Date(entry.changedAt).toLocaleString()}
                </p>
                {entry.changedFields.length > 0 ? (
                  <p className="mt-1 text-slate-400">Fields: {entry.changedFields.join(", ")}</p>
                ) : null}
              </article>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-3 text-xs text-slate-500">
              No audit entries yet for this station.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Security Events</h3>
            <p className="mt-1 text-xs text-slate-500">Recent authentication activity for operational review.</p>
          </div>
          <span className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-400">
            Latest {Math.min(authEvents.length, 8)} events
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {!canViewAudit ? (
            <p className="rounded-lg border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-3 text-xs text-slate-500">
              This session does not include station.view_audit.
            </p>
          ) : authEvents.length > 0 ? (
            authEvents.slice(0, 8).map((event) => (
              <article key={event.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
                <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                  {event.eventType.replace(/_/g, " ")} · {new Date(event.occurredAt).toLocaleString()}
                </p>
                <p className="mt-1">
                  <span className="text-slate-400">Actor:</span> {event.actorId ?? "unknown"}
                </p>
                {event.sessionId ? (
                  <p className="mt-1 text-slate-400">Session: {event.sessionId}</p>
                ) : null}
                {event.ip ? (
                  <p className="mt-1 text-slate-400">IP: {event.ip}</p>
                ) : null}
                {event.userAgent ? (
                  <p className="mt-1 text-slate-400">Agent: {event.userAgent}</p>
                ) : null}
                {event.source ? (
                  <p className="mt-1 text-slate-400">Source: {event.source}</p>
                ) : null}
              </article>
            ))
          ) : (
            <p className="rounded-lg border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-3 text-xs text-slate-500">
              No auth events captured yet.
            </p>
          )}
        </div>
      </section>

      <form action={saveAction} className="space-y-6" onInput={canEditAny ? markDirty : undefined} onChange={canEditAny ? markDirty : undefined}>
          <input type="hidden" name="csrfToken" value={csrfToken} />
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          {!canEditBranding ? (
            <p className="mb-3 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Read-only: this session does not include station.edit_branding.
            </p>
          ) : null}
          <fieldset disabled={!canEditBranding} className={!canEditBranding ? "opacity-60" : undefined}>
          <h3 className="text-sm font-semibold text-slate-100">Branding and Messaging</h3>
          <p className="mt-1 text-xs text-slate-500">Set exhibit title, partner attribution, and public voice shown across station experiences.</p>
          <p className="mt-2 text-xs text-slate-500">Required fields are marked. Keep public copy concise and visitor-friendly.</p>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <fieldset className="rounded-xl border border-surface-borderSubtle bg-ocean-850/60 p-3">
              <legend className="px-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">Identity</legend>
              <div className="mt-2 space-y-3">
                <label className="block text-xs text-slate-400">
                  Exhibit Title *
                  <input
                    name="exhibitTitle"
                    defaultValue={station.branding.exhibitTitle}
                    className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                    placeholder="Kelp Forest Recovery Live"
                    required
                    maxLength={140}
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Accent Color
                  <select
                    name="accentColor"
                    defaultValue={station.branding.accentColor}
                    className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                  >
                    {ACCENT_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    Guidance: cyan for neutral science, emerald for habitat recovery, amber for caution-led experiences.
                  </span>
                </label>
              </div>
            </fieldset>

            <fieldset className="rounded-xl border border-surface-borderSubtle bg-ocean-850/60 p-3">
              <legend className="px-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">Sponsor and Operator</legend>
              <div className="mt-2 space-y-3">
                <label className="block text-xs text-slate-400">
                  Sponsor Name *
                  <input
                    name="sponsorName"
                    defaultValue={station.branding.sponsorName}
                    className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                    placeholder="Marine Bio Partner Network"
                    required
                    maxLength={120}
                  />
                </label>
                <label className="block text-xs text-slate-400">
                  Operator Name *
                  <input
                    name="operatorName"
                    defaultValue={station.branding.operatorName}
                    className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                    placeholder="Ocean Systems Lab"
                    required
                    maxLength={120}
                  />
                </label>
              </div>
            </fieldset>
          </div>

          <label className="mt-3 block text-xs text-slate-400">
            Public Description *
            <textarea
              name="publicDescription"
              rows={4}
              defaultValue={station.branding.publicDescription}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-200"
              placeholder="Share what visitors should learn from this station."
              required
              maxLength={360}
            />
            <span className="mt-1 block text-[11px] text-slate-500">Aim for one short paragraph that works in both kiosk and mobile contexts.</span>
          </label>
          </fieldset>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          {!canEditContent ? (
            <p className="mb-3 rounded-lg border border-dashed border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Read-only: this session does not include station.edit_content.
            </p>
          ) : null}
          <fieldset disabled={!canEditContent} className={!canEditContent ? "opacity-60" : undefined}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Featured Species</h3>
              <p className="mt-1 text-xs text-slate-500">One row per species card. Leave unused rows blank.</p>
            </div>
            <button
              type="button"
              onClick={addSpeciesRow}
              disabled={!canEditContent}
              className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"
            >
              Add species row
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {speciesDraft.map((item, index) => (
              <fieldset key={item.rowId} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Species Row {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeSpeciesRow(item.rowId)}
                    disabled={!canEditContent || speciesDraft.length <= 1}
                    aria-label={`Remove species row ${index + 1}`}
                    className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove row
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    Species Name
                    <input
                      name="speciesName"
                      defaultValue={item.name}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={120}
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Species Status
                    <input
                      name="speciesStatus"
                      defaultValue={item.status}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={60}
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    Population Trend
                    <input
                      name="speciesPopulationTrend"
                      defaultValue={item.populationTrend}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={160}
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    Notes
                    <textarea
                      name="speciesNotes"
                      rows={2}
                      defaultValue={item.notes}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={300}
                    />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
          </fieldset>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <fieldset disabled={!canEditContent} className={!canEditContent ? "opacity-60" : undefined}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Alerts</h3>
              <p className="mt-1 text-xs text-slate-500">Curate current ecological alerts shown in detail, exhibit, and public views.</p>
            </div>
            <button
              type="button"
              onClick={addAlertRow}
              disabled={!canEditContent}
              className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"
            >
              Add alert row
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {alertDraft.map((item, index) => (
              <fieldset key={item.rowId} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Alert Row {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeAlertRow(item.rowId)}
                    disabled={!canEditContent || alertDraft.length <= 1}
                    aria-label={`Remove alert row ${index + 1}`}
                    className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove row
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400 md:col-span-2">
                    Alert Title
                    <input
                      name="alertsTitle"
                      defaultValue={item.title}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={160}
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Severity
                    <select
                      name="alertsSeverity"
                      defaultValue={item.severity}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                    >
                      {ALERT_SEVERITY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs text-slate-400">
                    Alert Status
                    <input
                      name="alertsStatus"
                      defaultValue={item.status}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={80}
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    Alert Detail
                    <textarea
                      name="alertsDetail"
                      rows={2}
                      defaultValue={item.detail}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={320}
                    />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
          </fieldset>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <fieldset disabled={!canEditContent} className={!canEditContent ? "opacity-60" : undefined}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Timeline Items</h3>
              <p className="mt-1 text-xs text-slate-500">Maintain story milestones and current program phases.</p>
            </div>
            <button
              type="button"
              onClick={addTimelineRow}
              disabled={!canEditContent}
              className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"
            >
              Add timeline row
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {timelineDraft.map((item, index) => (
              <fieldset key={item.rowId} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Timeline Row {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeTimelineRow(item.rowId)}
                    disabled={!canEditContent || timelineDraft.length <= 1}
                    aria-label={`Remove timeline row ${index + 1}`}
                    className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove row
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    Timeline Label
                    <input
                      name="timelineLabel"
                      defaultValue={item.label}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={120}
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Phase
                    <input
                      name="timelinePhase"
                      defaultValue={item.phase}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={80}
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    Timeline Detail
                    <textarea
                      name="timelineDetail"
                      rows={2}
                      defaultValue={item.detail}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={320}
                    />
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
          </fieldset>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <fieldset disabled={!canEditContent} className={!canEditContent ? "opacity-60" : undefined}>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Educational Content</h3>
              <p className="mt-1 text-xs text-slate-500">Cards power learning modules in exhibit and public station views.</p>
            </div>
            <button
              type="button"
              onClick={addContentRow}
              disabled={!canEditContent}
              className="rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"
            >
              Add content row
            </button>
          </div>
          <div className="mt-4 space-y-3">
            {contentDraft.map((item, index) => (
              <fieldset key={item.rowId} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/60 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Content Row {index + 1}</p>
                  <button
                    type="button"
                    onClick={() => removeContentRow(item.rowId)}
                    disabled={!canEditContent || contentDraft.length <= 1}
                    aria-label={`Remove content row ${index + 1}`}
                    className="rounded-lg border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-[11px] text-rose-300 transition-colors hover:bg-rose-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Remove row
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <label className="text-xs text-slate-400">
                    Content Type
                    <input
                      name="contentType"
                      defaultValue={item.contentType}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      placeholder="guide, spotlight, video, faq"
                      maxLength={80}
                    />
                  </label>
                  <label className="text-xs text-slate-400">
                    Content Title
                    <input
                      name="contentTitle"
                      defaultValue={item.title}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={140}
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    Content Summary
                    <textarea
                      name="contentSummary"
                      rows={2}
                      defaultValue={item.summary}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      maxLength={320}
                    />
                  </label>
                  <label className="text-xs text-slate-400 md:col-span-2">
                    Link (optional)
                    <input
                      name="contentHref"
                      defaultValue={item.href ?? ""}
                      className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-sm text-slate-200"
                      pattern="(https?:\\/\\/.+|\\/.+)?"
                      title="Use an absolute URL starting with http:// or https://, or an internal path starting with /."
                    />
                    <span className="mt-1 block text-[11px] text-slate-500">Use full URLs or internal paths such as /station/example.</span>
                  </label>
                </div>
              </fieldset>
            ))}
          </div>
          </fieldset>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <fieldset disabled={!canEditContent} className={!canEditContent ? "opacity-60" : undefined}>
          <h3 className="text-sm font-semibold text-slate-100">Advanced JSON Overrides</h3>
          <p className="mt-1 text-xs text-slate-500">
            Optional and usually not needed. Use only for bulk imports from external tooling. If provided, JSON overrides matching structured sections.
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Each override must be a JSON array. Leave empty to keep structured rows as the source of truth.
          </p>
          <details className="mt-4 rounded-xl border border-surface-borderSubtle bg-ocean-850/50 p-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-300">Open raw JSON editors</summary>
            <div className="mt-3 space-y-3">
              <label className="block text-xs text-slate-400">
                Species JSON Override
                <textarea
                  id="speciesJson"
                  name="speciesJson"
                  rows={6}
                  placeholder={prettyJson(station.species.map((item) => ({
                    name: item.name,
                    status: item.status,
                    populationTrend: item.populationTrend,
                    notes: item.notes,
                  })))}
                  className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 font-mono text-xs text-slate-200"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Alerts JSON Override
                <textarea
                  id="alertsJson"
                  name="alertsJson"
                  rows={6}
                  placeholder={prettyJson(station.alerts.map((item) => ({
                    title: item.title,
                    severity: item.severity,
                    status: item.status,
                    detail: item.detail,
                  })))}
                  className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 font-mono text-xs text-slate-200"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Timeline JSON Override
                <textarea
                  id="timelineJson"
                  name="timelineJson"
                  rows={6}
                  placeholder={prettyJson(station.timeline.map((item) => ({
                    label: item.label,
                    phase: item.phase,
                    detail: item.detail,
                  })))}
                  className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 font-mono text-xs text-slate-200"
                />
              </label>
              <label className="block text-xs text-slate-400">
                Content JSON Override
                <textarea
                  id="contentJson"
                  name="contentJson"
                  rows={6}
                  placeholder={prettyJson(station.content.map((item) => ({
                    contentType: item.contentType,
                    title: item.title,
                    summary: item.summary,
                    href: item.href,
                  })))}
                  className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 font-mono text-xs text-slate-200"
                />
              </label>
            </div>
          </details>
          </fieldset>
        </section>

        <div className="flex items-center justify-end gap-3">
          {!canEditAny ? <p className="text-xs text-slate-500">No edit permissions assigned to this session.</p> : null}
          {canEditAny && !isDirty ? <p className="text-xs text-slate-500">No unsaved changes.</p> : null}
          <button
            type="submit"
            disabled={!canEditAny}
            className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"
          >
            Save Station Updates
          </button>
        </div>
      </form>
    </div>
  );
}
