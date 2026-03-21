import { request } from "node:https";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_USER_AGENT = "MarineBioPlatform/1.0 (+https://marine.local)";

export interface NdbcFetchRequest {
  stationId: string;
  feedUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface NdbcFetchResult {
  stationId: string;
  feedUrl: string;
  body: string;
  fetchedAt: number;
}

export function buildNdbcRealtimeFeedUrl(stationId: string): string {
  return `https://www.ndbc.noaa.gov/data/realtime2/${encodeURIComponent(stationId)}.txt`;
}

export async function fetchNdbcRealtimeText(
  input: NdbcFetchRequest,
): Promise<NdbcFetchResult> {
  const feedUrl = input.feedUrl ?? buildNdbcRealtimeFeedUrl(input.stationId);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = input.userAgent ?? DEFAULT_USER_AGENT;

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
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on("end", () => {
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`NDBC feed request failed (${statusCode}) for ${input.stationId}`));
            return;
          }

          resolve({
            stationId: input.stationId,
            feedUrl,
            body: Buffer.concat(chunks).toString("utf8"),
            fetchedAt: Date.now(),
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`NDBC feed request timed out for ${input.stationId}`));
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}
