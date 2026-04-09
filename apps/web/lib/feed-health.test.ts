/**
 * Unit tests for getFeedHealth() status computation.
 *
 * Mocks buildFeedHealthRouteResponse so no DB is needed.
 * Tests cover: DB unavailable, all-live, stale, failed by age,
 * failed by run status, failed by error field, and missing source entries.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { getFeedHealth } from "@/lib/feed-health";

const { mockBuildFeedHealthRouteResponse } = vi.hoisted(() => ({
  mockBuildFeedHealthRouteResponse: vi.fn(),
}));

vi.mock("../../api/src/routes/feed-health", () => ({
  buildFeedHealthRouteResponse: mockBuildFeedHealthRouteResponse,
}));

const NOW = Date.parse("2026-03-27T12:00:00.000Z");
const HOUR_MS = 60 * 60 * 1000;

function makeTimestamp(hoursAgo: number): string {
  return new Date(NOW - hoursAgo * HOUR_MS).toISOString();
}

function makeSourceEntry(source: string, completedAt: string, status = "success", error: string | null = null) {
  return {
    source,
    worker_run_id: "LWR-001",
    worker_status: "completed",
    status,
    started_at: completedAt,
    completed_at: completedAt,
    duration_ms: 1000,
    inserted_count: 10,
    rejected_count: 0,
    rejection_reasons: {},
    run_id: null,
    error,
    is_stale: false,
    stale_by_ms: null,
    station_diagnostics: [],
  };
}

function makeDbResponse(sources: ReturnType<typeof makeSourceEntry>[]) {
  return {
    status: 200,
    json: {
      source: "db" as const,
      fallback_reason: null,
      generated_at: new Date(NOW).toISOString(),
      stale_after_ms: 6 * HOUR_MS,
      summary: {
        latest_source_count: sources.length,
        healthy_source_count: sources.length,
        degraded_source_count: 0,
        failed_source_count: 0,
        stale_source_count: 0,
        inserted_count: 10,
        rejected_count: 0,
        recent_history_count: 0,
        last_completed_at: null,
      },
      latest_status_by_source: sources,
      recent_history: [],
    },
    telemetry: {
      route: "GET /feed-health" as const,
      source: "db" as const,
      latestSourceCount: sources.length,
      historyCount: 0,
      staleSourceCount: 0,
    },
  };
}

function makeUnavailableResponse() {
  return {
    status: 200,
    json: {
      source: "unavailable" as const,
      fallback_reason: "db_path_missing" as const,
      generated_at: new Date(NOW).toISOString(),
      stale_after_ms: 6 * HOUR_MS,
      summary: {
        latest_source_count: 0,
        healthy_source_count: 0,
        degraded_source_count: 0,
        failed_source_count: 0,
        stale_source_count: 0,
        inserted_count: 0,
        rejected_count: 0,
        recent_history_count: 0,
        last_completed_at: null,
      },
      latest_status_by_source: [],
      recent_history: [],
    },
    telemetry: {
      route: "GET /feed-health" as const,
      source: "unavailable" as const,
      latestSourceCount: 0,
      historyCount: 0,
      staleSourceCount: 0,
      fallbackReason: "db_path_missing" as const,
    },
  };
}

beforeEach(() => {
  mockBuildFeedHealthRouteResponse.mockReset();
  vi.setSystemTime(NOW);
});

describe("getFeedHealth — DB unavailable", () => {
  test("returns unknown for both sources when DB is not available", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(makeUnavailableResponse());

    const result = getFeedHealth();

    expect(result.dbAvailable).toBe(false);
    expect(result.ndbc.status).toBe("unknown");
    expect(result.crw.status).toBe("unknown");
    expect(result.overallStatus).toBe("unknown");
    expect(result.ndbc.lastIngestedAt).toBeNull();
    expect(result.crw.lastIngestedAt).toBeNull();
  });
});

describe("getFeedHealth — live status", () => {
  test("returns live when both sources completed within 8 hours", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([
        makeSourceEntry("ndbc", makeTimestamp(1)),
        makeSourceEntry("crw", makeTimestamp(3)),
      ]),
    );

    const result = getFeedHealth();

    expect(result.ndbc.status).toBe("live");
    expect(result.crw.status).toBe("live");
    expect(result.overallStatus).toBe("live");
    expect(result.ndbc.ageLabel).toBe("1h ago");
    expect(result.crw.ageLabel).toBe("3h ago");
  });

  test("returns live at exactly the boundary (7h 59m)", () => {
    const almostStale = new Date(NOW - (8 * HOUR_MS - 60 * 1000)).toISOString();
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([makeSourceEntry("ndbc", almostStale), makeSourceEntry("crw", almostStale)]),
    );

    const result = getFeedHealth();
    expect(result.ndbc.status).toBe("live");
    expect(result.crw.status).toBe("live");
  });
});

describe("getFeedHealth — stale status", () => {
  test("returns stale when source is 8–24 hours old", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([
        makeSourceEntry("ndbc", makeTimestamp(10)),
        makeSourceEntry("crw", makeTimestamp(3)),
      ]),
    );

    const result = getFeedHealth();

    expect(result.ndbc.status).toBe("stale");
    expect(result.crw.status).toBe("live");
    expect(result.overallStatus).toBe("stale");
    expect(result.ndbc.ageLabel).toBe("10h ago");
  });
});

describe("getFeedHealth — failed status", () => {
  test("returns failed when source is older than 24 hours", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([
        makeSourceEntry("ndbc", makeTimestamp(30)),
        makeSourceEntry("crw", makeTimestamp(3)),
      ]),
    );

    const result = getFeedHealth();

    expect(result.ndbc.status).toBe("failed");
    expect(result.crw.status).toBe("live");
    expect(result.overallStatus).toBe("failed");
  });

  test("returns failed when run status is 'failed' regardless of timestamp age", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([
        makeSourceEntry("ndbc", makeTimestamp(1), "failed"),
        makeSourceEntry("crw", makeTimestamp(1)),
      ]),
    );

    const result = getFeedHealth();

    expect(result.ndbc.status).toBe("failed");
    expect(result.crw.status).toBe("live");
  });

  test("returns failed when error field is non-null regardless of timestamp age", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([
        makeSourceEntry("ndbc", makeTimestamp(1), "success", "fetch timeout"),
        makeSourceEntry("crw", makeTimestamp(1)),
      ]),
    );

    const result = getFeedHealth();

    expect(result.ndbc.status).toBe("failed");
    expect(result.crw.status).toBe("live");
  });
});

describe("getFeedHealth — missing source entries", () => {
  test("returns unknown for a source with no ingestion history when DB is available", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([makeSourceEntry("crw", makeTimestamp(2))]),
    );

    const result = getFeedHealth();

    expect(result.dbAvailable).toBe(true);
    expect(result.ndbc.status).toBe("unknown");
    expect(result.crw.status).toBe("live");
    expect(result.overallStatus).toBe("unknown");
  });

  test("returns unknown for both sources when latest_status_by_source is empty", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(makeDbResponse([]));

    const result = getFeedHealth();

    expect(result.dbAvailable).toBe(true);
    expect(result.ndbc.status).toBe("unknown");
    expect(result.crw.status).toBe("unknown");
    expect(result.overallStatus).toBe("unknown");
  });
});

describe("getFeedHealth — overallStatus worst-case propagation", () => {
  test("overallStatus is failed when one source failed and other is live", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([
        makeSourceEntry("ndbc", makeTimestamp(30)),
        makeSourceEntry("crw", makeTimestamp(2)),
      ]),
    );

    const result = getFeedHealth();
    expect(result.overallStatus).toBe("failed");
  });

  test("overallStatus is unknown when one source is unknown and other is live", () => {
    mockBuildFeedHealthRouteResponse.mockReturnValue(
      makeDbResponse([makeSourceEntry("crw", makeTimestamp(2))]),
    );

    const result = getFeedHealth();
    expect(result.overallStatus).toBe("unknown");
  });
});
