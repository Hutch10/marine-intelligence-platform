import test from "node:test";
import assert from "node:assert/strict";
import {
  createSignal,
  dismissSignal,
  getSignalById,
  listSignals,
  promoteSignalToInvestigation,
} from "./signals";
import type { AsyncDbAdapter, AsyncDbRow } from "../db/async-client";

const NOW = Date.parse("2026-03-17T12:00:00.000Z");

function createInMemoryAsyncDb(): AsyncDbAdapter {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string, options?: { open?: boolean; readOnly?: boolean }) => any;
  };

  const raw = new DatabaseSync(":memory:");
  raw.exec(`
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      outcome TEXT CHECK (outcome IN ('confirmed', 'false_positive', 'inconclusive') OR outcome IS NULL)
    );

    CREATE TABLE IF NOT EXISTS signal_detections (
      id TEXT PRIMARY KEY,
      signal_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      region TEXT NOT NULL,
      station_id TEXT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT NOT NULL,
      status TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      linked_investigation_id TEXT REFERENCES investigations(id)
    );
  `);

  return {
    async execute(sql: string, params: unknown[] = []): Promise<AsyncDbRow[]> {
      const stmt = raw.prepare(sql);
      if (
        sql.trim().toUpperCase().startsWith("INSERT") ||
        sql.trim().toUpperCase().startsWith("UPDATE") ||
        sql.trim().toUpperCase().startsWith("DELETE") ||
        sql.trim().toUpperCase().startsWith("CREATE")
      ) {
        stmt.run(...params);
        return [];
      } else {
        return stmt.all(...params) as AsyncDbRow[];
      }
    },
    close() {
      // No-op in tests to allow reuse of the same adapter/database
    },

  };
}

async function seedInvestigation(adapter: AsyncDbAdapter, id: string) {
  await adapter.execute("INSERT INTO investigations (id) VALUES (?)", [id]);
}

async function seedSignal(
  adapter: AsyncDbAdapter,
  signal: {
    id: string;
    severity: string;
    status: string;
    detectedAt: number;
    linkedInvestigationId?: string | null;
  },
) {
  await adapter.execute(
    `INSERT INTO signal_detections
      (id, signal_type, severity, confidence, source_type, source_id, region, station_id, title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      signal.id,
      "thermal_anomaly",
      signal.severity,
      82,
      "test_source",
      "test-source-id",
      "North Pacific",
      null,
      `Signal ${signal.id}`,
      `Summary ${signal.id}`,
      `Detail ${signal.id}`,
      signal.status,
      signal.detectedAt,
      signal.detectedAt,
      signal.detectedAt,
      signal.linkedInvestigationId ?? null,
    ],
  );
}

test("signals repository lists detections with filters and descending timeline order", async () => {
  const adapter = createInMemoryAsyncDb();

  await seedSignal(adapter, { id: "SIG-001", severity: "medium", status: "open", detectedAt: NOW - 5_000 });
  await seedSignal(adapter, { id: "SIG-002", severity: "high", status: "open", detectedAt: NOW - 1_000 });
  await seedSignal(adapter, { id: "SIG-003", severity: "high", status: "dismissed", detectedAt: NOW - 2_000 });

  const result = await listSignals(
    { severity: "high", status: "open", limit: 10 },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => adapter,
      now: () => NOW,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.signals.length, 1);
    assert.equal(result.signals[0]?.id, "SIG-002");
    assert.equal(result.signals[0]?.severity, "high");
  }
});

test("signals repository gets signal by id", async () => {
  const adapter = createInMemoryAsyncDb();
  await seedSignal(adapter, { id: "SIG-ABC", severity: "critical", status: "open", detectedAt: NOW });

  const found = await getSignalById("SIG-ABC", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
  });

  assert.equal(found.source, "db");
  if (found.source === "db") {
    assert.equal(found.result, "found");
    if (found.result === "found") {
      assert.equal(found.signal.id, "SIG-ABC");
      assert.equal(found.signal.severity, "critical");
    }
  }

  const missing = await getSignalById("SIG-MISSING", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
  });

  assert.deepEqual(missing, { source: "db", result: "not_found" });
});

test("signals repository creates a new signal", async () => {
  const adapter = createInMemoryAsyncDb();

  const result = await createSignal(
    {
      signalType: "oxygen_depletion",
      severity: "high",
      confidence: 78,
      sourceType: "activity_alert_stream",
      sourceId: "ALT-180",
      region: "Eastern Shelf",
      title: "Oxygen depletion risk cluster",
      summary: "Sustained low dissolved oxygen trend.",
      detail: "Derived from chemistry and alert stream overlap.",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => adapter,
      now: () => NOW,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "created");
    assert.equal(result.signal.signalType, "oxygen_depletion");
    assert.equal(result.signal.status, "open");
  }
});

test("signals repository promotes signal and records investigation event", async () => {
  const adapter = createInMemoryAsyncDb();
  await seedInvestigation(adapter, "TRK-201");
  await seedSignal(adapter, { id: "SIG-LINK-1", severity: "high", status: "open", detectedAt: NOW - 30_000 });

  const recordedEvents: Array<{ investigationId: string; eventType: string; summary: string }> = [];

  const result = await promoteSignalToInvestigation(
    "SIG-LINK-1",
    "TRK-201",
    "pilot.analyst@marine.local",
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => adapter,
      now: () => NOW,
      recordEvent: (input) => {
        recordedEvents.push({
          investigationId: input.investigationId,
          eventType: input.eventType,
          summary: input.summary,
        });
      },
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "promoted");
    if (result.result === "promoted") {
      assert.equal(result.signal.status, "promoted");
      assert.equal(result.signal.linkedInvestigationId, "TRK-201");
    }
  }

  assert.equal(recordedEvents.length, 1);
  assert.equal(recordedEvents[0]?.investigationId, "TRK-201");
  assert.equal(recordedEvents[0]?.eventType, "signal_linked");
});

test("signals repository dismisses signal", async () => {
  const adapter = createInMemoryAsyncDb();
  await seedSignal(adapter, { id: "SIG-DISMISS-1", severity: "medium", status: "open", detectedAt: NOW - 20_000 });

  const result = await dismissSignal("SIG-DISMISS-1", "operator", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => adapter,
    now: () => NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "dismissed");
    if (result.result === "dismissed") {
      assert.equal(result.signal.status, "dismissed");
    }
  }
});

test("signals repository falls back when DB path is missing", async () => {
  const listResult = await listSignals({}, {
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(listResult, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  const createResult = await createSignal(
    {
      signalType: "station_health",
      severity: "low",
      confidence: 55,
      sourceType: "station_network",
      sourceId: "STA-NPC-01",
      region: "North Pacific",
      title: "Station health signal",
      summary: "Health trend warning",
      detail: "Maintenance follow-up recommended.",
    },
    {
      resolvePath: () => "missing.sqlite",
      hasPath: () => false,
    },
  );

  assert.deepEqual(createResult, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });
});

