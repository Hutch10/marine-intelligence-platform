import { beforeEach, expect, test, vi } from "vitest";
import { dataExplorerWorkspaceData } from "@/lib/api/mock-data";
import { getDataExplorerBootstrapWorkspace } from "@/lib/api/data-explorer-bootstrap";

const { mockHeaders, mockApiClient } = vi.hoisted(() => ({
  mockHeaders: vi.fn(),
  mockApiClient: {
    dataExplorer: {
      getWorkspace: vi.fn(),
    },
  },
}));

vi.mock("next/headers", () => ({
  headers: mockHeaders,
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

beforeEach(() => {
  mockHeaders.mockReset();
  mockApiClient.dataExplorer.getWorkspace.mockReset();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test("bootstrap workspace fetch uses absolute API boundary when request origin is available", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(dataExplorerWorkspaceData), {
      status: 200,
      headers: {
        "x-marine-data-source": "db",
      },
    }),
  );

  vi.stubGlobal("fetch", fetchMock);
  mockHeaders.mockReturnValue(new Headers({
    host: "marine.local:3000",
    "x-forwarded-proto": "http",
  }));

  const result = await getDataExplorerBootstrapWorkspace();

  expect(fetchMock).toHaveBeenCalledWith(
    "http://marine.local:3000/api/data-explorer",
    expect.objectContaining({
      method: "GET",
      cache: "no-store",
    }),
  );
  expect(mockApiClient.dataExplorer.getWorkspace).not.toHaveBeenCalled();
  expect(result.meta.delivery).toBe("bootstrap_api");
  expect(result.meta.source).toBe("db");
  expect(result.data.datasets).toEqual(dataExplorerWorkspaceData.datasets);
});

test("bootstrap workspace falls back to in-process path when boundary fetch fails", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("network unavailable"));

  vi.stubGlobal("fetch", fetchMock);
  mockHeaders.mockReturnValue(new Headers({
    host: "marine.local:3000",
    "x-forwarded-proto": "http",
  }));
  mockApiClient.dataExplorer.getWorkspace.mockResolvedValue({
    data: dataExplorerWorkspaceData,
    meta: {
      section: "workspace",
      state: "success",
      startedAt: "2026-03-19T10:00:00.000Z",
      finishedAt: "2026-03-19T10:00:00.005Z",
      durationMs: 5,
      delivery: "in_process",
      source: "db",
    },
  });

  const result = await getDataExplorerBootstrapWorkspace();

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(mockApiClient.dataExplorer.getWorkspace).toHaveBeenCalledTimes(1);
  expect(result.meta.delivery).toBe("in_process");
  expect(result.data.datasets).toEqual(dataExplorerWorkspaceData.datasets);
});

test("bootstrap workspace prefers NEXT_PUBLIC_APP_URL when configured", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify(dataExplorerWorkspaceData), { status: 200 }),
  );

  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://marine.example.com/");
  mockHeaders.mockReturnValue(new Headers({
    host: "marine.local:3000",
    "x-forwarded-proto": "http",
  }));

  await getDataExplorerBootstrapWorkspace();

  expect(fetchMock).toHaveBeenCalledWith(
    "https://marine.example.com/api/data-explorer",
    expect.any(Object),
  );
});
