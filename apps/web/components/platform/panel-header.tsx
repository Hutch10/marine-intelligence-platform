import React from "react";

interface PanelHeaderProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export function PanelHeader({ title, subtitle, action }: PanelHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-surface-borderSubtle pb-3">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        {subtitle && <p className="mt-0.5 text-[11px] text-slate-500">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
