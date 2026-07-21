import { resolve } from "path";
import { existsSync } from "fs";

export interface AsyncDbRow {
  [column: string]: any;
}

export interface AsyncDbAdapter {
  execute(sql: string, params?: unknown[]): Promise<AsyncDbRow[]>;
  close(): void;
  readonly resourceId: string;
}

const DEFAULT_DB_PATH = resolve(process.cwd(), ".data", "marine.sqlite");

export function resolveDatabasePath(): string {
  const configuredPath = process.env.MARINE_DB_PATH;
  return configuredPath ? resolve(configuredPath) : DEFAULT_DB_PATH;
}

export function hasDatabasePath(path = resolveDatabasePath()): boolean {
  return existsSync(path);
}

// Scaffolded local adapter wrapping node:sqlite for development
export function createLocalAdapter(path = resolveDatabasePath(), readOnly = true): AsyncDbAdapter {
  if (typeof path !== "string" || !path) {
    throw new Error("Invalid database path for createLocalAdapter");
  }
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (
      path: string,
      options: { open: boolean; readOnly: boolean },
    ) => any;
  };

  const db = new DatabaseSync(path, { open: true, readOnly });
  if (!readOnly) {
    db.prepare("PRAGMA journal_mode = WAL").run();
    db.prepare("PRAGMA busy_timeout = 5000").run();
  }

  return {
    async execute(sql: string, params: unknown[] = []): Promise<AsyncDbRow[]> {
      const stmt = db.prepare(sql);
      if (typeof stmt.run === "function" && sql.trim().toUpperCase().startsWith("INSERT") || sql.trim().toUpperCase().startsWith("UPDATE") || sql.trim().toUpperCase().startsWith("DELETE") || sql.trim().toUpperCase().startsWith("CREATE")) {
        stmt.run(...params);
        return [];
      } else {
        return stmt.all(...params) as AsyncDbRow[];
      }
    },
    close(): void {
      db.close();
    },
    resourceId: `sqlite:${resolve(path)}`,
  };
}

// Scaffolded Turso adapter
function loadLibsqlClient(): { createClient: (config: { url: string; authToken?: string }) => { execute: (query: { sql: string; args?: unknown[] }) => Promise<{ rows: unknown[] }>; close: () => void } } {
  const runtimeRequire = eval("require") as NodeRequire;
  const bundledPath = resolve(__dirname, "../../../node_modules/@libsql/client");

  try {
    return runtimeRequire("@libsql/client");
  } catch {
    return runtimeRequire(bundledPath);
  }
}

export function createTursoAdapter(url: string, authToken?: string): AsyncDbAdapter {
  const { createClient } = loadLibsqlClient();
  
  const client = createClient({
    url,
    authToken,
  });

  return {
    async execute(sql: string, params: unknown[] = []): Promise<AsyncDbRow[]> {
      const result = await client.execute({ sql, args: params as any });
      return result.rows as AsyncDbRow[];
    },
    close(): void {
      client.close();
    },
    resourceId: `turso:${url}`,
  };
}

export function getAsyncAdapter(readOnly = true): AsyncDbAdapter {
  const tursoUrl = process.env.TURSO_DATABASE_URL;
  const tursoToken = process.env.TURSO_AUTH_TOKEN;

  if (tursoUrl) {
    // Fail-closed: Ensure token is present for non-local Turso URLs
    if (!tursoToken && !tursoUrl.startsWith("file:") && !tursoUrl.includes("localhost") && !tursoUrl.includes("127.0.0.1")) {
      throw new Error("FAIL-CLOSED: TURSO_DATABASE_URL is set but TURSO_AUTH_TOKEN is missing for a remote connection.");
    }
    return createTursoAdapter(tursoUrl, tursoToken);
  }

  // Fail-closed in production: ephemeral/missing SQLite is not a safe fallback.
  if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
    throw new Error(
      "FAIL-CLOSED: TURSO_DATABASE_URL is not set. Configure TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for production.",
    );
  }

  return createLocalAdapter(resolveDatabasePath(), readOnly);
}
