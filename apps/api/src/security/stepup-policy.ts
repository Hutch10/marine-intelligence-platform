/**
 * Step-up authentication policy engine.
 *
 * Allows routes and repository functions to declare that an operation
 * requires a recently-verified MFA step-up before proceeding.
 *
 * Usage:
 *
 *   const policy = requireStepUp("mfa", "session_revoke");
 *   const result = evaluateStepUpPolicy(policy, context, issueChallengeCallback);
 *
 *   if (!result.satisfied) {
 *     return { result: "mfa_required", challenge: result.challenge };
 *   }
 *
 * This replaces the hardcoded hasRecentStepUp() pattern and enables the same
 * step-up check to be reused across session revoke, role escalation, MFA disable,
 * and other destructive operations.
 */

import type { StationAdminMfaChallengePurpose } from "@marine/shared";

// ---------------------------------------------------------------------------
// Policy definition
// ---------------------------------------------------------------------------

export type StepUpMethod = "mfa";

/** How long a completed step-up remains valid. Defaults to 5 minutes. */
export const DEFAULT_STEP_UP_WINDOW_MS = 5 * 60 * 1000;

export interface StepUpPolicy {
  method: StepUpMethod;
  purpose: StationAdminMfaChallengePurpose;
  windowMs: number;
}

/**
 * Create a step-up policy declaration.
 *
 * @param method   Authentication method required ("mfa")
 * @param purpose  The challenge purpose to require (controls which challenges count)
 * @param windowMs How recently the step-up must have been completed (default 5 min)
 */
export function requireStepUp(
  method: StepUpMethod,
  purpose: StationAdminMfaChallengePurpose = "session_revoke",
  windowMs: number = DEFAULT_STEP_UP_WINDOW_MS,
): StepUpPolicy {
  return { method, purpose, windowMs };
}

// ---------------------------------------------------------------------------
// Evaluation context
// ---------------------------------------------------------------------------

export interface StepUpChallenge {
  challengeId: string;
  purpose: StationAdminMfaChallengePurpose;
  expiresAt: string;
  recoveryCodeAllowed: boolean;
}

export interface StepUpContext {
  /** The actor requesting the operation */
  actorId: string;
  /** The session making the request */
  sessionId: string;
  /** Whether MFA is currently enrolled for this actor */
  mfaEnabled: boolean;
  /**
   * Returns true if the actor completed a step-up for the given purpose
   * within the given window.
   *
   * Implementations should query station_admin_mfa_challenges for a recent
   * consumed challenge matching actor_id, session_id, and challenge_purpose.
   */
  hasRecentStepUp: (purpose: StationAdminMfaChallengePurpose, windowMs: number) => boolean;
}

// ---------------------------------------------------------------------------
// Evaluation result
// ---------------------------------------------------------------------------

export type StepUpResult =
  | { satisfied: true }
  | { satisfied: false; challenge: StepUpChallenge };

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

/**
 * Evaluate whether the step-up policy is satisfied for the current context.
 *
 * If MFA is not enabled for the actor, the policy is satisfied trivially.
 * If a recent step-up exists within the window, the policy is satisfied.
 * Otherwise, a new MFA challenge is issued and returned.
 *
 * @param policy              The step-up policy to evaluate
 * @param context             The actor/session context and MFA state
 * @param issueChallengeCallback  Called to create a new challenge when step-up is needed
 */
export function evaluateStepUpPolicy(
  policy: StepUpPolicy,
  context: StepUpContext,
  issueChallengeCallback: (
    purpose: StationAdminMfaChallengePurpose,
  ) => { challengeId: string; expiresAt: string },
): StepUpResult {
  // MFA not enrolled — step-up is not applicable
  if (!context.mfaEnabled) {
    return { satisfied: true };
  }

  // Already satisfied by a recent step-up
  if (context.hasRecentStepUp(policy.purpose, policy.windowMs)) {
    return { satisfied: true };
  }

  // Need to issue a new challenge
  const issued = issueChallengeCallback(policy.purpose);

  return {
    satisfied: false,
    challenge: {
      challengeId: issued.challengeId,
      purpose: policy.purpose,
      expiresAt: issued.expiresAt,
      recoveryCodeAllowed: true,
    },
  };
}

// ---------------------------------------------------------------------------
// Reusable hasRecentStepUp query builder
// ---------------------------------------------------------------------------

/**
 * Parameters for the hasRecentStepUp database query.
 * Extract this to keep the query consistent wherever it is used.
 */
export interface RecentStepUpQuery {
  sql: string;
  params: [actorId: string, sessionId: string, purpose: StationAdminMfaChallengePurpose, since: string];
}

/**
 * Build the SQL query parameters for checking a recent step-up completion.
 *
 * The caller is responsible for executing the query and checking if any row
 * is returned.
 *
 * Example usage:
 *
 *   const { sql, params } = buildRecentStepUpQuery(actorId, sessionId, purpose, nowMs, windowMs);
 *   const rows = db.prepare(sql).all(...params);
 *   const hasStepped = rows.length > 0;
 */
export function buildRecentStepUpQuery(
  actorId: string,
  sessionId: string,
  purpose: StationAdminMfaChallengePurpose,
  nowMs: number,
  windowMs: number,
): RecentStepUpQuery {
  const since = new Date(nowMs - windowMs).toISOString();

  return {
    sql: `
      SELECT consumed_at
      FROM station_admin_mfa_challenges
      WHERE actor_id = ?
        AND session_id = ?
        AND challenge_purpose = ?
        AND consumed_at IS NOT NULL
        AND consumed_at > ?
      ORDER BY consumed_at DESC
      LIMIT 1
    `,
    params: [actorId, sessionId, purpose, since],
  };
}

// ---------------------------------------------------------------------------
// Pre-built policies for common operations
// ---------------------------------------------------------------------------

/** Revoke another user's session — requires MFA step-up, valid for 5 minutes */
export const SESSION_REVOKE_POLICY = requireStepUp("mfa", "session_revoke");

/** Change permissions or escalate a role — requires MFA step-up, valid for 5 minutes */
export const PERMISSION_MUTATION_POLICY = requireStepUp("mfa", "permission_mutation");
