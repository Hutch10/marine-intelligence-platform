import test from "node:test";
import assert from "node:assert/strict";
import { buildOperatorStatusRouteResponse } from "./operator-status";

test("operator status response is operator-scoped and includes diagnostics sections", async () => {
  const response = await buildOperatorStatusRouteResponse();

  assert.equal(response.status, 200);
  assert.equal(response.json.access, "operator");
  assert.ok(response.json.feed_health);
  assert.ok(response.json.scheduler);
  assert.ok(response.json.circuit_breaker);
  assert.ok(response.json.freshness_governance);
  assert.ok(Array.isArray(response.json.recent_failures));
  assert.ok(Array.isArray(response.json.recent_recoveries));
  assert.ok(response.json.harness);
  assert.ok(response.json.harness.replayValidation);
});
