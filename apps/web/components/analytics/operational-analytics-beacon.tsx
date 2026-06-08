"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { classifyPathnameForAnalytics } from "@/lib/operational-analytics/pathname";

/**
 * Records coarse page-view counts once per navigation. No cookies, ids, or profiling.
 */
export function OperationalAnalyticsBeacon() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || lastSent.current === pathname) {
      return;
    }

    lastSent.current = pathname;
    const payload = classifyPathnameForAnalytics(pathname);

    void fetch("/api/operational-analytics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {
      // Non-blocking; failures are ignored.
    });
  }, [pathname]);

  return null;
}
