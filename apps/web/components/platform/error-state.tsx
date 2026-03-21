import { AlertTriangle } from "lucide-react";

interface ErrorStateProps {
  title?: string;
  message: string;
  action?: React.ReactNode;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  action,
}: ErrorStateProps) {
  return (
    <div className="rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-6">
      <div className="flex items-start gap-3">
        <AlertTriangle size={18} className="mt-0.5 flex-shrink-0 text-rose-400" />
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-slate-100">{title}</h4>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{message}</p>
          {action && <div className="mt-3">{action}</div>}
        </div>
      </div>
    </div>
  );
}
