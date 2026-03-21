import type { IoosParsedRecord } from "./parse";

export interface IoosMappedObservation {
  stationId: string;
  observedAt: number;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
  source: "ioos_regional";
  sourceReference: string;
  sourceTimestamp: string;
  rawLine: string;
}

export interface IoosMappedMetric {
  stationId: string;
  regionKey: string;
  observedAt: number;
  metricType: "salinity_psu" | "dissolved_oxygen_mg_l" | "chlorophyll_mg_m3";
  metricValue: number;
  metricUnit: "psu" | "mg_l" | "mg_m3";
  sourceTimestamp: string;
}

export interface IoosMappedBatch {
  observations: IoosMappedObservation[];
  metrics: IoosMappedMetric[];
}

function hasObservationPayload(record: IoosParsedRecord): boolean {
  return (
    record.seaSurfaceTempC !== null
    || record.waveHeightM !== null
    || record.windSpeedMps !== null
    || record.pressureHpa !== null
  );
}

function normalizeRegionKey(record: IoosParsedRecord, fallbackRegionKey: string): string {
  const candidate = record.region ?? fallbackRegionKey;
  const normalized = candidate.trim();
  return normalized.length > 0 ? normalized : fallbackRegionKey;
}

export function mapIoosRecords(
  records: IoosParsedRecord[],
  sourceReference: string,
  fallbackRegionKey = "ioos_region",
): IoosMappedBatch {
  const observations: IoosMappedObservation[] = [];
  const metrics: IoosMappedMetric[] = [];

  for (const record of records) {
    if (!record.stationId || record.observedAt === null) {
      continue;
    }

    const sourceTimestamp = new Date(record.observedAt).toISOString();
    const regionKey = normalizeRegionKey(record, fallbackRegionKey);

    if (hasObservationPayload(record)) {
      observations.push({
        stationId: record.stationId,
        observedAt: record.observedAt,
        seaSurfaceTempC: record.seaSurfaceTempC,
        waveHeightM: record.waveHeightM,
        windSpeedMps: record.windSpeedMps,
        pressureHpa: record.pressureHpa,
        source: "ioos_regional",
        sourceReference,
        sourceTimestamp,
        rawLine: JSON.stringify(record.raw),
      });
    }

    if (record.salinityPsu !== null) {
      metrics.push({
        stationId: record.stationId,
        regionKey,
        observedAt: record.observedAt,
        metricType: "salinity_psu",
        metricValue: record.salinityPsu,
        metricUnit: "psu",
        sourceTimestamp,
      });
    }

    if (record.dissolvedOxygenMgL !== null) {
      metrics.push({
        stationId: record.stationId,
        regionKey,
        observedAt: record.observedAt,
        metricType: "dissolved_oxygen_mg_l",
        metricValue: record.dissolvedOxygenMgL,
        metricUnit: "mg_l",
        sourceTimestamp,
      });
    }

    if (record.chlorophyllMgM3 !== null) {
      metrics.push({
        stationId: record.stationId,
        regionKey,
        observedAt: record.observedAt,
        metricType: "chlorophyll_mg_m3",
        metricValue: record.chlorophyllMgM3,
        metricUnit: "mg_m3",
        sourceTimestamp,
      });
    }
  }

  observations.sort((left, right) => right.observedAt - left.observedAt);
  metrics.sort((left, right) => right.observedAt - left.observedAt);

  return {
    observations,
    metrics,
  };
}
