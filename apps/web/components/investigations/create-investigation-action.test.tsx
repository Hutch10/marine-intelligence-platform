import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, test, expect, vi } from "vitest";
import { CreateInvestigationAction } from "@/components/investigations/create-investigation-action";

afterEach(() => {
  vi.unstubAllGlobals();
});

test("create investigation action shows prefilled metadata", async () => {
  const user = userEvent.setup();

  render(
    <CreateInvestigationAction
      prefill={{
        eventId: "EVT-001",
        title: "Thermal anomaly escalation",
        sourceType: "anomaly",
        region: "Southeast Florida",
        detectedAt: "2026-03-18T10:50:00.000Z",
        stationId: "41009",
        relatedStations: ["41009", "42019"],
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: /create investigation/i }));

  expect(screen.getByDisplayValue("EVT-001")).toBeInTheDocument();
  expect(screen.getByDisplayValue("Thermal anomaly escalation")).toBeInTheDocument();
  expect(screen.getByText(/Source type: anomaly/i)).toBeInTheDocument();
  expect(screen.getByText(/Region: Southeast Florida/i)).toBeInTheDocument();
  expect(screen.getByText(/Related stations: 41009, 42019/i)).toBeInTheDocument();
});

test("create investigation action posts to existing API and shows link on success", async () => {
  const user = userEvent.setup();

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, investigation: { id: "INV-001" } }),
    }),
  );

  render(
    <CreateInvestigationAction
      prefill={{
        eventId: "EVT-001",
        title: "Thermal anomaly escalation",
        sourceType: "signal",
        region: "Southeast Florida",
        detectedAt: "2026-03-18T10:50:00.000Z",
        stationId: "41009",
        relatedStations: ["41009"],
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: /create investigation/i }));
  await user.click(screen.getByRole("button", { name: /submit/i }));

  const requestInit = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]?.[1] as RequestInit;
  const requestBody = JSON.parse(String(requestInit?.body ?? "{}")) as Record<string, unknown>;

  expect(fetch).toHaveBeenCalledWith(
    "/api/marine-intelligence/investigations",
    expect.objectContaining({ method: "POST" }),
  );
  expect(requestBody).toMatchObject({
    eventId: "EVT-001",
    title: "Thermal anomaly escalation",
    sourceType: "signal",
    stationId: "41009",
    region: "Southeast Florida",
    detectedAt: "2026-03-18T10:50:00.000Z",
  });
  expect(screen.getByRole("link", { name: /open investigation/i })).toHaveAttribute("href", "/investigations/INV-001");
});

test("create investigation action surfaces API failure message", async () => {
  const user = userEvent.setup();

  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ message: "eventId and title are required" }),
    }),
  );

  render(
    <CreateInvestigationAction
      prefill={{
        eventId: "EVT-001",
        title: "Thermal anomaly escalation",
        sourceType: "signal",
        region: "Southeast Florida",
        detectedAt: "2026-03-18T10:50:00.000Z",
        stationId: "41009",
        relatedStations: ["41009"],
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: /create investigation/i }));
  await user.click(screen.getByRole("button", { name: /submit/i }));

  expect(screen.getByText(/eventId and title are required/i)).toBeInTheDocument();
});

test("create investigation action blocks submit when event ID is unavailable", async () => {
  const user = userEvent.setup();

  render(
    <CreateInvestigationAction
      prefill={{
        eventId: null,
        title: "Thermal anomaly escalation",
        sourceType: null,
        region: null,
        detectedAt: "2026-03-18T10:50:00.000Z",
        stationId: null,
        relatedStations: [],
      }}
    />,
  );

  await user.click(screen.getByRole("button", { name: /create investigation/i }));

  expect(screen.getByText(/Event ID and title are required/i)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /submit/i })).toBeDisabled();
});