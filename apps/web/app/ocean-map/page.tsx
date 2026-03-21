import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { OceanMapWorkspace } from "@/components/ocean-map/ocean-map-workspace";
import { apiClient } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "Ocean Map",
};

export default async function OceanMapPage() {
  const data = await apiClient.oceanMap.getWorkspace();

  return (
    <AppShell
      pageTitle="Ocean Map"
      pageSubtitle="Ocean Intelligence Platform - spatial monitoring and regional overlays"
    >
      <OceanMapWorkspace data={data} />
    </AppShell>
  );
}
