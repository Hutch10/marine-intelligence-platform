import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OceanStationPublicWorkspace } from "@/components/ocean-stations/ocean-station-public-workspace";
import { apiClient } from "@/lib/api/client";

interface OceanStationPublicPageProps {
  params: {
    slug: string;
  };
}

export const metadata: Metadata = {
  title: "Station Public View",
};

export default async function OceanStationPublicPage({ params }: OceanStationPublicPageProps) {
  const station = await apiClient.oceanStations.getStationBySlug(params.slug);

  if (!station) {
    notFound();
  }

  await apiClient.oceanStations.trackStationView(station.id, "public");

  return <OceanStationPublicWorkspace station={station} />;
}
