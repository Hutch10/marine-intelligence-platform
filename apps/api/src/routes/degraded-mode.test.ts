import test from "node:test";
import assert from "node:assert/strict";
import { buildAnomaliesRouteResponse, buildRiskEvaluateRouteResponse, buildRiskScoreRouteResponse } from "./risk";
import { buildValidationSummaryRouteResponse } from "./validation";
import { buildV1RiskRouteResponse } from "./v1-risk";

const ORIGINAL_DB_PATH = process.env.MARINE_DB_PATH;

test.afterEach(() => {
  if (ORIGINAL_DB_PATH === undefined) {
    delete process.env.MARINE_DB_PATH;
  } else {
    process.env.MARINE_DB_PATH = ORIGINAL_DB_PATH;
  }
});

function setMissingDbPath() {
  process.env.MARINE_DB_PATH = "C:/definitely-missing/marine.sqlite";
}

test("validation summary degrades honestly when database path is missing", () => {
  setMissingDbPath();

  const response = buildValidationSummaryRouteResponse({ stationId: "46042" });

  assert.equal(response.status, 200);
  if ("reliability" in response.json) {
    assert.equal(response.json.degraded, true);
    assert.equal(response.json.reason, "db_path_missing");
    assert.equal(response.json.trustStatus, "TRUST_BLOCKED");
    assert.equal(response.json.reliability.totalEvaluations, 0);
    assert.deepEqual(response.json.confidenceBands, []);
    assert.ok(!JSON.stringify(response.json).includes("SYNTHETIC_BENCH"));
    assert.ok(!JSON.stringify(response.json).includes("PRESSURE_TEST"));
  }
});

test("risk score degrades honestly when database path is missing", async () => {
  setMissingDbPath();

  const response = await buildRiskScoreRouteResponse({ stationId: "station-001" });

  assert.equal(response.status, 200);
  if ("signals" in response.json) {
    assert.equal(response.json.degraded, true);
    assert.equal(response.json.reason, "db_path_missing");
    assert.equal(response.json.trustStatus, "TRUST_BLOCKED");
    assert.equal(response.json.systemIntegrity, "TRUST_BLOCKED");
    assert.equal(response.json.overallRisk, "unknown");
    assert.deepEqual(response.json.signals, []);
    assert.deepEqual(response.json.triggeredRules, []);
    assert.ok(!JSON.stringify(response.json).includes("FIELD_TRUTH"));
    assert.ok(!JSON.stringify(response.json).includes("SYNTHETIC_BENCH"));
    assert.ok(!JSON.stringify(response.json).includes("PRESSURE_TEST"));
  }
});

test("risk evaluate degrades honestly when database path is missing and no history is provided", async () => {
  setMissingDbPath();

  const response = await buildRiskEvaluateRouteResponse({
    stationId: "station-001",
    observedAt: "2026-04-27T00:00:00.000Z",
    seaSurfaceTempC: 28,
    waveHeightM: 1.2,
    windSpeedMps: 4.5,
    pressureHpa: 1008,
  });

  assert.equal(response.status, 200);
  if ("riskLevel" in response.json) {
    assert.equal(response.json.degraded, true);
    assert.equal(response.json.reason, "db_path_missing");
    assert.equal(response.json.trustStatus, "TRUST_BLOCKED");
    assert.equal(response.json.riskLevel, "unknown");
    assert.deepEqual(response.json.baselineStats, []);
  }
});

test("anomalies route returns empty degraded payload when database path is missing", () => {
  setMissingDbPath();

  const response = buildAnomaliesRouteResponse({ stationId: "station-001" });

  assert.equal(response.status, 200);
  if ("anomalies" in response.json) {
    assert.equal(response.json.degraded, true);
    assert.equal(response.json.reason, "db_path_missing");
    assert.equal(response.json.trustStatus, "TRUST_BLOCKED");
    assert.deepEqual(response.json.anomalies, []);
    assert.equal(response.json.total, 0);
    assert.ok(!JSON.stringify(response.json).includes("FIELD_TRUTH"));
    assert.ok(!JSON.stringify(response.json).includes("SYNTHETIC_BENCH"));
    assert.ok(!JSON.stringify(response.json).includes("PRESSURE_TEST"));
  }
});

test("public v1 risk route returns trust-blocked degraded payload when database path is missing", async () => {
  setMissingDbPath();

  const response = await buildV1RiskRouteResponse("station-001");

  assert.equal(response.status, 200);
  if ("baselineCoverage" in response.json) {
    assert.equal(response.json.degraded, true);
    assert.equal(response.json.reason, "db_path_missing");
    assert.equal(response.json.trustStatus, "TRUST_BLOCKED");
    assert.equal(response.json.riskLevel, "unknown");
    assert.deepEqual(response.json.alerts, []);
    assert.deepEqual(response.json.signals, []);
  }
});