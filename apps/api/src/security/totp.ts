/**
 * RFC 6238 TOTP implementation using only Node.js built-in crypto.
 * No external dependencies.
 *
 * Algorithm:
 *   1. Decode base32 secret → raw bytes (key)
 *   2. T = floor(unix_epoch_seconds / 30)
 *   3. HMAC-SHA1(key, T as 8-byte big-endian) → 20-byte hash
 *   4. Dynamic truncation → 31-bit integer
 *   5. Mod 10^6 → 6-digit code (left-padded with zeros)
 *
 * Clock skew: ±1 time step (±30 seconds) is checked automatically.
 */

// Base32 alphabet per RFC 4648
const BASE32_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1; // Steps checked on each side of current step
const TOTP_SECRET_BYTES = 20; // 160-bit secret (industry standard for TOTP)

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

function base32Decode(input: string): Uint8Array {
  const cleaned = input
    .toUpperCase()
    .replace(/=+$/, "") // strip padding
    .replace(/[^A-Z2-7]/g, ""); // strip non-base32 chars

  if (cleaned.length === 0) {
    return new Uint8Array(0);
  }

  // Convert each base32 character to 5 bits
  const bits = cleaned
    .split("")
    .map((char) => {
      const idx = BASE32_CHARS.indexOf(char);
      return idx.toString(2).padStart(5, "0");
    })
    .join("");

  const byteCount = Math.floor(bits.length / 8);
  const bytes = new Uint8Array(byteCount);

  for (let i = 0; i < byteCount; i++) {
    bytes[i] = parseInt(bits.slice(i * 8, i * 8 + 8), 2);
  }

  return bytes;
}

function base32Encode(input: Uint8Array): string {
  // Convert bytes to a binary string
  let bits = "";
  for (const byte of input) {
    bits += byte.toString(2).padStart(8, "0");
  }

  // Pad to multiple of 5
  while (bits.length % 5 !== 0) {
    bits += "0";
  }

  let output = "";
  for (let i = 0; i < bits.length; i += 5) {
    output += BASE32_CHARS[parseInt(bits.slice(i, i + 5), 2)];
  }

  return output;
}

// ---------------------------------------------------------------------------
// HMAC-SHA1
// ---------------------------------------------------------------------------

function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createHmac } = runtimeRequire("node:crypto") as {
    createHmac: (
      algorithm: string,
      key: Buffer,
    ) => { update: (data: Buffer) => { digest: () => Buffer } };
  };

  const result = createHmac("sha1", Buffer.from(key))
    .update(Buffer.from(message))
    .digest();

  return new Uint8Array(result);
}

// ---------------------------------------------------------------------------
// HOTP core (RFC 4226)
// ---------------------------------------------------------------------------

function computeHotp(key: Uint8Array, counter: bigint): string {
  // Encode counter as 8-byte big-endian
  const message = new Uint8Array(8);
  let c = counter;
  for (let i = 7; i >= 0; i--) {
    message[i] = Number(c & BigInt(0xff));
    c >>= BigInt(8);
  }

  const hash = hmacSha1(key, message);

  // Dynamic truncation — offset is the low 4 bits of the last byte
  const offset = hash[19] & 0x0f;

  // Extract 4 bytes starting at offset, clear the top bit (bit 31)
  const truncated =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  // Reduce to TOTP_DIGITS decimal digits
  const code = truncated % Math.pow(10, TOTP_DIGITS);
  return code.toString().padStart(TOTP_DIGITS, "0");
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * A TOTP secret in both base32 (for QR codes / storage) and raw byte forms.
 */
export interface TotpSecret {
  /** Base32-encoded secret — store in `mfa_secret` column */
  secret: string;
}

/**
 * Generate a new random 160-bit TOTP secret.
 * Returns the base32-encoded form suitable for storage and QR code URIs.
 */
export function generateTotpSecret(): TotpSecret {
  const runtimeRequire = eval("require") as NodeRequire;
  const { randomBytes } = runtimeRequire("node:crypto") as {
    randomBytes: (size: number) => Buffer;
  };

  const raw = new Uint8Array(randomBytes(TOTP_SECRET_BYTES));
  return { secret: base32Encode(raw) };
}

/**
 * Generate the `otpauth://totp/...` URI used to provision authenticator apps.
 * Pass this URI to a QR code library to display the setup code.
 *
 * @param secret   Base32-encoded TOTP secret from generateTotpSecret()
 * @param account  The account name shown in the authenticator (e.g. actor ID)
 * @param issuer   The service name shown in the authenticator (e.g. "Marine Admin")
 */
export function generateQrCodeUri(
  secret: string,
  account: string,
  issuer: string,
): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(account);

  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: "SHA1",
    digits: String(TOTP_DIGITS),
    period: String(TOTP_PERIOD_SECONDS),
  });

  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?${params.toString()}`;
}

/**
 * Result of a TOTP token verification.
 */
export interface TotpVerifyResult {
  /** Whether the token was valid */
  valid: boolean;
  /**
   * The time-step offset that matched.
   * 0 = current step, -1 = previous step (clock behind), 1 = next step (clock ahead).
   * Only present when valid === true.
   */
  delta?: number;
}

/**
 * Verify a 6-digit TOTP token against a base32-encoded secret.
 *
 * Checks the current time step and ±TOTP_WINDOW adjacent steps to allow
 * for clock skew between the server and the authenticator device.
 *
 * @param token   6-digit code from the authenticator (whitespace is stripped)
 * @param secret  Base32-encoded TOTP secret from storage
 * @param nowMs   Optional override for current time in milliseconds (for testing)
 */
export function verifyTotpToken(
  token: string,
  secret: string,
  nowMs?: number,
): TotpVerifyResult {
  const normalized = token.replace(/\s/g, "");

  // Token must be exactly TOTP_DIGITS digits
  if (!/^\d+$/.test(normalized) || normalized.length !== TOTP_DIGITS) {
    return { valid: false };
  }

  let keyBytes: Uint8Array;
  try {
    keyBytes = base32Decode(secret);
  } catch {
    return { valid: false };
  }

  if (keyBytes.length === 0) {
    return { valid: false };
  }

  const nowSeconds = Math.floor((nowMs ?? Date.now()) / 1000);
  const currentStep = BigInt(Math.floor(nowSeconds / TOTP_PERIOD_SECONDS));

  for (let delta = -TOTP_WINDOW; delta <= TOTP_WINDOW; delta++) {
    const step = currentStep + BigInt(delta);
    const expected = computeHotp(keyBytes, step);

    if (expected === normalized) {
      return { valid: true, delta };
    }
  }

  return { valid: false };
}

/**
 * Generate the current TOTP code for a secret.
 * Useful for seeding test data or server-side verification pre-checks.
 * Do NOT expose this in API responses.
 */
export function generateCurrentTotpCode(secret: string, nowMs?: number): string | null {
  let keyBytes: Uint8Array;
  try {
    keyBytes = base32Decode(secret);
  } catch {
    return null;
  }

  if (keyBytes.length === 0) {
    return null;
  }

  const nowSeconds = Math.floor((nowMs ?? Date.now()) / 1000);
  const currentStep = BigInt(Math.floor(nowSeconds / TOTP_PERIOD_SECONDS));
  return computeHotp(keyBytes, currentStep);
}
