import { request } from "node:https";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_USER_AGENT = "MarineBioPlatform/1.0 (+https://marine.local)";
const DEFAULT_CRW_STATION_NAME = "Southeast Florida";
const DEFAULT_CRW_SOURCE_URL = buildCrwRegionalVirtualStationDataUrl(DEFAULT_CRW_STATION_NAME);

export interface CrwFetchRequest {
  sourceUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface CrwFetchResult {
  sourceUrl: string;
  body: string;
  fetchedAt: number;
  statusCode: number;
  contentType: string | null;
}

function slugifyRegionName(region: string): string {
  return region
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
}

function titleCaseWords(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0] ? `${part[0].toUpperCase()}${part.slice(1)}` : part)
    .join(" ");
}

function inferRegionNameFromSourceUrl(sourceUrl: string): string {
  try {
    const url = new URL(sourceUrl);
    const filename = url.pathname.split("/").pop() ?? "";
    const stem = filename.replace(/\.txt$/i, "");

    if (!stem) {
      return DEFAULT_CRW_STATION_NAME;
    }

    return titleCaseWords(stem.replace(/_/g, " "));
  } catch {
    return DEFAULT_CRW_STATION_NAME;
  }
}

function parseNullableNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || /^nan$/i.test(normalized)) {
    return null;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function toStressLevel(alertValue: number | null): string | null {
  switch (alertValue) {
    case 0:
      return "no_stress";
    case 1:
      return "bleaching_watch";
    case 2:
      return "bleaching_warning";
    case 3:
      return "alert_level_1";
    case 4:
      return "alert_level_2";
    default:
      return null;
  }
}

function convertRegionalVirtualStationTextToJson(body: string, sourceUrl: string): string {
  const lines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const headerIndex = lines.findIndex((line) => /^YYYY\b/i.test(line.replace(/^#+\s*/, "")));

  if (headerIndex === -1) {
    throw new Error(`CRW virtual station data format not recognized for ${sourceUrl}`);
  }

  const dataLines = lines
    .slice(headerIndex + 1)
    .filter((line) => !line.startsWith("#"));

  if (dataLines.length === 0) {
    throw new Error(`CRW virtual station feed contained no data rows for ${sourceUrl}`);
  }

  const latestTokens = dataLines[dataLines.length - 1]!
    .split(/\s+/)
    .filter(Boolean);

  if (latestTokens.length < 10) {
    throw new Error(`CRW virtual station row was incomplete for ${sourceUrl}`);
  }

  const year = Number(latestTokens[0]);
  const month = Number(latestTokens[1]);
  const day = Number(latestTokens[2]);

  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    throw new Error(`CRW virtual station row had an invalid date for ${sourceUrl}`);
  }

  const observedAt = new Date(Date.UTC(year, month - 1, day)).toISOString();
  const sstAnomaly = parseNullableNumber(latestTokens[6]);
  const hotspot = parseNullableNumber(latestTokens[7]);
  const dhw = parseNullableNumber(latestTokens[8]);
  const alertArea = parseNullableNumber(latestTokens[9]);

  return JSON.stringify([
    {
      region: inferRegionNameFromSourceUrl(sourceUrl),
      station_id: null,
      observed_at: observedAt,
      sst_anomaly: sstAnomaly,
      hotspot,
      dhw,
      alert_level: toStressLevel(alertArea),
      latitude: null,
      longitude: null,
    },
  ]);
}

export function buildCrwRegionalVirtualStationDataUrl(region: string): string {
  return `https://coralreefwatch.noaa.gov/product/vs/data/${slugifyRegionName(region)}.txt`;
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
          accept: "text/plain,application/json,text/html;q=0.9,*/*;q=0.8",
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
          const rawBody = Buffer.concat(chunks).toString("utf8");

          if (statusCode < 200 || statusCode >= 300) {
            reject(
              new Error(
                `CRW feed request failed (${statusCode}); url=${sourceUrl}; content-type=${contentType ?? "unknown"}`,
              ),
            );
            return;
          }

          const body = sourceUrl.toLowerCase().endsWith(".txt")
            ? convertRegionalVirtualStationTextToJson(rawBody, sourceUrl)
            : rawBody;

          resolve({
            sourceUrl,
            body,
            fetchedAt: Date.now(),
            statusCode,
            contentType,
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error(`CRW feed request timed out; url=${sourceUrl}`));
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}
