import "server-only";

import type {
  ApiKeyRecord,
  ApiUsageLogEntry,
  BillingAccountCreateRequest,
  BillingAccountPlanUpdateRequest,
  BillingAccountRecord,
  BillingUsageRecord,
  BillingUsageSummary,
  PublicApiRateLimitStatus,
  PublicApiQuotaStatus,
  RiskEvaluationFeedbackRequest,
  RiskEvaluationOutcomeRequest,
  RiskEvaluationPredictionRequest,
  RiskEvaluationRecord,
  ValidationSummaryResponse,
} from "@marine/shared";
import {
  appendPublicApiUsageEntry,
  authenticatePublicApiKey,
  computePublicApiRateLimitStatus,
  deactivatePublicApiKey,
  provisionPublicApiKey,
  readPublicApiKey,
  readRecentPublicApiUsage,
  readPublicApiUsageSummary,
  touchPublicApiKeyLastUsed,
} from "../../../api/src/services/public-api-access";
import {
  createPublicBillingAccount,
  enforcePublicBillingQuota,
  estimatePublicBillingCost,
  readPublicBillingAccount,
  readPublicBillingUsageSummary,
  recordPublicBillableUsage,
  updatePublicBillingAccountPlan,
} from "../../../api/src/services/public-api-billing";
import {
  attachPublicRiskEvaluationFeedback,
  attachPublicRiskEvaluationOutcome,
  readPublicValidationSummary,
  recordPublicRiskEvaluation,
} from "../../../api/src/services/public-api-validation";

export async function generatePublicApiKey(input: {
  name: string;
  tier?: string;
  scopes?: string[];
  billingAccountId?: string | null;
}): Promise<
  | { ok: true; key: ApiKeyRecord; rawKey: string }
  | { ok: false; message: string }
> {
  return provisionPublicApiKey(input);
}

export async function authenticatePublicApiKeyRequest(rawKey: string): Promise<ApiKeyRecord | null> {
  return authenticatePublicApiKey(rawKey);
}

export async function getPublicApiKeyById(id: string): Promise<ApiKeyRecord | null> {
  return readPublicApiKey(id);
}

export async function recordPublicApiKeyLastUsed(id: string): Promise<ApiKeyRecord | null> {
  return touchPublicApiKeyLastUsed(id);
}

export async function revokePublicApiKey(id: string): Promise<ApiKeyRecord | null> {
  return deactivatePublicApiKey(id);
}

export async function appendPublicApiUsage(input: {
  keyId: string;
  route: string;
  statusCode: number;
  durationMs?: number | null;
  requestAt?: number;
}): Promise<ApiUsageLogEntry | null> {
  return appendPublicApiUsageEntry(input);
}

export async function getPublicApiUsageSummary(
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
  return readPublicApiUsageSummary(keyId, from, to);
}

export async function getRecentPublicApiUsage(
  keyId: string,
  from: number,
  to: number,
  limit = 20,
): Promise<ApiUsageLogEntry[] | null> {
  return readRecentPublicApiUsage(keyId, from, to, limit);
}

export async function getPublicApiRateLimitStatus(
  key: Pick<ApiKeyRecord, "id" | "tier">,
  requestCountInWindow?: number | null,
  nowMs?: number,
): Promise<PublicApiRateLimitStatus> {
  return computePublicApiRateLimitStatus(key, requestCountInWindow, nowMs);
}

export async function createManualBillingAccount(
  input: BillingAccountCreateRequest,
): Promise<BillingAccountRecord | null> {
  return createPublicBillingAccount(input);
}

export async function updateManualBillingAccountPlan(
  input: BillingAccountPlanUpdateRequest,
): Promise<BillingAccountRecord | null> {
  return updatePublicBillingAccountPlan(input);
}

export async function getPublicBillingAccount(
  billingAccountId: string | null | undefined,
): Promise<BillingAccountRecord | null> {
  return readPublicBillingAccount(billingAccountId);
}

export async function recordPublicBillingUsage(input: {
  key: ApiKeyRecord;
  billingAccount?: BillingAccountRecord | null;
  route: string;
  statusCode: number;
  requestAt?: number;
  units?: number;
}): Promise<BillingUsageRecord | null> {
  return recordPublicBillableUsage(input);
}

export async function getPublicBillingUsageSummary(input: {
  key: ApiKeyRecord;
  billingAccount?: BillingAccountRecord | null;
  nowMs?: number;
}): Promise<BillingUsageSummary | null> {
  return readPublicBillingUsageSummary(input);
}

export async function getPublicBillingQuotaStatus(input: {
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
  return enforcePublicBillingQuota(input);
}

export async function estimatePublicBilling(input: {
  key: ApiKeyRecord;
  billingAccount?: BillingAccountRecord | null;
  units?: number;
}) {
  return estimatePublicBillingCost(input);
}

export async function recordPublicRiskEvaluationPrediction(
  input: RiskEvaluationPredictionRequest,
): Promise<RiskEvaluationRecord | null> {
  return recordPublicRiskEvaluation(input);
}

export async function attachPublicRiskOutcome(
  input: RiskEvaluationOutcomeRequest,
): Promise<RiskEvaluationRecord | null> {
  return attachPublicRiskEvaluationOutcome(input);
}

export async function attachPublicRiskFeedback(
  input: RiskEvaluationFeedbackRequest,
): Promise<RiskEvaluationRecord | null> {
  return attachPublicRiskEvaluationFeedback(input);
}

export async function getPublicValidationSummary(input: {
  stationId?: string | null;
  since?: string | null;
}): Promise<ValidationSummaryResponse | null> {
  return readPublicValidationSummary(input);
}
