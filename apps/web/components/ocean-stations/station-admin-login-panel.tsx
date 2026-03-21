"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StationAdminMfaChallenge, StationAdminMfaEnrollmentState } from "@/lib/api/types";

type LoginPendingMfaPayload = {
  result: "pending_mfa";
  actorId: string;
  role: string;
  challenge: StationAdminMfaChallenge;
  mfa: StationAdminMfaEnrollmentState;
};

type LoginIssuedPayload = {
  actorId: string;
  role: string;
  permissions: string[];
  csrfToken: string;
  expiresAt: string;
  mfa?: StationAdminMfaEnrollmentState;
};

type VerifyIssuedPayload = {
  result: "issued";
  actorId: string;
  role: string;
  permissions: string[];
  csrfToken: string;
  expiresAt: string;
  mfa: StationAdminMfaEnrollmentState;
};

type VerifyConfirmedPayload = {
  result: "verified";
  challengePurpose: StationAdminMfaChallenge["purpose"];
  actorId: string;
  mfa: StationAdminMfaEnrollmentState;
};

type VerifyErrorPayload = {
  result?: "mfa_failed" | "locked_out" | "rate_limited" | "expired" | "not_found" | "invalid_request";
  message?: string;
  retryAfterSeconds?: number;
};

interface StationAdminLoginPanelProps {
  stationId: string;
  stationName: string;
  destinationPath: string;
}

export function StationAdminLoginPanel({
  stationId,
  stationName,
  destinationPath,
}: StationAdminLoginPanelProps) {
  const router = useRouter();
  const [actorId, setActorId] = useState("");
  const [password, setPassword] = useState("");
  const [authenticatorCode, setAuthenticatorCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [mfaMethod, setMfaMethod] = useState<"authenticator" | "recovery">("authenticator");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [attemptCount, setAttemptCount] = useState(0);
  const [pendingMfa, setPendingMfa] = useState<LoginPendingMfaPayload | null>(null);
  const [mfaCooldownSeconds, setMfaCooldownSeconds] = useState(0);

  useEffect(() => {
    if (mfaCooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setMfaCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [mfaCooldownSeconds]);

  const challengeExpiresAt = useMemo(() => {
    if (!pendingMfa) {
      return "";
    }

    const timestamp = new Date(pendingMfa.challenge.expiresAt).getTime();

    if (!Number.isFinite(timestamp)) {
      return pendingMfa.challenge.expiresAt;
    }

    return new Date(timestamp).toLocaleString();
  }, [pendingMfa]);

  async function submitCredentials(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setError(undefined);

    try {
      const response = await fetch("/api/station-admin/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          actorId: actorId.trim(),
          password,
        }),
      });

      const payload = (await response.json()) as LoginPendingMfaPayload | LoginIssuedPayload | { message?: string };

      if (response.status === 202 && "result" in payload && payload.result === "pending_mfa") {
        setPendingMfa(payload);
        setAttemptCount(0);
        setMfaCooldownSeconds(0);
        setAuthenticatorCode("");
        setRecoveryCode("");
        return;
      }

      if (response.status === 200) {
        router.push(destinationPath);
        router.refresh();
        return;
      }

      setError("message" in payload && typeof payload.message === "string" ? payload.message : "Authentication failed.");
    } catch {
      setError("Authentication request failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function submitMfaChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!pendingMfa || mfaCooldownSeconds > 0) {
      return;
    }

    setIsSubmitting(true);
    setError(undefined);

    try {
      const response = await fetch("/api/station-admin/mfa/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          challengeId: pendingMfa.challenge.challengeId,
          code: mfaMethod === "authenticator" ? authenticatorCode.trim() : undefined,
          recoveryCode: mfaMethod === "recovery" ? recoveryCode.trim() : undefined,
        }),
      });

      const payload = (await response.json()) as VerifyIssuedPayload | VerifyConfirmedPayload | VerifyErrorPayload;

      const payloadRetryAfter =
        "retryAfterSeconds" in payload && typeof payload.retryAfterSeconds === "number"
          ? payload.retryAfterSeconds
          : undefined;
      const headerRetryAfterRaw = typeof response.headers?.get === "function"
        ? response.headers.get("Retry-After")
        : null;
      const headerRetryAfter = headerRetryAfterRaw ? Number.parseInt(headerRetryAfterRaw, 10) : Number.NaN;
      const retryAfterSeconds = Number.isFinite(payloadRetryAfter)
        ? Math.max(1, Math.ceil(payloadRetryAfter ?? 0))
        : Number.isFinite(headerRetryAfter)
          ? Math.max(1, Math.ceil(headerRetryAfter))
          : 0;

      if (response.status === 200 && "result" in payload && payload.result === "issued") {
        router.push(destinationPath);
        router.refresh();
        return;
      }

      if (response.status === 429 && "result" in payload && payload.result === "rate_limited") {
        setMfaCooldownSeconds(retryAfterSeconds);
        setError(
          retryAfterSeconds > 0
            ? `MFA verification rate-limited. Try again in ${retryAfterSeconds}s.`
            : (payload.message ?? "MFA verification rate-limited."),
        );
        return;
      }

      // Differentiate MFA failure types for clearer user feedback
      if (response.status === 401 && "result" in payload && payload.result === "locked_out") {
        setError("MFA challenge locked due to too many failed attempts. Please request a new verification code.");
        return;
      }

      if ("result" in payload && payload.result === "expired") {
        setError("MFA verification code expired. Please restart the login process.");
        return;
      }

      if (response.status === 401 && "result" in payload && payload.result === "mfa_failed") {
        const remaining = "attemptsRemaining" in payload && typeof payload.attemptsRemaining === "number"
          ? payload.attemptsRemaining
          : 0;
        const attemptsText = remaining > 1 ? ` (${remaining} attempts remaining)` : remaining === 1 ? " (1 attempt remaining)" : "";
        setError(
          "message" in payload && typeof payload.message === "string"
            ? `${payload.message}${attemptsText}`
            : `Invalid MFA code${attemptsText}`,
        );
        return;
      }

      setAttemptCount((current) => current + 1);
      setError("message" in payload && typeof payload.message === "string"
        ? payload.message
        : "MFA verification failed.");
    } catch {
      setAttemptCount((current) => current + 1);
      setError("MFA verification failed.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-lg rounded-2xl border border-surface-border bg-ocean-900 p-6">
      <p className="text-[11px] uppercase tracking-[0.22em] text-cyan-400">Station Admin Access</p>
      <h1 className="mt-2 text-2xl font-semibold text-slate-100">{stationName}</h1>
      <p className="mt-2 text-sm text-slate-400">Authenticate to manage station {stationId}.</p>

      {!pendingMfa ? (
        <form className="mt-6 space-y-4" onSubmit={submitCredentials}>
          <label className="block text-xs text-slate-300">
            Actor ID
            <input
              value={actorId}
              onChange={(event) => setActorId(event.target.value)}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100"
              placeholder="ops.lead@marine.local"
              autoComplete="username"
              required
            />
          </label>
          <label className="block text-xs text-slate-300">
            Password
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100"
              autoComplete="current-password"
              required
            />
          </label>
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:text-cyan-500"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>
      ) : (
        <form className="mt-6 space-y-4" onSubmit={submitMfaChallenge}>
          <div className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">MFA Challenge</p>
            <p className="mt-1">Actor: {pendingMfa.actorId}</p>
            <p className="mt-1">Purpose: {pendingMfa.challenge.purpose}</p>
            <p className="mt-1">Expires: {challengeExpiresAt}</p>
            <p className="mt-1">Recovery codes remaining: {pendingMfa.mfa.recoveryCodesRemaining}</p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs text-slate-300">Verification method</legend>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="radio"
                name="mfaMethod"
                value="authenticator"
                checked={mfaMethod === "authenticator"}
                onChange={() => setMfaMethod("authenticator")}
              />
              Use authenticator code
            </label>
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="radio"
                name="mfaMethod"
                value="recovery"
                checked={mfaMethod === "recovery"}
                onChange={() => setMfaMethod("recovery")}
              />
              Use recovery code
            </label>
          </fieldset>

          {mfaMethod === "authenticator" ? (
            <label className="block text-xs text-slate-300">
              Authenticator code
              <input
                value={authenticatorCode}
                onChange={(event) => setAuthenticatorCode(event.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100"
                placeholder="123456"
                required
              />
            </label>
          ) : (
            <label className="block text-xs text-slate-300">
              Recovery code
              <input
                value={recoveryCode}
                onChange={(event) => setRecoveryCode(event.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100"
                placeholder="RECOVERY-XXXX"
                required
              />
            </label>
          )}

          <button
            type="submit"
            disabled={isSubmitting || mfaCooldownSeconds > 0}
            className="w-full rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:text-cyan-500"
          >
            {isSubmitting
              ? "Verifying..."
              : mfaCooldownSeconds > 0
                ? `Wait ${mfaCooldownSeconds}s`
                : "Verify challenge"}
          </button>

          {mfaCooldownSeconds > 0 ? (
            <p className="text-xs text-amber-300">Cooldown active: retry allowed in {mfaCooldownSeconds}s.</p>
          ) : null}
        </form>
      )}

      {attemptCount > 0 ? (
        <p className="mt-3 text-xs text-amber-300">MFA attempts in this session: {attemptCount}</p>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {error}
        </p>
      ) : null}
    </section>
  );
}