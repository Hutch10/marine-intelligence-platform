import { render, screen } from "@testing-library/react";
import { SignalCenter } from "@/components/signals/signal-center";
import type { SignalDetection } from "@/lib/api/types";

function buildSignal(overrides: Partial<SignalDetection>): SignalDetection {
  return {
    id: "SIG-BASE",
    signalType: "thermal_anomaly",
    severity: "medium",
    confidence: 70,
    sourceType: "risk_engine",
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
      statusLine="Persisted detections only."
    />,
  );

  const rankedTitles = screen.getAllByRole("heading", { level: 3 }).map((node) => node.textContent);

  expect(screen.getByText("Persisted detections only.")).toBeInTheDocument();
  expect(rankedTitles[0]).toContain("Critical priority signal");
  expect(rankedTitles[1]).toContain("High priority signal");
  expect(rankedTitles[2]).toContain("Low priority signal");
  expect(screen.queryByText("Monitoring only signal")).toBeNull();
});

test("signal center renders trustful empty state with custom copy", () => {
  render(
    <SignalCenter
      signals={[]}
      emptyStateTitle="No live detections are open"
      emptyStateSubtitle="Use regional and station pages for direct risk outputs."
    />,
  );

  expect(screen.getByText("No live detections are open")).toBeInTheDocument();
  expect(screen.getByText("Use regional and station pages for direct risk outputs.")).toBeInTheDocument();
});
