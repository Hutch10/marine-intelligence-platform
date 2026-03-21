import { request } from "node:https";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_USER_AGENT = "MarineBioPlatform/1.0 (+https://marine.local)";
const DEFAULT_IOOS_SOURCE_URL = "https://data.ioos.us/api/v1/observations";

export interface IoosFetchRequest {
  sourceUrl?: string;
  stationId?: string;
  bbox?: [number, number, number, number];
  startTime?: string;
  endTime?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface IoosFetchResult {
  sourceUrl: string;
  body: string;
  fetchedAt: number;
}

export function resolveDefaultIoosSourceUrl(env = process.env): string {
  return env.IOOS_SOURCE_URL ?? DEFAULT_IOOS_SOURCE_URL;
}

export function buildIoosSourceUrl(input: Omit<IoosFetchRequest, "timeoutMs" | "userAgent"> = {}): string {
  const url = new URL(input.sourceUrl ?? resolveDefaultIoosSourceUrl());

  if (input.stationId && !url.searchParams.has("station_id")) {
    url.searchParams.set("station_id", input.stationId);
  }

  if (input.bbox && input.bbox.length === 4 && !url.searchParams.has("bbox")) {
    url.searchParams.set("bbox", input.bbox.join(","));
  }

  if (input.startTime && !url.searchParams.has("start")) {
    url.searchParams.set("start", input.startTime);
  }

  if (input.endTime && !url.searchParams.has("end")) {
    url.searchParams.set("end", input.endTime);
  }

  return url.toString();
}

export async function fetchIoosData(input: IoosFetchRequest = {}): Promise<IoosFetchResult> {
  const sourceUrl = buildIoosSourceUrl(input);
  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = input.userAgent ?? DEFAULT_USER_AGENT;

  return new Promise<IoosFetchResult>((resolve, reject) => {
    const req = request(
      new URL(sourceUrl),
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
            reject(new Error(`IOOS feed request failed (${statusCode})`));
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
      req.destroy(new Error("IOOS feed request timed out"));
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}
