import { buildFeedHealthRouteResponse } from "../../../api/src/routes/feed-health";
import type { LiveIngestionHealthSnapshotReadResult } from "../../../api/src/repositories/live-ingestion-reports";

function readFeedHealthSnapshot(): LiveIngestionHealthSnapshotReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../../../api/src/repositories/live-ingestion-reports") as {
      getLiveIngestionHealthSnapshot: (options: {
        limit: number;
        staleAfterMs: number;
      }) => LiveIngestionHealthSnapshotReadResult;
    };

    return repository.getLiveIngestionHealthSnapshot({
      limit: 40,
      staleAfterMs: 6 * 60 * 60 * 1000,
    });
  } catch {
    return {
      source: "unavailable",
      fallbackReason: "db_query_failed",
    };
  }
}
import { buildOperatorStatusRouteResponse } from "../../../api/src/routes/operator-status";
import type { OperatorStatusResponse } from "../../../api/src/routes/operator-status";

export type { OperatorStatusResponse };

function apiBase(): string {
  const configured = process.env.MARINE_API_BASE_URL?.trim().replace(/\/$/, "");
  if (!configured) {
    if (process.env.NODE_ENV === "production" || process.env.VERCEL) {
      throw new Error("MARINE_API_BASE_URL is not configured");
    }
    return "http://localhost:4000";
  }
  return configured;
}

function operatorToken(): string | null {
  const token = process.env.OPERATOR_ACCESS_TOKEN?.trim();
  return token || null;
}

function buildUnavailableOperatorStatus(): OperatorStatusResponse {
  const feedHealth = buildFeedHealthRouteResponse(readFeedHealthSnapshot());
  const generatedAt = new Date().toISOString();

  return {
    generated_at: generatedAt,
    access: "operator",
    feed_health: feedHealth.json,
    scheduler: {
      ndbcIntervalMs: 20 * 60 * 1000,
      crwIntervalMs: 2 * 60 * 60 * 1000,
      ioosIntervalMs: 45 * 60 * 1000,
      erddapIntervalMs: 45 * 60 * 1000,
      ioosEnabled: false,
      erddapEnabled: false,
      sources: [],
    },
    circuit_breaker: {
      generatedAt,
      sources: [],
      openCount: 0,
      halfOpenCount: 0,
    },
    freshness_governance: {
      generatedAt,
      staleAfterMs: feedHealth.json.stale_after_ms,
      sources: [],
      withheldCount: 0,
    },
    recent_failures: [],
    recent_recoveries: [],
    harness: {
      latestIngestionRuns: [],
      verificationStatus: {
        latestOutcome: null,
        latestEvaluatedAt: null,
        recentCount: 0,
      },
      replayCompleteness: [],
      replayValidation: {
        generatedAt: generatedAt,
        sampleCount: 0,
        passedCount: 0,
        failedCount: 0,
        overallPass: false,
        samples: [],
      },
      publicationDecisions: [],
      humanReviewActions: [],
      reviewQueue: { pendingCount: 0, items: [] },
      alerts: {
        activeCount: 0,
        suppressedCount: 0,
        active: [],
        suppressed: [],
      },
    },
  };
}

export async function getOperatorStatus(): Promise<OperatorStatusResponse> {
  const token = operatorToken();

  try {
    const url = new URL(`${apiBase()}/internal/operator/status`);
    if (token) {
      url.searchParams.set("token", token);
    }

    const response = await fetch(url.toString(), {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      return await buildOperatorStatusRouteResponse().then((result) => result.json);
    }

    return await response.json() as OperatorStatusResponse;
  } catch {
    try {
      return await buildOperatorStatusRouteResponse().then((result) => result.json);
    } catch {
      return buildUnavailableOperatorStatus();
    }
  }
}
