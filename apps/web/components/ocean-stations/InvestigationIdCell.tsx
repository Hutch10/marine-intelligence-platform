"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api/client";

interface InvestigationIdCellProps {
  investigationId?: string | null;
  label?: string;
  className?: string;
}

export function InvestigationIdCell({ investigationId, label, className }: InvestigationIdCellProps) {
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

  if (!investigationId) return <span className={className ?? "text-slate-600"}>—</span>;
  if (exists === null) return <span className={className ?? "text-slate-400"}>…</span>;
  if (exists)
    return (
      <Link href={`/investigations/${investigationId}`} className={className ?? "text-cyan-400 underline hover:text-cyan-300"}>
        {label || investigationId}
      </Link>
    );
  return <span className={className ?? "text-slate-600"}>—</span>;
}
