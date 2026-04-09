export const INVESTIGATIONS_DEMO_QUERY_FLAG = "1";

export function isInvestigationsDemoMode(value: string | string[] | undefined): boolean {
  if (Array.isArray(value)) {
    return value.includes(INVESTIGATIONS_DEMO_QUERY_FLAG);
  }

  return value === INVESTIGATIONS_DEMO_QUERY_FLAG;
}

export const DEMO_SIMILAR_INVESTIGATIONS = [
  {
    investigationId: "TRK-DEMO-HIST-01",
    title: "Shallow reef thermal excursion",
    summary: "Secondary site maintained safe operating conditions while the primary reef edge remained unsafe.",
    similarity: 0.91,
    embeddingSimilarity: 0.83,
    matchedOn: ["title", "summary", "explanation"] as Array<"title" | "summary" | "explanation">,
    matchedStation: "46042",
    severity: "high",
    timeframeLabel: "3 weeks ago",
    indexedAt: "2026-03-01T12:00:00.000Z",
  },
  {
    investigationId: "TRK-DEMO-HIST-02",
    title: "Coral stress and mission relocation",
    summary: "Ops delayed reef-edge work and switched to a safer adjacent station until temperatures normalized.",
    similarity: 0.86,
    embeddingSimilarity: 0.79,
    matchedOn: ["summary", "explanation"] as Array<"title" | "summary" | "explanation">,
    matchedStation: "41009",
    severity: "critical",
    timeframeLabel: "2 months ago",
    indexedAt: "2026-01-18T12:00:00.000Z",
  },
];
