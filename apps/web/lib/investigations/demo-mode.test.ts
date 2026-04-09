import { describe, test, expect } from "vitest";
import {
  isInvestigationsDemoMode,
  INVESTIGATIONS_DEMO_QUERY_FLAG,
  DEMO_SIMILAR_INVESTIGATIONS,
} from "@/lib/investigations/demo-mode";

// Verify that only the two active exports exist — the dead exports
// (buildDemoInvestigationsWorkspace, DEMO_SCRIPT_STEPS) must not be present.
import * as demoMode from "@/lib/investigations/demo-mode";

describe("demo-mode exports", () => {
  test("module exports exactly the three active symbols", () => {
    const exported = Object.keys(demoMode).sort();
    expect(exported).toEqual([
      "DEMO_SIMILAR_INVESTIGATIONS",
      "INVESTIGATIONS_DEMO_QUERY_FLAG",
      "isInvestigationsDemoMode",
    ]);
  });

  test("buildDemoInvestigationsWorkspace is not exported", () => {
    expect((demoMode as Record<string, unknown>).buildDemoInvestigationsWorkspace).toBeUndefined();
  });

  test("DEMO_SCRIPT_STEPS is not exported", () => {
    expect((demoMode as Record<string, unknown>).DEMO_SCRIPT_STEPS).toBeUndefined();
  });
});

describe("isInvestigationsDemoMode", () => {
  test("returns true for the canonical flag value", () => {
    expect(isInvestigationsDemoMode(INVESTIGATIONS_DEMO_QUERY_FLAG)).toBe(true);
  });

  test("returns true when flag appears in an array", () => {
    expect(isInvestigationsDemoMode([INVESTIGATIONS_DEMO_QUERY_FLAG, "other"])).toBe(true);
  });

  test("returns false for undefined", () => {
    expect(isInvestigationsDemoMode(undefined)).toBe(false);
  });

  test("returns false for arbitrary strings", () => {
    expect(isInvestigationsDemoMode("demo")).toBe(false);
    expect(isInvestigationsDemoMode("true")).toBe(false);
  });

  test("returns false for an array not containing the flag", () => {
    expect(isInvestigationsDemoMode(["other"])).toBe(false);
  });
});

describe("DEMO_SIMILAR_INVESTIGATIONS", () => {
  test("all entries have DEMO-prefixed investigation IDs — no real TRK-NNN IDs", () => {
    for (const entry of DEMO_SIMILAR_INVESTIGATIONS) {
      expect(entry.investigationId).toMatch(/^TRK-DEMO-/);
    }
  });

  test("each entry has required shape fields", () => {
    for (const entry of DEMO_SIMILAR_INVESTIGATIONS) {
      expect(typeof entry.investigationId).toBe("string");
      expect(typeof entry.title).toBe("string");
      expect(typeof entry.similarity).toBe("number");
      expect(entry.similarity).toBeGreaterThan(0);
      expect(entry.similarity).toBeLessThanOrEqual(1);
    }
  });
});
