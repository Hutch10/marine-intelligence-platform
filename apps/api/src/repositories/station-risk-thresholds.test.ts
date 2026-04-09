import test from "node:test";
import assert from "node:assert/strict";
import {
  clearStationRiskThresholdCache,
  ensureStationRiskThresholdTables,
  readGlobalThresholdDefaultsFromDb,
  readRegionThresholdOverridesFromDb,
  readStationThresholdOverridesFromDb,
  resolveStationRiskThresholds,
  upsertStationThresholdOverrides,
} from "./station-risk-thresholds";
import type { SqliteDatabaseLike } from "../db/client";

function createInMemoryDb(): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown[];
        run: (...params: unknown[]) => unknown;
      };
      close: () => void;
    };
  };

  const raw = new DatabaseSync(":memory:");

  return {
    prepare(sql: string) {
      return raw.prepare(sql);
    },
    close() {
      raw.close();
    },
  };
}

function createReadOnlyWrapper(db: SqliteDatabaseLike): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return db.prepare(sql);
    },
    close() {},
  };
}

function run(db: SqliteDatabaseLike, sql: string, ...params: unknown[]) {
  const statement = db.prepare(sql);

  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

function ensureStationsTable(db: SqliteDatabaseLike) {
  run(
    db,
    `CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      region_id TEXT
    )`,
  );
}

function insertStation(db: SqliteDatabaseLike, stationId: string, regionId: string | null) {
  ensureStationsTable(db);
  run(
    db,
    `INSERT INTO stations (id, region_id)
     VALUES (?, ?)`,
    stationId,
    regionId,
  );
}

test("readStationThresholdOverridesFromDb applies DB override values when valid", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  run(
    db,
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    "DB-OVERRIDE-01",
    26.5,
    null,
    null,
    null,
    Date.now(),
  );

  const overrides = readStationThresholdOverridesFromDb(db, "DB-OVERRIDE-01");
  assert.deepEqual(overrides, { seaSurfaceTempC: 26.5 });

  const resolved = resolveStationRiskThresholds("DB-OVERRIDE-01", { db });
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 26.5);
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.source, "station_override");

  db.close();
});

test("resolveStationRiskThresholds applies DB overrides over defaults", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  run(
    db,
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, updated_at)
     VALUES (?, ?, ?)`,
    "DB-PRIORITY-01",
    27,
    Date.now(),
  );

  const resolved = resolveStationRiskThresholds("DB-PRIORITY-01", { db });
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 27);
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.source, "station_override");

  db.close();
});

test("readStationThresholdOverridesFromDb ignores invalid DB values and falls back safely", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  run(
    db,
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, pressure_hpa, updated_at)
     VALUES (?, ?, ?, ?)`,
    "INVALID-DB-01",
    55,
    820,
    Date.now(),
  );

  const overrides = readStationThresholdOverridesFromDb(db, "INVALID-DB-01");
  assert.deepEqual(overrides, {});

  const resolved = resolveStationRiskThresholds("INVALID-DB-01", { db });
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 30);
  assert.equal(resolved.find((item) => item.metric === "pressureHpa")?.thresholdValue, 960);
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.source, "default");
  assert.equal(resolved.find((item) => item.metric === "pressureHpa")?.source, "default");

  db.close();
});

test("resolveStationRiskThresholds falls back to defaults when DB is missing", () => {
  clearStationRiskThresholdCache();
  const resolved = resolveStationRiskThresholds("NO-DB-OVERRIDE-01", {
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
    now: () => 0,
  });

  assert.deepEqual(
    resolved.map((item) => ({
      metric: item.metric,
      thresholdValue: item.thresholdValue,
      source: item.source,
    })),
    [
      { metric: "seaSurfaceTempC", thresholdValue: 30, source: "default" },
      { metric: "waveHeightM", thresholdValue: 5, source: "default" },
      { metric: "windSpeedMps", thresholdValue: 20, source: "default" },
      { metric: "pressureHpa", thresholdValue: 960, source: "default" },
    ],
  );
});

test("upsertStationThresholdOverrides writes valid normalized values", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();

  upsertStationThresholdOverrides(
    db,
    "WRITE-VALID-01",
    {
      seaSurfaceTempC: "27.5",
      waveHeightM: 6,
      windSpeedMps: 14.2,
      pressureHpa: 975,
    },
    12345,
  );

  const overrides = readStationThresholdOverridesFromDb(db, "WRITE-VALID-01");
  assert.deepEqual(overrides, {
    seaSurfaceTempC: 27.5,
    waveHeightM: 6,
    windSpeedMps: 14.2,
    pressureHpa: 975,
  });

  db.close();
});

test("upsertStationThresholdOverrides ignores invalid values", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();

  upsertStationThresholdOverrides(
    db,
    "WRITE-INVALID-01",
    {
      seaSurfaceTempC: 55,
      waveHeightM: -1,
      windSpeedMps: "not-a-number",
      pressureHpa: 900,
    },
    22345,
  );

  const overrides = readStationThresholdOverridesFromDb(db, "WRITE-INVALID-01");
  assert.deepEqual(overrides, {
    pressureHpa: 900,
  });

  db.close();
});

test("upsertStationThresholdOverrides overwrites existing values idempotently", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);

  upsertStationThresholdOverrides(
    db,
    "WRITE-OVERWRITE-01",
    {
      seaSurfaceTempC: 28,
      pressureHpa: 970,
    },
    30000,
  );

  upsertStationThresholdOverrides(
    db,
    "WRITE-OVERWRITE-01",
    {
      seaSurfaceTempC: 29,
      pressureHpa: 965,
    },
    40000,
  );

  upsertStationThresholdOverrides(
    db,
    "WRITE-OVERWRITE-01",
    {
      seaSurfaceTempC: 29,
      pressureHpa: 965,
    },
    50000,
  );

  const overrides = readStationThresholdOverridesFromDb(db, "WRITE-OVERWRITE-01");
  assert.deepEqual(overrides, {
    seaSurfaceTempC: 29,
    pressureHpa: 965,
  });

  const rows = db.prepare(
    `SELECT station_id, updated_at
     FROM station_risk_threshold_overrides
     WHERE station_id = ?`,
  ).all("WRITE-OVERWRITE-01") as Array<{ station_id: string; updated_at: number }>;

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.updated_at, 50000);

  db.close();
});

test("readRegionThresholdOverridesFromDb returns valid region overrides", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  run(
    db,
    `INSERT INTO region_risk_threshold_overrides
      (region_id, wave_height_m, pressure_hpa, updated_at)
     VALUES (?, ?, ?, ?)`,
    "REG-NP",
    7,
    972,
    11111,
  );

  assert.deepEqual(readRegionThresholdOverridesFromDb(db, "REG-NP"), {
    waveHeightM: 7,
    pressureHpa: 972,
  });

  db.close();
});

test("readGlobalThresholdDefaultsFromDb returns validated global overrides", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  run(
    db,
    `INSERT INTO global_risk_threshold_defaults
      (metric_key, threshold_value, updated_at)
     VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
    "seaSurfaceTempC",
    26,
    1000,
    "waveHeightM",
    6,
    1000,
    "pressureHpa",
    700,
    1000,
  );

  assert.deepEqual(readGlobalThresholdDefaultsFromDb(db), {
    seaSurfaceTempC: 26,
    waveHeightM: 6,
  });

  db.close();
});

test("resolveStationRiskThresholds uses station over region over global over fallback", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  insertStation(db, "HIER-01", "REG-NP");

  run(
    db,
    `INSERT INTO global_risk_threshold_defaults
      (metric_key, threshold_value, updated_at)
     VALUES (?, ?, ?), (?, ?, ?)`,
    "seaSurfaceTempC",
    25,
    1000,
    "waveHeightM",
    6,
    1000,
  );

  run(
    db,
    `INSERT INTO region_risk_threshold_overrides
      (region_id, sea_surface_temp_c, wind_speed_mps, updated_at)
     VALUES (?, ?, ?, ?)`,
    "REG-NP",
    27,
    16,
    2000,
  );

  run(
    db,
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, pressure_hpa, updated_at)
     VALUES (?, ?, ?, ?)`,
    "HIER-01",
    29,
    980,
    3000,
  );

  const resolved = resolveStationRiskThresholds("HIER-01", { db });

  assert.deepEqual(
    resolved.map((item) => ({
      metric: item.metric,
      thresholdValue: item.thresholdValue,
      source: item.source,
    })),
    [
      { metric: "seaSurfaceTempC", thresholdValue: 29, source: "station_override" },
      { metric: "waveHeightM", thresholdValue: 6, source: "default" },
      { metric: "windSpeedMps", thresholdValue: 16, source: "station_override" },
      { metric: "pressureHpa", thresholdValue: 980, source: "station_override" },
    ],
  );

  db.close();
});

test("resolveStationRiskThresholds uses region override when station override is absent", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  insertStation(db, "HIER-02", "REG-ES");

  run(
    db,
    `INSERT INTO region_risk_threshold_overrides
      (region_id, pressure_hpa, updated_at)
     VALUES (?, ?, ?)`,
    "REG-ES",
    975,
    2000,
  );

  const resolved = resolveStationRiskThresholds("HIER-02", { db });
  assert.equal(resolved.find((item) => item.metric === "pressureHpa")?.thresholdValue, 975);

  db.close();
});

test("resolveStationRiskThresholds uses global override when station and region overrides are absent", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  insertStation(db, "HIER-03", "REG-GBR");

  run(
    db,
    `INSERT INTO global_risk_threshold_defaults
      (metric_key, threshold_value, updated_at)
     VALUES (?, ?, ?)`,
    "windSpeedMps",
    17,
    1000,
  );

  const resolved = resolveStationRiskThresholds("HIER-03", { db });
  assert.equal(resolved.find((item) => item.metric === "windSpeedMps")?.thresholdValue, 17);
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 30);

  db.close();
});

test("resolveStationRiskThresholds uses cache for repeated station lookups without injected db", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  insertStation(db, "CACHE-01", "REG-NP");
  run(
    db,
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, updated_at)
     VALUES (?, ?, ?)`,
    "CACHE-01",
    26,
    1000,
  );

  let openCount = 0;
  const openReadOnly = () => {
    openCount += 1;
    return createReadOnlyWrapper(db);
  };

  const first = resolveStationRiskThresholds("CACHE-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    openReadOnly,
    now: () => 1000,
  });
  const second = resolveStationRiskThresholds("CACHE-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    openReadOnly,
    now: () => 2000,
  });

  assert.equal(openCount, 1);
  assert.equal(first.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 26);
  assert.equal(second.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 26);
});

test("resolveStationRiskThresholds refreshes cache after ttl expiry", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  insertStation(db, "CACHE-EXP-01", "REG-NP");
  run(
    db,
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, updated_at)
     VALUES (?, ?, ?)`,
    "CACHE-EXP-01",
    26,
    1000,
  );

  let openCount = 0;
  const openReadOnly = () => {
    openCount += 1;
    return createReadOnlyWrapper(db);
  };

  resolveStationRiskThresholds("CACHE-EXP-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    openReadOnly,
    now: () => 1000,
  });
  resolveStationRiskThresholds("CACHE-EXP-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    openReadOnly,
    now: () => 1000 + 121000,
  });

  assert.equal(openCount, 2);
});

test("upsertStationThresholdOverrides invalidates cached station thresholds", () => {
  clearStationRiskThresholdCache();
  const db = createInMemoryDb();
  ensureStationRiskThresholdTables(db);
  insertStation(db, "CACHE-INV-01", "REG-NP");
  run(
    db,
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, updated_at)
     VALUES (?, ?, ?)`,
    "CACHE-INV-01",
    26,
    1000,
  );

  let openCount = 0;
  const openReadOnly = () => {
    openCount += 1;
    return createReadOnlyWrapper(db);
  };

  const before = resolveStationRiskThresholds("CACHE-INV-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    openReadOnly,
    now: () => 1000,
  });

  upsertStationThresholdOverrides(
    db,
    "CACHE-INV-01",
    {
      seaSurfaceTempC: 31,
    },
    2000,
  );

  const after = resolveStationRiskThresholds("CACHE-INV-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    openReadOnly,
    now: () => 3000,
  });

  assert.equal(openCount, 2);
  assert.equal(before.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 26);
  assert.equal(after.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 31);
});
