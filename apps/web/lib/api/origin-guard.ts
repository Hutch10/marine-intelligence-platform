import { NextResponse } from "next/server";

/**
 * Validate that the request Origin header matches the configured app origin.
 *
 * Set NEXT_PUBLIC_APP_URL (e.g. "https://marine.example.com") to enable
 * enforcement. If the env var is absent, the check is skipped so local
 * development and tests continue to work without extra configuration.
 *
 * Returns a 403 NextResponse if the origin is disallowed, or null if the
 * request may proceed.
 */
export function checkStationAdminOrigin(request: Request): NextResponse | null {
  const allowedOrigin = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");

  // No env var configured — skip enforcement (dev / test environments)
  if (!allowedOrigin) {
    return null;
  }

  const origin = request.headers.get("origin");

  // Requests without an Origin header (e.g. same-origin in some browsers,
  // server-to-server) are allowed when the allowed origin is configured;
  // they are not the CSRF threat the Origin check defends against.
  if (!origin) {
    return null;
  }

  if (origin !== allowedOrigin) {
    return NextResponse.json({ message: "Origin not allowed" }, { status: 403 });
  }

  return null;
}
