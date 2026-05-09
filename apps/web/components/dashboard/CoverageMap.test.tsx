import { describe, test, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { hasFiniteCentroid, toMarkerPercent, DataCoverageMap } from "./CoverageMap";
import React from "react";

// Mock fetch globally
global.fetch = vi.fn();

describe("CoverageMap Guardrails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("guardrail: no clamping path exists in toMarkerPercent", () => {
    const outsideLat = toMarkerPercent({ lat: 1000, lng: 0 });
    const topVal = parseFloat(outsideLat.top);
    expect(topVal).toBeLessThan(0);
    
    const outsideLng = toMarkerPercent({ lat: 0, lng: 1000 });
    const leftVal = parseFloat(outsideLng.left);
    expect(leftVal).toBeGreaterThan(100);
  });

  test("guardrail: invalid centroid fails hasFiniteCentroid", () => {
    expect(hasFiniteCentroid({ lat: 1000, lng: 0 })).toBe(false);
    expect(hasFiniteCentroid({ lat: 0, lng: 1000 })).toBe(false);
    expect(hasFiniteCentroid({ lat: 0, lng: 0 })).toBe(false);
    expect(hasFiniteCentroid({ lat: NaN, lng: 0 })).toBe(false);
  });

  test("render-level: invalid/missing centroids do not render markers", async () => {
    const mockRegions = {
      regions: [
        {
          id: "REG-VALID",
          name: "Valid Region",
          status: "Normal",
          metrics: [],
          centroid: { lat: 10, lng: 10 }
        },
        {
          id: "REG-INVALID",
          name: "Invalid Region",
          status: "Error",
          metrics: [],
          centroid: { lat: 1000, lng: 0 } // Invalid
        },
        {
          id: "REG-MISSING",
          name: "Missing Region",
          status: "Warning",
          metrics: [],
          centroid: null // Missing
        }
      ]
    };

    (global.fetch as vi.Mock).mockResolvedValue({
      ok: true,
      json: async () => mockRegions,
    });

    render(<DataCoverageMap />);

    // Wait for loading to finish
    await waitFor(() => expect(screen.queryByText(/Loading spatial coverage/i)).toBeNull());

    // Assert valid region marker exists
    // Markers are rendered as buttons with specific styles. We can check for the button by label or title if they had one, 
    // but here we'll check for the existence of the specific marker group for valid region.
    const markers = screen.getAllByRole("button");
    // Only one marker should be rendered (for REG-VALID)
    expect(markers.length).toBe(1);

    // Assert missing centroid UI is shown for the 2 bad regions
    expect(screen.getByText(/Missing centroid data/i)).toBeDefined();
    expect(screen.getByText(/Invalid Region/i)).toBeDefined();
    expect(screen.getByText(/Missing Region/i)).toBeDefined();
    
    // Valid region should NOT be in the missing list
    expect(screen.queryByTestId("missing-REG-VALID")).toBeNull();
  });
});
