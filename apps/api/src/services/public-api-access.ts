import type { ApiKeyRecord, ApiUsageLogEntry, PublicApiRateLimitStatus } from "@marine/shared";
import {
  generateApiKey,
  hashRawApiKey,
  lookupApiKeyByHash,
  lookupApiKeyById,
  recordApiKeyLastUsed,
  revokeApiKey,
} from "../repositories/api-keys";
import { getUsageSummary, listRecentApiUsage, logApiUsage } from "../repositories/api-usage-log";
import { ensurePublicBillingAccountForKey } from "./public-api-billing";

const TIER_RATE_LIMITS: Record<string, { limit: number; windowSeconds: number }> = {
  free: { limit: 60, windowSeconds: 60 },
  pro: { limit: 300, windowSeconds: 60 },
  enterprise: { limit: 1200, windowSeconds: 60 },
};

function normalizeTier(tier: string | null | undefined): string {
  const normalized = typeof tier === "string" ? tier.trim().toLowerCase() : "";
  return normalized.length > 0 ? normalized : "free";
}

export async function provisionPublicApiKey(input: {
  name: string;
  tier?: string;
  scopes?: string[];
  billingAccountId?: string | null;
}): Promise<
  | { ok: true; key: ApiKeyRecord; rawKey: string }
  | { ok: false; message: string }
> {
  const billingAccount = await ensurePublicBillingAccountForKey({
    name: input.name,
    tier: input.tier ?? null,
    billingAccountId: input.billingAccountId ?? null,
  });

  if (!billingAccount) {
    if (input.billingAccountId) {
      return { ok: false, message: "Billing account unavailable" };
    }

    return { ok: false, message: "Billing account storage unavailable" };
  }

  const result = generateApiKey({
    ...input,
    billingAccountId: billingAccount.id,
  });

  if (result.source !== "db") {
    return { ok: false, message: "API key storage unavailable" };
  }

  if (!result.result.ok) {
    return { ok: false, message: result.result.error };
  }

  return {
    ok: true,
    key: result.result.provisioned.record,
    rawKey: result.result.provisioned.rawKey,
  };
}

export async function authenticatePublicApiKey(rawKey: string): Promise<ApiKeyRecord | null> {
  const normalizedRawKey = typeof rawKey === "string" ? rawKey.trim() : "";

  if (!normalizedRawKey) {
    return null;
  }

  const lookupResult = lookupApiKeyByHash(hashRawApiKey(normalizedRawKey));

  if (lookupResult.source !== "db" || !lookupResult.result.ok) {
    return null;
  }

  const key = lookupResult.result.key;

  if (!key || key.revokedAt) {
    return null;
  }

  return key;
}

export async function readPublicApiKey(id: string): Promise<ApiKeyRecord | null> {
  const result = lookupApiKeyById(id);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.key;
}

export async function touchPublicApiKeyLastUsed(id: string): Promise<ApiKeyRecord | null> {
  const result = recordApiKeyLastUsed(id);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.key;
}

export async function deactivatePublicApiKey(id: string): Promise<ApiKeyRecord | null> {
  const result = revokeApiKey(id);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.key;
}

export async function appendPublicApiUsageEntry(input: {
  keyId: string;
  route: string;
  statusCode: number;
  durationMs?: number | null;
  requestAt?: number;
}): Promise<ApiUsageLogEntry | null> {
  logApiUsage({
    keyId: input.keyId,
    route: input.route,
    statusCode: input.statusCode,
    durationMs: input.durationMs ?? undefined,
  });

  return null;
}

export async function readPublicApiUsageSummary(
  keyId: string,
  from: number,
  to: number,
): Promise<{
  keyId: string;
  from: string;
  to: string;
  totalRequests: number;
  errorCount: number;
  averageDurationMs: number | null;
  lastRequestAt: string | null;
  routeCounts: Array<{ route: string; count: number }>;
} | null> {
  const result = getUsageSummary(keyId, from, to);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.summary;
}

export async function readRecentPublicApiUsage(
  keyId: string,
  from: number,
  to: number,
  limit = 20,
): Promise<ApiUsageLogEntry[] | null> {
  const result = listRecentApiUsage(keyId, from, to, limit);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.entries;
}

export async function computePublicApiRateLimitStatus(
  key: Pick<ApiKeyRecord, "id" | "tier">,
  requestCountInWindow?: number | null,
  nowMs = Date.now(),
): Promise<PublicApiRateLimitStatus> {
  const normalizedTier = normalizeTier(key.tier);
  const policy = TIER_RATE_LIMITS[normalizedTier] ?? TIER_RATE_LIMITS.free;
  const requestsUsed = Math.max(0, requestCountInWindow ?? 0);
  const remaining = Math.max(0, policy.limit - requestsUsed);

  return {
    tier: normalizedTier,
    limit: policy.limit,
    remaining,
    requestsUsed,
    windowSeconds: policy.windowSeconds,
    resetAt: new Date(nowMs + (policy.windowSeconds * 1000)).toISOString(),
  };
}
