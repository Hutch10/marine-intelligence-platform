import { cn } from "@/lib/utils";
import { IntegrityStatus } from "@marine/shared";

interface StatusBadgeProps {
  label: string;
  className?: string;
}

const INTEGRITY_STYLES: Record<string, string> = {
  [IntegrityStatus.VERIFIED]: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  [IntegrityStatus.SOVEREIGN_VERIFIED]: "border-cyan-500/40 bg-cyan-500/15 text-cyan-200 shadow-[0_0_8px_rgba(6,182,212,0.2)]",
  [IntegrityStatus.SOVEREIGN_CONTRADICTED]: "border-rose-500/50 bg-rose-500/20 text-rose-100 animate-pulse",
  [IntegrityStatus.REJECTED]: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  [IntegrityStatus.UNVERIFIED]: "border-slate-500/30 bg-slate-500/10 text-slate-400",
};

export function StatusBadge({ label, className }: StatusBadgeProps) {
  const normalizedLabel = label.toUpperCase();
  const integrityStyle = INTEGRITY_STYLES[normalizedLabel];

  return (
    <span 
      className={cn(
        "rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider uppercase transition-all", 
        integrityStyle || className
      )}
    >
      {normalizedLabel.replace(/_/g, " ")}
    </span>
  );
}
