import { cn } from "@/lib/utils";

export type StatusVariant = 
  | "normal" 
  | "monitoring" 
  | "elevated" 
  | "critical" 
  | "offline" 
  | "mock" 
  | "db";

interface StatusChipProps {
  label: string;
  variant?: StatusVariant;
  size?: "sm" | "md";
}

const variantStyles: Record<StatusVariant, string> = {
  normal: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  monitoring: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  elevated: "border-rose-500/25 bg-rose-500/10 text-rose-300",
  critical: "border-red-600/25 bg-red-600/10 text-red-300",
  offline: "border-slate-500/25 bg-slate-500/10 text-slate-300",
  mock: "border-violet-500/25 bg-violet-500/10 text-violet-300",
  db: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
};

const sizeStyles = {
  sm: "px-2 py-1 text-[10px]",
  md: "px-3 py-1.5 text-[11px]",
};

export function StatusChip({ label, variant = "normal", size = "md" }: StatusChipProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border font-medium uppercase tracking-[0.08em]",
        variantStyles[variant],
        sizeStyles[size],
      )}
    >
      {label}
    </span>
  );
}
