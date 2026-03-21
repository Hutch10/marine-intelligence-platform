import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { OceanStationSecurityConsole } from "@/components/ocean-stations/ocean-station-security-console";
import { apiClient } from "@/lib/api/client";
import type {
  OceanStationAdminAuthContext,
  OceanStationAdminPermission,
  OperationalAlertRuleType,
  OperationalAlertStatus,
  StationAdminAuthEventType,
} from "@/lib/api/types";

interface OceanStationSecurityPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    revoked?: string;
    error?: string;
    actor?: string;
    ip?: string;
    eventType?: string;
    since?: string;
    until?: string;
    source?: string;
    status?: string;
    ruleType?: string;
    limit?: string;
    historyLimit?: string;
  };
}

export const metadata: Metadata = {
  title: "Station Security",
};

const DEFAULT_STATION_ADMIN_SESSION_COOKIE = "station_admin_session";
const DEFAULT_OPERATIONAL_ALERT_LIMIT = 20;
const ALLOWED_OPERATIONAL_ALERT_LIMITS = new Set([10, 20, 50, 100, 200]);
const ALLOWED_INVESTIGATION_EVENT_TYPES: ReadonlySet<StationAdminAuthEventType> = new Set([
  "login_success",
  "login_failure",
  "login_locked",
  "logout",
  "refresh",
  "revoke",
]);

function normalizeFilterText(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function parseOperationalAlertStatus(value: string | undefined): OperationalAlertStatus | undefined {
  const normalized = normalizeFilterText(value)?.toLowerCase();

  if (normalized === "active" || normalized === "resolved") {
    return normalized;
  }

  return undefined;
}

function parseOperationalAlertRuleType(value: string | undefined): OperationalAlertRuleType | undefined {
  const normalized = normalizeFilterText(value) as OperationalAlertRuleType | undefined;

  if (
    normalized === "source_failed"
    || normalized === "source_stale"
    || normalized === "repeated_degraded"
    || normalized === "persistence_failure"
  ) {
    return normalized;
  }

  return undefined;
}

function parseOperationalAlertLimit(limit: string | undefined, historyLimit: string | undefined): number {
  const raw = normalizeFilterText(limit) ?? normalizeFilterText(historyLimit);

  if (!raw) {
    return DEFAULT_OPERATIONAL_ALERT_LIMIT;
  }

  const numeric = Number(raw);

  if (!Number.isFinite(numeric)) {
    return DEFAULT_OPERATIONAL_ALERT_LIMIT;
  }

  const normalized = Math.floor(numeric);
  return ALLOWED_OPERATIONAL_ALERT_LIMITS.has(normalized) ? normalized : DEFAULT_OPERATIONAL_ALERT_LIMIT;
}

function parseOperationalAlertFilters(searchParams: OceanStationSecurityPageProps["searchParams"]): {
  source?: string;
  status?: OperationalAlertStatus;
  ruleType?: OperationalAlertRuleType;
  limit: number;
} {
  return {
    source: normalizeFilterText(searchParams?.source),
    status: parseOperationalAlertStatus(searchParams?.status),
    ruleType: parseOperationalAlertRuleType(searchParams?.ruleType),
    limit: parseOperationalAlertLimit(searchParams?.limit, searchParams?.historyLimit),
  };
}

function parseInvestigationEventType(value: string | undefined): StationAdminAuthEventType | undefined {
  const normalized = normalizeFilterText(value) as StationAdminAuthEventType | undefined;

  if (normalized && ALLOWED_INVESTIGATION_EVENT_TYPES.has(normalized)) {
    return normalized;
  }

  return undefined;
}

function parseDateTimeLocal(value: string | undefined): string | undefined {
  const normalized = normalizeFilterText(value);

  if (!normalized) {
    return undefined;
  }

  const timestamp = new Date(normalized).getTime();

  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  const date = new Date(timestamp);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function parseInitialInvestigationFilters(searchParams: OceanStationSecurityPageProps["searchParams"]): {
  actor?: string;
  ip?: string;
  eventType?: StationAdminAuthEventType;
  since?: string;
  until?: string;
} {
  return {
    actor: normalizeFilterText(searchParams?.actor),
    ip: normalizeFilterText(searchParams?.ip),
    eventType: parseInvestigationEventType(searchParams?.eventType),
    since: parseDateTimeLocal(searchParams?.since),
    until: parseDateTimeLocal(searchParams?.until),
  };
}

function getStationAdminSessionIdFromRequest(): string | null {
  const cookieStore = cookies();
  const cookieName = process.env.STATION_ADMIN_SESSION_COOKIE_NAME?.trim() || DEFAULT_STATION_ADMIN_SESSION_COOKIE;
  const sessionId = cookieStore.get(cookieName)?.value?.trim() ?? "";

  if (sessionId) {
    return sessionId;
  }

  if (process.env.NODE_ENV !== "production") {
    const devSessionId = process.env.STATION_ADMIN_DEV_SESSION_ID?.trim() ?? "";

    if (devSessionId) {
      return devSessionId;
    }
  }

  return null;
}

async function getStationAdminAuthContext(): Promise<OceanStationAdminAuthContext | null> {
  const sessionId = getStationAdminSessionIdFromRequest();

  if (!sessionId) {
    return null;
  }

  return apiClient.stationAdminAuth.getSession(sessionId);
}

function hasPermission(
  auth: OceanStationAdminAuthContext,
  permission: OceanStationAdminPermission,
): boolean {
  return auth.permissions.includes(permission);
}

function errorMessage(errorCode: string | undefined): string | undefined {
  if (!errorCode) {
    return undefined;
  }

  if (errorCode === "forbidden") {
    return "Your session does not include access to the security console.";
  }

  if (errorCode === "revoke_failed") {
    return "Session revocation failed. Refresh and retry.";
  }

  if (errorCode === "mfa_required") {
    return "Additional MFA verification is required before revoking this session.";
  }

  if (errorCode === "self_revoke") {
    return "Current session cannot be revoked from this console.";
  }

  if (errorCode === "invalid_request") {
    return "Security action request was invalid.";
  }

  return "Security action failed.";
}

export default async function OceanStationSecurityPage({ params, searchParams }: OceanStationSecurityPageProps) {
  const adminContext = await getStationAdminAuthContext();
  const currentSessionId = getStationAdminSessionIdFromRequest();

  if (!adminContext || !currentSessionId) {
    redirect(`/ocean-stations/${params.id}/admin/login?next=security`);
  }

  if (!hasPermission(adminContext, "station.view_admin")) {
    notFound();
  }

  const adminAuth: OceanStationAdminAuthContext = adminContext;
  const canViewAudit = hasPermission(adminAuth, "station.view_audit");

  if (!canViewAudit) {
    notFound();
  }

  const station = await apiClient.oceanStations.getStationAdmin(params.id, adminAuth);

  if (!station) {
    notFound();
  }

  const initialOperationalAlertFilters = parseOperationalAlertFilters(searchParams);
  const initialInvestigationFilters = parseInitialInvestigationFilters(searchParams);

  const [summary, authEventPage, sessions, alerts, operationalAlerts] = await Promise.all([
    apiClient.stationAdminAuth.getSecuritySummary(adminAuth),
    apiClient.stationAdminAuth.queryEvents({ limit: 12 }, adminAuth),
    apiClient.stationAdminAuth.getSessions({ limit: 12 }, adminAuth),
    apiClient.stationAdminAuth.getSecurityAlerts(adminAuth),
    apiClient.ingestionOperations.getOperationalAlerts(initialOperationalAlertFilters),
  ]);

  return (
    <AppShell
      pageTitle={`${station.name} Security`}
      pageSubtitle="Ocean Intelligence Platform - internal security operations"
    >
      <OceanStationSecurityConsole
        station={station}
        adminActorId={adminAuth.actorId}
        adminRole={adminAuth.role}
        currentSessionId={currentSessionId}
        summary={summary ?? {
          activeSessionCount: 0,
          loginSuccessCount24h: 0,
          loginFailureCount24h: 0,
          lockoutCount24h: 0,
          revokeCount24h: 0,
          uniqueIpCount24h: 0,
          lastEventAt: null,
        }}
        alerts={alerts ?? []}
        authContext={adminAuth}
        authEvents={authEventPage?.events ?? []}
        authEventNextCursor={authEventPage?.nextCursor ?? null}
        initialInvestigationFilters={initialInvestigationFilters}
        operationalAlerts={operationalAlerts}
        initialOperationalAlertFilters={initialOperationalAlertFilters}
        sessions={sessions ?? []}
        revoked={searchParams?.revoked === "1"}
        error={errorMessage(searchParams?.error)}
        canRevokeSessions={adminAuth.role === "admin"}
        csrfToken={adminAuth.csrfToken}
      />
    </AppShell>
  );
}
