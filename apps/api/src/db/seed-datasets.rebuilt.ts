import { mkdirSync } from "fs";
import { dirname } from "path";
import { resolveDatabasePath } from "./client";
import { databaseBootstrap } from "./bootstrap";

type DbLike = {
  exec(sql: string): void;
  prepare(sql: string): { run(...params: unknown[]): void };
  close(): void;
};

function getWritableDatabase(): { dbPath: string; db: DbLike } {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => DbLike;
  };
  const dbPath = resolveDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  return { dbPath, db };
}

// Realistic baselines for SE Florida / Bahamas in April–May (NOAA climatology)
const STATION_BASELINES: Record<string, {
  sst: number; wave: number; wind: number; pressure: number;
}> = {
  "41009": { sst: 25.2, wave: 1.1, wind: 6.2, pressure: 1013.5 },
  "41010": { sst: 26.1, wave: 1.6, wind: 7.8, pressure: 1012.8 },
  "41012": { sst: 22.8, wave: 1.3, wind: 5.9, pressure: 1014.2 },
  "41044": { sst: 28.3, wave: 1.0, wind: 5.1, pressure: 1013.0 },
  "42036": { sst: 25.7, wave: 0.8, wind: 4.3, pressure: 1015.1 },
};

// Diurnal offsets for UTC hours 00, 06, 12, 18
const SST_OFFSETS     = [-0.3,  0.1,  0.5,  0.2];
const WAVE_OFFSETS    = [ 0.0,  0.1,  0.2,  0.1];
const WIND_OFFSETS    = [ 0.5, -0.3,  0.8,  0.2];
const PRESSURE_OFFSETS = [ 0.2, -0.1, -0.5,  0.1];

// Slight day-to-day SST warming trend over the 3-day window
const DAILY_SST_DRIFT = [0.0, 0.2, 0.4];

export function seedDatasetDatabase() {
  const { dbPath, db } = getWritableDatabase();

  // Bootstrap the full schema (CREATE TABLE IF NOT EXISTS — idempotent)
  for (const stmt of databaseBootstrap.statements) {
    db.exec(stmt);
  }

  const nowSec = Math.floor(Date.now() / 1000);

  // ─── Regions ──────────────────────────────────────────────────────────────
  db.exec(`
    INSERT OR IGNORE INTO regions
      (id, name, status, summary, buoy_count,
       nearest_buoy_label, thermal_anomaly_label, current_direction_label,
       created_at, updated_at)
    VALUES
      ('REG-SE-FL', 'Southeast Florida', 'Active Monitoring',
       'Coastal zone from Cape Canaveral south to Miami. High-density NDBC network with continuous temperature and wave monitoring.',
       3, '41009 (Canaveral ENE)', '+0.8°C', 'NE 1.8 kt',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('REG-FL-KEYS', 'Florida Keys', 'Active Monitoring',
       'Southern Florida reef tract and open-water approach. Moderate sensor coverage supporting reef stress monitoring.',
       2, '41044 (Harvey Center)', '+1.2°C', 'SW 2.3 kt',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  // ─── Stations (real NDBC IDs, real coordinates) ──────────────────────────
  db.exec(`
    INSERT OR IGNORE INTO stations
      (id, name, slug, region_id, status, summary, location_label,
       latitude, longitude, created_at, updated_at)
    VALUES
      ('41009', 'Canaveral 20 NM ENE', 'ndbc-41009', 'REG-SE-FL', 'active',
       'NOAA NDBC buoy 20 nautical miles northeast of Cape Canaveral.',
       'Cape Canaveral, FL', '28.517', '-80.184',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('41010', 'Canaveral 120 NM ENE', 'ndbc-41010', 'REG-SE-FL', 'active',
       'NOAA NDBC buoy 120 nautical miles northeast of Cape Canaveral.',
       'SE Florida Offshore', '28.876', '-78.476',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('41012', 'St Augustine 40 NM ENE', 'ndbc-41012', 'REG-SE-FL', 'active',
       'NOAA NDBC buoy off the northeast Florida coast near St Augustine.',
       'St Augustine, FL', '30.041', '-80.533',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('41044', 'Harvey Center', 'ndbc-41044', 'REG-FL-KEYS', 'active',
       'NOAA NDBC buoy in the northwest Providence Channel, west of the Bahamas.',
       'W Bahamas', '23.840', '-73.187',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('42036', 'West Tampa', 'ndbc-42036', 'REG-FL-KEYS', 'active',
       'NOAA NDBC buoy in the eastern Gulf of Mexico.',
       'E Gulf of Mexico', '28.500', '-84.517',
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  // ─── Ingestion run (seed provenance for observations FK) ─────────────────
  const seedRunId = "SEED-RUN-001";
  const seedRunStarted = nowSec - 3 * 86400;
  db.prepare(`
    INSERT OR IGNORE INTO ingestion_runs
      (id, source, status, station_count, inserted_rows, rejected_rows,
       started_at, finished_at, created_at, updated_at)
    VALUES (?, 'seed', 'completed', 5, 60, 0, ?, ?,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(seedRunId, seedRunStarted, seedRunStarted + 10);

  // ─── Sample observations: 5 stations × 4 readings/day × 3 days = 60 rows ─
  const stationIds = ["41009", "41010", "41012", "41044", "42036"];
  const hours = [0, 6, 12, 18];

  const insertObs = db.prepare(`
    INSERT OR IGNORE INTO observations
      (id, station_id, source, observed_at,
       sea_surface_temp_c, wave_height_m, wind_speed_mps, pressure_hpa,
       ingestion_run_id, source_timestamp, source_reference, raw_line, created_at)
    VALUES (?, ?, 'seed', ?, ?, ?, ?, ?, ?, ?, 'seed/demo', '', ?)
  `);

  for (let day = 0; day < 3; day++) {
    for (const stationId of stationIds) {
      const base = STATION_BASELINES[stationId];
      for (let hi = 0; hi < hours.length; hi++) {
        const observedAt = nowSec - (2 - day) * 86400 + hours[hi] * 3600;
        const id = `OBS-${stationId}-D${day}-H${hi}`;
        const sst      = +(base.sst      + SST_OFFSETS[hi]      + DAILY_SST_DRIFT[day]).toFixed(2);
        const wave     = +(base.wave     + WAVE_OFFSETS[hi]).toFixed(2);
        const wind     = +(base.wind     + WIND_OFFSETS[hi]).toFixed(1);
        const pressure = +(base.pressure + PRESSURE_OFFSETS[hi]).toFixed(1);
        const sourceTs = new Date(observedAt * 1000).toISOString();
        insertObs.run(id, stationId, observedAt, sst, wave, wind, pressure,
                      seedRunId, sourceTs, observedAt);
      }
    }
  }

  // ─── Map layers ───────────────────────────────────────────────────────────
  db.exec(`
    INSERT OR IGNORE INTO map_layers
      (label, description, active, accent, sort_order, created_at, updated_at)
    VALUES
      ('Sea Surface Temperature',
       'Near-surface ocean temperature from NDBC buoys.',
       1, '#06b6d4', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('Wave Height',
       'Significant wave height in metres from NDBC buoys.',
       1, '#3b82f6', 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
      ('Reef Stress Index',
       'Degree heating weeks from NOAA Coral Reef Watch.',
       0, '#f59e0b', 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `);

  // ─── Signal detections ────────────────────────────────────────────────────
  // signal_detections is not in the shared bootstrap schema; create it here.
  db.exec(`
    CREATE TABLE IF NOT EXISTS signal_detections (
      id                   TEXT PRIMARY KEY,
      signal_type          TEXT,
      severity             TEXT,
      confidence           INTEGER,
      source_type          TEXT,
      source_id            TEXT,
      region               TEXT,
      station_id           TEXT REFERENCES stations(id),
      title                TEXT,
      summary              TEXT,
      detail               TEXT,
      status               TEXT,
      detected_at          INTEGER,
      created_at           INTEGER,
      updated_at           INTEGER,
      linked_investigation_id TEXT
    )
  `);

  const insertSignal = db.prepare(`
    INSERT OR IGNORE INTO signal_detections
      (id, signal_type, severity, confidence, source_type, source_id, region,
       station_id, title, summary, detail, status,
       detected_at, created_at, updated_at, linked_investigation_id)
    VALUES (?, ?, ?, ?, 'ndbc', ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, null)
  `);

  const t1 = nowSec - 3600;
  const t2 = nowSec - 7200;
  const t3 = nowSec - 10800;

  insertSignal.run(
    "SIG-001", "sst_anomaly_high", "critical", 88,
    "41009", "REG-SE-FL", "41009",
    "SST anomaly — Canaveral ENE",
    "Sea surface temperature exceeded seasonal threshold by 0.9°C.",
    "Station 41009 recorded 26.1°C against a 25.2°C 30-day baseline. Anomaly persists over 48 hours.",
    t1, t1, t1,
  );

  insertSignal.run(
    "SIG-002", "wave_height_elevated", "warning", 72,
    "41010", "REG-SE-FL", "41010",
    "Elevated wave height — Canaveral 120 NM ENE",
    "Wave height above seasonal mean; advise caution for small craft.",
    "Station 41010 recording 1.8m significant wave height. 30-day mean: 1.4m.",
    t2, t2, t2,
  );

  insertSignal.run(
    "SIG-003", "sst_anomaly_high", "warning", 65,
    "41044", "REG-FL-KEYS", "41044",
    "SST anomaly — Harvey Center (W Bahamas)",
    "Sea surface temperature 1.2°C above the 30-day baseline in the Providence Channel.",
    "Station 41044 recorded 29.5°C. Coral bleaching threshold watch active.",
    t3, t3, t3,
  );

  // ─── Sample investigation ─────────────────────────────────────────────────
  db.prepare(`
    INSERT OR IGNORE INTO investigations
      (id, title, summary, state, region_id, owner, confidence,
       created_at, updated_at)
    VALUES (?, ?, ?, 'open', 'REG-SE-FL', 'seed', 72,
            CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
  `).run(
    "INV-SEED-001",
    "Elevated SST anomaly — Southeast Florida",
    "Persistent sea surface temperature anomaly detected across the Cape Canaveral corridor. " +
    "Stations 41009 and 41010 both reporting above-baseline conditions over a 48-hour window.",
  );

  db.close();

  console.log(`[seed] Database written to ${dbPath}`);
  console.log(`[seed]   2 regions  : Southeast Florida, Florida Keys`);
  console.log(`[seed]   5 stations : NDBC 41009, 41010, 41012, 41044, 42036`);
  console.log(`[seed]   60 observations : 3 days × 4 readings × 5 stations`);
  console.log(`[seed]   3 signal detections, 1 investigation, 3 map layers`);
  console.log(`[seed] Run 'pnpm --filter api ingest:live' to fetch live NDBC data.`);
}

if (require.main === module) {
  seedDatasetDatabase();
}
