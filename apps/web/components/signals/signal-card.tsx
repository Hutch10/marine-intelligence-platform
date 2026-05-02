import Link from "next/link";
import { AlertTriangle, Radar, Waves } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";
import { CreateInvestigationAction } from "@/components/investigations/create-investigation-action";
import { cn } from "@/lib/utils";
import type { SignalDetection } from "@/lib/api/types";

interface SignalCardProps {
  signal: SignalDetection;
  detailHref?: string | null;
}

const SEVERITY_STYLES = {
  low: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  medium: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  high: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-300",
} as const;

const STATUS_STYLES = {
  open: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  monitoring: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  promoted: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  dismissed: "border-slate-500/25 bg-slate-500/10 text-slate-300",
} as const;

const TYPE_ICONS = {
  thermal_anomaly: AlertTriangle,
  oxygen_depletion: Waves,
  migration_anomaly: Radar,
  chlorophyll_bloom: Waves,
  current_shear: Radar,
  station_health: AlertTriangle,
} as const;

function formatDetectedAt(value: string): string {
  const ts = Date.parse(value);

  if (!Number.isFinite(ts)) {
    return "Unknown";
  }

  return `${new Date(ts).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function formatSourceLabel(sourceType: string): string {
  switch (sourceType) {
    case "risk_engine":
      return "Fusion-derived risk engine";
    case "public_anomaly_feed":
      return "Public anomaly feed";
    default:
      return sourceType.replace(/_/g, " ");
  }
}

export function SignalCard({ signal, detailHref }: SignalCardProps) {
  const Icon = TYPE_ICONS[signal.signalType] ?? AlertTriangle;
  const title = detailHref ? (
    <Link href={detailHref} className="transition-colors hover:text-cyan-300">
      {signal.title}
    </Link>
  ) : (
    signal.title
  );

  return (
    <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Icon size={14} className="text-cyan-400" />
            <p className="font-mono text-[10px] text-slate-500">{signal.id}</p>
          </div>
          <h3 className="mt-2 text-sm font-medium text-slate-100">{title}</h3>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">{signal.summary}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <StatusBadge
            label={signal.severity.toUpperCase()}
            className={SEVERITY_STYLES[signal.severity]}
          />
          <StatusBadge
            label={signal.status}
            className={cn("capitalize", STATUS_STYLES[signal.status])}
          />
          {signal.sovereignStatus && (
            <StatusBadge
              label={signal.sovereignStatus}
              className="mt-1"
            />
          )}
        </div>
      </div>

      <div className="mt-4 grid gap-2 text-[11px] text-slate-500 sm:grid-cols-2 xl:grid-cols-3">
        <div>
          <p className="uppercase tracking-[0.2em] text-[10px] text-slate-600">Source</p>
          <p className="mt-1 text-slate-300">{formatSourceLabel(signal.sourceType)}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.2em] text-[10px] text-slate-600">Region</p>
          <p className="mt-1 text-slate-300">{signal.region}</p>
        </div>
        <div>
          <p className="uppercase tracking-[0.2em] text-[10px] text-slate-600">Detected</p>
          <p className="mt-1 font-mono text-slate-300">{formatDetectedAt(signal.detectedAt)}</p>
        </div>
      </div>

      {detailHref ? (
        <div className="mt-3">
          <Link
            href={detailHref}
            className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] text-cyan-300 hover:bg-cyan-500/20"
          >
            Open risk detail
          </Link>
        </div>
      ) : null}

      <CreateInvestigationAction
        prefill={{
          eventId: signal.sourceId ?? null,
          title: signal.title,
          sourceType: "signal",
          region: signal.region ?? null,
          detectedAt: signal.detectedAt,
          stationId: signal.stationId,
          relatedStations: signal.stationId ? [signal.stationId] : [],
        }}
      />
    </article>
  );
}
