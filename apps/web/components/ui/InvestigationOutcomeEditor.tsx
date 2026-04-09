"use client";
import { useState } from "react";

const OUTCOME_OPTIONS = [
  { value: "confirmed", label: "Confirmed" },
  { value: "false_positive", label: "False Positive" },
  { value: "inconclusive", label: "Inconclusive" },
];

export function InvestigationOutcomeEditor({
  investigationId,
  initialOutcome,
}: {
  investigationId: string;
  initialOutcome: "confirmed" | "false_positive" | "inconclusive" | null;
}) {
  const [outcome, setOutcome] = useState(initialOutcome);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const newOutcome = e.target.value === "" ? null : e.target.value;
    setSaving(true);
    setError(null);
    setSuccess(false);
    try {
      const res = await fetch(`/api/investigations/${encodeURIComponent(investigationId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome: newOutcome }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.message || "Failed to update outcome");
      }
      setOutcome(newOutcome as "confirmed" | "false_positive" | "inconclusive" | null);
      setSuccess(true);
    } catch (err) {
      const error = err as Error | { message?: string };
      const msg = (typeof error === 'object' && error && 'message' in error && error.message) ? error.message : "Failed to update outcome";
      setError(msg ?? "Failed to update outcome");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-4">
      <label className="font-semibold block mb-1" htmlFor="outcome-select">
        Investigation Outcome
      </label>
      <select
        id="outcome-select"
        className="border rounded px-2 py-1 text-black"
        value={outcome ?? ""}
        onChange={handleChange}
        disabled={saving}
        aria-label="Investigation Outcome"
      >
        <option value="">(No outcome set)</option>
        {OUTCOME_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      {saving && <span className="ml-2 text-xs text-slate-400">Saving...</span>}
      {error && <div className="mt-1 text-xs text-red-500">{error}</div>}
      {success && !error && <div className="mt-1 text-xs text-green-600">Outcome updated.</div>}
    </div>
  );
}
