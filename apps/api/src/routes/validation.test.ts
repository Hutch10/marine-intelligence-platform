import test from "node:test";
import assert from "node:assert/strict";
import type { OceanStationAdminAuthContext } from "@marine/shared";
import {
  buildAttachValidationOutcomeRouteResponse,
  buildValidationSummaryRouteResponse,
} from "./validation";

const AUTH: OceanStationAdminAuthContext = {
  actorId: "ops.lead@marine.local",
  role: "admin",
  permissions: ["station.view_admin"],
  csrfToken: "csrf-token",
};

test("validation summary route validates since timestamps", async () => {
  const response = await buildValidationSummaryRouteResponse({
    since: "not-a-date",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.json, { message: "since must be a valid ISO timestamp" });
});

test("validation summary route returns structured reliability metrics", async () => {
  const response = await buildValidationSummaryRouteResponse(
    {},
    {
      ok: true,
      summary: {
        generatedAt: "2026-03-24T12:00:00.000Z",
        summaryWindow: { since: null, stationId: null },
        reliability: {
          totalEvaluations: 4,
          completedEvaluations: 3,
          outcomeCoverage: 0.75,
          empiricalAccuracy: 0.667,
          averagePredictedConfidence: 0.74,
          averageAdjustedConfidence: 0.68,
          overallCalibrationGap: 0.073,
          overconfidentBands: 1,
          underconfidentBands: 0,
        },
        confidenceBands: [],
        calibrationCurve: [],
        topFailureModes: [],
        feedbackTrendFlags: [],
      },
    },
  );

  assert.equal(response.status, 200);
  if ("reliability" in response.json) {
    assert.ok(Array.isArray(response.json.confidenceBands));
    assert.ok(Array.isArray(response.json.calibrationCurve));
    assert.ok(Array.isArray(response.json.topFailureModes));
  }
});

test("validation outcome route enforces station.view_admin", async () => {
  const response = await buildAttachValidationOutcomeRouteResponse(
    undefined,
    {
      evaluationId: "MVAL-1",
      observedAt: "2026-03-24T12:00:00.000Z",
      actualRiskLevel: "high",
      classification: "correct",
      summary: "Outcome",
      source: "manual",
    },
    {
      source: "db",
      result: {
        ok: false,
        reason: "not_found",
        error: "Evaluation not found",
        evaluation: null,
      },
    },
  );

  assert.equal(response.status, 403);
});

test("validation outcome route maps successful attach responses", async () => {
  const response = await buildAttachValidationOutcomeRouteResponse(
    AUTH,
    {
      evaluationId: "MVAL-1",
      observedAt: "2026-03-24T12:00:00.000Z",
      actualRiskLevel: "high",
      classification: "correct",
      summary: "Outcome",
      source: "manual",
    },
    {
      source: "db",
      result: {
        ok: true,
        evaluation: {
          id: "MVAL-1",
          stationId: "46042",
          route: "/api/v1/risk/score",
          apiKeyId: "APIKEY-1",
          predictedAt: "2026-03-24T11:30:00.000Z",
          predictedRiskLevel: "high",
          recommendationAction: "Storm risk advisory",
          recommendationUrgency: "high",
          confidenceScore: 0.82,
          calibrationAdjustedConfidenceScore: 0.76,
          operatorSummary: "Storm-like pattern",
          warningMessages: [],
          contributingSignals: [],
          triggeredRules: [],
          feedbackUseful: null,
          feedbackNote: null,
          feedbackCount: 0,
          actualOutcome: {
            observedAt: "2026-03-24T12:00:00.000Z",
            actualRiskLevel: "high",
            classification: "correct",
            summary: "Outcome",
            source: "manual",
            notes: null,
          },
          createdAt: "2026-03-24T11:30:00.000Z",
          updatedAt: "2026-03-24T12:00:00.000Z",
        },
      },
    },
  );

  assert.equal(response.status, 200);
  assert.ok("evaluation" in response.json);
});
