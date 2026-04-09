import type { ErddapParsedRecord } from "./parse";

export interface ErddapMappedObservation {
  stationId: string;
  observedAt: number;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
  source: "ioos_erddap";
  sourceReference: string;
  sourceTimestamp: string;
  rawLine: string;
}

export interface ErddapMappedMetric {
  stationId: string;
  regionKey: string;
  observedAt: number;
  metricType: "salinity_psu" | "dissolved_oxygen_mg_l" | "chlorophyll_mg_m3";
  metricValue: number;
  metricUnit: "psu" | "mg_l" | "mg_m3";
  sourceTimestamp: string;
}

export interface ErddapMappedBatch {
  observations: ErddapMappedObservation[];
  metrics: ErddapMappedMetric[];
}

function hasObservationPayload(record: ErddapParsedRecord): boolean {
  return (
    record.seaSurfaceTempC !== null
    || record.waveHeightM !== null
    || record.windSpeedMps !== null
    || record.pressureHpa !== null
  );
}

export function mapErddapRecords(
  records: ErddapParsedRecord[],
  sourceReference: string,
  fallbackRegionKey = "ioos_erddap",
): ErddapMappedBatch {
  const observations: ErddapMappedObservation[] = [];
  const metrics: ErddapMappedMetric[] = [];

  for (const record of records) {
    if (!record.stationId || record.observedAt === null) {
      continue;
    }

    const sourceTimestamp = new Date(record.observedAt).toISOString();

    if (hasObservationPayload(record)) {
      observations.push({
        stationId: record.stationId,
        observedAt: record.observedAt,
        seaSurfaceTempC: record.seaSurfaceTempC,
        waveHeightM: record.waveHeightM,
        windSpeedMps: record.windSpeedMps,
        pressureHpa: record.pressureHpa,
        source: "ioos_erddap",
        sourceReference,
        sourceTimestamp,
        rawLine: JSON.stringify(record.raw),
      });
    }

    if (record.salinityPsu !== null) {
      metrics.push({
        stationId: record.stationId,
        regionKey: fallbackRegionKey,
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
        regionKey: fallbackRegionKey,
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
        regionKey: fallbackRegionKey,
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

  return { observations, metrics };
}
