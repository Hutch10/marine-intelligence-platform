import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_ERDDAP_BASE_URL = "https://erddap.ioos.us/erddap";
const DEFAULT_DATASET_ID = "gov_noaa_ndbc_sos";
const DEFAULT_USER_AGENT = "MarineBioPlatform/1.0 (+https://marine.local)";
const DEFAULT_LOOKBACK_HOURS = 24;

// Variables fetched from NDBC SOS via ERDDAP tabledap.
const DEFAULT_VARIABLES = [
  "time",
  "station_id",
  "sea_water_temperature",
  "sea_surface_wave_significant_height",
  "wind_speed",
  "air_pressure",
];

export interface ErddapFetchRequest {
  baseUrl?: string;
  datasetId?: string;
  variables?: string[];
  startTime?: string;
  endTime?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface ErddapFetchResult {
  sourceUrl: string;
  body: string;
  fetchedAt: number;
}

export function resolveDefaultErddapBaseUrl(env = process.env): string {
  return (env.ERDDAP_BASE_URL ?? DEFAULT_ERDDAP_BASE_URL).replace(/\/$/, "");
}

export function resolveDefaultErddapDatasetId(env = process.env): string {
  return env.ERDDAP_DATASET_ID ?? DEFAULT_DATASET_ID;
}

export function resolveErddapLookbackHours(env = process.env): number {
  const raw = env.ERDDAP_LOOKBACK_HOURS;
  if (!raw) {
    return DEFAULT_LOOKBACK_HOURS;
  }

  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_LOOKBACK_HOURS;
}

/**
 * Builds an ERDDAP tabledap CSV request URL.
 *
 * ERDDAP uses an unconventional query format:
 *   /tabledap/{datasetId}.csv?var1,var2&constraint1&constraint2
 *
 * Constraints use operators (>=, <=) that must remain unencoded for ERDDAP
 * to parse them correctly, so we build the URL as a raw string and avoid
 * passing it through the Web URL constructor.
 */
export function buildErddapUrl(input: Omit<ErddapFetchRequest, "timeoutMs" | "userAgent"> = {}): string {
  const base = (input.baseUrl ?? resolveDefaultErddapBaseUrl()).replace(/\/$/, "");
  const datasetId = input.datasetId ?? resolveDefaultErddapDatasetId();
  const variables = (input.variables ?? DEFAULT_VARIABLES).join(",");

  const constraints: string[] = [];

  if (input.startTime) {
    constraints.push(`time>=${input.startTime}`);
  }

  if (input.endTime) {
    constraints.push(`time<=${input.endTime}`);
  }

  const query = constraints.length > 0
    ? `${variables}&${constraints.join("&")}`
    : variables;

  return `${base}/tabledap/${datasetId}.csv?${query}`;
}

/**
 * Computes a default time window ending now and looking back `lookbackHours`.
 * Returns ISO-8601 strings suitable for ERDDAP time constraints.
 */
export function buildDefaultTimeWindow(
  lookbackHours: number,
  nowMs = Date.now(),
): { startTime: string; endTime: string } {
  const endMs = nowMs;
  const startMs = endMs - lookbackHours * 60 * 60 * 1000;

  return {
    startTime: new Date(startMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
    endTime: new Date(endMs).toISOString().replace(/\.\d{3}Z$/, "Z"),
  };
}

export async function fetchErddapData(input: ErddapFetchRequest = {}): Promise<ErddapFetchResult> {
  const timeWindow = buildDefaultTimeWindow(resolveErddapLookbackHours());
  const sourceUrl = buildErddapUrl({
    baseUrl: input.baseUrl,
    datasetId: input.datasetId,
    variables: input.variables,
    startTime: input.startTime ?? timeWindow.startTime,
    endTime: input.endTime ?? timeWindow.endTime,
  });

  const timeoutMs = input.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const userAgent = input.userAgent ?? DEFAULT_USER_AGENT;

  return new Promise<ErddapFetchResult>((resolve, reject) => {
    const parsedUrl = new URL(sourceUrl);
    const requestFn = parsedUrl.protocol === "https:" ? httpsRequest : httpRequest;

    const req = requestFn(
      sourceUrl,
      {
        method: "GET",
        headers: {
          "user-agent": userAgent,
          accept: "text/csv,text/plain;q=0.9,*/*;q=0.8",
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
            reject(new Error(`ERDDAP request failed (${statusCode})`));
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
      req.destroy(new Error("ERDDAP request timed out"));
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}
