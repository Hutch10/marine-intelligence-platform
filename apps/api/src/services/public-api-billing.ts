import type {
  ApiKeyRecord,
  BillingAccountCreateRequest,
  BillingAccountPlanUpdateRequest,
  BillingAccountRecord,
  BillingUsageRecord,
  BillingUsageSummary,
  PublicApiQuotaStatus,
} from "@marine/shared";
import {
  createBillingAccount,
  getBillingAccountById,
  updateBillingAccountPlan,
} from "../repositories/billing";
import { getBillingProvider } from "./billing";

function normalizeText(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function createPublicBillingAccount(
  input: BillingAccountCreateRequest,
): Promise<BillingAccountRecord | null> {
  const result = createBillingAccount(input);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.account;
}

export async function updatePublicBillingAccountPlan(
  input: BillingAccountPlanUpdateRequest,
): Promise<BillingAccountRecord | null> {
  const result = updateBillingAccountPlan(input);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.account;
}

export async function readPublicBillingAccount(
  billingAccountId: string | null | undefined,
): Promise<BillingAccountRecord | null> {
  const normalizedId = normalizeText(billingAccountId);

  if (!normalizedId) {
    return null;
  }

  const result = getBillingAccountById(normalizedId);

  if (result.source !== "db" || !result.result.ok) {
    return null;
  }

  return result.result.account;
}

export async function ensurePublicBillingAccountForKey(input: {
  name: string;
  email?: string | null;
  tier?: string | null;
  billingAccountId?: string | null;
}): Promise<BillingAccountRecord | null> {
  const existing = await readPublicBillingAccount(input.billingAccountId);
  if (existing) {
    return existing;
  }

  if (normalizeText(input.billingAccountId)) {
    return null;
  }

  return createPublicBillingAccount({
    name: input.name,
    email: input.email ?? null,
    tier:
      input.tier === "pro" || input.tier === "enterprise"
        ? input.tier
        : "free",
  });
}

export async function recordPublicBillableUsage(input: {
  key: ApiKeyRecord;
  billingAccount?: BillingAccountRecord | null;
  route: string;
  statusCode: number;
  requestAt?: number;
  units?: number;
}): Promise<BillingUsageRecord | null> {
  return getBillingProvider().recordUsage({
    key: input.key,
    billingAccount: input.billingAccount ?? null,
    route: input.route,
    statusCode: input.statusCode,
    requestAt: input.requestAt,
    units: input.units,
  });
}

export async function readPublicBillingUsageSummary(input: {
  key: ApiKeyRecord;
  billingAccount?: BillingAccountRecord | null;
  nowMs?: number;
}): Promise<BillingUsageSummary | null> {
  return getBillingProvider().getUsageSummary({
    key: input.key,
    billingAccount: input.billingAccount ?? null,
    nowMs: input.nowMs,
  });
}

export async function enforcePublicBillingQuota(input: {
  key: ApiKeyRecord;
  billingAccount?: BillingAccountRecord | null;
  nowMs?: number;
}): Promise<{
  allowed: boolean;
  quota: PublicApiQuotaStatus;
  code?: "quota_exceeded";
  message?: string;
  retryable?: boolean;
}> {
  return getBillingProvider().enforceQuota({
    key: input.key,
    billingAccount: input.billingAccount ?? null,
    nowMs: input.nowMs,
  });
}

export async function estimatePublicBillingCost(input: {
  key: ApiKeyRecord;
  billingAccount?: BillingAccountRecord | null;
  units?: number;
}) {
  return getBillingProvider().estimateCost({
    key: input.key,
    billingAccount: input.billingAccount ?? null,
    units: input.units,
  });
}
