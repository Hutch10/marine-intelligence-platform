import { AppShell } from "@/components/layout/app-shell";
import { LoadingState } from "@/components/platform/loading-state";

export default function RegionRiskTrendLoading() {
  return (
    <AppShell
      pageTitle="Regional Trend"
      pageSubtitle="Regional trend and projected outlook guidance"
    >
      <div className="mx-auto max-w-5xl p-6">
        <LoadingState message="Loading regional trend and projected outlook guidance..." />
      </div>
    </AppShell>
  );
}
