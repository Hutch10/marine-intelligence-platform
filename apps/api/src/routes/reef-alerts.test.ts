import test from "node:test";
import assert from "node:assert/strict";
import { buildReefAlertsRouteResponse } from "./reef-alerts";
import { CRW_SOURCE } from "../connectors/coral-reef-watch/constants";

test("reef-alerts route returns db-backed reef stress alerts", async () => {
  const response = await buildReefAlertsRouteResponse({
    source: "db",
    alerts: [
      {
        region: "Great Barrier Reef",
        stationId: null,
        timestamp: "2026-03-18T10:00:00.000Z",
        sstAnomalyC: 1.8,
        hotSpotC: 1.4,
        dhw: 6.2,
        stressLevel: "alert_level_1",
        source: CRW_SOURCE,
        outputClass: "derived",
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.alerts.length, 1);
  assert.equal(response.telemetry.source, "db");
});

test("reef-alerts route falls back to mock reef stress alerts", async () => {
  const response = await buildReefAlertsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.ok(response.json.alerts.length > 0);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
});
