import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarRange,
  CheckCircle2,
  Clock3,
  Filter,
  Layers3,
  MapPinned,
  Radar,
  SearchCheck,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import type { InvestigationsWorkspaceData, InvestigationSignalMetric } from "@/lib/api/types";
import { Panel } from "@/components/ui/panel";
import { InvestigationSpeciesSummaryCard } from "@/components/investigations/investigation-species-summary";
import { StatusBadge } from "@/components/ui/status-badge";
import { InvestigationTimeline } from "@/components/investigations/investigation-timeline";

const FILTER_ACCENTS = {
  cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
} as const;

const TRACK_STATE_STYLES = {
  Correlated: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  Watch: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  Escalated: "border-rose-500/25 bg-rose-500/10 text-rose-300",
} as const;

const HYPOTHESIS_STYLES = {
  Supported: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  Testing: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  "Needs Review": "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const EVIDENCE_STYLES = {
  High: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  Medium: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  Emerging: "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const SIGNAL_ICONS: Record<InvestigationSignalMetric["icon"], LucideIcon> = {
  radar: Radar,
  layers: Layers3,
  "shield-alert": ShieldAlert,
};

const CONFIDENCE_WIDTHS = [
  "w-[0%]",
  "w-[5%]",
  "w-[10%]",
  "w-[15%]",
  "w-[20%]",
  "w-[25%]",
  "w-[30%]",
  "w-[35%]",
  "w-[40%]",
  "w-[45%]",
  "w-[50%]",
  "w-[55%]",
  "w-[60%]",
  "w-[65%]",
  "w-[70%]",
  "w-[75%]",
  "w-[80%]",
  "w-[85%]",
  "w-[90%]",
  "w-[95%]",
  "w-[100%]",
] as const;

function getConfidenceWidthClass(value: number): string {
  const bounded = Math.min(100, Math.max(0, value));
  return CONFIDENCE_WIDTHS[Math.round(bounded / 5)] ?? CONFIDENCE_WIDTHS[0];
}

function ConfidenceBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ocean-800">
        <div
          className={cn(
            "h-full rounded-full",
            getConfidenceWidthClass(value),
            value >= 80 ? "bg-emerald-400" : value >= 65 ? "bg-cyan-400" : "bg-amber-400"
          )}
        />
      </div>
      <span className="w-8 text-right font-mono text-[10px] text-slate-500">{value}%</span>
    </div>
  );
}

interface InvestigationWorkspaceProps {
  data: InvestigationsWorkspaceData;
}

export function InvestigationWorkspace({ data }: InvestigationWorkspaceProps) {
  const { filterGroups, signalMetrics, analysisTracks, hypothesisLog, evidenceItems, timeline, speciesSummary } = data;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
            Investigations
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">
            Reef Stress Investigation Workspace
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Coordinate live anomaly review, track working hypotheses, and compare incoming evidence
            without leaving the shared mission shell.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
          <StatusBadge
            label="Priority: Elevated"
            className="border-rose-500/25 bg-rose-500/10 text-rose-300"
          />
          <div className="flex items-center gap-1 rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5">
            <CalendarRange size={12} className="text-cyan-400" />
            Synced 4 minutes ago
          </div>
          <Link
            href="/species-database"
            className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-cyan-300 transition-colors hover:bg-cyan-500/20"
          >
            Species impact context
          </Link>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Panel
          title="Filter Panel"
          subtitle="Scope the case before promoting new evidence."
          className="h-fit"
          action={<Filter size={14} className="text-cyan-400" />}
        >
          <div className="space-y-3">
            {filterGroups.map((group) => (
              <div key={group.label} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/80 p-3">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{group.label}</p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-200">{group.value}</span>
                  <StatusBadge label="Active" className={FILTER_ACCENTS[group.accent]} />
                </div>
              </div>
            ))}

            <div className="rounded-xl border border-dashed border-cyan-500/25 bg-cyan-500/5 p-3">
              <div className="flex items-start gap-3">
                <SearchCheck size={16} className="mt-0.5 text-cyan-400" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Suggested refinement</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Add dissolved oxygen overlays to reduce false positives near shelf breaks.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Analysis Canvas"
            subtitle="Primary workspace for correlated signals and investigation flow."
            action={
              <button className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15">
                Promote finding
              </button>
            }
          >
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {signalMetrics.map((metric) => {
                  const Icon = SIGNAL_ICONS[metric.icon];

                  return (
                  <div
                    key={metric.label}
                    className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4"
                  >
                    <div className="flex items-center justify-between">
                      <Icon size={15} className="text-cyan-400" />
                      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        {metric.delta}
                      </span>
                    </div>
                    <p className="mt-4 text-2xl font-semibold text-slate-100">{metric.value}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{metric.label}</p>
                  </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.16),_rgba(2,13,24,0)_42%),linear-gradient(180deg,rgba(6,27,48,0.92),rgba(4,20,37,0.96))] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-400">Active Focus</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-100">
                      Thermal anomaly progression across reef boundary
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                      Confidence is increasing as field observations align with the satellite heat band
                      and subsurface buoy warming profile. The strongest explanatory path still points to
                      temperature stress as the leading driver.
                    </p>
                  </div>
                  <div className="grid gap-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2">
                      <MapPinned size={12} className="text-cyan-400" />
                      Sector 14-C / Eastern shelf edge
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock3 size={12} className="text-cyan-400" />
                      Escalation window: next 36 hours
                    </div>
                    <div className="flex items-center gap-2">
                      <BarChart3 size={12} className="text-cyan-400" />
                      Cross-source agreement: 4 of 5 feeds
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 lg:grid-cols-3">
                  {analysisTracks.map((track) => (
                    <div key={track.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-[10px] text-slate-500">{track.id}</p>
                          <p className="mt-1 text-sm font-medium text-slate-100">{track.title}</p>
                        </div>
                        <StatusBadge label={track.state} className={TRACK_STATE_STYLES[track.state]} />
                      </div>
                      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{track.summary}</p>
                      <div className="mt-4">
                        <p className="mb-1.5 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                          Confidence
                        </p>
                        <ConfidenceBar value={track.confidence} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <InvestigationSpeciesSummaryCard summary={speciesSummary} />

          <Panel
            title="Hypothesis Log"
            subtitle="Working theories stay visible while new evidence arrives."
            action={
              <button className="text-[11px] font-medium text-cyan-400 transition-colors hover:text-cyan-300">
                Add hypothesis
              </button>
            }
          >
            <div className="space-y-3">
              {hypothesisLog.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4"
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-slate-500">{entry.id}</span>
                        <StatusBadge label={entry.status} className={HYPOTHESIS_STYLES[entry.status]} />
                      </div>
                      <p className="mt-2 text-sm font-medium text-slate-100">{entry.title}</p>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{entry.notes}</p>
                    </div>
                    <div className="min-w-40 rounded-xl border border-surface-borderSubtle bg-ocean-900/80 px-3 py-2">
                      <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Owner</p>
                      <p className="mt-1 text-xs text-slate-200">{entry.owner}</p>
                      <p className="mt-2 text-[10px] text-slate-500">Updated {entry.updated}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel
          title="Evidence Panel"
          subtitle="Ranked supporting material for the active case."
          className="h-fit"
          action={<AlertTriangle size={14} className="text-amber-400" />}
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-400">Evidence Stack</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">4 items promoted</p>
                </div>
                <StatusBadge label="2 verified" className="border-emerald-500/25 bg-emerald-500/10 text-emerald-300" />
              </div>
            </div>

            {evidenceItems.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] text-slate-500">{item.id}</p>
                    <p className="mt-1 text-sm font-medium text-slate-100">{item.source}</p>
                  </div>
                  <StatusBadge label={item.strength} className={EVIDENCE_STYLES[item.strength]} />
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                  <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2 py-1">
                    {item.kind}
                  </span>
                  <span>{item.timestamp}</span>
                </div>
                <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{item.detail}</p>
                <button className="mt-3 flex items-center gap-1 text-[11px] font-medium text-cyan-400 transition-colors hover:text-cyan-300">
                  Open evidence <ArrowRight size={12} />
                </button>
              </div>
            ))}

            <div className="rounded-xl border border-dashed border-surface-border bg-ocean-900/70 p-4">
              <div className="flex items-start gap-3">
                <BadgeCheck size={16} className="mt-0.5 text-emerald-400" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Verification queue</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Reef diver imagery is waiting on metadata cleanup before it can be added to the
                    active evidence stack.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={15} className="text-emerald-400" />
                <p className="text-xs font-medium text-slate-200">Recommendation</p>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-400">
                Trigger a reef surveillance pass before the next daylight cycle to lock in visual
                confirmation while the anomaly is still rising.
              </p>
            </div>
          </div>
        </Panel>

        <Panel
          title="Case Timeline"
          subtitle="Activity log showing all investigation events and updates."
          className="h-fit"
          action={<Clock3 size={14} className="text-cyan-400" />}
        >
          {timeline && timeline.length > 0 ? (
            <InvestigationTimeline items={timeline} />
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/40 p-4 text-center text-sm text-slate-500">
              No timeline events yet
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
