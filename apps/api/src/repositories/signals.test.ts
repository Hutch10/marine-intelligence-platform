import test from "node:test";
import assert from "node:assert/strict";
import {
  createSignal,
  dismissSignal,
  getSignalById,
  listSignals,
  promoteSignalToInvestigation,
} from "./signals";
import type { SqliteDatabaseLike } from "../db/client";

const NOW = Date.parse("2026-03-17T12:00:00.000Z");

function createInMemoryDb(): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string, options?: { open?: boolean; readOnly?: boolean }) => {
      exec: (sql: string) => void;
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown[];
        run: (...params: unknown[]) => unknown;
      };
    };
  };

  const raw = new DatabaseSync(":memory:");
  raw.exec(`
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY
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
      linked_investigation_id TEXT
    );
  `);
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
      linked_investigation_id TEXT
    );
  `);

  return {
    prepare(sql: string) {
      return raw.prepare(sql);
    },
    close() {
      return undefined;
    },
  };
}

function runStatement(db: SqliteDatabaseLike, sql: string, ...params: unknown[]) {
  const statement = db.prepare(sql);

  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

function seedInvestigation(db: SqliteDatabaseLike, id: string) {
  runStatement(db, "INSERT INTO investigations (id) VALUES (?)", id);
}

function seedSignal(
  db: SqliteDatabaseLike,
  signal: {
    id: string;
    severity: string;
    status: string;
    detectedAt: number;
    linkedInvestigationId?: string | null;
  },
) {
  runStatement(
    db,
    `INSERT INTO signal_detections
      (id, signal_type, severity, confidence, source_type, source_id, region, station_id, title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    
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
  );
}

test("signals repository lists detections with filters and descending timeline order", () => {
  const db = createInMemoryDb();

  seedSignal(db, { id: "SIG-001", severity: "medium", status: "open", detectedAt: NOW - 5_000 });
  seedSignal(db, { id: "SIG-002", severity: "high", status: "open", detectedAt: NOW - 1_000 });
  seedSignal(db, { id: "SIG-003", severity: "high", status: "dismissed", detectedAt: NOW - 2_000 });

  const result = listSignals(
    { severity: "high", status: "open", limit: 10 },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openReadOnly: () => db,
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

test("signals repository gets signal by id", () => {
  const db = createInMemoryDb();
  seedSignal(db, { id: "SIG-ABC", severity: "critical", status: "open", detectedAt: NOW });

  const found = getSignalById("SIG-ABC", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openReadOnly: () => db,
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

  const missing = getSignalById("SIG-MISSING", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openReadOnly: () => db,
    now: () => NOW,
  });

  assert.deepEqual(missing, { source: "db", result: "not_found" });
});

test("signals repository creates a new signal", () => {
  const db = createInMemoryDb();

  const result = createSignal(
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
      openWritable: () => db,
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

test("signals repository promotes signal and records investigation event", () => {
  const db = createInMemoryDb();
  seedInvestigation(db, "TRK-201");
  seedSignal(db, { id: "SIG-LINK-1", severity: "high", status: "open", detectedAt: NOW - 30_000 });

  const recordedEvents: Array<{ investigationId: string; eventType: string; summary: string }> = [];

  const result = promoteSignalToInvestigation(
    "SIG-LINK-1",
    "TRK-201",
    "pilot.analyst@marine.local",
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      openWritable: () => db,
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

test("signals repository dismisses signal", () => {
  const db = createInMemoryDb();
  seedSignal(db, { id: "SIG-DISMISS-1", severity: "medium", status: "open", detectedAt: NOW - 20_000 });

  const result = dismissSignal("SIG-DISMISS-1", "operator", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openWritable: () => db,
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

test("signals repository falls back when DB path is missing", () => {
  const listResult = listSignals({}, {
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(listResult, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  const createResult = createSignal(
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
