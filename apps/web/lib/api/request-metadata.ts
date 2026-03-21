import type { StationAdminRequestMetadata } from "@/lib/api/types";

function firstForwardedIp(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const first = value.split(",")[0]?.trim() ?? "";
  return first || null;
}

export function buildStationAdminRequestMetadata(
  request: Request,
  source: string,
): StationAdminRequestMetadata {
  const forwardedFor = firstForwardedIp(request.headers.get("x-forwarded-for"));
  const realIp = request.headers.get("x-real-ip")?.trim() || null;
  const userAgent = request.headers.get("user-agent")?.trim() || null;

  return {
    ip: forwardedFor ?? realIp,
    userAgent,
    source,
  };
}
