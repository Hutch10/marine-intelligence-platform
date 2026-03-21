import type { NdbcParsedRow } from "./parse";

export interface NdbcMappedObservation {
  stationId: string;
  observedAt: number;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
  source: "noaa_ndbc";
  sourceFeed: string;
  sourceTimestamp: string;
  rawLine: string;
}

function parseOptionalNumber(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (!normalized || normalized === "MM") {
    return null;
  }

  const parsed = Number(normalized);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toObservationTimestamp(row: NdbcParsedRow): number {
  return Date.UTC(
    row.timestamp.year,
    row.timestamp.month - 1,
    row.timestamp.day,
    row.timestamp.hour,
    row.timestamp.minute,
    0,
    0,
  );
}

export function mapNdbcRowsToObservations(
  stationId: string,
  sourceFeed: string,
  rows: NdbcParsedRow[],
): NdbcMappedObservation[] {
  return rows
    .map((row) => {
      const observedAt = toObservationTimestamp(row);

      return {
        stationId,
        observedAt,
        seaSurfaceTempC: parseOptionalNumber(row.fields.WTMP),
        waveHeightM: parseOptionalNumber(row.fields.WVHT),
        windSpeedMps: parseOptionalNumber(row.fields.WSPD),
        pressureHpa: parseOptionalNumber(row.fields.PRES ?? row.fields.BAR),
        source: "noaa_ndbc" as const,
        sourceFeed,
        sourceTimestamp: new Date(observedAt).toISOString(),
        rawLine: row.rawLine,
      };
    })
    .sort((left, right) => right.observedAt - left.observedAt);
}
