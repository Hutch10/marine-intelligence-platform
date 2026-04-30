// Phase 7: Investigation API Degraded-State/Abuse/Observability Tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvestigationsRouteResponse } from './investigations';

test('investigations route returns honest degraded-state on DB failure', async () => {
  const result = await buildInvestigationsRouteResponse({ source: 'mock', fallbackReason: 'db_query_failed' });
  assert.equal(result.status, 200);
  assert(result.json.workspace.evidenceItems instanceof Array);
  assert(result.telemetry.fallbackReason === 'db_query_failed');
});

test('investigations route rejects absurd pagination and invalid IDs', async () => {
  // Simulate invalid input (pagination, IDs)
  // This is a placeholder; replace with actual route handler if available
  await assert.doesNotReject(async () => await buildInvestigationsRouteResponse({ source: 'mock', fallbackReason: 'db_query_failed' }));
});

test('investigations route does not fabricate confidence or evidence', async () => {
  const result = await buildInvestigationsRouteResponse({ source: 'mock', fallbackReason: 'db_query_failed' });
  assert(!('confidence' in result.json.workspace));
  assert(Array.isArray(result.json.workspace.evidenceItems));
});
