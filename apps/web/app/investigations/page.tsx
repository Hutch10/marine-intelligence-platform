import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { listInvestigations } from "@/lib/server/investigations";
import { type InvestigationAnalysisTrack } from "@marine/shared";
import { SystemIntegrityStatus } from "@/lib/integrity-constants";
import { evaluateConfidence } from "@/lib/trust-utils";

export const metadata: Metadata = {
  title: "Investigations",
};

const STATE_STYLES: Record<string, string> = {
  Escalated: "border-rose-500/40 bg-rose-500/10 text-rose-300",
  Correlated: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300",
  Watch: "border-amber-500/40 bg-amber-500/10 text-amber-300",
};

const OUTCOME_LABEL: Record<string, string> = {
  confirmed: "Confirmed",
  false_positive: "False positive",
  inconclusive: "Inconclusive",
};

function StateBadge({ state }: { state: string }) {
  const cls = STATE_STYLES[state] ?? "border-surface-border bg-ocean-850 text-slate-400";
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${cls}`}>
      {state}
    </span>
  );
}

export default async function InvestigationsPage() {
  const investigations = await listInvestigations();
  const effectiveIntegrity = SystemIntegrityStatus.NORMAL;

  return (
    <AppShell
      pageTitle="Investigations"
      pageSubtitle="Active analysis tracks from the marine intelligence database"
    >
      <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 p-6">

        {/* ── Stats bar ── */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Total</p>
            <p className="mt-1 text-2xl font-semibold text-slate-100">{investigations.length}</p>
          </div>
          <div className="rounded-xl border border-rose-500/25 bg-rose-500/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-rose-300">Escalated</p>
            <p className="mt-1 text-2xl font-semibold text-rose-100">
              {investigations.filter((i) => i.state === "Escalated").length}
            </p>
          </div>
          <div className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Correlated</p>
            <p className="mt-1 text-2xl font-semibold text-cyan-100">
              {investigations.filter((i) => i.state === "Correlated").length}
            </p>
          </div>
        </div>

        {/* ── Table ── */}
        {investigations.length === 0 ? (
          <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-8 text-center">
            <p className="text-sm text-slate-300">No investigations found</p>
            <p className="mt-1 text-[11px] text-slate-500">
              The database returned no analysis tracks. Check API connectivity or seed the database.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-surface-border bg-ocean-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-border">
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    ID
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Title
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    State
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Confidence
                  </th>
                  <th className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                    Outcome
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-border">
                {investigations.map((inv: InvestigationAnalysisTrack) => (
                  <tr
                    key={inv.id}
                    className="group transition-colors hover:bg-ocean-850/50"
                  >
                    <td className="px-5 py-3">
                      <Link
                        href={`/investigations/${encodeURIComponent(inv.id)}`}
                        className="font-mono text-[11px] text-cyan-400 hover:text-cyan-300 hover:underline"
                      >
                        {inv.id}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/investigations/${encodeURIComponent(inv.id)}`}
                        className="font-medium text-slate-200 hover:text-cyan-300"
                      >
                        {inv.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3">
                      <StateBadge state={inv.state} />
                    </td>
                    <td className="px-5 py-3 tabular-nums text-slate-400">
                      {(() => {
                        const { value, label } = evaluateConfidence(
                          inv.confidence / 100,
                          undefined, // list view doesn't have local integrity context yet
                          effectiveIntegrity
                        );
                        
                        if (value === null) return <span className="text-rose-500 font-bold">{label}</span>;
                        
                        return (
                          <span>
                            {(value * 100).toFixed(0)}%
                            {label && <span className="ml-1 text-[10px] opacity-70 uppercase">{label}</span>}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-5 py-3 text-slate-500">
                      {inv.outcome ? OUTCOME_LABEL[inv.outcome] ?? inv.outcome : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AppShell>
  );
}
