import test from "node:test";
import assert from "node:assert/strict";
import { scientificExportToCsv } from "./scientific-export";

test("scientific export CSV includes provenance and temporal audit columns", () => {
  const csv = scientificExportToCsv([
    {
      observationId: "OBS-noaa_ndbc-46042-1",
      provenanceId: "PRV-1",
      stationId: "46042",
      source: "noaa_ndbc",
      anchorObservedAt: "2026-06-03T12:00:00.000Z",
      seaTempObservedAt: "2026-06-03T11:00:00.000Z",
      waveHeightObservedAt: "2026-06-03T10:00:00.000Z",
      windObservedAt: "2026-06-03T12:00:00.000Z",
      pressureObservedAt: "2026-06-03T12:00:00.000Z",
      ingestionObservedAt: "2026-06-03T12:05:00.000Z",
      sourceTimestamp: "2026-06-03T12:00:00.000Z",
      sourceReference: "https://example.test/46042.txt",
      metricsConcurrent: false,
      seaSurfaceTempBackfilled: true,
      waveHeightBackfilled: true,
      freshnessClassification: "live",
      syncStatus: "synced",
      confidenceAdjustment: "downrank_non_concurrent_backfill",
      seaSurfaceTempC: 24.1,
      waveHeightM: 1.2,
      windSpeedMps: 5.1,
      pressureHpa: 1012.3,
    },
  ]);

  assert.match(csv, /provenanceId/);
  assert.match(csv, /seaTempObservedAt/);
  assert.match(csv, /confidenceAdjustment/);
  assert.match(csv, /downrank_non_concurrent_backfill/);
});
