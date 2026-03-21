import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardAnomalySummaryCard } from "@/components/dashboard/dashboard-anomaly-summary";
import { SignalCenter } from "@/components/signals/signal-center";
import { apiClient } from "@/lib/api/client";
import type {
  DashboardActivityItem,
  DashboardMetric,
  DashboardMission,
  DashboardQuickAccessItem,
} from "@/lib/api/types";
import {
  Activity,
  Fish,
  Thermometer,
  Wind,
  Droplets,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Satellite,
  MapPin,
  Clock,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const COLOR_MAP = {
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/25",    icon: "text-cyan-400",    badge: "bg-cyan-500/15 text-cyan-300"    },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/25", icon: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-300" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/25",   icon: "text-amber-400",   badge: "bg-amber-500/15 text-amber-300"   },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/25",  icon: "text-violet-400",  badge: "bg-violet-500/15 text-violet-300"  },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/25",    icon: "text-rose-400",    badge: "bg-rose-500/15 text-rose-300"    },
};

const ACTIVITY_COLORS = {
  sensor:  "bg-cyan-500/20 text-cyan-400",
  species: "bg-emerald-500/20 text-emerald-400",
  alert:   "bg-amber-500/20 text-amber-400",
  report:  "bg-violet-500/20 text-violet-400",
};

// ---------------------------------------------------------------------------
// Sub-components (layout-only, no extra logic)
// ---------------------------------------------------------------------------

const METRIC_ICONS: Record<DashboardMetric["icon"], LucideIcon> = {
  fish: Fish,
  thermometer: Thermometer,
  wind: Wind,
  droplets: Droplets,
  activity: Activity,
  "alert-circle": AlertCircle,
};

function MetricCardTile({ m }: { m: DashboardMetric }) {
  const colors = COLOR_MAP[m.color];
  const changePositive = m.change > 0;
  const TrendIcon = m.change > 0 ? TrendingUp : m.change < 0 ? TrendingDown : Minus;
  const Icon = METRIC_ICONS[m.icon];

  return (
    <div className={cn("rounded-xl border p-4 space-y-3", colors.bg, colors.border)}>
      <div className="flex items-start justify-between">
        <div className={cn("p-2 rounded-lg", colors.bg, colors.border)}>
          <Icon size={16} className={colors.icon} />
        </div>
        <span
          className={cn(
            "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            changePositive ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300",
            m.change === 0 && "bg-slate-500/15 text-slate-400"
          )}
        >
          <TrendIcon size={10} />
          {Math.abs(m.change)}
          {m.unit ? m.unit : "%"}
        </span>
      </div>
      <div>
        <p className="text-xl font-bold text-slate-100 font-mono leading-none">
          {m.value}
          {m.unit && <span className="text-sm font-normal text-slate-400 ml-1">{m.unit}</span>}
        </p>
        <p className="text-[11px] text-slate-500 mt-1">{m.label}</p>
      </div>
    </div>
  );
}

function MissionStatusBadge({ status }: { status: DashboardMission["status"] }) {
  const cls = {
    "In Progress": "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
    "Pending":     "bg-amber-500/15 text-amber-300 border-amber-500/25",
    "Complete":    "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  }[status];

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border", cls)}>
      {status}
    </span>
  );
}

function formatConditionMetric(value: number | null, digits = 1): string {
  if (value === null || value === undefined) {
    return "--";
  }

  return value.toFixed(digits);
}

function formatStressLevel(level: string | null): string {
  if (!level) {
    return "--";
  }

  return level
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const [overview, prioritizedSignals, liveConditions, reefAlerts] = await Promise.all([
    apiClient.dashboard.getOverview(),
    apiClient.signals.list({ status: "open", limit: 8 }),
    apiClient.liveConditions.getLatest(),
    apiClient.reefAlerts.getLatest(),
  ]);

  const { metrics, missions, activity, quickAccess, anomalySummary, speciesActivity } = overview;

  return (
    <AppShell
      pageTitle="Mission Control"
      pageSubtitle="Ocean Intelligence Platform — real-time overview"
    >
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* ── Section header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Dashboard</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live ocean data · Updated just now
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock size={12} />
            <span className="font-mono">UTC 14:42:07</span>
          </div>
        </div>

        {/* ── Metric tiles ── */}
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
            {metrics.map((m: DashboardMetric) => (
              <MetricCardTile key={m.label} m={m} />
            ))}
          </div>
        </section>

        {/* ── Anomaly Summary ── */}
        {anomalySummary && <DashboardAnomalySummaryCard summary={anomalySummary} />}

        {/* ── Signal Center ── */}
        <SignalCenter signals={prioritizedSignals} />

        {/* ── Species Activity ── */}
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Species Activity</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {speciesActivity
                    ? `Last ${speciesActivity.windowDays} days · ${speciesActivity.generatedAt.slice(0, 10)}`
                    : "Verification-aware sightings and movement intelligence"}
                </p>
            </div>
              <div className="flex items-center gap-3">
                <Link href="/investigations" className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
                  Investigations
                </Link>
                <Link href="/species-database" className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">
                  Species Database
                </Link>
              </div>
          </div>

            {speciesActivity ? (
              <>
                {/* Stat tiles */}
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Recent sightings</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{speciesActivity.recentSightingCount}</p>
                  </div>
                  <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Movement signals</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{speciesActivity.recentMovementSignalCount}</p>
                  </div>
                  <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Top movement type</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {(speciesActivity.topMovementTypes[0] ?? "none").replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                {/* Top active species */}
                {speciesActivity.topActiveSpecies.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Top active species</p>
                    {speciesActivity.topActiveSpecies.map((entry) => (
                      <div
                        key={entry.speciesId}
                        className="flex items-center justify-between rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2"
                      >
                        <span className="text-xs text-slate-200">{entry.commonName}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {entry.sightingCount} sighting{entry.sightingCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ecological reasons — why this matters */}
                {speciesActivity.ecologicalReasons.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ecological signals</p>
                    {speciesActivity.ecologicalReasons.map((reason) => (
                      <article
                        key={reason.kind}
                        className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
                      >
                        <p className="text-[11px] font-medium text-emerald-300">{reason.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{reason.detail}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
                No recent species activity data available.
              </div>
            )}
        </section>

        {/* ── Live Marine Conditions ── */}
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Live Marine Conditions</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Latest NOAA NDBC buoy conditions by station
              </p>
            </div>
            <Link href="/ocean-map" className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">
              Ocean Map
            </Link>
          </div>

          {liveConditions.length > 0 ? (
            <div className="grid gap-2">
              {liveConditions.slice(0, 6).map((condition) => (
                <article
                  key={`${condition.stationId}-${condition.timestamp}`}
                  className="grid gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-3 text-[11px] text-slate-300 sm:grid-cols-[120px_repeat(4,minmax(0,1fr))_150px]"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Station</p>
                    <p className="mt-1 font-semibold text-slate-100">{condition.stationId}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Sea temp</p>
                    <p className="mt-1">{formatConditionMetric(condition.sstC)} °C</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wave height</p>
                    <p className="mt-1">{formatConditionMetric(condition.waveHeightM, 2)} m</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wind</p>
                    <p className="mt-1">{formatConditionMetric(condition.windSpeedMps)} m/s</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Pressure</p>
                    <p className="mt-1">{formatConditionMetric(condition.pressureHpa)} hPa</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Timestamp</p>
                    <p className="mt-1 font-mono text-slate-400">{condition.timestamp.slice(0, 16).replace("T", " ")} UTC</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
              No live marine conditions available.
            </div>
          )}
        </section>

        {/* ── Reef Stress Watch ── */}
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Reef Stress Watch</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Coral Reef Watch stress indicators from NOAA CRW
              </p>
            </div>
            <Link href="/investigations" className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors">
              Investigations
            </Link>
          </div>

          {reefAlerts.length > 0 ? (
            <div className="grid gap-2">
              {reefAlerts.slice(0, 6).map((alert) => (
                <article
                  key={`${alert.region}-${alert.stationId ?? "region"}-${alert.timestamp}`}
                  className="grid gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-3 text-[11px] text-slate-300 sm:grid-cols-[180px_repeat(4,minmax(0,1fr))_150px]"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Region</p>
                    <p className="mt-1 font-semibold text-slate-100">{alert.region}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">SST anomaly</p>
                    <p className="mt-1">{formatConditionMetric(alert.sstAnomalyC)} °C</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">HotSpot</p>
                    <p className="mt-1">{formatConditionMetric(alert.hotSpotC)} °C</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">DHW</p>
                    <p className="mt-1">{formatConditionMetric(alert.dhw)} week</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Stress level</p>
                    <p className="mt-1">{formatStressLevel(alert.stressLevel)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Timestamp</p>
                    <p className="mt-1 font-mono text-slate-400">{alert.timestamp.slice(0, 16).replace("T", " ")} UTC</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
              No reef stress alerts available.
            </div>
          )}
        </section>

        {/* ── Middle row: missions + activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Active missions — 3 cols */}
          <section className="lg:col-span-3 rounded-xl bg-ocean-900 border border-surface-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-borderSubtle">
              <div className="flex items-center gap-2">
                <Satellite size={14} className="text-cyan-400" />
                <span className="text-sm font-semibold text-slate-200">Active Missions</span>
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-medium">
                  {missions.filter((m: DashboardMission) => m.status !== "Complete").length} active
                </span>
              </div>
              <button className="flex items-center gap-1 text-[11px] text-cyan-500 hover:text-cyan-300 transition-colors">
                All missions <ChevronRight size={12} />
              </button>
            </div>

            <div className="divide-y divide-surface-borderSubtle">
              {missions.map((mission: DashboardMission) => (
                <div key={mission.id} className="flex items-center gap-4 px-5 py-3 hover:bg-ocean-800 transition-colors">
                  <div className="text-[10px] font-mono text-slate-500 w-16 shrink-0">{mission.id}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{mission.name}</p>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500">
                      <MapPin size={9} />
                      {mission.location}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1 rounded-full bg-ocean-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-500 transition-all"
                          style={{ width: `${mission.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono w-8 text-right">
                        {mission.progress}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <MissionStatusBadge status={mission.status} />
                    <span className="text-[10px] text-slate-500 font-mono">{mission.eta}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent activity — 2 cols */}
          <section className="lg:col-span-2 rounded-xl bg-ocean-900 border border-surface-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-borderSubtle">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-cyan-400" />
                <span className="text-sm font-semibold text-slate-200">Recent Activity</span>
              </div>
              <button className="flex items-center gap-1 text-[11px] text-cyan-500 hover:text-cyan-300 transition-colors">
                See all <ChevronRight size={12} />
              </button>
            </div>

            <div className="divide-y divide-surface-borderSubtle overflow-y-auto max-h-72">
              {activity.map((a: DashboardActivityItem, i: number) => (
                <div key={i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-ocean-800 transition-colors">
                  <span
                    className={cn(
                      "mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0",
                      ACTIVITY_COLORS[a.type]
                    )}
                  >
                    {a.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-300 leading-snug">{a.text}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Quick-nav cards ── */}
        <section>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-3">
            Quick Access
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickAccess.map(({ label, desc, href, color }: DashboardQuickAccessItem) => {
              const c = COLOR_MAP[color as keyof typeof COLOR_MAP];
              return (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    "group flex flex-col items-start gap-1 p-4 rounded-xl border text-left transition-all",
                    c.bg, c.border, "hover:brightness-125"
                  )}
                >
                  <span className={cn("text-xs font-semibold", c.icon)}>{label}</span>
                  <span className="text-[11px] text-slate-500">{desc}</span>
                  <ChevronRight
                    size={12}
                    className={cn("mt-1 transition-transform group-hover:translate-x-0.5", c.icon)}
                  />
                </Link>
              );
            })}
          </div>
        </section>

      </div>
    </AppShell>
  );
}
