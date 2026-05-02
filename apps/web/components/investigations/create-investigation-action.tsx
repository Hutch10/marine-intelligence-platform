"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

export interface CreateInvestigationPrefill {
  eventId: string | null;
  title: string;
  sourceType: "signal" | "anomaly" | null;
  region: string | null;
  detectedAt: string | null;
  stationId: string | null;
  relatedStations?: string[];
}

interface CreateInvestigationActionProps {
  prefill: CreateInvestigationPrefill;
  buttonLabel?: string;
}

function formatUtc(value: string | null): string {
  if (!value) {
    return "not provided";
  }

  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return "not provided";
  }

  return `${new Date(parsed).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatSourceType(value: "signal" | "anomaly" | null): string {
  if (!value) {
    return "not provided";
  }

  return value;
}

export function CreateInvestigationAction({
  prefill,
  buttonLabel = "Create Investigation",
}: CreateInvestigationActionProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(prefill.title);
  const [eventId, setEventId] = useState(prefill.eventId ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdInvestigationId, setCreatedInvestigationId] = useState<string | null>(null);

  const relatedStations = useMemo(() => {
    const merged = [
      ...(prefill.stationId ? [prefill.stationId] : []),
      ...(prefill.relatedStations ?? []),
    ];

    return [...new Set(merged.filter(Boolean))];
  }, [prefill.relatedStations, prefill.stationId]);

  const canSubmit = eventId.trim().length > 0 && title.trim().length > 0 && !isSubmitting;

  async function handleCreate() {
    setError(null);
    setCreatedInvestigationId(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/marine-intelligence/investigations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          eventId: eventId.trim(),
          title: title.trim(),
          sourceType: prefill.sourceType ?? undefined,
          stationId: prefill.stationId ?? undefined,
          region: prefill.region ?? undefined,
          detectedAt: prefill.detectedAt ?? undefined,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        investigation?: { id?: string };
      };

      if (!response.ok) {
        setError(payload.message ?? "Unable to create investigation.");
        return;
      }

      const investigationId = payload.investigation?.id;

      if (!investigationId) {
        setError("Investigation created but no investigation ID was returned.");
        return;
      }

      setCreatedInvestigationId(investigationId);
    } catch {
      setError("Unable to create investigation.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/20"
      >
        {buttonLabel}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-surface-borderSubtle bg-ocean-900/80 p-3 text-[11px] text-slate-300">
          <p className="font-medium text-slate-100">Investigation draft</p>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-slate-500">Event ID</span>
              <input
                value={eventId}
                onChange={(event) => setEventId(event.target.value)}
                className="rounded border border-surface-borderSubtle bg-ocean-850 px-2 py-1 text-slate-100"
                placeholder="event identifier"
              />
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-slate-500">Title</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                className="rounded border border-surface-borderSubtle bg-ocean-850 px-2 py-1 text-slate-100"
                placeholder="Investigation title"
              />
            </label>
          </div>

          <div className="mt-2 rounded border border-surface-borderSubtle bg-ocean-850/70 px-2 py-2 text-[10px] text-slate-400">
            <p>Source type: {formatSourceType(prefill.sourceType)}</p>
            <p>Region: {prefill.region ?? "not provided"}</p>
            <p>Detected: {formatUtc(prefill.detectedAt)}</p>
            <p>Related stations: {relatedStations.length > 0 ? relatedStations.join(", ") : "not provided"}</p>
          </div>

          {error && (
            <p className="mt-2 text-rose-300">{error}</p>
          )}

          {createdInvestigationId && (
            <p className="mt-2 text-emerald-300">
              Investigation created. <Link href={`/investigations/${encodeURIComponent(createdInvestigationId)}`} className="underline">Open investigation</Link>
            </p>
          )}

          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreate}
              disabled={!canSubmit}
              className="rounded border border-cyan-500/25 bg-cyan-500/10 px-2.5 py-1 text-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Creating..." : "Submit"}
            </button>
            {!canSubmit && (
              <span className="text-slate-500">Event ID and title are required.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}