import test from "node:test";
import assert from "node:assert/strict";
import { buildLiveConditionsRouteResponse } from "./live-conditions";
import { classifyNdbcFreshness } from "../services/environmental-harness/freshness-policy";
import { buildSignalProvenance } from "../services/environmental-harness/provenance";
import { verificationStatusFromFreshness } from "../services/environmental-harness/freshness-policy";
test("live-conditions route returns db-backed conditions", async () => {
  const observedAt = new Date().toISOString();
  const freshnessStatus = classifyNdbcFreshness(Date.parse(observedAt));
  const response = await buildLiveConditionsRouteResponse({
    source: "db",
    conditions: [
      {
        stationId: "46042",
        timestamp: observedAt,
        sstC: 17.1,
        waveHeightM: 1.24,
        windSpeedMps: 7,
        pressureHpa: 1015.6,
        source: "noaa_ndbc",
        provenanceId: "PRV-46042",
        freshnessClassification: freshnessStatus.classification,
        freshnessStatus,
        verificationStatus: verificationStatusFromFreshness(freshnessStatus),
        provenance: buildSignalProvenance({
          source: "noaa_ndbc",
          stationId: "46042",
          observedAt,
          provenanceId: "PRV-46042",
        }),
        rootEventId: "EHE-ingestion-test-root",
        signalId: "SIG-test-root",
        trustStatus: "trusted",
        trustedForPromotion: true,
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.conditions.length, 1);
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.conditionCount, 1);
});

test("live-conditions route withholds stale unverifiable db rows in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const staleAt = new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString();
    const freshnessStatus = classifyNdbcFreshness(Date.parse(staleAt));
    const response = await buildLiveConditionsRouteResponse({
      source: "db",
      conditions: [
        {
          stationId: "46042",
          timestamp: staleAt,
          sstC: 17.1,
          waveHeightM: 1.24,
          windSpeedMps: 7,
          pressureHpa: 1015.6,
          source: "noaa_ndbc",
          provenanceId: "PRV-46042",
          freshnessClassification: freshnessStatus.classification,
          freshnessStatus,
          verificationStatus: verificationStatusFromFreshness(freshnessStatus),
          provenance: buildSignalProvenance({
            source: "noaa_ndbc",
            stationId: "46042",
            observedAt: staleAt,
            provenanceId: "PRV-46042",
          }),
        },
      ],
    });

    assert.equal(response.status, 503);
    assert.equal(response.json.conditions.length, 0);
    assert.equal(response.telemetry.source, "withheld");
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("live-conditions route falls back to mock conditions", async () => {
  const response = await buildLiveConditionsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.ok(response.json.conditions.length > 0);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
});
