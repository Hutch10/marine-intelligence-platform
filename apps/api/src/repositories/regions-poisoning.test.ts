import test from "node:test";
import assert from "node:assert/strict";
import { listRegions } from "./regions";
import type { SqliteDatabaseLike } from "../db/client";

function createPoisoningDatabase(
  stationRows: any[],
): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => any;
  };
  const db = new DatabaseSync(":memory:");
  
  db.exec(`
    CREATE TABLE regions (
      id TEXT PRIMARY KEY,
      name TEXT,
      status TEXT,
      summary TEXT,
      nearest_buoy_label TEXT,
      thermal_anomaly_label TEXT,
      current_direction_label TEXT,
      updated_at INTEGER,
      created_at INTEGER
    );
    CREATE TABLE stations (
      id TEXT PRIMARY KEY,
      region_id TEXT,
      latitude REAL,
      longitude REAL
    );
    CREATE TABLE alerts (id TEXT, status TEXT, region_id TEXT);
    CREATE TABLE investigations (id TEXT);
    CREATE TABLE map_layers (label TEXT);
    CREATE TABLE species_sightings (id TEXT, created_at INTEGER);
  `);

  db.exec(`INSERT INTO regions (id, name, status, summary, updated_at, created_at)
           VALUES ('REG-ADV', 'Adversarial Region', 'Active', 'Testing', 1000, 1000)`);

  const stmt = db.prepare("INSERT INTO stations (id, region_id, latitude, longitude) VALUES (?, ?, ?, ?)");
  stationRows.forEach((s, i) => {
    stmt.run(`STA-${i}`, s.region_id, s.latitude, s.longitude);
  });

  return {
    prepare(sql: string) {
      const prepared = db.prepare(sql);
      return {
        all(...params: any[]) {
          return prepared.all(...params);
        },
      };
    },
    close() {
      db.close();
    },
  };
}

test("attack: poisoning through average is now blocked by SQL WHERE clause", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createPoisoningDatabase([
      { region_id: "REG-ADV", latitude: 1000, longitude: 0 },
      { region_id: "REG-ADV", latitude: -900, longitude: 0 },
    ]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    const centroid = result.regions[0].centroid;
    assert.equal(centroid, null);
    console.log("✔ SUCCESS: Poisoned average blocked by SQL WHERE clause.");
  } else {
    assert.fail("Expected source to be db");
  }
});

test("attack: mixed valid/invalid data (outliers excluded)", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createPoisoningDatabase([
      { region_id: "REG-ADV", latitude: 10, longitude: 10 },
      { region_id: "REG-ADV", latitude: 20, longitude: 20 },
      { region_id: "REG-ADV", latitude: 1000, longitude: 1000 },
    ]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    const centroid = result.regions[0].centroid;
    assert.ok(centroid !== null);
    assert.equal(centroid?.lat, 15);
    assert.equal(centroid?.lng, 15);
    console.log("✔ SUCCESS: Valid data contributes to average while outliers are ignored.");
  } else {
    assert.fail("Expected source to be db");
  }
});

test("attack: NaN/Infinity poisoning (no Null Island fallback)", () => {
  const result = listRegions({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createPoisoningDatabase([
      { region_id: "REG-ADV", latitude: "NaN", longitude: "Infinity" },
    ]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    const centroid = result.regions[0].centroid;
    // Prove it remains null and does NOT become 0,0
    assert.equal(centroid, null);
    console.log("✔ SUCCESS: NaN/Infinity poisoning resulted in null centroid (No Null Island).");
  } else {
    assert.fail("Expected source to be db");
  }
});
