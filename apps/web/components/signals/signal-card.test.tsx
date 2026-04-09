import { render, screen } from "@testing-library/react";
import { SignalCard } from "@/components/signals/signal-card";
import type { SignalDetection } from "@/lib/api/types";

function buildSignal(overrides: Partial<SignalDetection> = {}): SignalDetection {
  return {
    id: "SIG-001",
    signalType: "thermal_anomaly",
    severity: "high",
    confidence: 80,
    sourceType: "risk_engine",
    sourceId: "risk-41009",
    region: "Southeast Florida",
    stationId: "41009",
    title: "Thermal anomaly at station 41009",
    summary: "SST exceeds 45-day baseline.",
    detail: "Detailed description.",
    status: "open",
    detectedAt: "2026-03-25T12:00:00.000Z",
    createdAt: "2026-03-25T12:00:00.000Z",
    updatedAt: "2026-03-25T12:00:00.000Z",
    linkedInvestigationId: null,
    ...overrides,
  };
}

test("signal card renders title, severity, and status", () => {
  render(<SignalCard signal={buildSignal()} />);

  expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Thermal anomaly at station 41009");
  expect(screen.getByText("HIGH")).toBeInTheDocument();
  expect(screen.getByText("open")).toBeInTheDocument();
});

test("signal card renders detail link when detailHref is provided", () => {
  render(<SignalCard signal={buildSignal()} detailHref="/v1/risk/41009" />);

  const links = screen.getAllByRole("link");
  const hrefs = links.map((l) => l.getAttribute("href"));
  expect(hrefs).toContain("/v1/risk/41009");
  expect(screen.getByText("Open risk detail")).toBeInTheDocument();
});

test("signal card does not render any link when detailHref is null", () => {
  render(<SignalCard signal={buildSignal()} detailHref={null} />);

  expect(screen.queryByRole("link")).not.toBeInTheDocument();
  expect(screen.queryByText("Open risk detail")).not.toBeInTheDocument();
});

test("signal card does not render investigation ID even when linkedInvestigationId is set", () => {
  render(
    <SignalCard
      signal={buildSignal({ linkedInvestigationId: "TRK-201" })}
      detailHref="/v1/risk/41009"
    />,
  );

  // The ID must not appear anywhere — no route exists for it
  expect(screen.queryByText("TRK-201")).not.toBeInTheDocument();
  expect(screen.queryByText(/case ref/i)).not.toBeInTheDocument();
});

test("signal card with stationId in signal does not expose dead investigation ref text", () => {
  render(
    <SignalCard
      signal={buildSignal({ linkedInvestigationId: "TRK-999", stationId: "42019" })}
    />,
  );

  expect(screen.queryByText("TRK-999")).not.toBeInTheDocument();
});
