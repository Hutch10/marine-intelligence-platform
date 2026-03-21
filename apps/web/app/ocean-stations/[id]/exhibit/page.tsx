import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { OceanStationExhibitWorkspace } from "@/components/ocean-stations/ocean-station-exhibit-workspace";
import { apiClient } from "@/lib/api/client";

interface OceanStationExhibitPageProps {
  params: {
    id: string;
  };
}

export const metadata: Metadata = {
  title: "Station Exhibit Mode",
};

export default async function OceanStationExhibitPage({ params }: OceanStationExhibitPageProps) {
  const station = await apiClient.oceanStations.getStationById(params.id);

  if (!station) {
    notFound();
  }

  await apiClient.oceanStations.trackStationView(station.id, "exhibit");

  return <OceanStationExhibitWorkspace station={station} />;
}
