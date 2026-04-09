"use client";

interface TopBarProps {
  title?: string;
  subtitle?: string;
}

export function TopBar({ title = "Marine Intelligence", subtitle }: TopBarProps) {
  return (
    <header className="flex items-center gap-4 px-5 h-14 bg-ocean-900 border-b border-surface-border shrink-0">
      <div className="flex flex-col justify-center min-w-0 mr-2">
        <h1 className="text-sm font-semibold text-slate-100 truncate leading-none">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      <div className="flex-1" />

      <div className="hidden xl:flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-200">
        <span className="font-medium uppercase tracking-[0.18em]">Truth mode</span>
        <span className="text-amber-100">Only live-backed surfaces are promoted in navigation.</span>
      </div>
    </header>
  );
}
