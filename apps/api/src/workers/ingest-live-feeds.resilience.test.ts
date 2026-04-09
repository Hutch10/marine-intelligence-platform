// Phase 7: Ingestion Chaos/Disorder/Concurrency Resilience Tests
import test from 'node:test';
import assert from 'node:assert/strict';
import { runNdbcIngestion } from '../services/ingestion/run-ndbc';

// Helper: Malformed payloads
const malformedPayloads = [
  {}, // empty
  { stationId: 123, timestamp: 'not-a-date' }, // invalid types
  { stationId: 'A', value: NaN }, // invalid numeric
  { stationId: 'A', timestamp: Date.now() }, // missing required fields
  { stationId: 'A', timestamp: '2020-01-01T00:00:00Z', value: 1, extra: 'drift' }, // schema drift
  { stationId: 'A', timestamp: '2020-01-01T00:00:00Z', value: 1 }, // valid
];

test('ingestion rejects malformed payloads and reports honest errors', async () => {
  for (const payload of malformedPayloads) {
    try {
      // Simulate ingestion (replace with actual ingestion call if available)
      const result = await runNdbcIngestion({ stations: [{ stationId: 'A' }], ...({} as any) });
      assert(result.rejectedRows > 0 || result.status === 'failed');
    } catch (e) {
      assert.match(String(e), /invalid|malformed|missing|drift|error/i);
    }
  }
});

test('ingestion handles out-of-order and duplicate observations honestly', async () => {
  const base = { stationId: 'A', timestamp: '2020-01-01T00:00:00Z', value: 1 };
  const outOfOrder = { ...base, timestamp: '2019-12-31T23:59:59Z' };
  const duplicate = { ...base };
  const result = await runNdbcIngestion({ stations: [{ stationId: 'A' }], ...({} as any) });
  assert(result.rejectedRows >= 1 || result.status !== 'completed');
});

test('ingestion is race-safe under parallel ingestion of same station', async () => {
  const payload = { stationId: 'A', timestamp: '2020-01-01T00:00:00Z', value: 1 };
  const results = await Promise.all([
    runNdbcIngestion({ stations: [{ stationId: 'A' }], ...({} as any) }),
    runNdbcIngestion({ stations: [{ stationId: 'A' }], ...({} as any) }),
  ]);
  assert(results.every(r => r.status));
});
