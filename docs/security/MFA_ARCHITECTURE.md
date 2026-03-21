# MFA Architecture: Station Admin Lifecycle

Date: 2026-03-16

## Overview

The station admin MFA system has two primary challenge purposes:

1. **login** — Username/password success for an MFA-enabled actor returns `pending_mfa`. A challenge record is issued and no session cookie is set at this point. Successful verification issues a session and CSRF token.

1. **session_revoke (step-up)** — Admin session revocation of another actor may require step-up MFA. A verified step-up event opens a short revocation window for the same admin session.

## Data Model

Key tables:

- `station_admin_credentials` — `mfa_enabled`, `mfa_secret`, `mfa_recovery_codes`, `mfa_last_verified_at`
- `station_admin_mfa_challenges` — `id`, `actor_id`, `challenge_purpose`, `session_id`, `expires_at`, `attempts_remaining`, `consumed_at`, `metadata`
- `station_admin_auth_events` — `event_type`, `actor_id`, `session_id`, `occurred_at`, `metadata`

## Challenge Lifecycle Controls

### Issue

`createMfaChallenge`:

- Generates a unique challenge id.
- Sets `expires_at` (10 minutes).
- Initializes `attempts_remaining` to 5.
- Optionally binds `session_id` (required for step-up use cases).

### Verify

`verifyStationAdminMfaChallenge` enforces:

1. Challenge identity and unconsumed state.
1. Expiration and lockout checks: `expired` result when challenge has elapsed; `locked_out` result when `attempts_remaining <= 0`.
1. Purpose-aware validation: `session_revoke` requires `sessionId` + `csrfToken`; `session_revoke` requires `challenge.session_id` to match `request.sessionId`.
1. Actor credential and MFA enabled checks.
1. Code verification path: authenticator code match OR unused recovery code consumption.
1. Replay guard on writes: update/consume operations require `consumed_at IS NULL`.

### Consume and Eventing

On success:

- Challenge is consumed.
- `mfa_last_verified_at` is updated.
- `mfa_challenge_success` auth event is emitted with `challengePurpose` metadata.
- `login` purpose issues a new session.

On failure:

- `attempts_remaining` decremented.
- `mfa_challenge_failure` auth event emitted with `attemptsRemaining` metadata.
- response includes `attemptsRemaining` + `lockedOut` flag.

## Step-Up Window Logic

`hasRecentStepUp` now evaluates only successful step-up evidence:

- source: `station_admin_auth_events`
- filter: `event_type = mfa_challenge_success`
- `metadata.challengePurpose = session_revoke`
- actor/session match required
- `occurred_at` must be within configured window (default 5 minutes)

This prevents failed or expired challenges from granting step-up bypass.

## Recovery Code Storage Safety

Recovery code verification supports:

- Preferred hash: HMAC-SHA256 with `STATION_ADMIN_RECOVERY_CODE_PEPPER`.
- Backward compatibility: legacy SHA-256 hash comparison retained.

Operational recommendation: Set `STATION_ADMIN_RECOVERY_CODE_PEPPER` in production and rotate via secrets management process.

## Verify API Contract

Endpoint: `POST /station-admin/mfa/verify`

Success responses (unchanged):

- `result: issued` — includes `sessionId`, `csrfToken`, `expiresAt`, `actorId`, `role`, `permissions`, `mfa`
- `result: verified` — includes `challengePurpose`, `actorId`, `mfa`

Structured failure responses:

- `result: mfa_failed` — `message`, `attemptsRemaining`, `lockedOut`
- `result: locked_out` — `message`, `attemptsRemaining: 0`, `lockedOut: true`
- `result: expired` — HTTP `410 Gone`, `message`
- `result: not_found` — `message`
- `result: invalid_request` — `message`

## Web Bridge Behavior

The web server route at `/api/station-admin/mfa/verify` now forwards structured failure payloads as-is, allowing browser UI to use attempts/lockout/expired state without losing backward-compatible message strings.

## Testing Coverage Added

Repository tests:

- expired challenge status
- locked challenge status
- `session_revoke` session binding enforcement
- failed step-up is not accepted as recent-step-up proof
- successful step-up event permits same-session revoke within window

Route tests:

- `mfa_failed` includes `attemptsRemaining`
- explicit `expired` status contract
- explicit `locked_out` status contract

---

## MFA Enrollment Lifecycle (Architecture Extension)

*Added during parallel architecture pass. Implementation scaffolded — not yet wired.*

### Enrollment Flow

```text
1. POST /station-admin/mfa/enroll/start  { sessionId, csrfToken }
   - Validate session + CSRF
   - Require mfa_enabled = 0
   - generateTotpSecret() -> 160-bit base32 (apps/api/src/security/totp.ts)
   - Store mfa_pending_secret, mfa_pending_since = now
   - Return { qrCodeUri, secret }     <- shown ONCE to user

2. User scans QR code in authenticator app

3. POST /station-admin/mfa/enroll/verify  { sessionId, csrfToken, totpCode }
   - Validate session + CSRF
   - Load mfa_pending_secret (must exist, not expired > 1 hour)
   - verifyTotpToken(totpCode, pendingSecret)  <- RFC 6238
   - Generate 8 recovery codes (random, unambiguous charset)
   - Store: mfa_enabled=1, mfa_secret=secret, mfa_recovery_codes=[hashed]
   - Return { enrolled, mfa, recoveryCodes }  <- plain codes shown ONCE
```

**Schema requirement:** Migration M-2 must be applied before enrollment routes are wired:

```sql
ALTER TABLE station_admin_credentials ADD COLUMN mfa_pending_secret TEXT;
ALTER TABLE station_admin_credentials ADD COLUMN mfa_pending_since TIMESTAMP;
```

### Recovery Code Regeneration

```text
POST /station-admin/mfa/recovery/regenerate  { sessionId, csrfToken }
   - Validate session + CSRF
   - Require mfa_enabled = 1
   - evaluateStepUpPolicy(PERMISSION_MUTATION_POLICY, context, issueChallengeCallback)
     -> If no recent step-up: return { mfa_required, challenge }
     -> Client completes /mfa/verify, then retries
   - Generate 8 new recovery codes
   - Replace mfa_recovery_codes in DB
   - Return { regenerated, mfa, recoveryCodes }  <- plain codes shown ONCE
```

### MFA Disable

```text
POST /station-admin/mfa/disable  { sessionId, csrfToken, totpCode }
   - Validate session + CSRF
   - Require mfa_enabled = 1
   - verifyTotpToken(totpCode, mfa_secret)  <- confirm current TOTP
   - evaluateStepUpPolicy(PERMISSION_MUTATION_POLICY, context, issueChallengeCallback)
     -> Double-gate: valid TOTP + recent step-up both required
   - Clear all MFA fields (mfa_enabled=0, mfa_secret=NULL, etc.)
```

---

## TOTP Infrastructure

**File:** `apps/api/src/security/totp.ts`

Implements RFC 6238 TOTP using only Node.js built-in `node:crypto`. No external dependencies.

| Function | Purpose |
| -------- | ------- |
| `generateTotpSecret()` | Generate 160-bit base32 secret for enrollment |
| `generateQrCodeUri(secret, account, issuer)` | Build `otpauth://totp/...` URI for QR code |
| `verifyTotpToken(token, secret, nowMs?)` | Verify 6-digit TOTP (±1 step clock skew) |
| `generateCurrentTotpCode(secret, nowMs?)` | Generate current code (for test seeding only) |

**Clock skew:** Checks current step and ±1 adjacent step (±30 seconds), returns `{ valid, delta }`.

**Critical wiring required:** Replace `verifyMfaCode` stub in `station-admin-lifecycle.ts:424-430` with:

```typescript
import { verifyTotpToken } from "../security/totp";
// inside verifyStationAdminMfaChallenge:
const codeVerified = verifyTotpToken(normalizedCode ?? "", credential.mfa_secret ?? "").valid;
```

---

## Step-Up Policy Engine

**File:** `apps/api/src/security/stepup-policy.ts`

Provides a reusable, purpose-parameterized step-up evaluation engine to replace the hardcoded `hasRecentStepUp` function.

```typescript
// Declare a policy
const policy = requireStepUp("mfa", "session_revoke", 5 * 60 * 1000);

// Evaluate it
const result = evaluateStepUpPolicy(policy, {
  actorId, sessionId, mfaEnabled,
  hasRecentStepUp: (purpose, windowMs) => { /* query DB */ }
}, (purpose) => createMfaChallengeRow(...));

if (!result.satisfied) {
  return { result: "mfa_required", challenge: result.challenge };
}
```

**Pre-built policies:**

- `SESSION_REVOKE_POLICY` — for session revocation
- `PERMISSION_MUTATION_POLICY` — for recovery regeneration, MFA disable, role escalation

**SQL query builder:** `buildRecentStepUpQuery(actorId, sessionId, purpose, nowMs, windowMs)` ensures consistent query structure wherever step-up is checked.

---

## OIDC / SSO Readiness

**Types:** `apps/web/lib/api/types.ts` — `StationAdminOidcClaims`, `StationAdminAmrValue`, `StationAdminAcrValue`

**Session model extension** (post migration M-3):

| Field | Login (no MFA) | Login (with MFA) | SSO (future) |
| ----- | -------------- | ---------------- | ------------ |
| `amr` | `["pwd"]` | `["pwd","mfa"]` | `["sso"]` |
| `acr` | `"urn:pwd:only"` | `"urn:mfa:required"` | `"urn:sso:federated"` |

**Where to attach:** In `issueSession()` within `station-admin-lifecycle.ts`, pass `amr` and `acr` based on the challenge purpose that preceded session issuance.

**Future OIDC provider integration:**

- Phase 1: Incoming federation — OIDC callback maps provider `sub` to `actor_id`
- Phase 2: Outgoing tokens — Marine sessions exchanged for signed JWTs carrying `amr`/`acr` claims

---

## Production Checklist

| # | Item | Status |
| - | ---- | ------ |
| 1 | Replace `verifyMfaCode` stub with `verifyTotpToken` | Required before production MFA |
| 2 | Apply migration M-2 (`mfa_pending_secret`) | Required for enrollment flow |
| 3 | Apply migration M-3 (OIDC `amr`/`acr` columns) | Required for OIDC readiness |
| 4 | Apply migration M-4 (performance indexes) | Recommended |
| 5 | Encrypt `mfa_secret` at rest (AES-256-GCM) | High priority |
| 6 | Set `STATION_ADMIN_RECOVERY_CODE_PEPPER` env var | High priority |
| 7 | Wire enrollment routes into route index | After UI is ready |
| 8 | Add Origin header check to Next.js route handlers | Medium priority |
| 9 | Upgrade session cookie: `sameSite: "strict"`, `__Secure-` prefix | Medium priority |
| 10 | Add IP rate limiting on MFA verify endpoint | Medium priority |
| 11 | Wrap `verifyStationAdminMfaChallenge` in SQLite transaction | Recommended |
| 12 | Populate `oidc` claims at session issuance | Required for OIDC |
| 13 | Configure `TOTP_ISSUER` name constant | Before enrollment UI ships |
