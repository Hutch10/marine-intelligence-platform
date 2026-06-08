import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { getOperatorStatus, type OperatorStatusResponse } from "@/lib/server/operator-status";
import { getFeedHealth } from "@/lib/feed-health";
import {
  fetchOperationalAnalyticsSummary,
  recordOperationalAnalytics,
} from "@/lib/server/record-operational-analytics";
import type { OperationalAnalyticsSummary } from "@marine/shared";

export const metadata: Metadata = {
  title: "Operator Console",
  robots: { index: false, follow: false },
};

function formatEpoch(ms: number): string {
  if (!ms) {
    return "—";
  }

  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

function stateClass(state: string): string {
  if (state === "open" || state === "failed") {
    return "border-rose-500/30 bg-rose-500/10 text-rose-300";
  }

  if (state === "half_open" || state === "degraded" || state === "stale") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-300";
  }

  return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
}

export default async function OperatorPage() {
  await recordOperationalAnalytics({ eventType: "operator_usage", dimension: "console" });
  const status: OperatorStatusResponse = await getOperatorStatus();
  const publicFeedHealth = getFeedHealth();
  const analytics = (await fetchOperationalAnalyticsSummary()) as OperationalAnalyticsSummary | null;

  return (
    <AppShell
      pageTitle="Operator Console"
      pageSubtitle="Internal ingestion diagnostics — not shown on public surfaces"
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-6 p-6">

        <div className="flex flex-wrap gap-3">
          <Link
            href="/operator/lineage"
            className="rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-sm text-cyan-200 hover:bg-cyan-500/20"
          >
            Data Lineage
          </Link>
        </div>

        <section className="rounded-2xl border border-cyan-500/25 bg-cyan-500/5 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-cyan-300">
            Operator-only surface
          </p>
          <p className="mt-1.5 text-sm text-cyan-100">
            Public telemetry remains summary-only. This console exposes feed health, replay validation,
            evidence completeness, review queue state, and publication decisions. Partial evidence is shown
            here but never promoted as trusted on public surfaces.
          </p>
        </section>

        {analytics && (
          <Panel
            title="Operational analytics (privacy-first)"
            subtitle="Daily aggregate counts only — no accounts, sessions, or resource identifiers"
          >
            <p className="mb-3 text-[11px] text-slate-500">{analytics.privacy.note}</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
              {(Object.entries(analytics.totalsByEventType) as Array<[string, number]>).map(([key, count]) => (
                <div
                  key={key}
                  className="rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-3 py-2"
                >
                  <p className="text-[10px] uppercase tracking-wider text-slate-500">{key.replace(/_/g, " ")}</p>
                  <p className="text-lg font-semibold text-slate-100">{count}</p>
                </div>
              ))}
            </div>
          </Panel>
        )}

        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatCard label="DB source" value={status.feed_health.source} />
          <StatCard label="Open circuits" value={String(status.circuit_breaker.openCount)} />
          <StatCard label="Withheld sources" value={String(status.freshness_governance.withheldCount)} />
          <StatCard label="Public overall" value={publicFeedHealth.overallStatus} />
        </div>

        <Panel title="Feed Health" subtitle="Latest ingestion summary and per-source status">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatCard label="Healthy" value={String(status.feed_health.summary.healthy_source_count)} />
            <StatCard label="Degraded" value={String(status.feed_health.summary.degraded_source_count)} />
            <StatCard label="Failed" value={String(status.feed_health.summary.failed_source_count)} />
            <StatCard label="Stale" value={String(status.feed_health.summary.stale_source_count)} />
          </div>
          <div className="mt-4 space-y-2">
            {status.feed_health.latest_status_by_source.map((source) => (
              <div
                key={source.source}
                className="rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm text-slate-200">{source.source}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${stateClass(source.status)}`}>
                    {source.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  Completed {source.completed_at} · inserted {source.inserted_count} · rejected {source.rejected_count}
                  {source.is_stale ? ` · stale ${source.stale_by_ms ?? 0}ms` : ""}
                </p>
                {source.error && (
                  <p className="mt-1 font-mono text-[11px] text-rose-300">{source.error}</p>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Source Status" subtitle="Scheduler-enabled feeds and interval configuration">
          <div className="space-y-2">
            {status.scheduler.sources.map((source) => (
              <div
                key={source.source}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-4 py-3"
              >
                <p className="text-sm text-slate-200">{source.label} ({source.source})</p>
                <p className="text-[11px] text-slate-400">
                  {source.enabled ? `every ${Math.round(source.intervalMs / 60000)}m` : "disabled"}
                </p>
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Scheduler Status" subtitle="Environment-driven ingestion cadence">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatCard label="NDBC interval" value={`${Math.round(status.scheduler.ndbcIntervalMs / 60000)}m`} />
            <StatCard label="CRW interval" value={`${Math.round(status.scheduler.crwIntervalMs / 60000)}m`} />
            <StatCard label="IOOS enabled" value={status.scheduler.ioosEnabled ? "yes" : "no"} />
            <StatCard label="ERDDAP enabled" value={status.scheduler.erddapEnabled ? "yes" : "no"} />
          </div>
        </Panel>

        <Panel title="Ingestion Timeline" subtitle="Recent worker runs (newest first)">
          <div className="overflow-hidden rounded-xl border border-surface-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border text-left text-[10px] uppercase tracking-[0.18em] text-slate-500">
                  <th className="px-4 py-2">Source</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Completed</th>
                  <th className="px-4 py-2">Inserted</th>
                  <th className="px-4 py-2">Rejected</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {status.feed_health.recent_history.slice(0, 15).map((item) => (
                  <tr key={`${item.source}-${item.completed_at}-${item.worker_run_id}`}>
                    <td className="px-4 py-2 font-mono text-[11px] text-slate-300">{item.source}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${stateClass(item.status)}`}>
                        {item.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-[11px] text-slate-500">{item.completed_at}</td>
                    <td className="px-4 py-2 text-[11px] text-slate-400">{item.inserted_count}</td>
                    <td className="px-4 py-2 text-[11px] text-slate-400">{item.rejected_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Circuit Breaker Status" subtitle="Consecutive failure tracking per source">
            <div className="space-y-2">
              {status.circuit_breaker.sources.map((item) => (
                <div key={item.source} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-200">{item.label}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${stateClass(item.state)}`}>
                      {item.state}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    failures {item.consecutiveFailures}/{item.failureThreshold}
                    {item.reason ? ` · ${item.reason}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Freshness Governance State" subtitle="Sources withheld from live promotion">
            <div className="space-y-2">
              {status.freshness_governance.sources.map((item) => (
                <div key={item.source} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-200">{item.label}</p>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${stateClass(item.promoteAsLive ? "closed" : "open")}`}>
                      {item.promoteAsLive ? "promote" : "withhold"}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    mode {item.mode}
                    {item.withholdReason ? ` · ${item.withholdReason}` : ""}
                  </p>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <Panel title="Replay Validation" subtitle="Burn-in sampling of live signal and alert replay completeness">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <StatCard
              label="Overall pass"
              value={status.harness.replayValidation.overallPass ? "yes" : "no"}
            />
            <StatCard label="Samples" value={String(status.harness.replayValidation.sampleCount)} />
            <StatCard label="Passed" value={String(status.harness.replayValidation.passedCount)} />
            <StatCard label="Failed" value={String(status.harness.replayValidation.failedCount)} />
          </div>
          <div className="mt-4 space-y-2">
            {status.harness.replayValidation.samples.slice(0, 8).map((sample) => (
              <div
                key={`${sample.target.kind}-${sample.target.id}`}
                className="rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-slate-300">
                    {sample.target.kind}:{sample.target.id}
                  </p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${stateClass(sample.passed ? "closed" : "open")}`}>
                    {sample.passed ? "pass" : "fail"}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">
                  evidence {sample.evidenceStatus}
                  {sample.withheldSections.length > 0 ? ` · withheld ${sample.withheldSections.join(", ")}` : ""}
                </p>
                {!sample.passed && sample.failures.length > 0 && (
                  <p className="mt-1 font-mono text-[11px] text-rose-300">{sample.failures.join("; ")}</p>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <Panel title="Replay Completeness" subtitle="Recent signal/alert evidence status (operator may show partial)">
          <div className="space-y-2">
            {status.harness.replayCompleteness.slice(0, 10).map((item) => (
              <div
                key={`${item.targetKind}-${item.targetId}`}
                className="rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[11px] text-slate-300">{item.targetKind}:{item.targetId}</p>
                  <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase ${stateClass(item.evidenceStatus === "complete" ? "closed" : item.evidenceStatus === "partial" ? "half_open" : "open")}`}>
                    {item.evidenceStatus}
                  </span>
                </div>
                {item.withheldSections.length > 0 && (
                  <p className="mt-1 text-[11px] text-slate-500">withheld: {item.withheldSections.join(", ")}</p>
                )}
              </div>
            ))}
          </div>
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Active Alerts" subtitle="Currently active operational alerts">
            <EventList
              emptyLabel="No active alerts"
              items={status.harness.alerts.active.map((item) => ({
                id: item.id,
                title: item.title,
                meta: `${item.source} · ${item.ruleType} · ${item.severity}`,
                detail: null,
              }))}
            />
          </Panel>

          <Panel title="Suppressed Alerts" subtitle="Harness-gated alerts withheld from publication">
            <EventList
              emptyLabel="No suppressed alerts"
              items={status.harness.alerts.suppressed.map((item) => ({
                id: item.alertKey,
                title: item.alertKey,
                meta: `${item.source} · ${item.ruleType} · ${item.evaluatedAt}`,
                detail: item.reason,
              }))}
            />
          </Panel>
        </div>

        <Panel title="Review Queue" subtitle={`${status.harness.reviewQueue.pendingCount} pending human review items`}>
          <EventList
            emptyLabel="No pending review items"
            items={status.harness.reviewQueue.items.map((item) => ({
              id: item.id,
              title: `${item.subjectType}:${item.subjectId}`,
              meta: `${item.queueStatus} · ${item.updatedAt}`,
              detail: item.annotation,
            }))}
          />
        </Panel>

        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="Recent Failures" subtitle="Active source_failed and persistence_failure alerts">
            <EventList
              emptyLabel="No active failure alerts"
              items={status.recent_failures.map((item) => ({
                id: item.id,
                title: item.title,
                meta: `${item.source} · ${item.ruleType} · ${formatEpoch(item.detectedAt)}`,
                detail: item.detail,
              }))}
            />
          </Panel>

          <Panel title="Recent Recoveries" subtitle="Resolved operational alerts">
            <EventList
              emptyLabel="No recent recoveries"
              items={status.recent_recoveries.map((item) => ({
                id: item.id,
                title: item.title,
                meta: `${item.source} · ${item.ruleType} · ${formatEpoch(item.resolvedAt)}`,
                detail: null,
              }))}
            />
          </Panel>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-100">{value}</p>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
      <p className="text-sm font-semibold text-slate-100">{title}</p>
      <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function EventList({
  items,
  emptyLabel,
}: {
  items: Array<{ id: string; title: string; meta: string; detail: string | null }>;
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <p className="text-sm text-slate-500">{emptyLabel}</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/60 px-4 py-3">
          <p className="text-sm text-slate-200">{item.title}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">{item.meta}</p>
          {item.detail && <p className="mt-1 text-[11px] text-slate-400">{item.detail}</p>}
        </div>
      ))}
    </div>
  );
}
