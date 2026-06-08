import test from "node:test";
import assert from "node:assert/strict";
import type { AsyncDbAdapter } from "../db/async-client";
import {
  insertObservation,
  type ObservationInsertInput,
} from "../repositories/observations";
import {
  insertDerivedSignal,
  type DerivedSignalInsertInput,
} from "../repositories/reef-stress";
import {
  generateReplayPacketForSignalId,
} from "./environmental-harness/replay";
import { buildDeterministicSignalId } from "./environmental-harness/lineage";
import { buildLiveConditionsRouteResponse } from "../routes/live-conditions";
import { buildReefAlertsRouteResponse } from "../routes/reef-alerts";
import { persistSignalIngestionLineage } from "./environmental-harness/signal-lineage";
import {
  defaultRequireReplayLineage,
  filterTrustedLiveConditions,
} from "./environmental-harness/lineage-presentation";
import {
  validatePublicEnvironmentalSignal,
  validateReplaySample,
} from "./environmental-harness/replay-validation";
import { classifyNdbcFreshness, verificationStatusFromFreshness } from "./environmental-harness/freshness-policy";
import { buildSignalProvenance } from "./environmental-harness/provenance";

function createLineageMemoryAdapter(): AsyncDbAdapter {
  const harnessEvents = new Map<string, Record<string, unknown>>();
  const observations: Array<Record<string, unknown>> = [];
  const derivedSignals: Array<Record<string, unknown>> = [];

  return {
    async execute(sql: string, params: unknown[] = []) {
      const normalized = sql.trim().toUpperCase();

      if (normalized.startsWith("CREATE") || normalized.startsWith("ALTER")) {
        return [];
      }

      if (normalized.startsWith("INSERT") && normalized.includes("ENVIRONMENTAL_HARNESS_EVENTS")) {
        harnessEvents.set(String(params[0]), {
          id: params[0],
          event_kind: params[1],
          event_type: params[2],
          subject_type: params[3],
          subject_id: params[4],
          parent_event_id: params[5],
          root_event_id: params[6],
          signal_id: params[7],
          alert_id: params[8],
          outcome: params[9],
          payload_json: params[10],
          content_hash: params[11],
          created_at: params[12],
        });
        return [];
      }

      if (normalized.startsWith("INSERT") && normalized.includes("OBSERVATIONS")) {
        observations.push({
          station_id: params[1],
          observed_at: params[3],
          sea_surface_temp_c: params[4],
          wave_height_m: params[5],
          wind_speed_mps: params[6],
          pressure_hpa: params[7],
          provenance_id: params[14],
          source: params[2],
          source_reference: params[18],
          created_at: params[20],
          signal_id: params[21],
          root_event_id: params[22],
          source_ingestion_event_id: params[23],
          verification_event_id: params[24],
          provenance_hash: params[25],
        });
        return [];
      }

      if (normalized.startsWith("INSERT") && normalized.includes("DERIVED_SIGNALS")) {
        derivedSignals.push({
          station_id: params[1],
          region_key: params[2],
          signal_label: params[5],
          observed_at: params[8],
          source_timestamp: params[10],
          source_reference: params[11],
          created_at: params[12],
          harness_signal_id: params[13],
          root_event_id: params[14],
          source_ingestion_event_id: params[15],
          verification_event_id: params[16],
          provenance_hash: params[17],
        });
        return [];
      }

      if (normalized.includes("FROM ENVIRONMENTAL_HARNESS_EVENTS") && normalized.includes("WHERE SIGNAL_ID = ?")) {
        return [...harnessEvents.values()]
          .filter((row) => row.signal_id === params[0])
          .sort((a, b) => Number(a.created_at) - Number(b.created_at));
      }

      if (normalized.includes("FROM ENVIRONMENTAL_HARNESS_EVENTS") && normalized.includes("WHERE ROOT_EVENT_ID = ?")) {
        return [...harnessEvents.values()]
          .filter((row) => row.root_event_id === params[0])
          .sort((a, b) => Number(a.created_at) - Number(b.created_at));
      }

      if (normalized.includes("FROM ENVIRONMENTAL_HARNESS_EVENTS") && normalized.includes("WHERE ID = ?")) {
        const row = harnessEvents.get(String(params[0]));
        return row ? [row] : [];
      }

      return [];
    },
    close() {},
    resourceId: "memory-lineage",
  };
}

test("NDBC observation persists rootEventId through insert input", async () => {
  const adapter = createLineageMemoryAdapter();
  const lineage = await persistSignalIngestionLineage({
    source: "noaa_ndbc",
    runId: "run-1",
    startedAt: "2026-06-01T12:00:00.000Z",
    completedAt: "2026-06-01T12:00:01.000Z",
    stationId: "46042",
    observedAt: "2026-06-01T12:00:00.000Z",
    provenanceId: "PRV-1",
    provenancePayload: { stationId: "46042", source: "noaa_ndbc" },
  }, { getAdapter: () => adapter });

  const input: ObservationInsertInput = {
    stationId: "46042",
    source: "noaa_ndbc",
    observedAt: Date.parse("2026-06-01T12:00:00.000Z"),
    seaSurfaceTempC: 17.1,
    waveHeightM: 1.2,
    windSpeedMps: 7,
    pressureHpa: 1015,
    ingestionRunId: "run-1",
    sourceTimestamp: "2026-06-01T12:00:00.000Z",
    sourceReference: "https://ndbc.example",
    rawLine: "46042 line",
    createdAt: Date.now(),
    signalId: lineage.signalId,
    rootEventId: lineage.rootEventId,
    sourceIngestionEventId: lineage.sourceIngestionEventId,
    verificationEventId: lineage.verificationEventId,
    provenanceHash: lineage.provenanceHash,
  };

  await insertObservation(adapter, input);
  assert.ok(lineage.rootEventId.startsWith("EHE-ingestion-"));
  assert.ok(lineage.signalId.startsWith("SIG-"));
});

test("CRW reef row persists rootEventId through derived signal insert", async () => {
  const adapter = createLineageMemoryAdapter();
  const lineage = await persistSignalIngestionLineage({
    source: "noaa_coral_reef_watch",
    runId: "run-crw",
    startedAt: "2026-06-01T00:00:00.000Z",
    completedAt: "2026-06-01T00:00:01.000Z",
    regionKey: "fl_keys",
    stationId: null,
    observedAt: "2026-06-01",
    provenanceId: "DRS-fl_keys",
    provenancePayload: { regionKey: "fl_keys", source: "noaa_coral_reef_watch" },
  }, { getAdapter: () => adapter });

  const input: DerivedSignalInsertInput = {
    stationId: null,
    regionKey: "fl_keys",
    signalType: "reef_bleaching_alert_level",
    signalValue: 3,
    signalLabel: "Watch",
    severity: "medium",
    source: "noaa_coral_reef_watch",
    observedAt: Date.parse("2026-06-01T00:00:00.000Z"),
    ingestionRunId: "run-crw",
    sourceTimestamp: "2026-06-01",
    sourceReference: "https://crw.example",
    createdAt: Date.now(),
    signalId: lineage.signalId,
    rootEventId: lineage.rootEventId,
    sourceIngestionEventId: lineage.sourceIngestionEventId,
    verificationEventId: lineage.verificationEventId,
    provenanceHash: lineage.provenanceHash,
  };

  await insertDerivedSignal(adapter, input);
  assert.ok(lineage.rootEventId);
});

test("live-conditions with missing lineage is withheld in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const observedAt = new Date().toISOString();
    const freshnessStatus = classifyNdbcFreshness(Date.parse(observedAt));
    const response = await buildLiveConditionsRouteResponse({
      source: "db",
      conditions: [{
        stationId: "46042",
        timestamp: observedAt,
        sstC: 17.1,
        waveHeightM: 1.2,
        windSpeedMps: 7,
        pressureHpa: 1015,
        source: "noaa_ndbc",
        provenanceId: "PRV-1",
        freshnessClassification: freshnessStatus.classification,
        freshnessStatus,
        verificationStatus: verificationStatusFromFreshness(freshnessStatus),
        provenance: buildSignalProvenance({ source: "noaa_ndbc", stationId: "46042", observedAt, provenanceId: "PRV-1" }),
        trustStatus: "unverified_lineage",
      }],
    });

    assert.equal(response.status, 503);
    assert.equal(response.json.conditions.length, 0);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("reef-alerts with missing lineage is withheld in production", async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    const productDate = new Date().toISOString();
    const freshnessStatus = classifyNdbcFreshness(Date.parse(productDate), Date.now(), "noaa_coral_reef_watch");
    const response = await buildReefAlertsRouteResponse({
      source: "db",
      alerts: [{
        region: "fl_keys",
        stationId: null,
        timestamp: productDate,
        sstAnomalyC: 0.5,
        hotSpotC: 0.2,
        dhw: 1,
        stressLevel: "Watch",
        source: "noaa_coral_reef_watch",
        outputClass: "derived",
        productDate,
        freshnessStatus,
        verificationStatus: verificationStatusFromFreshness(freshnessStatus),
        provenance: buildSignalProvenance({ source: "noaa_coral_reef_watch", productDate }),
        trustStatus: "unverified_lineage",
      }],
    });

    assert.equal(response.status, 503);
    assert.equal(response.json.alerts.length, 0);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});

test("replay validation fails if a public trusted signal lacks lineage", async () => {
  const result = await validatePublicEnvironmentalSignal({
    kind: "live_condition",
    signalId: null,
    rootEventId: null,
    trustStatus: "trusted",
    trustedForPromotion: true,
  });

  assert.equal(result.passed, false);
  assert.ok(result.failures.includes("signal_id_missing"));
  assert.ok(result.failures.includes("root_event_id_missing"));
  assert.ok(result.failures.includes("trusted_public_signal_missing_lineage"));
});

test("replay validation passes for lineage-complete trusted signal", async () => {
  const adapter = createLineageMemoryAdapter();
  const signalId = buildDeterministicSignalId({
    source: "noaa_ndbc",
    stationId: "46042",
    observedAt: "2026-06-01T12:00:00.000Z",
    provenanceId: "PRV-2",
  });

  const lineage = await persistSignalIngestionLineage({
    source: "noaa_ndbc",
    runId: "run-2",
    startedAt: "2026-06-01T12:00:00.000Z",
    completedAt: "2026-06-01T12:00:01.000Z",
    signalId,
    stationId: "46042",
    observedAt: "2026-06-01T12:00:00.000Z",
    provenanceId: "PRV-2",
    provenancePayload: {
      stationId: "46042",
      source: "noaa_ndbc",
      observedAt: "2026-06-01T12:00:00.000Z",
      rawInputs: { source: "noaa_ndbc", observedAt: "2026-06-01T12:00:00.000Z" },
    },
  }, { getAdapter: () => adapter });

  const replay = await generateReplayPacketForSignalId(lineage.signalId, { getAdapter: () => adapter });
  assert.equal(replay.status, "available");

  const publicResult = await validatePublicEnvironmentalSignal({
    kind: "live_condition",
    signalId: lineage.signalId,
    rootEventId: lineage.rootEventId,
    trustStatus: "trusted",
    trustedForPromotion: true,
  }, { getAdapter: () => adapter });

  assert.equal(publicResult.passed, true);
});

test("production presentation gate requires replay lineage by default", () => {
  const previousNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";

  try {
    assert.equal(defaultRequireReplayLineage(), true);

    const trusted = filterTrustedLiveConditions([{
      stationId: "46042",
      timestamp: new Date().toISOString(),
      sstC: 17,
      waveHeightM: 1,
      windSpeedMps: 5,
      pressureHpa: 1015,
      source: "noaa_ndbc",
      provenanceId: "PRV-1",
      verificationStatus: "verified",
      freshnessClassification: "live",
      provenance: { source: "noaa_ndbc", provenanceId: "PRV-1" },
      rootEventId: "EHE-ingestion-abc",
      sourceIngestionEventId: "EHE-ingestion-abc",
      verificationEventId: "EHE-verification-abc",
      signalId: "SIG-abc",
    }]);

    assert.equal(trusted.length, 1);

    const withheld = filterTrustedLiveConditions([{
      stationId: "46042",
      timestamp: new Date().toISOString(),
      sstC: 17,
      waveHeightM: 1,
      windSpeedMps: 5,
      pressureHpa: 1015,
      source: "noaa_ndbc",
      provenanceId: "PRV-legacy",
      verificationStatus: "verified",
      freshnessClassification: "live",
      provenance: { source: "noaa_ndbc", provenanceId: "PRV-legacy" },
      trustStatus: "unverified_lineage",
    }]);

    assert.equal(withheld.length, 0);
  } finally {
    process.env.NODE_ENV = previousNodeEnv;
  }
});
