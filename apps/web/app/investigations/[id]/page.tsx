import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getInvestigationById } from "@/lib/server/investigations";
import { InvestigationOutcomeEditor } from "@/components/ui/InvestigationOutcomeEditor";
import { recordOperationalAnalytics } from "@/lib/server/record-operational-analytics";


interface InvestigationDetailPageProps {
  params: { id: string };
}

function formatSourceType(value: "signal" | "anomaly" | null | undefined): string {
  if (!value) {
    return "Not provided";
  }

  return value === "signal" ? "Signal" : "Anomaly";
}

function formatDetectedAt(value: string | null | undefined): string {
  if (!value) {
    return "Not provided";
  }

  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return value;
  }

  return `${new Date(parsed).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

export default async function InvestigationDetailPage({ params }: InvestigationDetailPageProps) {

  const investigation = await getInvestigationById(params.id);
  if (!investigation) {
    notFound();
  }

  await recordOperationalAnalytics({ eventType: "investigation_open" });

  // Use real signals and lastUpdated from the investigation object
  const signals = investigation.signals ?? [];
  const lastUpdated = investigation.lastUpdated ?? null;
  // Collect unique data sources from signals
  const dataSources = Array.from(new Set(signals.map((s) => s.source))).filter(Boolean);

  return (
    <AppShell pageTitle={investigation.title}>
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-2xl font-bold mb-2">{investigation.title}</h1>
        <div className="mb-4 text-sm text-slate-400">ID: {investigation.id}</div>

        {/* --- Investigation Narrative --- */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">What is happening</h2>
          <div className="text-slate-200 whitespace-pre-line">
            {investigation.summary || "No summary available."}
          </div>
        </section>
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Why it matters</h2>
          <div className="text-slate-200">
            This event has a confidence score of {investigation.confidence}. Environmental or operational impact is based on real signal data.
          </div>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Original Source Metadata</h2>
          <dl className="grid gap-2 text-sm text-slate-300 sm:grid-cols-2">
            <div>
              <dt className="text-slate-500">Source type</dt>
              <dd>{formatSourceType(investigation.sourceType ?? null)}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Related station</dt>
              <dd>{investigation.stationId ?? "Not provided"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Region</dt>
              <dd>{investigation.region ?? "Not provided"}</dd>
            </div>
            <div>
              <dt className="text-slate-500">Detected</dt>
              <dd>{formatDetectedAt(investigation.detectedAt ?? null)}</dd>
            </div>
          </dl>
        </section>

        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">What signals contributed</h2>
          {signals.length > 0 ? (
            <ul className="list-disc pl-5">
              {signals.map((signal, idx) => (
                <li key={idx} className="mb-1">
                  <span className="font-semibold">{signal.type}</span>
                  {typeof signal.confidence === "number" && (
                    <> (confidence: {signal.confidence})</>
                  )}
                  {signal.stationId && (
                    <> — Station <span className="font-semibold">{signal.stationId}</span></>
                  )}
                  {signal.timestamp && (
                    <> @ {new Date(signal.timestamp).toLocaleString()}</>
                  )}
                  {signal.source && (
                    <> — Source: {signal.source}</>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-slate-400">No contributing signals listed.</div>
          )}
        </section>

        {/* --- Signal Traceability --- */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Signal Traceability</h2>
          {signals.length > 0 ? (
            <ul className="list-disc pl-5">
              {signals.map((signal, idx) => (
                <li key={idx} className="mb-1">
                  Signal <span className="font-semibold">{signal.type}</span>
                  {signal.stationId && (
                    <> from Station <span className="font-semibold">{signal.stationId}</span></>
                  )}
                  {signal.timestamp && (
                    <> at {new Date(signal.timestamp).toLocaleString()}</>
                  )}
                  {signal.source && (
                    <> — Source: {signal.source}</>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-slate-400">No traceable signals for this investigation.</div>
          )}
        </section>

        {/* --- Data Transparency --- */}
        <section className="mb-6">
          <h2 className="text-lg font-semibold mb-2">Data Transparency</h2>
          <div className="mb-2">
            <span className="font-semibold">Last updated:</span> {lastUpdated ? new Date(lastUpdated).toLocaleString() : "Unknown"}
          </div>
          <div>
            <span className="font-semibold">Data sources:</span> {dataSources.length > 0 ? dataSources.join(", ") : "Unknown"}
          </div>
        </section>

        {/* --- Outcome Editor --- */}
        <InvestigationOutcomeEditor investigationId={investigation.id} initialOutcome={investigation.outcome ?? null} />
      </div>
    </AppShell>
  );
}
