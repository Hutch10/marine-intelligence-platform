import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSpeciesDetailRouteResponse,
  buildSpeciesListRouteResponse,
  buildSpeciesMovementSignalsRouteResponse,
  buildSpeciesSightingCreateRouteResponse,
  buildSpeciesSightingsRouteResponse,
} from "./species";
import type {
  OceanStationAdminAuthContext,
  SpeciesMovementSignal,
  SpeciesProfile,
  SpeciesSighting,
} from "../../../web/lib/api/types";

const BASE_SPECIES: SpeciesProfile = {
  id: "SP-BLUE-WHALE",
  commonName: "Blue Whale",
  scientificName: "Balaenoptera musculus",
  conservationStatus: "endangered",
  habitatRegion: "North Pacific",
  summary: "Migratory baleen whale monitored for route shifts.",
  createdAt: "2026-03-11T08:00:00.000Z",
  updatedAt: "2026-03-13T11:20:00.000Z",
};

const BASE_SIGHTING: SpeciesSighting = {
  id: "SIGHT-001",
  speciesId: "SP-BLUE-WHALE",
  stationId: "STA-NPC-01",
  region: "North Pacific",
  observedAt: "2026-03-13T11:04:00.000Z",
  latitude: 34.712,
  longitude: -143.118,
  count: 2,
  source: "Acoustic buoy mesh",
  summary: "Two tagged whales observed near corridor edge.",
  verificationStatus: "verified",
  verifiedAt: "2026-03-13T11:07:00.000Z",
  verifiedBy: "ops.admin",
  createdAt: "2026-03-13T11:06:00.000Z",
};

const BASE_MOVEMENT_SIGNAL: SpeciesMovementSignal = {
  id: "MOV-001",
  speciesId: "SP-BLUE-WHALE",
  signalId: "SIG-THERMAL-001",
  investigationId: "TRK-201",
  movementType: "route_deviation",
  confidence: 84,
  summary: "Route deviation aligned with thermal anomaly corridor.",
  createdAt: "2026-03-13T11:10:00.000Z",
};

const ADMIN_AUTH: OceanStationAdminAuthContext = {
  actorId: "ops.admin",
  role: "admin",
  permissions: [
    "station.view_admin",
    "station.edit_branding",
    "station.edit_content",
    "station.view_audit",
    "station.publish",
  ],
  csrfToken: "csrf-valid",
};

const OBSERVER_AUTH: OceanStationAdminAuthContext = {
  actorId: "observer.user",
  role: "viewer",
  permissions: ["species.submit_sighting"],
  csrfToken: "csrf-observer",
};

const RESEARCHER_AUTH: OceanStationAdminAuthContext = {
  actorId: "researcher.user",
  role: "viewer",
  permissions: ["species.submit_sighting", "species.verify_sighting"],
  csrfToken: "csrf-researcher",
};

test("species list route returns DB-backed entities", () => {
  const response = buildSpeciesListRouteResponse(
    { conservationStatus: "endangered" },
    {
      source: "db",
      species: [BASE_SPECIES],
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.route, "GET /species");
  assert.equal(response.telemetry.source, "db");
  assert.equal(response.telemetry.speciesCount, 1);
  assert.ok("species" in response.json);
  assert.equal(response.json.species[0]?.id, "SP-BLUE-WHALE");
});

test("species list route validates conservation status", () => {
  const response = buildSpeciesListRouteResponse({
    conservationStatus: "invalid_status" as never,
  });

  assert.equal(response.status, 400);
  assert.equal(response.telemetry.speciesCount, 0);
  assert.ok("message" in response.json);
});

test("species detail route returns 404 for missing species", () => {
  const response = buildSpeciesDetailRouteResponse("SP-MISSING", {
    source: "db",
    result: "not_found",
  });

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.result, "not_found");
});

test("species sightings route rejects species id mismatch in query", () => {
  const response = buildSpeciesSightingsRouteResponse(
    "SP-BLUE-WHALE",
    { speciesId: "SP-OTHER" },
    {
      source: "db",
      result: "found",
      sightings: [BASE_SIGHTING],
    },
  );

  assert.equal(response.status, 400);
  assert.equal(response.telemetry.filtersApplied, true);
});

test("species sightings route returns species scoped sightings", () => {
  const response = buildSpeciesSightingsRouteResponse(
    "SP-BLUE-WHALE",
    { limit: 10 },
    {
      source: "db",
      result: "found",
      sightings: [BASE_SIGHTING],
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "found");
  assert.ok("sightings" in response.json);
  assert.equal(response.json.sightings.length, 1);
});

test("species movement signals route returns linked movement intelligence", () => {
  const response = buildSpeciesMovementSignalsRouteResponse("SP-BLUE-WHALE", { minConfidence: 70 }, {
    source: "db",
    result: "found",
    movementSignals: [BASE_MOVEMENT_SIGNAL],
  });

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.result, "found");
  assert.equal(response.telemetry.filtersApplied, true);
  assert.ok("movementSignals" in response.json);
  assert.equal(response.json.movementSignals[0]?.movementType, "route_deviation");
});

test("species sighting create route rejects when csrf token is missing", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Acoustic buoy mesh",
      summary: "Missing csrf should fail",
    },
    ADMIN_AUTH,
  );

  assert.equal(response.status, 403);
  assert.equal(response.telemetry.result, "forbidden");
});

test("species sighting create route rejects verification promotion without publish permission", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Acoustic buoy mesh",
      summary: "Require publish permission",
      verificationStatus: "verified",
      csrfToken: "csrf-valid",
    },
    {
      ...ADMIN_AUTH,
      permissions: ["station.view_admin", "station.edit_content"],
    },
  );

  assert.equal(response.status, 403);
  assert.equal(response.telemetry.result, "forbidden");
});

test("species sighting create route validates coordinate input", () => {
  const response = buildSpeciesSightingCreateRouteResponse({
    speciesId: "SP-BLUE-WHALE",
    region: "North Pacific",
    latitude: 200,
    longitude: -143,
    count: 1,
    source: "Acoustic buoy mesh",
    summary: "Invalid latitude test",
    csrfToken: "csrf-valid",
  }, ADMIN_AUTH);

  assert.equal(response.status, 400);
  assert.equal(response.telemetry.validationError, "invalid_latitude");
});

test("species sighting create route returns 404 when species is missing", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-MISSING",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Acoustic buoy mesh",
      summary: "Unknown species test",
      csrfToken: "csrf-valid",
    },
    ADMIN_AUTH,
    {
      source: "db",
      result: "not_found",
    },
  );

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.result, "not_found");
});

test("species sighting create route returns created sighting", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      stationId: "STA-NPC-01",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 3,
      source: "Acoustic buoy mesh",
      summary: "Three individuals observed near thermal edge.",
      observedAt: "2026-03-17T11:59:00.000Z",
      verificationStatus: "verified",
      csrfToken: "csrf-valid",
    },
    ADMIN_AUTH,
    {
      source: "db",
      result: "created",
      sighting: BASE_SIGHTING,
    },
  );

  assert.equal(response.status, 201);
  assert.equal(response.telemetry.result, "created");
  assert.ok("sighting" in response.json);
});

test("species movement signals route rejects invalid movement type", () => {
  const response = buildSpeciesMovementSignalsRouteResponse(
    "SP-BLUE-WHALE",
    { movementType: "unknown_type" as never },
    { source: "db", result: "found", movementSignals: [] },
  );

  assert.equal(response.status, 400);
  assert.ok("message" in response.json);
  assert.equal(response.telemetry.filtersApplied, true);
});

test("species movement signals route returns 404 for missing species", () => {
  const response = buildSpeciesMovementSignalsRouteResponse(
    "SP-MISSING",
    {},
    { source: "db", result: "not_found" },
  );

  assert.equal(response.status, 404);
  assert.equal(response.telemetry.result, "not_found");
  assert.ok("message" in response.json);
});

test("species movement signals route reports all filters applied in telemetry", () => {
  const response = buildSpeciesMovementSignalsRouteResponse(
    "SP-BLUE-WHALE",
    {
      movementType: "route_deviation",
      minConfidence: 70,
      startDate: "2026-03-01T00:00:00.000Z",
      endDate: "2026-03-17T00:00:00.000Z",
      region: "North Pacific",
      stationId: "STA-NPC-01",
    },
    { source: "db", result: "found", movementSignals: [BASE_MOVEMENT_SIGNAL] },
  );

  assert.equal(response.status, 200);
  assert.equal(response.telemetry.filtersApplied, true);
  assert.equal(response.telemetry.signalCount, 1);
});

// ── Role-gated sighting ingestion ─────────────────────────────────────────────

test("sighting create route returns 401 when no auth is provided", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Acoustic buoy mesh",
      summary: "Unauthenticated request",
      csrfToken: "some-token",
    },
    undefined,
  );

  assert.equal(response.status, 401);
  assert.equal(response.telemetry.result, "unauthenticated");
  assert.ok("message" in response.json);
});

test("observer role can create a pending sighting (species.submit_sighting)", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Field observer",
      summary: "Observer-logged sighting",
      verificationStatus: "pending",
      csrfToken: "csrf-observer",
    },
    OBSERVER_AUTH,
    { source: "db", result: "created", sighting: BASE_SIGHTING },
  );

  assert.equal(response.status, 201);
  assert.equal(response.telemetry.result, "created");
  assert.equal(response.telemetry.verificationStatus, "pending");
  assert.equal(response.telemetry.actorId, "observer.user");
  assert.ok("sighting" in response.json);
});

test("observer role cannot create a verified sighting (species.verify_sighting required)", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Field observer",
      summary: "Observer tries to verify",
      verificationStatus: "verified",
      csrfToken: "csrf-observer",
    },
    OBSERVER_AUTH,
  );

  assert.equal(response.status, 403);
  assert.equal(response.telemetry.result, "forbidden");
});

test("researcher role can create a verified sighting (species.verify_sighting)", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Research vessel",
      summary: "Researcher-verified sighting",
      verificationStatus: "verified",
      csrfToken: "csrf-researcher",
    },
    RESEARCHER_AUTH,
    { source: "db", result: "created", sighting: BASE_SIGHTING },
  );

  assert.equal(response.status, 201);
  assert.equal(response.telemetry.result, "created");
  assert.equal(response.telemetry.verificationStatus, "verified");
  assert.equal(response.telemetry.actorId, "researcher.user");
});

test("researcher role can create a rejected sighting", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Research vessel",
      summary: "Researcher-rejected sighting",
      verificationStatus: "rejected",
      csrfToken: "csrf-researcher",
    },
    RESEARCHER_AUTH,
    { source: "db", result: "created", sighting: BASE_SIGHTING },
  );

  assert.equal(response.status, 201);
  assert.equal(response.telemetry.result, "created");
  assert.equal(response.telemetry.verificationStatus, "rejected");
});

test("legacy station.edit_content permission still allows pending sighting (backward compat)", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Acoustic buoy mesh",
      summary: "Legacy permission path",
      verificationStatus: "pending",
      csrfToken: "csrf-valid",
    },
    {
      ...ADMIN_AUTH,
      permissions: ["station.edit_content"],
    },
    { source: "db", result: "created", sighting: BASE_SIGHTING },
  );

  assert.equal(response.status, 201);
  assert.equal(response.telemetry.result, "created");
});

test("legacy station.publish permission still allows verified sighting (backward compat)", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Acoustic buoy mesh",
      summary: "Legacy publish permission path",
      verificationStatus: "verified",
      csrfToken: "csrf-valid",
    },
    ADMIN_AUTH,
    { source: "db", result: "created", sighting: BASE_SIGHTING },
  );

  assert.equal(response.status, 201);
  assert.equal(response.telemetry.result, "created");
});

test("sighting create route returns 503 when DB is unavailable (fallback)", () => {
  const response = buildSpeciesSightingCreateRouteResponse(
    {
      speciesId: "SP-BLUE-WHALE",
      region: "North Pacific",
      latitude: 34.71,
      longitude: -143.11,
      count: 1,
      source: "Acoustic buoy mesh",
      summary: "DB unavailable test",
      csrfToken: "csrf-valid",
    },
    ADMIN_AUTH,
    { source: "mock", fallbackReason: "db_open_failed" },
  );

  assert.equal(response.status, 503);
  assert.ok("message" in response.json);
});
