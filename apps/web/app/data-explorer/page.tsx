import type { Metadata } from "next";
import { DataExplorerWorkspace } from "@/components/data-explorer/data-explorer-workspace";
import { AppShell } from "@/components/layout/app-shell";
import { getDataExplorerBootstrapWorkspace } from "@/lib/api/data-explorer-bootstrap";

export const metadata: Metadata = {
  title: "Data Explorer",
};

export default async function DataExplorerPage() {
  const { data, meta } = await getDataExplorerBootstrapWorkspace();

  return (
    <AppShell
      pageTitle="Data Explorer"
      pageSubtitle="Ocean Intelligence Platform - searchable research datasets and previews"
    >
      <DataExplorerWorkspace data={data} initialMeta={meta} />
    </AppShell>
  );
}
