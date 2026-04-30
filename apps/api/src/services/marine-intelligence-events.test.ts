import test from "node:test";
import assert from "node:assert/strict";
import { createMarineEventFoundationService } from "./marine-intelligence-events";

test("marine event foundation service rejects unknown ontology terms", async () => {
  const service = createMarineEventFoundationService({
    getOntologyTerm: () => null,
  });

  const result = await service.recordEvent({
    ontologyTermId: "missing.term",
    eventClass: "threshold_alert",
    severity: "high",
    title: "Unknown ontology event",
    summary: "Should fail",
    region: "North Pacific",
    confidence: 44,
    lineage: {
      source: "crw",
      sourceRecordId: "rec-1",
      ingestionRunId: "run-1",
      observedAt: "2026-03-20T11:00:00.000Z",
      ingestedAt: "2026-03-20T11:10:00.000Z",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "ontology_term_not_found");
});

test("marine event foundation service enforces modeled term and class alignment", async () => {
  const service = createMarineEventFoundationService({
    getOntologyTerm: () => ({
      id: "mdl.trend_signal",
      label: "Trend Signal",
      layer: "modeled",
      entityType: "signal",
      description: "Trend event",
      parentId: null,
      tags: ["model"],
      version: 1,
    }),
  });

  const result = await service.recordEvent({
    ontologyTermId: "mdl.trend_signal",
    eventClass: "threshold_alert",
    severity: "medium",
    title: "Mismatched class",
    summary: "Should fail",
    region: "North Pacific",
    confidence: 71,
    lineage: {
      source: "ndbc",
      sourceRecordId: "rec-2",
      ingestionRunId: "run-2",
      observedAt: "2026-03-20T11:00:00.000Z",
      ingestedAt: "2026-03-20T11:10:00.000Z",
    },
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "validation");
  assert.match(result.error ?? "", /eventClass does not match/);
});

test("marine event foundation service returns repository results for valid input", async () => {
  const service = createMarineEventFoundationService({
    getOntologyTerm: () => ({
      id: "mdl.threshold_alert",
      label: "Threshold Alert",
      layer: "modeled",
      entityType: "signal",
      description: "Threshold event",
      parentId: null,
      tags: ["model"],
      version: 1,
    }),
    createEvent: async () => ({
      ok: true,
      event: {
        id: "MEV-1",
        ontologyTermId: "mdl.threshold_alert",
        eventClass: "threshold_alert",
        severity: "high",
        status: "detected",
        title: "Threshold exceeded",
        summary: "Event summary",
        region: "North Pacific",
        stationId: null,
        confidence: 90,
        lineage: {
          source: "crw",
          sourceRecordId: "rec-3",
          ingestionRunId: "run-3",
          observedAt: "2026-03-20T11:00:00.000Z",
          ingestedAt: "2026-03-20T11:05:00.000Z",
        },
        detectedAt: "2026-03-20T11:06:00.000Z",
        resolvedAt: null,
        createdAt: "2026-03-20T11:06:00.000Z",
        updatedAt: "2026-03-20T11:06:00.000Z",
      },
    }),
  });

  const result = await service.recordEvent({
    ontologyTermId: "mdl.threshold_alert",
    eventClass: "threshold_alert",
    severity: "high",
    title: "Threshold exceeded",
    summary: "Event summary",
    region: "North Pacific",
    confidence: 90,
    lineage: {
      source: "crw",
      sourceRecordId: "rec-3",
      ingestionRunId: "run-3",
      observedAt: "2026-03-20T11:00:00.000Z",
      ingestedAt: "2026-03-20T11:05:00.000Z",
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.event?.id, "MEV-1");
});

test("marine event foundation service returns empty list on repository unavailability", async () => {
  const service = createMarineEventFoundationService({
    listEvents: async () => ({
      ok: false,
      events: [],
      error: "db_open_failed",
    }),
  });

  const result = await service.listEvents();

  assert.equal(result.ok, false);
  assert.deepEqual(result.events, []);
});
