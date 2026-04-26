import type { ApiKeyRecord } from "@marine/shared";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";

interface ApiKeyRow {
  id: string;
  prefix: string;
  name: string;
  tier: string;
  scopes_json: string;
  billing_account_id: string | null;
  last_used_at: string | null;
  revoked_at: string | null;
  created_at: string;
  updated_at: string;
}

function toApiKeyRecord(row: ApiKeyRow): ApiKeyRecord {
  return {
    id: row.id,
    prefix: row.prefix,
    name: row.name,
    tier: row.tier as ApiKeyRecord["tier"],
    scopes: JSON.parse(row.scopes_json),
    billingAccountId: row.billing_account_id,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    revokedAt: row.revoked_at,
  };
}

export function getApiKey(
  keyId: string,
): ApiKeyRecord | null {
  const resolvePath = resolveDatabasePath;
  const hasPath = hasDatabasePath;
  const openDatabase = openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return null;
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return null;
  }

  try {
    const row = db
      .prepare(
        `SELECT * FROM api_keys WHERE id = ? AND revoked_at IS NULL LIMIT 1`,
      )
      .get(keyId) as ApiKeyRow | undefined;

    return row ? toApiKeyRecord(row) : null;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export function validateApiKey(keyId: string): boolean {
  return getApiKey(keyId) !== null;
}
