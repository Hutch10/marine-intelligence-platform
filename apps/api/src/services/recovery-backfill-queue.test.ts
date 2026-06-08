import test from "node:test";
import assert from "node:assert/strict";
import { enqueueRecoveryWindows, ensureRecoveryBackfillQueueTable } from "./recovery-backfill-queue";

test("enqueueRecoveryWindows creates hourly catch-up jobs", async () => {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createAsyncTestDatabase } = runtimeRequire("../db/test-utils") as {
    createAsyncTestDatabase: () => { adapter: { execute: (sql: string, params?: unknown[]) => Promise<unknown[]>; close: () => void } };
  };

  const adapter = createAsyncTestDatabase();
  await ensureRecoveryBackfillQueueTable(adapter);

  const start = Date.parse("2026-06-03T10:00:00.000Z");
  const end = Date.parse("2026-06-03T13:00:00.000Z");
  const ids = await enqueueRecoveryWindows(adapter, "noaa_ndbc", start, end, "circuit_breaker_closed");

  assert.equal(ids.length, 3);
  adapter.close();
});
