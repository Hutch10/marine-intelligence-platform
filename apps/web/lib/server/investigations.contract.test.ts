import { describe, it, expect } from "vitest";
import type { InvestigationAnalysisTrack } from "@marine/shared";
import { getInvestigationById } from "@/lib/server/investigations";

// Test: shared type matches API payload

describe("InvestigationAnalysisTrack shared type contract", () => {
  it("should match the API payload shape for signals", async () => {
    const investigation = (await getInvestigationById("INV-001")) as InvestigationAnalysisTrack & { signals?: any[] };
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
