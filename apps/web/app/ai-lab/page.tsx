import type { Metadata } from "next";
import { AiLabWorkspace } from "@/components/ai-lab/ai-lab-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { apiClient } from "@/lib/api/client";

export const metadata: Metadata = {
  title: "AI Research Lab",
};

export default async function AiLabPage() {
  const data = await apiClient.aiLab.getWorkspace();

  return (
    <AppShell
      pageTitle="AI Research Lab"
      pageSubtitle="Ocean Intelligence Platform - structured research synthesis and prompt workflows"
    >
      <AiLabWorkspace data={data} />
    </AppShell>
  );
}
