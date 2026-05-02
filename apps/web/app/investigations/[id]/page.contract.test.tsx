import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";

const { mockGetById } = vi.hoisted(() => ({
  mockGetById: vi.fn(),
}));

vi.mock("@/lib/server/investigations", () => ({
  getInvestigationById: mockGetById,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/ui/InvestigationOutcomeEditor", () => ({
  InvestigationOutcomeEditor: () => null,
}));

import InvestigationDetailPage from "./page";

const INVESTIGATION_WITH_SIGNALS = {
  id: "INV-001",
  eventId: "SIG-001",
  title: "Test Investigation",
  summary: "Test summary.",
  confidence: 88,
  state: "Correlated",
  sourceType: "signal" as const,
  region: "Southeast Florida",
  stationId: "41009",
  detectedAt: "2026-03-31T12:00:00Z",
  outcome: null,
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
};

const INVESTIGATION_NO_SIGNALS = {
  id: "INV-002",
  eventId: "ANOM-002",
  title: "No Signals",
  summary: "No data.",
  confidence: 50,
  state: "Watch",
  sourceType: null,
  region: null,
  stationId: null,
  detectedAt: null,
  outcome: null,
  signals: [],
  lastUpdated: null,
};

describe("InvestigationDetailPage UI", () => {
  beforeEach(() => mockGetById.mockReset());

  it("renders real traceable fields only", async () => {
    mockGetById.mockResolvedValue(INVESTIGATION_WITH_SIGNALS);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- Next.js infers page components as zero-arg in non-page contexts
    const page = await InvestigationDetailPage({ params: { id: "INV-001" } });
    render(page);

    expect(screen.getByText(/Test Investigation/)).toBeInTheDocument();
    expect(screen.getAllByText("sst").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/confidence: 77/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("41009").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/noaa_ndbc/).length).toBeGreaterThan(0);
    expect(screen.getByText("Original Source Metadata")).toBeInTheDocument();
    expect(screen.getByText("Signal")).toBeInTheDocument();
    expect(screen.getByText("Southeast Florida")).toBeInTheDocument();
    expect(screen.getByText("Last updated:")).toBeInTheDocument();
  });

  it("renders honestly when fields are missing", async () => {
    mockGetById.mockResolvedValue(INVESTIGATION_NO_SIGNALS);
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore -- Next.js infers page components as zero-arg in non-page contexts
    const page = await InvestigationDetailPage({ params: { id: "INV-002" } });
    render(page);

    expect(screen.getByText(/No contributing signals listed/)).toBeInTheDocument();
    expect(screen.getByText(/No traceable signals for this investigation/)).toBeInTheDocument();
    expect(screen.getAllByText("Not provided").length).toBeGreaterThan(0);
    expect(screen.getByText("Last updated:")).toBeInTheDocument();
    // "Unknown" appears in multiple fields (last updated, data sources) — just verify at least one
    expect(screen.getAllByText("Unknown").length).toBeGreaterThan(0);
  });
});
