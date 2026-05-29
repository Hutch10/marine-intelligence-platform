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

vi.mock("@/components/layout/feed-health-banner-loader", () => ({
  FeedHealthBannerLoader: () => <div data-testid="feed-health-banner" />,
}));

test("app shell keeps the main pane shrink-safe", () => {
  render(
    <AppShell pageTitle="Investigations" pageSubtitle="Workspace shell regression test">
      <div>Workspace content</div>
    </AppShell>,
  );

  const main = screen.getByRole("main");
  expect(main).toHaveClass("min-w-0");
  expect(main).toHaveClass("flex-1");
  expect(screen.queryByText("AI Insights")).not.toBeInTheDocument();
});

test("app shell renders children without any AI panel", () => {
  render(
    <AppShell>
      <div>Workspace content</div>
    </AppShell>,
  );

  expect(screen.getByText("Workspace content")).toBeInTheDocument();
  expect(screen.queryByText("AI Insights")).not.toBeInTheDocument();
});

test("AppShell does not accept hideAIPanel — type-level contract lock", () => {
  // @ts-expect-error hideAIPanel must not exist on AppShellProps.
  // If this line stops being a TS error, the dead prop was re-added to the interface.
  const _unused = <AppShell hideAIPanel><div /></AppShell>;
  void _unused;
  expect(true).toBe(true);
});
