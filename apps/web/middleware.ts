import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Routes that are quarantined — not backed by the live marine intelligence API.
 * Direct URL access redirects to the dashboard rather than rendering demo/mock pages.
 */
const OPERATOR_PREFIX = "/operator";

function isOperatorAccessAllowed(request: NextRequest): boolean {
  const requiredToken = process.env.OPERATOR_ACCESS_TOKEN?.trim();
  if (!requiredToken) {
    return false;
  }

  const queryToken = request.nextUrl.searchParams.get("token")?.trim();
  if (queryToken && queryToken === requiredToken) {
    return true;
  }

  const headerToken = request.headers.get("x-operator-token")?.trim();
  return Boolean(headerToken && headerToken === requiredToken);
}

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

  if (pathname === OPERATOR_PREFIX || pathname.startsWith(`${OPERATOR_PREFIX}/`)) {
    if (!isOperatorAccessAllowed(request)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("notice", "operator_access_required");
      return NextResponse.redirect(url);
    }
  }

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
    "/operator",
    "/operator/:path*",
    "/ocean-map/:path*",
    "/ocean-stations/:path*",
    "/species-database/:path*",
    "/data-explorer/:path*",
    "/station/:path*",
    "/ai-lab/:path*",
  ],
};
