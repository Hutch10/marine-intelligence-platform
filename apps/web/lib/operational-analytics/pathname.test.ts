import { describe, expect, test } from "vitest";
import { classifyPathnameForAnalytics } from "./pathname";

describe("classifyPathnameForAnalytics", () => {
  test("maps root to dashboard page_view", () => {
    expect(classifyPathnameForAnalytics("/")).toEqual({
      eventType: "page_view",
      dimension: "dashboard",
    });
  });

  test("maps investigation detail without exposing id", () => {
    expect(classifyPathnameForAnalytics("/investigations/INV-SECRET-123")).toEqual({
      eventType: "page_view",
      dimension: "investigation_detail",
    });
  });

  test("maps operator lineage", () => {
    expect(classifyPathnameForAnalytics("/operator/lineage")).toEqual({
      eventType: "page_view",
      dimension: "operator_lineage",
    });
  });
});
