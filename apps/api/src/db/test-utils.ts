import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

import { databaseBootstrap } from "./bootstrap";
import { SqliteDatabaseLike } from "./client";
import { type AsyncDbAdapter, type AsyncDbRow } from "./async-client";
export { SqliteDatabaseLike };

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
  const executableDb = db as SqliteDatabaseLike & { exec?: (sql: string) => void };
  if (typeof executableDb.exec === "function") {
    for (const statement of databaseBootstrap.statements) {
      executableDb.exec(statement);
    }
  }
  // Clean up temp dir on close
  const origClose = db.close.bind(db);
  db.close = () => {
    origClose();
    rmSync(tempDir, { recursive: true, force: true });
  };
  return db;
}

/**
 * Creates an async version of the test database.
 */
export function createAsyncTestDatabase(): AsyncDbAdapter {
  const db = createTestDatabase();
  return {
    async execute(sql: string, params: unknown[] = []): Promise<AsyncDbRow[]> {
      const stmt = db.prepare(sql);
      const upper = sql.trim().toUpperCase();
      const sanitizedParams = params.map(p => p === undefined ? null : p);
      if (
        upper.startsWith("INSERT") ||
        upper.startsWith("UPDATE") ||
        upper.startsWith("DELETE") ||
        upper.startsWith("CREATE")
      ) {
        stmt.run(...sanitizedParams);
        return [];
      } else {
        return stmt.all(...sanitizedParams) as AsyncDbRow[];
      }
    },
    close(): void {
      db.close();
    },
    resourceId: `test-sqlite-async`,
  };
}
