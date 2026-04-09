/**
 * Tests for the quarantine enforcement middleware.
 *
 * Verifies that all QUARANTINED_PREFIXES redirect to /?notice=route_quarantined
 * and that valid paths pass through without redirection.
 */

import { vi, test, expect, beforeEach } from "vitest";

// ─── next/server stubs ────────────────────────────────────────────────────────

const redirectSpy = vi.fn();
const nextSpy = vi.fn();

vi.mock("next/server", () => {
  class FakeNextResponse {
    static redirect(url: URL) {
      redirectSpy(url);
      return { type: "redirect", url };
    }
    static next() {
      nextSpy();
      return { type: "next" };
    }
  }

  class FakeNextRequest {
    nextUrl: URL;
    constructor(url: string) {
      this.nextUrl = new URL(url);
    }
  }

  return {
    NextResponse: FakeNextResponse,
    NextRequest: FakeNextRequest,
  };
});

// Import middleware AFTER mocks are in place.
import { middleware } from "@/middleware";

// ─── helpers ──────────────────────────────────────────────────────────────────

beforeEach(() => {
  redirectSpy.mockClear();
  nextSpy.mockClear();
});

function req(path: string) {
  // Build a minimal NextRequest-like object matching what the middleware reads.
  // URL must have .clone() since middleware calls request.nextUrl.clone().
  const url = new URL(`http://localhost${path}`);
  const cloneableUrl = Object.assign(url, {
    clone: () => Object.assign(new URL(url.toString()), { clone: () => new URL(url.toString()) }),
  });
  return { nextUrl: cloneableUrl } as Parameters<typeof middleware>[0];
}

// ─── Quarantined routes ───────────────────────────────────────────────────────

const QUARANTINED: Array<[string, string]> = [
  ["exact match /ocean-map", "/ocean-map"],
  ["sub-path /ocean-map/atlantic", "/ocean-map/atlantic"],
  ["exact match /ocean-stations", "/ocean-stations"],
  ["sub-path /ocean-stations/41009/admin", "/ocean-stations/41009/admin"],
  ["exact match /species-database", "/species-database"],
  ["sub-path /species-database/coral", "/species-database/coral"],
  ["exact match /data-explorer", "/data-explorer"],
  ["sub-path /data-explorer/sst", "/data-explorer/sst"],
  ["sub-path /station/buoy-42", "/station/buoy-42"],
  ["exact match /ai-lab", "/ai-lab"],
  ["sub-path /ai-lab/chat", "/ai-lab/chat"],
];

for (const [label, path] of QUARANTINED) {
  test(`redirects to /?notice=route_quarantined — ${label}`, () => {
    const result = middleware(req(path)) as { type: string; url: URL };

    expect(result.type).toBe("redirect");
    expect(result.url.pathname).toBe("/");
    expect(result.url.searchParams.get("notice")).toBe("route_quarantined");
    expect(nextSpy).not.toHaveBeenCalled();
  });
}

// ─── Valid routes ─────────────────────────────────────────────────────────────

const VALID: Array<[string, string]> = [
  ["dashboard root", "/"],
  ["station risk page", "/v1/risk/41009"],
  ["regional risk page", "/v1/regions/southeast-florida/risk"],
  ["regional trend page", "/v1/regions/southeast-florida/risk/trend"],
  ["investigations page", "/investigations"],
  ["admin thresholds page", "/admin/stations/41009/thresholds"],
];

for (const [label, path] of VALID) {
  test(`passes through without redirect — ${label}`, () => {
    const result = middleware(req(path)) as { type: string };

    expect(result.type).toBe("next");
    expect(redirectSpy).not.toHaveBeenCalled();
  });
}
