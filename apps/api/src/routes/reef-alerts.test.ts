import test from "node:test";
import assert from "node:assert/strict";
import { buildReefAlertsRouteResponse } from "./reef-alerts";
import { CRW_SOURCE } from "../connectors/coral-reef-watch/constants";
import { classifyCrwFreshness, verificationStatusFromFreshness } from "../services/environmental-harness/freshness-policy";
import { buildSignalProvenance } from "../services/environmental-harness/provenance";

test("reef-alerts route returns db-backed reef stress alerts", async () => {
  const now = Date.now();
  const productDate = new Date(now - 12 * 60 * 60 * 1000).toISOString();
  const freshnessStatus = classifyCrwFreshness(Date.parse(productDate), now);
  const response = await buildReefAlertsRouteResponse({
    source: "db",
    alerts: [
      {
        region: "Great Barrier Reef",
        stationId: null,
        timestamp: productDate,
        sstAnomalyC: 1.8,
        hotSpotC: 1.4,
        dhw: 6.2,
        stressLevel: "alert_level_1",
        source: CRW_SOURCE,
        outputClass: "derived",
        ingestedAt: new Date(now).toISOString(),
        sourceFeed: "https://coralreefwatch.noaa.gov/example",
        productDate,
        freshnessStatus,
        verificationStatus: verificationStatusFromFreshness(freshnessStatus),
        provenance: buildSignalProvenance({
          source: CRW_SOURCE,
          productDate,
          observedAt: productDate,
        }),
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
