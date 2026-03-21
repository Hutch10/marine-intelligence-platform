import test from "node:test";
import assert from "node:assert/strict";
import {
  getMarineOntologyTermById,
  getMarineOntologyVersion,
  listMarineOntologyTerms,
  marineOntologyTermExists,
} from "./marine-intelligence-ontology";

test("marine ontology repository returns deterministic sorted terms", () => {
  const terms = listMarineOntologyTerms();
  const ids = terms.map((term) => term.id);
  const sorted = [...ids].sort((left, right) => left.localeCompare(right));

  assert.deepEqual(ids, sorted);
  assert.ok(ids.length > 5);
});

test("marine ontology repository applies filters by layer entity tag and parent", () => {
  const modeledSignals = listMarineOntologyTerms({
    layer: "modeled",
    entityType: "signal",
  });

  assert.ok(modeledSignals.length >= 3);
  assert.ok(modeledSignals.every((term) => term.layer === "modeled"));
  assert.ok(modeledSignals.every((term) => term.entityType === "signal"));

  const reefTagged = listMarineOntologyTerms({ tag: "reef" });
  assert.ok(reefTagged.length >= 2);

  const childTerms = listMarineOntologyTerms({ parentId: "obs.sea_surface_temperature" });
  assert.ok(childTerms.some((term) => term.id === "drv.sst_anomaly"));
});

test("marine ontology repository returns immutable copies", () => {
  const term = getMarineOntologyTermById("drv.sst_anomaly");

  assert.ok(term);
  if (!term) {
    return;
  }

  term.tags.push("mutated");

  const fresh = getMarineOntologyTermById("drv.sst_anomaly");
  assert.ok(fresh);
  if (!fresh) {
    return;
  }

  assert.equal(fresh.tags.includes("mutated"), false);
});

test("marine ontology helpers resolve existence and version", () => {
  assert.equal(marineOntologyTermExists("mdl.threshold_alert"), true);
  assert.equal(marineOntologyTermExists("missing.term"), false);
  assert.equal(getMarineOntologyVersion(), 1);
});
