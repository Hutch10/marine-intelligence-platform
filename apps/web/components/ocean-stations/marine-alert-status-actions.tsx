"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MarineWorkflowAlertStatus } from "@/lib/api/types";

interface MarineAlertStatusActionsProps {
  alertId: string;
  status: MarineWorkflowAlertStatus;
}

export function MarineAlertStatusActions({
  alertId,
  status,
}: MarineAlertStatusActionsProps) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState(status);
  const [pendingAction, setPendingAction] = useState<"acknowledge" | "resolve" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function postAction(action: "acknowledge" | "resolve") {
    setPendingAction(action);
    setError(null);

    try {
      const response = await fetch(`/api/marine-intelligence/alerts/${alertId}/${action}`, {
        method: "POST",
      });
      const data = (await response.json()) as {
        alert?: { status: MarineWorkflowAlertStatus };
        message?: string;
      };

      if (response.ok && data.alert?.status) {
        setCurrentStatus(data.alert.status);
        router.refresh();
        return;
      }

      setError(data.message ?? `Failed to ${action} alert`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPendingAction(null);
    }
  }

  if (currentStatus === "resolved") {
    return <p className="text-[10px] text-emerald-400">Resolved</p>;
  }

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-2">
        {currentStatus === "active" ? (
          <button
            type="button"
            disabled={pendingAction !== null}
            onClick={() => postAction("acknowledge")}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingAction === "acknowledge" ? "Acknowledging…" : "Acknowledge"}
          </button>
        ) : null}
        <button
          type="button"
          disabled={pendingAction !== null}
          onClick={() => postAction("resolve")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-[10px] font-medium text-emerald-300 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pendingAction === "resolve" ? "Resolving…" : "Resolve"}
        </button>
      </div>
      {error ? <p className="text-[10px] text-rose-400">{error}</p> : null}
    </div>
  );
}