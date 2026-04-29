import assert from "node:assert/strict";
import test from 'node:test';
const { existsSync, mkdtempSync, rmSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");
const { seedDatasetDatabase } = require("./seed-datasets");

const DatabaseSync = eval("require")("node:sqlite").DatabaseSync;
const tempDirs: string[] = [];
test("seed datasets creates a usable demo database with station-linked signal rows", async (t: any) => {
  t.after(() => {
    delete process.env.MARINE_DB_PATH;
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  const tempDir = mkdtempSync(join(tmpdir(), "marine-seed-"));
  tempDirs.push(tempDir);

  const dbPath = join(tempDir, "marine.sqlite");
  process.env.MARINE_DB_PATH = dbPath;

  seedDatasetDatabase();

  assert.equal(existsSync(dbPath), true);

  const db = new DatabaseSync(dbPath, { open: true, readOnly: true });
  const stationRows = db.prepare("SELECT COUNT(*) AS total FROM stations").all();
  const signalRows = db.prepare("SELECT COUNT(*) AS total FROM signal_detections").all();
  const regionRows = db.prepare("SELECT COUNT(*) AS total FROM regions").all();
  const obsRows = db.prepare("SELECT COUNT(*) AS total FROM observations").all();
  const stationLinkedSignalRows = db.prepare("SELECT COUNT(*) AS total FROM signal_detections WHERE station_id IS NOT NULL").all();

  assert.ok(Number(stationRows[0]?.total ?? 0) >= 4);
  assert.ok(Number(signalRows[0]?.total ?? 0) >= 3);
  assert.ok(Number(regionRows[0]?.total ?? 0) >= 1, "at least one region must be seeded");
  assert.ok(Number(obsRows[0]?.total ?? 0) >= 30, "at least 30 sample observations must be seeded");
  assert.ok(Number(stationLinkedSignalRows[0]?.total ?? 0) >= 1);

  db.close();
});
// Removed extra closing brace
