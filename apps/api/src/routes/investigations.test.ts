import test from "node:test";
import assert from "node:assert/strict";
import { buildInvestigationsRouteResponse } from "./investigations";

test("investigations route returns DB-backed analysis tracks and evidenceItems is always an array", async () => {
  const response = await buildInvestigationsRouteResponse({
    source: "db",
    analysisTracks: [
      {
        id: "TRK-201",
        title: "Surface temperature acceleration",
        summary: "Elevated SST continues to widen eastward.",
        confidence: 86,
        state: "Escalated",
      },
      {
        id: "TRK-187",
        title: "Chlorophyll suppression overlap",
        summary: "Bloom density tapering inside SST grid cells.",
        confidence: 72,
        state: "Correlated",
      },
    ],
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.route, "GET /investigations");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.trackCount, 2);
  assert.equal(response.telemetry.fallbackReason, undefined);
  assert.equal((response.json as any).workspace.analysisTracks.length, 2);
  assert.equal((response.json as any).workspace.analysisTracks[0]?.id, "TRK-201");
  // Contract: evidenceItems is always an array
  assert.ok(Array.isArray((response.json as any).workspace.evidenceItems), "evidenceItems must always be an array");
});

test("investigations route injects DB species summary when provided", async () => {
  const response = await buildInvestigationsRouteResponse(
    {
      source: "db",
      analysisTracks: [
        {
          id: "TRK-201",
          title: "Surface temperature acceleration",
          summary: "Elevated SST continues to widen eastward.",
          confidence: 86,
          state: "Escalated",
        },
      ],
    },
    {
      source: "db",
      result: "found",
      summary: {
        investigationId: "TRK-201",
        generatedAt: "2026-03-17T12:00:00.000Z",
        speciesCount: 1,
        linkedMovementSignalCount: 1,
        verifiedSightingCount: 1,
        pendingVerificationCount: 0,
        entries: [
          {
            speciesId: "SP-BLUE-WHALE",
            commonName: "Blue Whale",
            scientificName: "Balaenoptera musculus",
            movementSignalCount: 1,
            verifiedSightingCount: 1,
            pendingVerificationCount: 0,
            matchedStationCount: 1,
            lastObservedAt: "2026-03-13T11:04:00.000Z",
            maxMovementConfidence: 84,
            relevanceScore: 75,
            responseTier: "priority",
            reasonTrail: [],
          },
        ],
        explainabilityNote: "deterministic",
      },
    },
  );

  assert.ok((response.json as any).workspace.speciesSummary);
  assert.equal((response.json as any).workspace.speciesSummary?.investigationId, "TRK-201");
});

test("investigations route preserves mock workspace fields alongside DB tracks", async () => {
  const response = await buildInvestigationsRouteResponse({
    source: "db",
    analysisTracks: [
      { id: "TRK-DB-1", title: "DB Track", summary: "from DB", confidence: 75, state: "Watch" },
    ],
  });

  assert.ok((response.json as any).workspace.filterGroups.length > 0);
  assert.ok((response.json as any).workspace.signalMetrics.length > 0);
  assert.ok((response.json as any).workspace.hypothesisLog.length > 0);
  assert.ok(Array.isArray((response.json as any).workspace.evidenceItems));
  assert.equal((response.json as any).workspace.analysisTracks.length, 1);
  assert.equal((response.json as any).workspace.analysisTracks[0]?.id, "TRK-DB-1");
});

test("investigations route returns DB empty track list without falling back to mock", async () => {
  const response = await buildInvestigationsRouteResponse({
    source: "db",
    analysisTracks: [],
  });

  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.trackCount, 0);
  assert.equal(response.telemetry.fallbackReason, undefined);
  assert.deepEqual((response.json as any).workspace.analysisTracks, []);
});

test("investigations route falls back to mock tracks when DB path is missing", async () => {
  const response = await buildInvestigationsRouteResponse({
    source: "mock",
    fallbackReason: "db_path_missing",
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_path_missing");
  assert.ok((response.json as any).workspace.analysisTracks.length > 0);
});

test("investigations route falls back to mock tracks when DB open fails", async () => {
  const response = await buildInvestigationsRouteResponse({
    source: "mock",
    fallbackReason: "db_open_failed",
  });

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_open_failed");
  assert.ok((response.json as any).workspace.analysisTracks.length > 0);
});

test("investigations route falls back to mock tracks when DB query fails", async () => {
  const response = await buildInvestigationsRouteResponse({
    source: "mock",
    fallbackReason: "db_query_failed",
  });

  assert.equal(response.telemetry.source, "mock");
  assert.equal(response.telemetry.fallbackReason, "db_query_failed");
});
