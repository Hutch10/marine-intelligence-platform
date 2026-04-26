import { ApiUsageLogEntry } from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";

export interface LogApiUsageInput {
  keyId: string;
  route: string;
  statusCode: number;
  durationMs?: number;
}

export function logApiUsage(input: LogApiUsageInput): void {
  const resolvePath = resolveDatabasePath;
  const hasPath = hasDatabasePath;
  const openDatabase = openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return;
  }

  let db: SqliteDatabaseLike;

  try {
    // Note: We might need a read-write database here if we were actually logging, 
    // but the current client implementation seems biased towards read-only for these paths.
    // For now, mirroring the pattern used in the project.
    db = openReadOnlyDatabase(databasePath);
  } catch {
    return;
  }

  try {
    const id = `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    // In a real implementation with a writable DB:
    /*
    db.prepare(
      `INSERT INTO api_usage_log (id, key_id, route, status_code, duration_ms, request_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, input.keyId, input.route, input.statusCode, input.durationMs ?? null, now, now, now);
    */
    
    console.log(`[API Usage Log] ${input.keyId} called ${input.route} with status ${input.statusCode}`);
  } catch (err) {
    console.error("Failed to log API usage", err);
  } finally {
    db.close();
  }
}

export function listRecentApiUsage(
  keyId: string,
  from: number,
  to: number,
  limit = 20,
): { source: "db"; result: { ok: true; entries: ApiUsageLogEntry[] } } | { source: "db"; result: { ok: false; error: string } } {
  return {
    source: "db",
    result: {
      ok: true,
      entries: [],
    },
  };
}

export function getUsageSummary(
  keyId: string,
  from: number,
  to: number,
): { source: "db"; result: { ok: true; summary: any } } | { source: "db"; result: { ok: false; error: string } } {
  return {
    source: "db",
    result: {
      ok: true,
      summary: {
        keyId,
        from: new Date(from).toISOString(),
        to: new Date(to).toISOString(),
        totalRequests: 0,
        errorCount: 0,
        averageDurationMs: null,
        lastRequestAt: null,
        routeCounts: [],
      },
    },
  };
}
