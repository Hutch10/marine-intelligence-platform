import test from "node:test";
import assert from "node:assert/strict";
import type { AsyncDbAdapter } from "../db/async-client";
import type { MarineEventCreateInput } from "../marine-intelligence-types";
import { createMarineEvent, ensureMarineEventTables } from "./marine-events";

function createInMemoryAsyncAdapter(): AsyncDbAdapter {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string, options?: { open?: boolean; readOnly?: boolean }) => {
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown[];
        run: (...params: unknown[]) => unknown;
      };
      close: () => void;
    };
  };

  const db = new DatabaseSync(":memory:");

  return {
    async execute(sql: string, params: unknown[] = []) {
      const stmt = db.prepare(sql);
      const upper = sql.trim().toUpperCase();
      const isWrite =
        upper.startsWith("INSERT")
        || upper.startsWith("UPDATE")
        || upper.startsWith("DELETE")
        || upper.startsWith("CREATE")
        || upper.startsWith("ALTER")
        || upper.startsWith("BEGIN")
        || upper.startsWith("COMMIT")
        || upper.startsWith("ROLLBACK");
      if (isWrite) {
        stmt.run(...params);
        return [];
      }
      return stmt.all(...params) as Array<Record<string, unknown>>;
    },
    close() {
      db.close();
    },
  };
}

function baseInput(overrides: Partial<MarineEventCreateInput> = {}): MarineEventCreateInput {
  return {
    ontologyTermId: "mdl.threshold_alert",
    eventClass: "threshold_alert",
    severity: "high",
    status: "detected",
    title: "Thermal threshold exceeded",
    summary: "SST exceeded threshold baseline.",
    region: "North Pacific",
    stationId: "STA-001",
    confidence: 85,
    lineage: {
      source: "crw",
      sourceRecordId: "record-1",
      ingestionRunId: "run-1",
      observedAt: "2026-04-27T12:00:00.000Z",
      ingestedAt: "2026-04-27T12:01:00.000Z",
    },
    truthPartition: "FIELD_TRUTH",
    ...overrides,
  };
}

test("A. contradictory truth injection is quarantined and rejected deterministically", async () => {
  const adapter = createInMemoryAsyncAdapter();
  await ensureMarineEventTables(adapter);

  const first = await createMarineEvent(adapter, baseInput(), Date.parse("2026-04-27T12:02:00.000Z"));
  assert.equal(first.ok, true);

  const second = await createMarineEvent(
    adapter,
    baseInput({
      severity: "critical",
      summary: "Conflicting classification for same observed point.",
      lineage: {
        ...baseInput().lineage,
        sourceRecordId: "record-2",
      },
    }),
    Date.parse("2026-04-27T12:02:10.000Z"),
  );

  assert.equal(second.ok, false);
  assert.equal(second.reason, "validation");
  assert.match(second.error ?? "", /CONTRADICTION_DETECTED/);

  const quarantineRows = await adapter.execute(
    "SELECT reason FROM marine_intelligence_event_quarantine ORDER BY created_at DESC",
  );
  assert.equal(quarantineRows.length, 1);
  assert.equal((quarantineRows[0] as { reason: string }).reason, "contradictory_truth");

  adapter.close();
});

test("B. stale-valid replay is blocked and quarantined", async () => {
  const adapter = createInMemoryAsyncAdapter();
  await ensureMarineEventTables(adapter);

  const fresh = await createMarineEvent(
    adapter,
    baseInput({
      lineage: {
        ...baseInput().lineage,
        sourceRecordId: "record-fresh",
        observedAt: "2026-04-27T13:00:00.000Z",
      },
    }),
    Date.parse("2026-04-27T13:02:00.000Z"),
  );
  assert.equal(fresh.ok, true);

  const stale = await createMarineEvent(
    adapter,
    baseInput({
      lineage: {
        ...baseInput().lineage,
        sourceRecordId: "record-stale",
        observedAt: "2026-04-27T11:00:00.000Z",
      },
    }),
    Date.parse("2026-04-27T13:03:00.000Z"),
  );

  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "validation");
  assert.match(stale.error ?? "", /STALE_REPLAY_BLOCKED/);

  const quarantineRows = await adapter.execute(
    "SELECT reason FROM marine_intelligence_event_quarantine ORDER BY created_at DESC",
  );
  assert.equal(quarantineRows.length, 1);
  assert.equal((quarantineRows[0] as { reason: string }).reason, "stale_replay");

  adapter.close();
});

test("C. double-insert race converges to one persisted event with deterministic idempotency", async () => {
  const adapter = createInMemoryAsyncAdapter();
  await ensureMarineEventTables(adapter);

  const payload = baseInput({
    lineage: {
      ...baseInput().lineage,
      sourceRecordId: "record-race",
    },
  });

  const results = await Promise.all(
    Array.from({ length: 12 }).map((_, index) =>
      createMarineEvent(adapter, payload, Date.parse(`2026-04-27T14:00:${String(index).padStart(2, "0")}.000Z`)),
    ),
  );

  const successCount = results.filter((r) => r.ok).length;
  const deterministicRejectCount = results.filter(
    (r) => !r.ok && r.reason === "validation" && /CONTRADICTION_DETECTED/.test(r.error ?? ""),
  ).length;
  assert.equal(successCount, 1);
  assert.equal(deterministicRejectCount, 11);

  const rows = await adapter.execute(
    "SELECT id FROM marine_intelligence_events WHERE source_record_id = ?",
    ["record-race"],
  );
  assert.equal(rows.length, 1);

  adapter.close();
});

test("D. integrity-chain fork/tamper is detected and write fails closed", async () => {
  const adapter = createInMemoryAsyncAdapter();
  await ensureMarineEventTables(adapter);

  const first = await createMarineEvent(
    adapter,
    baseInput({ lineage: { ...baseInput().lineage, sourceRecordId: "record-chain-1" } }),
    Date.parse("2026-04-27T15:00:00.000Z"),
  );
  assert.equal(first.ok, true);

  const second = await createMarineEvent(
    adapter,
    baseInput({ lineage: { ...baseInput().lineage, sourceRecordId: "record-chain-2" } }),
    Date.parse("2026-04-27T15:00:10.000Z"),
  );
  assert.equal(second.ok, true);

  await adapter.execute(
    "UPDATE marine_intelligence_events SET integrity_chain_hash = ? WHERE source_record_id = ?",
    ["FORGED_HASH_BRANCH", "record-chain-1"],
  );

  const blocked = await createMarineEvent(
    adapter,
    baseInput({ lineage: { ...baseInput().lineage, sourceRecordId: "record-chain-3" } }),
    Date.parse("2026-04-27T15:00:20.000Z"),
  );

  assert.equal(blocked.ok, false);
  assert.equal(blocked.reason, "validation");
  assert.match(blocked.error ?? "", /INTEGRITY_CHAIN_FORK_DETECTED/);

  const quarantineRows = await adapter.execute(
    "SELECT reason FROM marine_intelligence_event_quarantine ORDER BY created_at DESC",
  );
  assert.equal(quarantineRows.length, 1);
  assert.equal((quarantineRows[0] as { reason: string }).reason, "chain_fork_detected");

  adapter.close();
});
