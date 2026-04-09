import {
  buildNdbcRealtimeFeedUrl,
  fetchNdbcRealtimeText,
} from "./fetch";
import { parseNdbcStationData, type NdbcParsedRow } from "./parse";
import { mapNdbcRowsToObservations } from "./map";

interface StationCapabilitySummary {
  stationId: string;
  feedUrl: string;
  fetchedAt: string;
  latestObservedAt: string | null;
  rawRowCount: number;
  mappedRowCount: number;
  latestMapped: {
    seaSurfaceTempC: number | null;
    waveHeightM: number | null;
    windSpeedMps: number | null;
    pressureHpa: number | null;
  } | null;
  latestFieldPresence: {
    seaSurfaceTempC: boolean;
    waveHeightM: boolean;
    windSpeedMps: boolean;
    pressureHpa: boolean;
  } | null;
  rawFieldAvailability: {
    latestWtmp: string | null;
    latestWvht: string | null;
    usableWtmpRows: number;
    usableWvhtRows: number;
    usableWspdRows: number;
    usablePresRows: number;
  };
}

function parseStationIds(argv: string[], env = process.env): string[] {
  const cliStations = argv
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (cliStations.length > 0) {
    return cliStations;
  }

  const envStations = (env.NDBC_STATION_IDS ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

  if (envStations.length > 0) {
    return envStations;
  }

  return ["41009", "41013", "42036"];
}

function isUsableNumberString(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toUpperCase();
  if (!normalized || normalized === "MM") {
    return false;
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed);
}

function summarizeRawFieldAvailability(rows: NdbcParsedRow[]) {
  const latest = rows[0];

  return {
    latestWtmp: latest?.fields.WTMP ?? null,
    latestWvht: latest?.fields.WVHT ?? null,
    usableWtmpRows: rows.filter((row) => isUsableNumberString(row.fields.WTMP)).length,
    usableWvhtRows: rows.filter((row) => isUsableNumberString(row.fields.WVHT)).length,
    usableWspdRows: rows.filter((row) => isUsableNumberString(row.fields.WSPD)).length,
    usablePresRows: rows.filter((row) => isUsableNumberString(row.fields.PRES ?? row.fields.BAR)).length,
  };
}

async function checkStation(stationId: string): Promise<StationCapabilitySummary> {
  const feedUrl = buildNdbcRealtimeFeedUrl(stationId);
  const fetched = await fetchNdbcRealtimeText({ stationId, feedUrl });
  const parsed = parseNdbcStationData(fetched.body);
  const mapped = mapNdbcRowsToObservations(stationId, fetched.feedUrl, parsed);
  const latest = mapped[0] ?? null;

  return {
    stationId,
    feedUrl,
    fetchedAt: new Date(fetched.fetchedAt).toISOString(),
    latestObservedAt: latest ? new Date(latest.observedAt).toISOString() : null,
    rawRowCount: parsed.length,
    mappedRowCount: mapped.length,
    latestMapped: latest
      ? {
        seaSurfaceTempC: latest.seaSurfaceTempC,
        waveHeightM: latest.waveHeightM,
        windSpeedMps: latest.windSpeedMps,
        pressureHpa: latest.pressureHpa,
      }
      : null,
    latestFieldPresence: latest
      ? {
        seaSurfaceTempC: latest.seaSurfaceTempC !== null,
        waveHeightM: latest.waveHeightM !== null,
        windSpeedMps: latest.windSpeedMps !== null,
        pressureHpa: latest.pressureHpa !== null,
      }
      : null,
    rawFieldAvailability: summarizeRawFieldAvailability(parsed),
  };
}

async function main() {
  const stationIds = parseStationIds(process.argv.slice(2));
  const summaries: StationCapabilitySummary[] = [];

  for (const stationId of stationIds) {
    try {
      summaries.push(await checkStation(stationId));
    } catch (error) {
      summaries.push({
        stationId,
        feedUrl: buildNdbcRealtimeFeedUrl(stationId),
        fetchedAt: new Date().toISOString(),
        latestObservedAt: null,
        rawRowCount: 0,
        mappedRowCount: 0,
        latestMapped: null,
        latestFieldPresence: null,
        rawFieldAvailability: {
          latestWtmp: null,
          latestWvht: null,
          usableWtmpRows: 0,
          usableWvhtRows: 0,
          usableWspdRows: 0,
          usablePresRows: 0,
        },
      });

      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`[ndbc-check] ${stationId} failed: ${message}\n`);
    }
  }

  process.stdout.write(`${JSON.stringify(summaries, null, 2)}\n`);
}

void main();
