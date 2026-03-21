import { cookies } from "next/headers";

export const STATION_ADMIN_SESSION_COOKIE = "station_admin_session";

function resolveCookieName(): string {
  return process.env.STATION_ADMIN_SESSION_COOKIE_NAME?.trim() || STATION_ADMIN_SESSION_COOKIE;
}

export function getStationAdminSessionCookie(): string | null {
  const cookieStore = cookies();
  const cookieName = resolveCookieName();
  const value = cookieStore.get(cookieName)?.value?.trim() ?? "";
  return value || null;
}

/**
 * Issue station admin session cookies with secure attributes.
 * httpOnly prevents JS access to the session ID.
 * secure is enforced in production.
 * sameSite=lax prevents CSRF via cross-origin navigations while allowing
 * top-level GET navigations (e.g. redirect after login).
 */
export function setStationAdminSessionCookie(sessionId: string, expiresAt: string): void {
  const cookieStore = cookies();
  const cookieName = resolveCookieName();
  const expires = new Date(expiresAt);
  const isProduction = process.env.NODE_ENV === "production";

  cookieStore.set(cookieName, sessionId, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    path: "/",
    expires,
  });
}

/**
 * Clear the station admin session cookie on logout.
 */
export function clearStationAdminSessionCookie(): void {
  const cookieStore = cookies();
  const cookieName = resolveCookieName();
  cookieStore.delete(cookieName);
}
