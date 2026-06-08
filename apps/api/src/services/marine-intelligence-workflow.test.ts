import test from "node:test";
import assert from "node:assert/strict";
import type {
  MarineAlertRecord,
  MarineEventRecord,
  MarineInvestigationRecord,
} from "../marine-intelligence-types";
import { createMarineIntelligenceWorkflowService } from "./marine-intelligence-workflow";
import type { AsyncDbAdapter } from "../db/async-client";

const MOCK_ADAPTER: AsyncDbAdapter = {
  resourceId: "mock-workflow",
  execute: async () => [],
  close: () => {},
};

const WORKFLOW_DEPS = { getAdapter: () => MOCK_ADAPTER };

const EVENT_A: MarineEventRecord = {
  id: "MEV-002",
  ontologyTermId: "mdl.threshold_alert",
  eventClass: "threshold_alert",
  severity: "high",
  status: "detected",
  title: "Thermal threshold exceeded",
  summary: "SST anomaly crossed threshold.",
  region: "North Pacific",
  stationId: "STA-001",
  confidence: 88,
  lineage: {
    source: "crw",
    sourceRecordId: "rec-2",
    ingestionRunId: "run-2",
    observedAt: "2026-03-20T11:00:00.000Z",
    ingestedAt: "2026-03-20T11:05:00.000Z",
  },
  detectedAt: "2026-03-20T11:06:00.000Z",
  resolvedAt: null,
  createdAt: "2026-03-20T11:06:00.000Z",
  updatedAt: "2026-03-20T11:06:00.000Z",
};

const EVENT_B: MarineEventRecord = {
  id: "MEV-001",
  ontologyTermId: "mdl.contextual_signal",
  eventClass: "contextual_signal",
  severity: "critical",
  status: "confirmed",
  title: "Reef stress convergence",
  summary: "HotSpot and DHW converged.",
  region: "Coral Sea",
  stationId: "STA-002",
  confidence: 93,
  lineage: {
    source: "crw",
    sourceRecordId: "rec-1",
    ingestionRunId: "run-1",
    observedAt: "2026-03-20T12:00:00.000Z",
    ingestedAt: "2026-03-20T12:05:00.000Z",
  },
  detectedAt: "2026-03-20T12:06:00.000Z",
  resolvedAt: null,
  createdAt: "2026-03-20T12:06:00.000Z",
  updatedAt: "2026-03-20T12:06:00.000Z",
};

const INVESTIGATION_A: MarineInvestigationRecord = {
  id: "MIID-2",
  eventId: "MEV-002",
  title: "North Pacific follow-up",
  sourceType: "signal",
  stationId: EVENT_A.stationId,
  region: EVENT_A.region,
  detectedAt: EVENT_A.detectedAt,
  status: "acknowledged",
  ownerId: "ops.north@marine.local",
  notes: null,
  createdAt: "2026-03-20T11:15:00.000Z",
  updatedAt: "2026-03-20T11:16:00.000Z",
  acknowledgedAt: "2026-03-20T11:16:00.000Z",
  resolvedAt: null,
  dismissedAt: null,
};

const INVESTIGATION_B: MarineInvestigationRecord = {
  id: "MIID-1",
  eventId: "MEV-001",
  title: "Coral Sea escalation",
  sourceType: "anomaly",
  stationId: EVENT_B.stationId,
  region: EVENT_B.region,
  detectedAt: EVENT_B.detectedAt,
  status: "open",
  ownerId: null,
  notes: null,
  createdAt: "2026-03-20T12:15:00.000Z",
  updatedAt: "2026-03-20T12:15:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
  dismissedAt: null,
};

const ALERT_A: MarineAlertRecord = {
  id: "MALT-2",
  eventId: "MEV-002",
  investigationId: null,
  severity: "high",
  status: "active",
  ruleType: "threshold_breach",
  title: "North Pacific alert",
  detail: "Threshold exceeded.",
  detectedAt: "2026-03-20T11:07:00.000Z",
  acknowledgedAt: null,
  resolvedAt: null,
  createdAt: "2026-03-20T11:07:00.000Z",
  updatedAt: "2026-03-20T11:07:00.000Z",
};

const ALERT_B: MarineAlertRecord = {
  id: "MALT-1",
  eventId: "MEV-001",
  investigationId: "MIID-1",
  severity: "critical",
  status: "acknowledged",
  ruleType: "contextual_convergence",
  title: "Coral Sea alert",
  detail: "Convergence confirmed.",
  detectedAt: "2026-03-20T12:07:00.000Z",
  acknowledgedAt: "2026-03-20T12:08:00.000Z",
  resolvedAt: null,
  createdAt: "2026-03-20T12:07:00.000Z",
  updatedAt: "2026-03-20T12:08:00.000Z",
};

test("marine intelligence workflow service sorts and filters events deterministically", async () => {
  const service = createMarineIntelligenceWorkflowService({
    ...WORKFLOW_DEPS,
    async listMarineEvents(_adapter, filters) {
      const events = [EVENT_A, EVENT_B].filter((event) => {
        if (filters?.id && event.id !== filters.id) return false;
        if (filters?.stationId && event.stationId !== filters.stationId) return false;
        if (filters?.status && event.status !== filters.status) return false;
        return true;
      });

      return { ok: true, events };
    },
  });

  const listed = await service.listEvents({ stationId: "STA-002" });
  assert.equal(listed.ok, true);
  if (listed.ok) {
    assert.equal(listed.events.length, 1);
    assert.equal(listed.events[0]?.id, "MEV-001");
  }

  const ordered = await service.listEvents();
  if (ordered.ok) {
    assert.deepEqual(
      ordered.events.map((event) => event.id),
      ["MEV-001", "MEV-002"],
    );
  }
});

test("marine intelligence workflow service filters investigations by linked event station and enriches event metadata", async () => {
  const service = createMarineIntelligenceWorkflowService({
    ...WORKFLOW_DEPS,
    async listMarineEvents(_adapter, filters) {
      const events = [EVENT_A, EVENT_B].filter((event) => {
        if (filters?.stationId && event.stationId !== filters.stationId) return false;
        return true;
      });
      return { ok: true, events };
    },
    async listMarineInvestigations() {
      return {
        source: "db",
        result: { ok: true, investigations: [INVESTIGATION_A, INVESTIGATION_B] },
      };
    },
  });

  const listed = await service.listInvestigations({ stationId: "STA-001" });
  assert.equal(listed.ok, true);
  if (listed.ok) {
    assert.equal(listed.investigations.length, 1);
    assert.equal(listed.investigations[0]?.id, "MIID-2");
    assert.equal(listed.investigations[0]?.eventTitle, EVENT_A.title);
    assert.equal(listed.investigations[0]?.region, INVESTIGATION_A.region);
    assert.equal(listed.investigations[0]?.sourceType, "signal");
  }
});

test("marine intelligence workflow service rejects investigation creation when linked event is missing", async () => {
  const service = createMarineIntelligenceWorkflowService({
    ...WORKFLOW_DEPS,
    async listMarineEvents() {
      return { ok: true, events: [] };
    },
  });

  const created = await service.createInvestigation({
    eventId: "MEV-MISSING",
    title: "Missing event",
  });

  assert.equal(created.ok, false);
  if (!created.ok) {
    assert.equal(created.reason, "not_found");
    assert.equal(created.investigation, null);
  }
});

test("marine intelligence workflow service creates investigations and enriches the response with event context", async () => {
  const createdRecord: MarineInvestigationRecord = {
    ...INVESTIGATION_A,
    id: "MIID-NEW",
    eventId: EVENT_B.id,
    title: "New Coral Sea follow-up",
    sourceType: "anomaly",
    stationId: EVENT_B.stationId,
    region: EVENT_B.region,
    detectedAt: EVENT_B.detectedAt,
    status: "open",
    ownerId: "ops.coral@marine.local",
    createdAt: "2026-03-20T12:30:00.000Z",
    updatedAt: "2026-03-20T12:30:00.000Z",
    acknowledgedAt: null,
  };

  const service = createMarineIntelligenceWorkflowService({
    ...WORKFLOW_DEPS,
    async listMarineEvents(_adapter, filters) {
      const events = [EVENT_A, EVENT_B].filter((event) => !filters?.id || event.id === filters.id);
      return { ok: true, events };
    },
    async createMarineInvestigation() {
      return {
        source: "db",
        result: { ok: true, investigation: createdRecord },
      };
    },
  });

  const created = await service.createInvestigation({
    eventId: EVENT_B.id,
    title: createdRecord.title,
    ownerId: createdRecord.ownerId,
  });

  assert.equal(created.ok, true);
  if (created.ok) {
    assert.equal(created.investigation?.id, "MIID-NEW");
    assert.equal(created.investigation?.eventTitle, EVENT_B.title);
    assert.equal(created.investigation?.stationId, createdRecord.stationId);
    assert.equal(created.investigation?.sourceType, createdRecord.sourceType);
  }
});

test("marine intelligence workflow service filters alerts by linked station and sorts them deterministically", async () => {
  const service = createMarineIntelligenceWorkflowService({
    ...WORKFLOW_DEPS,
    async listMarineEvents(_adapter, filters) {
      const events = [EVENT_A, EVENT_B].filter((event) => {
        if (filters?.stationId && event.stationId !== filters.stationId) return false;
        return true;
      });
      return { ok: true, events };
    },
    async listMarineAlerts() {
      return { source: "db", result: { ok: true, alerts: [ALERT_A, ALERT_B] } };
    },
  });

  const filtered = await service.listAlerts({ stationId: "STA-002" });
  assert.equal(filtered.ok, true);
  if (filtered.ok) {
    assert.equal(filtered.alerts.length, 1);
    assert.equal(filtered.alerts[0]?.id, "MALT-1");
    assert.equal(filtered.alerts[0]?.eventTitle, EVENT_B.title);
  }

  const ordered = await service.listAlerts();
  if (ordered.ok) {
    assert.deepEqual(
      ordered.alerts.map((alert) => alert.id),
      ["MALT-1", "MALT-2"],
    );
  }
});

test("marine intelligence workflow service acknowledges and resolves alerts with event enrichment", async () => {
  const acknowledged: MarineAlertRecord = {
    ...ALERT_A,
    status: "acknowledged",
    acknowledgedAt: "2026-03-20T11:08:00.000Z",
    updatedAt: "2026-03-20T11:08:00.000Z",
  };

  const resolved: MarineAlertRecord = {
    ...acknowledged,
    status: "resolved",
    resolvedAt: "2026-03-20T11:20:00.000Z",
    updatedAt: "2026-03-20T11:20:00.000Z",
  };

  const service = createMarineIntelligenceWorkflowService({
    ...WORKFLOW_DEPS,
    async listMarineEvents(_adapter, filters) {
      const events = [EVENT_A].filter((event) => !filters?.id || event.id === filters.id);
      return { ok: true, events };
    },
    async acknowledgeMarineAlert() {
      return { source: "db", result: { ok: true, alert: acknowledged } };
    },
    async resolveMarineAlert() {
      return { source: "db", result: { ok: true, alert: resolved } };
    },
  });

  const acked = await service.acknowledgeAlert(ALERT_A.id);
  assert.equal(acked.ok, true);
  if (acked.ok) {
    assert.equal(acked.alert?.status, "acknowledged");
    assert.equal(acked.alert?.stationId, EVENT_A.stationId);
  }

  const done = await service.resolveAlert(ALERT_A.id);
  assert.equal(done.ok, true);
  if (done.ok) {
    assert.equal(done.alert?.status, "resolved");
    assert.equal(done.alert?.eventStatus, EVENT_A.status);
  }
});