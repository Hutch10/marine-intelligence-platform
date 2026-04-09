import { mkdirSync } from "fs";
import { dirname } from "path";
import { aiLabWorkspaceData, dataExplorerWorkspaceData } from "../../../web/lib/api/mock-data";
import { resolveDatabasePath } from "./client";

function parseMockRecordCount(value: string): number | null {
  const normalized = value.trim().toUpperCase();
  const numericValue = Number.parseFloat(normalized);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (normalized.endsWith("M")) {
    return Math.round(numericValue * 1_000_000);
  }

  if (normalized.endsWith("K")) {
    return Math.round(numericValue * 1_000);
  }

  return Math.round(numericValue);
}

function getWritableDatabase() {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      exec(sql: string): void;
      prepare(sql: string): {
        run(...params: unknown[]): void;
      };
      close(): void;
    };
  };

  const dbPath = resolveDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new DatabaseSync(dbPath);
  return { dbPath, db };
}

function hashRecoveryCodeForSeed(code: string): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createHash } = runtimeRequire("node:crypto") as {
    createHash: (algorithm: string) => {
      update: (value: string) => {
        digest: (encoding: "hex") => string;
      };
    };
  };

  return createHash("sha256").update(code.trim().replace(/[\-\s]/g, "").toUpperCase()).digest("hex");
}

export function seedDatasetDatabase() {
  const { dbPath, db } = getWritableDatabase();

  db.exec(`CREATE TABLE IF NOT EXISTS stations (
    id TEXT PRIMARY KEY,
    name TEXT,
    slug TEXT UNIQUE,
    region_id TEXT,
    status TEXT,
    summary TEXT,
    location_label TEXT,
    depth_m INTEGER,
    latitude TEXT,
    longitude TEXT,
    last_reported_at TIMESTAMP,
    hero_metric TEXT,
    sponsor_name TEXT,
    operator_name TEXT,
    logo_url TEXT,
    logo_label TEXT,
    exhibit_title TEXT,
    accent_color TEXT,
    public_description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );`);

  db.exec(`CREATE TABLE IF NOT EXISTS signal_detections (
    id TEXT PRIMARY KEY,
    signal_type TEXT,
    severity TEXT,
    confidence INTEGER,
    source_type TEXT,
    source_id TEXT,
    region TEXT,
    station_id TEXT REFERENCES stations(id),
    title TEXT,
    summary TEXT,
    detail TEXT,
    status TEXT,
    detected_at INTEGER,
    created_at INTEGER,
    updated_at INTEGER,
    linked_investigation_id TEXT
  );`);

  // Insert at least 4 stations (one must be 'STA-NPC-01')
  const stations = [
    { id: 'STA-NPC-01', name: 'North Point', slug: 'north-point' },
    { id: 'STA-SWC-02', name: 'Southwest Cove', slug: 'southwest-cove' },
    { id: 'STA-EBC-03', name: 'East Bay', slug: 'east-bay' },
    { id: 'STA-WST-04', name: 'West Station', slug: 'west-station' },
  ];
  const insertStation = db.prepare(`INSERT INTO stations (id, name, slug, status, summary, location_label, created_at, updated_at) VALUES (?, ?, ?, 'active', '', '', strftime('%s','now'), strftime('%s','now'))`);
  for (const s of stations) {
    insertStation.run(s.id, s.name, s.slug);
  }

  // Insert at least 3 signal_detections, one with station_id = 'STA-NPC-01'
  const now = Math.floor(Date.now() / 1000);
  const signals = [
    {
      id: 'SIG-001', signal_type: 'temp_high', severity: 'critical', confidence: 90, source_type: 'auto', source_id: 'SRC-1', region: 'REG-1', station_id: 'STA-NPC-01', title: 'High Temp', summary: 'Temperature anomaly', detail: 'Sea surface temp above threshold', status: 'active', detected_at: now, created_at: now, updated_at: now, linked_investigation_id: null
    },
    {
      id: 'SIG-002', signal_type: 'wave_high', severity: 'warning', confidence: 70, source_type: 'auto', source_id: 'SRC-2', region: 'REG-1', station_id: 'STA-SWC-02', title: 'High Waves', summary: 'Wave anomaly', detail: 'Wave height above threshold', status: 'active', detected_at: now, created_at: now, updated_at: now, linked_investigation_id: null
    },
    {
      id: 'SIG-003', signal_type: 'wind_high', severity: 'info', confidence: 60, source_type: 'auto', source_id: 'SRC-3', region: 'REG-1', station_id: 'STA-EBC-03', title: 'High Wind', summary: 'Wind anomaly', detail: 'Wind speed above threshold', status: 'active', detected_at: now, created_at: now, updated_at: now, linked_investigation_id: null
    },
  ];
  const insertSignal = db.prepare(`INSERT INTO signal_detections (id, signal_type, severity, confidence, source_type, source_id, region, station_id, title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  for (const sig of signals) {
    insertSignal.run(sig.id, sig.signal_type, sig.severity, sig.confidence, sig.source_type, sig.source_id, sig.region, sig.station_id, sig.title, sig.summary, sig.detail, sig.status, sig.detected_at, sig.created_at, sig.updated_at, sig.linked_investigation_id);
  }

  db.close();
  console.log(`Seeded dataset sample DB at ${dbPath}`);
}

if (require.main === module) {
  seedDatasetDatabase();
}
