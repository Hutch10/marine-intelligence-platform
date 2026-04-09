import type { InvestigationAnalysisTrack } from "@marine/shared";

const apiBase = () =>
  (process.env.MARINE_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");

export async function listInvestigations(): Promise<InvestigationAnalysisTrack[]> {
  try {
    const res = await fetch(`${apiBase()}/investigations`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data?.workspace?.analysisTracks ?? []) as InvestigationAnalysisTrack[];
  } catch {
    return [];
  }
}

export async function getInvestigationById(
  id: string,
): Promise<InvestigationAnalysisTrack & { signals?: InvestigationAnalysisTrack["signals"]; lastUpdated?: string | null } | null> {
  try {
    const res = await fetch(
      `${apiBase()}/investigations/${encodeURIComponent(id)}`,
      { cache: "no-store", headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    // Accept signals and lastUpdated if present
    return data.investigation as InvestigationAnalysisTrack & { signals?: InvestigationAnalysisTrack["signals"]; lastUpdated?: string | null };
  } catch {
    return null;
  }
}

export async function setInvestigationOutcome(
  id: string,
  outcome: "confirmed" | "false_positive" | "inconclusive" | null,
): Promise<InvestigationAnalysisTrack | null> {
  const res = await fetch(
    `${apiBase()}/investigations/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ outcome }),
    },
  );
  if (!res.ok) {
    if (res.status === 404) return null;
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { message?: string })?.message ?? "Failed to update outcome");
  }
  const data = await res.json();
  return data.investigation as InvestigationAnalysisTrack;
}
