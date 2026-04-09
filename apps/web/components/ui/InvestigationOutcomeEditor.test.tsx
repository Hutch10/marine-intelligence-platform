import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { InvestigationOutcomeEditor } from "./InvestigationOutcomeEditor";

describe("InvestigationOutcomeEditor", () => {
  const investigationId = "INV-001";
  const setup = (initialOutcome: "confirmed" | "false_positive" | "inconclusive" | null = null) =>
    render(<InvestigationOutcomeEditor investigationId={investigationId} initialOutcome={initialOutcome} />);

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  it("can set outcome to confirmed", async () => {
    (fetch as vi.Mock).mockResolvedValue({ ok: true, json: async () => ({ investigation: { outcome: "confirmed" } }) });
    setup(null);
    const select = screen.getByLabelText(/Investigation Outcome/i);
    fireEvent.change(select, { target: { value: "confirmed" } });
    // Should be disabled while saving
    expect(select).toBeDisabled();
    // Wait for outcome updated
    await waitFor(() => expect(screen.getByText(/Outcome updated/i)).toBeInTheDocument());
    // Should call PATCH with correct params
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/investigations/INV-001"),
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ outcome: "confirmed" })
      })
    );
    // Value updates after backend confirms
    expect(screen.getByLabelText(/Investigation Outcome/i)).toHaveValue("confirmed");
  });

  it("can set outcome to false_positive", async () => {
    (fetch as vi.Mock).mockResolvedValue({ ok: true, json: async () => ({ investigation: { outcome: "false_positive" } }) });
    setup(null);
    fireEvent.change(screen.getByLabelText(/Investigation Outcome/i), { target: { value: "false_positive" } });
    await waitFor(() => expect(screen.getByText(/Outcome updated/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/Investigation Outcome/i)).toHaveValue("false_positive");
  });

  it("can set outcome to inconclusive", async () => {
    (fetch as vi.Mock).mockResolvedValue({ ok: true, json: async () => ({ investigation: { outcome: "inconclusive" } }) });
    setup(null);
    fireEvent.change(screen.getByLabelText(/Investigation Outcome/i), { target: { value: "inconclusive" } });
    await waitFor(() => expect(screen.getByText(/Outcome updated/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/Investigation Outcome/i)).toHaveValue("inconclusive");
  });

  it("shows error on failed save", async () => {
    (fetch as vi.Mock).mockResolvedValue({ ok: false, json: async () => ({ message: "Failed to update outcome" }) });
    setup(null);
    fireEvent.change(screen.getByLabelText(/Investigation Outcome/i), { target: { value: "confirmed" } });
    await waitFor(() => expect(screen.getByText(/Failed to update outcome/i)).toBeInTheDocument());
    expect(screen.queryByText(/Outcome updated/i)).not.toBeInTheDocument();
  });

  it("disables controls and shows honest pending state while saving", async () => {
    let resolveFetch: ((v: { ok: boolean; json: () => Promise<{ investigation: { outcome: string } }> }) => void);
    (fetch as vi.Mock).mockImplementation(() => new Promise(res => { resolveFetch = res; }));
    setup(null);
    fireEvent.change(screen.getByLabelText(/Investigation Outcome/i), { target: { value: "confirmed" } });
    expect(screen.getByLabelText(/Investigation Outcome/i)).toBeDisabled();
    expect(screen.getByText(/Saving/i)).toBeInTheDocument();
    // Complete the fetch
    resolveFetch!({ ok: true, json: async () => ({ investigation: { outcome: "confirmed" } }) });
    await waitFor(() => expect(screen.getByText(/Outcome updated/i)).toBeInTheDocument());
    expect(screen.getByLabelText(/Investigation Outcome/i)).not.toBeDisabled();
  });

  it("does not update UI until backend confirms", async () => {
    let resolveFetch: ((v: { ok: boolean; json: () => Promise<{ investigation: { outcome: string } }> }) => void);
    (fetch as vi.Mock).mockImplementation(() => new Promise(res => { resolveFetch = res; }));
    setup(null);
    fireEvent.change(screen.getByLabelText(/Investigation Outcome/i), { target: { value: "confirmed" } });
    // UI should still show previous value ("") while saving
    expect(screen.getByLabelText(/Investigation Outcome/i)).toHaveValue("");
    // Complete the fetch
    resolveFetch!({ ok: true, json: async () => ({ investigation: { outcome: "confirmed" } }) });
    await waitFor(() => expect(screen.getByLabelText(/Investigation Outcome/i)).toHaveValue("confirmed"));
  });
});
