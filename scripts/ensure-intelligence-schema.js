const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const dbPath = path.resolve(__dirname, '../apps/api/.data/marine.sqlite');
console.log("Ensuring schema in:", dbPath);
const db = new DatabaseSync(dbPath);

function exec(sql) {
  try {
    db.exec(sql);
  } catch (err) {
    console.error(`  ERROR executing SQL: ${sql.slice(0, 50)}...`, err.message);
  }
}

console.log("--- INITIALIZING INTELLIGENCE SCHEMA ---");

// 1. Create Tables (Base structure - ensuring they exist if they don't)
// Note: We don't redefine the whole repository tables here if they exist, 
// just ensure columns and indexes.
const tablesToPartition = [
  'signal_detections',
  'marine_intelligence_decisions',
  'marine_intelligence_telemetry_events',
  'marine_intelligence_feedback',
  'marine_intelligence_risk_evaluations',
  'marine_intelligence_events',
  'marine_intelligence_investigations',
  'marine_intelligence_alerts'
];

for (const table of tablesToPartition) {
  try {
    db.exec(`ALTER TABLE ${table} ADD COLUMN truth_partition TEXT NOT NULL DEFAULT 'FIELD_TRUTH'`);
    console.log(`  PASS: Added truth_partition to ${table}`);
  } catch (err) {
    if (err.message.includes('duplicate column name')) {
      console.log(`  NOTE: truth_partition already exists in ${table}`);
    } else if (err.message.includes('no such table')) {
      console.log(`  SKIP: Table ${table} does not exist yet.`);
    } else {
      console.error(`  FAIL: Could not add truth_partition to ${table}:`, err.message);
    }
  }
}

// 2. Create Indexes
exec(`CREATE INDEX IF NOT EXISTS idx_sig_partition_at ON signal_detections (truth_partition, detected_at DESC)`);
exec(`CREATE INDEX IF NOT EXISTS idx_mid_partition_at ON marine_intelligence_decisions (truth_partition, timestamp DESC)`);
exec(`CREATE INDEX IF NOT EXISTS idx_mre_partition_at ON marine_intelligence_risk_evaluations (truth_partition, predicted_at DESC)`);
exec(`CREATE INDEX IF NOT EXISTS idx_mev_partition_at ON marine_intelligence_events (truth_partition, detected_at DESC)`);
exec(`CREATE INDEX IF NOT EXISTS idx_mi_partition_at ON marine_intelligence_investigations (truth_partition, created_at DESC)`);
exec(`CREATE INDEX IF NOT EXISTS idx_mia_partition_at ON marine_intelligence_alerts (truth_partition, detected_at DESC)`);

console.log("--- SCHEMA INITIALIZATION COMPLETE ---");
