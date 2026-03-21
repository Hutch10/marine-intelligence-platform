export interface CrwParsedRecord {
  region: string;
  stationId: string | null;
  observedAt: number | null;
  sstAnomalyC: number | null;
  hotSpotC: number | null;
  dhw: number | null;
  stressLevel: string | null;
  latitude: number | null;
  longitude: number | null;
  raw: Record<string, unknown>;
}

export interface CrwParseResult {
  records: CrwParsedRecord[];
  availableFields: string[];
}

const RECORD_LIST_KEYS = ["records", "data", "items"] as const;

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function readNumber(record: Record<string, unknown>, keys: string[]): number | null {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function readObservedAt(record: Record<string, unknown>): number | null {
  const raw = readString(record, ["timestamp", "time", "observed_at", "date", "analysis_time"]);

  if (!raw) {
    return null;
  }

  const parsed = Date.parse(raw);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function readRegion(record: Record<string, unknown>): string {
  return (
    readString(record, ["region", "region_name", "reef", "reef_name", "location", "site"]) ??
    "Unknown reef region"
  );
}

function readStationId(record: Record<string, unknown>): string | null {
  return readString(record, ["station_id", "stationId", "station", "site_id"]);
}

function readStressLevel(record: Record<string, unknown>): string | null {
  const value = readString(record, [
    "bleaching_alert_level",
    "alert_level",
    "alertLevel",
    "stress_level",
    "stressCategory",
  ]);

  return value ? value.toLowerCase().replace(/\s+/g, "_") : null;
}

function collectAvailableFields(records: Record<string, unknown>[]): string[] {
  const fields = new Set<string>();

  for (const record of records) {
    for (const key of Object.keys(record)) {
      fields.add(key);
    }
  }

  return [...fields].sort((left, right) => left.localeCompare(right));
}

function extractRecords(parsed: unknown): Record<string, unknown>[] {
  if (Array.isArray(parsed)) {
    return parsed.map(toRecord).filter((record): record is Record<string, unknown> => record !== null);
  }

  const asRecord = toRecord(parsed);
  if (!asRecord) {
    return [];
  }

  for (const key of RECORD_LIST_KEYS) {
    const candidate = asRecord[key];
    if (Array.isArray(candidate)) {
      return candidate
        .map(toRecord)
        .filter((record): record is Record<string, unknown> => record !== null);
    }
  }

  const features = asRecord.features;
  if (Array.isArray(features)) {
    return features
      .map((feature) => {
        const featureRecord = toRecord(feature);
        if (!featureRecord) {
          return null;
        }

        const properties = toRecord(featureRecord.properties) ?? {};
        const geometry = toRecord(featureRecord.geometry);

        if (geometry && Array.isArray(geometry.coordinates) && geometry.coordinates.length >= 2) {
          properties.longitude = properties.longitude ?? geometry.coordinates[0];
          properties.latitude = properties.latitude ?? geometry.coordinates[1];
        }

        return properties;
      })
      .filter((record): record is Record<string, unknown> => record !== null);
  }

  return [];
}

export function parseCoralReefWatchData(feedBody: string): CrwParseResult {
  const parsed = JSON.parse(feedBody) as unknown;
  const rawRecords = extractRecords(parsed);
  const availableFields = collectAvailableFields(rawRecords);

  const records = rawRecords.map((record) => ({
    region: readRegion(record),
    stationId: readStationId(record),
    observedAt: readObservedAt(record),
    sstAnomalyC: readNumber(record, ["sst_anomaly", "sst_anomaly_c", "ssta", "sstAnomaly"]),
    hotSpotC: readNumber(record, ["hotspot", "hotspot_c", "hotSpot", "hot_spot"]),
    dhw: readNumber(record, ["dhw", "degree_heating_weeks", "degreeHeatingWeeks"]),
    stressLevel: readStressLevel(record),
    latitude: readNumber(record, ["latitude", "lat"]),
    longitude: readNumber(record, ["longitude", "lon", "lng"]),
    raw: record,
  }));

  return {
    records,
    availableFields,
  };
}
