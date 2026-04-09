import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import InvestigationsPage from "@/app/investigations/page";
import type { InvestigationAnalysisTrack } from "@marine/shared";

const INV_A: InvestigationAnalysisTrack = {
  id: "INV-001",
  title: "Thermal anomaly at station 46042",
  summary: "SST spike detected above 45-day baseline.",
  state: "Escalated",
  confidence: 82,
  outcome: null,
};

const INV_B: InvestigationAnalysisTrack = {
  id: "INV-002",
  title: "Salinity anomaly — North Pacific sector",
  summary: "Salinity drop consistent with freshwater intrusion.",
  state: "Watch",
  confidence: 55,
  outcome: "inconclusive",
};

const { mockListInvestigations } = vi.hoisted(() => ({
  mockListInvestigations: vi.fn(),
}));

vi.mock("@/lib/server/investigations", () => ({
  listInvestigations: mockListInvestigations,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  mockListInvestigations.mockReset();
});

test("renders investigation rows with clickable IDs and titles", async () => {
  mockListInvestigations.mockResolvedValue([INV_A, INV_B]);
  const page = await InvestigationsPage();
  render(page);

  const idLink = screen.getByRole("link", { name: "INV-001" });
  expect(idLink).toHaveAttribute("href", "/investigations/INV-001");

  const titleLink = screen.getByRole("link", { name: "Thermal anomaly at station 46042" });
  expect(titleLink).toHaveAttribute("href", "/investigations/INV-001");

  expect(screen.getAllByText("Escalated").length).toBeGreaterThanOrEqual(1);
  expect(screen.getByText("82%")).toBeInTheDocument();
});

test("renders outcome label when set", async () => {
  mockListInvestigations.mockResolvedValue([INV_B]);
  const page = await InvestigationsPage();
  render(page);

  expect(screen.getByText("Inconclusive")).toBeInTheDocument();
});

test("renders empty state when no investigations returned", async () => {
  mockListInvestigations.mockResolvedValue([]);
  const page = await InvestigationsPage();
  render(page);

  expect(screen.getByText("No investigations found")).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

test("stats bar shows correct counts", async () => {
  mockListInvestigations.mockResolvedValue([INV_A, INV_B]);
  const page = await InvestigationsPage();
  render(page);

  // Total = 2
  const cells = screen.getAllByText("2");
  expect(cells.length).toBeGreaterThanOrEqual(1);
  // Escalated = 1
  expect(screen.getByText("1")).toBeInTheDocument();
});
