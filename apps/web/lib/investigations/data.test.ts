import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getInvestigationById } from "@/lib/investigations/data";

describe("getInvestigationById (web)", () => {
  beforeEach(() => {
    global.fetch = vi.fn((url: string) => {
      if (url.includes("INV-001")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ investigation: { id: "INV-001", title: "Test Investigation" } }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({}) });
    });
  });
  afterEach(() => {
    vi.resetAllMocks();
  });

  it("returns investigation for valid id", async () => {
    const investigation = await getInvestigationById("INV-001");
    expect(investigation).toBeTruthy();
    expect(investigation?.id).toBe("INV-001");
  });

  it("returns null for invalid id", async () => {
    const investigation = await getInvestigationById("DOES-NOT-EXIST");
    expect(investigation).toBeNull();
  });
});
