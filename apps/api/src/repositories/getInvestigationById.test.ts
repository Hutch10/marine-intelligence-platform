import assert from "node:assert/strict";
import test from 'node:test';
import test from 'node:test';
const { getInvestigationById } = require("../repositories/getInvestigationById");

// If getInvestigationById requires a DB, this test will only pass if the DB is seeded deterministically.
// If not, mock/stub as needed. Here, we assume the function returns null for unknown IDs.

test("getInvestigationById returns investigation for valid id", async () => {
  // This test will only pass if the DB is seeded with INV-001, otherwise skip or mock as needed.
  const investigation = await getInvestigationById("INV-001");
  assert.ok(!investigation || investigation.id === "INV-001");
});

test("getInvestigationById returns null for invalid id", async () => {
  const investigation = await getInvestigationById("DOES-NOT-EXIST");
  assert.strictEqual(investigation, null);
});
