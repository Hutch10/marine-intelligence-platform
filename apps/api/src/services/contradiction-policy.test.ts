import test from "node:test";
import assert from "node:assert/strict";
import { resolveContradictionSeverity, toFailClosedPublicRiskLevel } from "./contradiction-policy";

test("E. contradiction policy hierarchy prioritizes conflict over insufficiency over unknown over low risk", () => {
  assert.equal(resolveContradictionSeverity(["LOW_RISK", "UNKNOWN"]), "UNKNOWN");
  assert.equal(resolveContradictionSeverity(["LOW_RISK", "INSUFFICIENT_DATA"]), "INSUFFICIENT_DATA");
  assert.equal(resolveContradictionSeverity(["CONFLICTING_SIGNALS", "LOW_RISK"]), "CONFLICTING_SIGNALS");
  assert.equal(resolveContradictionSeverity([]), "LOW_RISK");
});

test("E. fail-closed public risk mapping keeps contradiction states from becoming low risk", () => {
  assert.equal(toFailClosedPublicRiskLevel("conflicting_signals"), "unknown");
  assert.equal(toFailClosedPublicRiskLevel("insufficient_data"), "unknown");
  assert.equal(toFailClosedPublicRiskLevel("critical"), "critical");
});
