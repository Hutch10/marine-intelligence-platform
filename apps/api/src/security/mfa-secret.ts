/**
 * MFA secret at-rest encryption utility.
 *
 * Uses AES-256-GCM for authenticated encryption of TOTP secrets stored in
 * the `mfa_secret` column of `station_admin_credentials`.
 *
 * ## Envelope format
 *
 *   enc:v1:<hex-iv>:<hex-ciphertext+authtag>
 *
 * - `enc:v1:` prefix makes encrypted values unambiguously detectable.
 * - IV is 12 random bytes (96-bit) — unique per encryption call.
 * - Ciphertext and 16-byte GCM auth tag are concatenated and hex-encoded.
 *
 * ## Key material
 *
 * Set `STATION_ADMIN_MFA_SECRET_KEY` to a 64-character hex string (32 bytes /
 * 256 bits). Generate one with:
 *
 *   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * ## Migration path
 *
 * 1. Generate a key and set the env var in production secrets management.
 * 2. New enrollments (via POST /station-admin/mfa/enroll/verify) will
 *    automatically store encrypted secrets.
 * 3. Existing plaintext secrets continue to work transparently — the
 *    `resolveMfaSecret` function decrypts if the envelope prefix is present,
 *    otherwise returns the value as-is (backward compatibility).
 * 4. To encrypt existing secrets: re-enroll affected admins, or run a
 *    one-time migration script that reads each plaintext secret, encrypts it,
 *    and writes it back. No schema change is required.
 * 5. Once all secrets are encrypted: add a startup check that validates the
 *    key is set, to prevent future plaintext secrets from being stored.
 *
 * ## Key rotation
 *
 * 1. Add the new key as `STATION_ADMIN_MFA_SECRET_KEY_NEXT`.
 * 2. On read: if decryption with the current key fails, try the next key.
 * 3. On write: always encrypt with the current (new) key.
 * 4. After all secrets are re-encrypted: promote the next key to current.
 */

const ENVELOPE_PREFIX = "enc:v1:";

// ---------------------------------------------------------------------------
// Module-level key format guard
//
// If STATION_ADMIN_MFA_SECRET_KEY is set but malformed we throw at import time
// so the process fails fast rather than silently falling back to plaintext.
// An absent key is allowed (plaintext fallback mode) — warn via
// validateMfaSecretConfig() at startup instead of throwing here.
// ---------------------------------------------------------------------------

((): void => {
  const raw = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  if (!raw) return; // absent key — fallback mode, see validateMfaSecretConfig()
  if (!/^[0-9a-fA-F]{64}$/.test(raw)) {
    throw new Error(
      `[mfa-secret] STATION_ADMIN_MFA_SECRET_KEY is configured but invalid. ` +
        `Expected exactly 64 hex characters (32 bytes); got ${raw.length} characters.`,
    );
  }
})();
const IV_BYTES = 12; // 96-bit IV for GCM
const AUTH_TAG_BYTES = 16;
const KEY_BYTES = 32; // 256-bit key
const ALGORITHM = "aes-256-gcm";

// ---------------------------------------------------------------------------
// Crypto helpers
// ---------------------------------------------------------------------------

function getCrypto(): {
  createCipheriv: (alg: string, key: Buffer, iv: Buffer) => {
    update: (data: string, inputEnc: string, outputEnc: string) => string;
    final: (enc: string) => string;
    getAuthTag: () => Buffer;
  };
  createDecipheriv: (alg: string, key: Buffer, iv: Buffer) => {
    setAuthTag: (tag: Buffer) => void;
    update: (data: string, inputEnc: string, outputEnc: string) => string;
    final: (enc: string) => string;
  };
  randomBytes: (size: number) => Buffer;
} {
  const runtimeRequire = eval("require") as NodeRequire;
  return runtimeRequire("node:crypto");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns true if `value` is an encrypted MFA secret in the supported
 * envelope format. Use this to distinguish encrypted from plaintext values
 * during the migration transition period.
 */
export function isEncryptedMfaSecret(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith(ENVELOPE_PREFIX);
}

/**
 * Encrypt a TOTP secret for at-rest storage.
 *
 * Returns the encrypted envelope string, or null if `keyHex` is not provided.
 * When null is returned the caller should fall back to plaintext storage.
 *
 * @param plaintext  Base32-encoded TOTP secret from generateTotpSecret()
 * @param keyHex     64-character hex key (STATION_ADMIN_MFA_SECRET_KEY)
 */
export function encryptMfaSecret(plaintext: string, keyHex: string | undefined): string | null {
  if (!keyHex) {
    return null;
  }

  const keyBuffer = Buffer.from(keyHex, "hex");
  if (keyBuffer.length !== KEY_BYTES) {
    throw new Error(
      `MFA secret encryption key must be ${KEY_BYTES} bytes (${KEY_BYTES * 2} hex chars); got ${keyBuffer.length} bytes`,
    );
  }

  const crypto = getCrypto();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  const ciphertext = cipher.update(plaintext, "utf8", "hex") + cipher.final("hex");
  const authTag = cipher.getAuthTag();

  // Concatenate ciphertext + auth tag into a single hex blob
  const payload = ciphertext + authTag.toString("hex");
  return `${ENVELOPE_PREFIX}${iv.toString("hex")}:${payload}`;
}

/**
 * Decrypt an encrypted MFA secret.
 *
 * If the value does not have the encrypted envelope prefix, returns the
 * value unchanged (backward-compatible plaintext pass-through).
 *
 * Returns null if decryption fails (wrong key, corrupted value, etc.).
 *
 * @param value   Value read from the `mfa_secret` column
 * @param keyHex  64-character hex key (STATION_ADMIN_MFA_SECRET_KEY)
 */
export function decryptMfaSecret(value: string | null, keyHex: string | undefined): string | null {
  if (!value) {
    return null;
  }

  // Pass through plaintext values (migration transition support)
  if (!isEncryptedMfaSecret(value)) {
    return value;
  }

  if (!keyHex) {
    // Key not configured — cannot decrypt. Return null to deny access.
    return null;
  }

  try {
    const body = value.slice(ENVELOPE_PREFIX.length);
    const colonIdx = body.indexOf(":");
    if (colonIdx === -1) {
      return null;
    }

    const ivHex = body.slice(0, colonIdx);
    const payloadHex = body.slice(colonIdx + 1);

    if (ivHex.length !== IV_BYTES * 2 || payloadHex.length < AUTH_TAG_BYTES * 2) {
      return null;
    }

    // Last AUTH_TAG_BYTES*2 hex chars are the auth tag
    const ctHex = payloadHex.slice(0, payloadHex.length - AUTH_TAG_BYTES * 2);
    const tagHex = payloadHex.slice(payloadHex.length - AUTH_TAG_BYTES * 2);

    const keyBuffer = Buffer.from(keyHex, "hex");
    if (keyBuffer.length !== KEY_BYTES) {
      return null;
    }

    const crypto = getCrypto();
    const iv = Buffer.from(ivHex, "hex");
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(Buffer.from(tagHex, "hex"));
    const plaintext = decipher.update(ctHex, "hex", "utf8") + decipher.final("utf8");
    return plaintext;
  } catch {
    // GCM auth tag mismatch or other decryption error
    return null;
  }
}

/**
 * Resolve the TOTP secret to use for verification.
 *
 * Reads `STATION_ADMIN_MFA_SECRET_KEY` from the environment and decrypts
 * if the stored value is an encrypted envelope. Falls back to plaintext
 * for unencrypted values stored before encryption was enabled.
 *
 * Returns null if the secret cannot be resolved (missing, corrupt, wrong key).
 */
export function resolveMfaSecret(storedValue: string | null): string | null {
  const keyHex = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  return decryptMfaSecret(storedValue, keyHex);
}

/**
 * Encrypt a TOTP secret for storage, reading the key from the environment.
 *
 * Returns the plaintext unchanged if `STATION_ADMIN_MFA_SECRET_KEY` is not
 * set (defers encryption until the operator configures the key).
 */
export function storeMfaSecret(plaintext: string): string {
  const keyHex = process.env.STATION_ADMIN_MFA_SECRET_KEY;
  return encryptMfaSecret(plaintext, keyHex) ?? plaintext;
}

// ---------------------------------------------------------------------------
// Startup configuration validation
// ---------------------------------------------------------------------------

/**
 * Result of a `validateMfaSecretConfig` call.
 */
export interface MfaSecretConfigStatus {
  /** True if STATION_ADMIN_MFA_SECRET_KEY is present AND well-formed. */
  keyPresent: boolean;
  keyValid: boolean;
  /** Non-fatal notices. Log as warnings; the server can still start. */
  warnings: string[];
  /** Fatal misconfigurations. Log as errors; the server should not serve MFA traffic. */
  errors: string[];
}

/**
 * Validate the MFA secret key configuration.
 *
 * Call this at application startup and act on the result:
 *
 *   const status = validateMfaSecretConfig();
 *   for (const w of status.warnings) console.warn("[startup]", w);
 *   for (const e of status.errors)   console.error("[startup]", e);
 *   if (!status.ok) process.exit(1); // or equivalent
 *
 * Policy:
 * - Key absent → warning only (plaintext fallback active; acceptable in dev/migration period).
 * - Key present and valid → no warnings or errors.
 * - Key present but malformed → error (module-level guard also throws; this function is
 *   provided for explicit startup reporting in environments where the module-level throw
 *   is caught and re-reported).
 */
export function validateMfaSecretConfig(): MfaSecretConfigStatus & { ok: boolean } {
  const keyHex = process.env.STATION_ADMIN_MFA_SECRET_KEY;

  if (!keyHex) {
    return {
      ok: true, // Server can start; security is degraded but not broken.
      keyPresent: false,
      keyValid: false,
      warnings: [
        "STATION_ADMIN_MFA_SECRET_KEY is not configured. " +
          "MFA secrets will be stored and compared in plaintext. " +
          "Generate a key with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\" " +
          "and set it as STATION_ADMIN_MFA_SECRET_KEY.",
      ],
      errors: [],
    };
  }

  if (!/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    return {
      ok: false,
      keyPresent: true,
      keyValid: false,
      warnings: [],
      errors: [
        `STATION_ADMIN_MFA_SECRET_KEY is set but invalid: ` +
          `expected 64 hex chars (32 bytes), got ${keyHex.length} chars.`,
      ],
    };
  }

  return { ok: true, keyPresent: true, keyValid: true, warnings: [], errors: [] };
}

// ---------------------------------------------------------------------------
// Plaintext → encrypted migration helper
// ---------------------------------------------------------------------------

/** Minimal DB interface required by migratePlaintextMfaSecrets. */
export interface MfaSecretMigratableDb {
  prepare(sql: string): {
    all(...params: unknown[]): unknown[];
    run(...params: unknown[]): unknown;
  };
}

/** Result returned by migratePlaintextMfaSecrets. */
export interface MfaSecretMigrationResult {
  /** Rows that were encrypted and updated. */
  migrated: number;
  /** Rows that were already encrypted or had a null secret. */
  skipped: number;
}

/**
 * One-time migration: re-encrypt all plaintext `mfa_secret` values in-place.
 *
 * Safe to run multiple times — already-encrypted rows are skipped.
 * The UPDATE uses an optimistic `AND mfa_secret = ?` guard, so concurrent
 * runs on the same row are idempotent.
 *
 * Usage:
 *
 *   const db = openWritableDatabase(path);
 *   const result = migratePlaintextMfaSecrets(db);
 *   console.log(`Migrated ${result.migrated} rows, skipped ${result.skipped}`);
 *
 * @param db      Open writable database connection.
 * @param keyHex  64-char hex key. Defaults to STATION_ADMIN_MFA_SECRET_KEY env var.
 *
 * @throws if no key is available (migration requires a configured key).
 */
export function migratePlaintextMfaSecrets(
  db: MfaSecretMigratableDb,
  keyHex?: string,
): MfaSecretMigrationResult {
  const resolvedKey = keyHex ?? process.env.STATION_ADMIN_MFA_SECRET_KEY;

  if (!resolvedKey) {
    throw new Error(
      "migratePlaintextMfaSecrets: STATION_ADMIN_MFA_SECRET_KEY is required but not configured.",
    );
  }

  type RawRow = { id: string; mfa_secret: string | null };
  const rows = db
    .prepare(`SELECT id, mfa_secret FROM station_admin_credentials WHERE mfa_secret IS NOT NULL`)
    .all() as RawRow[];

  let migrated = 0;
  let skipped = 0;

  for (const row of rows) {
    if (!row.mfa_secret || isEncryptedMfaSecret(row.mfa_secret)) {
      skipped++;
      continue;
    }

    const encrypted = encryptMfaSecret(row.mfa_secret, resolvedKey);

    if (!encrypted) {
      skipped++;
      continue;
    }

    // Optimistic guard: only update if the value hasn't changed since we read it.
    db.prepare(
      `UPDATE station_admin_credentials SET mfa_secret = ? WHERE id = ? AND mfa_secret = ?`,
    ).run(encrypted, row.id, row.mfa_secret);

    migrated++;
  }

  return { migrated, skipped };
}
