import test from "node:test";
import assert from "node:assert/strict";
import type { RiskEvaluationRecord } from "@marine/shared";
import {
  buildValidationSummary,
  calculateCalibrationAdjustedConfidence,
} from "./marine-intelligence-validation";

const BASE_EVALUATION: RiskEvaluationRecord = {
  id: "MVAL-FIXTURE",
  stationId: "46042",
  route: "/api/v1/risk/score",
  apiKeyId: "APIKEY-1",
  predictedAt: "2026-03-24T11:00:00.000Z",
  predictedRiskLevel: "high",
  recommendationAction: null,
  recommendationUrgency: null,
  confidenceScore: 0.9,
  calibrationAdjustedConfidenceScore: null,
  operatorSummary: "Test",
  warningMessages: [],
  contributingSignals: [],
  triggeredRules: [],
  feedbackUseful: null,
  feedbackNote: null,
  feedbackCount: 0,
  actualOutcome: null,
  createdAt: "2026-03-24T11:00:00.000Z",
  updatedAt: "2026-03-24T11:00:00.000Z",
};

function makeEvaluation(overrides: Partial<RiskEvaluationRecord>): RiskEvaluationRecord {
  return { ...BASE_EVALUATION, ...overrides, id: overrides.id ?? `MVAL-${Math.random()}` };
}

function makeOutcome(
  classification: "correct" | "partial" | "incorrect",
  source: "manual" | "simulated" = "manual",
): RiskEvaluationRecord["actualOutcome"] {
  return {
    observedAt: "2026-03-24T12:00:00.000Z",
    actualRiskLevel: "high",
    classification,
    summary: "Observed",
    source,
    notes: null,
  };
}

// ---------------------------------------------------------------------------
// Phase 1 + Phase 3: manual-only calibration
// ---------------------------------------------------------------------------

test("calculateCalibrationAdjustedConfidence excludes simulated outcomes from band adjustment", () => {
  // 3 simulated=correct evaluations in 0.80-1.00 band → would suggest well-calibrated
  // 3 manual=incorrect evaluations in 0.80-1.00 band → overconfident
  // With fix: only manual count (3 incorrect) → bandAccuracy=0, gap=0.9, adjusted ≈ 0.45
  // Without fix: all 6 → bandAccuracy=0.5, gap=0.4, adjusted ≈ 0.7
  const evaluations: RiskEvaluationRecord[] = [
    makeEvaluation({ confidenceScore: 0.85, actualOutcome: makeOutcome("incorrect", "manual") }),
    makeEvaluation({ confidenceScore: 0.87, actualOutcome: makeOutcome("incorrect", "manual") }),
    makeEvaluation({ confidenceScore: 0.88, actualOutcome: makeOutcome("incorrect", "manual") }),
    makeEvaluation({ confidenceScore: 0.82, actualOutcome: makeOutcome("correct", "simulated") }),
    makeEvaluation({ confidenceScore: 0.83, actualOutcome: makeOutcome("correct", "simulated") }),
    makeEvaluation({ confidenceScore: 0.84, actualOutcome: makeOutcome("correct", "simulated") }),
  ];

  const readResult = { source: "db" as const, result: { ok: true as const, evaluations } };
  const result = calculateCalibrationAdjustedConfidence(
    { stationId: "46042", confidenceScore: 0.9, contributingSignals: [] },
    readResult,
  );

  // band accuracy from manual-only = 0 (all incorrect), gap = 0.9, adjustment = gap * 0.5 = 0.45
  // result should be around 0.45 (not ~0.7 which would occur if simulated were included)
  assert.ok(result !== null, "result should not be null");
  assert.ok(result < 0.6, `adjusted confidence should reflect manual-only overconfidence: got ${result}`);
});

test("calculateCalibrationAdjustedConfidence applies no band adjustment when only simulated outcomes exist", () => {
  // If all completed outcomes are simulated, the completed set (manual-only) is empty → no adjustment
  const evaluations: RiskEvaluationRecord[] = [
    makeEvaluation({ confidenceScore: 0.85, actualOutcome: makeOutcome("incorrect", "simulated") }),
    makeEvaluation({ confidenceScore: 0.87, actualOutcome: makeOutcome("incorrect", "simulated") }),
    makeEvaluation({ confidenceScore: 0.88, actualOutcome: makeOutcome("incorrect", "simulated") }),
  ];

  const readResult = { source: "db" as const, result: { ok: true as const, evaluations } };
  const result = calculateCalibrationAdjustedConfidence(
    { stationId: "46042", confidenceScore: 0.9, contributingSignals: [] },
    readResult,
  );

  // No manual completed evaluations → no band adjustment → result stays at ~0.9
  assert.ok(result !== null);
  assert.ok(result >= 0.85, `no adjustment expected when all outcomes are simulated: got ${result}`);
});

// ---------------------------------------------------------------------------
// Phase 2: station-scoped calibration
// ---------------------------------------------------------------------------

test("calculateCalibrationAdjustedConfidence uses injected station-scoped data correctly", () => {
  // Station 46042: 5 evaluations all high confidence, all incorrect (overconfident)
  // Station 46080: 5 evaluations all well-calibrated
  // When station-scoped data is injected for 46042, confidence should be reduced significantly
  const station42Evaluations: RiskEvaluationRecord[] = Array.from({ length: 5 }, (_, i) =>
    makeEvaluation({
      id: `A-${i}`,
      stationId: "46042",
      confidenceScore: 0.82 + i * 0.02,
      actualOutcome: makeOutcome("incorrect", "manual"),
    }),
  );

  const station80Evaluations: RiskEvaluationRecord[] = Array.from({ length: 5 }, (_, i) =>
    makeEvaluation({
      id: `B-${i}`,
      stationId: "46080",
      confidenceScore: 0.82 + i * 0.02,
      actualOutcome: makeOutcome("correct", "manual"),
    }),
  );

  const result42 = calculateCalibrationAdjustedConfidence(
    { stationId: "46042", confidenceScore: 0.9, contributingSignals: [] },
    { source: "db", result: { ok: true, evaluations: station42Evaluations } },
  );

  const result80 = calculateCalibrationAdjustedConfidence(
    { stationId: "46080", confidenceScore: 0.9, contributingSignals: [] },
    { source: "db", result: { ok: true, evaluations: station80Evaluations } },
  );

  assert.ok(result42 !== null && result80 !== null);
  // Station 42 is overconfident → should be adjusted significantly downward
  assert.ok(result42 < 0.7, `station 46042 should be adjusted down: got ${result42}`);
  // Station 80 is accurate → should remain near original (gap ~0, small adjustment)
  assert.ok(result80 > 0.8, `station 46080 should not be adjusted far down: got ${result80}`);
  // The two stations should produce different adjustments from the same raw confidence score
  assert.notEqual(result42, result80);
});

// ---------------------------------------------------------------------------
// Phase 3: signal penalty quality — only completed manual records
// ---------------------------------------------------------------------------

test("calculateCalibrationAdjustedConfidence signal penalties exclude incomplete records", () => {
  // 4 evaluations with a "Low pressure" signal: feedbackUseful=false but NO actualOutcome
  // Without fix: these would generate a signal penalty
  // With fix: incomplete records excluded → no penalty
  const signal = { kind: "observation" as const, label: "Low pressure", source: "station:46042", timestamp: "2026-03-24T11:00:00.000Z", detail: "" };
  const evaluations: RiskEvaluationRecord[] = Array.from({ length: 4 }, (_, i) =>
    makeEvaluation({
      id: `INC-${i}`,
      confidenceScore: 0.75,
      contributingSignals: [signal],
      feedbackUseful: false,
      actualOutcome: null, // incomplete — no outcome
    }),
  );

  const readResult = { source: "db" as const, result: { ok: true as const, evaluations } };
  const withSignal = calculateCalibrationAdjustedConfidence(
    { stationId: "46042", confidenceScore: 0.75, contributingSignals: [signal] },
    readResult,
  );

  const withoutSignal = calculateCalibrationAdjustedConfidence(
    { stationId: "46042", confidenceScore: 0.75, contributingSignals: [] },
    readResult,
  );

  // Signal penalty should NOT be applied since all records with that signal are incomplete
  assert.equal(
    withSignal,
    withoutSignal,
    `penalty should not apply to incomplete records: with=${withSignal}, without=${withoutSignal}`,
  );
});

test("calculateCalibrationAdjustedConfidence signal penalties apply when completed manual records warrant it", () => {
  // 4 evaluations: same signal, completed manual outcome, feedbackUseful=false
  // Penalty SHOULD be applied (stat.total >= 3, negative/total >= 0.5)
  const signal = { kind: "observation" as const, label: "Low pressure", source: "station:46042", timestamp: "2026-03-24T11:00:00.000Z", detail: "" };
  const evaluations: RiskEvaluationRecord[] = Array.from({ length: 4 }, (_, i) =>
    makeEvaluation({
      id: `COMP-${i}`,
      confidenceScore: 0.75,
      contributingSignals: [signal],
      feedbackUseful: false,
      actualOutcome: makeOutcome("incorrect", "manual"),
    }),
  );

  const readResult = { source: "db" as const, result: { ok: true as const, evaluations } };
  const withSignal = calculateCalibrationAdjustedConfidence(
    { stationId: "46042", confidenceScore: 0.75, contributingSignals: [signal] },
    readResult,
  );

  const withoutSignal = calculateCalibrationAdjustedConfidence(
    { stationId: "46042", confidenceScore: 0.75, contributingSignals: [] },
    readResult,
  );

  // With enough completed manual negative feedback, a penalty IS applied
  assert.ok(withSignal !== null && withoutSignal !== null);
  assert.ok(
    withSignal < withoutSignal,
    `signal penalty should apply when completed manual records have negative feedback: with=${withSignal}, without=${withoutSignal}`,
  );
});

// ---------------------------------------------------------------------------
// Phase 1 + Phase 3: summary excludes simulated from completed metrics
// ---------------------------------------------------------------------------

test("buildValidationSummary completed metrics exclude simulated outcomes", () => {
  const evaluations: RiskEvaluationRecord[] = [
    makeEvaluation({ id: "M1", confidenceScore: 0.8, actualOutcome: makeOutcome("correct", "manual") }),
    makeEvaluation({ id: "M2", confidenceScore: 0.7, actualOutcome: makeOutcome("incorrect", "manual") }),
    makeEvaluation({ id: "S1", confidenceScore: 0.9, actualOutcome: makeOutcome("correct", "simulated") }),
    makeEvaluation({ id: "S2", confidenceScore: 0.9, actualOutcome: makeOutcome("correct", "simulated") }),
    makeEvaluation({ id: "N1", confidenceScore: 0.6, actualOutcome: null }), // no outcome
  ];

  const result = buildValidationSummary(
    {},
    { source: "db", result: { ok: true, evaluations } },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;

  // totalEvaluations = 5 (all)
  // completedEvaluations = 2 (manual only, simulated excluded)
  assert.equal(result.summary.reliability.totalEvaluations, 5);
  assert.equal(result.summary.reliability.completedEvaluations, 2);

  // outcomeCoverage = 2/5 = 0.4
  assert.ok(
    Math.abs(result.summary.reliability.outcomeCoverage - 0.4) < 0.001,
    `outcomeCoverage should be 0.4: got ${result.summary.reliability.outcomeCoverage}`,
  );

  // empiricalAccuracy from 2 manual: correct(1) + incorrect(0) / 2 = 0.5
  assert.ok(
    result.summary.reliability.empiricalAccuracy !== null &&
    Math.abs(result.summary.reliability.empiricalAccuracy - 0.5) < 0.01,
    `empiricalAccuracy should be 0.5: got ${result.summary.reliability.empiricalAccuracy}`,
  );
});
