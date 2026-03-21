import type { Metadata } from "next";
import { AppShell } from "@/components/layout/app-shell";
import { InvestigationWorkspace } from "@/components/investigations/investigation-workspace";
import { apiClient } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "Investigations",
};

export default async function InvestigationsPage() {
  const data = await apiClient.investigations.getWorkspace();

  return (
    <AppShell
      pageTitle="Investigations"
      pageSubtitle="Ocean Intelligence Platform - active case analysis workspace"
    >
      <InvestigationWorkspace data={data} />
    </AppShell>
  );
}
