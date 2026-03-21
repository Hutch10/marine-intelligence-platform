export interface IoosParsedRecord {
  stationId: string | null;
  region: string | null;
  observedAt: number | null;
  latitude: number | null;
  longitude: number | null;
  seaSurfaceTempC: number | null;
  waveHeightM: number | null;
  windSpeedMps: number | null;
  pressureHpa: number | null;
  salinityPsu: number | null;
  dissolvedOxygenMgL: number | null;
  chlorophyllMgM3: number | null;
  raw: Record<string, unknown>;
}

export interface IoosParseResult {
  records: IoosParsedRecord[];
  availableFields: string[];
}

const RECORD_LIST_KEYS = ["records", "data", "items", "observations", "results"] as const;

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

function parseTimestamp(raw: string | number): number | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Heuristic: treat 10-digit epoch as seconds.
    return raw < 10_000_000_000 ? raw * 1000 : raw;
  }

  const parsed = Date.parse(String(raw));
  return Number.isFinite(parsed) ? parsed : null;
}

function readObservedAt(record: Record<string, unknown>): number | null {
  const directNumber = readNumber(record, ["observed_at", "observedAt", "timestamp_ms", "time_ms"]);
  if (directNumber !== null) {
    return parseTimestamp(directNumber);
  }

  const directString = readString(record, [
    "time",
    "timestamp",
    "datetime",
    "date",
    "observed_at",
    "observedAt",
    "phenomenonTime",
    "time_utc",
  ]);

  if (!directString) {
    return null;
  }

  return parseTimestamp(directString);
}

function readStationId(record: Record<string, unknown>): string | null {
  return readString(record, [
    "station_id",
    "stationId",
    "station",
    "station_code",
    "platform_code",
    "platform",
    "site_id",
    "id",
  ]);
}

function readRegion(record: Record<string, unknown>): string | null {
  return readString(record, ["region", "region_name", "location", "site", "site_name", "area"]);
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
    return parsed
      .map(toRecord)
      .filter((record): record is Record<string, unknown> => record !== null);
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

export function parseIoosData(feedBody: string): IoosParseResult {
  const parsed = JSON.parse(feedBody) as unknown;
  const rawRecords = extractRecords(parsed);

  const records = rawRecords.map((record) => ({
    stationId: readStationId(record),
    region: readRegion(record),
    observedAt: readObservedAt(record),
    latitude: readNumber(record, ["latitude", "lat"]),
    longitude: readNumber(record, ["longitude", "lon", "lng"]),
    seaSurfaceTempC: readNumber(record, [
      "sea_surface_temperature",
      "sea_surface_temp_c",
      "sst",
      "water_temperature",
      "temperature",
      "sea_water_temperature",
    ]),
    waveHeightM: readNumber(record, ["wave_height", "wave_height_m", "significant_wave_height", "wvht"]),
    windSpeedMps: readNumber(record, ["wind_speed", "wind_speed_mps", "wspd", "wind_spd"]),
    pressureHpa: readNumber(record, ["pressure_hpa", "air_pressure", "barometric_pressure", "pres", "pressure"]),
    salinityPsu: readNumber(record, ["salinity", "salinity_psu"]),
    dissolvedOxygenMgL: readNumber(record, ["dissolved_oxygen", "dissolved_oxygen_mg_l", "oxygen_mg_l"]),
    chlorophyllMgM3: readNumber(record, ["chlorophyll", "chlorophyll_a", "chlorophyll_mg_m3"]),
    raw: record,
  }));

  return {
    records,
    availableFields: collectAvailableFields(rawRecords),
  };
}
