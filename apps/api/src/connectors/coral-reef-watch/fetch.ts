import { request } from "node:https";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_USER_AGENT = "MarineBioPlatform/1.0 (+https://marine.local)";
const DEFAULT_CRW_SOURCE_URL = "https://coralreefwatch.noaa.gov/data/reef_stress_watch.json";

export interface CrwFetchRequest {
  sourceUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface CrwFetchResult {
  sourceUrl: string;
  body: string;
  fetchedAt: number;
}

export function resolveDefaultCrwSourceUrl(env = process.env): string {
  return env.CRW_SOURCE_URL ?? DEFAULT_CRW_SOURCE_URL;
}

export async function fetchCoralReefWatchData(
  input: CrwFetchRequest = {},
): Promise<CrwFetchResult> {
  const sourceUrl = input.sourceUrl ?? resolveDefaultCrwSourceUrl();
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = input.userAgent ?? DEFAULT_USER_AGENT;

  return new Promise<CrwFetchResult>((resolve, reject) => {
    const url = new URL(sourceUrl);

    const req = request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": userAgent,
          accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
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
            reject(new Error(`CRW feed request failed (${statusCode})`));
            return;
          }

          resolve({
            sourceUrl,
            body: Buffer.concat(chunks).toString("utf8"),
            fetchedAt: Date.now(),
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("CRW feed request timed out"));
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}
