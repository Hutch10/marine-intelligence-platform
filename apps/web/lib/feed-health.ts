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

export interface FeedSourceHealth {
  source: "ndbc" | "crw";
  label: string;
  status: FeedSourceStatus;
  lastIngestedAt: string | null;
  ageLabel: string | null;
}

export interface FeedHealthStatus {
  ndbc: FeedSourceHealth;
  crw: FeedSourceHealth;
  overallStatus: FeedSourceStatus;
  /** False when the DB is unreachable or has never been written to. */
  dbAvailable: boolean;
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

function buildUnknown(source: "ndbc" | "crw"): FeedSourceHealth {
  return {
    source,
    label: source === "ndbc" ? "NDBC" : "CRW",
    status: "unknown",
    lastIngestedAt: null,
    ageLabel: null,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function getFeedHealth(): FeedHealthStatus {
  const response = buildFeedHealthRouteResponse();

  if (response.json.source !== "db") {
    return {
      ndbc: buildUnknown("ndbc"),
      crw: buildUnknown("crw"),
      overallStatus: "unknown",
      dbAvailable: false,
    };
  }

  const latestBySource = response.json.latest_status_by_source;
  const ndbcRaw = latestBySource.find((item) => item.source === "ndbc") ?? null;
  const crwRaw = latestBySource.find((item) => item.source === "crw") ?? null;

  const ndbc: FeedSourceHealth = ndbcRaw
    ? {
        source: "ndbc",
        label: "NDBC",
        status: ageStatus(
          ndbcRaw.completed_at,
          ndbcRaw.status === "failed" || ndbcRaw.error !== null,
        ),
        lastIngestedAt: ndbcRaw.completed_at,
        ageLabel: formatAgeLabel(ndbcRaw.completed_at),
      }
    : buildUnknown("ndbc");

  const crw: FeedSourceHealth = crwRaw
    ? {
        source: "crw",
        label: "CRW",
        status: ageStatus(
          crwRaw.completed_at,
          crwRaw.status === "failed" || crwRaw.error !== null,
        ),
        lastIngestedAt: crwRaw.completed_at,
        ageLabel: formatAgeLabel(crwRaw.completed_at),
      }
    : buildUnknown("crw");

  return {
    ndbc,
    crw,
    overallStatus: worstStatus(ndbc.status, crw.status),
    dbAvailable: true,
  };
}
