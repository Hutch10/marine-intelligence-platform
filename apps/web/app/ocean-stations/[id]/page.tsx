import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { OceanStationDetailWorkspace } from "@/components/ocean-stations/ocean-station-detail-workspace";
import { apiClient } from "@/lib/api/client";

interface OceanStationDetailPageProps {
  params: {
    id: string;
  };
}

export const metadata: Metadata = {
  title: "Station Detail",
};

export default async function OceanStationDetailPage({ params }: OceanStationDetailPageProps) {
  const station = await apiClient.oceanStations.getStationById(params.id);

  if (!station) {
    notFound();
  }

  await apiClient.oceanStations.trackStationView(station.id, "detail");
  const analytics = await apiClient.oceanStations.getStationAnalytics(station.id);

  return (
    <AppShell
      pageTitle={station.name}
      pageSubtitle="Ocean Intelligence Platform - station detail and response telemetry"
    >
      <OceanStationDetailWorkspace station={station} analytics={analytics} />
    </AppShell>
  );
}
