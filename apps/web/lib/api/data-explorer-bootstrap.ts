import { headers } from "next/headers";
import { apiClient } from "@/lib/api/client";
import type {
  DataExplorerFetchMeta,
  DataExplorerWorkspaceData,
  DataExplorerWorkspaceFetchResult,
} from "@/lib/api/types";

const DATA_EXPLORER_SOURCE_HEADER = "x-marine-data-source";
const DATA_EXPLORER_FALLBACK_HEADER = "x-marine-fallback-reason";

function buildFetchMeta(
  startedAtMs: number,
  options: Omit<DataExplorerFetchMeta, "section" | "startedAt" | "finishedAt" | "durationMs">,
): DataExplorerFetchMeta {
  const finishedAtMs = Date.now();

  return {
    section: "workspace",
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    ...options,
  };
}

function trimHeaderValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const firstValue = value.split(",")[0]?.trim() ?? "";
  return firstValue || null;
}

function toDataExplorerFetchSource(value: string | null): DataExplorerFetchMeta["source"] {
  return value === "db" || value === "mock" ? value : undefined;
}

function toDataExplorerFallbackReason(
  value: string | null,
): DataExplorerFetchMeta["fallbackReason"] {
  return value === "db_path_missing" || value === "db_open_failed" || value === "db_query_failed"
    ? value
    : undefined;
}

function createDataExplorerHeaderMeta(response: Response): {
  source?: DataExplorerFetchMeta["source"];
  fallbackReason?: DataExplorerFetchMeta["fallbackReason"];
} {
  return {
    source: toDataExplorerFetchSource(response.headers.get(DATA_EXPLORER_SOURCE_HEADER)),
    fallbackReason: toDataExplorerFallbackReason(response.headers.get(DATA_EXPLORER_FALLBACK_HEADER)),
  };
}

function isWorkspacePayload(value: unknown): value is DataExplorerWorkspaceData {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return Array.isArray(candidate.actions)
    && Array.isArray(candidate.datasets)
    && Array.isArray(candidate.previewSeries)
    && Array.isArray(candidate.metadata)
    && Array.isArray(candidate.summarySignals);
}

export function resolveDataExplorerBootstrapOrigin(requestHeaders: Headers): string | null {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");

  if (configuredOrigin) {
    return configuredOrigin;
  }

  const host = trimHeaderValue(requestHeaders.get("x-forwarded-host"))
    ?? trimHeaderValue(requestHeaders.get("host"));

  if (!host) {
    return null;
  }

  const forwardedProto = trimHeaderValue(requestHeaders.get("x-forwarded-proto"));
  const protocol = forwardedProto === "http" || forwardedProto === "https"
    ? forwardedProto
    : (host.includes("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");

  return `${protocol}://${host}`;
}

export async function getDataExplorerBootstrapWorkspace(): Promise<DataExplorerWorkspaceFetchResult> {
  const startedAtMs = Date.now();
  const requestHeaders = headers();
  const origin = resolveDataExplorerBootstrapOrigin(requestHeaders);

  if (origin) {
    try {
      const response = await fetch(`${origin}/api/data-explorer`, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "x-marine-bootstrap-request": "1",
        },
        cache: "no-store",
      });
      const payload = await response.json() as unknown;

      if (response.ok && isWorkspacePayload(payload)) {
        const headerMeta = createDataExplorerHeaderMeta(response);

        return {
          data: payload,
          meta: buildFetchMeta(startedAtMs, {
            state: "success",
            delivery: "bootstrap_api",
            source: headerMeta.source,
            fallbackReason: headerMeta.fallbackReason,
          }),
        } satisfies DataExplorerWorkspaceFetchResult;
      }
    } catch {
      // Fall through to the in-process path when the bootstrap API boundary is unavailable.
    }
  }

  return apiClient.dataExplorer.getWorkspace();
}
