import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { OceanStationsWorkspace } from "@/components/ocean-stations/ocean-stations-workspace";
import { apiClient } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "Ocean Stations",
};

export default async function OceanStationsPage() {
  const stations = await apiClient.oceanStations.getStations();

  return (
    <AppShell
      pageTitle="Ocean Stations"
      pageSubtitle="Ocean Intelligence Platform - live station operations and habitat surveillance"
    >
      <OceanStationsWorkspace stations={stations} />
    </AppShell>
  );
}
