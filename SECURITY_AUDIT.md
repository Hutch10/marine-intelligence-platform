# Security Audit: Station Admin MFA Lifecycle

Date: 2026-03-16
Scope: Station admin login MFA, MFA verification contract, step-up MFA for session revoke, challenge lifecycle controls.

## Severity-Ranked Findings

### Critical
1. Step-up bypass via consumed challenge reuse signal (resolved)
- Location: apps/api/src/repositories/station-admin-lifecycle.ts
- Previous behavior: recent step-up eligibility was inferred from any consumed session_revoke challenge record.
- Risk: failed/expired/locked challenges can become consumed and were treated as valid step-up proof.
- Impact: privileged revocation could proceed without successful MFA verification.
- Fix applied: step-up window now requires a recent mfa_challenge_success auth event with metadata.challengePurpose === session_revoke for the same actor + session.

### High
2. Missing session/challenge binding enforcement for session_revoke verify (resolved)
- Location: apps/api/src/repositories/station-admin-lifecycle.ts
- Previous behavior: verify validated actor and CSRF but did not require challenge.session_id to match request.sessionId.
- Risk: challenge replay across different active sessions owned by the same actor.
- Impact: broader replay surface for step-up challenges.
- Fix applied: strict challengeRow.session_id === request.sessionId check for session_revoke purpose.

### Medium
3. MFA verify error contract lacked actionable state (resolved)
- Location: apps/api/src/repositories/station-admin-lifecycle.ts, apps/api/src/routes/station-admin-lifecycle.ts, apps/api/src/types.ts
- Previous behavior: failures collapsed mostly to message strings or not_found.
- Risk: client cannot distinguish invalid code vs lockout vs expiration reliably.
- Impact: weaker UX hardening and less deterministic retry/lockout handling.
- Fix applied:
  - mfa_failed now returns attemptsRemaining and lockedOut.
  - explicit locked_out and expired result states added.
  - structured error payloads are returned from POST /station-admin/mfa/verify.

4. Structured MFA verify errors were dropped by web proxy layer (resolved)
- Location: apps/web/lib/api/client.ts, apps/web/app/api/station-admin/mfa/verify/route.ts
- Previous behavior: client/proxy returned only message on verify failure.
- Risk: backend hardening metadata not available to web UX.
- Impact: attempts/lockout/expired signals lost between backend and browser.
- Fix applied: preserved and forwarded typed verify error payloads through web client and Next route.

### Low
5. Recovery code hashing had no optional keyed hardening (resolved, backward-compatible)
- Location: apps/api/src/repositories/station-admin-lifecycle.ts
- Previous behavior: deterministic SHA-256 only.
- Risk: if hashes leak, offline guessing resistance is limited by code entropy.
- Fix applied:
  - hash function now supports HMAC-SHA256 when STATION_ADMIN_RECOVERY_CODE_PEPPER is set.
  - legacy SHA-256 matching retained for compatibility with existing stored codes.

6. Replay race hardening partially improved (mitigated)
- Location: apps/api/src/repositories/station-admin-lifecycle.ts
- Risk: concurrent verify attempts can race challenge state updates.
- Fix applied:
  - conditional challenge updates now require consumed_at IS NULL.
  - no-op update detection returns not_found when write reports zero changed rows.
- Residual risk: no explicit transaction boundary around full verify flow.

## File-by-File Findings

- apps/api/src/repositories/station-admin-lifecycle.ts
  - Fixed: step-up proof source, session binding, verify result granularity, replay update guards, recovery code hashing hardening.
- apps/api/src/routes/station-admin-lifecycle.ts
  - Fixed: structured MFA verify error responses and telemetry result expansion.
- apps/api/src/types.ts
  - Fixed: explicit StationAdminMfaVerifyErrorResponse and additional telemetry states.
- apps/web/lib/api/client.ts
  - Fixed: preserve typed MFA verify error payloads instead of flattening to message.
- apps/web/app/api/station-admin/mfa/verify/route.ts
  - Fixed: forward structured MFA verify errors to browser callers.
- apps/api/src/repositories/station-admin-lifecycle.test.ts
  - Added: expiration, lockout, session binding, step-up guard/bypass correctness, attemptsRemaining assertions.
- apps/api/src/routes/station-admin-lifecycle.test.ts
  - Added: structured error contract tests for mfa_failed, expired, locked_out.

## Safe Patches Applied

- No database schema migration required.
- No breaking changes to success response payloads.
- Existing message fields retained in error responses for compatibility.
- Web MFA UX flow remains intact; backend now provides stronger machine-readable status for future UX improvements.

## Exact Recommended Next Steps

1. Add a small transaction wrapper to verifyStationAdminMfaChallenge to make read/validate/write fully atomic under concurrency.
2. Add dedicated server-side rate-limiting for MFA verify endpoint (challengeId + actor + IP buckets), independent from login lockout.
3. Enforce and document STATION_ADMIN_RECOVERY_CODE_PEPPER in production environment policy.
4. Add security telemetry alerting on repeated locked_out MFA verify events and expired challenge churn.
5. Add integration tests for concurrent verify attempts to validate replay/race behavior.

---

## Architecture Pass — Additional Findings (2026-03-16)

*Added during parallel security and architecture review. Findings below are complementary to the fixes above.*

---

### CRITICAL-2 — TOTP Verification Is a Plaintext Stub

**File:** `apps/api/src/repositories/station-admin-lifecycle.ts:424-430`
**Class:** Authentication bypass — TOTP does not compute RFC 6238 values

```typescript
function verifyMfaCode(code: string | undefined, secret: string | null): boolean {
  if (!code || !secret) return false;
  return normalizeRecoveryCodeInput(code) === normalizeRecoveryCodeInput(secret);
}
```

The function compares the user-supplied code directly against the raw `mfa_secret` string. No HMAC-SHA1 TOTP computation is performed. This means:
- No authenticator app (Google Authenticator, Authy, etc.) will ever produce a code that passes this check
- Any user with DB read access could use the stored secret as the code
- The enrollment flow is currently non-functional from an authenticator perspective

**Fix:** Replace with `verifyTotpToken(code, secret).valid` from `apps/api/src/security/totp.ts` (scaffolded). Do not apply automatically — requires TOTP secrets in the DB to be valid base32 strings.

---

### HIGH-3 — TOTP Secret Stored Plaintext in SQLite

**File:** `apps/api/src/db/schema.ts:260`
**Class:** Secrets management — seed exposed at rest

The `mfa_secret` column stores the base32 TOTP seed without encryption. Any access to the SQLite file reveals seeds that allow permanent TOTP code generation.

**Fix:** Encrypt `mfa_secret` at rest (AES-256-GCM, key from env `MFA_SECRET_ENCRYPTION_KEY`). Add `mfa_secret_iv TEXT` column. See migration proposal below.

---

### MEDIUM-5 — No CSRF Origin/Referer Check in Next.js Route Handlers

**Files:** `apps/web/app/api/station-admin/login/route.ts`, `mfa/verify/route.ts`, `session/revoke/route.ts`
**Class:** CSRF — partial exposure via subdomain or misconfigured CORS

Route handlers do not validate the `Origin` or `Referer` header. `sameSite: "lax"` provides baseline CSRF protection for cross-site requests, but does not protect against same-site subdomain requests.

**Fix:**
```typescript
const origin = request.headers.get("origin");
if (!origin || origin !== process.env.NEXT_PUBLIC_APP_URL) {
  return NextResponse.json({ message: "Forbidden" }, { status: 403 });
}
```

---

### MEDIUM-6 — `hasRecentStepUp` Hardcodes `challenge_purpose = 'session_revoke'`

**File:** `apps/api/src/repositories/station-admin-lifecycle.ts:521-543`
**Class:** Design flaw — step-up enforcement cannot be generalized

The function is not parameterized by purpose. Any new step-up scenario (e.g., MFA disable, role escalation) will silently skip enforcement unless the function is duplicated.

**Fix:** See `apps/api/src/security/stepup-policy.ts` (scaffolded). Refactor `hasRecentStepUp` to accept `purpose: StationAdminMfaChallengePurpose` as a parameter.

---

### MEDIUM-7 — Session Refresh Lacks Atomic Transaction

**File:** `apps/api/src/repositories/station-admin-lifecycle.ts:1086-1108`
**Class:** Race condition — brief window with dual valid sessions

New session INSERT and old session revoke are two separate statements. A crash between them leaves both sessions valid.

**Fix:** Wrap both statements in a SQLite `BEGIN`/`COMMIT` transaction block.

---

### LOW-4 — Missing Performance Indexes on Hot Query Columns

**File:** `apps/api/src/db/schema.ts`

The following high-frequency query columns have no index:

| Table | Column | Query |
|-------|--------|-------|
| `station_admin_auth_events` | `occurred_at` | Lockout window check on every login |
| `station_admin_auth_events` | `actor_id` | Per-actor failure count |
| `station_admin_mfa_challenges` | `actor_id, consumed_at` | `hasRecentStepUp` |
| `station_admin_sessions` | `expires_at` | Active session filtering |

**Fix (migration):**
```sql
CREATE INDEX IF NOT EXISTS idx_auth_events_occurred_at ON station_admin_auth_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_actor_occurred ON station_admin_auth_events(actor_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_actor ON station_admin_mfa_challenges(actor_id, consumed_at);
CREATE INDEX IF NOT EXISTS idx_sessions_actor_expires ON station_admin_sessions(actor_id, expires_at);
```

---

### INFO-3 — `sameSite: "strict"` Would Be Stronger for Admin Portal

**File:** `apps/web/lib/api/session-cookies.ts`

`sameSite: "lax"` allows cookies on top-level cross-site GET navigation. For an admin portal, `sameSite: "strict"` prevents any cross-origin cookie transmission. Users would be required to authenticate after clicking a link from an external page.

---

### Database Migration Proposals (Architecture Pass)

```sql
-- M-1: Encrypt TOTP secret at rest
ALTER TABLE station_admin_credentials ADD COLUMN mfa_secret_iv TEXT;
-- After: mfa_secret = AES-256-GCM ciphertext (hex), mfa_secret_iv = 12-byte IV (hex)

-- M-2: Pending enrollment support
ALTER TABLE station_admin_credentials ADD COLUMN mfa_pending_secret TEXT;
ALTER TABLE station_admin_credentials ADD COLUMN mfa_pending_since TIMESTAMP;

-- M-3: OIDC claims on sessions
ALTER TABLE station_admin_sessions ADD COLUMN amr TEXT; -- JSON: ["pwd","mfa"]
ALTER TABLE station_admin_sessions ADD COLUMN acr TEXT; -- "urn:mfa:required"

-- M-4: Performance indexes (safe to apply on existing data)
CREATE INDEX IF NOT EXISTS idx_auth_events_occurred_at ON station_admin_auth_events(occurred_at);
CREATE INDEX IF NOT EXISTS idx_auth_events_actor_occurred ON station_admin_auth_events(actor_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_mfa_challenges_actor ON station_admin_mfa_challenges(actor_id, consumed_at);
CREATE INDEX IF NOT EXISTS idx_sessions_actor_expires ON station_admin_sessions(actor_id, expires_at);
```
