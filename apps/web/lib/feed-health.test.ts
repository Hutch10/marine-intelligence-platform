/**
 * Unit tests for getFeedHealth() status computation.
 *
 * Mocks buildFeedHealthRouteResponse so no DB is needed.
 * Tests cover: DB unavailable, all-live, stale, failed by age,
 * failed by run status, failed by error field, and missing source entries.
 */
import { describe, test, expect, vi, beforeEach } from "vitest";
import { getFeedHealth, getFeedHealthDiagnostics } from "@/lib/feed-health";

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
  test("returns unknown for both sources when DB is not available", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(makeUnavailableResponse());

    const result = await getFeedHealth();

    expect(result.dbAvailable).toBe(false);
    expect(result.ndbc.status).toBe("unknown");
    expect(result.crw.status).toBe("unknown");
    expect(result.ioos.status).toBe("unknown");
    expect(result.erddap.status).toBe("unknown");
    expect(result.overallStatus).toBe("unknown");
    expect(result.ndbc.lastIngestedAt).toBeNull();
    expect(result.crw.lastIngestedAt).toBeNull();
    expect(result.ioos.lastIngestedAt).toBeNull();
    expect(result.erddap.lastIngestedAt).toBeNull();
  });
});

describe("getFeedHealth — live status", () => {
  test("returns live when all sources completed within 8 hours", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(1)),
        makeSourceEntry("crw", makeTimestamp(3)),
        makeSourceEntry("ioos_regional", makeTimestamp(2)),
        makeSourceEntry("ioos_erddap", makeTimestamp(4)),
      ]),
    );

    const result = await getFeedHealth();

    expect(result.ndbc.status).toBe("live");
    expect(result.crw.status).toBe("live");
    expect(result.ioos.status).toBe("live");
    expect(result.erddap.status).toBe("live");
    expect(result.overallStatus).toBe("live");
    expect(result.ndbc.ageLabel).toBe("1h ago");
    expect(result.crw.ageLabel).toBe("3h ago");
    expect(result.ioos.ageLabel).toBe("2h ago");
    expect(result.erddap.ageLabel).toBe("4h ago");
  });

  test("returns live at exactly the boundary (7h 59m)", async () => {
    const almostStale = new Date(NOW - (8 * HOUR_MS - 60 * 1000)).toISOString();
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", almostStale),
        makeSourceEntry("crw", almostStale),
        makeSourceEntry("ioos_regional", almostStale),
        makeSourceEntry("ioos_erddap", almostStale),
      ]),
    );

    const result = await getFeedHealth();
    expect(result.ndbc.status).toBe("live");
    expect(result.crw.status).toBe("live");
    expect(result.ioos.status).toBe("live");
    expect(result.erddap.status).toBe("live");
  });
});

describe("getFeedHealth — stale status", () => {
  test("returns stale when ERDDAP source is 8–24 hours old", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(1)),
        makeSourceEntry("crw", makeTimestamp(3)),
        makeSourceEntry("ioos_regional", makeTimestamp(2)),
        makeSourceEntry("ioos_erddap", makeTimestamp(10)),
      ]),
    );

    const result = await getFeedHealth();

    expect(result.erddap.status).toBe("stale");
    expect(result.ndbc.status).toBe("live");
    expect(result.crw.status).toBe("live");
    expect(result.ioos.status).toBe("live");
    expect(result.overallStatus).toBe("stale");
    expect(result.erddap.ageLabel).toBe("10h ago");
  });
});

describe("getFeedHealth — failed status", () => {
  test("returns failed when IOOS source is older than 24 hours", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(1)),
        makeSourceEntry("crw", makeTimestamp(3)),
        makeSourceEntry("ioos_regional", makeTimestamp(30)),
        makeSourceEntry("ioos_erddap", makeTimestamp(4)),
      ]),
    );

    const result = await getFeedHealth();

    expect(result.ioos.status).toBe("failed");
    expect(result.crw.status).toBe("live");
    expect(result.ndbc.status).toBe("live");
    expect(result.erddap.status).toBe("live");
    expect(result.overallStatus).toBe("failed");
  });

  test("returns failed when run status is 'failed' regardless of timestamp age", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(1), "failed"),
        makeSourceEntry("crw", makeTimestamp(1)),
        makeSourceEntry("ioos_regional", makeTimestamp(1)),
        makeSourceEntry("ioos_erddap", makeTimestamp(1)),
      ]),
    );

    const result = await getFeedHealth();

    expect(result.ndbc.status).toBe("failed");
    expect(result.crw.status).toBe("live");
  });

  test("returns failed when error field is non-null regardless of timestamp age", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(1), "success", "fetch timeout"),
        makeSourceEntry("crw", makeTimestamp(1)),
        makeSourceEntry("ioos_regional", makeTimestamp(1)),
        makeSourceEntry("ioos_erddap", makeTimestamp(1)),
      ]),
    );

    const result = await getFeedHealth();

    expect(result.ndbc.status).toBe("failed");
    expect(result.crw.status).toBe("live");
  });
});

describe("getFeedHealth — missing source entries", () => {
  test("returns unknown for a source with no ingestion history when DB is available", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(2)),
        makeSourceEntry("crw", makeTimestamp(2)),
        makeSourceEntry("ioos_erddap", makeTimestamp(2)),
      ]),
    );

    const result = await getFeedHealth();

    expect(result.dbAvailable).toBe(true);
    expect(result.ndbc.status).toBe("live");
    expect(result.crw.status).toBe("live");
    expect(result.erddap.status).toBe("live");
    expect(result.ioos.status).toBe("unknown");
    expect(result.overallStatus).toBe("unknown");
  });

  test("returns unknown for both sources when latest_status_by_source is empty", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(makeDbResponse([]));

    const result = await getFeedHealth();

    expect(result.dbAvailable).toBe(true);
    expect(result.ndbc.status).toBe("unknown");
    expect(result.crw.status).toBe("unknown");
    expect(result.ioos.status).toBe("unknown");
    expect(result.erddap.status).toBe("unknown");
    expect(result.overallStatus).toBe("unknown");
  });
});

describe("getFeedHealth — never-ran source", () => {
  test("returns honest no-data-yet state for ERDDAP when never run", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(1)),
        makeSourceEntry("crw", makeTimestamp(1)),
        makeSourceEntry("ioos_regional", makeTimestamp(1)),
      ]),
    );

    const result = await getFeedHealth();

    expect(result.erddap.status).toBe("unknown");
    expect(result.erddap.lastIngestedAt).toBeNull();
    expect(result.erddap.ageLabel).toBeNull();
  });
});

describe("getFeedHealth — overallStatus worst-case propagation", () => {
  test("overallStatus is failed when one source failed and other is live", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(30)),
        makeSourceEntry("crw", makeTimestamp(2)),
        makeSourceEntry("ioos_regional", makeTimestamp(2)),
        makeSourceEntry("ioos_erddap", makeTimestamp(2)),
      ]),
    );

    const result = await getFeedHealth();
    expect(result.overallStatus).toBe("failed");
  });

  test("overallStatus is unknown when one source is unknown and other is live", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        makeSourceEntry("noaa_ndbc", makeTimestamp(2)),
        makeSourceEntry("crw", makeTimestamp(2)),
        makeSourceEntry("ioos_regional", makeTimestamp(2)),
      ]),
    );

    const result = await getFeedHealth();
    expect(result.overallStatus).toBe("unknown");
  });
});

describe("getFeedHealthDiagnostics", () => {
  test("returns empty diagnostics when feed-health source is unavailable", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(makeUnavailableResponse());

    const result = await getFeedHealthDiagnostics();

    expect(result).toEqual([]);
  });

  test("maps per-station rejection reasons into failure counts and reason category", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        {
          ...makeSourceEntry("noaa_ndbc", makeTimestamp(2)),
          station_diagnostics: [
            {
              station_id: "41009",
              status: "degraded",
              last_successful_ingestion_at: "2026-03-27T10:00:00.000Z",
              latest_observation_timestamp: "2026-03-27T09:55:00.000Z",
              latest_observation_age_ms: 300000,
              usable_metric_coverage: {
                present_count: 4,
                total_count: 4,
                metrics_present: ["seaSurfaceTempC", "waveHeightM", "windSpeedMps", "pressureHpa"],
              },
              missing_field_rates: {
                sea_surface_temp_c: 0,
                wave_height_m: 0,
                wind_speed_mps: 0,
                pressure_hpa: 0,
              },
              rejection_breakdown: {
                transient_failure: 2,
                timestamp_stale: 1,
              },
              last_fetch_url: "https://www.ndbc.noaa.gov/data/realtime2/41009.txt",
            },
          ],
        },
      ]),
    );

    const result = await getFeedHealthDiagnostics();

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      source: "ndbc",
      sourceLabel: "NDBC",
      stationId: "41009",
      failureCount: 3,
      parseFailureCount: 2,
      validationFailureCount: 1,
      reasonCategory: "mixed",
      lastFailureAt: expect.any(String),
    });
  });

  test("does not emit diagnostics rows when there are no station rejection counts", async () => {
    mockBuildFeedHealthRouteResponse.mockResolvedValue(
      makeDbResponse([
        {
          ...makeSourceEntry("ioos_regional", makeTimestamp(1)),
          station_diagnostics: [
            {
              station_id: "NDBC-TEST",
              status: "healthy",
              last_successful_ingestion_at: "2026-03-27T11:00:00.000Z",
              latest_observation_timestamp: "2026-03-27T10:55:00.000Z",
              latest_observation_age_ms: 300000,
              usable_metric_coverage: {
                present_count: 4,
                total_count: 4,
                metrics_present: ["seaSurfaceTempC", "waveHeightM", "windSpeedMps", "pressureHpa"],
              },
              missing_field_rates: {
                sea_surface_temp_c: 0,
                wave_height_m: 0,
                wind_speed_mps: 0,
                pressure_hpa: 0,
              },
              rejection_breakdown: {},
              last_fetch_url: null,
            },
          ],
        },
      ]),
    );

    const result = await getFeedHealthDiagnostics();

    expect(result).toEqual([]);
  });
});
