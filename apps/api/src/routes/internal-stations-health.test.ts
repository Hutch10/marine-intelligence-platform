import test from "node:test";
import assert from "node:assert/strict";
import { buildInternalStationsHealthRouteResponse } from "./internal-stations-health";
import type { LiveIngestionLatestStatusReadResult } from "../repositories/live-ingestion-reports";

test("internal stations health route exposes per-station ingestion diagnostics", () => {
  const response = buildInternalStationsHealthRouteResponse({
    source: "db",
    latest: [
      {
        source: "noaa_ndbc",
        workerRunId: "LWR-1",
        workerStatus: "partial",
        status: "partial",
        startedAt: "2026-03-25T11:58:00.000Z",
        completedAt: "2026-03-25T12:00:00.000Z",
        durationMs: 120000,
        insertedCount: 9,
        rejectedCount: 2,
        rejectionReasons: {
          transient_failure: 1,
          timestamp_stale: 1,
        },
        runId: "ING-NDBC-1",
        error: null,
        stationDiagnostics: [
          {
            stationId: "41010",
            status: "failed",
            lastSuccessfulIngestionAt: null,
            latestObservationTimestamp: null,
            latestObservationAgeMs: null,
            usableMetricCoverage: {
              presentCount: 0,
              totalCount: 4,
              metricsPresent: [],
            },
            missingFieldRates: {
              seaSurfaceTempC: 1,
              waveHeightM: 1,
              windSpeedMps: 1,
              pressureHpa: 1,
            },
            rejectionBreakdown: {
              transient_failure: 1,
            },
            lastFetchUrl: "https://fallback.example/41010.txt",
          },
          {
            stationId: "41009",
            status: "healthy",
            lastSuccessfulIngestionAt: "2026-03-25T12:00:00.000Z",
            latestObservationTimestamp: "2026-03-25T11:50:00.000Z",
            latestObservationAgeMs: 600000,
            usableMetricCoverage: {
              presentCount: 4,
              totalCount: 4,
              metricsPresent: ["seaSurfaceTempC", "waveHeightM", "windSpeedMps", "pressureHpa"],
            },
            missingFieldRates: {
              seaSurfaceTempC: 0.1,
              waveHeightM: 0.2,
              windSpeedMps: 0,
              pressureHpa: 0,
            },
            rejectionBreakdown: {},
            lastFetchUrl: "https://www.ndbc.noaa.gov/data/realtime2/41009.txt",
          },
        ],
      },
    ],
  } satisfies LiveIngestionLatestStatusReadResult);

  assert.equal(response.status, 200);
  assert.equal(response.json.source, "db");
  assert.equal(response.json.stations.length, 2);
  assert.equal(response.json.stations[0]?.station_id, "41010");
  assert.equal(response.json.stations[0]?.status, "failed");
  assert.equal(response.json.stations[1]?.station_id, "41009");
  assert.equal(response.json.stations[1]?.usable_metric_coverage.present_count, 4);
  assert.equal(response.json.stations[1]?.missing_field_rates.sea_surface_temp_c, 0.1);
});

test("internal stations health route returns unavailable fallback safely", () => {
  const response = buildInternalStationsHealthRouteResponse({
    source: "unavailable",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.source, "unavailable");
  assert.equal(response.json.fallback_reason, "db_path_missing");
  assert.deepEqual(response.json.stations, []);
});
