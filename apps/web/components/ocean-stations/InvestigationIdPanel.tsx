"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";

interface InvestigationIdPanelProps {
  investigationId?: string | null;
}

export function InvestigationIdPanel({ investigationId }: InvestigationIdPanelProps) {
  const [exists, setExists] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    if (!investigationId) {
      setExists(null);
      return;
    }
    apiClient.marineIntelligence.getInvestigations({})
      .then((list) => {
        if (!mounted) return;
        setExists(Array.isArray(list) && list.some((inv) => inv.id === investigationId));
      })
      .catch(() => {
        if (mounted) setExists(false);
      });
    return () => { mounted = false; };
  }, [investigationId]);

  if (!investigationId) return null;
  if (exists === null) return null;
  if (exists)
    return (
      <div className="pt-3 border-t border-slate-700/50">
        <p className="text-xs text-slate-400 font-medium mb-2">Linked Investigation</p>
        <Link href={`/investigations/${investigationId}`} className="text-xs text-cyan-400 underline hover:text-cyan-300">
          {investigationId}
        </Link>
      </div>
    );
  return null;
}
