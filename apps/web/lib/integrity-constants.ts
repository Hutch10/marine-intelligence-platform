/**
 * Local re-declaration of integrity enum values as plain const objects.
 * These mirror the types in @marine/shared but live in the web app bundle
 * so webpack cannot tree-shake them away during server-side static generation.
 */
export const SystemIntegrityStatus = {
  NORMAL: "NORMAL" as const,
  DEGRADED: "DEGRADED" as const,
  TRUST_BLOCKED: "TRUST_BLOCKED" as const,
};

export const IntegrityStatus = {
  VERIFIED: "VERIFIED" as const,
  UNVERIFIED: "UNVERIFIED" as const,
  REJECTED: "REJECTED" as const,
};
