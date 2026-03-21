import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MarineAlertStatusActions } from "@/components/ocean-stations/marine-alert-status-actions";

const { refresh } = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

beforeEach(() => {
  refresh.mockReset();
  vi.restoreAllMocks();
});

test("marine alert status actions acknowledges an active alert", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    json: async () => ({ alert: { status: "acknowledged" } }),
  } as Response);

  render(<MarineAlertStatusActions alertId="MALT-001" status="active" />);

  await user.click(screen.getByRole("button", { name: "Acknowledge" }));

  expect(refresh).toHaveBeenCalled();
  expect(screen.queryByRole("button", { name: "Acknowledge" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument();
});

test("marine alert status actions resolves an alert and shows the resolved state", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    json: async () => ({ alert: { status: "resolved" } }),
  } as Response);

  render(<MarineAlertStatusActions alertId="MALT-001" status="acknowledged" />);

  await user.click(screen.getByRole("button", { name: "Resolve" }));

  expect(await screen.findByText("Resolved")).toBeInTheDocument();
  expect(refresh).toHaveBeenCalled();
});

test("marine alert status actions surface API failures non-fatally", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: false,
    json: async () => ({ message: "Marine alert not found" }),
  } as Response);

  render(<MarineAlertStatusActions alertId="MALT-001" status="active" />);

  await user.click(screen.getByRole("button", { name: "Acknowledge" }));

  expect(await screen.findByText("Marine alert not found")).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});