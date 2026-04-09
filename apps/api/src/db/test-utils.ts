import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { SqliteDatabaseLike } from "./client";
export { SqliteDatabaseLike };
import { migrateTestDatabase } from "./migrate-test";

const { DatabaseSync } = eval("require")("node:sqlite") as {
  DatabaseSync: new (
    path: string,
    options?: { open?: boolean; readOnly?: boolean },
  ) => SqliteDatabaseLike;
};

/**
 * Creates a new in-memory SQLite database for testing, and returns the database handle.
 * The database is automatically deleted when closed.
 */
export function createTestDatabase(): SqliteDatabaseLike {
  // Use a temporary file for isolation, then delete on close
  const tempDir = mkdtempSync(join(tmpdir(), "marine-test-db-"));
  const dbPath = join(tempDir, "marine.sqlite");
  const db = new DatabaseSync(dbPath, { open: true, readOnly: false });
  migrateTestDatabase(db);
  // Clean up temp dir on close
  const origClose = db.close.bind(db);
  db.close = () => {
    origClose();
    rmSync(tempDir, { recursive: true, force: true });
  };
  return db;
}
