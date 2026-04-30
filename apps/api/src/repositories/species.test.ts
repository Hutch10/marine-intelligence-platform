import test from "node:test";
import assert from "node:assert/strict";
import {
  createSpeciesSighting,
  getInvestigationSpeciesSummary,
  getSpeciesById,
  getSpeciesSightingsBySpecies,
  listSpecies,
  listSpeciesMovementSignals,
  listSpeciesSightings,
} from "./species";
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
    CREATE TABLE IF NOT EXISTS species (
      id TEXT PRIMARY KEY,
      common_name TEXT NOT NULL,
      scientific_name TEXT NOT NULL,
      conservation_status TEXT NOT NULL,
      habitat_region TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS species_sightings (
      id TEXT PRIMARY KEY,
      species_id TEXT NOT NULL,
      station_id TEXT,
      region TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      count INTEGER NOT NULL,
      source TEXT NOT NULL,
      summary TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      verified_at INTEGER,
      verified_by TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS species_movement_signals (
      id TEXT PRIMARY KEY,
      species_id TEXT NOT NULL,
      signal_id TEXT,
      investigation_id TEXT,
      movement_type TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY
    );

    CREATE TABLE IF NOT EXISTS signal_detections (
      id TEXT PRIMARY KEY,
      region TEXT,
      station_id TEXT,
      linked_investigation_id TEXT
    );
  `);
  raw.exec(`
    CREATE TABLE IF NOT EXISTS species (
      id TEXT PRIMARY KEY,
      common_name TEXT NOT NULL,
      scientific_name TEXT NOT NULL,
      conservation_status TEXT NOT NULL,
      habitat_region TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS species_sightings (
      id TEXT PRIMARY KEY,
      species_id TEXT NOT NULL,
      station_id TEXT,
      region TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      count INTEGER NOT NULL,
      source TEXT NOT NULL,
      summary TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      verified_at INTEGER,
      verified_by TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS species_movement_signals (
      id TEXT PRIMARY KEY,
      species_id TEXT NOT NULL,
      signal_id TEXT,
      investigation_id TEXT,
      movement_type TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      outcome TEXT CHECK (outcome IN ('confirmed', 'false_positive', 'inconclusive') OR outcome IS NULL)
    );

    CREATE TABLE IF NOT EXISTS signal_detections (
      id TEXT PRIMARY KEY,
      region TEXT,
      station_id TEXT,
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
    execute(sql: string, params: unknown[] = []) {
      const stmt = raw.prepare(sql);
      if (typeof stmt.run === "function" && (sql.trim().toUpperCase().startsWith("INSERT") || sql.trim().toUpperCase().startsWith("UPDATE") || sql.trim().toUpperCase().startsWith("DELETE") || sql.trim().toUpperCase().startsWith("CREATE"))) {
        stmt.run(...params);
        return Promise.resolve([]);
      } else {
        return Promise.resolve(stmt.all(...params));
      }
    },
  } as any;
}

function runStatement(db: SqliteDatabaseLike, sql: string, ...params: unknown[]) {
  const statement = db.prepare(sql);

  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

function seedSpecies(db: SqliteDatabaseLike, input: { id: string; commonName: string; status: string; region: string; updatedAt: number }) {
  runStatement(
    db,
    `INSERT INTO species
      (id, common_name, scientific_name, conservation_status, habitat_region, summary, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id,
    input.commonName,
    `${input.commonName} scientificus`,
    input.status,
    input.region,
    `${input.commonName} baseline profile`,
    input.updatedAt - 10_000,
    input.updatedAt,
  );
}

function seedSighting(db: SqliteDatabaseLike, input: { id: string; speciesId: string; observedAt: number; stationId?: string | null }) {
  runStatement(
    db,
    `INSERT INTO species_sightings
      (id, species_id, station_id, region, observed_at, latitude, longitude, count, source, summary, verification_status, verified_at, verified_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id,
    input.speciesId,
    input.stationId ?? null,
    "North Pacific",
    input.observedAt,
    34.7,
    -143.1,
    2,
    "Test Source",
    `Sighting ${input.id}`,
    "verified",
    input.observedAt,
    "ops.admin",
    input.observedAt,
  );
}

function seedMovementSignal(db: SqliteDatabaseLike, input: { id: string; speciesId: string; createdAt: number; movementType: string }) {
  runStatement(
    db,
    `INSERT OR IGNORE INTO signal_detections (id, region, station_id, linked_investigation_id)
     VALUES (?, ?, ?, ?)`,
    "SIG-THERMAL-001",
    "North Pacific",
    "STA-NPC-01",
    "TRK-201",
  );

  runStatement(
    db,
    `INSERT INTO species_movement_signals
      (id, species_id, signal_id, investigation_id, movement_type, confidence, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    input.id,
    input.speciesId,
    "SIG-THERMAL-001",
    "TRK-201",
    input.movementType,
    82,
    `Movement ${input.id}`,
    input.createdAt,
  );
}

function seedInvestigation(db: SqliteDatabaseLike, id: string) {
  runStatement(db, "INSERT INTO investigations (id) VALUES (?)", id);
}

test("species repository lists entities with filters", async () => {
  const db = createInMemoryDb();

  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW - 1_000,
  });
  seedSpecies(db, {
    id: "SP-REEF-SHARK",
    commonName: "Grey Reef Shark",
    status: "near_threatened",
    region: "Great Barrier Reef",
    updatedAt: NOW - 5_000,
  });

  const result = await listSpecies(
    { conservationStatus: "endangered", region: "North Pacific" },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.species.length, 1);
    assert.equal(result.species[0]?.id, "SP-BLUE-WHALE");
  }
});

test("species repository gets entity by id", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-GREEN-TURTLE",
    commonName: "Green Sea Turtle",
    status: "endangered",
    region: "Eastern Shelf",
    updatedAt: NOW,
  });

  const found = await getSpeciesById("SP-GREEN-TURTLE", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => db as any,
    now: () => NOW,
  });

  assert.equal(found.source, "db");
  if (found.source === "db") {
    assert.equal(found.result, "found");
  }

  const missing = await getSpeciesById("SP-MISSING", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => db as any,
    now: () => NOW,
  });

  assert.deepEqual(missing, {
    source: "db",
    result: "not_found",
  });
});

test("species sightings are ordered newest first", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });
  seedSighting(db, { id: "SIGHT-OLD", speciesId: "SP-BLUE-WHALE", observedAt: NOW - 20_000 });
  seedSighting(db, { id: "SIGHT-NEW", speciesId: "SP-BLUE-WHALE", observedAt: NOW - 5_000 });
  seedSighting(db, { id: "SIGHT-MID", speciesId: "SP-BLUE-WHALE", observedAt: NOW - 10_000 });

  const result = await listSpeciesSightings(
    { speciesId: "SP-BLUE-WHALE", limit: 10 },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.sightings.map((item) => item.id), ["SIGHT-NEW", "SIGHT-MID", "SIGHT-OLD"]);
  }
});

test("getSpeciesSightingsBySpecies returns not_found for unknown species", async () => {
  const db = createInMemoryDb();

  const result = await getSpeciesSightingsBySpecies("SP-MISSING", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => db as any,
    now: () => NOW,
  });

  assert.deepEqual(result, {
    source: "db",
    result: "not_found",
  });
});

test("createSpeciesSighting inserts a new row", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });

  const created = await createSpeciesSighting(
    {
      speciesId: "SP-BLUE-WHALE",
      stationId: "STA-NPC-01",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 3,
      source: "Acoustic buoy mesh",
      summary: "Observed trio near thermal edge.",
      observedAt: "2026-03-17T11:59:00.000Z",
      verificationStatus: "verified",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    "ops.admin",
  );

  assert.equal(created.source, "db");
  if (created.source === "db") {
    assert.equal(created.result, "created");
    if (created.result === "created") {
      assert.equal(created.sighting.speciesId, "SP-BLUE-WHALE");
      assert.equal(created.sighting.count, 3);
      assert.equal(created.sighting.verificationStatus, "verified");
      assert.equal(created.sighting.verifiedBy, "ops.admin");
    }
  }
});

test("getSpeciesSightingsBySpecies supports verification filtering", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });

  runStatement(
    db,
    `INSERT INTO species_sightings
      (id, species_id, station_id, region, observed_at, latitude, longitude, count, source, summary, verification_status, verified_at, verified_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "SIGHT-PENDING",
    "SP-BLUE-WHALE",
    "STA-NPC-01",
    "North Pacific",
    NOW - 1_000,
    34.7,
    -143.1,
    1,
    "Test Source",
    "Pending review sighting",
    "pending",
    null,
    null,
    NOW - 1_000,
  );

  const result = await getSpeciesSightingsBySpecies(
    "SP-BLUE-WHALE",
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    { verificationStatus: "pending" },
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.equal(result.sightings.length, 1);
    assert.equal(result.sightings[0]?.verificationStatus, "pending");
  }
});

test("movement signal listing returns species-linked movement intelligence", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });
  seedInvestigation(db, "TRK-201");
  seedMovementSignal(db, {
    id: "MOV-NEW",
    speciesId: "SP-BLUE-WHALE",
    createdAt: NOW - 2_000,
    movementType: "route_deviation",
  });
  seedMovementSignal(db, {
    id: "MOV-OLD",
    speciesId: "SP-BLUE-WHALE",
    createdAt: NOW - 9_000,
    movementType: "aggregation_shift",
  });

  const result = await listSpeciesMovementSignals("SP-BLUE-WHALE", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => db as any,
    now: () => NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "found");
    if (result.result === "found") {
      assert.deepEqual(result.movementSignals.map((item) => item.id), ["MOV-NEW", "MOV-OLD"]);
    }
  }
});

test("movement signal listing supports confidence filters", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });
  seedInvestigation(db, "TRK-201");
  seedMovementSignal(db, {
    id: "MOV-HIGH",
    speciesId: "SP-BLUE-WHALE",
    createdAt: NOW - 2_000,
    movementType: "route_deviation",
  });

  runStatement(
    db,
    `INSERT INTO species_movement_signals
      (id, species_id, signal_id, investigation_id, movement_type, confidence, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "MOV-LOW",
    "SP-BLUE-WHALE",
    "SIG-THERMAL-001",
    "TRK-201",
    "aggregation_shift",
    40,
    "Lower confidence movement",
    NOW - 5_000,
  );

  const result = await listSpeciesMovementSignals(
    "SP-BLUE-WHALE",
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    { minConfidence: 70 },
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.movementSignals.map((item) => item.id), ["MOV-HIGH"]);
  }
});

test("investigation species summary aggregates linked movement and sightings", async () => {
  const db = createInMemoryDb();
  seedInvestigation(db, "TRK-201");
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });
  seedSighting(db, {
    id: "SIGHT-VERIFIED",
    speciesId: "SP-BLUE-WHALE",
    observedAt: NOW - 4_000,
    stationId: "STA-NPC-01",
  });
  runStatement(
    db,
    `INSERT INTO species_sightings
      (id, species_id, station_id, region, observed_at, latitude, longitude, count, source, summary, verification_status, verified_at, verified_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    "SIGHT-PENDING",
    "SP-BLUE-WHALE",
    "STA-NPC-01",
    "North Pacific",
    NOW - 2_000,
    34.7,
    -143.1,
    1,
    "Test Source",
    "Pending review sighting",
    "pending",
    null,
    null,
    NOW - 2_000,
  );
  seedMovementSignal(db, {
    id: "MOV-201",
    speciesId: "SP-BLUE-WHALE",
    createdAt: NOW - 1_000,
    movementType: "route_deviation",
  });

  const result = await getInvestigationSpeciesSummary("TRK-201", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => db as any,
    now: () => NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.equal(result.summary.investigationId, "TRK-201");
    assert.equal(result.summary.speciesCount, 1);
    assert.equal(result.summary.verifiedSightingCount, 1);
    assert.equal(result.summary.pendingVerificationCount, 1);
    assert.equal(result.summary.entries[0]?.matchedStationCount, 1);
    assert.equal(result.summary.entries[0]?.responseTier, "priority");
  }
});

test("species repository fallback behavior when DB path missing", async () => {
  await assert.rejects(
    async () => {
      await listSpecies({}, {
        resolvePath: () => "missing.sqlite",
        hasPath: () => false,
      });
    },
    (err: Error) => err.message.includes("Database missing at missing.sqlite")
  );

  await assert.rejects(
    async () => {
      await createSpeciesSighting(
        {
          speciesId: "SP-BLUE-WHALE",
          region: "North Pacific",
          latitude: 34.71,
          longitude: -143.11,
          count: 1,
          source: "Acoustic buoy mesh",
          summary: "Single individual logged.",
        },
        {
          resolvePath: () => "missing.sqlite",
          hasPath: () => false,
        },
      );
    },
    (err: Error) => err.message.includes("Database missing at missing.sqlite")
  );
});

test("movement signal listing filters by movement type", async () => {
  const db = createInMemoryDb();
  seedInvestigation(db, "TRK-201");
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });
  seedMovementSignal(db, {
    id: "MOV-ROUTE",
    speciesId: "SP-BLUE-WHALE",
    createdAt: NOW - 1_000,
    movementType: "route_deviation",
  });
  seedMovementSignal(db, {
    id: "MOV-HABITAT",
    speciesId: "SP-BLUE-WHALE",
    createdAt: NOW - 2_000,
    movementType: "habitat_exit",
  });

  const result = await listSpeciesMovementSignals(
    "SP-BLUE-WHALE",
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    { movementType: "route_deviation" },
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.movementSignals.map((item) => item.id), ["MOV-ROUTE"]);
  }
});

test("movement signal listing filters by date range", async () => {
  const db = createInMemoryDb();
  seedInvestigation(db, "TRK-201");
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });
  seedMovementSignal(db, {
    id: "MOV-RECENT",
    speciesId: "SP-BLUE-WHALE",
    createdAt: NOW - 1_000,
    movementType: "route_deviation",
  });
  seedMovementSignal(db, {
    id: "MOV-OLD",
    speciesId: "SP-BLUE-WHALE",
    createdAt: NOW - 86_400_000,
    movementType: "aggregation_shift",
  });

  const startDate = new Date(NOW - 3_600_000).toISOString();

  const result = await listSpeciesMovementSignals(
    "SP-BLUE-WHALE",
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    { startDate },
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.movementSignals.map((item) => item.id), ["MOV-RECENT"]);
  }
});

test("movement signal listing filters by station via signal join", async () => {
  const db = createInMemoryDb();
  seedInvestigation(db, "TRK-201");
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });

  runStatement(
    db,
    "INSERT INTO signal_detections (id, region, station_id, linked_investigation_id) VALUES (?, ?, ?, ?)",
    "SIG-NORTH",
    "North Pacific",
    "STA-NPC-01",
    "TRK-201",
  );
  runStatement(
    db,
    "INSERT INTO signal_detections (id, region, station_id, linked_investigation_id) VALUES (?, ?, ?, ?)",
    "SIG-SOUTH",
    "South Pacific",
    "STA-SPC-99",
    "TRK-201",
  );

  runStatement(
    db,
    `INSERT INTO species_movement_signals
      (id, species_id, signal_id, investigation_id, movement_type, confidence, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "MOV-NORTH",
    "SP-BLUE-WHALE",
    "SIG-NORTH",
    "TRK-201",
    "route_deviation",
    80,
    "North station signal",
    NOW - 1_000,
  );
  runStatement(
    db,
    `INSERT INTO species_movement_signals
      (id, species_id, signal_id, investigation_id, movement_type, confidence, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "MOV-SOUTH",
    "SP-BLUE-WHALE",
    "SIG-SOUTH",
    "TRK-201",
    "aggregation_shift",
    75,
    "South station signal",
    NOW - 2_000,
  );

  const result = await listSpeciesMovementSignals(
    "SP-BLUE-WHALE",
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    { stationId: "STA-NPC-01" },
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.movementSignals.map((item) => item.id), ["MOV-NORTH"]);
  }
});

test("movement signal listing filters by region via signal join", async () => {
  const db = createInMemoryDb();
  seedInvestigation(db, "TRK-201");
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });

  runStatement(
    db,
    "INSERT OR IGNORE INTO signal_detections (id, region, station_id, linked_investigation_id) VALUES (?, ?, ?, ?)",
    "SIG-THERMAL-001",
    "North Pacific",
    "STA-NPC-01",
    "TRK-201",
  );
  runStatement(
    db,
    `INSERT INTO species_movement_signals
      (id, species_id, signal_id, investigation_id, movement_type, confidence, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "MOV-REGION-MATCH",
    "SP-BLUE-WHALE",
    "SIG-THERMAL-001",
    "TRK-201",
    "route_deviation",
    85,
    "Region-matched signal",
    NOW - 500,
  );
  runStatement(
    db,
    `INSERT INTO species_movement_signals
      (id, species_id, signal_id, investigation_id, movement_type, confidence, summary, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    "MOV-NO-SIGNAL",
    "SP-BLUE-WHALE",
    null,
    "TRK-201",
    "habitat_exit",
    70,
    "No linked signal",
    NOW - 1_500,
  );

  const result = await listSpeciesMovementSignals(
    "SP-BLUE-WHALE",
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    { region: "North Pacific" },
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.movementSignals.map((item) => item.id), ["MOV-REGION-MATCH"]);
  }
});

test("createSpeciesSighting records verifiedBy for pending status (null)", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });

  const result = await createSpeciesSighting(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Field Observer",
      summary: "Pending sighting",
      verificationStatus: "pending",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    "observer.user",
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "created") {
    assert.equal(result.sighting.verificationStatus, "pending");
    assert.equal(result.sighting.verifiedBy, null);
    assert.equal(result.sighting.verifiedAt, null);
  }
});

test("createSpeciesSighting records verifiedBy for verified status", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });

  const result = await createSpeciesSighting(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Research Vessel",
      summary: "Verified sighting",
      verificationStatus: "verified",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    "researcher.user",
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "created") {
    assert.equal(result.sighting.verificationStatus, "verified");
    assert.equal(result.sighting.verifiedBy, "researcher.user");
    assert.notEqual(result.sighting.verifiedAt, null);
  }
});

test("createSpeciesSighting records verifiedBy for rejected status", async () => {
  const db = createInMemoryDb();
  seedSpecies(db, {
    id: "SP-BLUE-WHALE",
    commonName: "Blue Whale",
    status: "endangered",
    region: "North Pacific",
    updatedAt: NOW,
  });

  const result = await createSpeciesSighting(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Research Vessel",
      summary: "Rejected sighting",
      verificationStatus: "rejected",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
    "researcher.user",
  );

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "created") {
    assert.equal(result.sighting.verificationStatus, "rejected");
    assert.equal(result.sighting.verifiedBy, "researcher.user");
    assert.notEqual(result.sighting.verifiedAt, null);
  }
});

test("createSpeciesSighting returns not_found when species does not exist", async () => {
  const db = createInMemoryDb();

  const result = await createSpeciesSighting(
    {
      speciesId: "SP-NONEXISTENT",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Field Observer",
      summary: "Unknown species",
    },
    {
      resolvePath: () => "test.sqlite",
      hasPath: () => true,
      getAdapter: () => db as any,
      now: () => NOW,
    },
  );

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "not_found");
  }
});
