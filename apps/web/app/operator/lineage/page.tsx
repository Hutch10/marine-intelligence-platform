import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { recordOperationalAnalytics } from "@/lib/server/record-operational-analytics";

export const metadata: Metadata = {
  title: "Data Lineage",
  robots: { index: false, follow: false },
};

async function fetchLineage(recordId: string) {
  const base = process.env.MARINE_API_BASE_URL?.trim().replace(/\/$/, "") ?? "http://localhost:4000";
  const token = process.env.OPERATOR_ACCESS_TOKEN?.trim();
  const url = new URL(`${base}/internal/lineage/${encodeURIComponent(recordId)}`);
  if (token) {
    url.searchParams.set("token", token);
  }

  const response = await fetch(url.toString(), { cache: "no-store" });
  return response.json();
}

export default async function OperatorLineagePage({
  searchParams,
}: {
  searchParams: { recordId?: string };
}) {
  const recordId = searchParams.recordId?.trim() ?? "";
  const payload = recordId ? await fetchLineage(recordId) : null;

  await recordOperationalAnalytics({ eventType: "operator_usage", dimension: "lineage" });
  await recordOperationalAnalytics({
    eventType: "lineage_open",
    dimension: recordId ? "lookup" : "form_view",
  });

  return (
    <AppShell
      pageTitle="Data Lineage"
      pageSubtitle="Trace observations back to source evidence — operator only"
    >
      <div className="mx-auto flex w-full max-w-[900px] flex-col gap-4 p-6">
        <Link href="/operator" className="text-sm text-cyan-400 hover:text-cyan-300">
          ← Operator Console
        </Link>

        <form className="rounded-xl border border-surface-border bg-ocean-900 p-4" method="get">
          <label className="text-[11px] uppercase tracking-[0.18em] text-slate-500">
            Observation record id
          </label>
          <div className="mt-2 flex gap-2">
            <input
              name="recordId"
              defaultValue={recordId}
              className="flex-1 rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100"
              placeholder="OBS-noaa_ndbc-46042-..."
            />
            <button
              type="submit"
              className="rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm text-cyan-200"
            >
              Trace
            </button>
          </div>
        </form>

        {recordId && payload?.lineage && (
          <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 text-sm text-slate-200">
            <p><span className="text-slate-500">Provenance id:</span> {payload.lineage.provenance_id ?? "—"}</p>
            <p><span className="text-slate-500">Source station:</span> {payload.lineage.source_station_id}</p>
            <p><span className="text-slate-500">Anchor observed at:</span> {payload.lineage.anchor_observed_at}</p>
            <p><span className="text-slate-500">Sea temp observed at:</span> {payload.lineage.sea_temp_observed_at ?? "—"}</p>
            <p><span className="text-slate-500">Wave height observed at:</span> {payload.lineage.wave_height_observed_at ?? "—"}</p>
            <p><span className="text-slate-500">Wind observed at:</span> {payload.lineage.wind_observed_at ?? "—"}</p>
            <p><span className="text-slate-500">Pressure observed at:</span> {payload.lineage.pressure_observed_at ?? "—"}</p>
            <p><span className="text-slate-500">Ingestion at:</span> {payload.lineage.ingestion_observed_at ?? "—"}</p>
            <p><span className="text-slate-500">Metrics concurrent:</span> {payload.lineage.metrics_concurrent ? "yes" : "no"}</p>
            <p><span className="text-slate-500">Freshness:</span> {payload.lineage.freshness_classification}</p>
            <p><span className="text-slate-500">Sync status:</span> {payload.lineage.sync_status ?? "—"}</p>
          </section>
        )}

        {recordId && payload?.source === "unavailable" && (
          <p className="text-sm text-amber-300">Lineage unavailable for record {recordId}.</p>
        )}
      </div>
    </AppShell>
  );
}
