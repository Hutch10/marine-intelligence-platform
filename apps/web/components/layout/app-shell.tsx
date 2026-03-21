import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  /** Override or hide the page title in the TopBar */
  pageTitle?: string;
  /** Sub-label shown below page title */
  pageSubtitle?: string;
  /** Hide the right AI panel for pages that don't need it */
  hideAIPanel?: boolean;
  className?: string;
}

/**
 * AppShell – the root layout frame shared across all platform pages.
 *
 * Structure:
 *  ┌─────────────────────────────────────────────────┐
 *  │                  TopBar (h-14)                  │
 *  ├──────────┬──────────────────────────┬───────────┤
 *  │          │                          │           │
 *  │ Sidebar  │    Main content area     │ AI Panel  │
 *  │  (flex)  │      (flex-1, scroll)    │  (w-72)   │
 *  │          │                          │           │
 *  └──────────┴──────────────────────────┴───────────┘
 *
 * Sidebar and AI panel are rendered here via static imports so that routing
 * transitions only re-render `children`, keeping navigation state stable.
 */

// Lazy-loaded on the client to avoid SSR hydration mismatches for interactive panels
import { Sidebar }     from "@/components/layout/sidebar";
import { TopBar }      from "@/components/layout/topbar";
import { RightAIPanel } from "@/components/ai/right-ai-panel";

export function AppShell({
  children,
  pageTitle,
  pageSubtitle,
  hideAIPanel = false,
  className,
}: AppShellProps) {
  return (
    <div className="flex flex-col h-screen overflow-hidden bg-ocean-950 text-slate-200">
      {/* ── Top command bar ── */}
      <TopBar title={pageTitle} subtitle={pageSubtitle} />

      {/* ── Body row ── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar */}
        <Sidebar />

        {/* Main content */}
        <main
          className={cn(
            "min-w-0 flex-1 overflow-y-auto grid-overlay",
            "bg-ocean-950",
            className
          )}
        >
          {children}
        </main>

        {/* Right AI insight panel */}
        {!hideAIPanel && <RightAIPanel />}
      </div>
    </div>
  );
}
