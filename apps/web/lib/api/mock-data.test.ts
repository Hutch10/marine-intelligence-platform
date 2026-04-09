import { describe, test, expect } from "vitest";
import { signalDetectionsFallbackData } from "@/lib/api/mock-data";

describe("signalDetectionsFallbackData", () => {
  test("no fallback signal carries a non-null linkedInvestigationId", () => {
    // Investigation IDs in fallback data would surface as dead references
    // because no investigation workspace route exists. All must be null.
    for (const signal of signalDetectionsFallbackData) {
      expect(signal.linkedInvestigationId).toBeNull();
    }
  });

  test("no fallback signal references a TRK-NNN investigation ID", () => {
    for (const signal of signalDetectionsFallbackData) {
      // TRK-NNN IDs imply a navigable investigation case — which has no route.
      if (signal.linkedInvestigationId !== null) {
        expect(signal.linkedInvestigationId).not.toMatch(/^TRK-\d/);
      }
    }
  });

  test("all fallback signals have required fields", () => {
    for (const signal of signalDetectionsFallbackData) {
      expect(typeof signal.id).toBe("string");
      expect(typeof signal.title).toBe("string");
      expect(["open", "monitoring", "promoted", "dismissed"]).toContain(signal.status);
    }
  });
});
