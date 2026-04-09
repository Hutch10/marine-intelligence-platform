import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Routes that are quarantined — not backed by the live marine intelligence API.
 * Direct URL access redirects to the dashboard rather than rendering demo/mock pages.
 */
const QUARANTINED_PREFIXES = [
  "/ocean-map",
  "/ocean-stations",
  "/species-database",
  "/data-explorer",
  "/station",
  "/ai-lab",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isQuarantined = QUARANTINED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix + "/"),
  );

  if (isQuarantined) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.searchParams.set("notice", "route_quarantined");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/ocean-map/:path*",
    "/ocean-stations/:path*",
    "/species-database/:path*",
    "/data-explorer/:path*",
    "/station/:path*",
    "/ai-lab/:path*",
  ],
};
