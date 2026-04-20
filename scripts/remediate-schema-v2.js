/**
 * Phase 21C Comprehensive Schema Reinforcement
 * Ensures all intelligence tables exist with truth_partition columns.
 */
const sqlite = require('node:sqlite');
const path = require('node:path');

const DB_PATH = path.resolve(process.cwd(), 'marine.db');
const db = new sqlite.DatabaseSync(DB_PATH);

console.log('--- PHASE 21C SCHEMA REINFORCEMENT ---');

function run(sql) {
  try {
    db.prepare(sql).run();
  } catch (e) {
    if (!e.message.includes('already exists') && !e.message.includes('duplicate column name')) {
      console.error(`  - ERROR: ${e.message}`);
    }
  }
}

// 1. Detections
run(`CREATE TABLE IF NOT EXISTS signal_detections (
  id TEXT PRIMARY KEY,
  station_id TEXT,
  truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'
)`);
run(`ALTER TABLE signal_detections ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'`);

// 2. Events
run(`CREATE TABLE IF NOT EXISTS marine_intelligence_events (
  id TEXT PRIMARY KEY,
  ontology_term_id TEXT,
  event_class TEXT,
  severity TEXT,
  status TEXT,
  title TEXT,
  summary TEXT,
  region TEXT,
  station_id TEXT,
  confidence INTEGER,
  truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH',
  detected_at TEXT,
  created_at TEXT,
  updated_at TEXT
)`);
run(`ALTER TABLE marine_intelligence_events ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'`);

// 3. Investigations
run(`CREATE TABLE IF NOT EXISTS marine_intelligence_investigations (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  title TEXT,
  status TEXT,
  truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH',
  created_at TEXT,
  updated_at TEXT
)`);
run(`ALTER TABLE marine_intelligence_investigations ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'`);

// 4. Alerts
run(`CREATE TABLE IF NOT EXISTS marine_intelligence_alerts (
  id TEXT PRIMARY KEY,
  event_id TEXT,
  investigation_id TEXT,
  severity TEXT,
  status TEXT,
  rule_type TEXT,
  title TEXT,
  truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH',
  detected_at TEXT,
  created_at TEXT,
  updated_at TEXT
)`);
run(`ALTER TABLE marine_intelligence_alerts ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'`);

// 5. Decisions & Summary Tables
run(`CREATE TABLE IF NOT EXISTS marine_intelligence_decisions (
  id TEXT PRIMARY KEY,
  investigation_id TEXT,
  decision TEXT,
  timestamp TEXT,
  truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'
)`);
run(`ALTER TABLE marine_intelligence_decisions ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'`);

run(`CREATE TABLE IF NOT EXISTS marine_intelligence_feedback (
  id TEXT PRIMARY KEY,
  useful INTEGER,
  truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH',
  timestamp TEXT
)`);
run(`ALTER TABLE marine_intelligence_feedback ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'`);

run(`CREATE TABLE IF NOT EXISTS marine_intelligence_telemetry_events (
  id TEXT PRIMARY KEY,
  event_type TEXT,
  truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH',
  timestamp TEXT
)`);
run(`ALTER TABLE marine_intelligence_telemetry_events ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'`);

console.log('Schema reinforced.');
