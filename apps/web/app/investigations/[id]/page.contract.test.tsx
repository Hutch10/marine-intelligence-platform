import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import InvestigationDetailPage from "../page";

// Mock getInvestigationById to return a controlled payload
jest.mock("@/lib/server/investigations", () => ({
  getInvestigationById: async () => ({
    id: "INV-001",
    title: "Test Investigation",
    summary: "Test summary.",
    confidence: 88,
    state: "Correlated",
    signals: [
      {
        id: "SIG-001",
        type: "sst",
        confidence: 77,
        timestamp: "2026-03-31T12:00:00Z",
        stationId: "41009",
        source: "noaa_ndbc",
      },
    ],
    lastUpdated: "2026-03-31T12:00:00Z",
  }),
}));

describe("InvestigationDetailPage UI", () => {
  it("renders real traceable fields only", async () => {
    render(<InvestigationDetailPage params={{ id: "INV-001" }} />);
    expect(await screen.findByText(/Test Investigation/)).toBeInTheDocument();
    expect(screen.getByText(/sst/)).toBeInTheDocument();
    expect(screen.getByText(/confidence: 77/)).toBeInTheDocument();
    expect(screen.getByText(/Station 41009/)).toBeInTheDocument();
    expect(screen.getByText(/Source: noaa_ndbc/)).toBeInTheDocument();
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });

  it("renders honestly when fields are missing", async () => {
    jest.mock("@/lib/server/investigations", () => ({
      getInvestigationById: async () => ({
        id: "INV-002",
        title: "No Signals",
        summary: "No data.",
        confidence: 50,
        state: "Watch",
        signals: [],
        lastUpdated: null,
      }),
    }));
    render(<InvestigationDetailPage params={{ id: "INV-002" }} />);
    expect(await screen.findByText(/No contributing signals listed/)).toBeInTheDocument();
    expect(screen.getByText(/No traceable signals for this investigation/)).toBeInTheDocument();
    expect(screen.getByText(/Last updated: Unknown/)).toBeInTheDocument();
  });
});
