import test from "node:test";
import assert from "node:assert/strict";
import { buildEcologicalCorrelationReasons } from "./ecological-correlation";
import type { EcologicalCorrelationInput } from "./ecological-correlation";

const EMPTY_INPUT: EcologicalCorrelationInput = {
  recentSightingCount: 0,
  recentMovementSignalCount: 0,
  topMovementTypes: [],
  maxMovementConfidence: 0,
  windowDays: 14,
};

test("buildEcologicalCorrelationReasons returns empty array when no thresholds met", () => {
  const reasons = buildEcologicalCorrelationReasons(EMPTY_INPUT);
  assert.deepEqual(reasons, []);
});

test("increased_sighting_rate fires when recentSightingCount is exactly 3", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    recentSightingCount: 3,
  });
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.kind, "increased_sighting_rate");
  assert.ok(reasons[0]?.label.includes("3 sightings"));
  assert.ok(reasons[0]?.label.includes("14 days"));
});

test("increased_sighting_rate does not fire when recentSightingCount is 2", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    recentSightingCount: 2,
  });
  assert.equal(reasons.length, 0);
});

test("feeding_aggregation_detected fires when aggregation_shift is in topMovementTypes", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    topMovementTypes: ["aggregation_shift"],
  });
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.kind, "feeding_aggregation_detected");
});

test("feeding_aggregation_detected does not fire without aggregation_shift", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    topMovementTypes: ["habitat_exit", "unusual_presence"],
  });
  assert.equal(reasons.length, 0);
});

test("migration_shift_detected fires when route_deviation is present", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    topMovementTypes: ["route_deviation"],
  });
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.kind, "migration_shift_detected");
  assert.ok(reasons[0]?.label.includes("route deviation"));
});

test("migration_shift_detected fires when seasonal_mismatch is present", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    topMovementTypes: ["seasonal_mismatch"],
  });
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.kind, "migration_shift_detected");
  assert.ok(reasons[0]?.label.includes("seasonal mismatch"));
});

test("migration_shift_detected label prefers route_deviation when both types present", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    topMovementTypes: ["route_deviation", "seasonal_mismatch"],
  });
  const migrationReason = reasons.find((r) => r.kind === "migration_shift_detected");
  assert.ok(migrationReason);
  assert.ok(migrationReason.label.includes("route deviation"));
});

test("migration_shift_detected does not fire for habitat_exit or unusual_presence", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    topMovementTypes: ["habitat_exit", "unusual_presence"],
  });
  assert.ok(reasons.every((r) => r.kind !== "migration_shift_detected"));
});

test("species_anomaly_window_overlap fires when recentMovementSignalCount is exactly 2", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    recentMovementSignalCount: 2,
  });
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.kind, "species_anomaly_window_overlap");
  assert.ok(reasons[0]?.label.includes("2 movement signals"));
});

test("species_anomaly_window_overlap does not fire when count is 1", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    recentMovementSignalCount: 1,
  });
  assert.equal(reasons.length, 0);
});

test("elevated_movement_confidence fires when maxMovementConfidence is exactly 70", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    maxMovementConfidence: 70,
  });
  assert.equal(reasons.length, 1);
  assert.equal(reasons[0]?.kind, "elevated_movement_confidence");
  assert.ok(reasons[0]?.label.includes("70%"));
});

test("elevated_movement_confidence does not fire when confidence is 69", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    maxMovementConfidence: 69,
  });
  assert.equal(reasons.length, 0);
});

test("all five reasons generated when all thresholds are met simultaneously", () => {
  const reasons = buildEcologicalCorrelationReasons({
    recentSightingCount: 5,
    recentMovementSignalCount: 3,
    topMovementTypes: ["route_deviation", "aggregation_shift"],
    maxMovementConfidence: 85,
    windowDays: 14,
  });

  assert.equal(reasons.length, 5);

  const kinds = reasons.map((r) => r.kind);
  assert.ok(kinds.includes("increased_sighting_rate"));
  assert.ok(kinds.includes("feeding_aggregation_detected"));
  assert.ok(kinds.includes("migration_shift_detected"));
  assert.ok(kinds.includes("species_anomaly_window_overlap"));
  assert.ok(kinds.includes("elevated_movement_confidence"));
});

test("rules fire in a fixed, auditable sequence", () => {
  const reasons = buildEcologicalCorrelationReasons({
    recentSightingCount: 5,
    recentMovementSignalCount: 3,
    topMovementTypes: ["route_deviation", "aggregation_shift"],
    maxMovementConfidence: 85,
    windowDays: 14,
  });

  const kinds = reasons.map((r) => r.kind);
  assert.deepEqual(kinds, [
    "increased_sighting_rate",
    "feeding_aggregation_detected",
    "migration_shift_detected",
    "species_anomaly_window_overlap",
    "elevated_movement_confidence",
  ]);
});

test("each reason has non-empty label and detail", () => {
  const reasons = buildEcologicalCorrelationReasons({
    recentSightingCount: 5,
    recentMovementSignalCount: 3,
    topMovementTypes: ["route_deviation", "aggregation_shift"],
    maxMovementConfidence: 85,
    windowDays: 7,
  });

  for (const reason of reasons) {
    assert.ok(reason.label.length > 0, `Expected non-empty label for ${reason.kind}`);
    assert.ok(reason.detail.length > 0, `Expected non-empty detail for ${reason.kind}`);
  }
});

test("windowDays is reflected in increased_sighting_rate label", () => {
  const reasons = buildEcologicalCorrelationReasons({
    ...EMPTY_INPUT,
    recentSightingCount: 10,
    windowDays: 7,
  });

  const reason = reasons.find((r) => r.kind === "increased_sighting_rate");
  assert.ok(reason?.label.includes("7 days"));
});
