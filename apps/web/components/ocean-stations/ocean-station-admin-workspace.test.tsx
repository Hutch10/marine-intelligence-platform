import { fireEvent, render, screen } from "@testing-library/react";
import { OceanStationAdminWorkspace } from "@/components/ocean-stations/ocean-station-admin-workspace";
import { oceanStationDetails } from "@/lib/api/mock-data";

const STATION = oceanStationDetails["STA-NPC-01"];

function renderWorkspace() {
  const saveAction = "/internal-station-admin" as unknown as (formData: FormData) => Promise<void>;

  render(
    <OceanStationAdminWorkspace
      station={STATION}
      saved={false}
      error={undefined}
      adminActorId="admin.user@marine.local"
      permissions={[
        "station.view_admin",
        "station.edit_branding",
        "station.edit_content",
        "station.view_audit",
      ]}
      canEditBranding
      canEditContent
      canViewAudit
      authEvents={[
        {
          id: "EVT-1",
          eventType: "login_success",
          actorId: "admin.user@marine.local",
          sessionId: "sess-admin-ops-001",
          occurredAt: "2026-03-16T02:05:00.000Z",
          ip: "203.0.113.42",
          userAgent: "Vitest Browser",
          source: "POST /api/station-admin/login",
        },
      ]}
      auditHistory={[
        {
          id: "AUD-1",
          stationId: STATION.id,
          actorId: "admin.user@marine.local",
          actorRole: "admin",
          area: "branding",
          changedAt: "2026-03-16T02:15:00.000Z",
          changedFields: ["exhibitTitle", "accentColor"],
        },
      ]}
      saveAction={saveAction}
      csrfToken="test-csrf-component-001"
    />
  );
}

function renderReadOnlyWorkspace() {
  const saveAction = "/internal-station-admin" as unknown as (formData: FormData) => Promise<void>;

  render(
    <OceanStationAdminWorkspace
      station={STATION}
      saved={false}
      error={undefined}
      adminActorId="observer.user@marine.local"
      permissions={["station.view_admin"]}
      canEditBranding={false}
      canEditContent={false}
      canViewAudit={false}
      authEvents={[]}
      auditHistory={[]}
      saveAction={saveAction}
      csrfToken="test-csrf-component-002"
    />
  );
}

test("station admin workspace renders structured editors and validation guidance", () => {
  renderWorkspace();

  expect(screen.getByRole("heading", { name: "Branding and Messaging" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Featured Species" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Alerts" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Timeline Items" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Educational Content" })).toBeInTheDocument();

  expect(screen.getByLabelText(/Exhibit Title/i)).toHaveValue(STATION.branding.exhibitTitle);
  expect(screen.getByLabelText(/Public Description/i)).toHaveValue(STATION.branding.publicDescription);
  expect(screen.getByLabelText(/Sponsor Name/i)).toHaveValue(STATION.branding.sponsorName);
  expect(screen.getByLabelText(/Operator Name/i)).toHaveValue(STATION.branding.operatorName);
  expect(screen.getByLabelText(/Accent Color/i)).toHaveValue(STATION.branding.accentColor);

  expect(screen.getAllByLabelText("Species Name")).toHaveLength(STATION.species.length + 1);
  expect(screen.getAllByLabelText("Alert Title")).toHaveLength(STATION.alerts.length + 1);
  expect(screen.getAllByLabelText("Content Title")).toHaveLength(STATION.content.length + 1);
  expect(screen.getAllByLabelText("Phase")).toHaveLength(STATION.timeline.length + 1);

  expect(screen.getByText("Required fields are marked. Keep public copy concise and visitor-friendly.")).toBeInTheDocument();
  expect(screen.getByText(/Guidance: cyan for neutral science/i)).toBeInTheDocument();
  expect(screen.getByText(/Each override must be a JSON array/i)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Admin Audit History" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Security Events" })).toBeInTheDocument();
  expect(screen.getByText("Signed in as admin.user@marine.local")).toBeInTheDocument();
  expect(screen.getAllByText("Actor:", { exact: false }).length).toBeGreaterThan(0);
  expect(screen.getByText("IP: 203.0.113.42")).toBeInTheDocument();
  expect(screen.getByText("Source: POST /api/station-admin/login")).toBeInTheDocument();

  expect(screen.getByText("Open raw JSON editors")).toBeInTheDocument();
  expect(screen.getByLabelText("Species JSON Override")).toHaveValue("");
  expect(screen.getByLabelText("Alerts JSON Override")).toHaveValue("");
  expect(screen.getByLabelText("Timeline JSON Override")).toHaveValue("");
  expect(screen.getByLabelText("Content JSON Override")).toHaveValue("");
});

test("station admin workspace supports add and remove row controls across editors", () => {
  renderWorkspace();

  const speciesBefore = screen.getAllByLabelText("Species Name").length;
  fireEvent.click(screen.getByRole("button", { name: "Add species row" }));
  expect(screen.getAllByLabelText("Species Name")).toHaveLength(speciesBefore + 1);
  fireEvent.click(screen.getAllByRole("button", { name: /Remove species row/i }).at(-1)!);
  expect(screen.getAllByLabelText("Species Name")).toHaveLength(speciesBefore);

  const alertsBefore = screen.getAllByLabelText("Alert Title").length;
  fireEvent.click(screen.getByRole("button", { name: "Add alert row" }));
  expect(screen.getAllByLabelText("Alert Title")).toHaveLength(alertsBefore + 1);
  fireEvent.click(screen.getAllByRole("button", { name: /Remove alert row/i }).at(-1)!);
  expect(screen.getAllByLabelText("Alert Title")).toHaveLength(alertsBefore);

  const timelineBefore = screen.getAllByLabelText("Timeline Label").length;
  fireEvent.click(screen.getByRole("button", { name: "Add timeline row" }));
  expect(screen.getAllByLabelText("Timeline Label")).toHaveLength(timelineBefore + 1);
  fireEvent.click(screen.getAllByRole("button", { name: /Remove timeline row/i }).at(-1)!);
  expect(screen.getAllByLabelText("Timeline Label")).toHaveLength(timelineBefore);

  const contentBefore = screen.getAllByLabelText("Content Title").length;
  fireEvent.click(screen.getByRole("button", { name: "Add content row" }));
  expect(screen.getAllByLabelText("Content Title")).toHaveLength(contentBefore + 1);
  fireEvent.click(screen.getAllByRole("button", { name: /Remove content row/i }).at(-1)!);
  expect(screen.getAllByLabelText("Content Title")).toHaveLength(contentBefore);
}, 15_000);

test("station admin workspace shows unsaved changes after form edits", () => {
  renderWorkspace();

  expect(screen.queryByText("You have unsaved changes.")).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/Exhibit Title/i), {
    target: { value: "Updated Exhibit" },
  });

  expect(screen.getByText("You have unsaved changes.")).toBeInTheDocument();
});

test("station admin workspace refreshes draft rows when station content updates with the same id", () => {
  const saveAction = "/internal-station-admin" as unknown as (formData: FormData) => Promise<void>;
  const { rerender } = render(
    <OceanStationAdminWorkspace
      station={STATION}
      saved={false}
      error={undefined}
      adminActorId="admin.user@marine.local"
      permissions={[
        "station.view_admin",
        "station.edit_branding",
        "station.edit_content",
        "station.view_audit",
      ]}
      canEditBranding
      canEditContent
      canViewAudit
      authEvents={[]}
      auditHistory={[]}
      saveAction={saveAction}
      csrfToken="test-csrf-component-003"
    />,
  );

  const speciesInputsBefore = screen.getAllByLabelText("Species Name");
  fireEvent.change(speciesInputsBefore[0]!, { target: { value: "Local Draft Species" } });
  expect(screen.getByText("You have unsaved changes.")).toBeInTheDocument();

  const updatedStation = {
    ...STATION,
    species: [
      {
        ...STATION.species[0]!,
        name: "Server Refreshed Species",
      },
      ...STATION.species.slice(1),
    ],
  };

  rerender(
    <OceanStationAdminWorkspace
      station={updatedStation}
      saved={false}
      error={undefined}
      adminActorId="admin.user@marine.local"
      permissions={[
        "station.view_admin",
        "station.edit_branding",
        "station.edit_content",
        "station.view_audit",
      ]}
      canEditBranding
      canEditContent
      canViewAudit
      authEvents={[]}
      auditHistory={[]}
      saveAction={saveAction}
      csrfToken="test-csrf-component-003"
    />,
  );

  expect(screen.queryByText("You have unsaved changes.")).not.toBeInTheDocument();
});

test("station admin workspace shows permission-limited read-only state", () => {
  renderReadOnlyWorkspace();

  expect(screen.getByText("Read-only: this session does not include station.edit_branding.")).toBeInTheDocument();
  expect(screen.getByText("Read-only: this session does not include station.edit_content.")).toBeInTheDocument();
  expect(screen.getAllByText("This session does not include station.view_audit.")).toHaveLength(2);
  expect(screen.getByText("No edit permissions assigned to this session.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Save Station Updates" })).toBeDisabled();
});
