import test from "node:test";
import assert from "node:assert/strict";
import { embedText, buildInvestigationContent, EMBED_DIM } from "./embed";

test("embedText produces a vector of EMBED_DIM length", () => {
  const vec = embedText("coral bleaching thermal stress reef");
  assert.equal(vec.length, EMBED_DIM);
});

test("embedText is deterministic — same text produces identical vector", () => {
  const text = "high sea surface temperature anomaly detected at station 46042";
  const a = embedText(text);
  const b = embedText(text);
  assert.deepEqual(a, b);
});

test("embedText produces different vectors for different texts", () => {
  const a = embedText("coral bleaching event detected near the reef");
  const b = embedText("low pressure system wind speed above threshold");
  assert.notDeepEqual(a, b);
});

test("embedText produces an L2-normalised vector (magnitude ≈ 1)", () => {
  const vec = embedText("investigation thermal anomaly buoy station reading");
  const magnitude = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
  // Allow small floating-point error
  assert.ok(Math.abs(magnitude - 1) < 1e-9, `magnitude=${magnitude} expected ≈1`);
});

test("embedText handles empty string without throwing", () => {
  const vec = embedText("");
  assert.equal(vec.length, EMBED_DIM);
  const allZero = vec.every((v) => v === 0);
  assert.ok(allZero, "empty text should produce zero vector");
});

test("embedText handles whitespace-only string without throwing", () => {
  const vec = embedText("   \t\n  ");
  assert.equal(vec.length, EMBED_DIM);
});

test("embedText ignores short tokens (< 3 chars)", () => {
  // "a b c" are all filtered out, so embedding should be zero
  const vec = embedText("a b c");
  const allZero = vec.every((v) => v === 0);
  assert.ok(allZero, "all-short tokens should produce zero vector");
});

test("buildInvestigationContent concatenates title + summary", () => {
  const content = buildInvestigationContent({
    title: "Thermal anomaly",
    summary: "SST exceeded threshold at station 46042",
  });
  assert.ok(content.includes("Thermal anomaly"));
  assert.ok(content.includes("SST exceeded threshold"));
});

test("buildInvestigationContent includes explanation when provided", () => {
  const content = buildInvestigationContent({
    title: "Bleaching risk",
    summary: "High DHW values observed",
    explanation: "Primary driver: elevated sea surface temperature",
  });
  assert.ok(content.includes("Primary driver"));
});

test("buildInvestigationContent includes alert details when provided", () => {
  const content = buildInvestigationContent({
    title: "Bleaching risk",
    summary: "High DHW values observed",
    alerts: [
      {
        title: "Reef heat advisory",
        detail: "Persistent SST anomaly over the reef slope.",
      },
    ],
  });
  assert.ok(content.includes("Alerts:"));
  assert.ok(content.includes("Reef heat advisory"));
  assert.ok(content.includes("Persistent SST anomaly"));
});

test("buildInvestigationContent omits explanation when undefined", () => {
  const content = buildInvestigationContent({
    title: "Test",
    summary: "Summary",
  });
  assert.ok(!content.includes("undefined"));
});
