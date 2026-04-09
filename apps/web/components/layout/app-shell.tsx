import { cn } from "@/lib/utils";
import { getFeedHealth } from "@/lib/feed-health";
import { FeedHealthBanner } from "@/components/layout/feed-health-banner";

interface AppShellProps {
  children: React.ReactNode;
  /** Override or hide the page title in the TopBar */
  pageTitle?: string;
  /** Sub-label shown below page title */
  pageSubtitle?: string;
  className?: string;
}

/**
 * AppShell – the root layout frame shared across all platform pages.
 *
 * Structure:
 *  ┌─────────────────────────────────────────────────┐
 *  │                  TopBar (h-14)                  │
 *  ├─────────────────────────────────────────────────┤
 *  │              FeedHealthBanner                   │
 *  ├──────────┬──────────────────────────────────────┤
 *  │          │                                      │
 *  │ Sidebar  │          Main content area          │
 *  │  (flex)  │            (flex-1, scroll)         │
 *  │          │                                      │
 *  └──────────┴──────────────────────────────────────┘
 *
 * Sidebar is rendered here via a static import so that routing
 * transitions only re-render `children`, keeping navigation state stable.
 *
 * FeedHealthBanner is rendered here — once per request — so that every page
 * shows current ingestion status without each page having to fetch it.
 */

// Lazy-loaded on the client to avoid SSR hydration mismatches for interactive panels
import { Sidebar }     from "@/components/layout/sidebar";
import { TopBar }      from "@/components/layout/topbar";
export function AppShell({
  children,
  pageTitle,
  pageSubtitle,
  className,
}: AppShellProps) {

  const feedHealth = getFeedHealth();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-ocean-950 text-slate-200">
      <TopBar title={pageTitle} subtitle={pageSubtitle} />

      <FeedHealthBanner feedHealth={feedHealth} />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar />

        <main
          className={cn(
            "min-w-0 flex-1 overflow-y-auto grid-overlay",
            "bg-ocean-950",
            className
          )}
        >
          {children}
        </main>
      </div>
    </div>
  );
}
