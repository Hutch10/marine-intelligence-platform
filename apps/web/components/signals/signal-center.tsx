import { Radar } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { SignalCard } from "@/components/signals/signal-card";
import type { SignalDetection } from "@/lib/api/types";

interface SignalCenterProps {
  signals: SignalDetection[];
  maxItems?: number;
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

export function SignalCenter({ signals, maxItems = 3 }: SignalCenterProps) {
  const openSignals = signals.filter((signal) => signal.status === "open");
  const candidates = openSignals.length > 0 ? openSignals : signals.filter((signal) => signal.status !== "dismissed");
  const prioritizedSignals = rankSignals(candidates).slice(0, maxItems);

  return (
    <Panel
      title="Signal Center"
      subtitle="Highest-priority open detections from the intelligence layer."
      action={
        <div className="flex items-center gap-2 text-[11px] text-cyan-300">
          <Radar size={14} className="text-cyan-400" />
          <span>{openSignals.length} open</span>
        </div>
      }
    >
      {prioritizedSignals.length > 0 ? (
        <div className="space-y-3">
          {prioritizedSignals.map((signal) => (
            <SignalCard key={signal.id} signal={signal} />
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
          No active signals available.
        </div>
      )}
    </Panel>
  );
}
