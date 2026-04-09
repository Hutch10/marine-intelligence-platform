import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/platform/loading-state";

export default function StationRiskLoading() {
  return (
    <AppShell
      pageTitle="Station Risk"
      pageSubtitle="Marine intelligence API-backed station risk"
    >
      <div className="mx-auto max-w-5xl p-6">
        <LoadingState message="Loading live station risk assessment..." />
      </div>
    </AppShell>
  );
}
