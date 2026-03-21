import { render, screen } from "@testing-library/react";
import { SignalCenter } from "@/components/signals/signal-center";
import type { SignalDetection } from "@/lib/api/types";

function buildSignal(overrides: Partial<SignalDetection>): SignalDetection {
  return {
    id: "SIG-BASE",
    signalType: "thermal_anomaly",
    severity: "medium",
    confidence: 70,
    sourceType: "test-source",
    sourceId: "source-1",
    region: "North Pacific",
    stationId: null,
    title: "Base signal",
    summary: "Base summary",
    detail: "Base detail",
    status: "open",
    detectedAt: "2026-03-17T10:00:00.000Z",
    createdAt: "2026-03-17T10:00:00.000Z",
    updatedAt: "2026-03-17T10:00:00.000Z",
    linkedInvestigationId: null,
    ...overrides,
  };
}

test("signal center ranks open signals by severity and confidence", () => {
  render(
    <SignalCenter
      maxItems={3}
      signals={[
        buildSignal({
          id: "SIG-LOW",
          title: "Low priority signal",
          severity: "low",
          confidence: 55,
          detectedAt: "2026-03-17T09:00:00.000Z",
        }),
        buildSignal({
          id: "SIG-HIGH",
          title: "High priority signal",
          severity: "high",
          confidence: 82,
          detectedAt: "2026-03-17T10:30:00.000Z",
        }),
        buildSignal({
          id: "SIG-CRIT",
          title: "Critical priority signal",
          severity: "critical",
          confidence: 90,
          detectedAt: "2026-03-17T10:20:00.000Z",
        }),
        buildSignal({
          id: "SIG-MON",
          title: "Monitoring only signal",
          severity: "critical",
          confidence: 95,
          status: "monitoring",
        }),
      ]}
    />,
  );

  const rankedTitles = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);

  expect(rankedTitles[0]).toContain("Critical priority signal");
  expect(rankedTitles[1]).toContain("High priority signal");
  expect(rankedTitles[2]).toContain("Low priority signal");
  expect(screen.queryByText("Monitoring only signal")).toBeNull();
});

test("signal center renders empty state with no active signals", () => {
  render(<SignalCenter signals={[]} />);

  expect(screen.getByText("No active signals available.")).toBeInTheDocument();
});
