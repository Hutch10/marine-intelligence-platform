# CRW Feature Full Modified File Contents


## FILE: apps/api/src/connectors/coral-reef-watch/fetch.ts

~~~

import { request } from "node:https";
import { URL } from "node:url";

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_USER_AGENT = "MarineBioPlatform/1.0 (+https://marine.local)";
const DEFAULT_CRW_SOURCE_URL = "https://coralreefwatch.noaa.gov/data/reef_stress_watch.json";

export interface CrwFetchRequest {
  sourceUrl?: string;
  timeoutMs?: number;
  userAgent?: string;
}

export interface CrwFetchResult {
  sourceUrl: string;
  body: string;
  fetchedAt: number;
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
          accept: "application/json,text/plain;q=0.9,*/*;q=0.8",
        },
      },
      (res) => {
        const statusCode = res.statusCode ?? 500;
        const chunks: Buffer[] = [];

        res.on("data", (chunk: Buffer | string) => {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        });

        res.on("end", () => {
          if (statusCode < 200 || statusCode >= 300) {
            reject(new Error(`CRW feed request failed (${statusCode})`));
            return;
          }

          resolve({
            sourceUrl,
            body: Buffer.concat(chunks).toString("utf8"),
            fetchedAt: Date.now(),
          });
        });
      },
    );

    req.setTimeout(timeoutMs, () => {
      req.destroy(new Error("CRW feed request timed out"));
    });

    req.on("error", (error) => {
      reject(error);
    });

    req.end();
  });
}

~~~


## FILE: apps/api/src/connectors/coral-reef-watch/parse.ts

~~~

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

~~~


## FILE: apps/api/src/connectors/coral-reef-watch/map.ts

~~~

import type { CrwParsedRecord } from "./parse";

export interface CrwMappedMetric {
  stationId: string | null;
  region: string;
  observedAt: number;
  metricType: "sst_anomaly_c" | "hotspot_c" | "dhw";
  metricValue: number;
  metricUnit: "celsius" | "week";
  sourceTimestamp: string;
}

export interface CrwMappedSignal {
  stationId: string | null;
  region: string;
  observedAt: number;
  signalType: "reef_bleaching_alert_level";
  signalValue: number | null;
  signalLabel: string | null;
  severity: "low" | "medium" | "high" | "critical";
  sourceTimestamp: string;
}

export interface CrwMappedBatch {
  metrics: CrwMappedMetric[];
  signals: CrwMappedSignal[];
}

function normalizeSeverity(stressLevel: string | null, dhw: number | null): "low" | "medium" | "high" | "critical" {
  const normalized = (stressLevel ?? "").toLowerCase();

  if (normalized.includes("alert_level_2") || normalized.includes("critical") || (dhw ?? 0) >= 8) {
    return "critical";
  }

  if (normalized.includes("alert_level_1") || normalized.includes("warning") || (dhw ?? 0) >= 4) {
    return "high";
  }

  if (normalized.includes("watch") || (dhw ?? 0) >= 1) {
    return "medium";
  }

  return "low";
}

export function mapCrwRecords(records: CrwParsedRecord[]): CrwMappedBatch {
  const metrics: CrwMappedMetric[] = [];
  const signals: CrwMappedSignal[] = [];

  for (const record of records) {
    if (record.observedAt === null) {
      continue;
    }

    const sourceTimestamp = new Date(record.observedAt).toISOString();

    if (record.sstAnomalyC !== null) {
      metrics.push({
        stationId: record.stationId,
        region: record.region,
        observedAt: record.observedAt,
        metricType: "sst_anomaly_c",
        metricValue: record.sstAnomalyC,
        metricUnit: "celsius",
        sourceTimestamp,
      });
    }

    if (record.hotSpotC !== null) {
      metrics.push({
        stationId: record.stationId,
        region: record.region,
        observedAt: record.observedAt,
        metricType: "hotspot_c",
        metricValue: record.hotSpotC,
        metricUnit: "celsius",
        sourceTimestamp,
      });
    }

    if (record.dhw !== null) {
      metrics.push({
        stationId: record.stationId,
        region: record.region,
        observedAt: record.observedAt,
        metricType: "dhw",
        metricValue: record.dhw,
        metricUnit: "week",
        sourceTimestamp,
      });
    }

    signals.push({
      stationId: record.stationId,
      region: record.region,
      observedAt: record.observedAt,
      signalType: "reef_bleaching_alert_level",
      signalValue: record.dhw,
      signalLabel: record.stressLevel,
      severity: normalizeSeverity(record.stressLevel, record.dhw),
      sourceTimestamp,
    });
  }

  return { metrics, signals };
}

~~~


## FILE: apps/api/src/connectors/coral-reef-watch/parse.test.ts

~~~

import test from "node:test";
import assert from "node:assert/strict";
import { parseCoralReefWatchData } from "./parse";

const SAMPLE = JSON.stringify({
  records: [
    {
      region: "Great Barrier Reef",
      timestamp: "2026-03-18T10:00:00.000Z",
      sst_anomaly: 1.8,
      hotspot: 1.4,
      dhw: 6.2,
      alert_level: "alert_level_1",
      latitude: -18.2871,
      longitude: 147.6992,
    },
  ],
});

test("parseCoralReefWatchData parses CRW records and fields", () => {
  const result = parseCoralReefWatchData(SAMPLE);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.region, "Great Barrier Reef");
  assert.equal(result.records[0]?.sstAnomalyC, 1.8);
  assert.equal(result.records[0]?.hotSpotC, 1.4);
  assert.equal(result.records[0]?.dhw, 6.2);
  assert.equal(result.records[0]?.stressLevel, "alert_level_1");
  assert.ok(result.availableFields.includes("sst_anomaly"));
});

test("parseCoralReefWatchData handles geojson feature format", () => {
  const geoJson = JSON.stringify({
    features: [
      {
        properties: {
          reef_name: "Caribbean",
          analysis_time: "2026-03-18T10:00:00.000Z",
          ssta: "0.9",
          hotSpot: "0.6",
          degreeHeatingWeeks: "3.1",
          bleaching_alert_level: "watch",
        },
        geometry: {
          type: "Point",
          coordinates: [-75.1, 18.2],
        },
      },
    ],
  });

  const result = parseCoralReefWatchData(geoJson);

  assert.equal(result.records.length, 1);
  assert.equal(result.records[0]?.region, "Caribbean");
  assert.equal(result.records[0]?.latitude, 18.2);
  assert.equal(result.records[0]?.longitude, -75.1);
  assert.equal(result.records[0]?.hotSpotC, 0.6);
});

~~~


## FILE: apps/api/src/connectors/coral-reef-watch/map.test.ts

~~~

import test from "node:test";
import assert from "node:assert/strict";
import { mapCrwRecords } from "./map";
import type { CrwParsedRecord } from "./parse";

const RECORDS: CrwParsedRecord[] = [
  {
    region: "Great Barrier Reef",
    stationId: null,
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
    sstAnomalyC: 1.8,
    hotSpotC: 1.4,
    dhw: 6.2,
    stressLevel: "alert_level_1",
    latitude: -18.28,
    longitude: 147.69,
    raw: {},
  },
];

test("mapCrwRecords maps three metrics and one signal per CRW record", () => {
  const mapped = mapCrwRecords(RECORDS);

  assert.equal(mapped.metrics.length, 3);
  assert.equal(mapped.signals.length, 1);
  assert.equal(mapped.metrics.find((entry) => entry.metricType === "hotspot_c")?.metricValue, 1.4);
  assert.equal(mapped.signals[0]?.signalLabel, "alert_level_1");
  assert.equal(mapped.signals[0]?.severity, "high");
});

test("mapCrwRecords skips records with no timestamp", () => {
  const mapped = mapCrwRecords([{ ...RECORDS[0]!, observedAt: null }]);

  assert.equal(mapped.metrics.length, 0);
  assert.equal(mapped.signals.length, 0);
});

~~~


## FILE: apps/api/src/services/ingestion/run-crw.ts

~~~

import {
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../../db/client";
import { fetchCoralReefWatchData } from "../../connectors/coral-reef-watch/fetch";
import {
  parseCoralReefWatchData,
  type CrwParsedRecord,
} from "../../connectors/coral-reef-watch/parse";
import { mapCrwRecords } from "../../connectors/coral-reef-watch/map";
import {
  ensureIngestionRunsTable,
  createIngestionRun,
  finalizeIngestionRun,
} from "../../repositories/ingestion-runs";
import {
  ensureProvenanceRecordsTable,
  insertProvenanceRecord,
} from "../../repositories/provenance";
import {
  ensureDerivedSignalsTable,
  ensureStationMetricsTable,
  insertDerivedSignal,
  insertStationMetric,
  reefStressSnapshotExists,
} from "../../repositories/reef-stress";

const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;
const REQUIRED_SCHEMA_FIELD_GROUPS = [
  ["sst_anomaly", "sst_anomaly_c", "ssta", "sstanomaly"],
  ["hotspot", "hotspot_c", "hot_spot", "hotspotc"],
  ["dhw", "degree_heating_weeks", "degreeheatingweeks"],
  ["alert_level", "bleaching_alert_level", "stress_level", "stresscategory"],
] as const;

export type CrwRejectReason =
  | "timestamp_stale"
  | "impossible_values"
  | "duplicate_record"
  | "schema_drift";

export interface CrwTargetConfig {
  region: string;
  stationId?: string;
  enabled?: boolean;
}

export interface RunCrwIngestionResult {
  runId: string;
  status: "completed" | "completed_with_rejections" | "failed";
  polledTargets: number;
  insertedRows: number;
  rejectedRows: number;
  rejectionReasons: Record<CrwRejectReason, number>;
  finishedAt: string;
}

interface RunCrwIngestionDependencies {
  resolvePath?: typeof resolveDatabasePath;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
  staleAfterMs?: number;
  targets?: CrwTargetConfig[];
  fetchData?: typeof fetchCoralReefWatchData;
  parseData?: typeof parseCoralReefWatchData;
  mapData?: typeof mapCrwRecords;
}

export function loadConfiguredCrwTargets(env = process.env): CrwTargetConfig[] {
  const configured = env.CRW_TARGET_REGIONS;

  if (!configured) {
    return [
      { region: "Great Barrier Reef" },
      { region: "Caribbean" },
    ];
  }

  return configured
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((region) => ({ region }));
}

function includesRequiredSchemaFields(availableFields: string[]): boolean {
  const lowered = new Set(availableFields.map((field) => field.toLowerCase()));

  return REQUIRED_SCHEMA_FIELD_GROUPS.every((group) => group.some((field) => lowered.has(field)));
}

function isImpossibleValue(value: number | null, min: number, max: number): boolean {
  if (value === null) {
    return true;
  }

  return value < min || value > max;
}

function selectLatestTargetRecord(target: CrwTargetConfig, rows: CrwParsedRecord[]): CrwParsedRecord | null {
  const sorted = [...rows].sort((left, right) => (right.observedAt ?? 0) - (left.observedAt ?? 0));

  return (
    sorted.find((row) => {
      if (target.stationId) {
        return row.stationId === target.stationId;
      }

      return row.region.toLowerCase() === target.region.toLowerCase();
    }) ?? null
  );
}

export function validateCrwRecord(
  record: CrwParsedRecord,
  now: number,
  staleAfterMs: number,
  db: SqliteDatabaseLike,
): CrwRejectReason | null {
  if (
    record.observedAt === null
    || record.sstAnomalyC === null
    || record.hotSpotC === null
    || record.dhw === null
  ) {
    return "schema_drift";
  }

  if (now - record.observedAt > staleAfterMs) {
    return "timestamp_stale";
  }

  if (
    isImpossibleValue(record.sstAnomalyC, -8, 10)
    || isImpossibleValue(record.hotSpotC, 0, 20)
    || isImpossibleValue(record.dhw, 0, 40)
  ) {
    return "impossible_values";
  }

  if (
    reefStressSnapshotExists(
      db,
      record.stationId,
      record.region,
      record.observedAt,
      "noaa_coral_reef_watch",
    )
  ) {
    return "duplicate_record";
  }

  return null;
}

export async function runCrwIngestion(
  dependencies: RunCrwIngestionDependencies = {},
): Promise<RunCrwIngestionResult> {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const nowFn = dependencies.now ?? Date.now;
  const staleAfterMs = dependencies.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const targets = (dependencies.targets ?? loadConfiguredCrwTargets()).filter((target) => target.enabled !== false);
  const fetchData = dependencies.fetchData ?? fetchCoralReefWatchData;
  const parseData = dependencies.parseData ?? parseCoralReefWatchData;
  const mapData = dependencies.mapData ?? mapCrwRecords;

  const startedAt = nowFn();
  const dbPath = resolvePath();
  const db = openWritable(dbPath);

  ensureIngestionRunsTable(db);
  ensureProvenanceRecordsTable(db);
  ensureStationMetricsTable(db);
  ensureDerivedSignalsTable(db);

  const runId = createIngestionRun(db, {
    source: "noaa_coral_reef_watch",
    startedAt,
    stationCount: targets.length,
  });

  let insertedRows = 0;
  let rejectedRows = 0;

  const rejectionReasons: Record<CrwRejectReason, number> = {
    timestamp_stale: 0,
    impossible_values: 0,
    duplicate_record: 0,
    schema_drift: 0,
  };

  try {
    const fetched = await fetchData();
    const parsed = parseData(fetched.body);

    if (!includesRequiredSchemaFields(parsed.availableFields)) {
      rejectedRows = targets.length;
      rejectionReasons.schema_drift = targets.length;

      const finishedAt = nowFn();
      finalizeIngestionRun(db, {
        runId,
        status: "completed",
        finishedAt,
        insertedRows,
        rejectedRows,
      });

      return {
        runId,
        status: "completed_with_rejections",
        polledTargets: targets.length,
        insertedRows,
        rejectedRows,
        rejectionReasons,
        finishedAt: new Date(finishedAt).toISOString(),
      };
    }

    for (const target of targets) {
      const record = selectLatestTargetRecord(target, parsed.records);
      if (!record) {
        rejectedRows += 1;
        rejectionReasons.schema_drift += 1;
        continue;
      }

      const now = nowFn();
      const rejection = validateCrwRecord(record, now, staleAfterMs, db);

      if (rejection) {
        rejectedRows += 1;
        rejectionReasons[rejection] += 1;
        continue;
      }

      const mapped = mapData([record]);

      for (const metric of mapped.metrics) {
        const metricId = insertStationMetric(db, {
          stationId: metric.stationId,
          regionKey: metric.region,
          metricType: metric.metricType,
          metricValue: metric.metricValue,
          metricUnit: metric.metricUnit,
          source: "noaa_coral_reef_watch",
          observedAt: metric.observedAt,
          ingestionRunId: runId,
          sourceTimestamp: metric.sourceTimestamp,
          sourceReference: fetched.sourceUrl,
          createdAt: now,
        });

        insertProvenanceRecord(db, {
          ingestionRunId: runId,
          source: "noaa_coral_reef_watch",
          sourceStationId: metric.stationId ?? metric.region,
          sourceTimestamp: metric.sourceTimestamp,
          sourceReference: fetched.sourceUrl,
          recordType: "station_metric",
          recordId: metricId,
          payload: {
            region: metric.region,
            metricType: metric.metricType,
            metricValue: metric.metricValue,
          },
          createdAt: now,
        });

        insertedRows += 1;
      }

      for (const signal of mapped.signals) {
        const signalId = insertDerivedSignal(db, {
          stationId: signal.stationId,
          regionKey: signal.region,
          signalType: signal.signalType,
          signalValue: signal.signalValue,
          signalLabel: signal.signalLabel,
          severity: signal.severity,
          source: "noaa_coral_reef_watch",
          observedAt: signal.observedAt,
          ingestionRunId: runId,
          sourceTimestamp: signal.sourceTimestamp,
          sourceReference: fetched.sourceUrl,
          createdAt: now,
        });

        insertProvenanceRecord(db, {
          ingestionRunId: runId,
          source: "noaa_coral_reef_watch",
          sourceStationId: signal.stationId ?? signal.region,
          sourceTimestamp: signal.sourceTimestamp,
          sourceReference: fetched.sourceUrl,
          recordType: "derived_signal",
          recordId: signalId,
          payload: {
            region: signal.region,
            signalType: signal.signalType,
            signalLabel: signal.signalLabel,
            severity: signal.severity,
          },
          createdAt: now,
        });

        insertedRows += 1;
      }
    }

    const finishedAt = nowFn();
    finalizeIngestionRun(db, {
      runId,
      status: "completed",
      finishedAt,
      insertedRows,
      rejectedRows,
    });

    return {
      runId,
      status: rejectedRows > 0 ? "completed_with_rejections" : "completed",
      polledTargets: targets.length,
      insertedRows,
      rejectedRows,
      rejectionReasons,
      finishedAt: new Date(finishedAt).toISOString(),
    };
  } catch {
    const failedAt = nowFn();

    finalizeIngestionRun(db, {
      runId,
      status: "failed",
      finishedAt: failedAt,
      insertedRows,
      rejectedRows,
    });

    return {
      runId,
      status: "failed",
      polledTargets: targets.length,
      insertedRows,
      rejectedRows,
      rejectionReasons,
      finishedAt: new Date(failedAt).toISOString(),
    };
  } finally {
    db.close();
  }
}

~~~


## FILE: apps/api/src/services/ingestion/run-crw.test.ts

~~~

import test from "node:test";
import assert from "node:assert/strict";
import {
  loadConfiguredCrwTargets,
  validateCrwRecord,
} from "./run-crw";
import type { CrwParsedRecord } from "../../connectors/coral-reef-watch/parse";
import type { SqliteDatabaseLike } from "../../db/client";

function createDb(hasDuplicate = false): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all() {
          if (sql.includes("FROM derived_signals") && hasDuplicate) {
            return [{ found: 1 }];
          }

          return [];
        },
        run() {},
      };
    },
    close() {},
  };
}

function baseRecord(overrides: Partial<CrwParsedRecord> = {}): CrwParsedRecord {
  return {
    region: "Great Barrier Reef",
    stationId: null,
    observedAt: Date.parse("2026-03-18T10:00:00.000Z"),
    sstAnomalyC: 1.8,
    hotSpotC: 1.4,
    dhw: 6.2,
    stressLevel: "alert_level_1",
    latitude: -18.2,
    longitude: 147.6,
    raw: {},
    ...overrides,
  };
}

test("loadConfiguredCrwTargets parses region configuration", () => {
  const targets = loadConfiguredCrwTargets({ CRW_TARGET_REGIONS: "Great Barrier Reef,Caribbean" } as NodeJS.ProcessEnv);

  assert.deepEqual(targets, [
    { region: "Great Barrier Reef" },
    { region: "Caribbean" },
  ]);
});

test("validateCrwRecord rejects schema drift when required metrics are missing", () => {
  const reason = validateCrwRecord(
    baseRecord({ dhw: null }),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "schema_drift");
});

test("validateCrwRecord rejects stale timestamps", () => {
  const reason = validateCrwRecord(
    baseRecord(),
    Date.parse("2026-03-20T12:00:00.000Z"),
    6 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "timestamp_stale");
});

test("validateCrwRecord rejects impossible value ranges", () => {
  const reason = validateCrwRecord(
    baseRecord({ hotSpotC: 44 }),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(false),
  );

  assert.equal(reason, "impossible_values");
});

test("validateCrwRecord rejects duplicate records", () => {
  const reason = validateCrwRecord(
    baseRecord(),
    Date.parse("2026-03-18T11:00:00.000Z"),
    24 * 60 * 60 * 1000,
    createDb(true),
  );

  assert.equal(reason, "duplicate_record");
});

~~~


## FILE: apps/api/src/repositories/reef-stress.ts

~~~

import {
  hasDatabasePath,
  openReadOnlyDatabase,
  type SqliteDatabaseLike,
  type SqliteStatementLike,
  resolveDatabasePath,
} from "../db/client";
import type { ReefAlertsFallbackReason } from "../types";
import type { ReefStressWatchItem } from "../../../web/lib/api/types";

interface StationMetricRow {
  metric_type: string;
  metric_value: number | string | null;
}

interface DerivedSignalRow {
  station_id: string | null;
  region_key: string;
  signal_label: string | null;
  observed_at: number | string;
}

export interface StationMetricInsertInput {
  stationId: string | null;
  regionKey: string;
  metricType: "sst_anomaly_c" | "hotspot_c" | "dhw";
  metricValue: number;
  metricUnit: "celsius" | "week";
  source: string;
  observedAt: number;
  ingestionRunId: string;
  sourceTimestamp: string;
  sourceReference: string;
  createdAt: number;
}

export interface DerivedSignalInsertInput {
  stationId: string | null;
  regionKey: string;
  signalType: "reef_bleaching_alert_level";
  signalValue: number | null;
  signalLabel: string | null;
  severity: "low" | "medium" | "high" | "critical";
  source: string;
  observedAt: number;
  ingestionRunId: string;
  sourceTimestamp: string;
  sourceReference: string;
  createdAt: number;
}

interface ReefStressRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
}

export type ReefStressReadResult =
  | { source: "db"; alerts: ReefStressWatchItem[] }
  | { source: "mock"; fallbackReason: ReefAlertsFallbackReason };

function toStatement(db: SqliteDatabaseLike, sql: string): SqliteStatementLike {
  return db.prepare(sql);
}

function runStatement(statement: SqliteStatementLike, ...params: unknown[]) {
  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

function toNumber(value: number | string | null): number | null {
  if (value === null || value === undefined) {
    return null;
  }

  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

function toTimestamp(value: number | string): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  const asNumber = Number(value);
  if (Number.isFinite(asNumber)) {
    return asNumber;
  }

  const parsed = Date.parse(String(value));
  if (Number.isFinite(parsed)) {
    return parsed;
  }

  return Date.now();
}

function signalKey(stationId: string | null, regionKey: string): string {
  return `${stationId ?? "region"}:${regionKey}`;
}

export function ensureStationMetricsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS station_metrics (
        id TEXT PRIMARY KEY,
        station_id TEXT,
        region_key TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        metric_value REAL,
        metric_unit TEXT,
        source TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        ingestion_run_id TEXT NOT NULL,
        source_timestamp TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
  );
}

export function ensureDerivedSignalsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS derived_signals (
        id TEXT PRIMARY KEY,
        station_id TEXT,
        region_key TEXT NOT NULL,
        signal_type TEXT NOT NULL,
        signal_value REAL,
        signal_label TEXT,
        severity TEXT,
        source TEXT NOT NULL,
        observed_at INTEGER NOT NULL,
        ingestion_run_id TEXT NOT NULL,
        source_timestamp TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
  );
}

export function reefStressSnapshotExists(
  db: SqliteDatabaseLike,
  stationId: string | null,
  regionKey: string,
  observedAt: number,
  source: string,
): boolean {
  const rows = toStatement(
    db,
    `SELECT 1 AS found
     FROM derived_signals
     WHERE signal_type = 'reef_bleaching_alert_level'
       AND source = ?
       AND observed_at = ?
       AND region_key = ?
       AND ((station_id = ?) OR (station_id IS NULL AND ? IS NULL))
     LIMIT 1`,
  ).all(source, observedAt, regionKey, stationId, stationId) as Array<{ found?: number }>;

  return rows.length > 0;
}

export function insertStationMetric(db: SqliteDatabaseLike, input: StationMetricInsertInput): string {
  const id = `STM-${input.metricType}-${input.regionKey}-${input.observedAt}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  runStatement(
    toStatement(
      db,
      `INSERT INTO station_metrics (
        id,
        station_id,
        region_key,
        metric_type,
        metric_value,
        metric_unit,
        source,
        observed_at,
        ingestion_run_id,
        source_timestamp,
        source_reference,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    id,
    input.stationId,
    input.regionKey,
    input.metricType,
    input.metricValue,
    input.metricUnit,
    input.source,
    input.observedAt,
    input.ingestionRunId,
    input.sourceTimestamp,
    input.sourceReference,
    input.createdAt,
  );

  return id;
}

export function insertDerivedSignal(db: SqliteDatabaseLike, input: DerivedSignalInsertInput): string {
  const id = `DRS-${input.regionKey}-${input.observedAt}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

  runStatement(
    toStatement(
      db,
      `INSERT INTO derived_signals (
        id,
        station_id,
        region_key,
        signal_type,
        signal_value,
        signal_label,
        severity,
        source,
        observed_at,
        ingestion_run_id,
        source_timestamp,
        source_reference,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    id,
    input.stationId,
    input.regionKey,
    input.signalType,
    input.signalValue,
    input.signalLabel,
    input.severity,
    input.source,
    input.observedAt,
    input.ingestionRunId,
    input.sourceTimestamp,
    input.sourceReference,
    input.createdAt,
  );

  return id;
}

function readMetricsForSnapshot(
  db: SqliteDatabaseLike,
  source: string,
  regionKey: string,
  stationId: string | null,
  observedAt: number,
): Record<string, number | null> {
  const rows = toStatement(
    db,
    `SELECT metric_type, metric_value
     FROM station_metrics
     WHERE source = ?
       AND observed_at = ?
       AND region_key = ?
       AND ((station_id = ?) OR (station_id IS NULL AND ? IS NULL))`,
  ).all(source, observedAt, regionKey, stationId, stationId) as StationMetricRow[];

  const metrics: Record<string, number | null> = {};

  for (const row of rows) {
    metrics[row.metric_type] = toNumber(row.metric_value);
  }

  return metrics;
}

export function readLatestReefStressFromDb(
  db: SqliteDatabaseLike,
  limit = 20,
): ReefStressWatchItem[] {
  const rows = toStatement(
    db,
    `SELECT station_id, region_key, signal_label, observed_at
     FROM derived_signals
     WHERE source = 'noaa_coral_reef_watch'
       AND signal_type = 'reef_bleaching_alert_level'
     ORDER BY observed_at DESC
     LIMIT 200`,
  ).all() as DerivedSignalRow[];

  const latestByKey = new Map<string, DerivedSignalRow>();

  for (const row of rows) {
    const key = signalKey(row.station_id, row.region_key);
    if (!latestByKey.has(key)) {
      latestByKey.set(key, row);
    }
  }

  const snapshots = [...latestByKey.values()].slice(0, limit);

  return snapshots.map((row) => {
    const observedAt = toTimestamp(row.observed_at);
    const metrics = readMetricsForSnapshot(
      db,
      "noaa_coral_reef_watch",
      row.region_key,
      row.station_id,
      observedAt,
    );

    return {
      region: row.region_key,
      stationId: row.station_id,
      timestamp: new Date(observedAt).toISOString(),
      sstAnomalyC: metrics.sst_anomaly_c ?? null,
      hotSpotC: metrics.hotspot_c ?? null,
      dhw: metrics.dhw ?? null,
      stressLevel: row.signal_label,
      source: "noaa_coral_reef_watch",
      outputClass: "derived" as const,
    };
  });
}

export function listLatestReefStress(
  dependencies: ReefStressRepositoryDependencies = {},
): ReefStressReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    return {
      source: "db",
      alerts: readLatestReefStressFromDb(db),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

~~~


## FILE: apps/api/src/repositories/reef-stress.test.ts

~~~

import test from "node:test";
import assert from "node:assert/strict";
import { listLatestReefStress, readLatestReefStressFromDb } from "./reef-stress";
import type { SqliteDatabaseLike } from "../db/client";

function createDatabase(): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (sql.includes("FROM derived_signals")) {
            return [
              {
                station_id: null,
                region_key: "Great Barrier Reef",
                signal_label: "alert_level_1",
                observed_at: Date.parse("2026-03-18T10:00:00.000Z"),
              },
            ];
          }

          if (sql.includes("FROM station_metrics")) {
            const observedAt = Number(params[1]);

            if (!Number.isFinite(observedAt)) {
              return [];
            }

            return [
              { metric_type: "sst_anomaly_c", metric_value: 1.8 },
              { metric_type: "hotspot_c", metric_value: 1.4 },
              { metric_type: "dhw", metric_value: 6.2 },
            ];
          }

          return [];
        },
      };
    },
    close() {},
  };
}

test("readLatestReefStressFromDb builds reef stress snapshots from metrics and signals", () => {
  const rows = readLatestReefStressFromDb(createDatabase(), 20);

  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.region, "Great Barrier Reef");
  assert.equal(rows[0]?.hotSpotC, 1.4);
  assert.equal(rows[0]?.dhw, 6.2);
  assert.equal(rows[0]?.outputClass, "derived");
});

test("listLatestReefStress falls back when database path is missing", () => {
  const result = listLatestReefStress({
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_path_missing" });
});

test("listLatestReefStress returns db source when query succeeds", () => {
  const result = listLatestReefStress({
    resolvePath: () => "reef.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.alerts.length, 1);
  }
});

~~~


## FILE: apps/api/src/routes/reef-alerts.ts

~~~

import { apiMockData } from "../data";
import type {
  ReefAlertsResponse,
  ReefAlertsTelemetry,
  RouteDefinition,
} from "../types";
import type { ReefStressReadResult } from "../repositories/reef-stress";

function readDatabaseReefStress(): ReefStressReadResult {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/reef-stress") as {
      listLatestReefStress: () => ReefStressReadResult;
    };

    return repository.listLatestReefStress();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export function buildReefAlertsRouteResponse(
  readResult = readDatabaseReefStress(),
): { status: number; json: ReefAlertsResponse; telemetry: ReefAlertsTelemetry } {
  if (readResult.source === "db") {
    return {
      status: 200,
      json: {
        alerts: readResult.alerts,
      },
      telemetry: {
        route: "GET /reef-alerts",
        source: "db",
        alertCount: readResult.alerts.length,
      },
    };
  }

  return {
    status: 200,
    json: {
      alerts: apiMockData.reefStressWatchData,
    },
    telemetry: {
      route: "GET /reef-alerts",
      source: "mock",
      alertCount: apiMockData.reefStressWatchData.length,
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export const getReefAlertsRoute: RouteDefinition<ReefAlertsResponse> = {
  method: "GET",
  path: "/reef-alerts",
  handler() {
    return buildReefAlertsRouteResponse();
  },
};

~~~


## FILE: apps/api/src/routes/reef-alerts.test.ts

~~~

import test from "node:test";
import assert from "node:assert/strict";
import { buildReefAlertsRouteResponse } from "./reef-alerts";

test("reef-alerts route returns db-backed reef stress alerts", () => {
  const response = buildReefAlertsRouteResponse({
    source: "db",
    alerts: [
      {
        region: "Great Barrier Reef",
        stationId: null,
        timestamp: "2026-03-18T10:00:00.000Z",
        sstAnomalyC: 1.8,
        hotSpotC: 1.4,
        dhw: 6.2,
        stressLevel: "alert_level_1",
        source: "noaa_coral_reef_watch",
        outputClass: "derived",
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.json.alerts.length, 1);
  assert.equal(response.telemetry.source, "db");
});

test("reef-alerts route falls back to mock reef stress alerts", () => {
  const response = buildReefAlertsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.ok(response.json.alerts.length > 0);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
});

~~~


## FILE: apps/api/src/repositories/provenance.ts

~~~

import type { SqliteDatabaseLike, SqliteStatementLike } from "../db/client";

export interface ProvenanceRecordInput {
  ingestionRunId: string;
  source: string;
  sourceStationId: string;
  sourceTimestamp: string;
  sourceReference: string;
  recordType: "observation" | "station_metric" | "derived_signal";
  recordId: string;
  payload: Record<string, unknown>;
  createdAt: number;
}

function toStatement(db: SqliteDatabaseLike, sql: string): SqliteStatementLike {
  return db.prepare(sql);
}

function runStatement(statement: SqliteStatementLike, ...params: unknown[]) {
  if (typeof statement.run === "function") {
    statement.run(...params);
    return;
  }

  statement.all(...params);
}

export function ensureProvenanceRecordsTable(db: SqliteDatabaseLike) {
  runStatement(
    toStatement(
      db,
      `CREATE TABLE IF NOT EXISTS provenance_records (
        id TEXT PRIMARY KEY,
        ingestion_run_id TEXT NOT NULL,
        source TEXT NOT NULL,
        source_station_id TEXT NOT NULL,
        source_timestamp TEXT NOT NULL,
        source_reference TEXT NOT NULL,
        record_type TEXT NOT NULL,
        record_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      )`,
    ),
  );
}

export function insertProvenanceRecord(db: SqliteDatabaseLike, input: ProvenanceRecordInput): string {
  const provenanceId = `PRV-${input.createdAt}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  runStatement(
    toStatement(
      db,
      `INSERT INTO provenance_records (
        id,
        ingestion_run_id,
        source,
        source_station_id,
        source_timestamp,
        source_reference,
        record_type,
        record_id,
        payload_json,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ),
    provenanceId,
    input.ingestionRunId,
    input.source,
    input.sourceStationId,
    input.sourceTimestamp,
    input.sourceReference,
    input.recordType,
    input.recordId,
    JSON.stringify(input.payload),
    input.createdAt,
  );

  return provenanceId;
}

~~~


## FILE: apps/api/src/routes/index.ts

~~~

import { postAiAnalyzeRoute } from "./ai";
import { getAiLabRoute } from "./ai-lab";
import { getDashboardRoute } from "./dashboard";
import { getLiveConditionsRoute } from "./live-conditions";
import { getReefAlertsRoute } from "./reef-alerts";
import { getDatasetByIdRoute, getDatasetRecordsRoute, getDatasetsRoute } from "./datasets";
import { getInvestigationsRoute } from "./investigations";
import { getInvestigationTimelineRoute, postInvestigationEventRoute } from "./investigation-events";
import {
  getSignalByIdRoute,
  getSignalsRoute,
  postSignalCreateRoute,
  postSignalDismissRoute,
  postSignalPromoteRoute,
} from "./signals";
import {
  getSpeciesByIdRoute,
  getSpeciesMovementSignalsRoute,
  getSpeciesRoute,
  getSpeciesSightingsRoute,
  postSpeciesSightingRoute,
} from "./species";
import { getRegionsRoute } from "./regions";
import { postStationAdminSessionRoute } from "./station-admin-auth";
import {
  getStationAdminAuthEventsExportRoute,
  getStationAdminAuthEventsRoute,
} from "./station-admin-auth-events";
import {
  getStationAdminSecurityAlertsRoute,
  getStationAdminSecuritySummaryRoute,
  getStationAdminSessionsRoute,
} from "./station-admin-security";
import {
  postStationAdminLoginRoute,
  postStationAdminLogoutRoute,
  postStationAdminMfaVerifyRoute,
  postStationAdminRefreshRoute,
  postStationAdminRevokeRoute,
} from "./station-admin-lifecycle";
import {
  postMfaEnrollStartRoute,
  postMfaEnrollVerifyRoute,
  postMfaRecoveryRegenerateRoute,
  postMfaDisableRoute,
} from "./station-admin-mfa";
import {
  getStationAdminRoute,
  getStationAnalyticsRoute,
  getStationByIdRoute,
  getStationsRoute,
  patchStationBrandingRoute,
  patchStationContentRoute,
  patchStationRoute,
  postStationAlertAcknowledgeRoute,
  postStationViewRoute,
} from "./stations";
import {
  getStationEventsRoute,
  getStationEventDetailRoute,
  getStationInvestigationsRoute,
  getStationInvestigationDetailRoute,
  postStationEventAcknowledgeRoute,
} from "./station-events";

export const routeStubs = [
  getAiLabRoute,
  getDashboardRoute,
  getLiveConditionsRoute,
  getReefAlertsRoute,
  getRegionsRoute,
  postStationAdminSessionRoute,
  getStationAdminAuthEventsRoute,
  getStationAdminAuthEventsExportRoute,
  getStationAdminSessionsRoute,
  getStationAdminSecuritySummaryRoute,
  getStationAdminSecurityAlertsRoute,
  postStationAdminLoginRoute,
  postStationAdminLogoutRoute,
  postStationAdminMfaVerifyRoute,
  postStationAdminRefreshRoute,
  postStationAdminRevokeRoute,
  postMfaEnrollStartRoute,
  postMfaEnrollVerifyRoute,
  postMfaRecoveryRegenerateRoute,
  postMfaDisableRoute,
  getDatasetsRoute,
  getDatasetByIdRoute,
  getDatasetRecordsRoute,
  getInvestigationsRoute,
  getInvestigationTimelineRoute,
  postInvestigationEventRoute,
  getSignalsRoute,
  getSignalByIdRoute,
  postSignalCreateRoute,
  postSignalPromoteRoute,
  postSignalDismissRoute,
  getSpeciesRoute,
  getSpeciesByIdRoute,
  getSpeciesSightingsRoute,
  getSpeciesMovementSignalsRoute,
  postSpeciesSightingRoute,
  getStationsRoute,
  getStationByIdRoute,
  getStationAdminRoute,
  patchStationRoute,
  patchStationBrandingRoute,
  patchStationContentRoute,
  getStationAnalyticsRoute,
  postStationViewRoute,
  postStationAlertAcknowledgeRoute,
  postAiAnalyzeRoute,
  getStationEventsRoute,
  getStationEventDetailRoute,
  getStationInvestigationsRoute,
  getStationInvestigationDetailRoute,
  postStationEventAcknowledgeRoute,
] as const;

~~~


## FILE: apps/api/src/index.ts

~~~

export { routeStubs } from "./routes";
export { getDashboardRoute } from "./routes/dashboard";
export { getLiveConditionsRoute } from "./routes/live-conditions";
export { getReefAlertsRoute } from "./routes/reef-alerts";
export { getRegionsRoute } from "./routes/regions";
export { getDatasetsRoute } from "./routes/datasets";
export { getDatasetByIdRoute } from "./routes/datasets";
export { getDatasetRecordsRoute } from "./routes/datasets";
export { getInvestigationsRoute } from "./routes/investigations";
export { getInvestigationTimelineRoute } from "./routes/investigation-events";
export { postInvestigationEventRoute } from "./routes/investigation-events";
export { getSignalsRoute } from "./routes/signals";
export { getSignalByIdRoute } from "./routes/signals";
export { postSignalCreateRoute } from "./routes/signals";
export { postSignalPromoteRoute } from "./routes/signals";
export { postSignalDismissRoute } from "./routes/signals";
export { getSpeciesRoute } from "./routes/species";
export { getSpeciesByIdRoute } from "./routes/species";
export { getSpeciesSightingsRoute } from "./routes/species";
export { getSpeciesMovementSignalsRoute } from "./routes/species";
export { postSpeciesSightingRoute } from "./routes/species";
export { getStationsRoute } from "./routes/stations";
export { getStationByIdRoute } from "./routes/stations";
export { getStationAdminRoute } from "./routes/stations";
export { patchStationRoute } from "./routes/stations";
export { patchStationBrandingRoute } from "./routes/stations";
export { patchStationContentRoute } from "./routes/stations";
export { getStationAnalyticsRoute } from "./routes/stations";
export { postStationViewRoute } from "./routes/stations";
export { getAiLabRoute } from "./routes/ai-lab";
export { postAiAnalyzeRoute } from "./routes/ai";
export { workerStubs } from "./workers";
export { ingestDatasetWorker } from "./workers/ingest-dataset";
export { computeAnomaliesWorker } from "./workers/compute-anomalies";
export { generateReportWorker } from "./workers/generate-report";
export type * from "./types";

~~~


## FILE: apps/api/package.json

~~~

{
  "name": "api",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "typecheck": "tsc -p tsconfig.json --noEmit",
    "test": "npm run build && node --test --test-isolation=none dist/api/src/security/mfa-secret.test.js dist/api/src/connectors/ndbc/parse.test.js dist/api/src/connectors/ndbc/map.test.js dist/api/src/connectors/coral-reef-watch/parse.test.js dist/api/src/connectors/coral-reef-watch/map.test.js dist/api/src/repositories/datasets.test.js dist/api/src/routes/datasets.test.js dist/api/src/repositories/investigations.test.js dist/api/src/routes/investigations.test.js dist/api/src/repositories/investigation-events.test.js dist/api/src/routes/investigation-events.test.js dist/api/src/repositories/signals.test.js dist/api/src/routes/signals.test.js dist/api/src/repositories/dashboard.test.js dist/api/src/routes/dashboard.test.js dist/api/src/repositories/observations.test.js dist/api/src/repositories/reef-stress.test.js dist/api/src/routes/live-conditions.test.js dist/api/src/routes/reef-alerts.test.js dist/api/src/services/ingestion/run-ndbc.test.js dist/api/src/services/ingestion/run-crw.test.js dist/api/src/repositories/regions.test.js dist/api/src/routes/regions.test.js dist/api/src/repositories/stations.test.js dist/api/src/routes/stations.test.js dist/api/src/repositories/station-admin-auth-events.test.js dist/api/src/routes/station-admin-auth-events.test.js dist/api/src/repositories/station-admin-security.test.js dist/api/src/routes/station-admin-security.test.js dist/api/src/repositories/station-admin-lifecycle.test.js dist/api/src/routes/station-admin-lifecycle.test.js dist/api/src/routes/station-admin-mfa.test.js dist/api/src/repositories/ai-lab.test.js dist/api/src/routes/ai-lab.test.js dist/api/src/repositories/species.test.js dist/api/src/routes/species.test.js dist/api/src/repositories/ecological-correlation.test.js dist/api/src/repositories/ocean-map-spatial-overlays.test.js",
    "seed:datasets": "npm run build && node dist/api/src/db/seed-datasets.js"
  }
}

~~~


## FILE: apps/web/lib/api/client.ts

~~~

import {
  aiLabWorkspaceData,
  dataExplorerRelatedRecords,
  dashboardOverviewData,
  dataExplorerWorkspaceData,
  investigationsTimelineFallbackData,
  investigationsWorkspaceData,
  signalDetectionsFallbackData,
  speciesFallbackData,
  speciesMovementSignalsFallbackData,
  speciesSightingsFallbackData,
  oceanStationAnalytics,
  oceanStationDetails,
  oceanStationsData,
  oceanMapWorkspaceData,
  liveMarineConditionsData,
  reefStressWatchData,
} from "@/lib/api/mock-data";
import { getDashboardRoute } from "../../../api/src/routes/dashboard";
import { getLiveConditionsRoute } from "../../../api/src/routes/live-conditions";
import { getReefAlertsRoute } from "../../../api/src/routes/reef-alerts";
import { getDatasetByIdRoute, getDatasetRecordsRoute, getDatasetsRoute } from "../../../api/src/routes/datasets";
import { getInvestigationsRoute } from "../../../api/src/routes/investigations";
import { getInvestigationTimelineRoute, postInvestigationEventRoute } from "../../../api/src/routes/investigation-events";
import {
  getSignalByIdRoute,
  getSignalsRoute,
  postSignalCreateRoute,
  postSignalDismissRoute,
  postSignalPromoteRoute,
} from "../../../api/src/routes/signals";
import {
  getSpeciesByIdRoute,
  getAllSpeciesSightingsRoute,
  getSpeciesMovementSignalsRoute,
  getSpeciesRoute,
  postSpeciesSightingRoute,
} from "../../../api/src/routes/species";
import { getAiLabRoute } from "../../../api/src/routes/ai-lab";
import { getRegionsRoute } from "../../../api/src/routes/regions";
import { postStationAdminSessionRoute } from "../../../api/src/routes/station-admin-auth";
import {
  getStationAdminAuthEventsExportRoute,
  getStationAdminAuthEventsRoute,
} from "../../../api/src/routes/station-admin-auth-events";
import {
  getStationAdminSecurityAlertsRoute,
  getStationAdminSecuritySummaryRoute,
  getStationAdminSessionsRoute,
} from "../../../api/src/routes/station-admin-security";
import {
  postStationAdminLoginRoute,
  postStationAdminLogoutRoute,
  postStationAdminMfaVerifyRoute,
  postStationAdminRefreshRoute,
  postStationAdminRevokeRoute,
} from "../../../api/src/routes/station-admin-lifecycle";
import {
  postMfaEnrollStartRoute,
  postMfaEnrollVerifyRoute,
  postMfaRecoveryRegenerateRoute,
  postMfaDisableRoute,
} from "../../../api/src/routes/station-admin-mfa";
import {
  getStationAdminAuditRoute,
  getStationAdminRoute,
  getStationAnalyticsRoute,
  getStationByIdRoute,
  getStationsRoute,
  patchStationBrandingRoute,
  patchStationContentRoute,
  patchStationRoute,
  postStationAlertAcknowledgeRoute,
  postStationViewRoute,
} from "../../../api/src/routes/stations";
import {
  getStationEventsRoute,
  getStationEventDetailRoute,
  getStationInvestigationsRoute,
  getStationInvestigationDetailRoute,
  postStationEventAcknowledgeRoute,
} from "../../../api/src/routes/station-events";
import { postAiAnalyzeRoute } from "../../../api/src/routes/ai";
import type { AnalyzeRequestBody } from "../../../api/src/types";
import type {
  InvestigationEventCreateResponse,
  InvestigationEventCreateTelemetry,
  InvestigationTimelineResponse,
  InvestigationTimelineTelemetry,
  SignalCreateRequest,
  SignalCreateResponse,
  SignalCreateTelemetry,
  SignalDetailResponse,
  SignalDetailTelemetry,
  SignalDismissResponse,
  SignalDismissTelemetry,
  SignalPromoteResponse,
  SignalPromoteTelemetry,
  SignalsListResponse,
  SignalsListTelemetry,
  SpeciesDetailResponse,
  SpeciesDetailTelemetry,
  SpeciesListResponse,
  SpeciesListTelemetry,
  SpeciesMovementSignalsResponse,
  SpeciesMovementSignalsTelemetry,
  SpeciesSightingCreateRequest,
  SpeciesSightingCreateResponse,
  SpeciesSightingCreateTelemetry,
  SpeciesSightingsResponse,
  SpeciesSightingsTelemetry,
  DatasetDetailTelemetry,
  DatasetRecordsTelemetry,
  DatasetsTelemetry,
  OceanStationAdminTelemetry,
  OceanStationAdminAuditTelemetry,
  OceanStationAnalyticsTelemetry,
  StationAdminAuthEventsExportResponse,
  StationAdminAuthEventsExportTelemetry,
  StationAdminAuthEventsResponse,
  StationAdminAuthEventsTelemetry,
  StationAdminSecurityAlertsResponse,
  StationAdminSecurityAlertsTelemetry,
  StationAdminSecuritySummaryResponse,
  StationAdminSecuritySummaryTelemetry,
  StationAdminLoginResponse,
  StationAdminLoginTelemetry,
  StationAdminMfaVerifyResponse,
  StationAdminMfaVerifyErrorResponse,
  StationAdminMfaVerifyTelemetry,
  StationAdminLogoutResponse,
  StationAdminLogoutTelemetry,
  StationAdminRefreshResponse,
  StationAdminRefreshTelemetry,
  StationAdminRevokeMfaRequiredResponse,
  StationAdminRevokeResponse,
  StationAdminRevokeTelemetry,
  StationAdminSessionAuthTelemetry,
  StationAdminSessionsResponse,
  StationAdminSessionsTelemetry,
  StationAlertAcknowledgeResponse,
  StationAlertAcknowledgeTelemetry,
  StationEventAcknowledgeResponse,
  StationEventAcknowledgeTelemetry,
  StationPatchTelemetry,
  StationViewTrackTelemetry,
  StationEventsListTelemetry,
  StationEventDetailTelemetry,
  StationInvestigationsListTelemetry,
  StationInvestigationDetailTelemetry,
  StationEventListResponse,
  StationEventDetailResponse,
  StationInvestigationListResponse,
  StationInvestigationDetailResponse,
  LiveConditionsResponse,
  LiveConditionsTelemetry,
  ReefAlertsResponse,
  ReefAlertsTelemetry,
} from "../../../api/src/types";
import type {
  OceanStationAdminAuthContext,
  OceanStationAdminAuditEntry,
  StationAdminAuthEvent,
  StationAdminAuthEventFilters,
  StationAdminAuthEventExportPayload,
  StationAdminAuthEventPage,
  StationAdminSecurityAlert,
  StationAdminSecuritySummary,
  OceanStationAdminBrandingPatch,
  OceanStationAdminContentPatch,
  OceanStationAdminPatch,
  OceanStationAlert,
  OceanStationAnalytics,
  OceanStationDetail,
  OceanStationViewType,
  StationAdminRequestMetadata,
  StationAdminMfaChallenge,
  StationAdminMfaEnrollmentState,
  StationAdminSessionSummary,
  StationAdminSessionsQuery,
  DataExplorerDatasetDetail,
  DataExplorerDatasetFilters,
  DataExplorerDatasetSortBy,
  DataExplorerDatasetDetailFetchResult,
  DataExplorerFetchMeta,
  DataExplorerPageInfo,
  DataExplorerRelatedRecord,
  DataExplorerRelatedRecordsFetchResult,
  DataExplorerRelatedRecordsQuery,
  DataExplorerRelatedRecordsResult,
  DataExplorerSortDirection,
  DataExplorerWorkspaceFetchResult,
  InvestigationTimelineFilters,
  InvestigationTimelineItem,
  CreateSignalInput,
  PromoteSignalInput,
  CreateSpeciesSightingInput,
  RecordInvestigationEventInput,
  SignalDetection,
  SignalFilters,
  SpeciesFilters,
  SpeciesMovementSignalFilters,
  SpeciesMovementSignal,
  SpeciesProfile,
  SpeciesSighting,
  SpeciesSightingFilters,
  LiveMarineCondition,
  ReefStressWatchItem,
  StationEventFilters,
  StationInvestigationFilters,
  StationEventListItem,
  StationEventDetail,
  StationInvestigationSummary,
  StationInvestigationDetail,
} from "@/lib/api/types";

function nowIso() {
  return new Date().toISOString();
}

function cloneAnalytics(analytics: OceanStationAnalytics): OceanStationAnalytics {
  return {
    stationId: analytics.stationId,
    views: { ...analytics.views },
    lastViewedAt: analytics.lastViewedAt,
  };
}

function findMockStation(stationId: string): OceanStationDetail | null {
  if (oceanStationDetails[stationId]) {
    return oceanStationDetails[stationId];
  }

  return Object.values(oceanStationDetails).find((station) => station.slug === stationId) ?? null;
}

function syncMockStationSummary(station: OceanStationDetail) {
  const summaryIndex = oceanStationsData.findIndex((item) => item.id === station.id);

  if (summaryIndex === -1) {
    return;
  }

  oceanStationsData[summaryIndex] = {
    id: station.id,
    slug: station.slug,
    name: station.name,
    region: station.region,
    status: station.status,
    summary: station.summary,
    locationLabel: station.locationLabel,
    depthM: station.depthM,
    lastReported: station.lastReported,
    heroMetric: station.heroMetric,
    branding: { ...station.branding },
  };
}

function applyMockStationPatch(stationId: string, patch: OceanStationAdminPatch): OceanStationDetail | null {
  const station = findMockStation(stationId);

  if (!station) {
    return null;
  }

  if (patch.sponsorName !== undefined) {
    station.branding.sponsorName = patch.sponsorName;
  }

  if (patch.operatorName !== undefined) {
    station.branding.operatorName = patch.operatorName;
  }

  if (patch.exhibitTitle !== undefined) {
    station.branding.exhibitTitle = patch.exhibitTitle;
  }

  if (patch.publicDescription !== undefined) {
    station.branding.publicDescription = patch.publicDescription;
  }

  if (patch.accentColor !== undefined) {
    station.branding.accentColor = patch.accentColor;
  }

  if (patch.species !== undefined) {
    station.species = patch.species.map((item, index) => ({
      id: `SPC-${station.id}-${String(index + 1).padStart(3, "0")}`,
      name: item.name,
      status: item.status,
      populationTrend: item.populationTrend,
      notes: item.notes,
      observedAt: "Just now",
    }));
  }

  if (patch.alerts !== undefined) {
    station.alerts = patch.alerts.map((item, index) => ({
      id: `STA-ALT-${station.id}-${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      severity: item.severity,
      status: item.status,
      detail: item.detail,
      detectedAt: "Just now",
      acknowledgedAt: null,
      acknowledgedBy: null,
    }));
  }

  if (patch.timeline !== undefined) {
    station.timeline = patch.timeline.map((item, index) => ({
      id: `STL-${station.id}-${String(index + 1).padStart(3, "0")}`,
      label: item.label,
      phase: item.phase,
      detail: item.detail,
      happenedAt: "Just now",
    }));
  }

  if (patch.content !== undefined) {
    station.content = patch.content.map((item, index) => ({
      id: `CNT-${station.id}-${String(index + 1).padStart(3, "0")}`,
      contentType: item.contentType,
      title: item.title,
      summary: item.summary,
      href: item.href ?? null,
      publishedAt: "Just now",
    }));
  }

  syncMockStationSummary(station);
  return station;
}

function buildFetchMeta(
  section: DataExplorerFetchMeta["section"],
  startedAtMs: number,
  options: Omit<DataExplorerFetchMeta, "section" | "startedAt" | "finishedAt" | "durationMs">,
): DataExplorerFetchMeta {
  const finishedAtMs = Date.now();

  return {
    section,
    startedAt: new Date(startedAtMs).toISOString(),
    finishedAt: new Date(finishedAtMs).toISOString(),
    durationMs: finishedAtMs - startedAtMs,
    ...options,
  };
}

function logDataExplorerFetch(meta: DataExplorerFetchMeta) {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.debug(`[DataExplorer:${meta.section}]`, meta);
}

type HandlerResult<TJson, TTelemetry> = {
  status: number;
  json: TJson;
  telemetry?: TTelemetry;
};

type AuthMutationResult<TData> =
  | { ok: true; status: number; data: TData }
  | { ok: false; status: number; message: string };

type RevokeSessionResult =
  | { ok: true; status: number }
  | {
      ok: false;
      status: number;
      message: string;
      mfaRequired: true;
      challenge: StationAdminMfaChallenge;
    }
  | {
      ok: false;
      status: number;
      message: string;
      mfaRequired?: false;
    };

function readRouteErrorMessage(payload: unknown, fallbackMessage: string): string {
  if (payload && typeof payload === "object" && "message" in payload) {
    const message = (payload as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message;
    }
  }

  return fallbackMessage;
}

function normalizeDatasetFilters(filters: DataExplorerDatasetFilters = {}): DataExplorerDatasetFilters {
  return {
    q: filters.q?.trim() || undefined,
    category: filters.category?.trim() || undefined,
    region: filters.region?.trim() || undefined,
    status: filters.status?.trim() || undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

function filterMockWorkspace(filters: DataExplorerDatasetFilters) {
  const normalized = {
    q: filters.q?.toLowerCase(),
    category: filters.category?.toLowerCase(),
    region: filters.region?.toLowerCase(),
    status: filters.status?.toLowerCase(),
  };
  const sortBy: DataExplorerDatasetSortBy = filters.sortBy ?? "updated";
  const sortDir: DataExplorerSortDirection = filters.sortDir ?? "desc";
  const page = filters.page ?? 1;
  const pageSize = filters.pageSize ?? 25;

  const filtered = dataExplorerWorkspaceData.datasets.filter((dataset) => {
      const name = dataset.name.toLowerCase();
      const category = dataset.category.toLowerCase();
      const region = dataset.region.toLowerCase();
      const status = dataset.status.toLowerCase();

      if (normalized.q && !name.includes(normalized.q) && !category.includes(normalized.q)) {
        return false;
      }

      if (normalized.category && category !== normalized.category) {
        return false;
      }

      if (normalized.region && region !== normalized.region) {
        return false;
      }

      if (normalized.status && status !== normalized.status) {
        return false;
      }

      return true;
    });
  const parseCount = (value: string) =>
    value.endsWith("M") ? Number.parseFloat(value) * 1_000_000 : value.endsWith("K") ? Number.parseFloat(value) * 1_000 : Number.parseFloat(value);
  const rankUpdated = (value: string) =>
    value.includes("min") ? Number.parseInt(value, 10) : value.includes("hr") ? Number.parseInt(value, 10) * 60 : value.includes("day") ? Number.parseInt(value, 10) * 1440 : 0;
  const sorted = [...filtered].sort((left, right) => {
    let comparison = 0;
    if (sortBy === "name") comparison = left.name.localeCompare(right.name);
    else if (sortBy === "status") comparison = left.status.localeCompare(right.status);
    else if (sortBy === "records") comparison = parseCount(left.records) - parseCount(right.records);
    else {
      comparison = rankUpdated(left.updated) - rankUpdated(right.updated);
      comparison *= -1;
    }
    if (comparison === 0) comparison = left.name.localeCompare(right.name);
    return comparison * (sortDir === "asc" ? 1 : -1);
  });
  const totalItems = sorted.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;
  const datasets = sorted.slice(offset, offset + pageSize);
  const pageInfo: DataExplorerPageInfo = {
    page,
    pageSize,
    totalItems,
    totalPages,
    sortBy,
    sortDir,
  };

  return {
    ...dataExplorerWorkspaceData,
    datasets,
    pageInfo,
  };
}

function filterMockRelatedRecords(
  datasetId: string,
  query: DataExplorerRelatedRecordsQuery = {},
): DataExplorerRelatedRecordsResult | null {
  const datasetExists = dataExplorerWorkspaceData.datasets.some((dataset) => dataset.id === datasetId);

  if (!datasetExists) {
    return null;
  }
  const records = dataExplorerRelatedRecords[datasetId] ?? [];

  const sortBy = query.sortBy ?? "updated";
  const sortDir = query.sortDir ?? "desc";
  const page = query.page ?? 1;
  const pageSize = query.pageSize ?? 5;
  const rankUpdated = (value: string) =>
    value.includes("min")
      ? Number.parseInt(value, 10)
      : value.includes("hr")
        ? Number.parseInt(value, 10) * 60
        : value.includes("day")
          ? Number.parseInt(value, 10) * 1440
          : 0;
  const sorted = [...records].sort((left, right) => {
    let comparison = 0;
    if (sortBy === "status") comparison = left.status.localeCompare(right.status);
    else if (sortBy === "title") comparison = left.title.localeCompare(right.title);
    else if (sortBy === "type") comparison = left.type.localeCompare(right.type);
    else {
      comparison = rankUpdated(left.updated) - rankUpdated(right.updated);
      comparison *= -1;
    }
    if (comparison === 0) comparison = left.title.localeCompare(right.title);
    return comparison * (sortDir === "asc" ? 1 : -1);
  });
  const totalItems = sorted.length;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  const offset = (page - 1) * pageSize;

  return {
    records: sorted.slice(offset, offset + pageSize),
    pageInfo: {
      page,
      pageSize,
      totalItems,
      totalPages,
      sortBy,
      sortDir,
    },
  };
}

export const apiClient = {
  stationAdminAuth: {
    async getSession(sessionId: string): Promise<OceanStationAdminAuthContext | null> {
      const normalizedSessionId = sessionId.trim();

      if (!normalizedSessionId) {
        return null;
      }

      try {
        const response = postStationAdminSessionRoute.handler({ body: { sessionId: normalizedSessionId } }) as HandlerResult<
          { auth: OceanStationAdminAuthContext } | { message: string },
          StationAdminSessionAuthTelemetry
        >;

        if (response.status !== 200 || !("auth" in response.json)) {
          return null;
        }

        return response.json.auth;
      } catch {
        return null;
      }
    },

    async login(
      actorId: string,
      password: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<AuthMutationResult<StationAdminLoginResponse>> {
      try {
        const response = postStationAdminLoginRoute.handler({
          body: { actorId, password, metadata },
        }) as HandlerResult<StationAdminLoginResponse | { message: string }, StationAdminLoginTelemetry>;

        if (
          (response.status === 200 && "sessionId" in response.json)
          || (response.status === 202 && "result" in response.json && response.json.result === "pending_mfa")
        ) {
          return {
            ok: true,
            status: response.status,
            data: response.json as StationAdminLoginResponse,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: readRouteErrorMessage(response.json, "Authentication failed"),
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "Authentication failed",
        };
      }
    },

    async verifyMfaChallenge(
      challengeId: string,
      options: {
        code?: string;
        recoveryCode?: string;
        sessionId?: string;
        csrfToken?: string;
        metadata?: StationAdminRequestMetadata;
      },
    ): Promise<
      | { ok: true; status: number; data: StationAdminMfaVerifyResponse }
      | { ok: false; status: number; message: string; error?: StationAdminMfaVerifyErrorResponse }
    > {
      try {
        const response = postStationAdminMfaVerifyRoute.handler({
          body: {
            challengeId,
            code: options.code,
            recoveryCode: options.recoveryCode,
            sessionId: options.sessionId,
            csrfToken: options.csrfToken,
            metadata: options.metadata,
          },
        }) as HandlerResult<
          StationAdminMfaVerifyResponse | StationAdminMfaVerifyErrorResponse | { message: string },
          StationAdminMfaVerifyTelemetry
        >;

        if (
          response.status === 200
          && "result" in response.json
          && (response.json.result === "issued" || response.json.result === "verified")
        ) {
          return {
            ok: true,
            status: response.status,
            data: response.json as StationAdminMfaVerifyResponse,
          };
        }

        const routeMessage = readRouteErrorMessage(response.json, "MFA verification failed");

        if (
          "result" in response.json
          && typeof response.json.result === "string"
          && "message" in response.json
          && typeof response.json.message === "string"
        ) {
          return {
            ok: false,
            status: response.status,
            message: routeMessage,
            error: response.json as StationAdminMfaVerifyErrorResponse,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: routeMessage,
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "MFA verification failed",
        };
      }
    },

    async logout(
      sessionId: string,
      csrfToken: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<boolean> {
      try {
        const response = postStationAdminLogoutRoute.handler({
          body: { sessionId, csrfToken, metadata },
        }) as HandlerResult<StationAdminLogoutResponse | { message: string }, StationAdminLogoutTelemetry>;

        return response.status === 200 && "ok" in response.json && response.json.ok === true;
      } catch {
        return false;
      }
    },

    async refreshSession(
      sessionId: string,
      csrfToken: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<{ sessionId: string; csrfToken: string; expiresAt: string } | null> {
      try {
        const response = postStationAdminRefreshRoute.handler({
          body: { sessionId, csrfToken, metadata },
        }) as HandlerResult<StationAdminRefreshResponse | { message: string }, StationAdminRefreshTelemetry>;

        if (response.status !== 200 || !("sessionId" in response.json)) {
          return null;
        }

        return response.json as StationAdminRefreshResponse;
      } catch {
        return null;
      }
    },

    async revokeSession(
      sessionId: string,
      csrfToken: string,
      targetSessionId: string,
      metadata?: StationAdminRequestMetadata,
    ): Promise<RevokeSessionResult> {
      try {
        const response = postStationAdminRevokeRoute.handler({
          body: { sessionId, csrfToken, targetSessionId, metadata },
        }) as HandlerResult<StationAdminRevokeResponse | StationAdminRevokeMfaRequiredResponse | { message: string }, StationAdminRevokeTelemetry>;

        if (response.status === 200 && "ok" in response.json && response.json.ok === true) {
          return {
            ok: true,
            status: response.status,
          };
        }

        if (response.status === 401 && "mfaRequired" in response.json && response.json.mfaRequired === true) {
          return {
            ok: false,
            status: response.status,
            message: "MFA verification required",
            mfaRequired: true,
            challenge: response.json.challenge,
          };
        }

        return {
          ok: false,
          status: response.status,
          message: readRouteErrorMessage(response.json, "Revoke failed"),
          mfaRequired: false,
        };
      } catch {
        return {
          ok: false,
          status: 503,
          message: "Revoke failed",
          mfaRequired: false,
        };
      }
    },

    async getEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEvent[] | null> {
      const page = await apiClient.stationAdminAuth.queryEvents(filters, auth);

      return page?.events ?? null;
    },

    async queryEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEventPage | null> {
      try {
        const response = getStationAdminAuthEventsRoute.handler({ body: undefined, query: filters, auth }) as HandlerResult<
          StationAdminAuthEventsResponse | { message: string },
          StationAdminAuthEventsTelemetry
        >;

        if (response.status !== 200 || !("events" in response.json)) {
          return null;
        }

        return {
          events: response.json.events,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return {
          events: [],
          nextCursor: null,
        };
      }
    },

    async exportEvents(
      filters: StationAdminAuthEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminAuthEventExportPayload | null> {
      try {
        const response = getStationAdminAuthEventsExportRoute.handler({ body: undefined, query: filters, auth }) as HandlerResult<
          StationAdminAuthEventsExportResponse | { message: string },
          StationAdminAuthEventsExportTelemetry
        >;

        if (response.status !== 200 || !("export" in response.json)) {
          return null;
        }

        return response.json.export;
      } catch {
        return null;
      }
    },

    async getSessions(
      query: StationAdminSessionsQuery = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSessionSummary[] | null> {
      try {
        const response = getStationAdminSessionsRoute.handler({ body: undefined, query, auth }) as HandlerResult<
          StationAdminSessionsResponse | { message: string },
          StationAdminSessionsTelemetry
        >;

        if (response.status !== 200 || !("sessions" in response.json)) {
          return null;
        }

        return response.json.sessions;
      } catch {
        return [];
      }
    },

    async getSecuritySummary(
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSecuritySummary | null> {
      try {
        const response = getStationAdminSecuritySummaryRoute.handler({ body: undefined, auth }) as HandlerResult<
          StationAdminSecuritySummaryResponse | { message: string },
          StationAdminSecuritySummaryTelemetry
        >;

        if (response.status !== 200 || !("summary" in response.json)) {
          return null;
        }

        return response.json.summary;
      } catch {
        return null;
      }
    },

    async getSecurityAlerts(
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationAdminSecurityAlert[] | null> {
      try {
        const response = getStationAdminSecurityAlertsRoute.handler({ body: undefined, auth }) as HandlerResult<
          StationAdminSecurityAlertsResponse | { message: string },
          StationAdminSecurityAlertsTelemetry
        >;

        if (response.status !== 200 || !("alerts" in response.json)) {
          return null;
        }

        return response.json.alerts;
      } catch {
        return [];
      }
    },
  },
  stationAdminMfa: {
    async enrollStart(
      sessionId: string,
      csrfToken: string,
    ): Promise<{ ok: true; qrCodeUri: string; secret: string } | { ok: false; status: number; message: string }> {
      try {
        const response = postMfaEnrollStartRoute.handler({ body: { sessionId, csrfToken } }) as HandlerResult<
          { qrCodeUri: string; secret: string } | { message: string },
          never
        >;

        if (response.status === 200 && "qrCodeUri" in response.json) {
          return { ok: true, qrCodeUri: response.json.qrCodeUri, secret: response.json.secret };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Enrollment start failed") };
      } catch {
        return { ok: false, status: 503, message: "Enrollment start failed" };
      }
    },

    async enrollVerify(
      sessionId: string,
      csrfToken: string,
      totpCode: string,
    ): Promise<
      | { ok: true; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
      | { ok: false; status: number; message: string }
    > {
      try {
        const response = postMfaEnrollVerifyRoute.handler({ body: { sessionId, csrfToken, totpCode } }) as HandlerResult<
          { result: "enrolled"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] } | { message: string },
          never
        >;

        if (response.status === 200 && "result" in response.json && (response.json as { result?: string }).result === "enrolled") {
          const r = response.json as { result: "enrolled"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] };
          return { ok: true, mfa: r.mfa, recoveryCodes: r.recoveryCodes };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Enrollment verification failed") };
      } catch {
        return { ok: false, status: 503, message: "Enrollment verification failed" };
      }
    },

    async recoveryRegenerate(
      sessionId: string,
      csrfToken: string,
    ): Promise<
      | { ok: true; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
      | { ok: false; status: number; message: string; mfaRequired?: boolean; challenge?: StationAdminMfaChallenge }
    > {
      try {
        const response = postMfaRecoveryRegenerateRoute.handler({ body: { sessionId, csrfToken } }) as HandlerResult<
          | { result: "regenerated"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] }
          | { mfaRequired: true; challenge: StationAdminMfaChallenge }
          | { message: string },
          never
        >;

        if (response.status === 200 && "result" in response.json && (response.json as { result?: string }).result === "regenerated") {
          const r = response.json as { result: "regenerated"; mfa: StationAdminMfaEnrollmentState; recoveryCodes: string[] };
          return { ok: true, mfa: r.mfa, recoveryCodes: r.recoveryCodes };
        }

        if (response.status === 401 && "mfaRequired" in response.json && (response.json as { mfaRequired?: boolean }).mfaRequired === true) {
          const r = response.json as { mfaRequired: true; challenge: StationAdminMfaChallenge };
          return { ok: false, status: 401, message: "MFA step-up required", mfaRequired: true, challenge: r.challenge };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "Recovery code regeneration failed") };
      } catch {
        return { ok: false, status: 503, message: "Recovery code regeneration failed" };
      }
    },

    async disable(
      sessionId: string,
      csrfToken: string,
      totpCode: string,
    ): Promise<
      | { ok: true }
      | { ok: false; status: number; message: string; mfaRequired?: boolean; challenge?: StationAdminMfaChallenge }
    > {
      try {
        const response = postMfaDisableRoute.handler({ body: { sessionId, csrfToken, totpCode } }) as HandlerResult<
          | { ok: true }
          | { mfaRequired: true; challenge: StationAdminMfaChallenge }
          | { message: string },
          never
        >;

        if (response.status === 200 && "ok" in response.json && (response.json as { ok?: boolean }).ok === true) {
          return { ok: true };
        }

        if (response.status === 401 && "mfaRequired" in response.json && (response.json as { mfaRequired?: boolean }).mfaRequired === true) {
          const r = response.json as { mfaRequired: true; challenge: StationAdminMfaChallenge };
          return { ok: false, status: 401, message: "MFA step-up required", mfaRequired: true, challenge: r.challenge };
        }

        return { ok: false, status: response.status, message: readRouteErrorMessage(response.json, "MFA disable failed") };
      } catch {
        return { ok: false, status: 503, message: "MFA disable failed" };
      }
    },
  },

  dashboard: {
    async getOverview() {
      try {
        return getDashboardRoute.handler({ body: undefined }).json;
      } catch {
        return dashboardOverviewData;
      }
    },
  },
  liveConditions: {
    async getLatest(): Promise<LiveMarineCondition[]> {
      try {
        const response = getLiveConditionsRoute.handler({ body: undefined }) as HandlerResult<
          LiveConditionsResponse,
          LiveConditionsTelemetry
        >;

        return response.json.conditions;
      } catch {
        return liveMarineConditionsData;
      }
    },
  },
  reefAlerts: {
    async getLatest(): Promise<ReefStressWatchItem[]> {
      try {
        const response = getReefAlertsRoute.handler({ body: undefined }) as HandlerResult<
          ReefAlertsResponse,
          ReefAlertsTelemetry
        >;

        return response.json.alerts;
      } catch {
        return reefStressWatchData;
      }
    },
  },
  investigations: {
    async getWorkspace() {
      try {
        const workspace = getInvestigationsRoute.handler({ body: undefined }).json.workspace;
        const activeInvestigationId = workspace.analysisTracks[0]?.id;

        if (!activeInvestigationId) {
          return {
            ...workspace,
            timeline: [],
          };
        }

        const timelineResponse = getInvestigationTimelineRoute.handler({
          body: { id: activeInvestigationId },
          query: { limit: 50 },
        }) as HandlerResult<InvestigationTimelineResponse, InvestigationTimelineTelemetry>;

        return {
          ...workspace,
          timeline: timelineResponse.json.timeline,
        };
      } catch {
        return {
          ...investigationsWorkspaceData,
          timeline: investigationsTimelineFallbackData,
        };
      }
    },

    async getTimeline(
      investigationId: string,
      filters: InvestigationTimelineFilters = {},
    ): Promise<InvestigationTimelineItem[]> {
      try {
        const response = getInvestigationTimelineRoute.handler({
          body: { id: investigationId },
          query: filters,
        }) as HandlerResult<InvestigationTimelineResponse, InvestigationTimelineTelemetry>;

        return response.json.timeline;
      } catch {
        const eventType = filters.eventType;
        const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
        const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;
        const filtered = eventType
          ? investigationsTimelineFallbackData.filter((item) => item.eventType === eventType)
          : investigationsTimelineFallbackData;

        return filtered.slice(0, boundedLimit);
      }
    },

    async recordEvent(
      investigationId: string,
      input: RecordInvestigationEventInput,
    ): Promise<InvestigationTimelineItem | null> {
      try {
        const response = postInvestigationEventRoute.handler({
          body: {
            id: investigationId,
            eventType: input.eventType,
            source: input.source,
            actor: input.actor,
            summary: input.summary,
            detail: input.detail,
            confidence: input.confidence,
          },
        }) as HandlerResult<InvestigationEventCreateResponse | { message: string }, InvestigationEventCreateTelemetry>;

        if (response.status !== 201 || !("event" in response.json)) {
          return null;
        }

        return response.json.event;
      } catch {
        return null;
      }
    },
  },
  signals: {
    async list(filters: SignalFilters = {}): Promise<SignalDetection[]> {
      try {
        const response = getSignalsRoute.handler({
          body: undefined,
          query: {
            signalType: filters.signalType,
            severity: filters.severity,
            status: filters.status,
            region: filters.region,
            stationId: filters.stationId,
            limit: filters.limit,
          },
        }) as HandlerResult<SignalsListResponse, SignalsListTelemetry>;

        return response.json.signals;
      } catch {
        const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
        const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

        return signalDetectionsFallbackData
          .filter((signal) => {
            if (filters.signalType && signal.signalType !== filters.signalType) {
              return false;
            }

            if (filters.severity && signal.severity !== filters.severity) {
              return false;
            }

            if (filters.status && signal.status !== filters.status) {
              return false;
            }

            if (filters.region && signal.region.toLowerCase() !== filters.region.trim().toLowerCase()) {
              return false;
            }

            if (filters.stationId && signal.stationId !== filters.stationId) {
              return false;
            }

            return true;
          })
          .sort((left, right) => new Date(right.detectedAt).getTime() - new Date(left.detectedAt).getTime())
          .slice(0, boundedLimit);
      }
    },

    async getById(signalId: string): Promise<SignalDetection | null> {
      try {
        const response = getSignalByIdRoute.handler({ body: { id: signalId } }) as HandlerResult<
          SignalDetailResponse | { message: string },
          SignalDetailTelemetry
        >;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return signalDetectionsFallbackData.find((signal) => signal.id === signalId) ?? null;
      }
    },

    async create(input: CreateSignalInput): Promise<SignalDetection | null> {
      try {
        const response = postSignalCreateRoute.handler({ body: input as SignalCreateRequest }) as HandlerResult<
          SignalCreateResponse | { message: string },
          SignalCreateTelemetry
        >;

        if (response.status !== 201 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },

    async promote(signalId: string, input: PromoteSignalInput): Promise<SignalDetection | null> {
      try {
        const response = postSignalPromoteRoute.handler({
          body: {
            id: signalId,
            investigationId: input.investigationId,
            actor: input.actor,
          },
        }) as HandlerResult<SignalPromoteResponse | { message: string }, SignalPromoteTelemetry>;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },

    async dismiss(signalId: string, actor?: string): Promise<SignalDetection | null> {
      try {
        const response = postSignalDismissRoute.handler({
          body: {
            id: signalId,
            actor,
          },
        }) as HandlerResult<SignalDismissResponse | { message: string }, SignalDismissTelemetry>;

        if (response.status !== 200 || !("signal" in response.json)) {
          return null;
        }

        return response.json.signal;
      } catch {
        return null;
      }
    },
  },
  species: {
    async list(filters: SpeciesFilters = {}): Promise<SpeciesProfile[]> {
      try {
        const response = getSpeciesRoute.handler({
          body: undefined,
          query: {
            region: filters.region,
            conservationStatus: filters.conservationStatus,
            limit: filters.limit,
          },
        }) as HandlerResult<SpeciesListResponse | { message: string }, SpeciesListTelemetry>;

        if (response.status !== 200 || !("species" in response.json)) {
          return [];
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.species;
      } catch {
        return [];
      }
    },

    async getById(speciesId: string): Promise<SpeciesProfile | null> {
      try {
        const response = getSpeciesByIdRoute.handler({ body: { id: speciesId } }) as HandlerResult<
          SpeciesDetailResponse | { message: string },
          SpeciesDetailTelemetry
        >;

        if (response.status !== 200 || !("species" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return null;
        }

        return response.json.species;
      } catch {
        return null;
      }
    },

    async listSightings(filters: SpeciesSightingFilters = {}): Promise<SpeciesSighting[]> {
      if (filters.speciesId) {
        const bySpecies = await apiClient.species.getSightingsBySpecies(filters.speciesId, {
          region: filters.region,
          stationId: filters.stationId,
          verificationStatus: filters.verificationStatus,
          limit: filters.limit,
        });

        return bySpecies ?? [];
      }

      const species = await apiClient.species.list({ limit: 25 });

      if (species.length === 0) {
        return [];
      }

      const sightingsGroups = await Promise.all(
        species.map((entry) =>
          apiClient.species.getSightingsBySpecies(entry.id, {
            region: filters.region,
            stationId: filters.stationId,
            verificationStatus: filters.verificationStatus,
            limit: filters.limit ?? 8,
          }),
        ),
      );

      const merged = sightingsGroups
        .flatMap((group) => group ?? [])
        .sort((left, right) => new Date(right.observedAt).getTime() - new Date(left.observedAt).getTime());

      const limit = typeof filters.limit === "number" ? filters.limit : Number(filters.limit ?? 50);
      const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(Math.floor(limit), 200) : 50;

      return merged.slice(0, boundedLimit);
    },

    async getSightingsBySpecies(
      speciesId: string,
      filters: Omit<SpeciesSightingFilters, "speciesId"> = {},
    ): Promise<SpeciesSighting[] | null> {
      try {
        const response = getAllSpeciesSightingsRoute.handler({
          body: { id: speciesId },
          query: {
            region: filters.region,
            stationId: filters.stationId,
            verificationStatus: filters.verificationStatus,
            limit: filters.limit,
          },
        }) as HandlerResult<SpeciesSightingsResponse | { message: string }, SpeciesSightingsTelemetry>;

        if (response.status === 404) {
          return null;
        }

        if (response.status !== 200 || !("sightings" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.sightings;
      } catch {
        return null;
      }
    },

    async createSighting(
      input: CreateSpeciesSightingInput,
      auth?: OceanStationAdminAuthContext,
    ): Promise<SpeciesSighting | null> {
      try {
        const response = postSpeciesSightingRoute.handler({
          body: {
            ...(input as SpeciesSightingCreateRequest),
            csrfToken: auth?.csrfToken ?? "",
          },
          auth,
        }) as HandlerResult<SpeciesSightingCreateResponse | { message: string }, SpeciesSightingCreateTelemetry>;

        if (response.status !== 201 || !("sighting" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return null;
        }

        return response.json.sighting;
      } catch {
        return null;
      }
    },

    async listMovementSignals(
      speciesId: string,
      filters: SpeciesMovementSignalFilters = {},
    ): Promise<SpeciesMovementSignal[] | null> {
      try {
        const response = getSpeciesMovementSignalsRoute.handler({
          body: { id: speciesId },
          query: {
            movementType: filters.movementType,
            minConfidence: filters.minConfidence,
            startDate: filters.startDate,
            endDate: filters.endDate,
            region: filters.region,
            stationId: filters.stationId,
            investigationId: filters.investigationId,
            limit: filters.limit,
          },
        }) as HandlerResult<
          SpeciesMovementSignalsResponse | { message: string },
          SpeciesMovementSignalsTelemetry
        >;

        if (response.status === 404) {
          return null;
        }

        if (response.status !== 200 || !("movementSignals" in response.json)) {
          return null;
        }

        if (
          response.telemetry?.source === "mock"
          && response.telemetry.fallbackReason !== "db_path_missing"
        ) {
          return [];
        }

        return response.json.movementSignals;
      } catch {
        return null;
      }
    },

    getFallbackSpecies(): SpeciesProfile[] {
      return speciesFallbackData;
    },

    getFallbackSightings(): SpeciesSighting[] {
      return speciesSightingsFallbackData;
    },

    getFallbackMovementSignals(): SpeciesMovementSignal[] {
      return speciesMovementSignalsFallbackData;
    },
  },
  dataExplorer: {
    async getWorkspace(filters?: DataExplorerDatasetFilters): Promise<DataExplorerWorkspaceFetchResult> {
      const query = normalizeDatasetFilters(filters);
      const startedAtMs = Date.now();

      try {
        const response = getDatasetsRoute.handler({ body: undefined, query }) as HandlerResult<
          DataExplorerWorkspaceFetchResult["data"],
          DatasetsTelemetry
        >;
        const result = {
          data: response.json,
          meta: buildFetchMeta("workspace", startedAtMs, {
            state: "success",
            source: response.telemetry?.source,
            fallbackReason: response.telemetry?.fallbackReason,
          }),
        } satisfies DataExplorerWorkspaceFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      } catch {
        const result = {
          data: filterMockWorkspace(query),
          meta: buildFetchMeta("workspace", startedAtMs, {
            state: "success",
            source: "mock",
            fallbackReason: "db_query_failed",
          }),
        } satisfies DataExplorerWorkspaceFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }
    },
    async getDatasetDetail(datasetId: string): Promise<DataExplorerDatasetDetailFetchResult> {
      const startedAtMs = Date.now();

      try {
        const response = getDatasetByIdRoute.handler({ body: { id: datasetId } }) as HandlerResult<
          DataExplorerDatasetDetail | { message: string },
          DatasetDetailTelemetry
        >;

        if (response.status === 404) {
          const result = {
            data: null,
            meta: buildFetchMeta("detail", startedAtMs, {
              state: "not_found",
              datasetId,
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerDatasetDetailFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        const result = {
          data: response.json as DataExplorerDatasetDetail,
          meta: buildFetchMeta("detail", startedAtMs, {
            state: "success",
            datasetId,
            source: response.telemetry?.source,
            fallbackReason: response.telemetry?.fallbackReason,
          }),
        } satisfies DataExplorerDatasetDetailFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      } catch (error) {
        const result = {
          data: null,
          meta: buildFetchMeta("detail", startedAtMs, {
            state: "error",
            datasetId,
            source: "mock",
            fallbackReason: "db_query_failed",
            errorMessage: error instanceof Error ? error.message : "Unknown detail fetch error",
          }),
        } satisfies DataExplorerDatasetDetailFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }
    },
    async getDatasetRecords(
      datasetId: string,
      query?: DataExplorerRelatedRecordsQuery,
    ): Promise<DataExplorerRelatedRecordsFetchResult> {
      const startedAtMs = Date.now();

      try {
        const response = getDatasetRecordsRoute.handler({ body: { id: datasetId }, query }) as HandlerResult<
          DataExplorerRelatedRecordsResult | { message: string },
          DatasetRecordsTelemetry
        >;

        if (response.status === 404) {
          const result = {
            data: null,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "not_found",
              datasetId,
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }

        if ("records" in response.json) {
          const result = {
            data: response.json,
            meta: buildFetchMeta("records", startedAtMs, {
              state: "success",
              datasetId,
              source: response.telemetry?.source,
              fallbackReason: response.telemetry?.fallbackReason,
            }),
          } satisfies DataExplorerRelatedRecordsFetchResult;
          logDataExplorerFetch(result.meta);
          return result;
        }
      } catch {
        const data = filterMockRelatedRecords(datasetId, query);
        const result = {
          data,
          meta: buildFetchMeta("records", startedAtMs, {
            state: data ? "success" : "not_found",
            datasetId,
            source: "mock",
            fallbackReason: "db_query_failed",
          }),
        } satisfies DataExplorerRelatedRecordsFetchResult;
        logDataExplorerFetch(result.meta);
        return result;
      }

      throw new Error("Dataset records response was not in the expected shape.");
    },
  },
  oceanMap: {
    async getWorkspace() {
      try {
        return getRegionsRoute.handler({ body: undefined }).json.map;
      } catch {
        return oceanMapWorkspaceData;
      }
    },
  },
  oceanStations: {
    async getStations() {
      try {
        return getStationsRoute.handler({ body: undefined }).json.stations;
      } catch {
        return oceanStationsData;
      }
    },
    async getStationById(stationId: string): Promise<OceanStationDetail | null> {
      try {
        const response = getStationByIdRoute.handler({ body: { id: stationId } });

        if (response.status === 404 || "message" in response.json) {
          return null;
        }

        return response.json;
      } catch {
        return findMockStation(stationId);
      }
    },
    async getStationBySlug(slug: string): Promise<OceanStationDetail | null> {
      return apiClient.oceanStations.getStationById(slug);
    },
    async getStationAdmin(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = getStationAdminRoute.handler({ body: { id: stationId }, auth }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          OceanStationAdminTelemetry
        >;

        if ((response.status === 404 || response.status === 403) || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return findMockStation(stationId);
      }
    },
    async getStationAdminAudit(
      stationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationAdminAuditEntry[] | null> {
      try {
        const response = getStationAdminAuditRoute.handler({ body: { id: stationId }, auth }) as HandlerResult<
          { entries: OceanStationAdminAuditEntry[] } | { message: string },
          OceanStationAdminAuditTelemetry
        >;

        if ((response.status === 404 || response.status === 403) || !("entries" in response.json)) {
          return null;
        }

        return response.json.entries;
      } catch {
        return [];
      }
    },
    async updateStation(
      stationId: string,
      patch: OceanStationAdminPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async updateStationBranding(
      stationId: string,
      patch: OceanStationAdminBrandingPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationBrandingRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async updateStationContent(
      stationId: string,
      patch: OceanStationAdminContentPatch,
      auth?: OceanStationAdminAuthContext,
    ): Promise<OceanStationDetail | null> {
      try {
        const response = patchStationContentRoute.handler({
          body: { id: stationId, patch, csrfToken: auth?.csrfToken ?? "" },
          auth,
        }) as HandlerResult<
          { station: OceanStationDetail } | { message: string },
          StationPatchTelemetry
        >;

        if (response.status !== 200 || !("station" in response.json)) {
          return null;
        }

        return response.json.station;
      } catch {
        return applyMockStationPatch(stationId, patch);
      }
    },
    async getStationAnalytics(stationId: string): Promise<OceanStationAnalytics | null> {
      try {
        const response = getStationAnalyticsRoute.handler({ body: { id: stationId } }) as HandlerResult<
          { analytics: OceanStationAnalytics } | { message: string },
          OceanStationAnalyticsTelemetry
        >;

        if (response.status === 404 || !("analytics" in response.json)) {
          return null;
        }

        return response.json.analytics;
      } catch {
        const fromId = oceanStationAnalytics[stationId];

        if (fromId) {
          return cloneAnalytics(fromId);
        }

        const bySlug = Object.values(oceanStationDetails).find((station) => station.slug === stationId);

        if (!bySlug) {
          return null;
        }

        const fromSlug = oceanStationAnalytics[bySlug.id];
        return fromSlug ? cloneAnalytics(fromSlug) : null;
      }
    },
    async trackStationView(stationId: string, viewType: OceanStationViewType): Promise<void> {
      try {
        postStationViewRoute.handler({ body: { id: stationId, viewType } }) as HandlerResult<
          { ok: true; stationId: string; viewType: OceanStationViewType; viewedAt: string } | { message: string },
          StationViewTrackTelemetry
        >;
      } catch {
        const station = findMockStation(stationId);

        if (!station) {
          return;
        }

        const current = oceanStationAnalytics[station.id] ?? {
          stationId: station.id,
          views: { detail: 0, exhibit: 0, public: 0, total: 0 },
          lastViewedAt: null,
        };

        current.views[viewType] += 1;
        current.views.total += 1;
        current.lastViewedAt = nowIso();
        oceanStationAnalytics[station.id] = current;
      }
    },
    async acknowledgeAlert(
      stationId: string,
      alertId: string,
      actorId: string,
    ): Promise<
      | { ok: true; alert: OceanStationAlert; timelineEvent?: StationAlertAcknowledgeResponse["timelineEvent"] }
      | { ok: false; status: 404 | 409; message: string }
    > {
      try {
        const response = postStationAlertAcknowledgeRoute.handler({
          body: { id: stationId, alertId, actorId },
        }) as HandlerResult<StationAlertAcknowledgeResponse | { message: string }, StationAlertAcknowledgeTelemetry>;

        if (response.status === 200 && "alert" in response.json) {
          return {
            ok: true,
            alert: response.json.alert,
            timelineEvent: "timelineEvent" in response.json ? response.json.timelineEvent : undefined,
          };
        }

        const message = "message" in response.json ? response.json.message : "Unexpected error";
        return { ok: false, status: response.status as 404 | 409, message };
      } catch {
        return { ok: false, status: 404, message: "Failed to acknowledge alert" };
      }
    },
  },
  aiLab: {
    async getWorkspace() {
      try {
        return getAiLabRoute.handler({ body: undefined }).json;
      } catch {
        return aiLabWorkspaceData;
      }
    },
    async analyze(input: AnalyzeRequestBody) {
      try {
        return postAiAnalyzeRoute.handler({ body: input }).json;
      } catch {
        const [summary, findings, evidence, confidence, uncertainty, suggestedNextActions] =
          aiLabWorkspaceData.results;

        return {
          prompt: input.prompt,
          summary,
          findings,
          evidence,
          confidence,
          uncertainty,
          suggestedNextActions,
          sources: aiLabWorkspaceData.sources,
        };
      }
    },
  },
  stationEvents: {
    async queryEvents(
      stationId: string,
      filters: StationEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventListResponse | null> {
      try {
        const response = getStationEventsRoute.handler({
          body: { id: stationId },
          query: filters,
          auth,
        }) as HandlerResult<StationEventListResponse | { message: string }, StationEventsListTelemetry>;

        if (response.status !== 200 || !("events" in response.json)) {
          return null;
        }

        return {
          events: response.json.events,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return { events: [], nextCursor: null };
      }
    },

    async getEvents(
      stationId: string,
      filters: StationEventFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventListItem[] | null> {
      const page = await apiClient.stationEvents.queryEvents(stationId, filters, auth);

      return page?.events ?? null;
    },

    async getEventDetail(
      stationId: string,
      eventId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationEventDetail | null> {
      try {
        const response = getStationEventDetailRoute.handler({
          body: { id: stationId, eventId },
          auth,
        }) as HandlerResult<StationEventDetailResponse | { message: string }, StationEventDetailTelemetry>;

        if (response.status !== 200 || !("event" in response.json)) {
          return null;
        }

        return response.json.event;
      } catch {
        return null;
      }
    },

    async queryInvestigations(
      stationId: string,
      filters: StationInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationListResponse | null> {
      try {
        const response = getStationInvestigationsRoute.handler({
          body: { id: stationId },
          query: filters,
          auth,
        }) as HandlerResult<StationInvestigationListResponse | { message: string }, StationInvestigationsListTelemetry>;

        if (response.status !== 200 || !("investigations" in response.json)) {
          return null;
        }

        return {
          investigations: response.json.investigations,
          nextCursor: response.json.nextCursor,
        };
      } catch {
        return { investigations: [], nextCursor: null };
      }
    },

    async getInvestigations(
      stationId: string,
      filters: StationInvestigationFilters = {},
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationSummary[] | null> {
      const page = await apiClient.stationEvents.queryInvestigations(stationId, filters, auth);

      return page?.investigations ?? null;
    },

    async getInvestigationDetail(
      stationId: string,
      investigationId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<StationInvestigationDetail | null> {
      try {
        const response = getStationInvestigationDetailRoute.handler({
          body: { id: stationId, investigationId },
          auth,
        }) as HandlerResult<StationInvestigationDetailResponse | { message: string }, StationInvestigationDetailTelemetry>;

        if (response.status !== 200 || !("investigation" in response.json)) {
          return null;
        }

        return response.json.investigation;
      } catch {
        return null;
      }
    },

    async acknowledgeEvent(
      stationId: string,
      eventId: string,
      actorId: string,
      auth?: OceanStationAdminAuthContext,
    ): Promise<
      | { ok: true; event: StationEventAcknowledgeResponse["event"] }
      | { ok: false; status: 403 | 404 | 409; message: string }
    > {
      try {
        const response = postStationEventAcknowledgeRoute.handler({
          body: { id: stationId, eventId, actorId },
          auth,
        }) as HandlerResult<StationEventAcknowledgeResponse | { message: string }, StationEventAcknowledgeTelemetry>;

        if (response.status === 200 && "event" in response.json) {
          return { ok: true, event: response.json.event };
        }

        const message = "message" in response.json ? response.json.message : "Unexpected error";
        return { ok: false, status: response.status as 403 | 404 | 409, message };
      } catch {
        return { ok: false, status: 404, message: "Failed to acknowledge event" };
      }
    },
  },
};

~~~


## FILE: apps/web/app/page.tsx

~~~

import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardAnomalySummaryCard } from "@/components/dashboard/dashboard-anomaly-summary";
import { SignalCenter } from "@/components/signals/signal-center";
import { apiClient } from "@/lib/api/client";
import type {
  DashboardActivityItem,
  DashboardMetric,
  DashboardMission,
  DashboardQuickAccessItem,
} from "@/lib/api/types";
import {
  Activity,
  Fish,
  Thermometer,
  Wind,
  Droplets,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Satellite,
  MapPin,
  Clock,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

const COLOR_MAP = {
  cyan:    { bg: "bg-cyan-500/10",    border: "border-cyan-500/25",    icon: "text-cyan-400",    badge: "bg-cyan-500/15 text-cyan-300"    },
  emerald: { bg: "bg-emerald-500/10", border: "border-emerald-500/25", icon: "text-emerald-400", badge: "bg-emerald-500/15 text-emerald-300" },
  amber:   { bg: "bg-amber-500/10",   border: "border-amber-500/25",   icon: "text-amber-400",   badge: "bg-amber-500/15 text-amber-300"   },
  violet:  { bg: "bg-violet-500/10",  border: "border-violet-500/25",  icon: "text-violet-400",  badge: "bg-violet-500/15 text-violet-300"  },
  rose:    { bg: "bg-rose-500/10",    border: "border-rose-500/25",    icon: "text-rose-400",    badge: "bg-rose-500/15 text-rose-300"    },
};

const ACTIVITY_COLORS = {
  sensor:  "bg-cyan-500/20 text-cyan-400",
  species: "bg-emerald-500/20 text-emerald-400",
  alert:   "bg-amber-500/20 text-amber-400",
  report:  "bg-violet-500/20 text-violet-400",
};

// ---------------------------------------------------------------------------
// Sub-components (layout-only, no extra logic)
// ---------------------------------------------------------------------------

const METRIC_ICONS: Record<DashboardMetric["icon"], LucideIcon> = {
  fish: Fish,
  thermometer: Thermometer,
  wind: Wind,
  droplets: Droplets,
  activity: Activity,
  "alert-circle": AlertCircle,
};

function MetricCardTile({ m }: { m: DashboardMetric }) {
  const colors = COLOR_MAP[m.color];
  const changePositive = m.change > 0;
  const TrendIcon = m.change > 0 ? TrendingUp : m.change < 0 ? TrendingDown : Minus;
  const Icon = METRIC_ICONS[m.icon];

  return (
    <div className={cn("rounded-xl border p-4 space-y-3", colors.bg, colors.border)}>
      <div className="flex items-start justify-between">
        <div className={cn("p-2 rounded-lg", colors.bg, colors.border)}>
          <Icon size={16} className={colors.icon} />
        </div>
        <span
          className={cn(
            "flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full",
            changePositive ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300",
            m.change === 0 && "bg-slate-500/15 text-slate-400"
          )}
        >
          <TrendIcon size={10} />
          {Math.abs(m.change)}
          {m.unit ? m.unit : "%"}
        </span>
      </div>
      <div>
        <p className="text-xl font-bold text-slate-100 font-mono leading-none">
          {m.value}
          {m.unit && <span className="text-sm font-normal text-slate-400 ml-1">{m.unit}</span>}
        </p>
        <p className="text-[11px] text-slate-500 mt-1">{m.label}</p>
      </div>
    </div>
  );
}

function MissionStatusBadge({ status }: { status: DashboardMission["status"] }) {
  const cls = {
    "In Progress": "bg-cyan-500/15 text-cyan-300 border-cyan-500/25",
    "Pending":     "bg-amber-500/15 text-amber-300 border-amber-500/25",
    "Complete":    "bg-emerald-500/15 text-emerald-300 border-emerald-500/25",
  }[status];

  return (
    <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-medium border", cls)}>
      {status}
    </span>
  );
}

function formatConditionMetric(value: number | null, digits = 1): string {
  if (value === null || value === undefined) {
    return "--";
  }

  return value.toFixed(digits);
}

function formatStressLevel(level: string | null): string {
  if (!level) {
    return "--";
  }

  return level
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DashboardPage() {
  const [overview, prioritizedSignals, liveConditions, reefAlerts] = await Promise.all([
    apiClient.dashboard.getOverview(),
    apiClient.signals.list({ status: "open", limit: 8 }),
    apiClient.liveConditions.getLatest(),
    apiClient.reefAlerts.getLatest(),
  ]);

  const { metrics, missions, activity, quickAccess, anomalySummary, speciesActivity } = overview;

  return (
    <AppShell
      pageTitle="Mission Control"
      pageSubtitle="Ocean Intelligence Platform — real-time overview"
    >
      <div className="p-6 space-y-6 max-w-[1400px] mx-auto">

        {/* ── Section header ── */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-100">Dashboard</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live ocean data · Updated just now
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <Clock size={12} />
            <span className="font-mono">UTC 14:42:07</span>
          </div>
        </div>

        {/* ── Metric tiles ── */}
        <section>
          <div className="grid grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-3">
            {metrics.map((m: DashboardMetric) => (
              <MetricCardTile key={m.label} m={m} />
            ))}
          </div>
        </section>

        {/* ── Anomaly Summary ── */}
        {anomalySummary && <DashboardAnomalySummaryCard summary={anomalySummary} />}

        {/* ── Signal Center ── */}
        <SignalCenter signals={prioritizedSignals} />

        {/* ── Species Activity ── */}
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Species Activity</p>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  {speciesActivity
                    ? `Last ${speciesActivity.windowDays} days · ${speciesActivity.generatedAt.slice(0, 10)}`
                    : "Verification-aware sightings and movement intelligence"}
                </p>
            </div>
              <div className="flex items-center gap-3">
                <Link href="/investigations" className="text-[11px] text-violet-400 hover:text-violet-300 transition-colors">
                  Investigations
                </Link>
                <Link href="/species-database" className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">
                  Species Database
                </Link>
              </div>
          </div>

            {speciesActivity ? (
              <>
                {/* Stat tiles */}
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Recent sightings</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{speciesActivity.recentSightingCount}</p>
                  </div>
                  <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Movement signals</p>
                    <p className="mt-1 text-lg font-semibold text-slate-100">{speciesActivity.recentMovementSignalCount}</p>
                  </div>
                  <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Top movement type</p>
                    <p className="mt-1 text-sm font-semibold text-slate-100">
                      {(speciesActivity.topMovementTypes[0] ?? "none").replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                {/* Top active species */}
                {speciesActivity.topActiveSpecies.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Top active species</p>
                    {speciesActivity.topActiveSpecies.map((entry) => (
                      <div
                        key={entry.speciesId}
                        className="flex items-center justify-between rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-2"
                      >
                        <span className="text-xs text-slate-200">{entry.commonName}</span>
                        <span className="text-[11px] text-slate-500 font-mono">
                          {entry.sightingCount} sighting{entry.sightingCount === 1 ? "" : "s"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ecological reasons — why this matters */}
                {speciesActivity.ecologicalReasons.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Ecological signals</p>
                    {speciesActivity.ecologicalReasons.map((reason) => (
                      <article
                        key={reason.kind}
                        className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2"
                      >
                        <p className="text-[11px] font-medium text-emerald-300">{reason.label}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{reason.detail}</p>
                      </article>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
                No recent species activity data available.
              </div>
            )}
        </section>

        {/* ── Live Marine Conditions ── */}
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Live Marine Conditions</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Latest NOAA NDBC buoy conditions by station
              </p>
            </div>
            <Link href="/ocean-map" className="text-[11px] text-cyan-400 hover:text-cyan-300 transition-colors">
              Ocean Map
            </Link>
          </div>

          {liveConditions.length > 0 ? (
            <div className="grid gap-2">
              {liveConditions.slice(0, 6).map((condition) => (
                <article
                  key={`${condition.stationId}-${condition.timestamp}`}
                  className="grid gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-3 text-[11px] text-slate-300 sm:grid-cols-[120px_repeat(4,minmax(0,1fr))_150px]"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Station</p>
                    <p className="mt-1 font-semibold text-slate-100">{condition.stationId}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Sea temp</p>
                    <p className="mt-1">{formatConditionMetric(condition.sstC)} °C</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wave height</p>
                    <p className="mt-1">{formatConditionMetric(condition.waveHeightM, 2)} m</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wind</p>
                    <p className="mt-1">{formatConditionMetric(condition.windSpeedMps)} m/s</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Pressure</p>
                    <p className="mt-1">{formatConditionMetric(condition.pressureHpa)} hPa</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Timestamp</p>
                    <p className="mt-1 font-mono text-slate-400">{condition.timestamp.slice(0, 16).replace("T", " ")} UTC</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
              No live marine conditions available.
            </div>
          )}
        </section>

        {/* ── Reef Stress Watch ── */}
        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Reef Stress Watch</p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Coral Reef Watch stress indicators from NOAA CRW
              </p>
            </div>
            <Link href="/investigations" className="text-[11px] text-amber-400 hover:text-amber-300 transition-colors">
              Investigations
            </Link>
          </div>

          {reefAlerts.length > 0 ? (
            <div className="grid gap-2">
              {reefAlerts.slice(0, 6).map((alert) => (
                <article
                  key={`${alert.region}-${alert.stationId ?? "region"}-${alert.timestamp}`}
                  className="grid gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-3 text-[11px] text-slate-300 sm:grid-cols-[180px_repeat(4,minmax(0,1fr))_150px]"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Region</p>
                    <p className="mt-1 font-semibold text-slate-100">{alert.region}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">SST anomaly</p>
                    <p className="mt-1">{formatConditionMetric(alert.sstAnomalyC)} °C</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">HotSpot</p>
                    <p className="mt-1">{formatConditionMetric(alert.hotSpotC)} °C</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">DHW</p>
                    <p className="mt-1">{formatConditionMetric(alert.dhw)} week</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Stress level</p>
                    <p className="mt-1">{formatStressLevel(alert.stressLevel)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Timestamp</p>
                    <p className="mt-1 font-mono text-slate-400">{alert.timestamp.slice(0, 16).replace("T", " ")} UTC</p>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
              No reef stress alerts available.
            </div>
          )}
        </section>

        {/* ── Middle row: missions + activity ── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">

          {/* Active missions — 3 cols */}
          <section className="lg:col-span-3 rounded-xl bg-ocean-900 border border-surface-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-borderSubtle">
              <div className="flex items-center gap-2">
                <Satellite size={14} className="text-cyan-400" />
                <span className="text-sm font-semibold text-slate-200">Active Missions</span>
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 text-[10px] font-medium">
                  {missions.filter((m: DashboardMission) => m.status !== "Complete").length} active
                </span>
              </div>
              <button className="flex items-center gap-1 text-[11px] text-cyan-500 hover:text-cyan-300 transition-colors">
                All missions <ChevronRight size={12} />
              </button>
            </div>

            <div className="divide-y divide-surface-borderSubtle">
              {missions.map((mission: DashboardMission) => (
                <div key={mission.id} className="flex items-center gap-4 px-5 py-3 hover:bg-ocean-800 transition-colors">
                  <div className="text-[10px] font-mono text-slate-500 w-16 shrink-0">{mission.id}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-200 truncate">{mission.name}</p>
                    <div className="flex items-center gap-1 mt-0.5 text-[10px] text-slate-500">
                      <MapPin size={9} />
                      {mission.location}
                    </div>
                    <div className="flex items-center gap-2 mt-1.5">
                      <div className="flex-1 h-1 rounded-full bg-ocean-800 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-cyan-500 transition-all"
                          style={{ width: `${mission.progress}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500 font-mono w-8 text-right">
                        {mission.progress}%
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <MissionStatusBadge status={mission.status} />
                    <span className="text-[10px] text-slate-500 font-mono">{mission.eta}</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Recent activity — 2 cols */}
          <section className="lg:col-span-2 rounded-xl bg-ocean-900 border border-surface-border overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-surface-borderSubtle">
              <div className="flex items-center gap-2">
                <Activity size={14} className="text-cyan-400" />
                <span className="text-sm font-semibold text-slate-200">Recent Activity</span>
              </div>
              <button className="flex items-center gap-1 text-[11px] text-cyan-500 hover:text-cyan-300 transition-colors">
                See all <ChevronRight size={12} />
              </button>
            </div>

            <div className="divide-y divide-surface-borderSubtle overflow-y-auto max-h-72">
              {activity.map((a: DashboardActivityItem, i: number) => (
                <div key={i} className="flex items-start gap-3 px-5 py-2.5 hover:bg-ocean-800 transition-colors">
                  <span
                    className={cn(
                      "mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider shrink-0",
                      ACTIVITY_COLORS[a.type]
                    )}
                  >
                    {a.type}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-300 leading-snug">{a.text}</p>
                    <p className="text-[10px] text-slate-600 mt-0.5">{a.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ── Quick-nav cards ── */}
        <section>
          <p className="text-xs font-medium text-slate-500 uppercase tracking-widest mb-3">
            Quick Access
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickAccess.map(({ label, desc, href, color }: DashboardQuickAccessItem) => {
              const c = COLOR_MAP[color as keyof typeof COLOR_MAP];
              return (
                <Link
                  key={label}
                  href={href}
                  className={cn(
                    "group flex flex-col items-start gap-1 p-4 rounded-xl border text-left transition-all",
                    c.bg, c.border, "hover:brightness-125"
                  )}
                >
                  <span className={cn("text-xs font-semibold", c.icon)}>{label}</span>
                  <span className="text-[11px] text-slate-500">{desc}</span>
                  <ChevronRight
                    size={12}
                    className={cn("mt-1 transition-transform group-hover:translate-x-0.5", c.icon)}
                  />
                </Link>
              );
            })}
          </div>
        </section>

      </div>
    </AppShell>
  );
}

~~~


## FILE: apps/web/app/page.test.tsx

~~~

import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import DashboardPage from "@/app/page";
import type {
  DashboardOverviewData,
  DashboardSpeciesActivity,
  LiveMarineCondition,
  ReefStressWatchItem,
} from "@/lib/api/types";

const SPECIES_ACTIVITY: DashboardSpeciesActivity = {
  recentSightingCount: 3,
  recentMovementSignalCount: 2,
  topMovementTypes: ["route_deviation", "aggregation_shift"],
  topActiveSpecies: [{ speciesId: "SP-BLUE-WHALE", commonName: "Blue Whale", sightingCount: 3 }],
  ecologicalReasons: [
    {
      kind: "increased_sighting_rate",
      label: "3 sightings in last 14 days",
      detail: "Sighting frequency exceeds baseline threshold.",
    },
    {
      kind: "migration_shift_detected",
      label: "Migration shift: route deviation",
      detail: "Detected route deviation in recent movement signals.",
    },
  ],
  windowDays: 14,
  generatedAt: "2026-03-13T12:00:00.000Z",
};

const OVERVIEW: DashboardOverviewData = {
  metrics: [],
  missions: [],
  activity: [],
  quickAccess: [],
  speciesActivity: SPECIES_ACTIVITY,
};

const LIVE_CONDITIONS: LiveMarineCondition[] = [
  {
    stationId: "46042",
    timestamp: "2026-03-18T10:50:00.000Z",
    sstC: 17.1,
    waveHeightM: 1.24,
    windSpeedMps: 7,
    pressureHpa: 1015.6,
  },
];

const REEF_ALERTS: ReefStressWatchItem[] = [
  {
    region: "Great Barrier Reef",
    stationId: null,
    timestamp: "2026-03-18T10:00:00.000Z",
    sstAnomalyC: 1.8,
    hotSpotC: 1.4,
    dhw: 6.2,
    stressLevel: "alert_level_1",
    source: "noaa_coral_reef_watch",
    outputClass: "derived",
  },
];

const { mockApiClient } = vi.hoisted(() => ({
  mockApiClient: {
    dashboard: {
      getOverview: vi.fn(),
    },
    signals: {
      list: vi.fn(),
    },
    liveConditions: {
      getLatest: vi.fn(),
    },
    reefAlerts: {
      getLatest: vi.fn(),
    },
  },
}));

vi.mock("@/lib/api/client", () => ({
  apiClient: mockApiClient,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/dashboard/dashboard-anomaly-summary", () => ({
  DashboardAnomalySummaryCard: () => <div data-testid="anomaly-summary" />,
}));

vi.mock("@/components/signals/signal-center", () => ({
  SignalCenter: () => <div data-testid="signal-center" />,
}));

beforeEach(() => {
  mockApiClient.dashboard.getOverview.mockReset();
  mockApiClient.signals.list.mockReset();
  mockApiClient.liveConditions.getLatest.mockReset();
  mockApiClient.reefAlerts.getLatest.mockReset();

  mockApiClient.dashboard.getOverview.mockResolvedValue(OVERVIEW);
  mockApiClient.signals.list.mockResolvedValue([]);
  mockApiClient.liveConditions.getLatest.mockResolvedValue(LIVE_CONDITIONS);
  mockApiClient.reefAlerts.getLatest.mockResolvedValue(REEF_ALERTS);
});

test("dashboard page renders species activity from overview", async () => {
  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("Species Activity")).toBeInTheDocument();
  expect(screen.getByText("Blue Whale")).toBeInTheDocument();
  expect(screen.getByText("3 sightings in last 14 days")).toBeInTheDocument();
  expect(screen.getByText(/Migration shift/i)).toBeInTheDocument();
});

test("dashboard page only requests overview and signals", async () => {
  await DashboardPage();

  expect(mockApiClient.dashboard.getOverview).toHaveBeenCalledTimes(1);
  expect(mockApiClient.signals.list).toHaveBeenCalledTimes(1);
  expect(mockApiClient.liveConditions.getLatest).toHaveBeenCalledTimes(1);
  expect(mockApiClient.reefAlerts.getLatest).toHaveBeenCalledTimes(1);
});

test("dashboard page renders live marine conditions panel", async () => {
  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("Live Marine Conditions")).toBeInTheDocument();
  expect(screen.getByText("46042")).toBeInTheDocument();
  expect(screen.getByText(/17.1 °C/)).toBeInTheDocument();
});

test("dashboard page renders reef stress watch panel", async () => {
  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("Reef Stress Watch")).toBeInTheDocument();
  expect(screen.getByText("Great Barrier Reef")).toBeInTheDocument();
  expect(screen.getByText("Alert Level 1")).toBeInTheDocument();
});

test("dashboard page shows empty species activity state when unavailable", async () => {
  mockApiClient.dashboard.getOverview.mockResolvedValue({
    ...OVERVIEW,
    speciesActivity: undefined,
  });

  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("No recent species activity data available.")).toBeInTheDocument();
});

test("dashboard page renders ecological reasons section when reasons exist", async () => {
  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("Ecological signals")).toBeInTheDocument();
  expect(screen.getByText("Sighting frequency exceeds baseline threshold.")).toBeInTheDocument();
});

test("dashboard page shows empty reef stress state when alerts unavailable", async () => {
  mockApiClient.reefAlerts.getLatest.mockResolvedValue([]);

  const page = await DashboardPage();
  render(page);

  expect(screen.getByText("No reef stress alerts available.")).toBeInTheDocument();
});

~~~

