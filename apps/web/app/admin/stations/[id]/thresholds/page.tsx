import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { StationThresholdsEditor } from "@/components/admin/station-thresholds-editor";
import { apiClient } from "@/lib/api/client";
import type {
  OceanStationAdminAuthContext,
  OceanStationAdminPermission,
} from "@/lib/api/types";

interface StationThresholdsPageProps {
  params: {
    id: string;
  };
}

export const metadata: Metadata = {
  title: "Station Thresholds",
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

export default async function StationThresholdsPage({ params }: StationThresholdsPageProps) {
  const adminContext = await getStationAdminAuthContext();

  if (!adminContext) {
    redirect("/?notice=auth_required");
  }

  if (!hasPermission(adminContext, "station.view_admin")) {
    notFound();
  }

  const station = await apiClient.oceanStations.getStationAdmin(params.id, adminContext);

  if (!station) {
    notFound();
  }

  return (
    <AppShell
      pageTitle={`${station.name} Thresholds`}
      pageSubtitle="Ocean Intelligence Platform - threshold override management"
    >
      <StationThresholdsEditor
        stationId={station.id}
        stationName={station.name}
        csrfToken={adminContext.csrfToken}
      />
    </AppShell>
  );
}
