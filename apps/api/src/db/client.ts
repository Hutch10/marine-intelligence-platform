import { existsSync } from "fs";
import { resolve } from "path";

export interface SqliteStatementLike {
  all(...params: unknown[]): unknown[];
  run?(...params: unknown[]): unknown;
}

export interface SqliteDatabaseLike {
  prepare(sql: string): SqliteStatementLike;
  close(): void;
}

const DEFAULT_DB_PATH = resolve(process.cwd(), ".data", "marine.sqlite");

export function resolveDatabasePath(): string {
  const configuredPath = process.env.MARINE_DB_PATH;
  return configuredPath ? resolve(configuredPath) : DEFAULT_DB_PATH;
}

export function hasDatabasePath(path = resolveDatabasePath()): boolean {
  return existsSync(path);
}

export function openReadOnlyDatabase(path = resolveDatabasePath()): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (
      path: string,
      options: { open: boolean; readOnly: boolean },
    ) => SqliteDatabaseLike;
  };

  return new DatabaseSync(path, { open: true, readOnly: true });
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
