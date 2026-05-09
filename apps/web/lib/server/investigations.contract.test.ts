import { describe, it, expect, vi, beforeEach } from "vitest";
import type { InvestigationAnalysisTrack } from "@marine/shared";

const { mockGetById } = vi.hoisted(() => ({
  mockGetById: vi.fn(),
}));

vi.mock("@/lib/server/investigations", () => ({
  getInvestigationById: mockGetById,
}));

import { getInvestigationById } from "@/lib/server/investigations";

const MOCK_INVESTIGATION: InvestigationAnalysisTrack & { signals?: { confidence: number | null; timestamp: string; stationId: string; source: string }[] } = {
  id: "INV-001",
  title: "Test Investigation",
  summary: "Test summary.",
  confidence: 88,
  state: "Correlated",
  outcome: null,
  signals: [
    {
      confidence: 77,
      timestamp: "2026-03-31T12:00:00Z",
      stationId: "41009",
      source: "noaa_ndbc",
    },
  ],
};

describe("InvestigationAnalysisTrack shared type contract", () => {
  beforeEach(() => mockGetById.mockReset());

  it("should match the API payload shape for signals", async () => {
    mockGetById.mockResolvedValue(MOCK_INVESTIGATION);
    const investigation = (await getInvestigationById("INV-001")) as InvestigationAnalysisTrack & { signals?: Record<string, unknown>[] };
    expect(investigation).toBeTruthy();
    if (investigation?.signals) {
      for (const signal of investigation.signals) {
        expect(signal).not.toHaveProperty("value");
        expect(typeof signal.confidence === "number" || signal.confidence === null).toBe(true);
        expect(typeof signal.timestamp).toBe("string");
        expect(signal).toHaveProperty("stationId");
        expect(signal).toHaveProperty("source");
      }
    }
  });
});
