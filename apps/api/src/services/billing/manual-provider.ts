import type {
  ApiKeyRecord,
  BillingAccountRecord,
  BillingUsageRecord,
  BillingUsageSummary,
  PublicApiQuotaStatus,
} from "@marine/shared";
import {
  BILLING_PLAN_POLICIES,
  getBillingUsageSummary,
  recordBillingUsage,
} from "../../repositories/billing";
import type {
  BillingCostEstimate,
  BillingProvider,
  BillingProviderEstimateInput,
  BillingProviderQuotaInput,
  BillingProviderRecordUsageInput,
  BillingProviderUsageSummaryInput,
} from "./provider";

function normalizeTier(tier: string | null | undefined): "free" | "pro" | "enterprise" {
  const normalized = typeof tier === "string" ? tier.trim().toLowerCase() : "";
  if (normalized === "pro" || normalized === "enterprise") {
    return normalized;
  }

  return "free";
}

function resolvePlan(
  key: Pick<ApiKeyRecord, "tier">,
  billingAccount: BillingAccountRecord | null,
) {
  if (billingAccount) {
    return {
      tier: normalizeTier(billingAccount.tier),
      monthlyQuota: billingAccount.monthlyQuota,
      costPerRequestCents: billingAccount.costPerRequestCents,
    };
  }

  const tier = normalizeTier(key.tier);
  const policy = BILLING_PLAN_POLICIES[tier];
  return {
    tier,
    monthlyQuota: policy.monthlyQuota,
    costPerRequestCents: policy.costPerRequestCents,
  };
}

function billingMonthFromEpochMs(epochMs: number): string {
  const date = new Date(epochMs);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function toQuotaStatus(
  tier: string,
  monthlyQuota: number,
  requestsUsed: number,
  billingMonth: string,
): PublicApiQuotaStatus {
  return {
    tier,
    monthlyQuota,
    remainingQuota: Math.max(0, monthlyQuota - requestsUsed),
    requestsUsed,
    billingMonth,
  };
}

function toUsd(cents: number): number {
  return Math.round((cents / 100) * 100) / 100;
}

export class ManualBillingProvider implements BillingProvider {
  readonly name = "manual";

  async recordUsage(input: BillingProviderRecordUsageInput): Promise<BillingUsageRecord | null> {
    const requestAt = input.requestAt ?? Date.now();
    const units = Math.max(0, Math.floor(input.units ?? 1));
    const estimate = await this.estimateCost({
      key: input.key,
      billingAccount: input.billingAccount,
      units,
    });
    const result = recordBillingUsage({
      keyId: input.key.id,
      billingAccountId: input.billingAccount?.id ?? input.key.billingAccountId ?? null,
      route: input.route,
      statusCode: input.statusCode,
      requestAt,
      units,
      costCents: estimate.estimatedCostCents,
    });

    if (result.source !== "db" || !result.result.ok) {
      return null;
    }

    return result.result.usage;
  }

  async getUsageSummary(input: BillingProviderUsageSummaryInput): Promise<BillingUsageSummary | null> {
    const nowMs = input.nowMs ?? Date.now();
    const plan = resolvePlan(input.key, input.billingAccount);
    const result = getBillingUsageSummary({
      keyId: input.key.id,
      billingAccountId: input.billingAccount?.id ?? input.key.billingAccountId ?? null,
      billingMonth: billingMonthFromEpochMs(nowMs),
      monthlyQuota: plan.monthlyQuota,
      costPerRequestCents: plan.costPerRequestCents,
    });

    if (result.source !== "db" || !result.result.ok) {
      return null;
    }

    return result.result.summary;
  }

  async enforceQuota(input: BillingProviderQuotaInput) {
    const nowMs = input.nowMs ?? Date.now();
    const plan = resolvePlan(input.key, input.billingAccount);
    const billingMonth = billingMonthFromEpochMs(nowMs);
    const summary = await this.getUsageSummary({
      key: input.key,
      billingAccount: input.billingAccount,
      nowMs,
    });
    const requestsUsed = summary?.billableRequests ?? 0;
    const quota = toQuotaStatus(plan.tier, plan.monthlyQuota, requestsUsed, billingMonth);

    if (requestsUsed >= plan.monthlyQuota) {
      return {
        allowed: false,
        quota,
        code: "quota_exceeded" as const,
        message: `Monthly quota exceeded for tier ${plan.tier}`,
        retryable: false,
      };
    }

    return {
      allowed: true,
      quota,
    };
  }

  async estimateCost(input: BillingProviderEstimateInput): Promise<BillingCostEstimate> {
    const plan = resolvePlan(input.key, input.billingAccount);
    const units = Math.max(0, Math.floor(input.units ?? 1));
    const estimatedCostCents = units * plan.costPerRequestCents;

    return {
      units,
      estimatedCostCents,
      estimatedCostUsd: toUsd(estimatedCostCents),
      costPerRequestCents: plan.costPerRequestCents,
    };
  }
}
