import { Radar } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { SignalCard } from "@/components/signals/signal-card";
import type { SignalDetection } from "@/lib/api/types";

interface SignalCenterProps {
  signals: SignalDetection[];
  maxItems?: number;
  getSignalHref?: (signal: SignalDetection) => string | null;
  statusLine?: string;
  emptyStateTitle?: string;
  emptyStateSubtitle?: string;
}

const SEVERITY_PRIORITY: Record<SignalDetection["severity"], number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

function rankSignals(signals: SignalDetection[]): SignalDetection[] {
  return [...signals].sort((left, right) => {
    const severityDelta = SEVERITY_PRIORITY[right.severity] - SEVERITY_PRIORITY[left.severity];

    if (severityDelta !== 0) {
      return severityDelta;
    }

    const confidenceDelta = right.confidence - left.confidence;

    if (confidenceDelta !== 0) {
      return confidenceDelta;
    }

    return new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime();
  });
}

export function SignalCenter({
  signals,
  maxItems = 3,
  getSignalHref,
  statusLine,
  emptyStateTitle = "No active signals available",
  emptyStateSubtitle = "The persisted signal store returned no active detections.",
}: SignalCenterProps) {
  const openSignals = signals.filter((signal) => signal.status === "open");
  const candidates = openSignals.length > 0 ? openSignals : signals.filter((signal) => signal.status !== "dismissed");
  const prioritizedSignals = rankSignals(candidates).slice(0, maxItems);

  return (
    <Panel
      title="Signal Center"
      subtitle="Persisted detections only. Signal cards do not imply system-wide live coverage beyond the records shown here."
      action={
        <div className="flex items-center gap-2 text-[11px] text-cyan-300">
          <Radar size={14} className="text-cyan-400" />
          <span>{openSignals.length} open</span>
        </div>
      }
    >
      {statusLine && (
        <p className="mb-4 text-[11px] leading-relaxed text-slate-400">{statusLine}</p>
      )}

      {prioritizedSignals.length > 0 ? (
        <div className="space-y-3">
          {prioritizedSignals.map((signal) => (
            <SignalCard
              key={signal.id}
              signal={signal}
              detailHref={getSignalHref?.(signal) ?? null}

            />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4">
          <p className="text-sm text-slate-300">{emptyStateTitle}</p>
          <p className="mt-1 text-[11px] text-slate-500">{emptyStateSubtitle}</p>
        </div>
      )}
    </Panel>
  );
}
