import { cn } from "@/lib/utils";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  subtitle?: string;
  trend?: "up" | "down" | "flat";
  highlight?: boolean;
  children?: React.ReactNode;
}

export function MetricCard({
  title,
  value,
  unit,
  subtitle,
  trend,
  highlight,
  children,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        highlight
          ? "border-cyan-500/25 bg-cyan-500/10"
          : "border-surface-borderSubtle bg-ocean-850/50",
      )}
    >
      <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{title}</p>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-semibold text-slate-100">{value}</span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
        {trend && (
          <span
            className={cn(
              "text-xs font-medium",
              trend === "up"
                ? "text-rose-400"
                : trend === "down"
                  ? "text-emerald-400"
                  : "text-slate-400",
            )}
          >
            {trend === "up" ? "▲" : trend === "down" ? "▼" : "–"}
          </span>
        )}
      </div>
      {subtitle && <p className="mt-1 text-xs text-slate-500">{subtitle}</p>}
      {children && <div className="mt-3">{children}</div>}
    </div>
  );
}
