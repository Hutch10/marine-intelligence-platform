import { describe, expect, test } from "vitest";
import {
  listObjectTypes,
  hasObjectType,
  getObjectType,
  listLinkTypes,
  linksFromSource,
  linksToTarget,
  listActions,
  buildRid,
  mapSpecies,
  mapStation,
  mapStationAlert,
  mapOperationalAlert,
  mapInvestigation,
  mapObservation,
  resolveStationAlerts,
  resolveStationObservations,
  resolveSpeciesObservations,
  resolveInvestigationAlerts,
  resolveInvestigationSpecies,
  resolveInvestigationStations,
  applyFilters,
  buildObjectSetResult,
} from "./index";
import type {
  SpeciesOntologyObject,
  StationOntologyObject,
  MarineAlertOntologyObject,
  ObservationOntologyObject,
} from "./index";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const stationA: StationOntologyObject = {
  __type: "Station",
  __rid: "Station/stn-001",
  __primaryKey: "stn-001",
  slug: "pacific-alpha",
  name: "Pacific Alpha",
  region: "North Pacific",
  status: "active",
  summary: "Deep water monitoring buoy.",
  locationLabel: "40°N 150°W",
  depthM: 420,
};

const stationB: StationOntologyObject = {
  __type: "Station",
  __rid: "Station/stn-002",
  __primaryKey: "stn-002",
  slug: "coral-bravo",
  name: "Coral Bravo",
  region: "Great Barrier Reef",
  status: "active",
  summary: "Reef stress monitor.",
  locationLabel: "18°S 147°E",
  depthM: 12,
};

const speciesA: SpeciesOntologyObject = {
  __type: "Species",
  __rid: "Species/sp-001",
  __primaryKey: "sp-001",
  commonName: "Blue Whale",
  scientificName: "Balaenoptera musculus",
  conservationStatus: "endangered",
  habitatRegion: "North Pacific",
  summary: "Largest animal on Earth.",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-06-01T00:00:00Z",
};

const speciesB: SpeciesOntologyObject = {
  __type: "Species",
  __rid: "Species/sp-002",
  __primaryKey: "sp-002",
  commonName: "Hawksbill Turtle",
  scientificName: "Eretmochelys imbricata",
  conservationStatus: "critically_endangered",
  habitatRegion: "Great Barrier Reef",
  summary: "Critically endangered sea turtle.",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-06-01T00:00:00Z",
};

const alertAtStationA: MarineAlertOntologyObject = {
  __type: "MarineAlert",
  __rid: "MarineAlert/alert-001",
  __primaryKey: "alert-001",
  title: "SST anomaly at Pacific Alpha",
  severity: "high",
  status: "open",
  detail: "Temperature exceeded threshold by 3°C.",
  stationId: "stn-001",
  linkedInvestigationId: "inv-001",
  detectedAt: "2024-09-01T08:00:00Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
};

const alertAtStationB: MarineAlertOntologyObject = {
  __type: "MarineAlert",
  __rid: "MarineAlert/alert-002",
  __primaryKey: "alert-002",
  title: "DHW threshold breach at Coral Bravo",
  severity: "critical",
  status: "active",
  detail: "Degree heating weeks exceeded 8.",
  stationId: "stn-002",
  linkedInvestigationId: null,
  detectedAt: "2024-09-02T10:00:00Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
};

const systemAlert: MarineAlertOntologyObject = {
  __type: "MarineAlert",
  __rid: "MarineAlert/alert-003",
  __primaryKey: "alert-003",
  title: "Ingestion source stale",
  severity: "warning",
  status: "active",
  detail: "No data received for 2 hours.",
  stationId: null,
  linkedInvestigationId: null,
  detectedAt: "2024-09-02T12:00:00Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
};


const obsAtStationA1: ObservationOntologyObject = {
  __type: "Observation",
  __rid: "Observation/stn-001__2024-09-01T06:00:00Z",
  __primaryKey: "stn-001__2024-09-01T06:00:00Z",
  stationId: "stn-001",
  timestamp: "2024-09-01T06:00:00Z",
  sstC: 24.1,
  waveHeightM: 1.2,
  windSpeedMps: 8.5,
  pressureHpa: 1013,
};

const obsAtStationA2: ObservationOntologyObject = {
  __type: "Observation",
  __rid: "Observation/stn-001__2024-09-01T12:00:00Z",
  __primaryKey: "stn-001__2024-09-01T12:00:00Z",
  stationId: "stn-001",
  timestamp: "2024-09-01T12:00:00Z",
  sstC: 25.9,
  waveHeightM: 1.4,
  windSpeedMps: 9.1,
  pressureHpa: 1011,
};

const obsAtStationB: ObservationOntologyObject = {
  __type: "Observation",
  __rid: "Observation/stn-002__2024-09-01T06:00:00Z",
  __primaryKey: "stn-002__2024-09-01T06:00:00Z",
  stationId: "stn-002",
  timestamp: "2024-09-01T06:00:00Z",
  sstC: 28.4,
  waveHeightM: 0.3,
  windSpeedMps: 3.2,
  pressureHpa: 1015,
};

const allStations = [stationA, stationB];
const allSpecies = [speciesA, speciesB];
const allAlerts = [alertAtStationA, alertAtStationB, systemAlert];

const allObservations = [obsAtStationA1, obsAtStationA2, obsAtStationB];

// ─── Object type registration ─────────────────────────────────────────────────

describe("Ontology: object type registration", () => {
  test("registry contains exactly the 5 required object types", () => {
    const ids = listObjectTypes().map((t) => t.id);
    expect(ids).toHaveLength(5);
    expect(ids).toContain("Species");
    expect(ids).toContain("Station");
    expect(ids).toContain("MarineAlert");
    expect(ids).toContain("Investigation");
    expect(ids).toContain("Observation");
  });

  test("each registered type has required metadata fields", () => {
    for (const type of listObjectTypes()) {
      expect(type.id).toBeTruthy();
      expect(type.displayName).toBeTruthy();
      expect(type.description).toBeTruthy();
      expect(type.primaryKeyField).toBeTruthy();
    }
  });

  test("hasObjectType returns true for known types", () => {
    expect(hasObjectType("Species")).toBe(true);
    expect(hasObjectType("Station")).toBe(true);
    expect(hasObjectType("MarineAlert")).toBe(true);
    expect(hasObjectType("Investigation")).toBe(true);
    expect(hasObjectType("Observation")).toBe(true);
  });

  test("hasObjectType returns false for unknown identifiers", () => {
    expect(hasObjectType("Signal")).toBe(false);
    expect(hasObjectType("")).toBe(false);
    expect(hasObjectType("species")).toBe(false); // case-sensitive
  });

  test("getObjectType returns correct metadata for each type", () => {
    expect(getObjectType("Species").displayName).toBe("Species");
    expect(getObjectType("Station").displayName).toBe("Ocean Station");
    expect(getObjectType("MarineAlert").displayName).toBe("Marine Alert");
    expect(getObjectType("Investigation").displayName).toBe("Investigation");
    expect(getObjectType("Observation").displayName).toBe("Observation");
  });
});

// ─── Link type registration ───────────────────────────────────────────────────

describe("Ontology: link type registration", () => {
  test("registry contains exactly 6 required link types", () => {
    const ids = listLinkTypes().map((l) => l.id);
    expect(ids).toHaveLength(6);
    expect(ids).toContain("Station_has_MarineAlert");
    expect(ids).toContain("Station_has_Observation");
    expect(ids).toContain("Species_observedAt_Observation");
    expect(ids).toContain("Investigation_involves_MarineAlert");
    expect(ids).toContain("Investigation_involves_Species");
    expect(ids).toContain("Investigation_involves_Station");
  });

  test("linksFromSource returns correct links for Station", () => {
    const links = linksFromSource("Station");
    const ids = links.map((l) => l.id);
    expect(ids).toContain("Station_has_MarineAlert");
    expect(ids).toContain("Station_has_Observation");
    expect(ids).not.toContain("Species_observedAt_Observation");
  });

  test("linksFromSource returns correct links for Investigation", () => {
    const links = linksFromSource("Investigation");
    const ids = links.map((l) => l.id);
    expect(ids).toContain("Investigation_involves_MarineAlert");
    expect(ids).toContain("Investigation_involves_Species");
    expect(ids).toContain("Investigation_involves_Station");
  });

  test("linksToTarget returns correct links for Observation", () => {
    const links = linksToTarget("Observation");
    const ids = links.map((l) => l.id);
    expect(ids).toContain("Station_has_Observation");
    expect(ids).toContain("Species_observedAt_Observation");
  });

  test("linksFromSource returns empty array for type with no outbound links", () => {
    const links = linksFromSource("Observation");
    expect(links).toHaveLength(0);
  });
});

// ─── Action type registration ─────────────────────────────────────────────────

describe("Ontology: action type registration", () => {
  test("registry contains the 4 defined action types", () => {
    const ids = listActions().map((a) => a.id);
    expect(ids).toHaveLength(4);
    expect(ids).toContain("AcknowledgeAlert");
    expect(ids).toContain("CloseInvestigation");
    expect(ids).toContain("AnnotateSighting");
    expect(ids).toContain("PromoteSignalToInvestigation");
  });

  test("each action declares the types it modifies", () => {
    const acknowledge = listActions().find((a) => a.id === "AcknowledgeAlert");
    expect(acknowledge?.modifiesTypes).toContain("MarineAlert");
  });
});

// ─── Mapper return shape consistency ─────────────────────────────────────────

describe("Ontology: mapper return shape consistency", () => {
  test("mapSpecies produces correct base fields", () => {
    const obj = mapSpecies({
      id: "sp-10",
      commonName: "Orca",
      scientificName: "Orcinus orca",
      conservationStatus: "least_concern",
      habitatRegion: "Global",
      summary: "Apex predator.",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:00Z",
    });
    expect(obj.__type).toBe("Species");
    expect(obj.__rid).toBe("Species/sp-10");
    expect(obj.__primaryKey).toBe("sp-10");
    expect(obj.commonName).toBe("Orca");
  });

  test("mapStation produces correct base fields", () => {
    const obj = mapStation({
      id: "stn-99",
      slug: "test-station",
      name: "Test Station",
      region: "Atlantic",
      status: "active",
      summary: "Test.",
      locationLabel: "0°N 0°E",
      depthM: 100,
      lastReported: "2024-09-01T00:00:00Z",
      heroMetric: "22°C",
      branding: {
        sponsorName: "NOAA",
        operatorName: "NOAA",
        logoUrl: null,
        logoLabel: "NOAA",
        exhibitTitle: "Test Station",
        accentColor: "cyan",
        publicDescription: "A test station.",
      },
    });
    expect(obj.__type).toBe("Station");
    expect(obj.__rid).toBe("Station/stn-99");
    expect(obj.__primaryKey).toBe("stn-99");
    expect(obj.region).toBe("Atlantic");
  });

  test("mapStationAlert normalizes unknown severity to 'low'", () => {
    const obj = mapStationAlert(
      {
        id: "alrt-x",
        title: "Unknown severity alert",
        severity: "unknown" as "high",
        status: "open",
        detail: "Test",
        detectedAt: "2024-09-01T00:00:00Z",
        acknowledgedAt: null,
        acknowledgedBy: null,
      },
      "stn-001",
    );
    expect(obj.severity).toBe("low");
    expect(obj.stationId).toBe("stn-001");
  });

  test("mapOperationalAlert sets stationId to null", () => {
    const obj = mapOperationalAlert({
      id: "op-001",
      source: "ingestion-service",
      ruleType: "source_stale",
      severity: "warning",
      status: "active",
      title: "Source stale",
      detail: null,
      detectedAt: 1725177600,
      resolvedAt: null,
      createdAt: "2024-09-01T00:00:00Z",
      updatedAt: "2024-09-01T00:00:00Z",
    });
    expect(obj.__type).toBe("MarineAlert");
    expect(obj.stationId).toBeNull();
    expect(obj.linkedInvestigationId).toBeNull();
  });

  test("mapInvestigation preserves state and confidence", () => {
    const obj = mapInvestigation({
      id: "inv-99",
      title: "Test Track",
      summary: "Correlated anomalies.",
      confidence: 65,
      state: "Correlated",
    });
    expect(obj.__type).toBe("Investigation");
    expect(obj.state).toBe("Correlated");
    expect(obj.confidence).toBe(65);
  });

  test("mapObservation builds primary key from stationId and timestamp", () => {
    const obj = mapObservation({
      stationId: "stn-001",
      timestamp: "2024-09-01T06:00:00Z",
      sstC: 22.5,
      waveHeightM: 1.0,
      windSpeedMps: 5.0,
      pressureHpa: 1012,
    });
    expect(obj.__type).toBe("Observation");
    expect(obj.__primaryKey).toBe("stn-001__2024-09-01T06:00:00Z");
    expect(obj.__rid).toBe("Observation/stn-001__2024-09-01T06:00:00Z");
  });

  test("buildRid formats as TypeId/primaryKey", () => {
    expect(buildRid("Station", "stn-001")).toBe("Station/stn-001");
    expect(buildRid("Species", "sp-42")).toBe("Species/sp-42");
  });
});

// ─── Link resolution ──────────────────────────────────────────────────────────

describe("Ontology: link resolution — Station_has_MarineAlert", () => {
  test("returns alerts belonging to the given station", () => {
    const result = resolveStationAlerts("stn-001", allAlerts);
    expect(result).toHaveLength(1);
    expect(result[0].__primaryKey).toBe("alert-001");
  });

  test("excludes alerts from other stations", () => {
    const result = resolveStationAlerts("stn-001", allAlerts);
    const keys = result.map((a) => a.__primaryKey);
    expect(keys).not.toContain("alert-002");
    expect(keys).not.toContain("alert-003");
  });

  test("excludes system-level alerts with null stationId", () => {
    const result = resolveStationAlerts("stn-001", allAlerts);
    const nullStations = result.filter((a) => a.stationId === null);
    expect(nullStations).toHaveLength(0);
  });
});

describe("Ontology: link resolution — Station_has_Observation", () => {
  test("returns observations for the correct station", () => {
    const result = resolveStationObservations("stn-001", allObservations);
    expect(result).toHaveLength(2);
    result.forEach((o) => expect(o.stationId).toBe("stn-001"));
  });

  test("excludes observations from other stations", () => {
    const result = resolveStationObservations("stn-001", allObservations);
    const keys = result.map((o) => o.__primaryKey);
    expect(keys).not.toContain(obsAtStationB.__primaryKey);
  });

  test("returns all observations for station B", () => {
    const result = resolveStationObservations("stn-002", allObservations);
    expect(result).toHaveLength(1);
    expect(result[0].__primaryKey).toBe(obsAtStationB.__primaryKey);
  });
});

describe("Ontology: link resolution — Species_observedAt_Observation", () => {
  test("returns observations from stations where species was sighted", () => {
    const result = resolveSpeciesObservations(["stn-001"], allObservations);
    expect(result).toHaveLength(2);
    result.forEach((o) => expect(o.stationId).toBe("stn-001"));
  });

  test("supports multi-station species range", () => {
    const result = resolveSpeciesObservations(["stn-001", "stn-002"], allObservations);
    expect(result).toHaveLength(3);
  });

  test("returns empty array when no sighting stations provided", () => {
    const result = resolveSpeciesObservations([], allObservations);
    expect(result).toHaveLength(0);
  });
});

describe("Ontology: link resolution — Investigation_involves_MarineAlert", () => {
  test("returns alerts linked to the given investigation", () => {
    const result = resolveInvestigationAlerts("inv-001", allAlerts);
    expect(result).toHaveLength(1);
    expect(result[0].__primaryKey).toBe("alert-001");
  });

  test("excludes alerts with no linked investigation", () => {
    const result = resolveInvestigationAlerts("inv-001", allAlerts);
    const keys = result.map((a) => a.__primaryKey);
    expect(keys).not.toContain("alert-002");
    expect(keys).not.toContain("alert-003");
  });
});

describe("Ontology: link resolution — Investigation_involves_Species", () => {
  test("returns species whose IDs are in the correlated set", () => {
    const result = resolveInvestigationSpecies(["sp-001"], allSpecies);
    expect(result).toHaveLength(1);
    expect(result[0].__primaryKey).toBe("sp-001");
  });

  test("returns multiple species when multiple are correlated", () => {
    const result = resolveInvestigationSpecies(["sp-001", "sp-002"], allSpecies);
    expect(result).toHaveLength(2);
  });

  test("excludes species not in the correlated set", () => {
    const result = resolveInvestigationSpecies(["sp-001"], allSpecies);
    const keys = result.map((s) => s.__primaryKey);
    expect(keys).not.toContain("sp-002");
  });
});

describe("Ontology: link resolution — Investigation_involves_Station", () => {
  test("returns stations whose IDs are in the linked set", () => {
    const result = resolveInvestigationStations(["stn-001"], allStations);
    expect(result).toHaveLength(1);
    expect(result[0].__primaryKey).toBe("stn-001");
  });

  test("returns multiple stations when multiple are linked", () => {
    const result = resolveInvestigationStations(["stn-001", "stn-002"], allStations);
    expect(result).toHaveLength(2);
  });
});

// ─── Missing target handling ──────────────────────────────────────────────────

describe("Ontology: missing target handling", () => {
  test("resolveStationAlerts returns empty array for unknown station", () => {
    expect(resolveStationAlerts("stn-unknown", allAlerts)).toHaveLength(0);
  });

  test("resolveStationObservations returns empty array for unknown station", () => {
    expect(resolveStationObservations("stn-unknown", allObservations)).toHaveLength(0);
  });

  test("resolveSpeciesObservations returns empty array when collection is empty", () => {
    expect(resolveSpeciesObservations(["stn-001"], [])).toHaveLength(0);
  });

  test("resolveInvestigationAlerts returns empty array for unknown investigation", () => {
    expect(resolveInvestigationAlerts("inv-unknown", allAlerts)).toHaveLength(0);
  });

  test("resolveInvestigationSpecies returns empty array for unknown species IDs", () => {
    expect(resolveInvestigationSpecies(["sp-unknown"], allSpecies)).toHaveLength(0);
  });

  test("resolveInvestigationStations returns empty array for unknown station IDs", () => {
    expect(resolveInvestigationStations(["stn-unknown"], allStations)).toHaveLength(0);
  });

  test("resolveInvestigationSpecies returns empty array when correlated IDs list is empty", () => {
    expect(resolveInvestigationSpecies([], allSpecies)).toHaveLength(0);
  });

  test("resolveInvestigationStations returns empty array when linked IDs list is empty", () => {
    expect(resolveInvestigationStations([], allStations)).toHaveLength(0);
  });

  test("all resolvers handle empty target collection gracefully", () => {
    expect(resolveStationAlerts("stn-001", [])).toHaveLength(0);
    expect(resolveStationObservations("stn-001", [])).toHaveLength(0);
    expect(resolveInvestigationAlerts("inv-001", [])).toHaveLength(0);
    expect(resolveInvestigationSpecies(["sp-001"], [])).toHaveLength(0);
    expect(resolveInvestigationStations(["stn-001"], [])).toHaveLength(0);
  });
});

// ─── Object Set filters ───────────────────────────────────────────────────────

describe("Ontology: ObjectSet applyFilters", () => {
  test("eq filter matches exact value", () => {
    const result = applyFilters(allStations as unknown as Record<string, unknown>[], [
      { field: "__primaryKey", operator: "eq", value: "stn-001" },
    ]);
    expect(result).toHaveLength(1);
  });

  test("in filter matches any value in set", () => {
    const result = applyFilters(allAlerts as unknown as Record<string, unknown>[], [
      { field: "severity", operator: "in", value: ["critical", "high"] },
    ]);
    expect(result).toHaveLength(2);
  });

  test("isNull filter matches null fields", () => {
    const result = applyFilters(allAlerts as unknown as Record<string, unknown>[], [
      { field: "stationId", operator: "isNull" },
    ]);
    expect(result).toHaveLength(1);
    expect((result[0] as unknown as MarineAlertOntologyObject).__primaryKey).toBe("alert-003");
  });

  test("isNotNull filter excludes null fields", () => {
    const result = applyFilters(allAlerts as unknown as Record<string, unknown>[], [
      { field: "stationId", operator: "isNotNull" },
    ]);
    expect(result).toHaveLength(2);
  });

  test("contains filter matches substrings", () => {
    const result = applyFilters(allSpecies as unknown as Record<string, unknown>[], [
      { field: "commonName", operator: "contains", value: "Whale" },
    ]);
    expect(result).toHaveLength(1);
  });

  test("empty filter list returns all items", () => {
    const result = applyFilters(allObservations as unknown as Record<string, unknown>[], []);
    expect(result).toHaveLength(3);
  });

  test("gte filter on numeric field", () => {
    const result = applyFilters(allObservations as unknown as Record<string, unknown>[], [
      { field: "sstC", operator: "gte", value: 25 },
    ]);
    expect(result).toHaveLength(2);
  });
});

describe("Ontology: buildObjectSetResult pagination", () => {
  test("returns all items when no limit or offset", () => {
    const result = buildObjectSetResult("Station", allStations, {}, "q-1");
    expect(result.ok).toBe(true);
    expect(result.objects).toHaveLength(2);
    expect(result.totalCount).toBe(2);
    expect(result.hasMore).toBe(false);
    expect(result.objectType).toBe("Station");
  });

  test("applies limit correctly", () => {
    const result = buildObjectSetResult("Observation", allObservations, { limit: 2 }, "q-2");
    expect(result.objects).toHaveLength(2);
    expect(result.totalCount).toBe(3);
    expect(result.hasMore).toBe(true);
  });

  test("applies offset correctly", () => {
    const result = buildObjectSetResult("Observation", allObservations, { offset: 2 }, "q-3");
    expect(result.objects).toHaveLength(1);
    expect(result.hasMore).toBe(false);
  });

  test("result includes executedAt ISO timestamp", () => {
    const result = buildObjectSetResult("Species", allSpecies, {}, "q-4");
    expect(() => new Date(result.executedAt)).not.toThrow();
    expect(new Date(result.executedAt).toISOString()).toBe(result.executedAt);
  });
});
