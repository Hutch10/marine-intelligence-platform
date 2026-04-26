"use client";

import React from "react";
import { useTacticalMode } from "@/lib/context/tactical-mode";
import { type TacticalMode } from "@marine/shared";
import { cn } from "@/lib/utils";

export function TacticalModeSwitcher() {
  const { mode, setMode, adminOverride, setAdminOverride } = useTacticalMode();

  const modes: Array<{ id: TacticalMode; label: string }> = [
    { id: "STANDARD", label: "Standard" },
    { id: "VERIFIED-FIRST", label: "Verified-First" },
    { id: "HARDENED", label: "Hardened" },
    { id: "INCIDENT/TACTICAL", label: "Tactical" },
  ];

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-1 rounded-lg bg-ocean-800 p-1 border border-ocean-700">
        {modes.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            className={cn(
              "px-3 py-1 text-[10px] font-semibold rounded-md transition-all uppercase tracking-wider",
              mode === m.id
                ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            {m.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-rose-500/10 border border-rose-500/25">
        <label className="text-[9px] font-bold text-rose-400 uppercase tracking-widest cursor-pointer select-none">
          <input
            type="checkbox"
            checked={adminOverride}
            onChange={(e) => setAdminOverride(e.target.checked)}
            className="mr-2 accent-rose-500"
          />
          Admin Override
        </label>
      </div>
    </div>
  );
}
