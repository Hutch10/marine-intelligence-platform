"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  SearchCode,
  Map,
  BarChart3,
  BrainCircuit,
  Fish,
  BookOpen,
  FlaskConical,
  ClipboardList,
  Users,
  Settings,
  Radar,
  ChevronLeft,
  ChevronRight,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Nav item spec
// ---------------------------------------------------------------------------

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
  implemented?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",       href: "/",                icon: LayoutDashboard, implemented: true },
  { label: "Investigations",  href: "/investigations",  icon: SearchCode, implemented: true },
  { label: "Ocean Map",       href: "/ocean-map",       icon: Map, implemented: true },
  { label: "Ocean Stations",  href: "/ocean-stations",  icon: Radar, implemented: true },
  { label: "Data Explorer",   href: "/data-explorer",   icon: BarChart3, implemented: true },
  { label: "AI Research Lab", href: "/ai-lab",          icon: BrainCircuit, implemented: true },
  { label: "Species Database",href: "/species-database",icon: Fish, implemented: true },
  { label: "Research Library",href: "/research-library",icon: BookOpen },
  { label: "Simulations",     href: "/simulations",     icon: FlaskConical },
  { label: "Field Reports",   href: "/field-reports",   icon: ClipboardList },
  { label: "Collaboration",   href: "/collaboration",   icon: Users, badge: 3 },
  { label: "Settings",        href: "/settings",        icon: Settings },
];

// ---------------------------------------------------------------------------
// Sidebar
// ---------------------------------------------------------------------------

export function Sidebar() {
  const pathname = usePathname();
  const currentPath = pathname ?? "/";
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "relative flex flex-col h-full bg-ocean-900 border-r border-surface-border",
        "transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* ── Logo ── */}
      <div
        className={cn(
          "flex items-center gap-3 px-4 h-14 border-b border-surface-border shrink-0",
          collapsed && "justify-center px-0"
        )}
      >
        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/20 border border-cyan-500/40 shrink-0">
          <Waves className="text-cyan-400" size={18} />
        </div>
        {!collapsed && (
          <div className="overflow-hidden">
            <p className="text-xs font-semibold text-cyan-400 tracking-widest uppercase leading-none">
              Marine Bio
            </p>
            <p className="text-[10px] text-slate-500 tracking-wider uppercase mt-0.5">
              Ocean Intelligence
            </p>
          </div>
        )}
      </div>

      {/* ── Nav links ── */}
      <nav className="flex-1 overflow-y-auto py-3 space-y-0.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.implemented &&
            (item.href === "/" ? currentPath === "/" : currentPath.startsWith(item.href));

          const itemClasses = cn(
            "group relative flex items-center gap-3 px-4 py-2.5 mx-2 rounded-lg",
            "text-sm font-medium transition-all duration-150",
            isActive
              ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
              : item.implemented
                ? "text-slate-400 hover:text-slate-200 hover:bg-ocean-800"
                : "cursor-default text-slate-600",
            collapsed && "justify-center px-0 mx-2"
          );

          const content = (
            <>
              {isActive && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-cyan-400 rounded-r-full" />
              )}

              <item.icon
                size={18}
                className={cn(
                  "shrink-0 transition-colors",
                  isActive
                    ? "text-cyan-400"
                    : item.implemented
                      ? "text-slate-500 group-hover:text-slate-300"
                      : "text-slate-600"
                )}
              />

              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.implemented ? (
                    item.badge !== undefined && (
                      <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-cyan-500/20 text-cyan-300 text-[10px] font-semibold border border-cyan-500/30">
                        {item.badge}
                      </span>
                    )
                  ) : (
                    <span className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-2 py-1 text-[10px] font-medium text-slate-500">
                      Coming soon
                    </span>
                  )}
                </>
              )}

              {collapsed && (
                <span className="pointer-events-none absolute left-full ml-3 z-50 whitespace-nowrap rounded-md bg-ocean-800 border border-surface-border px-2 py-1 text-xs text-slate-200 opacity-0 group-hover:opacity-100 transition-opacity shadow-xl">
                  {item.label}
                  {!item.implemented && <span className="ml-1.5 text-slate-500">(Coming soon)</span>}
                  {item.implemented && item.badge !== undefined && (
                    <span className="ml-1.5 text-cyan-400">({item.badge})</span>
                  )}
                </span>
              )}
            </>
          );

          return item.implemented ? (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              className={itemClasses}
            >
              {content}
            </Link>
          ) : (
            <div key={item.href} aria-disabled="true" className={itemClasses}>
              {content}
            </div>
          );
        })}
      </nav>

      {/* ── Collapse toggle ── */}
      <div className="shrink-0 p-3 border-t border-surface-border">
        <button
          onClick={() => setCollapsed((v) => !v)}
          className={cn(
            "w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-slate-500",
            "hover:text-slate-300 hover:bg-ocean-800 transition-colors",
            collapsed && "justify-center px-0"
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight size={16} />
          ) : (
            <>
              <ChevronLeft size={16} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
