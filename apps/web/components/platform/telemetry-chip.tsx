import { cn } from "@/lib/utils";

interface TelemetryChipProps {
  label: string;
  value?: string | number;
  unit?: string;
  icon?: React.ReactNode;
  highlight?: boolean;
}

export function TelemetryChip({ label, value, unit, icon, highlight }: TelemetryChipProps) {
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2 text-[11px]",
        highlight
          ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300"
          : "border-surface-borderSubtle bg-ocean-850/60 text-slate-300",
      )}
    >
      <div className="flex items-center gap-2">
        {icon && <span className="flex-shrink-0">{icon}</span>}
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
          {value !== undefined && (
            <p className="mt-0.5 font-mono font-medium text-slate-100">
              {value}
              {unit && <span className="text-[10px] text-slate-400">{unit}</span>}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
