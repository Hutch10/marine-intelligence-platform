import test from "node:test";
import assert from "node:assert/strict";
import { cosineSimilarity, findTopK } from "./similarity";

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

test("cosineSimilarity of identical vectors is 1", () => {
  const v = [0.6, 0.8, 0];
  assert.equal(cosineSimilarity(v, v), 1);
});

test("cosineSimilarity of orthogonal vectors is 0", () => {
  const a = [1, 0, 0];
  const b = [0, 1, 0];
  const result = cosineSimilarity(a, b);
  assert.ok(Math.abs(result) < 1e-9, `expected 0, got ${result}`);
});

test("cosineSimilarity of opposite vectors is -1", () => {
  const a = [1, 0];
  const b = [-1, 0];
  assert.equal(cosineSimilarity(a, b), -1);
});

test("cosineSimilarity returns 0 for zero vector", () => {
  const a = [0, 0, 0];
  const b = [1, 2, 3];
  assert.equal(cosineSimilarity(a, b), 0);
});

test("cosineSimilarity returns 0 for mismatched lengths", () => {
  assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
});

test("cosineSimilarity returns 0 for empty arrays", () => {
  assert.equal(cosineSimilarity([], []), 0);
});

test("cosineSimilarity symmetric: sim(a,b) === sim(b,a)", () => {
  const a = [0.5, 0.5, 0.707];
  const b = [0.3, 0.9, 0.316];
  const diff = Math.abs(cosineSimilarity(a, b) - cosineSimilarity(b, a));
  assert.ok(diff < 1e-12, `not symmetric: diff=${diff}`);
});

// ─── findTopK ─────────────────────────────────────────────────────────────────

test("findTopK returns top k results sorted descending by score", () => {
  const query = [1, 0, 0];
  const candidates = [
    { id: "a", vec: [0.9, 0.1, 0] },
    { id: "b", vec: [0.5, 0.5, 0] },
    { id: "c", vec: [0.1, 0.9, 0] },
    { id: "d", vec: [0.8, 0.2, 0] },
  ];

  const hits = findTopK(query, candidates, 2);

  assert.equal(hits.length, 2);
  assert.equal(hits[0]!.id, "a"); // highest similarity to [1,0,0]
  assert.equal(hits[1]!.id, "d");
  assert.ok(hits[0]!.score >= hits[1]!.score, "results not sorted descending");
});

test("findTopK excludes the query ID from results", () => {
  const query = [1, 0, 0];
  const candidates = [
    { id: "self", vec: [1, 0, 0] },
    { id: "other", vec: [0.9, 0.1, 0] },
  ];

  const hits = findTopK(query, candidates, 5, "self");

  assert.ok(
    hits.every((h) => h.id !== "self"),
    "query ID should be excluded",
  );
  assert.equal(hits[0]!.id, "other");
});

test("findTopK returns all candidates when k > count", () => {
  const query = [1, 0];
  const candidates = [
    { id: "x", vec: [1, 0] },
    { id: "y", vec: [0, 1] },
  ];

  const hits = findTopK(query, candidates, 100);
  assert.equal(hits.length, 2);
});

test("findTopK returns empty array for empty candidates", () => {
  const hits = findTopK([1, 0], [], 5);
  assert.equal(hits.length, 0);
});

test("findTopK with k=0 returns empty array", () => {
  const hits = findTopK([1, 0], [{ id: "x", vec: [1, 0] }], 0);
  assert.equal(hits.length, 0);
});
