import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/platform/loading-state";

export default function RegionRiskLoading() {
  return (
    <AppShell
      pageTitle="Regional Risk"
      pageSubtitle="Live regional marine risk from the intelligence API"
    >
      <div className="mx-auto max-w-5xl p-6">
        <LoadingState message="Loading regional marine risk..." />
      </div>
    </AppShell>
  );
}
