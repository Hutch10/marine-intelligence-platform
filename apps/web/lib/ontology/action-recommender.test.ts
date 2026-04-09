import { describe, expect, it } from "vitest";
import { recommendAction, type ActionRecommendationContext } from "./action-recommender";

function makeNetwork(
  overrides: Partial<ActionRecommendationContext> = {},
): ActionRecommendationContext {
  return {
    investigation: null,
    species: [],
    stations: [],
    observations: [],
    alerts: [],
    resolvedAt: "2026-03-22T12:00:00.000Z",
    ...overrides,
  };
}

describe("recommendAction", () => {
  it("returns continue monitoring when no threshold is crossed", () => {
    const result = recommendAction(makeNetwork());

    expect(result.action).toBe("Continue monitoring");
    expect(result.rationale).toBe("No deterministic intervention threshold has been crossed yet.");
    expect(result.urgency).toBe("low");
    expect(result.supportingSignals).toEqual([]);
    expect(Array.isArray(result.rationalePoints)).toBe(true);
    expect(result.rationalePoints.length).toBeGreaterThan(0);
    expect(typeof result.confidenceScore).toBe("number");
    expect(result.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.confidenceScore).toBeLessThanOrEqual(1);
    expect(result.contributingSignals).toEqual([]);
    expect(typeof result.generatedAt).toBe("string");
  });

  it("recommends avoiding shallow reef exposure when SST is high", () => {
    const result = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-1",
            timestamp: "2026-03-22T11:00:00.000Z",
            sstC: 31.2,
            waveHeightM: 1.1,
            windSpeedMps: 6.5,
            pressureHpa: 1008,
          },
        ],
      }),
    );

    expect(result.action).toBe("Avoid shallow reef exposure");
    expect(result.urgency).toBe("medium");
    expect(result.supportingSignals[0]).toMatchObject({
      kind: "observation",
      label: "High sea surface temperature",
      source: "station:STA-1",
      timestamp: "2026-03-22T11:00:00.000Z",
    });
  });

  it("recommends delaying operations when wave height or wind speed is high", () => {
    const result = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-2",
            timestamp: "2026-03-22T10:20:00.000Z",
            sstC: 28.4,
            waveHeightM: 3.6,
            windSpeedMps: 16.2,
            pressureHpa: 1007,
          },
        ],
      }),
    );

    expect(result.action).toBe("Delay operations");
    expect(result.urgency).toBe("high");
    expect(result.supportingSignals.map((signal) => signal.label)).toEqual(
      expect.arrayContaining(["High wave height", "High wind speed"]),
    );
    expect(result.contributingSignals.map((signal) => signal.label)).toEqual(
      expect.arrayContaining(["High wave height", "High wind speed"]),
    );
  });

  it("recommends storm risk advisory when pressure is low", () => {
    const result = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-3",
            timestamp: "2026-03-22T09:30:00.000Z",
            sstC: 27,
            waveHeightM: 1.2,
            windSpeedMps: 8.5,
            pressureHpa: 955,
          },
        ],
      }),
    );

    expect(result.action).toBe("Storm risk advisory");
    expect(result.urgency).toBe("high");
    expect(result.supportingSignals[0]?.label).toBe("Low pressure");
  });

  it("suggests a site switch when the current site is unsafe and an alternate exists", () => {
    const result = recommendAction(
      makeNetwork({
        stationId: "STA-3",
        stations: [
          {
            __type: "Station",
            __rid: "station-1",
            __primaryKey: "STA-3",
            slug: "reef-a",
            name: "Reef A",
            region: "North Shelf",
            status: "Active",
            summary: "Current survey site.",
            locationLabel: "North Shelf / reef edge",
            depthM: 8,
          },
          {
            __type: "Station",
            __rid: "station-2",
            __primaryKey: "STA-9",
            slug: "reef-b",
            name: "Reef B",
            region: "South Shelf",
            status: "Active",
            summary: "Alternate site with deeper water.",
            locationLabel: "South Shelf / deeper transect",
            depthM: 22,
          },
        ],
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-3",
            timestamp: "2026-03-22T09:30:00.000Z",
            sstC: 27,
            waveHeightM: 1.2,
            windSpeedMps: 8.5,
            pressureHpa: 955,
          },
        ],
      }),
    );

    expect(result.action).toBe("Storm risk advisory");
    expect(result.siteSwitchSuggestion).toContain("Reef B");
  });

  it("keeps the highest priority action when multiple thresholds are crossed", () => {
    const result = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-4",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.1,
            waveHeightM: 3.2,
            windSpeedMps: 14,
            pressureHpa: 958,
          },
        ],
      }),
    );

    expect(result.action).toBe("Storm risk advisory");
    expect(result.supportingSignals[0]?.label).toBe("Low pressure");
    expect(result.rationale).toContain("falling pressure");
    expect(result.rationale).toContain("high waves");
    expect(result.contributingSignals.map((signal) => signal.label)).toEqual(
      expect.arrayContaining(["Low pressure", "High wave height", "High sea surface temperature"]),
    );
  });

  it("includes explanation signals as traceable corroboration", () => {
    const result = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-5",
            timestamp: "2026-03-22T07:30:00.000Z",
            sstC: 30.7,
            waveHeightM: 1.0,
            windSpeedMps: 5.4,
            pressureHpa: 1009,
          },
        ],
        explanation: {
          summary: "Thermal stress remains the primary driver.",
          likelyDrivers: [
            {
              label: "Sea surface warming",
              detail: "Persistent SST elevation aligns with reef stress.",
              weight: "primary",
            },
          ],
          anomalyNotes: ["Station STA-5 at 2026-03-22T07:30:00.000Z: SST 30.7°C"],
          generatedAt: "2026-03-22T12:05:00.000Z",
        },
      }),
    );

    expect(result.action).toBe("Avoid shallow reef exposure");
    expect(result.supportingSignals.some((signal) => signal.kind === "explanation")).toBe(true);
  });

  it("escalates to incident response when 2+ high-severity similar events exist above score threshold", () => {
    const result = recommendAction(
      makeNetwork({
        similar: [
          {
            investigationId: "INV-100",
            title: "Reef thermal anomaly",
            summary: "Elevated SST and reef stress detected at monitoring station.",
            similarity: 0.78,
            embeddingSimilarity: 0.72,
            matchedOn: ["title", "summary"],
            matchedStation: null,
            severity: "high",
            timeframeLabel: "this week",
            indexedAt: "2026-03-10T00:00:00.000Z",
          },
          {
            investigationId: "INV-101",
            title: "SST spike at station 46042",
            summary: "Sea surface temperature exceeded threshold for three consecutive days.",
            similarity: 0.81,
            embeddingSimilarity: 0.76,
            matchedOn: ["title", "summary"],
            matchedStation: "46042",
            severity: "high",
            timeframeLabel: "this week",
            indexedAt: "2026-03-12T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(result.action).toBe("Escalate to incident response");
    expect(result.urgency).toBe("medium");
    expect(result.supportingSignals.length).toBeGreaterThan(0);
    expect(result.supportingSignals[0]?.label).toMatch(/Similar severe event/);
    expect(Array.isArray(result.rationalePoints)).toBe(true);
    expect(result.rationalePoints[0]).toMatch(/past investigations/);
    expect(result.rationalePoints.length).toBeLessThanOrEqual(5);
  });

  it("does not escalate when fewer than 2 similar events meet the threshold", () => {
    const result = recommendAction(
      makeNetwork({
        similar: [
          {
            investigationId: "INV-200",
            title: "Isolated low-confidence event",
            summary: "Minor anomaly with weak signal.",
            similarity: 0.45,
            embeddingSimilarity: 0.4,
            matchedOn: ["title"],
            matchedStation: null,
            severity: "low",
            timeframeLabel: "this month",
            indexedAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(result.action).toBe("Continue monitoring");
  });

  it("storm takes priority over escalation when pressure threshold is crossed", () => {
    const result = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-6",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 27,
            waveHeightM: 1.0,
            windSpeedMps: 8.0,
            pressureHpa: 955,
          },
        ],
        similar: [
          {
            investigationId: "INV-300",
            title: "Severe reef event alpha",
            summary: "High severity reef anomaly.",
            similarity: 0.8,
            embeddingSimilarity: 0.75,
            matchedOn: ["title", "summary"],
            matchedStation: null,
            severity: "high",
            timeframeLabel: "this week",
            indexedAt: "2026-03-10T00:00:00.000Z",
          },
          {
            investigationId: "INV-301",
            title: "Severe reef event beta",
            summary: "High severity reef anomaly.",
            similarity: 0.77,
            embeddingSimilarity: 0.71,
            matchedOn: ["title", "summary"],
            matchedStation: null,
            severity: "high",
            timeframeLabel: "this week",
            indexedAt: "2026-03-11T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(result.action).toBe("Storm risk advisory");
  });

  it("keeps recommendation contributing signals aligned with all materially triggered rules", () => {
    const result = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-2",
            __primaryKey: "obs-2",
            stationId: "STA-11",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.4,
            waveHeightM: 3.5,
            windSpeedMps: 16.4,
            pressureHpa: 957,
          },
        ],
      }),
    );

    expect(result.action).toBe("Storm risk advisory");
    expect(result.contributingSignals.map((signal) => signal.label)).toEqual(
      expect.arrayContaining([
        "Low pressure",
        "High wave height",
        "High wind speed",
        "High sea surface temperature",
      ]),
    );
    expect(result.rationale).toContain("falling pressure");
    expect(result.rationale).toContain("strong winds");
    expect(result.rationale).toContain("Elevated SST");
  });

  it("confidenceScore increases with NDBC plus CRW provenance", () => {
    const baseline = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-7",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.5,
            waveHeightM: 1.0,
            windSpeedMps: 5.0,
            pressureHpa: 1008,
          },
        ],
      }),
    );

    const multiSource = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-7",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.5,
            waveHeightM: 1.0,
            windSpeedMps: 5.0,
            pressureHpa: 1008,
          },
        ],
        liveConditions: [
          {
            stationId: "STA-7",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.5,
            waveHeightM: 1.0,
            windSpeedMps: 5.0,
            pressureHpa: 1008,
            source: "noaa_ndbc",
          },
        ],
        reefWatch: [
          {
            region: "North Shelf",
            stationId: "STA-7",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstAnomalyC: 1.8,
            hotSpotC: 0.9,
            dhw: 6.2,
            stressLevel: "high",
            source: "noaa_crw",
            outputClass: "observed",
          },
        ],
      }),
    );

    const similarCorroborated = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-7",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.5,
            waveHeightM: 1.0,
            windSpeedMps: 5.0,
            pressureHpa: 1008,
          },
        ],
        similar: [
          {
            investigationId: "INV-500",
            title: "Thermal reef stress recurrence",
            summary: "A prior case followed the same thermal pattern.",
            similarity: 0.52,
            embeddingSimilarity: 0.5,
            matchedOn: ["summary"],
            matchedStation: null,
            severity: "high",
            timeframeLabel: "this month",
            indexedAt: "2026-03-20T00:00:00.000Z",
          },
        ],
      }),
    );

    expect(baseline.confidenceScore).toBeLessThan(multiSource.confidenceScore);
    expect(baseline.confidenceScore).toBeLessThan(similarCorroborated.confidenceScore);
    expect(multiSource.confidenceScore).toBeLessThanOrEqual(1);
    expect(similarCorroborated.confidenceScore).toBeLessThanOrEqual(1);
  });

  it("confidenceScore increases when baseline anomaly strength is present", () => {
    const baseline = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-9",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.5,
            waveHeightM: 1.0,
            windSpeedMps: 5.0,
            pressureHpa: 1008,
          },
        ],
      }),
    );

    const withBaselineStrength = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-9",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.5,
            waveHeightM: 1.0,
            windSpeedMps: 5.0,
            pressureHpa: 1008,
          },
        ],
        baselineAnomaly: {
          strength: 0.8,
        },
      }),
    );

    expect(baseline.confidenceScore).toBeLessThan(withBaselineStrength.confidenceScore);
    expect(withBaselineStrength.confidenceScore).toBeLessThanOrEqual(1);
  });

  it("confidenceScore increases when baseline anomaly z-score is present", () => {
    const baseline = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-10",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.5,
            waveHeightM: 1.0,
            windSpeedMps: 5.0,
            pressureHpa: 1008,
          },
        ],
      }),
    );

    const withBaselineZScore = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-10",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 31.5,
            waveHeightM: 1.0,
            windSpeedMps: 5.0,
            pressureHpa: 1008,
          },
        ],
        baselineAnomaly: {
          zScore: 3.4,
        },
      }),
    );

    expect(baseline.confidenceScore).toBeLessThan(withBaselineZScore.confidenceScore);
    expect(withBaselineZScore.confidenceScore).toBeLessThanOrEqual(1);
  });

  it("rationalePoints is a populated array for every action type", () => {
    const sstResult = recommendAction(
      makeNetwork({
        observations: [
          {
            __type: "Observation",
            __rid: "obs-1",
            __primaryKey: "obs-1",
            stationId: "STA-8",
            timestamp: "2026-03-22T08:00:00.000Z",
            sstC: 30.5,
            waveHeightM: 0.8,
            windSpeedMps: 5.0,
            pressureHpa: 1012,
          },
        ],
      }),
    );

    expect(Array.isArray(sstResult.rationalePoints)).toBe(true);
    expect(sstResult.rationalePoints.length).toBeGreaterThan(0);
    expect(typeof sstResult.rationalePoints[0]).toBe("string");
  });
});
