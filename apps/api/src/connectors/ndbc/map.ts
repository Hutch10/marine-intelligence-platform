import type { NdbcParsedRow } from "./parse";

const MAX_BACKFILL_AGE_MS = 6 * 60 * 60 * 1000;

export interface MetricTemporalMeta {
  observedAt: number | null;
  backfilled: boolean;
}

export interface NdbcMappedObservation {
  stationId: string;
  /** Row anchor timestamp (newest row in feed sort order). */
  observedAt: number;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
  seaTempObservedAt: number | null;
  waveHeightObservedAt: number | null;
  windObservedAt: number | null;
  pressureObservedAt: number | null;
  seaSurfaceTempBackfilled: boolean;
  waveHeightBackfilled: boolean;
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

function resolveMetric(
  rows: NdbcMappedObservation[],
  index: number,
  field: "seaSurfaceTempC" | "waveHeightM",
  rawRows: Array<{ observedAt: number; value: number | null }>,
): { value: number | null; observedAt: number | null; backfilled: boolean } {
  const direct = rawRows[index];
  if (!direct) {
    return { value: null, observedAt: null, backfilled: false };
  }

  if (typeof direct.value === "number" && Number.isFinite(direct.value)) {
    return { value: direct.value, observedAt: direct.observedAt, backfilled: false };
  }

  const anchor = rows[index];
  if (!anchor) {
    return { value: null, observedAt: null, backfilled: false };
  }

  for (let offset = index + 1; offset < rawRows.length; offset += 1) {
    const candidate = rawRows[offset];
    if (!candidate) {
      continue;
    }

    if (anchor.observedAt - candidate.observedAt > MAX_BACKFILL_AGE_MS) {
      break;
    }

    if (typeof candidate.value === "number" && Number.isFinite(candidate.value)) {
      return {
        value: candidate.value,
        observedAt: candidate.observedAt,
        backfilled: true,
      };
    }
  }

  return { value: null, observedAt: null, backfilled: false };
}

export function mapNdbcRowsToObservations(
  stationId: string,
  sourceFeed: string,
  rows: NdbcParsedRow[],
): NdbcMappedObservation[] {
  const sorted = rows
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

  const sstSeries = sorted.map((row) => ({ observedAt: row.observedAt, value: row.seaSurfaceTempC }));
  const waveSeries = sorted.map((row) => ({ observedAt: row.observedAt, value: row.waveHeightM }));

  return sorted.map((row, index) => {
    const sst = resolveMetric(sorted as NdbcMappedObservation[], index, "seaSurfaceTempC", sstSeries);
    const wave = resolveMetric(sorted as NdbcMappedObservation[], index, "waveHeightM", waveSeries);

    const windObservedAt = row.windSpeedMps !== null ? row.observedAt : null;
    const pressureObservedAt = row.pressureHpa !== null ? row.observedAt : null;

    return {
      stationId: row.stationId,
      observedAt: row.observedAt,
      seaSurfaceTempC: sst.value,
      waveHeightM: wave.value,
      windSpeedMps: row.windSpeedMps,
      pressureHpa: row.pressureHpa,
      seaTempObservedAt: sst.observedAt,
      waveHeightObservedAt: wave.observedAt,
      windObservedAt,
      pressureObservedAt,
      seaSurfaceTempBackfilled: sst.backfilled,
      waveHeightBackfilled: wave.backfilled,
      source: row.source,
      sourceFeed: row.sourceFeed,
      sourceTimestamp: row.sourceTimestamp,
      rawLine: row.rawLine,
    };
  });
}

export function metricsAreConcurrent(observation: Pick<
  NdbcMappedObservation,
  | "seaSurfaceTempC"
  | "waveHeightM"
  | "windSpeedMps"
  | "pressureHpa"
  | "seaTempObservedAt"
  | "waveHeightObservedAt"
  | "windObservedAt"
  | "pressureObservedAt"
>): boolean {
  const timestamps = [
    observation.seaSurfaceTempC !== null ? observation.seaTempObservedAt : null,
    observation.waveHeightM !== null ? observation.waveHeightObservedAt : null,
    observation.windSpeedMps !== null ? observation.windObservedAt : null,
    observation.pressureHpa !== null ? observation.pressureObservedAt : null,
  ].filter((value): value is number => typeof value === "number" && Number.isFinite(value));

  if (timestamps.length <= 1) {
    return true;
  }

  return timestamps.every((value) => value === timestamps[0]);
}
