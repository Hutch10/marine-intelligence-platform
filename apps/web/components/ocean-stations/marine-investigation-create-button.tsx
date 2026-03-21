"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface MarineInvestigationCreateButtonProps {
  eventId: string;
  title: string;
}

export function MarineInvestigationCreateButton({
  eventId,
  title,
}: MarineInvestigationCreateButtonProps) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function handleCreate() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/marine-intelligence/investigations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventId, title }),
      });

      const data = (await response.json()) as {
        ok?: true;
        investigation?: { id: string };
        message?: string;
      };

      if (response.ok && data.ok && data.investigation) {
        setDone(true);
        router.refresh();
        return;
      }

      setError(data.message ?? "Failed to create investigation");
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return <p className="text-[10px] text-emerald-400">Investigation opened</p>;
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={pending}
        onClick={handleCreate}
        className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[10px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Opening…" : "Open Investigation"}
      </button>
      {error ? <p className="text-[10px] text-rose-400">{error}</p> : null}
    </div>
  );
}