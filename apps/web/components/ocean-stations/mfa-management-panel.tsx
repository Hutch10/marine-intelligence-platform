"use client";

import { useEffect, useState } from "react";
import type { StationAdminMfaChallenge, StationAdminMfaEnrollmentState } from "@/lib/api/types";

interface MfaManagementPanelProps {
  sessionId: string;
  csrfToken: string;
  initialMfaState: StationAdminMfaEnrollmentState | undefined;
}

type PanelView =
  | "idle"
  | "enroll_qr"
  | "enroll_codes"
  | "disable_input"
  | "regen_codes"
  | "stepup";

type PendingAction = "disable" | "regen" | null;

export function MfaManagementPanel({ sessionId, csrfToken, initialMfaState }: MfaManagementPanelProps) {
  const [view, setView] = useState<PanelView>("idle");
  const [mfaState, setMfaState] = useState<StationAdminMfaEnrollmentState | undefined>(initialMfaState);
  const [qrCodeUri, setQrCodeUri] = useState<string | null>(null);
  const [manualSecret, setManualSecret] = useState("");
  const [enrollCode, setEnrollCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [disableCode, setDisableCode] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [stepUpChallenge, setStepUpChallenge] = useState<StationAdminMfaChallenge | null>(null);
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpRecoveryCode, setStepUpRecoveryCode] = useState("");
  const [stepUpMethod, setStepUpMethod] = useState<"authenticator" | "recovery">("authenticator");
  const [stepUpCooldownSeconds, setStepUpCooldownSeconds] = useState(0);
  const [stepUpError, setStepUpError] = useState<string | undefined>(undefined);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [savedDisableCode, setSavedDisableCode] = useState("");

  useEffect(() => {
    if (stepUpCooldownSeconds <= 0) return;

    const timer = window.setInterval(() => {
      setStepUpCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [stepUpCooldownSeconds]);

  function resetToIdle() {
    setView("idle");
    setQrCodeUri(null);
    setManualSecret("");
    setEnrollCode("");
    setDisableCode("");
    setRecoveryCodes([]);
    setErrorMessage(undefined);
    setStepUpChallenge(null);
    setStepUpCode("");
    setStepUpRecoveryCode("");
    setStepUpMethod("authenticator");
    setStepUpCooldownSeconds(0);
    setStepUpError(undefined);
    setPendingAction(null);
    setSavedDisableCode("");
  }

  async function handleEnrollStart() {
    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const result = await fetch("/api/station-admin/mfa/enroll/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrfToken, sessionId }),
      });
      const payload = (await result.json()) as { qrCodeUri?: string; secret?: string; message?: string };

      if (result.status === 200 && payload.qrCodeUri && payload.secret) {
        setQrCodeUri(payload.qrCodeUri);
        setManualSecret(payload.secret);
        setView("enroll_qr");
        return;
      }

      setErrorMessage(payload.message ?? "Could not start enrollment.");
    } catch {
      setErrorMessage("Enrollment start request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleEnrollVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const result = await fetch("/api/station-admin/mfa/enroll/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrfToken, sessionId, totpCode: enrollCode.trim() }),
      });
      const payload = (await result.json()) as {
        result?: string;
        mfa?: StationAdminMfaEnrollmentState;
        recoveryCodes?: string[];
        message?: string;
      };

      if (result.status === 200 && payload.result === "enrolled" && payload.mfa && payload.recoveryCodes) {
        setMfaState(payload.mfa);
        setRecoveryCodes(payload.recoveryCodes);
        setView("enroll_codes");
        return;
      }

      setErrorMessage(payload.message ?? "TOTP code invalid. Ensure your authenticator app is synced.");
    } catch {
      setErrorMessage("Enrollment verification request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRegenerate() {
    setIsLoading(true);
    setErrorMessage(undefined);

    try {
      const result = await fetch("/api/station-admin/mfa/recovery/regenerate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrfToken, sessionId }),
      });
      const payload = (await result.json()) as {
        result?: string;
        mfa?: StationAdminMfaEnrollmentState;
        recoveryCodes?: string[];
        message?: string;
        mfaRequired?: boolean;
        challenge?: StationAdminMfaChallenge;
      };

      if (result.status === 200 && payload.result === "regenerated" && payload.mfa && payload.recoveryCodes) {
        setMfaState(payload.mfa);
        setRecoveryCodes(payload.recoveryCodes);
        setView("regen_codes");
        return;
      }

      if (result.status === 401 && payload.mfaRequired && payload.challenge) {
        setPendingAction("regen");
        setStepUpChallenge(payload.challenge);
        setView("stepup");
        return;
      }

      setErrorMessage(payload.message ?? "Recovery code regeneration failed.");
    } catch {
      setErrorMessage("Recovery code regeneration request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleDisableSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = disableCode.trim();
    setIsLoading(true);
    setErrorMessage(undefined);
    setSavedDisableCode(code);

    await attemptDisable(code);
    setIsLoading(false);
  }

  async function attemptDisable(code: string) {
    try {
      const result = await fetch("/api/station-admin/mfa/disable", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ csrfToken, sessionId, totpCode: code }),
      });
      const payload = (await result.json()) as {
        ok?: boolean;
        message?: string;
        mfaRequired?: boolean;
        challenge?: StationAdminMfaChallenge;
      };

      if (result.status === 200 && payload.ok === true) {
        setMfaState({ enabled: false, enrolledAt: null, lastVerifiedAt: null, recoveryCodesRemaining: 0 });
        resetToIdle();
        return;
      }

      if (result.status === 401 && payload.mfaRequired && payload.challenge) {
        setPendingAction("disable");
        setStepUpChallenge(payload.challenge);
        setView("stepup");
        return;
      }

      setErrorMessage(payload.message ?? "MFA disable failed.");
      setView("disable_input");
    } catch {
      setErrorMessage("MFA disable request failed.");
      setView("disable_input");
    }
  }

  async function handleStepUpVerify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stepUpChallenge || stepUpCooldownSeconds > 0) return;

    setIsLoading(true);
    setStepUpError(undefined);

    try {
      const response = await fetch("/api/station-admin/mfa/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          challengeId: stepUpChallenge.challengeId,
          code: stepUpMethod === "authenticator" ? stepUpCode.trim() : undefined,
          recoveryCode: stepUpMethod === "recovery" ? stepUpRecoveryCode.trim() : undefined,
          sessionId,
          csrfToken,
        }),
      });

      const payload = (await response.json()) as {
        message?: string;
        result?: string;
        retryAfterSeconds?: number;
        attemptsRemaining?: number;
      };

      const payloadRetryAfter = typeof payload.retryAfterSeconds === "number" ? payload.retryAfterSeconds : undefined;
      const headerRetryAfterRaw = typeof response.headers?.get === "function"
        ? response.headers.get("Retry-After")
        : null;
      const headerRetryAfter = headerRetryAfterRaw ? Number.parseInt(headerRetryAfterRaw, 10) : Number.NaN;
      const retryAfterSeconds = Number.isFinite(payloadRetryAfter)
        ? Math.max(1, Math.ceil(payloadRetryAfter ?? 0))
        : Number.isFinite(headerRetryAfter)
          ? Math.max(1, Math.ceil(headerRetryAfter))
          : 0;

      if (response.status === 429 && payload.result === "rate_limited") {
        setStepUpCooldownSeconds(retryAfterSeconds);
        setStepUpError(
          retryAfterSeconds > 0
            ? `MFA verification rate-limited. Retry in ${retryAfterSeconds}s.`
            : (payload.message ?? "MFA verification rate-limited."),
        );
        return;
      }

      if (response.status === 401 && payload.result === "locked_out") {
        setStepUpError("MFA challenge locked. Maximum attempts exceeded. Please request a new challenge.");
        return;
      }

      if (payload.result === "expired") {
        setStepUpError("MFA challenge expired. Please start this action again.");
        return;
      }

      if (response.status === 401 && payload.result === "mfa_failed") {
        const remaining = typeof payload.attemptsRemaining === "number" ? payload.attemptsRemaining : 0;
        const attemptsText = remaining > 1 ? ` (${remaining} attempts remaining)` : remaining === 1 ? " (1 attempt remaining)" : "";
        setStepUpError(
          payload.message
            ? `${payload.message}${attemptsText}`
            : `Invalid MFA code${attemptsText}`,
        );
        return;
      }

      if (response.status !== 200) {
        setStepUpError(payload.message ?? "MFA verification failed.");
        return;
      }

      // Step-up verified — retry the pending action
      if (pendingAction === "regen") {
        setStepUpChallenge(null);
        setView("idle");
        setIsLoading(true);
        await handleRegenerate();
      } else if (pendingAction === "disable") {
        setStepUpChallenge(null);
        setView("disable_input");
        await attemptDisable(savedDisableCode);
      }
    } catch {
      setStepUpError("MFA verification request failed.");
    } finally {
      setIsLoading(false);
    }
  }

  const isEnrolled = mfaState?.enabled === true;

  return (
    <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
      <div>
        <h3 className="text-sm font-semibold text-slate-100">Authenticator (MFA)</h3>
        <p className="mt-1 text-xs text-slate-500">
          Manage your time-based one-time password authenticator for this account.
        </p>
      </div>

      {view === "idle" && (
        <div className="mt-4">
          {isEnrolled ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                <p className="font-medium">Authenticator active</p>
                {mfaState?.enrolledAt ? (
                  <p className="mt-1 text-emerald-300/80">
                    Enrolled: {new Date(mfaState.enrolledAt).toLocaleString()}
                  </p>
                ) : null}
                <p className="mt-1 text-emerald-300/80">
                  Recovery codes remaining: {mfaState?.recoveryCodesRemaining ?? 0}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={handleRegenerate}
                  className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:text-cyan-500"
                >
                  {isLoading ? "Loading..." : "Regenerate recovery codes"}
                </button>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => { setView("disable_input"); setErrorMessage(undefined); }}
                  className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:text-rose-500"
                >
                  Disable MFA
                </button>
              </div>
              {errorMessage ? (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{errorMessage}</p>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-400">
                No authenticator enrolled. Set one up to add a second factor to your station admin login.
              </p>
              <button
                type="button"
                disabled={isLoading}
                onClick={handleEnrollStart}
                className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-xs text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:text-cyan-500"
              >
                {isLoading ? "Starting..." : "Set up authenticator"}
              </button>
              {errorMessage ? (
                <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{errorMessage}</p>
              ) : null}
            </div>
          )}
        </div>
      )}

      {view === "enroll_qr" && qrCodeUri && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-slate-400">
            Scan the QR code with your authenticator app, or enter the key manually.
          </p>
          <div className="flex justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrCodeUri} alt="MFA QR code" className="h-48 w-48 rounded-lg border border-surface-borderSubtle bg-white" />
          </div>
          <div className="rounded-lg border border-surface-borderSubtle bg-ocean-850 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Manual entry key</p>
            <p className="mt-1 break-all font-mono text-xs text-slate-200">{manualSecret}</p>
          </div>
          <form onSubmit={handleEnrollVerify} className="space-y-3">
            <label className="block text-xs text-slate-400">
              Enter the 6-digit code from your app to confirm setup
              <input
                type="text"
                inputMode="numeric"
                value={enrollCode}
                onChange={(e) => setEnrollCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                placeholder="123456"
                maxLength={6}
                required
              />
            </label>
            {errorMessage ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{errorMessage}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:text-emerald-500"
              >
                {isLoading ? "Verifying..." : "Confirm setup"}
              </button>
              <button
                type="button"
                onClick={resetToIdle}
                className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:text-cyan-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {view === "enroll_codes" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <p className="font-medium">Authenticator enrolled successfully.</p>
            <p className="mt-1 text-emerald-300/80">Save your recovery codes in a safe place. They will not be shown again.</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">Recovery codes — save these now</p>
            <ul className="mt-2 space-y-1">
              {recoveryCodes.map((code) => (
                <li key={code} className="font-mono text-xs text-amber-100">{code}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={resetToIdle}
            className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:text-cyan-300"
          >
            Done
          </button>
        </div>
      )}

      {view === "disable_input" && (
        <div className="mt-4">
          <form onSubmit={handleDisableSubmit} className="space-y-3">
            <p className="text-xs text-slate-400">
              Enter your current authenticator code to confirm disabling MFA.
            </p>
            <label className="block text-xs text-slate-400">
              Authenticator code
              <input
                type="text"
                inputMode="numeric"
                value={disableCode}
                onChange={(e) => setDisableCode(e.target.value)}
                className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600"
                placeholder="123456"
                maxLength={6}
                required
              />
            </label>
            {errorMessage ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{errorMessage}</p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isLoading}
                className="rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:text-rose-500"
              >
                {isLoading ? "Disabling..." : "Disable MFA"}
              </button>
              <button
                type="button"
                onClick={resetToIdle}
                className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:text-cyan-300"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {view === "regen_codes" && (
        <div className="mt-4 space-y-4">
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            <p className="font-medium">Recovery codes regenerated.</p>
            <p className="mt-1 text-emerald-300/80">Your old codes are now invalid. Save the new codes in a safe place.</p>
          </div>
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-amber-400">New recovery codes — save these now</p>
            <ul className="mt-2 space-y-1">
              {recoveryCodes.map((code) => (
                <li key={code} className="font-mono text-xs text-amber-100">{code}</li>
              ))}
            </ul>
          </div>
          <button
            type="button"
            onClick={resetToIdle}
            className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:text-cyan-300"
          >
            Done
          </button>
        </div>
      )}

      {view === "stepup" && stepUpChallenge && (
        <div className="mt-4 space-y-3">
          <div className="rounded-lg border border-amber-500/25 bg-ocean-900/60 p-3 text-xs text-amber-100">
            <p className="font-medium">Step-up verification required</p>
            <p className="mt-1 text-amber-200/80">Verify your identity to continue with this sensitive operation.</p>
            <p className="mt-1">Expires: {new Date(stepUpChallenge.expiresAt).toLocaleString()}</p>
          </div>
          <form onSubmit={handleStepUpVerify} className="space-y-3">
            <fieldset className="space-y-2">
              <legend className="text-xs text-slate-400">Verification method</legend>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="radio"
                  value="authenticator"
                  name="mfa-stepup-method"
                  checked={stepUpMethod === "authenticator"}
                  onChange={() => setStepUpMethod("authenticator")}
                />
                Use authenticator code
              </label>
              {stepUpChallenge.recoveryCodeAllowed ? (
                <label className="flex items-center gap-2 text-xs text-slate-300">
                  <input
                    type="radio"
                    value="recovery"
                    name="mfa-stepup-method"
                    checked={stepUpMethod === "recovery"}
                    onChange={() => setStepUpMethod("recovery")}
                  />
                  Use recovery code
                </label>
              ) : null}
            </fieldset>

            {stepUpMethod === "authenticator" ? (
              <label className="block text-xs text-slate-400">
                Authenticator code
                <input
                  value={stepUpCode}
                  onChange={(e) => setStepUpCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100"
                  placeholder="123456"
                  required
                />
              </label>
            ) : (
              <label className="block text-xs text-slate-400">
                Recovery code
                <input
                  value={stepUpRecoveryCode}
                  onChange={(e) => setStepUpRecoveryCode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-sm text-slate-100"
                  placeholder="AAAA-BBBB"
                  required
                />
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isLoading || stepUpCooldownSeconds > 0}
                className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:text-amber-500"
              >
                {isLoading
                  ? "Verifying..."
                  : stepUpCooldownSeconds > 0
                    ? `Wait ${stepUpCooldownSeconds}s`
                    : "Verify and continue"}
              </button>
              <button
                type="button"
                onClick={resetToIdle}
                className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:text-cyan-300"
              >
                Cancel
              </button>
            </div>

            {stepUpError ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{stepUpError}</p>
            ) : null}
            {stepUpCooldownSeconds > 0 ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                Cooldown active: retry in {stepUpCooldownSeconds}s.
              </p>
            ) : null}
          </form>
        </div>
      )}
    </section>
  );
}
