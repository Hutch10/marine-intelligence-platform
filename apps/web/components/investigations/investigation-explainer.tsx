/**
 * InvestigationExplainer
 *
 * Client component that renders the "Explain Investigation" button and,
 * once triggered, displays a structured explanation panel derived from the
 * ontology-resolved network context.
 *
 * The explanation is built synchronously by explainInvestigation() and cached
 * in local state — no network requests, no external dependencies.
 */

"use client";

import { useState } from "react";
import {
  Activity,
  AlertCircle,
  BookOpen,
  ChevronDown,
  ChevronUp,
  Fish,
  MapPin,
} from "lucide-react";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import type { InvestigationOntologyNetworkContext } from "@/lib/api/types";
import {
  explainInvestigation,
  type ExplainedEntity,
  type InvestigationDriver,
  type InvestigationExplanation,
} from "@/lib/ontology/explainer";

interface InvestigationExplainerProps {
  network: InvestigationOntologyNetworkContext;
}

// ─── Style maps ───────────────────────────────────────────────────────────────

const DRIVER_WEIGHT_STYLES: Record<InvestigationDriver["weight"], string> = {
  primary: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  secondary: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  background: "border-slate-700/50 bg-ocean-850 text-slate-400",
};

const STATE_STYLES: Record<string, string> = {
  Escalated: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  Correlated: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  Watch: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  Unknown: "border-slate-700/50 bg-ocean-850 text-slate-500",
};

const ENTITY_ICONS: Record<ExplainedEntity["type"], React.ElementType> = {
  Species: Fish,
  Station: MapPin,
  MarineAlert: AlertCircle,
};

const ENTITY_ICON_COLORS: Record<ExplainedEntity["type"], string> = {
  Species: "text-emerald-400",
  Station: "text-cyan-400",
  MarineAlert: "text-rose-400",
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{children}</p>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] text-slate-600">{children}</p>;
}

function DriverCard({ driver }: { driver: InvestigationDriver }) {
  return (
    <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 space-y-1">
      <div className="flex items-center gap-2">
        <StatusBadge label={driver.weight} className={DRIVER_WEIGHT_STYLES[driver.weight]} />
        <span className="text-xs font-medium text-slate-200">{driver.label}</span>
      </div>
      <p className="text-[11px] leading-relaxed text-slate-500">{driver.detail}</p>
    </div>
  );
}

function EntityCard({ entity }: { entity: ExplainedEntity }) {
  const Icon = ENTITY_ICONS[entity.type];
  return (
    <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 space-y-1.5">
      <div className="flex items-center gap-2">
        <Icon size={12} className={`shrink-0 ${ENTITY_ICON_COLORS[entity.type]}`} />
        <span className="text-[10px] uppercase tracking-wider text-slate-500">{entity.type}</span>
      </div>
      <p className="text-xs font-medium text-slate-100">{entity.label}</p>
      <p className="text-[11px] leading-relaxed text-slate-500">{entity.detail}</p>
    </div>
  );
}

function ExplanationPanel({ explanation }: { explanation: InvestigationExplanation }) {
  const stateStyle = STATE_STYLES[explanation.state] ?? STATE_STYLES.Unknown;

  return (
    <Panel
      title="Investigation Explanation"
      subtitle="Structured explanation derived from ontology-resolved network data."
      action={
        <StatusBadge
          label={`${explanation.state} · ${explanation.confidence}%`}
          className={stateStyle}
        />
      }
    >
      <div className="space-y-6">

        {/* Summary */}
        <div className="space-y-1.5">
          <SectionLabel>Summary</SectionLabel>
          <p className="text-sm leading-relaxed text-slate-300">{explanation.summary}</p>
        </div>

        {/* Likely Drivers */}
        <div className="space-y-2">
          <SectionLabel>Likely Drivers</SectionLabel>
          {explanation.likelyDrivers.length === 0 ? (
            <EmptyNote>No drivers identified from the resolved network.</EmptyNote>
          ) : (
            <div className="space-y-2">
              {explanation.likelyDrivers.map((driver, i) => (
                <DriverCard key={i} driver={driver} />
              ))}
            </div>
          )}
        </div>

        {/* Key Related Entities */}
        <div className="space-y-2">
          <SectionLabel>Key Related Entities</SectionLabel>
          {explanation.keyEntities.length === 0 ? (
            <EmptyNote>No entities in scope for this investigation.</EmptyNote>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {explanation.keyEntities.map((entity, i) => (
                <EntityCard key={i} entity={entity} />
              ))}
            </div>
          )}
        </div>

        {/* Anomaly Notes */}
        {explanation.anomalyNotes.length > 0 && (
          <div className="space-y-2">
            <SectionLabel>Anomaly Notes</SectionLabel>
            <div className="rounded-xl border border-surface-borderSubtle bg-ocean-900/60 px-4 py-3 space-y-1.5">
              {explanation.anomalyNotes.map((note, i) => (
                <div key={i} className="flex items-start gap-2">
                  <Activity size={11} className="mt-0.5 shrink-0 text-violet-400" />
                  <p className="font-mono text-[11px] text-slate-400">{note}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Attribution footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-borderSubtle pt-3 text-[10px] text-slate-600">
          <span>
            {explanation.keyEntities.length} entities · {explanation.likelyDrivers.length} drivers
            {explanation.anomalyNotes.length > 0
              ? ` · ${explanation.anomalyNotes.length} anomaly notes`
              : ""}
          </span>
          <span className="font-mono">{explanation.generatedAt}</span>
        </div>

      </div>
    </Panel>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function InvestigationExplainer({ network }: InvestigationExplainerProps) {
  const [explanation, setExplanation] = useState<InvestigationExplanation | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  function handleToggle() {
    if (!explanation) {
      setExplanation(explainInvestigation(network));
    }
    setIsOpen((prev) => !prev);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={handleToggle}
          className="flex items-center gap-2 rounded-full border border-violet-500/25 bg-violet-500/10 px-4 py-2 text-[12px] font-medium text-violet-300 transition-colors hover:bg-violet-500/20"
        >
          <BookOpen size={13} />
          Explain Investigation
          {isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
        </button>
      </div>

      {isOpen && explanation && <ExplanationPanel explanation={explanation} />}
    </div>
  );
}
