import { cn } from "@/lib/utils";

interface PanelProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
}

export function Panel({
  title,
  subtitle,
  action,
  children,
  className,
  contentClassName,
}: PanelProps) {
  return (
    <section className={cn("rounded-xl border border-surface-border bg-ocean-900/95", className)}>
      <div className="flex items-center justify-between gap-4 border-b border-surface-borderSubtle px-5 py-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">{title}</h2>
          {subtitle && <p className="mt-1 text-[11px] text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className={cn("p-5", contentClassName)}>{children}</div>
    </section>
  );
}
