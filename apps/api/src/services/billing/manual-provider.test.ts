import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import { closeSync, openSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { ApiKeyRecord, BillingAccountRecord } from "@marine/shared";
import { createBillingAccount } from "../../repositories/billing";
import { ManualBillingProvider } from "./manual-provider";

const tempPaths: string[] = [];

afterEach(() => {
  delete process.env.MARINE_DB_PATH;

  while (tempPaths.length > 0) {
    const path = tempPaths.pop();
    if (path) {
      rmSync(path, { force: true });
    }
  }
});

function createTempDbPath() {
  const dbPath = join(tmpdir(), `marine-billing-${Date.now()}-${tempPaths.length + 1}.sqlite`);
  closeSync(openSync(dbPath, "w"));
  tempPaths.push(dbPath);
  process.env.MARINE_DB_PATH = dbPath;
  return dbPath;
}

function makeKey(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: "APIKEY-1",
    prefix: "mrk_test",
    name: "Pilot Key",
    tier: "pro",
    scopes: ["read"],
    billingAccountId: "BACC-1",
    createdAt: "2026-03-24T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

function makeAccount(overrides: Partial<BillingAccountRecord> = {}): BillingAccountRecord {
  return {
    id: "BACC-1",
    provider: "manual",
    externalCustomerId: null,
    name: "Pilot Customer",
    email: null,
    tier: "pro",
    status: "active",
    monthlyQuota: 3,
    costPerRequestCents: 2,
    createdAt: "2026-03-24T12:00:00.000Z",
    updatedAt: "2026-03-24T12:00:00.000Z",
    ...overrides,
  };
}

test("manual billing provider records usage, summarizes usage, estimates cost, and enforces quota", async () => {
  createTempDbPath();
  const provider = new ManualBillingProvider();
  const accountResult = createBillingAccount({
    name: "Pilot Customer",
    tier: "pro",
  });

  assert.equal(accountResult.source, "db");
  if (accountResult.source !== "db" || !accountResult.result.ok) {
    return;
  }

  const account = makeAccount({ id: accountResult.result.account.id });
  const key = makeKey({ billingAccountId: account.id, tier: account.tier });

  const estimate = await provider.estimateCost({
    key,
    billingAccount: account,
    units: 4,
  });
  assert.deepEqual(estimate, {
    units: 4,
    estimatedCostCents: 8,
    estimatedCostUsd: 0.08,
    costPerRequestCents: 2,
  });

  const usageOne = await provider.recordUsage({
    key,
    billingAccount: account,
    route: "/api/v1/risk/score",
    statusCode: 200,
    requestAt: Date.parse("2026-03-24T12:00:00.000Z"),
  });
  const usageTwo = await provider.recordUsage({
    key,
    billingAccount: account,
    route: "/api/v1/risk/evaluate",
    statusCode: 200,
    requestAt: Date.parse("2026-03-24T12:01:00.000Z"),
  });

  assert.equal(usageOne?.costCents, 2);
  assert.equal(usageTwo?.costCents, 2);

  const summary = await provider.getUsageSummary({
    key,
    billingAccount: account,
    nowMs: Date.parse("2026-03-24T12:05:00.000Z"),
  });

  assert.deepEqual(summary, {
    provider: "manual",
    keyId: "APIKEY-1",
    billingAccountId: account.id,
    billingMonth: "2026-03",
    billableRequests: 2,
    estimatedCostCents: 4,
    estimatedCostUsd: 0.04,
    costPerRequestCents: 2,
    remainingQuota: 1,
  });

  const beforeLimit = await provider.enforceQuota({
    key,
    billingAccount: account,
    nowMs: Date.parse("2026-03-24T12:05:00.000Z"),
  });
  assert.equal(beforeLimit.allowed, true);
  assert.equal(beforeLimit.quota.remainingQuota, 1);

  await provider.recordUsage({
    key,
    billingAccount: account,
    route: "/api/v1/alerts",
    statusCode: 200,
    requestAt: Date.parse("2026-03-24T12:02:00.000Z"),
  });

  const exceeded = await provider.enforceQuota({
    key,
    billingAccount: account,
    nowMs: Date.parse("2026-03-24T12:06:00.000Z"),
  });
  assert.equal(exceeded.allowed, false);
  assert.equal(exceeded.code, "quota_exceeded");
  assert.equal(exceeded.quota.monthlyQuota, 3);
  assert.equal(exceeded.quota.requestsUsed, 3);
  assert.equal(exceeded.quota.remainingQuota, 0);
});
