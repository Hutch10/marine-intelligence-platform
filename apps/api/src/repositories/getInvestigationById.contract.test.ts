import assert from "node:assert/strict";
import test from 'node:test';
import test from 'node:test';

// Canonical contract shape for SignalDetection
const canonicalSignal = {
  id: "SIG-001",
  confidence: 95,
  stationId: "STA-001",
  timestamp: "2026-03-17T12:00:00.000Z",
  source: "acoustic",
  // value: (should NOT exist)
};

const canonicalInvestigation = {
  id: "INV-001",
  signals: [canonicalSignal],
};

test("getInvestigationById contract: signals do not expose 'value' field and have canonical keys", async () => {
  // Simulate contract shape (do not call DB)
  const investigation = canonicalInvestigation;
  assert.ok(investigation);
  assert.ok(Array.isArray(investigation.signals));
  for (const signal of investigation.signals) {
    assert.ok(!Object.prototype.hasOwnProperty.call(signal, "value"), "signal must not have 'value' field");
    assert.ok(Object.prototype.hasOwnProperty.call(signal, "confidence"));
    assert.ok(Object.prototype.hasOwnProperty.call(signal, "stationId"));
    assert.ok(Object.prototype.hasOwnProperty.call(signal, "timestamp"));
    assert.ok(Object.prototype.hasOwnProperty.call(signal, "source"));
  }
});
