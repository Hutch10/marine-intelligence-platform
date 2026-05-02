import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { GET } from "./route";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

test("similar investigations proxy returns 503 when the API origin is not configured", async () => {
  const response = await GET(
    new Request("http://localhost/api/marine-intelligence/investigations/similar?id=TRK-201"),
  );

  expect(response.status).toBe(503);
  await expect(response.json()).resolves.toEqual({
    message: "Similarity service origin is not configured.",
  });
});

test("similar investigations proxy forwards the request to the API service", async () => {
  vi.stubEnv("MARINE_API_BASE_URL", "https://api.marine.test");
  vi.stubEnv("MARINE_INTERNAL_API_KEY", "mk_internal_web_proxy");
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({
        investigations: [
          {
            investigationId: "TRK-187",
            title: "Chlorophyll suppression overlap",
            summary: "Matched event.",
            similarity: 0.77,
            embeddingSimilarity: 0.64,
            matchedOn: ["title", "summary"],
            matchedStation: "46042",
            severity: "medium",
            timeframeLabel: "2 weeks ago",
            indexedAt: "2026-03-08T12:00:00.000Z",
          },
        ],
        queryId: "TRK-201",
        generatedAt: "2026-03-22T12:00:00.000Z",
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    ),
  );

  const response = await GET(
    new Request(
      "http://localhost/api/marine-intelligence/investigations/similar?id=TRK-201&k=3&stationId=46042&windowDays=30",
    ),
  );

  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0]?.[0].toString()).toBe(
    "https://api.marine.test/investigations/similar?id=TRK-201&k=3&stationId=46042&windowDays=30",
  );
  const requestInit = fetchMock.mock.calls[0]?.[1] as RequestInit;
  const headers = new Headers(requestInit.headers as HeadersInit);
  expect(headers.get("X-API-Key")).toBe("mk_internal_web_proxy");
  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toMatchObject({
    queryId: "TRK-201",
    investigations: [
      expect.objectContaining({
        investigationId: "TRK-187",
        similarity: 0.77,
      }),
    ],
  });
});
