import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { listOperationalAlerts } from "@/lib/server/operational-alerts";
import type { OperationalAlertItem, OperationalAlertsData } from "@/lib/server/operational-alerts";
import { SystemIntegrityStatus } from "@/lib/integrity-constants";

export const metadata: Metadata = {
  title: "Operational Alerts",
};

const SEVERITY_STYLES: Record<string, string> = {
  critical: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  warning: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  info: "border-surface-border bg-ocean-850 text-slate-400",
};

const RULE_TYPE_LABEL: Record<string, string> = {
  source_failed: "Source failed",
  source_stale: "Source stale",
  repeated_degraded: "Repeated degraded",
  persistence_failure: "Persistence failure",
};

function SeverityBadge({
  severity,
  systemIntegrity,
}: {
  severity: string;
  systemIntegrity: SystemIntegrityStatus;
}) {
  if (systemIntegrity === SystemIntegrityStatus.TRUST_BLOCKED) {
    return (
      <span className="inline-flex rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-rose-400">
        WITHHELD
      </span>
    );
  }

  const cls = systemIntegrity === SystemIntegrityStatus.DEGRADED
    ? "border-amber-500/40 bg-amber-500/10 text-amber-400"
    : (SEVERITY_STYLES[severity] ?? "border-surface-border bg-ocean-850 text-slate-400");

  const label = systemIntegrity === SystemIntegrityStatus.DEGRADED
    ? `${severity} (degraded)`
    : severity;

  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${cls}`}>
      {label}
    </span>
  );
}

function formatEpoch(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

export default async function OperationalAlertsPage() {
  const result: OperationalAlertsData = await listOperationalAlerts();
  const { summary, activeAlerts, recentHistory, systemIntegrity } = result;
  const trustBlocked = systemIntegrity === SystemIntegrityStatus.TRUST_BLOCKED;
  const degraded = systemIntegrity === SystemIntegrityStatus.DEGRADED;

  return (
    <AppShell
      pageTitle="Operational Alerts"
      pageSubtitle="Ingestion pipeline health — live feed from the operational alerts system"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-6">

        {/* ── Source notice when unavailable ── */}
        {result.source === "unavailable" && (
          <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-400">
              Data unavailable
            </p>
            <p className="mt-1.5 text-sm text-amber-100">
              The operational alerts database is unreachable. The table below shows no records.
              Check API connectivity or run the ingest worker.
            </p>
          </section>
        )}

        {/* ── Trust integrity banners ── */}
        {trustBlocked && (
          <section className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-rose-400">
              TRUST_BLOCKED — Alert content withheld
            </p>
            <p className="mt-1.5 text-sm text-rose-200">
              System integrity is unresolved. Alert existence and counts are preserved but
              severity, title, and diagnostic detail are withheld until partition integrity
              is restored.
            </p>
          </section>
        )}
        {degraded && (
          <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-400">
              INTEGRITY: DEGRADED
            </p>
            <p className="mt-1.5 text-sm text-amber-100">
              Alert data is available but system integrity is partially degraded. Treat
              severity indicators as capped estimates.
            </p>
          </section>
        )}

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Active</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">
              {summary.activeAlertCount}
            </p>
          </div>
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-rose-300">Critical</p>
            <p className="mt-1 text-2xl font-semibold text-rose-100">
              {trustBlocked ? "—" : summary.criticalCount}
            </p>
          </div>
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-amber-300">Warning</p>
            <p className="mt-1 text-2xl font-semibold text-amber-100">
              {trustBlocked ? "—" : summary.warningCount}
            </p>
          </div>
        </div>

        {/* ── Active alerts table ── */}
        <AlertTable
          title="Active Alerts"
          alerts={activeAlerts}
          systemIntegrity={systemIntegrity}
          emptyMessage="No active alerts"
        />

        {/* ── Recent history table ── */}
        {recentHistory.length > 0 && (
          <AlertTable
            title="Recent History"
            alerts={recentHistory}
            systemIntegrity={systemIntegrity}
          />
        )}
      </div>
    </AppShell>
  );
}

function AlertTable({
  title,
  alerts,
  systemIntegrity,
  emptyMessage,
}: {
  title: string;
  alerts: OperationalAlertItem[];
  systemIntegrity: SystemIntegrityStatus;
  emptyMessage?: string;
}) {
  const trustBlocked = systemIntegrity === SystemIntegrityStatus.TRUST_BLOCKED;

  return (
    <section className="space-y-2">
      <p className="text-xs font-semibold text-slate-200">{title}</p>
      {alerts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-6">
          <p className="text-sm text-slate-400">{emptyMessage ?? "No records"}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-surface-border bg-ocean-900">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-border">
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Severity
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Title
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Rule type
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Source
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Detected
                </th>
                <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Investigation
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-border">
              {alerts.map((alert: OperationalAlertItem) => (
                <tr key={alert.id} className="transition-colors hover:bg-ocean-850/50">
                  <td className="px-5 py-3">
                    <SeverityBadge severity={alert.severity} systemIntegrity={systemIntegrity} />
                  </td>
                  <td className="px-5 py-3 text-slate-200">
                    <p className="font-medium">
                      {trustBlocked ? (
                        <span className="text-rose-400/70 italic">WITHHELD</span>
                      ) : (
                        alert.title
                      )}
                    </p>
                    {/* F-OA-06: detail gated — suppressed under TRUST_BLOCKED */}
                    {!trustBlocked && alert.detail && (
                      <p className="mt-0.5 text-[11px] text-slate-500">{alert.detail}</p>
                    )}
                  </td>
                  <td className="px-5 py-3 text-slate-400">
                    {RULE_TYPE_LABEL[alert.ruleType] ?? alert.ruleType}
                  </td>
                  <td className="px-5 py-3 font-mono text-[11px] text-slate-400">
                    {alert.source}
                  </td>
                  <td className="px-5 py-3 text-[11px] tabular-nums text-slate-500">
                    {formatEpoch(alert.detectedAt)}
                  </td>
                  <td className="px-5 py-3">
                    {alert.investigationId ? (
                      <Link
                        href={`/investigations/${encodeURIComponent(alert.investigationId)}`}
                        className="font-mono text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline"
                      >
                        {alert.investigationId}
                      </Link>
                    ) : (
                      <span className="text-[11px] text-slate-600">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
