import { describe, expect, it } from "vitest";
import { explainInvestigation } from "./explainer";
import type { InvestigationOntologyNetworkContext } from "@marine/shared";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const BASE_INVESTIGATION = {
  __type: "Investigation" as const,
  __rid: "Investigation/inv-1",
  __primaryKey: "inv-1",
  title: "Coral Bleaching — Eastern Reef Sector",
  summary: "Elevated SST readings correlated with bleaching signals across 3 stations.",
  confidence: 78,
  state: "Correlated" as const,
};

const makeNetwork = (
  overrides: Partial<InvestigationOntologyNetworkContext> = {},
): InvestigationOntologyNetworkContext => ({
  investigation: BASE_INVESTIGATION,
  species: [],
  stations: [],
  observations: [],
  alerts: [],
  resolvedAt: "2024-06-01T12:00:00.000Z",
  ...overrides,
});

// ─── Core output shape ────────────────────────────────────────────────────────

describe("explainInvestigation — output shape", () => {
  it("returns all required fields", () => {
    const result = explainInvestigation(makeNetwork());
    expect(result).toHaveProperty("investigationId");
    expect(result).toHaveProperty("title");
    expect(result).toHaveProperty("summary");
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("confidenceScore");
    expect(result).toHaveProperty("state");
    expect(result).toHaveProperty("keyDrivers");
    expect(result).toHaveProperty("anomalies");
    expect(result).toHaveProperty("relationships");
    expect(result).toHaveProperty("likelyDrivers");
    expect(result).toHaveProperty("keyEntities");
    expect(result).toHaveProperty("anomalyNotes");
    expect(result).toHaveProperty("generatedAt");
  });

  it("structured outputs are always arrays and confidenceScore is numeric", () => {
    const result = explainInvestigation(makeNetwork());
    expect(Array.isArray(result.keyDrivers)).toBe(true);
    expect(Array.isArray(result.anomalies)).toBe(true);
    expect(Array.isArray(result.relationships)).toBe(true);
    expect(Array.isArray(result.likelyDrivers)).toBe(true);
    expect(Array.isArray(result.keyEntities)).toBe(true);
    expect(Array.isArray(result.anomalyNotes)).toBe(true);
    expect(typeof result.confidenceScore).toBe("number");
  });
});

// ─── Investigation node ───────────────────────────────────────────────────────

describe("explainInvestigation — investigation node", () => {
  it("maps investigation fields directly", () => {
    const result = explainInvestigation(makeNetwork());
    expect(result.investigationId).toBe("inv-1");
    expect(result.title).toBe("Coral Bleaching — Eastern Reef Sector");
    expect(result.summary).toBe(
      "Elevated SST readings correlated with bleaching signals across 3 stations.",
    );
    expect(result.confidence).toBe(78);
    expect(result.state).toBe("Correlated");
  });

  it("handles null investigation without throwing", () => {
    const result = explainInvestigation(makeNetwork({ investigation: null }));
    expect(result.investigationId).toBeNull();
    expect(result.title).toBe("Unnamed investigation");
    expect(result.summary).toBe("No summary available for this investigation.");
    expect(result.confidence).toBe(0);
    expect(result.state).toBe("Unknown");
  });

  it("handles Escalated state", () => {
    const result = explainInvestigation(
      makeNetwork({
        investigation: { ...BASE_INVESTIGATION, state: "Escalated" },
      }),
    );
    expect(result.state).toBe("Escalated");
  });
});

// ─── Likely drivers — alerts ──────────────────────────────────────────────────

describe("explainInvestigation — alert drivers", () => {
  it("emits primary driver for critical alert", () => {
    const result = explainInvestigation(
      makeNetwork({
        alerts: [
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a1",
            __primaryKey: "a1",
            title: "Critical thermal spike",
            severity: "critical",
            status: "open",
            detail: "SST exceeded threshold by 3.2°C",
            stationId: "stn-01",
            linkedInvestigationId: "inv-1",
            detectedAt: "2024-06-01T08:00:00Z",
          },
        ],
      }),
    );
    const driver = result.likelyDrivers.find((d) => d.weight === "primary");
    expect(driver).toBeDefined();
    expect(driver?.label).toContain("Critical thermal spike");
    expect(driver?.detail).toBe("SST exceeded threshold by 3.2°C");
  });

  it("emits primary driver for high alert", () => {
    const result = explainInvestigation(
      makeNetwork({
        alerts: [
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a2",
            __primaryKey: "a2",
            title: "High wave anomaly",
            severity: "high",
            status: "open",
            detail: null,
            stationId: "stn-02",
            linkedInvestigationId: "inv-1",
            detectedAt: "2024-06-01T09:00:00Z",
          },
        ],
      }),
    );
    const driver = result.likelyDrivers.find((d) => d.weight === "primary");
    expect(driver).toBeDefined();
    expect(driver?.label).toContain("High wave anomaly");
    // detail falls back to generated string when null
    expect(driver?.detail).toContain("high");
  });

  it("emits secondary driver for medium alert", () => {
    const result = explainInvestigation(
      makeNetwork({
        alerts: [
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a3",
            __primaryKey: "a3",
            title: "Dissolved oxygen drop",
            severity: "medium",
            status: "open",
            detail: "Oxygen dropped 15% below baseline",
            stationId: null,
            linkedInvestigationId: null,
            detectedAt: "2024-06-01T10:00:00Z",
          },
        ],
      }),
    );
    const driver = result.likelyDrivers.find((d) => d.weight === "secondary");
    expect(driver).toBeDefined();
    expect(driver?.label).toContain("Dissolved oxygen drop");
  });

  it("emits no drivers for low severity alerts", () => {
    const result = explainInvestigation(
      makeNetwork({
        alerts: [
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a4",
            __primaryKey: "a4",
            title: "Low priority notice",
            severity: "low",
            status: "open",
            detail: null,
            stationId: null,
            linkedInvestigationId: null,
            detectedAt: "2024-06-01T11:00:00Z",
          },
        ],
      }),
    );
    // Low severity alerts produce no drivers
    const alertDrivers = result.likelyDrivers.filter((d) =>
      d.label.includes("Low priority notice"),
    );
    expect(alertDrivers).toHaveLength(0);
  });
});

// ─── Likely drivers — species ─────────────────────────────────────────────────

describe("explainInvestigation — species drivers", () => {
  it("emits secondary driver for endangered species", () => {
    const result = explainInvestigation(
      makeNetwork({
        species: [
          {
            __type: "OntologySpeciesNode",
            __rid: "Species/sp-1",
            __primaryKey: "sp-1",
            commonName: "Hawksbill Turtle",
            scientificName: "Eretmochelys imbricata",
            conservationStatus: "endangered",
            habitatRegion: "Tropical Pacific",
            summary: "Forages on coral reefs.",
          },
        ],
      }),
    );
    const driver = result.likelyDrivers.find((d) => d.label.includes("Hawksbill Turtle"));
    expect(driver).toBeDefined();
    expect(driver?.weight).toBe("secondary");
    expect(driver?.detail).toContain("endangered");
  });

  it("emits secondary driver for critically_endangered species", () => {
    const result = explainInvestigation(
      makeNetwork({
        species: [
          {
            __type: "OntologySpeciesNode",
            __rid: "Species/sp-2",
            __primaryKey: "sp-2",
            commonName: "Smalltooth Sawfish",
            scientificName: "Pristis pectinata",
            conservationStatus: "critically_endangered",
            habitatRegion: "Western Atlantic",
            summary: "Critically rare sawfish.",
          },
        ],
      }),
    );
    const driver = result.likelyDrivers.find((d) =>
      d.label.includes("Smalltooth Sawfish"),
    );
    expect(driver?.weight).toBe("secondary");
    expect(driver?.detail).toContain("critically endangered");
  });

  it("does not emit a driver for least_concern species", () => {
    const result = explainInvestigation(
      makeNetwork({
        species: [
          {
            __type: "OntologySpeciesNode",
            __rid: "Species/sp-3",
            __primaryKey: "sp-3",
            commonName: "Blue Tang",
            scientificName: "Paracanthurus hepatus",
            conservationStatus: "least_concern",
            habitatRegion: "Pacific",
            summary: "Common reef fish.",
          },
        ],
      }),
    );
    const driver = result.likelyDrivers.find((d) => d.label.includes("Blue Tang"));
    expect(driver).toBeUndefined();
  });
});

// ─── Likely drivers — stations ────────────────────────────────────────────────

describe("explainInvestigation — station drivers", () => {
  it("emits background driver for a single station", () => {
    const result = explainInvestigation(
      makeNetwork({
        stations: [
          {
            __type: "OntologyStationNode",
            __rid: "Station/stn-1",
            __primaryKey: "stn-1",
            slug: "reef-north-01",
            name: "North Reef Station",
            region: "Northern Pacific",
            status: "online",
            summary: "Primary northern monitoring buoy.",
            locationLabel: "12.5°N, 140.2°E",
            depthM: 18,
          },
        ],
      }),
    );
    const driver = result.likelyDrivers.find((d) => d.weight === "background");
    expect(driver).toBeDefined();
    expect(driver?.label).toContain("North Reef Station");
  });

  it("emits multi-station background driver when count > 1", () => {
    const makeStation = (id: string, name: string) => ({
      __type: "OntologyStationNode" as const,
      __rid: `Station/${id}`,
      __primaryKey: id,
      slug: id,
      name,
      region: "Pacific",
      status: "online",
      summary: "Monitoring station.",
      locationLabel: "0°N, 0°E",
      depthM: null,
    });

    const result = explainInvestigation(
      makeNetwork({
        stations: [makeStation("stn-a", "Alpha"), makeStation("stn-b", "Beta")],
      }),
    );
    const driver = result.likelyDrivers.find((d) => d.label === "Multi-station involvement");
    expect(driver).toBeDefined();
    expect(driver?.detail).toContain("Alpha");
    expect(driver?.detail).toContain("Beta");
  });

  it("emits no station driver when stations array is empty", () => {
    const result = explainInvestigation(makeNetwork({ stations: [] }));
    const stationDrivers = result.likelyDrivers.filter((d) =>
      d.label.startsWith("Monitoring station:") || d.label === "Multi-station involvement",
    );
    expect(stationDrivers).toHaveLength(0);
  });
});

// ─── Key entities ─────────────────────────────────────────────────────────────

describe("explainInvestigation — key entities", () => {
  it("includes all species as entities", () => {
    const result = explainInvestigation(
      makeNetwork({
        species: [
          {
            __type: "OntologySpeciesNode",
            __rid: "Species/sp-1",
            __primaryKey: "sp-1",
            commonName: "Reef Shark",
            scientificName: "Carcharhinus perezi",
            conservationStatus: "near_threatened",
            habitatRegion: "Caribbean",
            summary: "Apex reef predator.",
          },
        ],
      }),
    );
    const entity = result.keyEntities.find((e) => e.type === "Species");
    expect(entity).toBeDefined();
    expect(entity?.label).toBe("Reef Shark");
    expect(entity?.rid).toBe("Species/sp-1");
  });

  it("includes all stations as entities", () => {
    const result = explainInvestigation(
      makeNetwork({
        stations: [
          {
            __type: "OntologyStationNode",
            __rid: "Station/stn-1",
            __primaryKey: "stn-1",
            slug: "stn-1",
            name: "South Atoll Buoy",
            region: "Southern Pacific",
            status: "degraded",
            summary: "Offshore monitoring buoy.",
            locationLabel: "10°S, 145°E",
            depthM: 30,
          },
        ],
      }),
    );
    const entity = result.keyEntities.find((e) => e.type === "Station");
    expect(entity).toBeDefined();
    expect(entity?.label).toBe("South Atoll Buoy");
  });

  it("includes critical and high alerts as entities", () => {
    const result = explainInvestigation(
      makeNetwork({
        alerts: [
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a1",
            __primaryKey: "a1",
            title: "Critical event",
            severity: "critical",
            status: "open",
            detail: "Major anomaly",
            stationId: null,
            linkedInvestigationId: null,
            detectedAt: "2024-06-01T00:00:00Z",
          },
        ],
      }),
    );
    const entity = result.keyEntities.find((e) => e.type === "MarineAlert");
    expect(entity).toBeDefined();
    expect(entity?.label).toBe("Critical event");
  });

  it("excludes low and medium alerts from key entities", () => {
    const result = explainInvestigation(
      makeNetwork({
        alerts: [
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a-med",
            __primaryKey: "a-med",
            title: "Medium notice",
            severity: "medium",
            status: "open",
            detail: null,
            stationId: null,
            linkedInvestigationId: null,
            detectedAt: "2024-06-01T00:00:00Z",
          },
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a-low",
            __primaryKey: "a-low",
            title: "Low notice",
            severity: "low",
            status: "open",
            detail: null,
            stationId: null,
            linkedInvestigationId: null,
            detectedAt: "2024-06-01T00:00:00Z",
          },
        ],
      }),
    );
    const alertEntities = result.keyEntities.filter((e) => e.type === "MarineAlert");
    expect(alertEntities).toHaveLength(0);
  });

  it("returns empty keyEntities for empty network", () => {
    const result = explainInvestigation(
      makeNetwork({ species: [], stations: [], alerts: [] }),
    );
    expect(result.keyEntities).toHaveLength(0);
  });
});

// ─── Anomaly notes ────────────────────────────────────────────────────────────

describe("explainInvestigation — anomaly notes", () => {
  it("generates a note for an observation with all fields", () => {
    const result = explainInvestigation(
      makeNetwork({
        observations: [
          {
            __type: "OntologyObservationNode",
            __rid: "Observation/stn-1__2024-06-01T08:00:00Z",
            __primaryKey: "stn-1__2024-06-01T08:00:00Z",
            stationId: "stn-1",
            timestamp: "2024-06-01T08:00:00Z",
            sstC: 29.4,
            waveHeightM: 1.2,
            windSpeedMps: 8.5,
            pressureHpa: 1008,
          },
        ],
      }),
    );
    expect(result.anomalyNotes).toHaveLength(1);
    const note = result.anomalyNotes[0];
    expect(note).toContain("stn-1");
    expect(note).toContain("29.4°C");
    expect(note).toContain("1.2m");
    expect(note).toContain("8.5m/s");
    expect(note).toContain("1008hPa");
  });

  it("generates a partial note for an observation with only SST", () => {
    const result = explainInvestigation(
      makeNetwork({
        observations: [
          {
            __type: "OntologyObservationNode",
            __rid: "Observation/stn-2__t",
            __primaryKey: "stn-2__t",
            stationId: "stn-2",
            timestamp: "2024-06-01T09:00:00Z",
            sstC: 31.0,
            waveHeightM: null,
            windSpeedMps: null,
            pressureHpa: null,
          },
        ],
      }),
    );
    expect(result.anomalyNotes).toHaveLength(1);
    expect(result.anomalyNotes[0]).toContain("31°C");
    expect(result.anomalyNotes[0]).not.toContain("wave");
  });

  it("skips observations where all measurement fields are null", () => {
    const result = explainInvestigation(
      makeNetwork({
        observations: [
          {
            __type: "OntologyObservationNode",
            __rid: "Observation/stn-3__t",
            __primaryKey: "stn-3__t",
            stationId: "stn-3",
            timestamp: "2024-06-01T10:00:00Z",
            sstC: null,
            waveHeightM: null,
            windSpeedMps: null,
            pressureHpa: null,
          },
        ],
      }),
    );
    expect(result.anomalyNotes).toHaveLength(0);
  });

  it("generates one note per observation", () => {
    const makeObs = (id: string, sst: number) => ({
      __type: "OntologyObservationNode" as const,
      __rid: `Observation/${id}`,
      __primaryKey: id,
      stationId: "stn-x",
      timestamp: `2024-06-01T0${id}:00Z`,
      sstC: sst,
      waveHeightM: null,
      windSpeedMps: null,
      pressureHpa: null,
    });

    const result = explainInvestigation(
      makeNetwork({ observations: [makeObs("1", 28), makeObs("2", 30)] }),
    );
    expect(result.anomalyNotes).toHaveLength(2);
  });
});

// ─── Full network integration ─────────────────────────────────────────────────

describe("explainInvestigation — full network", () => {
  it("correctly handles a complete network with all entity types", () => {
    const network: InvestigationOntologyNetworkContext = {
      investigation: BASE_INVESTIGATION,
      species: [
        {
          __type: "OntologySpeciesNode",
          __rid: "Species/sp-e",
          __primaryKey: "sp-e",
          commonName: "Green Sea Turtle",
          scientificName: "Chelonia mydas",
          conservationStatus: "endangered",
          habitatRegion: "Tropical Pacific",
          summary: "Nests on reef-adjacent beaches.",
        },
      ],
      stations: [
        {
          __type: "OntologyStationNode",
          __rid: "Station/stn-main",
          __primaryKey: "stn-main",
          slug: "main-reef",
          name: "Main Reef Station",
          region: "Eastern Pacific",
          status: "online",
          summary: "Primary reef monitoring buoy.",
          locationLabel: "5°N, 130°E",
          depthM: 12,
        },
      ],
      observations: [
        {
          __type: "OntologyObservationNode",
          __rid: "Observation/stn-main__t1",
          __primaryKey: "stn-main__t1",
          stationId: "stn-main",
          timestamp: "2024-06-01T06:00:00Z",
          sstC: 30.1,
          waveHeightM: 0.8,
          windSpeedMps: null,
          pressureHpa: null,
        },
      ],
      alerts: [
        {
          __type: "MarineAlert",
          __rid: "MarineAlert/alert-crit",
          __primaryKey: "alert-crit",
          title: "Bleaching threshold exceeded",
          severity: "critical",
          status: "open",
          detail: "DHW reading at 8.2 — bleaching highly probable.",
          stationId: "stn-main",
          linkedInvestigationId: "inv-1",
          detectedAt: "2024-06-01T04:00:00Z",
        },
      ],
      resolvedAt: "2024-06-01T12:00:00.000Z",
    };

    const result = explainInvestigation(network);

    expect(result.investigationId).toBe("inv-1");
    expect(result.confidence).toBe(78);

    // Has a primary driver from the critical alert
    const primaryDrivers = result.likelyDrivers.filter((d) => d.weight === "primary");
    expect(primaryDrivers.length).toBeGreaterThanOrEqual(1);

    // Has a secondary driver from the endangered species
    const secondaryDrivers = result.likelyDrivers.filter((d) => d.weight === "secondary");
    expect(secondaryDrivers.length).toBeGreaterThanOrEqual(1);

    // Has key entities for each type
    const types = result.keyEntities.map((e) => e.type);
    expect(types).toContain("Species");
    expect(types).toContain("Station");
    expect(types).toContain("MarineAlert");

    // Has anomaly notes for grounded alert/observation evidence
    expect(result.anomalyNotes.length).toBeGreaterThanOrEqual(1);
    expect(result.anomalyNotes.some((note) => note.includes("30.1°C"))).toBe(true);
  });
});

// ─── Structured evidence ─────────────────────────────────────────────────────

describe("explainInvestigation — structured evidence", () => {
  it("builds relationships with provenance timestamps", () => {
    const result = explainInvestigation(
      makeNetwork({
        species: [
          {
            __type: "OntologySpeciesNode",
            __rid: "Species/sp-structured",
            __primaryKey: "sp-structured",
            commonName: "Coral Trout",
            scientificName: "Plectropomus leopardus",
            conservationStatus: "vulnerable",
            habitatRegion: "Reef boundary",
            summary: "Coral-linked reef predator.",
          },
        ],
        stations: [
          {
            __type: "OntologyStationNode",
            __rid: "Station/stn-structured",
            __primaryKey: "stn-structured",
            slug: "structured-station",
            name: "Structured Station",
            region: "Reef boundary",
            status: "active",
            summary: "Linked to the current case.",
            locationLabel: "17°S 147°E",
            depthM: 11,
          },
        ],
        observations: [
          {
            __type: "OntologyObservationNode",
            __rid: "Observation/stn-structured__t1",
            __primaryKey: "stn-structured__t1",
            stationId: "stn-structured",
            timestamp: "2024-06-01T06:00:00Z",
            sstC: 30.3,
            waveHeightM: 1.1,
            windSpeedMps: 9.2,
            pressureHpa: 1006,
          },
        ],
        alerts: [
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a-structured",
            __primaryKey: "a-structured",
            title: "Structured thermal alert",
            severity: "critical",
            status: "open",
            detail: "Thermal breach persists.",
            stationId: "stn-structured",
            linkedInvestigationId: "inv-1",
            detectedAt: "2024-06-01T05:00:00Z",
          },
        ],
      }),
    );

    const relationIds = result.relationships.map((relation) => relation.linkTypeId);

    expect(relationIds).toContain("Investigation_involves_MarineAlert");
    expect(relationIds).toContain("Investigation_involves_Species");
    expect(relationIds).toContain("Investigation_involves_Station");
    expect(relationIds).toContain("Station_has_Observation");

    const alertRelation = result.relationships.find((relation) => relation.linkTypeId === "Investigation_involves_MarineAlert");
    const observationRelation = result.relationships.find((relation) => relation.linkTypeId === "Station_has_Observation");

    expect(alertRelation?.timestamp).toBe("2024-06-01T05:00:00Z");
    expect(observationRelation?.timestamp).toBe("2024-06-01T06:00:00Z");
  });

  it("raises confidenceScore when corroborating alerts and multiple source types are present", () => {
    const lowConfidence = explainInvestigation(makeNetwork({ alerts: [] }));
    const highConfidence = explainInvestigation(
      makeNetwork({
        species: [
          {
            __type: "OntologySpeciesNode",
            __rid: "Species/sp-confidence",
            __primaryKey: "sp-confidence",
            commonName: "Leatherback Turtle",
            scientificName: "Dermochelys coriacea",
            conservationStatus: "vulnerable",
            habitatRegion: "North Pacific",
            summary: "Reef-adjacent visitor.",
          },
        ],
        stations: [
          {
            __type: "OntologyStationNode",
            __rid: "Station/stn-confidence",
            __primaryKey: "stn-confidence",
            slug: "confidence-station",
            name: "Confidence Station",
            region: "North Pacific",
            status: "active",
            summary: "Additional corroborating source.",
            locationLabel: "18°N 144°W",
            depthM: 15,
          },
        ],
        observations: [
          {
            __type: "OntologyObservationNode",
            __rid: "Observation/stn-confidence__t1",
            __primaryKey: "stn-confidence__t1",
            stationId: "stn-confidence",
            timestamp: "2024-06-01T07:00:00Z",
            sstC: 31.2,
            waveHeightM: 2.2,
            windSpeedMps: 11.5,
            pressureHpa: 1004,
          },
        ],
        alerts: [
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a-confidence",
            __primaryKey: "a-confidence",
            title: "Confidence alert",
            severity: "critical",
            status: "open",
            detail: "Thermal breach corroborated.",
            stationId: "stn-confidence",
            linkedInvestigationId: "inv-1",
            detectedAt: "2024-06-01T07:15:00Z",
          },
          {
            __type: "MarineAlert",
            __rid: "MarineAlert/a-confidence-2",
            __primaryKey: "a-confidence-2",
            title: "Second corroborating alert",
            severity: "high",
            status: "open",
            detail: "Secondary confirmation.",
            stationId: "stn-confidence",
            linkedInvestigationId: "inv-1",
            detectedAt: "2024-06-01T07:20:00Z",
          },
        ],
      }),
    );

    expect(lowConfidence.confidenceScore).toBeLessThan(highConfidence.confidenceScore);
    expect(highConfidence.confidenceScore).toBeGreaterThan(0);
    expect(highConfidence.confidenceScore).toBeLessThanOrEqual(1);
  });

  it("keeps legacy aliases in sync with the structured fields", () => {
    const result = explainInvestigation(makeNetwork());

    expect(result.likelyDrivers).toEqual(result.keyDrivers);
    expect(result.anomalyNotes).toHaveLength(result.anomalies.length);
    expect(result.keyEntities.length).toBeGreaterThanOrEqual(0);
  });
});
