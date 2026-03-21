"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OceanStationAlert, OceanStationTimelineItem } from "@/lib/api/types";

const ALERT_COLORS = {
  high: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  medium: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  low: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
} as const;

interface OceanStationAlertActivityProps {
  stationId: string;
  alerts: OceanStationAlert[];
  actorId: string;
}

export function OceanStationAlertActivity({ stationId, alerts, actorId }: OceanStationAlertActivityProps) {
  const [localAlerts, setLocalAlerts] = useState<OceanStationAlert[]>(alerts);
  const [followUpEvents, setFollowUpEvents] = useState<Record<string, OceanStationTimelineItem>>({});
  const [pending, setPending] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleAcknowledge(alertId: string) {
    setPending(alertId);
    setErrors((prev) => {
      const next = { ...prev };
      delete next[alertId];
      return next;
    });

    try {
      const res = await fetch(`/api/stations/${stationId}/alerts/${alertId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId }),
      });

      const data = (await res.json()) as {
        ok?: true;
        alert?: OceanStationAlert;
        timelineEvent?: OceanStationTimelineItem;
        message?: string;
      };

      if (res.ok && data.alert) {
        setLocalAlerts((prev) => prev.map((a) => (a.id === alertId ? data.alert! : a)));
        if (data.timelineEvent) {
          setFollowUpEvents((prev) => ({ ...prev, [alertId]: data.timelineEvent! }));
        }
      } else {
        setErrors((prev) => ({ ...prev, [alertId]: data.message ?? "Failed to acknowledge alert" }));
      }
    } catch {
      setErrors((prev) => ({ ...prev, [alertId]: "Network error. Please try again." }));
    } finally {
      setPending(null);
    }
  }

  if (localAlerts.length === 0) {
    return <p className="text-xs text-slate-500">No active alerts.</p>;
  }

  return (
    <div className="space-y-3">
      {localAlerts.map((alert) => {
        const isAcknowledged = alert.acknowledgedAt !== null;
        const isPending = pending === alert.id;
        const error = errors[alert.id];
        const followUpEvent = followUpEvents[alert.id];

        return (
          <div key={alert.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-medium text-slate-100">{alert.title}</p>
              <span
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.16em]",
                  ALERT_COLORS[alert.severity],
                )}
              >
                {alert.severity}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{alert.detail}</p>
            <div className="mt-2 flex items-center justify-between gap-2">
              <p className="text-[10px] text-slate-500">
                {isAcknowledged ? (
                  <span className="text-emerald-400">
                    Acknowledged by {alert.acknowledgedBy} ·{" "}
                    {new Date(alert.acknowledgedAt!).toLocaleString()}
                  </span>
                ) : (
                  <span>
                    {alert.status} · {alert.detectedAt}
                  </span>
                )}
              </p>
              {isAcknowledged ? (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400">
                  <CheckCircle2 size={11} />
                  Acknowledged
                </span>
              ) : (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => handleAcknowledge(alert.id)}
                  className="inline-flex items-center gap-1 rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <AlertTriangle size={10} />
                  {isPending ? "Acknowledging…" : "Acknowledge"}
                </button>
              )}
            </div>
            {error ? (
              <p className="mt-1 text-[10px] text-rose-400">{error}</p>
            ) : null}
            {followUpEvent ? (
              <p className="mt-1 text-[10px] text-cyan-300">
                Follow-up logged to timeline: {followUpEvent.label} · {new Date(followUpEvent.happenedAt).toLocaleString()}
              </p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
