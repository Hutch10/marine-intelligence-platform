"use client";

import { useMemo, useState } from "react";
import { Check, Copy, ExternalLink, Printer, QrCode } from "lucide-react";
import { cn } from "@/lib/utils";

interface OceanStationShareToolsProps {
  stationName: string;
  stationSlug: string;
  accentColor?: "cyan" | "emerald" | "amber" | "violet" | "rose";
  className?: string;
}

const ACCENT_STYLES = {
  cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  violet: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  rose: "border-rose-500/25 bg-rose-500/10 text-rose-300",
} as const;

function toAbsolute(path: string): string {
  if (typeof window === "undefined") {
    return path;
  }

  return `${window.location.origin}${path}`;
}

export function OceanStationShareTools({
  stationName,
  stationSlug,
  accentColor = "cyan",
  className,
}: OceanStationShareToolsProps) {
  const [copiedField, setCopiedField] = useState<"public" | "exhibit" | null>(null);

  const publicPath = `/station/${stationSlug}`;
  const exhibitPath = `/ocean-stations/${stationSlug}/exhibit`;

  const publicUrl = useMemo(() => toAbsolute(publicPath), [publicPath]);
  const exhibitUrl = useMemo(() => toAbsolute(exhibitPath), [exhibitPath]);

  async function copyValue(kind: "public" | "exhibit", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(kind);
      window.setTimeout(() => setCopiedField(null), 1600);
    } catch {
      setCopiedField(null);
    }
  }

  function printShareCard() {
    if (typeof window !== "undefined") {
      window.print();
    }
  }

  return (
    <section className={cn("rounded-xl border border-surface-borderSubtle bg-ocean-900/80 p-4", className)}>
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-sm font-semibold text-slate-100">Share and QR</h4>
        <span className={cn("rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.14em]", ACCENT_STYLES[accentColor])}>
          <QrCode size={10} className="mr-1 inline" />
          QR Ready
        </span>
      </div>

      <div className="mt-3 space-y-2">
        <div className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Public Link</p>
          <p className="mt-1 truncate font-mono text-xs text-slate-300">{publicUrl}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => copyValue("public", publicUrl)}
              className="inline-flex items-center gap-1 rounded-md border border-surface-borderSubtle bg-ocean-900 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300"
            >
              {copiedField === "public" ? <Check size={12} /> : <Copy size={12} />}
              {copiedField === "public" ? "Copied" : "Copy"}
            </button>
            <a
              href={publicPath}
              className="inline-flex items-center gap-1 rounded-md border border-surface-borderSubtle bg-ocean-900 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300"
            >
              Open
              <ExternalLink size={12} />
            </a>
          </div>
        </div>

        <div className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Exhibit Link</p>
          <p className="mt-1 truncate font-mono text-xs text-slate-300">{exhibitUrl}</p>
          <button
            type="button"
            onClick={() => copyValue("exhibit", exhibitUrl)}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-surface-borderSubtle bg-ocean-900 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300"
          >
            {copiedField === "exhibit" ? <Check size={12} /> : <Copy size={12} />}
            {copiedField === "exhibit" ? "Copied" : "Copy"}
          </button>
        </div>

        <div className="rounded-lg border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-2.5">
          <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Printable Share Card</p>
          <p className="mt-1 text-xs text-slate-400">{stationName} public QR destination and exhibit URL are ready for kiosk handouts.</p>
          <button
            type="button"
            onClick={printShareCard}
            className="mt-2 inline-flex items-center gap-1 rounded-md border border-surface-borderSubtle bg-ocean-900 px-2.5 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300"
          >
            <Printer size={12} />
            Print Card
          </button>
        </div>
      </div>
    </section>
  );
}
