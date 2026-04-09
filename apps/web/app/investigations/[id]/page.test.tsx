// This test file is temporarily skipped due to server component/Vitest incompatibility.
// Rename to .test.tsx and refactor for compatibility in a future phase.
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import InvestigationDetailPage from "@/app/investigations/[id]/page";
import type { InvestigationAnalysisTrack } from "@marine/shared";

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

const investigation: InvestigationAnalysisTrack = {
  id: "INV-001",
  title: "Test Investigation",
  summary: "A test investigation.",
  confidence: 80,
  state: "Watch",
  outcome: null,
};

describe("InvestigationDetailPage", () => {
  beforeEach(() => mockGetById.mockReset());

  it("renders investigation details", async () => {
    mockGetById.mockResolvedValue(investigation);
    const page = await InvestigationDetailPage({ params: { id: "INV-001" } });
    render(page);

    expect(screen.getByText("Test Investigation")).toBeInTheDocument();
    expect(screen.getByText(/INV-001/)).toBeInTheDocument();
    expect(screen.getByText("Watch")).toBeInTheDocument();
    expect(screen.getByText("80")).toBeInTheDocument();
  });

  it("throws for missing investigation", async () => {
    mockGetById.mockResolvedValue(null);
    await expect(
      InvestigationDetailPage({ params: { id: "DOES-NOT-EXIST" } }),
    ).rejects.toThrow();
  });
});
