import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveConditionsRouteResponse } from "./live-conditions";

test("live-conditions route returns db-backed conditions", () => {
  const response = buildLiveConditionsRouteResponse({
    source: "db",
    conditions: [
      {
        stationId: "46042",
        timestamp: "2026-03-18T10:50:00.000Z",
        sstC: 17.1,
        waveHeightM: 1.24,
        windSpeedMps: 7,
        pressureHpa: 1015.6,
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.conditions.length, 1);
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.conditionCount, 1);
});

test("live-conditions route falls back to mock conditions", () => {
  const response = buildLiveConditionsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.ok(response.json.conditions.length > 0);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
});
