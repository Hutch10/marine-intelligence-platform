import test from "node:test";
import assert from "node:assert/strict";
import type { ApiKeyRecord } from "@marine/shared";
import { resolveMarineApiKeyGate } from "./marine-intelligence";

function createKey(overrides: Partial<ApiKeyRecord> = {}): ApiKeyRecord {
  return {
    id: "key_paid_001",
    prefix: "mk_live",
    name: "Paid Key",
    tier: "pro",
    scopes: ["marine.read"],
    billingAccountId: "acct_001",
    createdAt: "2026-03-20T12:00:00.000Z",
    lastUsedAt: null,
    revokedAt: null,
    ...overrides,
  };
}

test("marine API key gate rejects missing key", async () => {
  const result = await resolveMarineApiKeyGate(undefined, () => {
    throw new Error("lookup should not run without a key");
  });

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.status, 401);
  assert.equal(result.message, "API key required");
});

test("marine API key gate rejects inactive key", async () => {
  const result = await resolveMarineApiKeyGate(
    { "x-api-key": "key_inactive_001" },
    () => ({
      source: "db",
      result: { ok: true, key: createKey({ id: "key_inactive_001", revokedAt: "2026-03-21T00:00:00.000Z" }) },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.status, 403);
  assert.equal(result.message, "API key inactive");
});

test("marine API key gate rejects non-paid tier", async () => {
  const result = await resolveMarineApiKeyGate(
    { "x-api-key": "key_free_001" },
    () => ({
      source: "db",
      result: { ok: true, key: createKey({ id: "key_free_001", tier: "free" }) },
    }),
  );

  assert.equal(result.ok, false);
  if (result.ok) {
    return;
  }

  assert.equal(result.status, 403);
  assert.equal(result.message, "API key tier is not enabled for paid access");
});

test("marine API key gate allows active paid key from Authorization bearer", async () => {
  const result = await resolveMarineApiKeyGate(
    { authorization: "Bearer key_paid_001" },
    () => ({
      source: "db",
      result: { ok: true, key: createKey() },
    }),
  );

  assert.equal(result.ok, true);
  if (!result.ok) {
    return;
  }

  assert.equal(result.keyId, "key_paid_001");
  assert.equal(result.tier, "pro");
  assert.equal(result.active, true);
});
