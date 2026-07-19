import { existsSync } from "fs";
import { resolve } from "path";

export interface SqliteStatementLike {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): unknown;
}

export interface SqliteDatabaseLike {
  prepare(sql: string): SqliteStatementLike;
  close(): void;
}

const DEFAULT_DB_PATH = resolve(process.cwd(), ".data", "marine.sqlite");

export function resolveDatabasePath(): string {
  const configuredPath = process.env.MARINE_DB_PATH;
  console.log("[db/client] env.MARINE_DB_PATH=", configuredPath);
  const path = configuredPath ? resolve(configuredPath) : DEFAULT_DB_PATH;
  console.log("[db/client] resolveDatabasePath:", path);
  return path;
}

export function hasDatabasePath(path = resolveDatabasePath()): boolean {
  const exists = existsSync(path);
  console.log("[db/client] hasDatabasePath:", path, "exists:", exists);
  return exists;
}

export function openReadOnlyDatabase(path = resolveDatabasePath()): SqliteDatabaseLike {
  console.log("[db/client] openReadOnlyDatabase path:", path);
  if (typeof path !== "string" || !path) {
    console.log("[db/client] openReadOnlyDatabase ERROR: path is not a valid string", path);
    throw new Error("Invalid database path for openReadOnlyDatabase");
  }
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (
      path: string,
      options: { open: boolean; readOnly: boolean },
    ) => SqliteDatabaseLike;
  };

  const db = new DatabaseSync(path, { open: true, readOnly: true });
  return db;
}

export function openWritableDatabase(path = resolveDatabasePath()): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (
      path: string,
      options: { open: boolean; readOnly: boolean },
    ) => SqliteDatabaseLike;
  };

  return new DatabaseSync(path, { open: true, readOnly: false });
}
