import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { OceanStationAlertActivity } from "@/components/ocean-stations/ocean-station-alert-activity";
import type { OceanStationAlert } from "@/lib/api/types";

function makeAlert(overrides: Partial<OceanStationAlert> = {}): OceanStationAlert {
  return {
    id: "ALT-001",
    title: "Thermal anomaly detected",
    severity: "high",
    status: "active",
    detail: "Temperature exceeded safe threshold at depth 40m.",
    detectedAt: "2 hours ago",
    acknowledgedAt: null,
    acknowledgedBy: null,
    ...overrides,
  };
}

function renderActivity(alerts: OceanStationAlert[], stationId = "STA-NPC-01") {
  return render(
    <OceanStationAlertActivity
      stationId={stationId}
      alerts={alerts}
      actorId="researcher@marine.local"
    />,
  );
}

test("renders alert title, detail, and acknowledge button for unacknowledged alert", () => {
  renderActivity([makeAlert()]);

  expect(screen.getByText("Thermal anomaly detected")).toBeInTheDocument();
  expect(screen.getByText("Temperature exceeded safe threshold at depth 40m.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
  expect(screen.queryByText("Acknowledged")).not.toBeInTheDocument();
});

test("renders acknowledged state without button when acknowledgedAt is set", () => {
  renderActivity([
    makeAlert({
      status: "acknowledged",
      acknowledgedAt: "2026-03-16T10:00:00.000Z",
      acknowledgedBy: "ops.lead@marine.local",
    }),
  ]);

  expect(screen.getByText("Acknowledged")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
  expect(screen.getByText(/ops\.lead@marine\.local/)).toBeInTheDocument();
});

test("renders empty state when no alerts", () => {
  renderActivity([]);

  expect(screen.getByText("No active alerts.")).toBeInTheDocument();
});

test("acknowledge button calls API and updates alert to acknowledged state", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ok: true,
      alert: {
        id: "ALT-001",
        title: "Thermal anomaly detected",
        severity: "high",
        status: "acknowledged",
        detail: "Temperature exceeded safe threshold at depth 40m.",
        detectedAt: "2 hours ago",
        acknowledgedAt: "2026-03-16T12:00:00.000Z",
        acknowledgedBy: "researcher@marine.local",
      },
      timelineEvent: {
        id: "STL-ACK-ALT-001-12345",
        label: "Alert acknowledged",
        phase: "Response",
        detail: "Thermal anomaly detected acknowledged by researcher@marine.local.",
        happenedAt: "2026-03-16T12:00:00.000Z",
      },
    }),
  } as Response);

  renderActivity([makeAlert()]);

  await user.click(screen.getByRole("button", { name: "Acknowledge" }));

  expect(await screen.findByText("Acknowledged")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
  expect(screen.getByText(/researcher@marine\.local/)).toBeInTheDocument();
  expect(screen.getByText(/Follow-up logged to timeline: Alert acknowledged/)).toBeInTheDocument();

  vi.restoreAllMocks();
});

test("acknowledge button shows error message on API failure", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: false,
    json: async () => ({ message: "Station or alert not found" }),
  } as Response);

  renderActivity([makeAlert()]);

  await user.click(screen.getByRole("button", { name: "Acknowledge" }));

  expect(await screen.findByText("Station or alert not found")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();

  vi.restoreAllMocks();
});

test("acknowledge button shows error on network failure", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network error"));

  renderActivity([makeAlert()]);

  await user.click(screen.getByRole("button", { name: "Acknowledge" }));

  expect(await screen.findByText("Network error. Please try again.")).toBeInTheDocument();

  vi.restoreAllMocks();
});

test("acknowledge button is disabled while request is in flight", async () => {
  const user = userEvent.setup();
  let resolveRequest!: (value: Response) => void;

  vi.spyOn(globalThis, "fetch").mockReturnValueOnce(
    new Promise<Response>((resolve) => {
      resolveRequest = resolve;
    }),
  );

  renderActivity([makeAlert()]);

  await user.click(screen.getByRole("button", { name: "Acknowledge" }));

  expect(screen.getByRole("button", { name: "Acknowledging…" })).toBeDisabled();

  resolveRequest({
    ok: true,
    json: async () => ({
      ok: true,
      alert: makeAlert({ status: "acknowledged", acknowledgedAt: "2026-03-16T12:00:00.000Z", acknowledgedBy: "researcher@marine.local" }),
    }),
  } as Response);

  expect(await screen.findByText("Acknowledged")).toBeInTheDocument();

  vi.restoreAllMocks();
});

test("multiple alerts render independently", () => {
  renderActivity([
    makeAlert({ id: "ALT-001", title: "Thermal anomaly" }),
    makeAlert({
      id: "ALT-002",
      title: "Low oxygen levels",
      severity: "medium",
      acknowledgedAt: "2026-03-16T09:00:00.000Z",
      acknowledgedBy: "ops@marine.local",
      status: "acknowledged",
    }),
  ]);

  expect(screen.getByText("Thermal anomaly")).toBeInTheDocument();
  expect(screen.getByText("Low oxygen levels")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Acknowledge" })).toBeInTheDocument();
  expect(screen.getByText("Acknowledged")).toBeInTheDocument();
});
