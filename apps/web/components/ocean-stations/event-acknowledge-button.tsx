"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface EventAcknowledgeButtonProps {
  stationId: string;
  eventId: string;
  actorId: string;
}

export function EventAcknowledgeButton({ stationId, eventId, actorId }: EventAcknowledgeButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleAcknowledge() {
    setPending(true);
    setError(null);

    try {
      const res = await fetch(`/api/stations/${stationId}/events/${eventId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorId }),
      });

      const data = (await res.json()) as { ok?: true; message?: string };

      if (res.ok && data.ok) {
        setDone(true);
        router.refresh();
      } else {
        setError(data.message ?? "Failed to acknowledge event");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return <p className="text-[10px] text-emerald-400">Acknowledged</p>;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleAcknowledge}
        className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[10px] font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Acknowledging…" : "Acknowledge"}
      </button>
      {error ? <p className="text-[10px] text-rose-400">{error}</p> : null}
    </div>
  );
}
