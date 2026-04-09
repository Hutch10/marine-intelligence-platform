import { request } from "node:https";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_USER_AGENT = "MarineBioPlatform/1.0 (+https://marine.local)";
const DEFAULT_RETRY_COUNT = 2;
const DEFAULT_RETRY_DELAY_MS = 750;

export interface NdbcFetchRequest {
  stationId: string;
  feedUrl?: string;
  fallbackFeedUrls?: string[];
  timeoutMs?: number;
  userAgent?: string;
  retryCount?: number;
  retryDelayMs?: number;
}

export interface NdbcFetchResult {
  stationId: string;
  feedUrl: string;
  body: string;
  fetchedAt: number;
  statusCode: number;
  contentType: string | null;
}

export interface NdbcFetchAttempt {
  feedUrl: string;
  statusCode: number | null;
  error: string | null;
}

export function buildNdbcRealtimeFeedUrl(stationId: string): string {
  return `https://www.ndbc.noaa.gov/data/realtime2/${encodeURIComponent(stationId)}.txt`;
}

export function buildNdbcFallbackFeedUrls(stationId: string, env = process.env): string[] {
  const configuredBases = String(env.NDBC_FALLBACK_BASE_URLS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  return configuredBases.map((baseUrl) =>
    `${baseUrl.replace(/\/+$/, "")}/${encodeURIComponent(stationId)}.txt`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTransientStatusCode(statusCode: number): boolean {
  return statusCode === 408 || statusCode === 425 || statusCode === 429 || statusCode >= 500;
}

async function fetchSingleNdbcRealtimeText(
  stationId: string,
  feedUrl: string,
  timeoutMs: number,
  userAgent: string,
): Promise<NdbcFetchResult> {
  return new Promise<NdbcFetchResult>((resolve, reject) => {
    const url = new URL(feedUrl);

    const req = request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": userAgent,
          accept: "text/plain",
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 500;
        const header = res.headers["content-type"] as string | string[] | undefined;
        const contentType = typeof header === "string"
          ? header
          : Array.isArray(header)
            ? header.join(", ")
            : null;
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on("end", () => {
          if (statusCode < 200 || statusCode >= 300) {
            const error = new Error(
              `NDBC feed request failed (${statusCode}) for ${stationId}; url=${feedUrl}; content-type=${contentType ?? "unknown"}`,
            ) as Error & { statusCode?: number };
            error.statusCode = statusCode;
            reject(error);
            return;
          }

          resolve({
            stationId,
            feedUrl,
            body: Buffer.concat(chunks).toString("utf8"),
            fetchedAt: Date.now(),
            statusCode,
            contentType,
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      const error = new Error(`NDBC feed request timed out for ${stationId}; url=${feedUrl}`) as Error & { statusCode?: number };
      error.statusCode = 408;
      req.destroy(error);
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}

export async function fetchNdbcRealtimeText(
  input: NdbcFetchRequest,
): Promise<NdbcFetchResult> {
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = input.userAgent ?? DEFAULT_USER_AGENT;
  const retryCount = Math.max(0, Math.floor(input.retryCount ?? DEFAULT_RETRY_COUNT));
  const retryDelayMs = Math.max(0, Math.floor(input.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS));
  const feedUrls = [
    input.feedUrl ?? buildNdbcRealtimeFeedUrl(input.stationId),
    ...(input.fallbackFeedUrls ?? buildNdbcFallbackFeedUrls(input.stationId)),
  ].filter((value, index, array) => array.indexOf(value) === index);
  const attempts: NdbcFetchAttempt[] = [];
  let lastError: Error | null = null;

  for (const feedUrl of feedUrls) {
    for (let attempt = 0; attempt <= retryCount; attempt += 1) {
      try {
        return await fetchSingleNdbcRealtimeText(
          input.stationId,
          feedUrl,
          timeoutMs,
          userAgent,
        );
      } catch (error) {
        const normalized = error instanceof Error ? error : new Error(String(error));
        const statusCode = typeof (normalized as Error & { statusCode?: number }).statusCode === "number"
          ? (normalized as Error & { statusCode?: number }).statusCode ?? null
          : null;
        attempts.push({
          feedUrl,
          statusCode,
          error: normalized.message,
        });
        lastError = normalized;

        const shouldRetry = attempt < retryCount && (statusCode === null || isTransientStatusCode(statusCode));
        if (shouldRetry) {
          await sleep(retryDelayMs * (attempt + 1));
          continue;
        }

        break;
      }
    }
  }

  const attemptSummary = attempts
    .map((attempt) => `${attempt.feedUrl} status=${attempt.statusCode ?? "error"} error=${attempt.error ?? "unknown"}`)
    .join("; ");
  throw new Error(
    `NDBC feed request failed for ${input.stationId} after ${attempts.length} attempt${attempts.length === 1 ? "" : "s"}: ${attemptSummary || lastError?.message || "unknown error"}`,
  );
}
