import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";
import { MarineInvestigationCreateButton } from "@/components/ocean-stations/marine-investigation-create-button";

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

test("marine investigation create button opens an investigation and refreshes the page", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      ok: true,
      investigation: { id: "MIID-001" },
    }),
  } as Response);

  render(<MarineInvestigationCreateButton eventId="MEV-001" title="Investigate thermal threshold exceeded" />);

  await user.click(screen.getByRole("button", { name: "Open Investigation" }));

  expect(await screen.findByText("Investigation opened")).toBeInTheDocument();
  expect(refresh).toHaveBeenCalled();
});

test("marine investigation create button shows API errors without crashing the page", async () => {
  const user = userEvent.setup();

  vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
    ok: false,
    json: async () => ({ message: "Marine event not found" }),
  } as Response);

  render(<MarineInvestigationCreateButton eventId="MEV-001" title="Investigate thermal threshold exceeded" />);

  await user.click(screen.getByRole("button", { name: "Open Investigation" }));

  expect(await screen.findByText("Marine event not found")).toBeInTheDocument();
  expect(refresh).not.toHaveBeenCalled();
});