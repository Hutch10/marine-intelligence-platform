/**
 * Validates database connectivity for authenticated ingestion (Turso or local SQLite).
 * Never prints secrets. Exit 0 = ready, 1 = misconfigured, 2 = connection failed.
 *
 * Run: pnpm --filter api ingest:env-check
 */

import { getAsyncAdapter, isDatabaseConfigured, usesTursoDatabase } from "../db/async-client";
import { resolveDatabasePath } from "../db/client";

interface EnvCheckResult {
  ok: boolean;
  mode: "turso" | "local_sqlite" | "unconfigured";
  databasePath: string | null;
  tursoUrlHost: string | null;
  authTokenPresent: boolean;
  dbReachable: boolean;
  liveIngestionReportsTable: boolean;
  error: string | null;
}

async function tableExists(adapter: { execute: (sql: string) => Promise<unknown[]> }, name: string): Promise<boolean> {
  const rows = await adapter.execute(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${name}'`,
  );
  return rows.length > 0;
}

export async function runIngestEnvCheck(env = process.env): Promise<EnvCheckResult> {
  const tursoUrl = env.TURSO_DATABASE_URL?.trim() ?? "";
  const authTokenPresent = Boolean(env.TURSO_AUTH_TOKEN?.trim());
  const databasePath = env.MARINE_DB_PATH ? resolveDatabasePath() : resolveDatabasePath();

  if (tursoUrl) {
    if (!authTokenPresent && !tursoUrl.startsWith("file:") && !tursoUrl.includes("localhost")) {
      return {
        ok: false,
        mode: "turso",
        databasePath: null,
        tursoUrlHost: safeHost(tursoUrl),
        authTokenPresent: false,
        dbReachable: false,
        liveIngestionReportsTable: false,
        error: "TURSO_AUTH_TOKEN missing for remote Turso connection",
      };
    }
  } else if (!isDatabaseConfigured(databasePath)) {
    return {
      ok: false,
      mode: "unconfigured",
      databasePath,
      tursoUrlHost: null,
      authTokenPresent: false,
      dbReachable: false,
      liveIngestionReportsTable: false,
      error: "No TURSO_DATABASE_URL and local SQLite file does not exist",
    };
  }

  const mode = tursoUrl ? "turso" : "local_sqlite";

  let adapter;
  try {
    adapter = getAsyncAdapter(false);
  } catch (error) {
    return {
      ok: false,
      mode,
      databasePath: mode === "local_sqlite" ? databasePath : null,
      tursoUrlHost: mode === "turso" ? safeHost(tursoUrl) : null,
      authTokenPresent,
      dbReachable: false,
      liveIngestionReportsTable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  try {
    await adapter.execute("SELECT 1");
    const liveIngestionReportsTable = await tableExists(adapter, "live_ingestion_reports");

    return {
      ok: true,
      mode,
      databasePath: mode === "local_sqlite" ? databasePath : null,
      tursoUrlHost: mode === "turso" ? safeHost(tursoUrl) : null,
      authTokenPresent,
      dbReachable: true,
      liveIngestionReportsTable,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      mode,
      databasePath: mode === "local_sqlite" ? databasePath : null,
      tursoUrlHost: mode === "turso" ? safeHost(tursoUrl) : null,
      authTokenPresent,
      dbReachable: false,
      liveIngestionReportsTable: false,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    adapter.close();
  }
}

function safeHost(url: string): string | null {
  try {
    return new URL(url).host;
  } catch {
    return "invalid-url";
  }
}

async function main(): Promise<void> {
  const result = await runIngestEnvCheck();
  const output = {
    ok: result.ok,
    mode: result.mode,
    database_path: result.databasePath,
    turso_host: result.tursoUrlHost,
    auth_token_present: result.authTokenPresent,
    db_reachable: result.dbReachable,
    live_ingestion_reports_table: result.liveIngestionReportsTable,
    uses_turso: usesTursoDatabase(),
    error: result.error,
  };

  console.log(JSON.stringify(output, null, 2));
  process.exitCode = result.ok ? 0 : result.error?.includes("missing") ? 1 : 2;
}

if (require.main === module) {
  void main();
}
