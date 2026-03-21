import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { OceanStationAdminWorkspace } from "@/components/ocean-stations/ocean-station-admin-workspace";
import { apiClient } from "@/lib/api/client";
import type {
  OceanStationAdminAuthContext,
  OceanStationAdminAlertItem,
  OceanStationAdminContentItem,
  OceanStationAdminPermission,
  OceanStationAdminSpeciesItem,
  OceanStationAdminTimelineItem,
  OceanStationThemeAccent,
} from "@/lib/api/types";

interface OceanStationAdminPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    saved?: string;
    error?: string;
  };
}

export const metadata: Metadata = {
  title: "Station Admin",
};

const DEFAULT_STATION_ADMIN_SESSION_COOKIE = "station_admin_session";

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

function parseJsonOverride<T>(value: FormDataEntryValue | null, label: string): T[] | undefined {
  const source = typeof value === "string" ? value.trim() : "";

  if (!source) {
    return undefined;
  }

  let parsed: unknown;

  try {
    parsed = JSON.parse(source);
  } catch {
    throw new Error(`${label} must be valid JSON.`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`${label} must be a JSON array.`);
  }

  return parsed as T[];
}

function readList(formData: FormData, key: string): string[] {
  return formData
    .getAll(key)
    .map((value) => (typeof value === "string" ? value.trim() : ""));
}

function buildSpeciesFromStructuredForm(formData: FormData): OceanStationAdminSpeciesItem[] {
  const names = readList(formData, "speciesName");
  const statuses = readList(formData, "speciesStatus");
  const trends = readList(formData, "speciesPopulationTrend");
  const notes = readList(formData, "speciesNotes");
  const rowCount = Math.max(names.length, statuses.length, trends.length, notes.length);
  const items: OceanStationAdminSpeciesItem[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const name = names[index] ?? "";
    const status = statuses[index] ?? "";
    const populationTrend = trends[index] ?? "";
    const note = notes[index] ?? "";

    if (!name && !status && !populationTrend && !note) {
      continue;
    }

    items.push({
      name,
      status,
      populationTrend,
      notes: note,
    });
  }

  return items;
}

function buildAlertsFromStructuredForm(formData: FormData): OceanStationAdminAlertItem[] {
  const titles = readList(formData, "alertsTitle");
  const severities = readList(formData, "alertsSeverity");
  const statuses = readList(formData, "alertsStatus");
  const details = readList(formData, "alertsDetail");
  const rowCount = Math.max(titles.length, severities.length, statuses.length, details.length);
  const items: OceanStationAdminAlertItem[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const title = titles[index] ?? "";
    const severityRaw = severities[index] ?? "";
    const status = statuses[index] ?? "";
    const detail = details[index] ?? "";

    if (!title && !status && !detail) {
      continue;
    }

    const severity =
      severityRaw === "high" || severityRaw === "medium" || severityRaw === "low"
        ? severityRaw
        : "medium";

    items.push({
      title,
      severity,
      status,
      detail,
    });
  }

  return items;
}

function buildTimelineFromStructuredForm(formData: FormData): OceanStationAdminTimelineItem[] {
  const labels = readList(formData, "timelineLabel");
  const phases = readList(formData, "timelinePhase");
  const details = readList(formData, "timelineDetail");
  const rowCount = Math.max(labels.length, phases.length, details.length);
  const items: OceanStationAdminTimelineItem[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const label = labels[index] ?? "";
    const phase = phases[index] ?? "";
    const detail = details[index] ?? "";

    if (!label && !phase && !detail) {
      continue;
    }

    items.push({
      label,
      phase,
      detail,
    });
  }

  return items;
}

function buildContentFromStructuredForm(formData: FormData): OceanStationAdminContentItem[] {
  const contentTypes = readList(formData, "contentType");
  const titles = readList(formData, "contentTitle");
  const summaries = readList(formData, "contentSummary");
  const hrefs = readList(formData, "contentHref");
  const rowCount = Math.max(contentTypes.length, titles.length, summaries.length, hrefs.length);
  const items: OceanStationAdminContentItem[] = [];

  for (let index = 0; index < rowCount; index += 1) {
    const contentType = contentTypes[index] ?? "";
    const title = titles[index] ?? "";
    const summary = summaries[index] ?? "";
    const href = hrefs[index] ?? "";

    if (!contentType && !title && !summary && !href) {
      continue;
    }

    items.push({
      contentType,
      title,
      summary,
      href: href || null,
    });
  }

  return items;
}

function errorMessage(errorCode: string | undefined): string | undefined {
  if (!errorCode) {
    return undefined;
  }

  if (errorCode === "invalid_json") {
    return "One or more editor sections contains invalid JSON. Please correct and save again.";
  }

  if (errorCode === "save_failed") {
    return "Station update failed. Confirm the payload shape and required fields, then retry.";
  }

  if (errorCode === "forbidden") {
    return "Your session does not include permission to edit this station.";
  }

  return "Station update failed.";
}

export default async function OceanStationAdminPage({ params, searchParams }: OceanStationAdminPageProps) {
  const adminContext = await getStationAdminAuthContext();

  if (!adminContext) {
    redirect(`/ocean-stations/${params.id}/admin/login?next=admin`);
  }

  if (!hasPermission(adminContext, "station.view_admin")) {
    notFound();
  }

  const adminAuth: OceanStationAdminAuthContext = adminContext;
  const canEditBranding = hasPermission(adminAuth, "station.edit_branding");
  const canEditContent = hasPermission(adminAuth, "station.edit_content");
  const canViewAudit = hasPermission(adminAuth, "station.view_audit");

  const station = await apiClient.oceanStations.getStationAdmin(params.id, adminAuth);

  if (!station) {
    notFound();
  }

  const auditHistory = canViewAudit
    ? (await apiClient.oceanStations.getStationAdminAudit(
      params.id,
      adminAuth,
    )) ?? []
    : [];
  const authEvents = canViewAudit
    ? (await apiClient.stationAdminAuth.getEvents(
      { limit: 8 },
      adminAuth,
    )) ?? []
    : [];

  const stationId = station.id;
  const stationSlug = station.slug;

  async function saveStationAdmin(formData: FormData) {
    "use server";

    if (!canEditBranding && !canEditContent) {
      redirect(`/ocean-stations/${stationSlug}/admin?error=forbidden`);
    }

    const submittedCsrfToken = String(formData.get("csrfToken") ?? "").trim();
    if (!submittedCsrfToken || submittedCsrfToken !== adminAuth.csrfToken) {
      redirect(`/ocean-stations/${stationSlug}/admin?error=forbidden`);
    }

    const accentColorRaw = String(formData.get("accentColor") ?? "cyan");
    const accentColor = accentColorRaw as OceanStationThemeAccent;

    const brandingPatch = {
      exhibitTitle: String(formData.get("exhibitTitle") ?? "").trim(),
      publicDescription: String(formData.get("publicDescription") ?? "").trim(),
      sponsorName: String(formData.get("sponsorName") ?? "").trim(),
      operatorName: String(formData.get("operatorName") ?? "").trim(),
      accentColor,
    };

    let species: OceanStationAdminSpeciesItem[] = [];
    let alerts: OceanStationAdminAlertItem[] = [];
    let timeline: OceanStationAdminTimelineItem[] = [];
    let content: OceanStationAdminContentItem[] = [];

    if (canEditContent) {
      try {
        const speciesJsonOverride = parseJsonOverride<OceanStationAdminSpeciesItem>(formData.get("speciesJson"), "Species editor");
        const alertsJsonOverride = parseJsonOverride<OceanStationAdminAlertItem>(formData.get("alertsJson"), "Alerts editor");
        const timelineJsonOverride = parseJsonOverride<OceanStationAdminTimelineItem>(formData.get("timelineJson"), "Timeline editor");
        const contentJsonOverride = parseJsonOverride<OceanStationAdminContentItem>(formData.get("contentJson"), "Educational content editor");

        species = speciesJsonOverride ?? buildSpeciesFromStructuredForm(formData);
        alerts = alertsJsonOverride ?? buildAlertsFromStructuredForm(formData);
        timeline = timelineJsonOverride ?? buildTimelineFromStructuredForm(formData);
        content = contentJsonOverride ?? buildContentFromStructuredForm(formData);
      } catch {
        redirect(`/ocean-stations/${stationSlug}/admin?error=invalid_json`);
      }
    }

    if (canEditBranding) {
      const brandingUpdate = await apiClient.oceanStations.updateStationBranding(
        stationId,
        brandingPatch,
        adminAuth,
      );

      if (!brandingUpdate) {
        redirect(`/ocean-stations/${stationSlug}/admin?error=save_failed`);
      }
    }

    if (canEditContent) {
      const contentUpdate = await apiClient.oceanStations.updateStationContent(
        stationId,
        {
          species,
          alerts,
          timeline,
          content,
        },
        adminAuth,
      );

      if (!contentUpdate) {
        redirect(`/ocean-stations/${stationSlug}/admin?error=save_failed`);
      }
    }

    redirect(`/ocean-stations/${stationSlug}/admin?saved=1`);
  }

  return (
    <AppShell
      pageTitle={`${station.name} Admin`}
      pageSubtitle="Ocean Intelligence Platform - internal station content management"
    >
      <OceanStationAdminWorkspace
        station={station}
        saved={searchParams?.saved === "1"}
        error={errorMessage(searchParams?.error)}
        adminActorId={adminAuth.actorId}
        permissions={adminAuth.permissions}
        canEditBranding={canEditBranding}
        canEditContent={canEditContent}
        canViewAudit={canViewAudit}
        auditHistory={auditHistory}
        authEvents={authEvents}
        saveAction={saveStationAdmin}
        csrfToken={adminAuth.csrfToken}
      />
    </AppShell>
  );
}
