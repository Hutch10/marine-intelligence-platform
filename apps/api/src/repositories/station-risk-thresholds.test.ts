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
import type { AsyncDbAdapter } from "../db/async-client";

class MockDatabase {
  private raw: any;
  constructor() {
    const runtimeRequire = eval("require") as NodeRequire;
    const { DatabaseSync } = runtimeRequire("node:sqlite") as {
      DatabaseSync: new (path: string) => any;
    };
    this.raw = new DatabaseSync(":memory:");
  }

  execute(sql: string, params: unknown[] = []) {
    const statement = this.raw.prepare(sql);
    try {
      return statement.all(...params);
    } catch (err: any) {
      if (err.message?.includes("statement does not return data")) {
        return statement.run(...params);
      }
      throw err;
    }
  }

  close() {
    this.raw.close();
  }
}

function createMockAdapter(db: MockDatabase): AsyncDbAdapter {
  return {
    resourceId: "in-memory",
    async execute(sql: string, params: unknown[] = []) {
      return db.execute(sql, params);
    },
    async close() {
      // No-op for test reuse, or could track closes
    },
  };
}

async function ensureStationsTable(adapter: AsyncDbAdapter) {
  await adapter.execute(
    `CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      region_id TEXT
    )`,
  );
}

async function insertStation(adapter: AsyncDbAdapter, stationId: string, regionId: string | null) {
  await ensureStationsTable(adapter);
  await adapter.execute(
    `INSERT INTO stations (id, region_id)
     VALUES (?, ?)`,
    [stationId, regionId],
  );
}

test("readStationThresholdOverridesFromDb applies DB override values when valid", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await adapter.execute(
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["DB-OVERRIDE-01", 26.5, null, null, null, Date.now()],
  );

  const overrides = await readStationThresholdOverridesFromDb(adapter, "DB-OVERRIDE-01");
  assert.deepEqual(overrides, { seaSurfaceTempC: 26.5 });

  const resolved = await resolveStationRiskThresholds("DB-OVERRIDE-01", { adapter });
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 26.5);
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.source, "station_override");

  db.close();
});

test("resolveStationRiskThresholds applies DB overrides over defaults", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await adapter.execute(
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, updated_at)
     VALUES (?, ?, ?)`,
    ["DB-PRIORITY-01", 27, Date.now()],
  );

  const resolved = await resolveStationRiskThresholds("DB-PRIORITY-01", { adapter });
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 27);
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.source, "station_override");

  db.close();
});

test("readStationThresholdOverridesFromDb ignores invalid DB values and falls back safely", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await adapter.execute(
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, pressure_hpa, updated_at)
     VALUES (?, ?, ?, ?)`,
    ["INVALID-DB-01", 55, 820, Date.now()],
  );

  const overrides = await readStationThresholdOverridesFromDb(adapter, "INVALID-DB-01");
  assert.deepEqual(overrides, {});

  const resolved = await resolveStationRiskThresholds("INVALID-DB-01", { adapter });
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 30);
  assert.equal(resolved.find((item) => item.metric === "pressureHpa")?.thresholdValue, 960);
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.source, "default");
  assert.equal(resolved.find((item) => item.metric === "pressureHpa")?.source, "default");

  db.close();
});

test("resolveStationRiskThresholds falls back to defaults when DB is missing", async () => {
  clearStationRiskThresholdCache();
  const resolved = await resolveStationRiskThresholds("NO-DB-OVERRIDE-01", {
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

test("upsertStationThresholdOverrides writes valid normalized values", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);

  await upsertStationThresholdOverrides(
    adapter,
    "WRITE-VALID-01",
    {
      seaSurfaceTempC: "27.5",
      waveHeightM: 6,
      windSpeedMps: 14.2,
      pressureHpa: 975,
    },
    12345,
  );

  const overrides = await readStationThresholdOverridesFromDb(adapter, "WRITE-VALID-01");
  assert.deepEqual(overrides, {
    seaSurfaceTempC: 27.5,
    waveHeightM: 6,
    windSpeedMps: 14.2,
    pressureHpa: 975,
  });

  db.close();
});

test("upsertStationThresholdOverrides ignores invalid values", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);

  await upsertStationThresholdOverrides(
    adapter,
    "WRITE-INVALID-01",
    {
      seaSurfaceTempC: 55,
      waveHeightM: -1,
      windSpeedMps: "not-a-number",
      pressureHpa: 900,
    },
    22345,
  );

  const overrides = await readStationThresholdOverridesFromDb(adapter, "WRITE-INVALID-01");
  assert.deepEqual(overrides, {
    pressureHpa: 900,
  });

  db.close();
});

test("upsertStationThresholdOverrides overwrites existing values idempotently", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);

  await upsertStationThresholdOverrides(
    adapter,
    "WRITE-OVERWRITE-01",
    {
      seaSurfaceTempC: 28,
      pressureHpa: 970,
    },
    30000,
  );

  await upsertStationThresholdOverrides(
    adapter,
    "WRITE-OVERWRITE-01",
    {
      seaSurfaceTempC: 29,
      pressureHpa: 965,
    },
    40000,
  );

  await upsertStationThresholdOverrides(
    adapter,
    "WRITE-OVERWRITE-01",
    {
      seaSurfaceTempC: 29,
      pressureHpa: 965,
    },
    50000,
  );

  const overrides = await readStationThresholdOverridesFromDb(adapter, "WRITE-OVERWRITE-01");
  assert.deepEqual(overrides, {
    seaSurfaceTempC: 29,
    pressureHpa: 965,
  });

  const rows = await adapter.execute(
    `SELECT station_id, updated_at
     FROM station_risk_threshold_overrides
     WHERE station_id = ?`,
    ["WRITE-OVERWRITE-01"]
  ) as Array<{ station_id: string; updated_at: number }>;

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.updated_at, 50000);

  db.close();
});

test("readRegionThresholdOverridesFromDb returns valid region overrides", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await adapter.execute(
    `INSERT INTO region_risk_threshold_overrides
      (region_id, wave_height_m, pressure_hpa, updated_at)
     VALUES (?, ?, ?, ?)`,
    ["REG-NP", 7, 972, 11111],
  );

  assert.deepEqual(await readRegionThresholdOverridesFromDb(adapter, "REG-NP"), {
    waveHeightM: 7,
    pressureHpa: 972,
  });

  db.close();
});

test("readGlobalThresholdDefaultsFromDb returns validated global overrides", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await adapter.execute(
    `INSERT INTO global_risk_threshold_defaults
      (metric_key, threshold_value, updated_at)
     VALUES (?, ?, ?), (?, ?, ?), (?, ?, ?)`,
    [
      "seaSurfaceTempC", 26, 1000,
      "waveHeightM", 6, 1000,
      "pressureHpa", 700, 1000
    ],
  );

  assert.deepEqual(await readGlobalThresholdDefaultsFromDb(adapter), {
    seaSurfaceTempC: 26,
    waveHeightM: 6,
  });

  db.close();
});

test("resolveStationRiskThresholds uses station over region over global over fallback", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await insertStation(adapter, "HIER-01", "REG-NP");

  await adapter.execute(
    `INSERT INTO global_risk_threshold_defaults
      (metric_key, threshold_value, updated_at)
     VALUES (?, ?, ?), (?, ?, ?)`,
    ["seaSurfaceTempC", 25, 1000, "waveHeightM", 6, 1000],
  );

  await adapter.execute(
    `INSERT INTO region_risk_threshold_overrides
      (region_id, sea_surface_temp_c, wind_speed_mps, updated_at)
     VALUES (?, ?, ?, ?)`,
    ["REG-NP", 27, 16, 2000],
  );

  await adapter.execute(
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, pressure_hpa, updated_at)
     VALUES (?, ?, ?, ?)`,
    ["HIER-01", 29, 980, 3000],
  );

  const resolved = await resolveStationRiskThresholds("HIER-01", { adapter });

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

test("resolveStationRiskThresholds uses region override when station override is absent", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await insertStation(adapter, "HIER-02", "REG-ES");

  await adapter.execute(
    `INSERT INTO region_risk_threshold_overrides
      (region_id, pressure_hpa, updated_at)
     VALUES (?, ?, ?)`,
    ["REG-ES", 975, 2000],
  );

  const resolved = await resolveStationRiskThresholds("HIER-02", { adapter });
  assert.equal(resolved.find((item) => item.metric === "pressureHpa")?.thresholdValue, 975);

  db.close();
});

test("resolveStationRiskThresholds uses global override when station and region overrides are absent", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await insertStation(adapter, "HIER-03", "REG-GBR");

  await adapter.execute(
    `INSERT INTO global_risk_threshold_defaults
      (metric_key, threshold_value, updated_at)
     VALUES (?, ?, ?)`,
    ["windSpeedMps", 17, 1000],
  );

  const resolved = await resolveStationRiskThresholds("HIER-03", { adapter });
  assert.equal(resolved.find((item) => item.metric === "windSpeedMps")?.thresholdValue, 17);
  assert.equal(resolved.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 30);

  db.close();
});

test("resolveStationRiskThresholds uses cache for repeated station lookups without injected adapter", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await insertStation(adapter, "CACHE-01", "REG-NP");
  await adapter.execute(
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, updated_at)
     VALUES (?, ?, ?)`,
    ["CACHE-01", 26, 1000],
  );

  let openCount = 0;
  const getAdapter = () => {
    openCount += 1;
    return adapter;
  };

  const first = await resolveStationRiskThresholds("CACHE-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    getAdapter,
    now: () => 1000,
  });
  const second = await resolveStationRiskThresholds("CACHE-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    getAdapter,
    now: () => 2000,
  });

  assert.equal(openCount, 1);
  assert.equal(first.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 26);
  assert.equal(second.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 26);

  db.close();
});

test("resolveStationRiskThresholds refreshes cache after ttl expiry", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await insertStation(adapter, "CACHE-EXP-01", "REG-NP");
  await adapter.execute(
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, updated_at)
     VALUES (?, ?, ?)`,
    ["CACHE-EXP-01", 26, 1000],
  );

  let openCount = 0;
  const getAdapter = () => {
    openCount += 1;
    return adapter;
  };

  await resolveStationRiskThresholds("CACHE-EXP-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    getAdapter,
    now: () => 1000,
  });
  await resolveStationRiskThresholds("CACHE-EXP-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    getAdapter,
    now: () => 1000 + 121000,
  });

  assert.equal(openCount, 2);

  db.close();
});

test("upsertStationThresholdOverrides invalidates cached station thresholds", async () => {
  clearStationRiskThresholdCache();
  const db = new MockDatabase();
  const adapter = createMockAdapter(db);
  await ensureStationRiskThresholdTables(adapter);
  await insertStation(adapter, "CACHE-INV-01", "REG-NP");
  await adapter.execute(
    `INSERT INTO station_risk_threshold_overrides
      (station_id, sea_surface_temp_c, updated_at)
     VALUES (?, ?, ?)`,
    ["CACHE-INV-01", 26, 1000],
  );

  let openCount = 0;
  const getAdapter = () => {
    openCount += 1;
    return adapter;
  };

  const before = await resolveStationRiskThresholds("CACHE-INV-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    getAdapter,
    now: () => 1000,
  });

  await upsertStationThresholdOverrides(
    adapter,
    "CACHE-INV-01",
    {
      seaSurfaceTempC: 31,
    },
    2000,
  );

  const after = await resolveStationRiskThresholds("CACHE-INV-01", {
    resolvePath: () => "cache.sqlite",
    hasPath: () => true,
    getAdapter,
    now: () => 3000,
  });

  assert.equal(openCount, 2);
  assert.equal(before.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 26);
  assert.equal(after.find((item) => item.metric === "seaSurfaceTempC")?.thresholdValue, 31);

  db.close();
});
