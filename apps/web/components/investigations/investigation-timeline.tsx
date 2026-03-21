import { Clock, Zap, Target, FileText, AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { InvestigationTimelineItem, InvestigationTimelineEventType } from "@/lib/api/types";

interface InvestigationTimelineProps {
  items: InvestigationTimelineItem[];
}

const eventTypeConfig: Record<InvestigationTimelineEventType, { label: string; icon: typeof Clock; color: string }> = {
  case_opened: { label: "Case Opened", icon: Target, color: "text-cyan-400" },
  signal_linked: { label: "Signal Linked", icon: Zap, color: "text-emerald-400" },
  hypothesis_tested: { label: "Hypothesis Tested", icon: FileText, color: "text-violet-400" },
  evidence_promoted: { label: "Evidence Promoted", icon: CheckCircle2, color: "text-emerald-400" },
  track_escalated: { label: "Track Escalated", icon: AlertTriangle, color: "text-amber-400" },
  case_closed: { label: "Case Closed", icon: CheckCircle2, color: "text-slate-400" },
};

function formatTimeString(isotimestamp: string, now = new Date()): string {
  const ts = new Date(isotimestamp);
  if (Number.isNaN(ts.getTime())) return "Unknown";

  const diffMs = Math.max(0, now.getTime() - ts.getTime());
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} min ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hr ago`;

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

export function InvestigationTimeline({ items }: InvestigationTimelineProps) {
  if (!items || items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/40 p-6 text-center">
        <p className="text-sm text-slate-500">No timeline events yet</p>
      </div>
    );
  }

  const sortedItems = [...items].sort((left, right) => {
    const leftTs = Date.parse(left.timestamp);
    const rightTs = Date.parse(right.timestamp);

    if (Number.isNaN(leftTs) || Number.isNaN(rightTs)) {
      return right.id.localeCompare(left.id);
    }

    return rightTs - leftTs;
  });

  return (
    <div className="space-y-4">
      {sortedItems.map((item, idx) => {
        const config = eventTypeConfig[item.eventType];
        const Icon = config.icon;
        const isLast = idx === sortedItems.length - 1;

        return (
          <div key={item.id} className="relative">
            {/* Timeline line connector */}
            {!isLast && (
              <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-gradient-to-b from-surface-borderSubtle via-surface-borderSubtle to-transparent" />
            )}

            {/* Timeline entry */}
            <div className="flex gap-4">
              {/* Timeline dot */}
              <div className={cn("relative mt-1 shrink-0", "flex h-10 w-10 items-center justify-center rounded-full border-2 border-surface-borderSubtle bg-ocean-850")}>
                <Icon size={18} className={config.color} />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0 rounded-xl border border-surface-borderSubtle bg-ocean-850/50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] text-slate-500">{item.id}</p>
                    <p className="text-xs font-medium text-slate-200 mt-1">{config.label}</p>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                    <Clock size={10} />
                    {formatTimeString(item.timestamp)}
                  </span>
                </div>

                <p className="mt-2 text-sm text-slate-300">{item.summary}</p>

                {item.detail && (
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{item.detail}</p>
                )}

                <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-600">
                  <span className="inline-block px-2 py-1 rounded border border-surface-borderSubtle bg-ocean-900">
                    {item.source}
                  </span>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
