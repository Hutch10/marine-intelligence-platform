"use client";

import { useState } from "react";
import {
  Search,
  Bell,
  Satellite,
  Activity,
  ChevronDown,
  User,
  Zap,
  Radio,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StatusIndicator {
  label: string;
  status: "online" | "warning" | "offline";
  value?: string;
}

// ---------------------------------------------------------------------------
// Static data — real integrations would come from a context/store
// ---------------------------------------------------------------------------

const SYSTEM_STATUS: StatusIndicator[] = [
  { label: "Data Feed",   status: "online",  value: "Live" },
  { label: "GPS Array",   status: "online",  value: "32 buoys" },
  { label: "AI Engine",   status: "online",  value: "Ready" },
  { label: "Sensor Net",  status: "warning", value: "3 offline" },
];

const STATUS_DOT: Record<StatusIndicator["status"], string> = {
  online:  "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]",
  warning: "bg-amber-400  shadow-[0_0_6px_rgba(251,191,36,0.7)]",
  offline: "bg-red-500    shadow-[0_0_6px_rgba(239,68,68,0.7)]",
};

// ---------------------------------------------------------------------------
// TopBar
// ---------------------------------------------------------------------------

interface TopBarProps {
  /** Page title shown in the command bar */
  title?: string;
  /** Optional subtitle / breadcrumb */
  subtitle?: string;
}

export function TopBar({ title = "Ocean Intelligence Platform", subtitle }: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);

  return (
    <header className="flex items-center gap-4 px-5 h-14 bg-ocean-900 border-b border-surface-border shrink-0">

      {/* ── Page title ── */}
      <div className="flex flex-col justify-center min-w-0 mr-2">
        <h1 className="text-sm font-semibold text-slate-100 truncate leading-none">
          {title}
        </h1>
        {subtitle && (
          <p className="text-[10px] text-slate-500 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>

      {/* ── Search ── */}
      <div className="relative flex-1 max-w-md">
        <Search
          size={14}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Search species, datasets, reports…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className={cn(
            "w-full pl-8 pr-4 py-1.5 rounded-lg text-xs",
            "bg-ocean-800 border border-surface-borderSubtle",
            "text-slate-300 placeholder:text-slate-600",
            "focus:outline-none focus:border-cyan-500/50 focus:ring-1 focus:ring-cyan-500/20",
            "transition-colors"
          )}
        />
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-slate-600 font-mono">
          ⌘K
        </kbd>
      </div>

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── System status chips ── */}
      <div className="hidden xl:flex items-center gap-3">
        {SYSTEM_STATUS.map((s) => (
          <div
            key={s.label}
            className="flex items-center gap-1.5 text-[10px] text-slate-400"
          >
            <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", STATUS_DOT[s.status])} />
            <span className="text-slate-500">{s.label}</span>
            {s.value && <span className="text-slate-300">{s.value}</span>}
          </div>
        ))}
      </div>

      {/* ── Divider ── */}
      <div className="hidden xl:block w-px h-5 bg-surface-border" />

      {/* ── Live data badge ── */}
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20">
        <Radio size={11} className="text-cyan-400 animate-pulse" />
        <span className="text-[10px] font-medium text-cyan-400">LIVE</span>
      </div>

      {/* ── AI engine indicator ── */}
      <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-colors">
        <Zap size={11} className="text-violet-400" />
        <span className="text-[10px] font-medium text-violet-400">AI Active</span>
      </button>

      {/* ── Notifications ── */}
      <div className="relative">
        <button
          onClick={() => setNotifOpen((v) => !v)}
          className="relative p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-ocean-800 transition-colors"
          aria-label="Notifications"
        >
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </button>

        {notifOpen && (
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl bg-ocean-850 border border-surface-border shadow-2xl z-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-surface-borderSubtle">
              <span className="text-xs font-semibold text-slate-200">Notifications</span>
              <span className="text-[10px] text-cyan-400 cursor-pointer hover:underline">
                Mark all read
              </span>
            </div>
            <div className="divide-y divide-surface-borderSubtle max-h-72 overflow-y-auto">
              {[
                { icon: Satellite, text: "New data from Pacific buoy array", time: "2 min" },
                { icon: Activity, text: "Anomaly detected: temperature spike at 40°N", time: "18 min" },
                { icon: Zap,      text: "AI model training complete", time: "1 hr" },
              ].map(({ icon: Icon, text, time }) => (
                <div
                  key={text}
                  className="flex items-start gap-3 px-4 py-3 hover:bg-ocean-800 cursor-pointer transition-colors"
                >
                  <Icon size={14} className="text-cyan-500 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-300 leading-snug">{text}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{time} ago</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── User avatar ── */}
      <button className="flex items-center gap-2 pl-2 pr-1 py-1 rounded-lg hover:bg-ocean-800 transition-colors group">
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center shrink-0">
          <User size={13} className="text-white" />
        </div>
        <div className="hidden md:block text-left">
          <p className="text-xs font-medium text-slate-200 leading-none">Dr. M. Clarke</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Lead Researcher</p>
        </div>
        <ChevronDown size={12} className="text-slate-500 group-hover:text-slate-300 transition-colors" />
      </button>
    </header>
  );
}
