export interface NdbcTimestampParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface NdbcParsedRow {
  timestamp: NdbcTimestampParts;
  fields: Record<string, string>;
  rawLine: string;
}

function splitFields(line: string): string[] {
  return line.trim().split(/\s+/).filter(Boolean);
}

function normalizeHeaderToken(token: string): string {
  return token.trim().toUpperCase();
}

function toInteger(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  return Math.trunc(parsed);
}

function parseYear(rawYear: string | undefined): number | null {
  const value = toInteger(rawYear);

  if (value === null) {
    return null;
  }

  if (value >= 100) {
    return value;
  }

  return value >= 70 ? 1900 + value : 2000 + value;
}

function extractTimestamp(fields: Record<string, string>, fallback: string[]): NdbcTimestampParts | null {
  const year = parseYear(fields.YYYY ?? fields.YY ?? fallback[0]);
  const month = toInteger(fallback[1]);
  const day = toInteger(fallback[2]);
  const hour = toInteger(fallback[3]);
  const minute = toInteger(fallback[4] ?? "0");

  if (
    year === null
    || month === null
    || day === null
    || hour === null
    || minute === null
  ) {
    return null;
  }

  if (
    month < 1 || month > 12
    || day < 1 || day > 31
    || hour < 0 || hour > 23
    || minute < 0 || minute > 59
  ) {
    return null;
  }

  return { year, month, day, hour, minute };
}

function createFieldRecord(headers: string[], values: string[]): Record<string, string> {
  const fields: Record<string, string> = {};

  headers.forEach((header, index) => {
    fields[header] = values[index] ?? "";
  });

  return fields;
}

export function parseNdbcStationData(feedBody: string): NdbcParsedRow[] {
  const lines = feedBody
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return [];
  }

  let headerTokens: string[] = [];
  let dataStartIndex = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line.startsWith("#")) {
      continue;
    }

    headerTokens = splitFields(line.replace(/^#+\s*/, "")).map(normalizeHeaderToken);
    dataStartIndex = index + 1;
    break;
  }

  if (headerTokens.length === 0) {
    headerTokens = splitFields(lines[0]!).map(normalizeHeaderToken);
    dataStartIndex = 1;
  }

  const parsedRows: NdbcParsedRow[] = [];

  for (let index = dataStartIndex; index < lines.length; index += 1) {
    const line = lines[index]!;

    if (line.startsWith("#")) {
      continue;
    }

    const values = splitFields(line);

    if (values.length === 0) {
      continue;
    }

    const fields = createFieldRecord(headerTokens, values);
    const timestamp = extractTimestamp(fields, values);

    if (!timestamp) {
      continue;
    }

    parsedRows.push({
      timestamp,
      fields,
      rawLine: line,
    });
  }

  return parsedRows;
}
