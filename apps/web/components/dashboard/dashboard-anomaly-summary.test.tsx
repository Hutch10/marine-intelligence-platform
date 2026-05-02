import { render, screen } from "@testing-library/react";
import { DashboardAnomalySummaryCard } from "@/components/dashboard/dashboard-anomaly-summary";

const SUMMARY = {
  totalAnomalies: 4,
  elevatedAnomalies: 2,
  criticalAnomalies: 1,
  regionsAffected: 1,
  trendDirection: "up" as const,
};

test("anomaly summary renders create investigation action when prefill is available", () => {
  render(
    <DashboardAnomalySummaryCard
      summary={SUMMARY}
      createInvestigationPrefill={{
        eventId: "ANOM-001",
        title: "Thermal anomaly escalation",
        sourceType: "anomaly",
        region: "Southeast Florida",
        detectedAt: "2026-03-18T10:50:00.000Z",
        stationId: "41009",
        relatedStations: ["41009"],
      }}
    />,
  );

  expect(screen.getByRole("button", { name: /create investigation from anomaly/i })).toBeInTheDocument();
});

test("anomaly summary hides create investigation action when prefill is not available", () => {
  render(<DashboardAnomalySummaryCard summary={SUMMARY} createInvestigationPrefill={null} />);

  expect(screen.queryByRole("button", { name: /create investigation from anomaly/i })).not.toBeInTheDocument();
});