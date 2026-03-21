import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/layout/app-shell";

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <div data-testid="sidebar" />,
}));

vi.mock("@/components/layout/topbar", () => ({
  TopBar: ({ title, subtitle }: { title?: string; subtitle?: string }) => (
    <div data-testid="topbar">
      <span>{title}</span>
      <span>{subtitle}</span>
    </div>
  ),
}));

test("app shell keeps the main pane shrink-safe and the right AI panel fixed width", () => {
  render(
    <AppShell pageTitle="Investigations" pageSubtitle="Workspace shell regression test">
      <div>Workspace content</div>
    </AppShell>,
  );

  const main = screen.getByRole("main");
  expect(main).toHaveClass("min-w-0");
  expect(main).toHaveClass("flex-1");

  const panelHeading = screen.getByText("AI Insights");
  const panel = panelHeading.closest("aside");

  expect(panel).not.toBeNull();
  expect(panel).toHaveClass("w-72");
  expect(panel).toHaveClass("shrink-0");
});

test("app shell can still hide the right AI panel when requested", () => {
  render(
    <AppShell hideAIPanel>
      <div>Workspace content</div>
    </AppShell>,
  );

  expect(screen.queryByText("AI Insights")).not.toBeInTheDocument();
});