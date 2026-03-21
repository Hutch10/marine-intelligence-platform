import { AlertCircle } from "lucide-react";

interface EmptyStateProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
}

export function EmptyState({ title, subtitle, icon, action }: EmptyStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/40 p-6 text-center">
      <div className="flex justify-center">
        {icon ? (
          <div className="text-cyan-400">{icon}</div>
        ) : (
          <AlertCircle size={28} className="text-slate-500" />
        )}
      </div>
      <h4 className="mt-3 text-sm font-medium text-slate-100">{title}</h4>
      {subtitle && <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{subtitle}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
