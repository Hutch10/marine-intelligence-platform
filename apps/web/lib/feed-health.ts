/**
 * Feed health — derives current ingestion status from persisted ingestion reports.
 *
 * Status thresholds (as specified):
 *  LIVE    — last ingest < 8 hours
 *  STALE   — 8–24 hours
 *  FAILED  — > 24 hours OR ingestion run status was "failed"
 *  UNKNOWN — ingestion metadata unavailable (DB missing, never ran, query failed)
 *
 * getFeedHealth() is synchronous and safe to call from any Server Component.
 * It returns UNKNOWN rather than assuming freshness when data is absent.
 */

import { buildFeedHealthRouteResponse } from "../../api/src/routes/feed-health";

export type FeedSourceStatus = "live" | "stale" | "failed" | "unknown";
export type FeedSourceKey = "ndbc" | "crw" | "ioos" | "erddap";

export interface FeedSourceHealth {
  source: FeedSourceKey;
  label: string;
  status: FeedSourceStatus;
  lastIngestedAt: string | null;
  ageLabel: string | null;
}

export interface FeedHealthStatus {
  ndbc: FeedSourceHealth;
  crw: FeedSourceHealth;
  ioos: FeedSourceHealth;
  erddap: FeedSourceHealth;
  overallStatus: FeedSourceStatus;
  /** False when the DB is unreachable or has never been written to. */
  dbAvailable: boolean;
}

export interface FeedStationDiagnostics {
  source: FeedSourceKey;
  sourceLabel: string;
  stationId: string;
  failureCount: number;
  parseFailureCount: number;
  validationFailureCount: number;
  lastFailureAt: string | null;
  reasonCategory: "parse_failure" | "validation_failure" | "mixed" | "unknown";
}

// ─── Thresholds ───────────────────────────────────────────────────────────────

const LIVE_THRESHOLD_MS = 8 * 60 * 60 * 1000;    // < 8 h  → live
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000;  // < 24 h → stale; ≥ 24 h → failed

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ageStatus(completedAt: string | null, runFailed: boolean): FeedSourceStatus {
  if (runFailed) {
    return "failed";
  }

  if (!completedAt) {
    return "failed";
  }

  const completedMs = Date.parse(completedAt);

  if (!Number.isFinite(completedMs)) {
    return "failed";
  }

  const ageMs = Date.now() - completedMs;

  if (ageMs < LIVE_THRESHOLD_MS) {
    return "live";
  }

  if (ageMs < STALE_THRESHOLD_MS) {
    return "stale";
  }

  return "failed";
}

function formatAgeLabel(completedAt: string | null): string | null {
  if (!completedAt) {
    return null;
  }

  const completedMs = Date.parse(completedAt);

  if (!Number.isFinite(completedMs)) {
    return null;
  }

  const ageMs = Math.max(0, Date.now() - completedMs);
  const minutes = Math.floor(ageMs / (60 * 1000));
  const hours = Math.floor(ageMs / (60 * 60 * 1000));
  const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));

  if (minutes < 1) {
    return "just now";
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${days}d ago`;
}

function worstStatus(a: FeedSourceStatus, b: FeedSourceStatus): FeedSourceStatus {
  const rank: Record<FeedSourceStatus, number> = { live: 0, stale: 1, failed: 2, unknown: 3 };
  return rank[a] >= rank[b] ? a : b;
}

function worstStatuses(statuses: FeedSourceStatus[]): FeedSourceStatus {
  return statuses.reduce((worst, status) => worstStatus(worst, status), "live");
}

function buildUnknown(source: FeedSourceKey): FeedSourceHealth {
  return {
    source,
    label:
      source === "ndbc"
        ? "NDBC"
        : source === "crw"
          ? "CRW"
          : source === "ioos"
            ? "IOOS"
            : "ERDDAP",
    status: "unknown",
    lastIngestedAt: null,
    ageLabel: null,
  };
}

function resolveSourceHealth(
  latestBySource: Array<{
    source: string;
    completed_at: string | null;
    status: string;
    error: string | null;
  }>,
  aliases: string[],
  source: FeedSourceKey,
): FeedSourceHealth {
  const raw = latestBySource.find((item) => aliases.includes(item.source)) ?? null;

  if (!raw) {
    return buildUnknown(source);
  }

  return {
    source,
    label: buildUnknown(source).label,
    status: ageStatus(
      raw.completed_at,
      raw.status === "failed" || raw.error !== null,
    ),
    lastIngestedAt: raw.completed_at,
    ageLabel: formatAgeLabel(raw.completed_at),
  };
}

function classifyParseReason(reason: string): boolean {
  const normalized = reason.trim().toLowerCase();

  return normalized.includes("parse")
    || normalized.includes("schema")
    || normalized.includes("transient")
    || normalized.includes("fetch");
}

function toSourceKey(source: string): FeedSourceKey | null {
  if (source === "noaa_ndbc" || source === "ndbc") {
    return "ndbc";
  }

  if (source === "crw") {
    return "crw";
  }

  if (source === "ioos_regional") {
    return "ioos";
  }

  if (source === "ioos_erddap") {
    return "erddap";
  }

  return null;
}

function sourceLabelFor(source: FeedSourceKey): string {
  return buildUnknown(source).label;
}

function toFailureCategory(parseFailureCount: number, validationFailureCount: number): FeedStationDiagnostics["reasonCategory"] {
  if (parseFailureCount > 0 && validationFailureCount > 0) {
    return "mixed";
  }

  if (parseFailureCount > 0) {
    return "parse_failure";
  }

  if (validationFailureCount > 0) {
    return "validation_failure";
  }

  return "unknown";
}

export function getFeedHealthDiagnostics(): FeedStationDiagnostics[] {
  const response = buildFeedHealthRouteResponse();

  if (response.json.source !== "db") {
    return [];
  }

  const diagnostics: FeedStationDiagnostics[] = [];

  for (const sourceStatus of response.json.latest_status_by_source) {
    const source = toSourceKey(sourceStatus.source);

    if (!source) {
      continue;
    }

    for (const stationDiagnostic of sourceStatus.station_diagnostics) {
      const rejectionEntries = Object.entries(stationDiagnostic.rejection_breakdown ?? {});
      const parseFailureCount = rejectionEntries.reduce((sum, [reason, count]) =>
        classifyParseReason(reason) ? sum + Number(count) : sum,
      0);
      const failureCount = rejectionEntries.reduce((sum, [, count]) => sum + Number(count), 0);
      const normalizedFailureCount = Number.isFinite(failureCount) ? Math.max(0, failureCount) : 0;
      const normalizedParseFailureCount = Number.isFinite(parseFailureCount) ? Math.max(0, parseFailureCount) : 0;
      const validationFailureCount = Math.max(0, normalizedFailureCount - normalizedParseFailureCount);

      if (normalizedFailureCount === 0) {
        continue;
      }

      diagnostics.push({
        source,
        sourceLabel: sourceLabelFor(source),
        stationId: stationDiagnostic.station_id,
        failureCount: normalizedFailureCount,
        parseFailureCount: normalizedParseFailureCount,
        validationFailureCount,
        lastFailureAt: sourceStatus.completed_at,
        reasonCategory: toFailureCategory(normalizedParseFailureCount, validationFailureCount),
      });
    }
  }

  return diagnostics;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getFeedHealth(): FeedHealthStatus {
  const response = buildFeedHealthRouteResponse();

  if (response.json.source !== "db") {
    return {
      ndbc: buildUnknown("ndbc"),
      crw: buildUnknown("crw"),
      ioos: buildUnknown("ioos"),
      erddap: buildUnknown("erddap"),
      overallStatus: "unknown",
      dbAvailable: false,
    };
  }

  const latestBySource = response.json.latest_status_by_source;
  const ndbc = resolveSourceHealth(latestBySource, ["noaa_ndbc", "ndbc"], "ndbc");
  const crw = resolveSourceHealth(latestBySource, ["crw"], "crw");
  const ioos = resolveSourceHealth(latestBySource, ["ioos_regional"], "ioos");
  const erddap = resolveSourceHealth(latestBySource, ["ioos_erddap"], "erddap");

  return {
    ndbc,
    crw,
    ioos,
    erddap,
    overallStatus: worstStatuses([ndbc.status, crw.status, ioos.status, erddap.status]),
    dbAvailable: true,
  };
}
