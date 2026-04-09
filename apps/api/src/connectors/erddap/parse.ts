/**
 * ERDDAP tabledap CSV parser.
 *
 * ERDDAP CSV responses have an unconventional two-row header:
 *   Row 0: column names  (e.g. "time,station_id,sea_water_temperature")
 *   Row 1: units         (e.g. "UTC,,degree_C")  — skipped
 *   Row 2+: data rows
 *
 * Station IDs are often returned as IOOS URNs:
 *   "urn:ioos:station:wmo:41009"
 * These are normalised to the bare WMO buoy ID ("41009").
 */

export interface ErddapParsedRecord {
  stationId: string | null;
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
  /** Column-keyed raw values for the row. */
  raw: Record<string, string>;
}

export interface ErddapParseResult {
  records: ErddapParsedRecord[];
  /** Column names from the header row (row 0). */
  columns: string[];
}

// ─── CSV helpers ──────────────────────────────────────────────────────────────

/**
 * Splits a CSV line into fields, respecting double-quoted values.
 * ERDDAP uses minimal quoting (no escaped quotes inside fields), so
 * a simple state-machine is sufficient.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }

    current += ch;
  }

  fields.push(current);
  return fields;
}

// ─── Value normalisation ──────────────────────────────────────────────────────

/**
 * Strips the IOOS/WMO URN prefix so buoy IDs match the rest of the platform.
 * "urn:ioos:station:wmo:41009" → "41009"
 * "41009" → "41009" (already normalised)
 */
function normaliseStationId(raw: string): string | null {
  const trimmed = raw.trim();

  if (!trimmed || trimmed === "NaN") {
    return null;
  }

  // Strip common IOOS URN prefix patterns.
  const urnMatch = trimmed.match(/^urn:[^:]+:station:[^:]+:(.+)$/i);
  if (urnMatch && urnMatch[1]) {
    return urnMatch[1].trim() || null;
  }

  return trimmed;
}

function parseTimestamp(raw: string): number | null {
  const trimmed = raw.trim();

  if (!trimmed || trimmed === "NaN") {
    return null;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseFloat_(raw: string): number | null {
  const trimmed = raw.trim();

  if (!trimmed || trimmed === "NaN" || trimmed === "") {
    return null;
  }

  const value = parseFloat(trimmed);
  return Number.isFinite(value) ? value : null;
}

// ─── Column key sets ──────────────────────────────────────────────────────────

const SST_KEYS = new Set(["sea_water_temperature", "sea_surface_temperature", "sst", "water_temperature"]);
const WAVE_KEYS = new Set(["sea_surface_wave_significant_height", "wave_height", "significant_wave_height", "wvht"]);
const WIND_KEYS = new Set(["wind_speed", "wind_spd", "wspd"]);
const PRESSURE_KEYS = new Set(["air_pressure", "pressure_hpa", "barometric_pressure", "pres", "air_pressure_at_sea_level"]);
const SALINITY_KEYS = new Set(["sea_water_practical_salinity", "salinity", "sea_water_salinity", "salinity_psu"]);
const DO_KEYS = new Set(["dissolved_oxygen", "dissolved_oxygen_mg_l", "oxygen_mg_l"]);
const CHLOROPHYLL_KEYS = new Set(["mass_concentration_of_chlorophyll_in_sea_water", "chlorophyll", "chlorophyll_a"]);
const LAT_KEYS = new Set(["latitude", "lat"]);
const LON_KEYS = new Set(["longitude", "lon", "lng"]);

function firstMatch(raw: Record<string, string>, keys: Set<string>): string | undefined {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(raw, key)) {
      return raw[key];
    }
  }

  return undefined;
}

// ─── Public parser ────────────────────────────────────────────────────────────

function parseRow(columns: string[], fields: string[]): ErddapParsedRecord {
  const raw: Record<string, string> = {};

  for (let i = 0; i < columns.length; i++) {
    raw[columns[i]] = fields[i] ?? "";
  }

  const stationRaw = raw["station_id"] ?? "";
  const timeRaw = raw["time"] ?? "";

  return {
    stationId: normaliseStationId(stationRaw),
    observedAt: parseTimestamp(timeRaw),
    latitude: parseFloat_(firstMatch(raw, LAT_KEYS) ?? ""),
    longitude: parseFloat_(firstMatch(raw, LON_KEYS) ?? ""),
    seaSurfaceTempC: parseFloat_(firstMatch(raw, SST_KEYS) ?? ""),
    waveHeightM: parseFloat_(firstMatch(raw, WAVE_KEYS) ?? ""),
    windSpeedMps: parseFloat_(firstMatch(raw, WIND_KEYS) ?? ""),
    pressureHpa: parseFloat_(firstMatch(raw, PRESSURE_KEYS) ?? ""),
    salinityPsu: parseFloat_(firstMatch(raw, SALINITY_KEYS) ?? ""),
    dissolvedOxygenMgL: parseFloat_(firstMatch(raw, DO_KEYS) ?? ""),
    chlorophyllMgM3: parseFloat_(firstMatch(raw, CHLOROPHYLL_KEYS) ?? ""),
    raw,
  };
}

export function parseErddapCsv(body: string): ErddapParseResult {
  const lines = body.split(/\r?\n/);

  if (lines.length < 2) {
    return { records: [], columns: [] };
  }

  const columns = splitCsvLine(lines[0]).map((col) => col.trim().toLowerCase());

  // Row 1 is the units row — skip it.
  const dataLines = lines.slice(2).filter((line) => line.trim().length > 0);

  const records: ErddapParsedRecord[] = [];

  for (const line of dataLines) {
    const fields = splitCsvLine(line);
    if (fields.length === 0) {
      continue;
    }

    records.push(parseRow(columns, fields));
  }

  return { records, columns };
}
