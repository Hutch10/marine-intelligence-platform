import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateThresholdAlert,
  evaluateTrendSignal,
  evaluateContextualSignal,
} from "./marine-event-detection";

const BASE_LINEAGE = {
  source: "crw",
  sourceRecordId: "rec-001",
  ingestionRunId: "run-001",
  observedAt: "2026-03-20T10:00:00.000Z",
  ingestedAt: "2026-03-20T10:05:00.000Z",
} as const;

test("evaluateThresholdAlert returns null when deviation is below 1.0 degrees", () => {
  const result = evaluateThresholdAlert({
    stationId: "STA-001",
    region: "North Pacific",
    observedValue: 28.5,
    baselineValue: 27.8,
    ...BASE_LINEAGE,
  });
  assert.equal(result, null);
});

test("evaluateThresholdAlert returns high severity for deviation between 1.0 and 2.0 degrees", () => {
  const result = evaluateThresholdAlert({
    stationId: "STA-001",
    region: "North Pacific",
    observedValue: 29.3,
    baselineValue: 27.8,
    ...BASE_LINEAGE,
  });
  assert.notEqual(result, null);
  assert.equal(result!.eventClass, "threshold_alert");
  assert.equal(result!.severity, "high");
  assert.equal(result!.ontologyTermId, "mdl.threshold_alert");
  assert.equal(result!.status, "detected");
  assert.ok(result!.confidence >= 50 && result!.confidence <= 69);
  assert.equal(result!.lineage.source, "crw");
  assert.equal(result!.detectedAt, BASE_LINEAGE.ingestedAt);
});

test("evaluateThresholdAlert returns critical severity and higher confidence for deviation above 2.0 degrees", () => {
  const result = evaluateThresholdAlert({
    stationId: "STA-001",
    region: "Coral Sea",
    observedValue: 31.5,
    baselineValue: 29.0,
    ...BASE_LINEAGE,
  });
  assert.notEqual(result, null);
  assert.equal(result!.severity, "critical");
  assert.ok(result!.confidence >= 70 && result!.confidence <= 100);
});

test("evaluateTrendSignal returns null when fewer than 3 observations are provided", () => {
  const result = evaluateTrendSignal({
    stationId: "STA-001",
    region: "North Pacific",
    observations: [
      { value: 28.0, observedAt: "2026-03-20T08:00:00.000Z" },
      { value: 28.5, observedAt: "2026-03-20T09:00:00.000Z" },
    ],
    source: "ndbc",
    sourceRecordId: "rec-trend-001",
    ingestionRunId: "run-001",
    ingestedAt: "2026-03-20T10:05:00.000Z",
  });
  assert.equal(result, null);
});

test("evaluateTrendSignal returns high severity when rate exceeds 0.2 degrees per hour", () => {
  // rate = (28.8 - 28.0) / 3 hr = 0.267 degrees/hr → high
  const result = evaluateTrendSignal({
    stationId: "STA-001",
    region: "Coral Sea",
    observations: [
      { value: 28.0, observedAt: "2026-03-20T07:00:00.000Z" },
      { value: 28.2, observedAt: "2026-03-20T08:00:00.000Z" },
      { value: 28.8, observedAt: "2026-03-20T10:00:00.000Z" },
    ],
    source: "ndbc",
    sourceRecordId: "rec-trend-002",
    ingestionRunId: "run-001",
    ingestedAt: "2026-03-20T10:05:00.000Z",
  });
  assert.notEqual(result, null);
  assert.equal(result!.severity, "high");
  assert.equal(result!.eventClass, "trend_signal");
  assert.equal(result!.ontologyTermId, "mdl.trend_signal");
  assert.ok(result!.confidence <= 90);
});

test("evaluateTrendSignal returns medium severity when rate is between 0.1 and 0.2 degrees per hour", () => {
  // rate = (28.4 - 28.0) / 3 hr = 0.133 degrees/hr → medium
  const result = evaluateTrendSignal({
    stationId: "STA-002",
    region: "North Pacific",
    observations: [
      { value: 28.0, observedAt: "2026-03-20T07:00:00.000Z" },
      { value: 28.2, observedAt: "2026-03-20T09:00:00.000Z" },
      { value: 28.4, observedAt: "2026-03-20T10:00:00.000Z" },
    ],
    source: "ndbc",
    sourceRecordId: "rec-trend-003",
    ingestionRunId: "run-001",
    ingestedAt: "2026-03-20T10:05:00.000Z",
  });
  assert.notEqual(result, null);
  assert.equal(result!.severity, "medium");
});

test("evaluateContextualSignal returns null when hotspot is zero or negative", () => {
  const result = evaluateContextualSignal({
    stationId: "STA-001",
    region: "Great Barrier Reef",
    hotspotValue: 0,
    dhwValue: 6,
    ...BASE_LINEAGE,
  });
  assert.equal(result, null);
});

test("evaluateContextualSignal returns null when dhw is below 4", () => {
  const result = evaluateContextualSignal({
    stationId: "STA-001",
    region: "Great Barrier Reef",
    hotspotValue: 1.5,
    dhwValue: 3.9,
    ...BASE_LINEAGE,
  });
  assert.equal(result, null);
});

test("evaluateContextualSignal returns critical severity when hotspot above 1 and dhw at or above 8", () => {
  const result = evaluateContextualSignal({
    stationId: "STA-001",
    region: "Great Barrier Reef",
    hotspotValue: 1.5,
    dhwValue: 9.2,
    ...BASE_LINEAGE,
  });
  assert.notEqual(result, null);
  assert.equal(result!.severity, "critical");
  assert.equal(result!.eventClass, "contextual_signal");
  assert.equal(result!.ontologyTermId, "mdl.contextual_signal");
  assert.ok(result!.confidence <= 95);
});

test("evaluateContextualSignal returns high severity when hotspot is positive but criteria do not reach critical", () => {
  const result = evaluateContextualSignal({
    stationId: "STA-001",
    region: "Great Barrier Reef",
    hotspotValue: 0.8,
    dhwValue: 5.0,
    ...BASE_LINEAGE,
  });
  assert.notEqual(result, null);
  assert.equal(result!.severity, "high");
});
