import test from "node:test";
import assert from "node:assert/strict";
import {
  encryptMfaSecret,
  decryptMfaSecret,
  isEncryptedMfaSecret,
  resolveMfaSecret,
  storeMfaSecret,
  validateMfaSecretConfig,
  migratePlaintextMfaSecrets,
  type MfaSecretMigratableDb,
} from "./mfa-secret";

// ---------------------------------------------------------------------------
// Test key material
// ---------------------------------------------------------------------------

// 32-byte key expressed as 64 hex chars
const TEST_KEY = "0102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f20";
const OTHER_KEY = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

const PLAIN_SECRET = "JBSWY3DPEHPK3PXP"; // well-known base32 TOTP secret

// ---------------------------------------------------------------------------
// isEncryptedMfaSecret
// ---------------------------------------------------------------------------

test("isEncryptedMfaSecret returns false for plaintext base32 secret", () => {
  assert.equal(isEncryptedMfaSecret(PLAIN_SECRET), false);
});

test("isEncryptedMfaSecret returns false for null", () => {
  assert.equal(isEncryptedMfaSecret(null), false);
});

test("isEncryptedMfaSecret returns false for empty string", () => {
  assert.equal(isEncryptedMfaSecret(""), false);
});

test("isEncryptedMfaSecret returns true for encrypted envelope", () => {
  const envelope = encryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  assert.ok(envelope);
  assert.equal(isEncryptedMfaSecret(envelope), true);
});

// ---------------------------------------------------------------------------
// encryptMfaSecret / decryptMfaSecret round-trip
// ---------------------------------------------------------------------------

test("encryptMfaSecret produces envelope with enc:v1: prefix", () => {
  const envelope = encryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  assert.ok(envelope);
  assert.ok(envelope.startsWith("enc:v1:"), `expected enc:v1: prefix, got ${envelope}`);
});

test("encryptMfaSecret returns null when no key is provided", () => {
  assert.equal(encryptMfaSecret(PLAIN_SECRET, undefined), null);
});

test("encryptMfaSecret returns null when key is empty string", () => {
  assert.equal(encryptMfaSecret(PLAIN_SECRET, ""), null);
});

test("encryptMfaSecret throws when key is wrong length", () => {
  assert.throws(() => encryptMfaSecret(PLAIN_SECRET, "deadbeef"), /32 bytes/);
});

test("encrypt then decrypt recovers the original secret", () => {
  const envelope = encryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  assert.ok(envelope);
  const recovered = decryptMfaSecret(envelope, TEST_KEY);
  assert.equal(recovered, PLAIN_SECRET);
});

test("each encryption produces a different envelope (random IV)", () => {
  const envelope1 = encryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  const envelope2 = encryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  assert.ok(envelope1);
  assert.ok(envelope2);
  assert.notEqual(envelope1, envelope2, "IVs must differ across encryptions");
});

test("decryptMfaSecret returns null when key is wrong", () => {
  const envelope = encryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  assert.ok(envelope);
  const result = decryptMfaSecret(envelope, OTHER_KEY);
  assert.equal(result, null, "wrong key must return null, not throw");
});

test("decryptMfaSecret returns null when envelope is tampered", () => {
  const envelope = encryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  assert.ok(envelope);
  // Flip the last hex char to corrupt the auth tag
  const tampered = envelope.slice(0, -1) + (envelope.endsWith("f") ? "0" : "f");
  const result = decryptMfaSecret(tampered, TEST_KEY);
  assert.equal(result, null, "tampered ciphertext must fail auth tag verification");
});

test("decryptMfaSecret returns null when envelope is malformed", () => {
  assert.equal(decryptMfaSecret("enc:v1:notvalidhex", TEST_KEY), null);
});

test("decryptMfaSecret returns null for null input", () => {
  assert.equal(decryptMfaSecret(null, TEST_KEY), null);
});

// ---------------------------------------------------------------------------
// Backward-compatibility: plaintext pass-through
// ---------------------------------------------------------------------------

test("decryptMfaSecret returns plaintext values unchanged (no key needed)", () => {
  const result = decryptMfaSecret(PLAIN_SECRET, undefined);
  assert.equal(result, PLAIN_SECRET, "plaintext secret must pass through without a key");
});

test("decryptMfaSecret returns plaintext values unchanged even when key is set", () => {
  const result = decryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  assert.equal(result, PLAIN_SECRET, "plaintext secret must pass through transparently");
});

// ---------------------------------------------------------------------------
// resolveMfaSecret / storeMfaSecret (environment-driven)
// ---------------------------------------------------------------------------

test("resolveMfaSecret passes through plaintext when env key is absent", () => {
  const original = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  delete process.env.STATION_ADMIN_MFA_SECRET_KEY;

  try {
    assert.equal(resolveMfaSecret(PLAIN_SECRET), PLAIN_SECRET);
  } finally {
    if (original !== undefined) process.env.STATION_ADMIN_MFA_SECRET_KEY = original;
  }
});

test("storeMfaSecret returns plaintext unchanged when env key is absent", () => {
  const original = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  delete process.env.STATION_ADMIN_MFA_SECRET_KEY;

  try {
    assert.equal(storeMfaSecret(PLAIN_SECRET), PLAIN_SECRET);
  } finally {
    if (original !== undefined) process.env.STATION_ADMIN_MFA_SECRET_KEY = original;
  }
});

test("storeMfaSecret encrypts when env key is set, resolveMfaSecret recovers it", () => {
  const original = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  process.env.STATION_ADMIN_MFA_SECRET_KEY = TEST_KEY;

  try {
    const stored = storeMfaSecret(PLAIN_SECRET);
    assert.ok(isEncryptedMfaSecret(stored), "storeMfaSecret must produce an encrypted envelope");
    const resolved = resolveMfaSecret(stored);
    assert.equal(resolved, PLAIN_SECRET, "resolveMfaSecret must recover the original plaintext");
  } finally {
    if (original !== undefined) {
      process.env.STATION_ADMIN_MFA_SECRET_KEY = original;
    } else {
      delete process.env.STATION_ADMIN_MFA_SECRET_KEY;
    }
  }
});

test("resolveMfaSecret returns null for encrypted secret when env key is absent", () => {
  const keyBackup = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  process.env.STATION_ADMIN_MFA_SECRET_KEY = TEST_KEY;
  const stored = storeMfaSecret(PLAIN_SECRET);
  delete process.env.STATION_ADMIN_MFA_SECRET_KEY;

  try {
    assert.equal(resolveMfaSecret(stored), null, "must deny access when key is removed");
  } finally {
    if (keyBackup !== undefined) process.env.STATION_ADMIN_MFA_SECRET_KEY = keyBackup;
  }
});

// ---------------------------------------------------------------------------
// validateMfaSecretConfig
// ---------------------------------------------------------------------------

test("validateMfaSecretConfig: absent key returns ok:true with a warning", () => {
  const original = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  delete process.env.STATION_ADMIN_MFA_SECRET_KEY;

  try {
    const status = validateMfaSecretConfig();
    assert.equal(status.ok, true);
    assert.equal(status.keyPresent, false);
    assert.equal(status.keyValid, false);
    assert.ok(status.warnings.length > 0, "expected at least one warning");
    assert.equal(status.errors.length, 0);
  } finally {
    if (original !== undefined) process.env.STATION_ADMIN_MFA_SECRET_KEY = original;
  }
});

test("validateMfaSecretConfig: valid 64-char hex key returns ok:true, no warnings", () => {
  const original = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  process.env.STATION_ADMIN_MFA_SECRET_KEY = TEST_KEY;

  try {
    const status = validateMfaSecretConfig();
    assert.equal(status.ok, true);
    assert.equal(status.keyPresent, true);
    assert.equal(status.keyValid, true);
    assert.equal(status.warnings.length, 0);
    assert.equal(status.errors.length, 0);
  } finally {
    if (original !== undefined) {
      process.env.STATION_ADMIN_MFA_SECRET_KEY = original;
    } else {
      delete process.env.STATION_ADMIN_MFA_SECRET_KEY;
    }
  }
});

test("validateMfaSecretConfig: malformed key returns ok:false with an error", () => {
  const original = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  // 8 hex chars — far too short
  process.env.STATION_ADMIN_MFA_SECRET_KEY = "deadbeef";

  try {
    const status = validateMfaSecretConfig();
    assert.equal(status.ok, false);
    assert.equal(status.keyPresent, true);
    assert.equal(status.keyValid, false);
    assert.equal(status.warnings.length, 0);
    assert.ok(status.errors.length > 0, "expected at least one error");
  } finally {
    if (original !== undefined) {
      process.env.STATION_ADMIN_MFA_SECRET_KEY = original;
    } else {
      delete process.env.STATION_ADMIN_MFA_SECRET_KEY;
    }
  }
});

// ---------------------------------------------------------------------------
// migratePlaintextMfaSecrets
// ---------------------------------------------------------------------------

/** Build a minimal in-memory fake DB for migration tests. */
function makeFakeDb(rows: Array<{ id: string; mfa_secret: string | null }>): MfaSecretMigratableDb {
  // Clone so mutations are visible to assertions
  const store = rows;

  return {
    prepare(sql: string) {
      if (sql.startsWith("SELECT")) {
        return {
          all() {
            return store.filter((r) => r.mfa_secret !== null);
          },
          run() {},
        };
      }
      // UPDATE station_admin_credentials SET mfa_secret = ? WHERE id = ? AND mfa_secret = ?
      return {
        all() {
          return [];
        },
        run(newSecret: unknown, id: unknown, oldSecret: unknown) {
          const row = store.find((r) => r.id === id && r.mfa_secret === oldSecret);
          if (row) row.mfa_secret = newSecret as string;
        },
      };
    },
  };
}

test("migratePlaintextMfaSecrets: encrypts plaintext rows and increments migrated count", () => {
  const rows = [{ id: "1", mfa_secret: PLAIN_SECRET }];
  const db = makeFakeDb(rows);
  const result = migratePlaintextMfaSecrets(db, TEST_KEY);

  assert.equal(result.migrated, 1);
  assert.equal(result.skipped, 0);
  assert.ok(
    isEncryptedMfaSecret(rows[0].mfa_secret),
    "row must be updated to an encrypted envelope",
  );
});

test("migratePlaintextMfaSecrets: skips already-encrypted rows", () => {
  const encrypted = encryptMfaSecret(PLAIN_SECRET, TEST_KEY);
  assert.ok(encrypted);
  const rows = [{ id: "1", mfa_secret: encrypted }];
  const db = makeFakeDb(rows);
  const result = migratePlaintextMfaSecrets(db, TEST_KEY);

  assert.equal(result.migrated, 0);
  assert.equal(result.skipped, 1);
  assert.equal(rows[0].mfa_secret, encrypted, "already-encrypted row must not be modified");
});

test("migratePlaintextMfaSecrets: throws when no key is available", () => {
  const original = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  delete process.env.STATION_ADMIN_MFA_SECRET_KEY;

  try {
    const db = makeFakeDb([{ id: "1", mfa_secret: PLAIN_SECRET }]);
    assert.throws(() => migratePlaintextMfaSecrets(db), /required but not configured/);
  } finally {
    if (original !== undefined) process.env.STATION_ADMIN_MFA_SECRET_KEY = original;
  }
});

test("migratePlaintextMfaSecrets: idempotent — second run skips already-migrated rows", () => {
  const rows = [{ id: "1", mfa_secret: PLAIN_SECRET }];
  const db = makeFakeDb(rows);

  const first = migratePlaintextMfaSecrets(db, TEST_KEY);
  assert.equal(first.migrated, 1);

  const second = migratePlaintextMfaSecrets(db, TEST_KEY);
  assert.equal(second.migrated, 0);
  assert.equal(second.skipped, 1);
});
