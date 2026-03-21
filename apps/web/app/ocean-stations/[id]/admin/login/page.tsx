import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { StationAdminLoginPanel } from "@/components/ocean-stations/station-admin-login-panel";
import { apiClient } from "@/lib/api/client";

interface StationAdminLoginPageProps {
  params: {
    id: string;
  };
  searchParams?: {
    next?: string;
  };
}

export const metadata: Metadata = {
  title: "Station Admin Login",
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

function destinationPath(stationId: string, next: string | undefined): string {
  if (next === "security") {
    return `/ocean-stations/${stationId}/admin/security`;
  }

  return `/ocean-stations/${stationId}/admin`;
}

export default async function StationAdminLoginPage({ params, searchParams }: StationAdminLoginPageProps) {
  const station = await apiClient.oceanStations.getStationById(params.id);

  if (!station) {
    redirect("/ocean-stations");
  }

  const destination = destinationPath(params.id, searchParams?.next);
  const sessionId = getStationAdminSessionIdFromRequest();

  if (sessionId) {
    const auth = await apiClient.stationAdminAuth.getSession(sessionId);

    if (auth?.permissions.includes("station.view_admin")) {
      if (searchParams?.next === "security" && !auth.permissions.includes("station.view_audit")) {
        redirect(`/ocean-stations/${params.id}/admin`);
      }

      redirect(destination);
    }
  }

  return (
    <main className="min-h-screen bg-ocean-950 p-6 text-slate-100">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 py-10">
        <div>
          <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-400">Ocean Intelligence Platform</p>
          <h1 className="mt-2 text-3xl font-semibold">Station Admin Authentication</h1>
          <p className="mt-2 max-w-2xl text-sm text-slate-400">
            Sign in to access station administration tools. MFA challenges are required for enrolled operators.
          </p>
        </div>

        <StationAdminLoginPanel
          stationId={station.id}
          stationName={station.name}
          destinationPath={destination}
        />
      </div>
    </main>
  );
}
