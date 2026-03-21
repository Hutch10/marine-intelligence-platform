"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiClient } from "@/lib/api/client";
import { MfaManagementPanel } from "@/components/ocean-stations/mfa-management-panel";
import {
  createIncidentPresetPayloadFromControls,
  deleteIncidentPresetById,
  extractIncidentPresetControls,
  loadIncidentPresets,
  markIncidentPresetUsed,
  saveIncidentPreset,
  type IncidentPresetRecord,
} from "@/lib/persistence/incident-presets";
import type {
  OceanStationAdminAuthContext,
  OperationalAlertRuleType,
  OperationalAlertStatus,
  OperationalAlertsData,
  OperationalAlertsFilters,
  StationAdminMfaChallenge,
  OceanStationAdminRole,
  OceanStationDetail,
  StationAdminAuthEvent,
  StationAdminAuthEventFilters,
  StationAdminAuthEventType,
  StationAdminSecurityAlert,
  StationAdminSecuritySummary,
  StationAdminSessionSummary,
} from "@/lib/api/types";

interface OceanStationSecurityConsoleProps {
  station: OceanStationDetail;
  adminActorId: string;
  adminRole: OceanStationAdminRole;
  currentSessionId: string;
  authContext: OceanStationAdminAuthContext;
  summary: StationAdminSecuritySummary;
  alerts: StationAdminSecurityAlert[];
  authEvents: StationAdminAuthEvent[];
  authEventNextCursor: string | null;
  initialInvestigationFilters?: {
    actor?: string;
    ip?: string;
    eventType?: StationAdminAuthEventType;
    since?: string;
    until?: string;
  };
  operationalAlerts: OperationalAlertsData;
  initialOperationalAlertFilters?: {
    source?: string;
    status?: OperationalAlertStatus;
    ruleType?: OperationalAlertRuleType;
    limit?: number;
  };
  sessions: StationAdminSessionSummary[];
  revoked: boolean;
  error: string | undefined;
  canRevokeSessions: boolean;
  csrfToken: string;
}

interface OperationalAlertFilterState {
  status: OperationalAlertStatus | "";
  source: string;
  ruleType: OperationalAlertRuleType | "";
  limit: number;
}

interface InvestigationFilterState {
  actor: string;
  ip: string;
  eventType: StationAdminAuthEventType | "";
  since: string;
  until: string;
}

interface IncidentViewCopyFeedback {
  kind: "success" | "error";
  message: string;
}

const DEFAULT_OPERATIONAL_ALERT_LIMIT = 20;

function metricValue(value: number | string | null): string {
  if (value === null) {
    return "N/A";
  }

  return String(value);
}

function alertTypeLabel(alertType: StationAdminSecurityAlert["alertType"]): string {
  if (alertType === "repeated_login_failures_same_ip") {
    return "Repeated Login Failures From Same IP";
  }

  if (alertType === "many_actor_login_failures_one_ip") {
    return "Many Actor Login Failures From One IP";
  }

  if (alertType === "actor_login_many_ips") {
    return "Login Attempts Across Many IPs For Actor";
  }

  return "Repeated Lockouts";
}

function alertSeverityClasses(severity: StationAdminSecurityAlert["severity"]): string {
  if (severity === "high") {
    return "border-rose-500/40 bg-rose-500/10 text-rose-200";
  }

  if (severity === "medium") {
    return "border-amber-500/40 bg-amber-500/10 text-amber-200";
  }

  return "border-slate-500/40 bg-slate-500/10 text-slate-200";
}

function toIsoFromDateTimeLocal(value: string): string | undefined {
  const normalized = value.trim();

  if (!normalized) {
    return undefined;
  }

  const timestamp = new Date(normalized).getTime();

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return new Date(timestamp).toISOString();
}

function emptyInvestigationFilters() {
  return {
    actor: "",
    ip: "",
    eventType: "" as StationAdminAuthEventType | "",
    since: "",
    until: "",
  };
}

function applyInvestigationFiltersToUrl(filters: InvestigationFilterState) {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const actor = filters.actor.trim();
  const ip = filters.ip.trim();
  const since = filters.since.trim();
  const until = filters.until.trim();

  if (actor) {
    params.set("actor", actor);
  } else {
    params.delete("actor");
  }

  if (ip) {
    params.set("ip", ip);
  } else {
    params.delete("ip");
  }

  if (filters.eventType) {
    params.set("eventType", filters.eventType);
  } else {
    params.delete("eventType");
  }

  if (since) {
    params.set("since", since);
  } else {
    params.delete("since");
  }

  if (until) {
    params.set("until", until);
  } else {
    params.delete("until");
  }

  const query = params.toString();
  const nextPath = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextPath !== currentPath) {
    window.history.replaceState(window.history.state, "", nextPath);
  }
}

function emptyOperationalAlertFilters() {
  return {
    status: "" as OperationalAlertStatus | "",
    source: "",
    ruleType: "" as OperationalAlertRuleType | "",
    limit: DEFAULT_OPERATIONAL_ALERT_LIMIT,
  };
}

function applyOperationalAlertFiltersToUrl(filters: OperationalAlertFilterState) {
  if (typeof window === "undefined") {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const source = filters.source.trim();

  if (source) {
    params.set("source", source);
  } else {
    params.delete("source");
  }

  if (filters.status) {
    params.set("status", filters.status);
  } else {
    params.delete("status");
  }

  if (filters.ruleType) {
    params.set("ruleType", filters.ruleType);
  } else {
    params.delete("ruleType");
  }

  if (filters.limit === DEFAULT_OPERATIONAL_ALERT_LIMIT) {
    params.delete("limit");
  } else {
    params.set("limit", String(filters.limit));
  }

  params.delete("historyLimit");

  const query = params.toString();
  const nextPath = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextPath !== currentPath) {
    window.history.replaceState(window.history.state, "", nextPath);
  }
}

function buildOperationalAlertFilters(
  state: OperationalAlertFilterState,
): OperationalAlertsFilters {
  return {
    status: state.status || undefined,
    source: state.source.trim() || undefined,
    ruleType: state.ruleType || undefined,
    limit: state.limit,
  };
}

function operationalRuleTypeLabel(ruleType: OperationalAlertRuleType): string {
  if (ruleType === "source_failed") {
    return "source_failed";
  }

  if (ruleType === "source_stale") {
    return "source_stale";
  }

  if (ruleType === "repeated_degraded") {
    return "repeated_degraded";
  }

  return "persistence_failure";
}

function buildAuthEventFilters(
  state: {
    actor: string;
    ip: string;
    eventType: StationAdminAuthEventType | "";
    since: string;
    until: string;
  },
  cursor?: string,
): StationAdminAuthEventFilters {
  return {
    actor: state.actor.trim() || undefined,
    ip: state.ip.trim() || undefined,
    eventType: state.eventType || undefined,
    since: toIsoFromDateTimeLocal(state.since),
    until: toIsoFromDateTimeLocal(state.until),
    limit: 12,
    cursor,
  };
}

export function OceanStationSecurityConsole({
  station,
  adminActorId,
  adminRole,
  currentSessionId,
  authContext,
  summary,
  alerts,
  authEvents,
  authEventNextCursor,
  initialInvestigationFilters,
  operationalAlerts,
  initialOperationalAlertFilters,
  sessions,
  revoked,
  error,
  canRevokeSessions,
  csrfToken,
}: OceanStationSecurityConsoleProps) {
  const [securityAlerts, setSecurityAlerts] = useState(alerts);
  const [ingestionAlerts, setIngestionAlerts] = useState(operationalAlerts);
  const [events, setEvents] = useState(authEvents);
  const [nextCursor, setNextCursor] = useState<string | null>(authEventNextCursor);
  const [activeSessions, setActiveSessions] = useState(sessions);
  const [investigationFilters, setInvestigationFilters] = useState<InvestigationFilterState>(() => ({
    actor: initialInvestigationFilters?.actor ?? "",
    ip: initialInvestigationFilters?.ip ?? "",
    eventType: initialInvestigationFilters?.eventType ?? "",
    since: initialInvestigationFilters?.since ?? "",
    until: initialInvestigationFilters?.until ?? "",
  }));
  const [operationalAlertFilters, setOperationalAlertFilters] = useState<OperationalAlertFilterState>(() => ({
    status: initialOperationalAlertFilters?.status ?? "",
    source: initialOperationalAlertFilters?.source ?? "",
    ruleType: initialOperationalAlertFilters?.ruleType ?? "",
    limit: initialOperationalAlertFilters?.limit ?? DEFAULT_OPERATIONAL_ALERT_LIMIT,
  }));
  const [isRefreshingAlerts, setIsRefreshingAlerts] = useState(false);
  const [isRefreshingOperationalAlerts, setIsRefreshingOperationalAlerts] = useState(false);
  const [isFiltering, setIsFiltering] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isRevokingSessionId, setIsRevokingSessionId] = useState<string | null>(null);
  const [revokedStatus, setRevokedStatus] = useState(revoked);
  const [actionError, setActionError] = useState<string | undefined>(error);
  const [pendingRevokeTargetSessionId, setPendingRevokeTargetSessionId] = useState<string | null>(null);
  const [stepUpChallenge, setStepUpChallenge] = useState<StationAdminMfaChallenge | null>(null);
  const [stepUpMethod, setStepUpMethod] = useState<"authenticator" | "recovery">("authenticator");
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpRecoveryCode, setStepUpRecoveryCode] = useState("");
  const [isVerifyingStepUp, setIsVerifyingStepUp] = useState(false);
  const [stepUpError, setStepUpError] = useState<string | undefined>(undefined);
  const [stepUpCooldownSeconds, setStepUpCooldownSeconds] = useState(0);
  const [investigationError, setInvestigationError] = useState<string | undefined>(undefined);
  const [operationalAlertsError, setOperationalAlertsError] = useState<string | undefined>(undefined);
  const [exportStatus, setExportStatus] = useState<string | undefined>(undefined);
  const [incidentViewCopyFeedback, setIncidentViewCopyFeedback] = useState<IncidentViewCopyFeedback | undefined>(undefined);
  const [presets, setPresets] = useState<IncidentPresetRecord[]>([]);
  const [showPresetForm, setShowPresetForm] = useState(false);
  const [presetName, setPresetName] = useState("");
  const [presetError, setPresetError] = useState<string | undefined>(undefined);
  const [presetStatus, setPresetStatus] = useState<string | undefined>(undefined);

  useEffect(() => {
    const loaded = loadIncidentPresets();
    setPresets(loaded);
  }, []);

  useEffect(() => {
    if (stepUpCooldownSeconds <= 0) {
      return;
    }

    const timer = window.setInterval(() => {
      setStepUpCooldownSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [stepUpCooldownSeconds]);

  useEffect(() => {
    applyInvestigationFiltersToUrl(investigationFilters);
  }, [investigationFilters]);

  useEffect(() => {
    applyOperationalAlertFiltersToUrl(operationalAlertFilters);
  }, [operationalAlertFilters]);

  const metrics = [
    { label: "Active Sessions", value: summary.activeSessionCount, accent: "text-cyan-300" },
    { label: "Login Success (24h)", value: summary.loginSuccessCount24h, accent: "text-emerald-300" },
    { label: "Login Failures (24h)", value: summary.loginFailureCount24h, accent: "text-amber-300" },
    { label: "Lockouts (24h)", value: summary.lockoutCount24h, accent: "text-rose-300" },
    { label: "Revocations (24h)", value: summary.revokeCount24h, accent: "text-violet-300" },
    { label: "Unique IPs (24h)", value: summary.uniqueIpCount24h, accent: "text-slate-200" },
  ] as const;

  async function refreshAlerts() {
    setIsRefreshingAlerts(true);
    try {
      const latest = await apiClient.stationAdminAuth.getSecurityAlerts(authContext);

      if (latest) {
        setSecurityAlerts(latest);
      }
    } finally {
      setIsRefreshingAlerts(false);
    }
  }

  async function refreshOperationalAlerts(filters = operationalAlertFilters) {
    setIsRefreshingOperationalAlerts(true);
    setOperationalAlertsError(undefined);

    try {
      const latest = await apiClient.ingestionOperations.getOperationalAlerts(
        buildOperationalAlertFilters(filters),
      );

      setIngestionAlerts(latest);

      if (latest.source === "unavailable") {
        setOperationalAlertsError(
          `Operational alerts are currently unavailable (${latest.fallbackReason ?? "unknown"}).`,
        );
      }
    } catch {
      setOperationalAlertsError("Unable to refresh operational alerts.");
    } finally {
      setIsRefreshingOperationalAlerts(false);
    }
  }

  async function applyOperationalAlertFilters() {
    await refreshOperationalAlerts(operationalAlertFilters);
  }

  async function resetOperationalAlertFilters() {
    const reset = emptyOperationalAlertFilters();
    setOperationalAlertFilters(reset);
    await refreshOperationalAlerts(reset);
  }

  async function applyFilters() {
    setIsFiltering(true);
    setInvestigationError(undefined);
    setExportStatus(undefined);

    try {
      const page = await apiClient.stationAdminAuth.queryEvents(
        buildAuthEventFilters(investigationFilters),
        authContext,
      );

      if (!page) {
        setInvestigationError("Unable to load auth events for the selected filters.");
        return;
      }

      setEvents(page.events);
      setNextCursor(page.nextCursor);
    } finally {
      setIsFiltering(false);
    }
  }

  async function resetFilters() {
    const reset = emptyInvestigationFilters();
    setInvestigationFilters(reset);
    setIsFiltering(true);
    setInvestigationError(undefined);
    setExportStatus(undefined);

    try {
      const page = await apiClient.stationAdminAuth.queryEvents(
        buildAuthEventFilters(reset),
        authContext,
      );

      if (!page) {
        setInvestigationError("Unable to reset auth event filters.");
        return;
      }

      setEvents(page.events);
      setNextCursor(page.nextCursor);
    } finally {
      setIsFiltering(false);
    }
  }

  async function loadMoreEvents() {
    if (!nextCursor) {
      return;
    }

    setIsLoadingMore(true);
    setInvestigationError(undefined);

    try {
      const page = await apiClient.stationAdminAuth.queryEvents(
        buildAuthEventFilters(investigationFilters, nextCursor),
        authContext,
      );

      if (!page) {
        setInvestigationError("Unable to load additional auth events.");
        return;
      }

      setEvents((previous) => {
        const existing = new Set(previous.map((event) => event.id));
        const merged = [...previous];

        for (const event of page.events) {
          if (!existing.has(event.id)) {
            merged.push(event);
          }
        }

        return merged;
      });
      setNextCursor(page.nextCursor);
    } finally {
      setIsLoadingMore(false);
    }
  }

  async function exportEvents() {
    setIsExporting(true);
    setInvestigationError(undefined);
    setExportStatus(undefined);

    try {
      const exportPayload = await apiClient.stationAdminAuth.exportEvents(
        buildAuthEventFilters(investigationFilters),
        authContext,
      );

      if (!exportPayload) {
        setInvestigationError("Auth event export failed.");
        return;
      }

      const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: "application/json" });
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = exportPayload.fileName;
      link.click();
      URL.revokeObjectURL(blobUrl);
      setExportStatus(`Exported ${exportPayload.events.length} events.`);
    } finally {
      setIsExporting(false);
    }
  }

  async function copyIncidentViewLink() {
    if (typeof window === "undefined") {
      return;
    }

    setIncidentViewCopyFeedback(undefined);

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("clipboard_unavailable");
      }

      await navigator.clipboard.writeText(window.location.href);
      setIncidentViewCopyFeedback({ kind: "success", message: "Incident view link copied." });
    } catch {
      setIncidentViewCopyFeedback({ kind: "error", message: "Unable to copy incident view link." });
    }
  }

  function openIncidentInNewTab() {
    if (typeof window === "undefined") {
      return;
    }

    window.open(window.location.href, "_blank", "noopener,noreferrer");
  }

  function resetAllUrlFilters() {
    setInvestigationFilters(emptyInvestigationFilters());
    setOperationalAlertFilters(emptyOperationalAlertFilters());
  }

  function saveCurrentAsPreset() {
    setPresetError(undefined);
    setPresetStatus(undefined);
    const name = presetName.trim();

    if (!name) {
      setPresetError("Preset name is required.");
      return;
    }

    const result = saveIncidentPreset(
      {
        name,
        payload: createIncidentPresetPayloadFromControls({
          actor: investigationFilters.actor,
          ip: investigationFilters.ip,
          eventType: investigationFilters.eventType,
          since: investigationFilters.since,
          until: investigationFilters.until,
          source: operationalAlertFilters.source,
          status: operationalAlertFilters.status,
          ruleType: operationalAlertFilters.ruleType,
          limit: operationalAlertFilters.limit,
        }),
      },
    );

    if (!result.ok) {
      setPresetError(result.error);
      return;
    }

    setPresets(result.presets);
    setPresetName("");
    setShowPresetForm(false);
    setPresetStatus("Preset saved.");
  }

  function applyPreset(presetId: string) {
    const preset = presets.find((entry) => entry.id === presetId);

    if (!preset) {
      setPresetError("Preset not found.");
      return;
    }

    const controls = extractIncidentPresetControls(preset.payload);

    setInvestigationFilters({
      actor: controls.actor,
      ip: controls.ip,
      eventType: controls.eventType,
      since: controls.since,
      until: controls.until,
    });
    setOperationalAlertFilters({
      source: controls.source,
      status: controls.status,
      ruleType: controls.ruleType,
      limit: controls.limit,
    });

    const usageResult = markIncidentPresetUsed(preset.id);
    if (usageResult.ok) {
      setPresets(usageResult.presets);
    }
    // Usage tracking is best-effort and must not block applying preset controls.

    setPresetError(undefined);
    setPresetStatus("Preset applied to controls. Use Apply filters / Apply alert filters to refresh data.");
  }

  function removePreset(presetId: string) {
    const result = deleteIncidentPresetById(presetId);

    if (!result.ok) {
      setPresetError(result.error ?? "Unable to delete preset.");
      return;
    }

    setPresetError(undefined);
    setPresetStatus("Preset deleted.");
    setPresets(result.presets);
  }

  function resetStepUpState() {
    setStepUpChallenge(null);
    setPendingRevokeTargetSessionId(null);
    setStepUpCode("");
    setStepUpRecoveryCode("");
    setStepUpMethod("authenticator");
    setStepUpCooldownSeconds(0);
    setStepUpError(undefined);
  }

  async function attemptRevoke(targetSessionId: string, afterStepUp = false) {
    setIsRevokingSessionId(targetSessionId);
    setActionError(undefined);
    setRevokedStatus(false);

    try {
      const response = await fetch("/api/station-admin/session/revoke", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          csrfToken,
          targetSessionId,
        }),
      });

      const payload = (await response.json()) as {
        ok?: boolean;
        message?: string;
        mfaRequired?: boolean;
        challenge?: StationAdminMfaChallenge;
      };

      if (response.status === 200 && payload.ok === true) {
        setRevokedStatus(true);
        setActiveSessions((current) => current.filter((session) => session.id !== targetSessionId));
        resetStepUpState();
        return;
      }

      if (
        !afterStepUp
        && response.status === 401
        && payload.mfaRequired === true
        && payload.challenge
      ) {
        setPendingRevokeTargetSessionId(targetSessionId);
        setStepUpChallenge(payload.challenge);
        setStepUpCooldownSeconds(0);
        setStepUpError(undefined);
        return;
      }

      if (afterStepUp && response.status === 401) {
        setStepUpError(payload.message ?? "MFA verification completed, but revoke still requires step-up.");
        return;
      }

      setActionError(payload.message ?? "Session revocation failed.");
    } catch {
      setActionError("Session revocation request failed.");
    } finally {
      setIsRevokingSessionId(null);
    }
  }

  async function verifyStepUpChallenge(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stepUpChallenge || !pendingRevokeTargetSessionId || stepUpCooldownSeconds > 0) {
      return;
    }

    setIsVerifyingStepUp(true);
    setStepUpError(undefined);

    try {
      const response = await fetch("/api/station-admin/mfa/verify", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          challengeId: stepUpChallenge.challengeId,
          code: stepUpMethod === "authenticator" ? stepUpCode.trim() : undefined,
          recoveryCode: stepUpMethod === "recovery" ? stepUpRecoveryCode.trim() : undefined,
          sessionId: currentSessionId,
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

      // Differentiate MFA failure types
      if (response.status === 401 && payload.result === "locked_out") {
        setStepUpError("MFA challenge locked. Maximum attempts exceeded. Please request a new challenge.");
        return;
      }

      if (payload.result === "expired") {
        setStepUpError("MFA challenge expired. Please request a new verification and try again.");
        return;
      }

      if (response.status === 401 && payload.result === "mfa_failed") {
        const remaining = typeof payload.attemptsRemaining === "number" ? payload.attemptsRemaining : 0;
        const attemptsText = remaining > 1 ? `(${remaining} attempts remaining)` : remaining === 1 ? "(1 attempt remaining)" : "";
        setStepUpError(
          payload.message
            ? `${payload.message}${attemptsText ? ` ${attemptsText}` : ""}`
            : `Invalid MFA code${attemptsText ? ` ${attemptsText}` : ""}`,
        );
        return;
      }

      if (response.status !== 200) {
        setStepUpError(payload.message ?? "MFA verification failed.");
        return;
      }

      setStepUpCooldownSeconds(0);

      await attemptRevoke(pendingRevokeTargetSessionId, true);
    } catch {
      setStepUpError("MFA verification request failed.");
    } finally {
      setIsVerifyingStepUp(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6 p-6">
      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
        <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-400">Security Operations Console</p>
        <h2 className="mt-2 text-2xl font-semibold text-slate-100">{station.name} Security</h2>
        <p className="mt-2 text-sm text-slate-400">
          Review session health, investigate recent authentication activity, and revoke active sessions.
        </p>
        <div className="mt-4 grid gap-2 text-xs text-slate-400 md:grid-cols-3">
          <p className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Station ID</span>
            <span className="mt-1 block font-mono text-slate-300">{station.id}</span>
          </p>
          <p className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Signed In As</span>
            <span className="mt-1 block text-slate-300">{adminActorId}</span>
          </p>
          <p className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2">
            <span className="block text-[10px] uppercase tracking-[0.14em] text-slate-500">Role</span>
            <span className="mt-1 block text-slate-300">{adminRole}</span>
          </p>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <Link
            href={`/ocean-stations/${station.slug}/admin`}
            className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-slate-300 transition-colors hover:text-cyan-300"
          >
            Back to station admin
          </Link>
          <Link
            href={`/ocean-stations/${station.slug}`}
            className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-slate-300 transition-colors hover:text-cyan-300"
          >
            View station detail
          </Link>
        </div>
      </section>

      {revokedStatus ? (
        <section className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-200">
          Session revoked successfully.
        </section>
      ) : null}

      {actionError ? (
        <section className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
          {actionError}
        </section>
      ) : null}

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-100">Security Summary</h3>
          <p className="mt-1 text-xs text-slate-500">Operational snapshot from the last 24 hours.</p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {metrics.map((metric) => (
            <article key={metric.label} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{metric.label}</p>
              <p className={`mt-2 text-2xl font-semibold ${metric.accent}`}>{metricValue(metric.value)}</p>
            </article>
          ))}
          <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Last Event</p>
            <p className="mt-2 text-sm text-slate-300">
              {summary.lastEventAt ? new Date(summary.lastEventAt).toLocaleString() : "No recent auth events"}
            </p>
          </article>
        </div>
      </section>

      <MfaManagementPanel
        sessionId={currentSessionId}
        csrfToken={csrfToken}
        initialMfaState={authContext.mfa}
      />

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Security Alerts</h3>
            <p className="mt-1 text-xs text-slate-500">Heuristic alerts derived from recent authentication telemetry.</p>
          </div>
          <button
            type="button"
            onClick={refreshAlerts}
            disabled={isRefreshingAlerts}
            className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            {isRefreshingAlerts ? "Refreshing..." : "Refresh alerts"}
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {securityAlerts.length > 0 ? securityAlerts.map((alert, index) => (
            <article
              key={`${alert.alertType}:${alert.actorId ?? "none"}:${alert.ip ?? "none"}:${index}`}
              className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase tracking-[0.14em] text-slate-500">{alertTypeLabel(alert.alertType)}</span>
                <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.08em] ${alertSeverityClasses(alert.severity)}`}>
                  {alert.severity}
                </span>
              </div>
              <p className="mt-2 text-slate-400">Events: {alert.eventCount} in {alert.timeWindow}</p>
              {alert.actorId ? <p className="mt-1 text-slate-400">Actor: {alert.actorId}</p> : null}
              {alert.ip ? <p className="mt-1 text-slate-400">IP: {alert.ip}</p> : null}
            </article>
          )) : (
            <p className="rounded-lg border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-3 text-xs text-slate-500">
              No active security alerts in the current time window.
            </p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Ingestion Operational Alerts</h3>
            <p className="mt-1 text-xs text-slate-500">
              active_alerts remains active-only, while recent_history follows status filters.
            </p>
          </div>
          <button
            type="button"
            onClick={() => refreshOperationalAlerts()}
            disabled={isRefreshingOperationalAlerts}
            className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            {isRefreshingOperationalAlerts ? "Refreshing..." : "Refresh snapshot"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs text-slate-400">
            Alert source
            <input
              type="text"
              value={operationalAlertFilters.source}
              onChange={(event) => setOperationalAlertFilters((previous) => ({ ...previous, source: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
              placeholder="ioos_regional"
            />
          </label>
          <label className="text-xs text-slate-400">
            Alert status
            <select
              value={operationalAlertFilters.status}
              onChange={(event) => {
                const status = event.target.value as OperationalAlertStatus | "";
                setOperationalAlertFilters((previous) => ({ ...previous, status }));
              }}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
            >
              <option value="">Any status</option>
              <option value="active">active</option>
              <option value="resolved">resolved</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Rule type
            <select
              value={operationalAlertFilters.ruleType}
              onChange={(event) => {
                const ruleType = event.target.value as OperationalAlertRuleType | "";
                setOperationalAlertFilters((previous) => ({ ...previous, ruleType }));
              }}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
            >
              <option value="">Any rule</option>
              <option value="source_failed">source_failed</option>
              <option value="source_stale">source_stale</option>
              <option value="repeated_degraded">repeated_degraded</option>
              <option value="persistence_failure">persistence_failure</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            History limit
            <select
              value={String(operationalAlertFilters.limit)}
              onChange={(event) => {
                const parsed = Number.parseInt(event.target.value, 10);
                setOperationalAlertFilters((previous) => ({
                  ...previous,
                  limit: Number.isFinite(parsed) ? parsed : previous.limit,
                }));
              }}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
            >
              <option value="10">10</option>
              <option value="20">20</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
            </select>
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={applyOperationalAlertFilters}
            disabled={isRefreshingOperationalAlerts}
            className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:text-cyan-500"
          >
            {isRefreshingOperationalAlerts ? "Applying..." : "Apply alert filters"}
          </button>
          <button
            type="button"
            onClick={resetOperationalAlertFilters}
            disabled={isRefreshingOperationalAlerts}
            className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-slate-300 transition-colors hover:text-cyan-300 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            Reset alert filters
          </button>
        </div>

        {operationalAlertsError ? (
          <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            {operationalAlertsError}
          </p>
        ) : null}

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Data source</p>
            <p className="mt-1">{ingestionAlerts.source}</p>
          </article>
          <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Active alerts</p>
            <p className="mt-1">{ingestionAlerts.summary.activeAlertCount}</p>
          </article>
          <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">Critical alerts</p>
            <p className="mt-1">{ingestionAlerts.summary.criticalCount}</p>
          </article>
        </div>

        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">active_alerts</p>
            <div className="mt-2 space-y-2">
              {ingestionAlerts.activeAlerts.length > 0 ? ingestionAlerts.activeAlerts.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-900/60 p-2">
                  <p className="font-medium text-slate-200">{alert.title}</p>
                  <p className="mt-1 text-slate-400">
                    {alert.source} - {operationalRuleTypeLabel(alert.ruleType)} - {alert.severity}
                  </p>
                </div>
              )) : (
                <p className="text-slate-500">No active alerts for the current source/rule filters.</p>
              )}
            </div>
          </article>
          <article className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
            <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">recent_history</p>
            <div className="mt-2 space-y-2">
              {ingestionAlerts.recentHistory.length > 0 ? ingestionAlerts.recentHistory.map((alert) => (
                <div key={alert.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-900/60 p-2">
                  <p className="font-medium text-slate-200">{alert.title}</p>
                  <p className="mt-1 text-slate-400">
                    {alert.status} - {alert.source} - {operationalRuleTypeLabel(alert.ruleType)}
                  </p>
                </div>
              )) : (
                <p className="text-slate-500">No historical alerts for the selected filters.</p>
              )}
            </div>
          </article>
        </div>
      </section>

      {stepUpChallenge ? (
        <section className="rounded-2xl border border-amber-500/35 bg-amber-500/10 p-5">
          <h3 className="text-sm font-semibold text-amber-100">MFA Step-Up Required</h3>
          <p className="mt-1 text-xs text-amber-200/85">
            Verify this challenge to continue revoking the selected session.
          </p>
          <div className="mt-3 rounded-lg border border-amber-500/25 bg-ocean-900/60 p-3 text-xs text-amber-100">
            <p>Challenge: {stepUpChallenge.challengeId}</p>
            <p className="mt-1">Purpose: {stepUpChallenge.purpose}</p>
            <p className="mt-1">Expires: {new Date(stepUpChallenge.expiresAt).toLocaleString()}</p>
          </div>

          <form className="mt-4 space-y-3" onSubmit={verifyStepUpChallenge}>
            <fieldset className="space-y-2">
              <legend className="text-xs text-amber-100">Verification method</legend>
              <label className="flex items-center gap-2 text-xs text-amber-100">
                <input
                  type="radio"
                  value="authenticator"
                  name="step-up-method"
                  checked={stepUpMethod === "authenticator"}
                  onChange={() => setStepUpMethod("authenticator")}
                />
                Use authenticator code
              </label>
              <label className="flex items-center gap-2 text-xs text-amber-100">
                <input
                  type="radio"
                  value="recovery"
                  name="step-up-method"
                  checked={stepUpMethod === "recovery"}
                  onChange={() => setStepUpMethod("recovery")}
                />
                Use recovery code
              </label>
            </fieldset>

            {stepUpMethod === "authenticator" ? (
              <label className="block text-xs text-amber-100">
                Authenticator code
                <input
                  value={stepUpCode}
                  onChange={(event) => setStepUpCode(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-amber-500/25 bg-ocean-900 px-3 py-2 text-sm text-slate-100"
                  placeholder="123456"
                  required
                />
              </label>
            ) : (
              <label className="block text-xs text-amber-100">
                Recovery code
                <input
                  value={stepUpRecoveryCode}
                  onChange={(event) => setStepUpRecoveryCode(event.target.value)}
                  className="mt-1 w-full rounded-lg border border-amber-500/25 bg-ocean-900 px-3 py-2 text-sm text-slate-100"
                  placeholder="RECOVERY-XXXX"
                  required
                />
              </label>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="submit"
                disabled={isVerifyingStepUp || stepUpCooldownSeconds > 0}
                className="rounded-lg border border-amber-500/35 bg-amber-500/10 px-3 py-2 text-xs text-amber-100 transition-colors hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:text-amber-500"
              >
                {isVerifyingStepUp
                  ? "Verifying..."
                  : stepUpCooldownSeconds > 0
                    ? `Wait ${stepUpCooldownSeconds}s`
                    : "Verify and continue"}
              </button>
              <button
                type="button"
                onClick={resetStepUpState}
                className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:text-cyan-300"
              >
                Cancel challenge
              </button>
            </div>

            {stepUpError ? (
              <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">{stepUpError}</p>
            ) : null}

            {stepUpCooldownSeconds > 0 ? (
              <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
                Cooldown active: you can retry verification in {stepUpCooldownSeconds}s.
              </p>
            ) : null}
          </form>
        </section>
      ) : null}

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Investigation Tools</h3>
            <p className="mt-1 text-xs text-slate-500">Filter auth telemetry by actor, IP, event type, and date range.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copyIncidentViewLink}
              className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300"
            >
              Copy incident view link
            </button>
            <button
              type="button"
              onClick={openIncidentInNewTab}
              className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300"
            >
              Open incident in new tab
            </button>
            <button
              type="button"
              onClick={resetAllUrlFilters}
              className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300"
            >
              Reset all URL filters
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          <label className="text-xs text-slate-400">
            Actor
            <input
              type="text"
              value={investigationFilters.actor}
              onChange={(event) => setInvestigationFilters((previous) => ({ ...previous, actor: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
              placeholder="ops.lead@marine.local"
            />
          </label>
          <label className="text-xs text-slate-400">
            IP
            <input
              type="text"
              value={investigationFilters.ip}
              onChange={(event) => setInvestigationFilters((previous) => ({ ...previous, ip: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
              placeholder="203.0.113.42"
            />
          </label>
          <label className="text-xs text-slate-400">
            Event Type
            <select
              value={investigationFilters.eventType}
              onChange={(event) => {
                const eventType = event.target.value as StationAdminAuthEventType | "";
                setInvestigationFilters((previous) => ({ ...previous, eventType }));
              }}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
            >
              <option value="">Any event</option>
              <option value="login_success">login_success</option>
              <option value="login_failure">login_failure</option>
              <option value="login_locked">login_locked</option>
              <option value="logout">logout</option>
              <option value="refresh">refresh</option>
              <option value="revoke">revoke</option>
            </select>
          </label>
          <label className="text-xs text-slate-400">
            Since
            <input
              type="datetime-local"
              value={investigationFilters.since}
              onChange={(event) => setInvestigationFilters((previous) => ({ ...previous, since: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
            />
          </label>
          <label className="text-xs text-slate-400">
            Until
            <input
              type="datetime-local"
              value={investigationFilters.until}
              onChange={(event) => setInvestigationFilters((previous) => ({ ...previous, until: event.target.value }))}
              className="mt-1 w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-200"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={applyFilters}
            disabled={isFiltering}
            className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-2 text-cyan-200 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:text-cyan-500"
          >
            {isFiltering ? "Applying..." : "Apply filters"}
          </button>
          <button
            type="button"
            onClick={resetFilters}
            disabled={isFiltering}
            className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-slate-300 transition-colors hover:text-cyan-300 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            Reset filters
          </button>
          <button
            type="button"
            onClick={exportEvents}
            disabled={isExporting}
            className="rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-3 py-2 text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:text-emerald-500"
          >
            {isExporting ? "Exporting..." : "Export events"}
          </button>
        </div>
        {investigationError ? (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {investigationError}
          </p>
        ) : null}
        {exportStatus ? (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            {exportStatus}
          </p>
        ) : null}
        {incidentViewCopyFeedback?.kind === "success" ? (
          <p className="mt-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
            {incidentViewCopyFeedback.message}
          </p>
        ) : null}
        {incidentViewCopyFeedback?.kind === "error" ? (
          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-200">
            {incidentViewCopyFeedback.message}
          </p>
        ) : null}

        <div className="mt-6 rounded-lg border border-surface-borderSubtle bg-ocean-850/50 p-4">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-xs font-semibold text-slate-200">Incident Presets</h4>
              <p className="mt-1 text-[11px] text-slate-500">Save and apply saved filter combinations</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowPresetForm(!showPresetForm);
                setPresetError(undefined);
                setPresetStatus(undefined);
              }}
              className="rounded-lg border border-surface-borderSubtle bg-ocean-900 px-2 py-1 text-[11px] text-slate-300 transition-colors hover:text-cyan-300"
            >
              {showPresetForm ? "Cancel" : "Save preset"}
            </button>
          </div>

          {showPresetForm ? (
            <form
              className="mt-3 flex flex-wrap gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                saveCurrentAsPreset();
              }}
            >
              <input
                type="text"
                value={presetName}
                onChange={(e) => {
                  setPresetName(e.target.value);
                  setPresetError(undefined);
                }}
                placeholder="e.g., Suspicious login attempts"
                className="flex-1 rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-1 text-xs text-slate-200 placeholder-slate-600"
                required
              />
              <button
                type="submit"
                className="rounded-lg border border-cyan-500/35 bg-cyan-500/10 px-3 py-1 text-xs text-cyan-200 transition-colors hover:bg-cyan-500/20"
              >
                Save
              </button>
            </form>
          ) : null}

          {presetError ? (
            <p className="mt-2 rounded-lg border border-rose-500/30 bg-rose-500/10 p-2 text-xs text-rose-200">
              {presetError}
            </p>
          ) : null}

          {presetStatus ? (
            <p className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-xs text-emerald-200">
              {presetStatus}
            </p>
          ) : null}

          {presets.length > 0 ? (
            <div className="mt-3 space-y-2">
              {presets.map((preset) => (
                <div
                  key={preset.id}
                  className="flex items-center justify-between rounded-lg border border-surface-borderSubtle bg-ocean-900/50 px-3 py-2 text-xs text-slate-300"
                >
                  <span>{preset.name}</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => applyPreset(preset.id)}
                      className="rounded px-2 py-1 text-[10px] text-cyan-300 transition-colors hover:text-cyan-100"
                    >
                      Apply to controls
                    </button>
                    <button
                      type="button"
                      onClick={() => removePreset(preset.id)}
                      className="rounded px-2 py-1 text-[10px] text-rose-300 transition-colors hover:text-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-[11px] text-slate-500">No saved presets yet</p>
          )}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Recent Auth Events</h3>
            <p className="mt-1 text-xs text-slate-500">Latest security-relevant lifecycle events.</p>
          </div>
          <span className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-400">
            {events.length} loaded
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {events.length > 0 ? events.map((event) => (
            <article key={event.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
              <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                {event.eventType.replace(/_/g, " ")} · {new Date(event.occurredAt).toLocaleString()}
              </p>
              <p className="mt-1"><span className="text-slate-400">Actor:</span> {event.actorId ?? "unknown"}</p>
              {event.sessionId ? <p className="mt-1 text-slate-400">Session: {event.sessionId}</p> : null}
              {event.ip ? <p className="mt-1 text-slate-400">IP: {event.ip}</p> : null}
              {event.userAgent ? <p className="mt-1 text-slate-400">Agent: {event.userAgent}</p> : null}
              {event.source ? <p className="mt-1 text-slate-400">Source: {event.source}</p> : null}
            </article>
          )) : (
            <p className="rounded-lg border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-3 text-xs text-slate-500">
              No auth events captured yet.
            </p>
          )}

          {nextCursor ? (
            <button
              type="button"
              onClick={loadMoreEvents}
              disabled={isLoadingMore}
              className="w-full rounded-lg border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:text-cyan-300 disabled:cursor-not-allowed disabled:text-slate-500"
            >
              {isLoadingMore ? "Loading..." : "Load older events"}
            </button>
          ) : null}
        </div>
      </section>

      <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Active Sessions</h3>
            <p className="mt-1 text-xs text-slate-500">Live station admin sessions eligible for revocation.</p>
          </div>
          <span className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-400">
            {activeSessions.length} active
          </span>
        </div>
        <div className="mt-4 space-y-2">
          {activeSessions.length > 0 ? activeSessions.map((session) => {
            const isCurrentSession = session.id === currentSessionId;
            const isRevoking = isRevokingSessionId === session.id;
            return (
              <article key={session.id} className="rounded-lg border border-surface-borderSubtle bg-ocean-850/70 p-3 text-xs text-slate-300">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-1">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                      {session.actorRole} session
                    </p>
                    <p><span className="text-slate-400">Actor:</span> {session.actorId}</p>
                    <p className="text-slate-400">Session: {session.id}</p>
                    <p className="text-slate-400">Issued: {new Date(session.issuedAt).toLocaleString()}</p>
                    <p className="text-slate-400">Expires: {new Date(session.expiresAt).toLocaleString()}</p>
                    <p className="text-slate-400">
                      Last active: {session.lastActiveAt ? new Date(session.lastActiveAt).toLocaleString() : "No heartbeat yet"}
                    </p>
                    {session.ip ? <p className="text-slate-400">IP: {session.ip}</p> : null}
                    {session.userAgent ? <p className="text-slate-400">Agent: {session.userAgent}</p> : null}
                    {session.source ? <p className="text-slate-400">Source: {session.source}</p> : null}
                  </div>
                  <div className="md:min-w-[160px]">
                    {isCurrentSession ? (
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-xs text-slate-500"
                      >
                        Current session
                      </button>
                    ) : !canRevokeSessions ? (
                      <button
                        type="button"
                        disabled
                        className="w-full rounded-lg border border-surface-borderSubtle bg-ocean-900 px-3 py-2 text-xs text-slate-500"
                      >
                        Admin role required
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isRevoking || isVerifyingStepUp}
                        onClick={() => {
                          void attemptRevoke(session.id);
                        }}
                        className="w-full rounded-lg border border-rose-500/35 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 transition-colors hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:text-rose-500"
                      >
                        {isRevoking ? "Revoking..." : "Revoke session"}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            );
          }) : (
            <p className="rounded-lg border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-3 text-xs text-slate-500">
              No active sessions found.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
