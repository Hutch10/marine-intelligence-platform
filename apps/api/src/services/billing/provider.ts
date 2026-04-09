import type {
  ApiKeyRecord,
  BillingAccountRecord,
  BillingUsageRecord,
  BillingUsageSummary,
  PublicApiQuotaStatus,
} from "@marine/shared";

export interface BillingCostEstimate {
  units: number;
  estimatedCostCents: number;
  estimatedCostUsd: number;
  costPerRequestCents: number;
}

export interface BillingQuotaEnforcement {
  allowed: boolean;
  quota: PublicApiQuotaStatus;
  code?: "quota_exceeded";
  message?: string;
  retryable?: boolean;
}

export interface BillingProviderRecordUsageInput {
  key: ApiKeyRecord;
  billingAccount: BillingAccountRecord | null;
  route: string;
  statusCode: number;
  requestAt?: number;
  units?: number;
}

export interface BillingProviderUsageSummaryInput {
  key: ApiKeyRecord;
  billingAccount: BillingAccountRecord | null;
  nowMs?: number;
}

export interface BillingProviderQuotaInput {
  key: ApiKeyRecord;
  billingAccount: BillingAccountRecord | null;
  nowMs?: number;
}

export interface BillingProviderEstimateInput {
  key: ApiKeyRecord;
  billingAccount: BillingAccountRecord | null;
  units?: number;
}

export interface BillingProvider {
  readonly name: string;
  recordUsage(input: BillingProviderRecordUsageInput): Promise<BillingUsageRecord | null>;
  getUsageSummary(input: BillingProviderUsageSummaryInput): Promise<BillingUsageSummary | null>;
  enforceQuota(input: BillingProviderQuotaInput): Promise<BillingQuotaEnforcement>;
  estimateCost(input: BillingProviderEstimateInput): Promise<BillingCostEstimate>;
}
