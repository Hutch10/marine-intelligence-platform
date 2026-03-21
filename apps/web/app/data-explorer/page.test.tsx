import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import DataExplorerPage from "@/app/data-explorer/page";
import { dataExplorerWorkspaceData } from "@/lib/api/mock-data";

const { mockGetDataExplorerBootstrapWorkspace, mockWorkspaceProps } = vi.hoisted(() => ({
  mockGetDataExplorerBootstrapWorkspace: vi.fn(),
  mockWorkspaceProps: vi.fn(),
}));

vi.mock("@/lib/api/data-explorer-bootstrap", () => ({
  getDataExplorerBootstrapWorkspace: mockGetDataExplorerBootstrapWorkspace,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/data-explorer/data-explorer-workspace", () => ({
  DataExplorerWorkspace: (props: unknown) => {
    mockWorkspaceProps(props);
    return <div data-testid="data-explorer-workspace" />;
  },
}));

beforeEach(() => {
  mockGetDataExplorerBootstrapWorkspace.mockReset();
  mockWorkspaceProps.mockReset();
  mockGetDataExplorerBootstrapWorkspace.mockResolvedValue({
    data: dataExplorerWorkspaceData,
    meta: {
      section: "workspace",
      state: "success",
      startedAt: "2026-03-19T12:00:00.000Z",
      finishedAt: "2026-03-19T12:00:00.008Z",
      durationMs: 8,
      delivery: "bootstrap_api",
      source: "db",
    },
  });
});

test("data explorer page uses bootstrap workspace helper for first render", async () => {
  const page = await DataExplorerPage();
  render(page);

  expect(mockGetDataExplorerBootstrapWorkspace).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId("data-explorer-workspace")).toBeInTheDocument();
  expect(mockWorkspaceProps).toHaveBeenCalledWith(
    expect.objectContaining({
      data: dataExplorerWorkspaceData,
      initialMeta: expect.objectContaining({
        delivery: "bootstrap_api",
        source: "db",
      }),
    }),
  );
});
