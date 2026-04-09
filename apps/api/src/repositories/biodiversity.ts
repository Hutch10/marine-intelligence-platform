import type {
  SpeciesPopulationEstimate,
  SpeciesSurveyCount,
  SpeciesAcousticDetection,
  SpeciesTrack,
  SpeciesTrackPoint,
  SpeciesStrandingEvent,
  SpeciesDistributionRegion,
  SpeciesThreatProfile,
} from "@marine/shared";
import { randomUUID } from "node:crypto";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";

// --- Internal Row Types ---

interface MetadataRows {
  source: string;
  source_url: string | null;
  method: string;
  observed_at: number | string;
  ingested_at: number | string;
  updated_at: number | string;
  confidence_score: number | string;
  coverage_score: number | string;
  verification_state: string;
}

interface PopulationEstimateRow extends MetadataRows {
  id: string;
  species_id: string;
  region_id: string | null;
  count: number;
  lower_bound: number | null;
  upper_bound: number | null;
  unit: string;
}

interface SurveyCountRow extends MetadataRows {
  id: string;
  species_id: string;
  region: string;
  survey_id: string;
  count: number;
  latitude: number;
  longitude: number;
}

interface AcousticDetectionRow extends MetadataRows {
  id: string;
  species_id: string;
  station_id: string;
  frequency_hz: number | null;
  call_type: string | null;
  duration_ms: number | null;
}

interface TrackRow extends MetadataRows {
  id: string;
  species_id: string;
  individual_id: string | null;
}

interface TrackPointRow extends MetadataRows {
  id: string;
  track_id: string;
  latitude: number;
  longitude: number;
  depth_m: number | null;
}

interface StrandingEventRow extends MetadataRows {
  id: string;
  species_id: string;
  region: string;
  latitude: number;
  longitude: number;
  condition: string;
  outcome: string;
}

interface DistributionRegionRow extends MetadataRows {
  id: string;
  species_id: string;
  region_id: string;
  season: string;
  geometry: string;
}

interface ThreatProfileRow extends MetadataRows {
  id: string;
  species_id: string;
  primary_threats: string;
  climate_vulnerability: string;
  habitat_loss_risk: number;
}

// --- Mappers ---

function mapMetadata(row: MetadataRows): any {
  return {
    source: row.source,
    sourceUrl: row.source_url ?? undefined,
    method: row.method,
    observedAt: new Date(row.observed_at).toISOString(),
    ingestedAt: new Date(row.ingested_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    confidenceScore: Number(row.confidence_score),
    coverageScore: Number(row.coverage_score),
    verificationState: row.verification_state as any,
  };
}

function toPopulationEstimate(row: PopulationEstimateRow): SpeciesPopulationEstimate {
  return {
    ...mapMetadata(row),
    speciesId: row.species_id,
    regionId: row.region_id ?? undefined,
    count: row.count,
    lowerBound: row.lower_bound ?? undefined,
    upperBound: row.upper_bound ?? undefined,
    unit: row.unit as any,
  };
}

// --- Repository Implementation ---

export interface BiodiversityRepository {
  listPopulationEstimates(speciesId: string): SpeciesPopulationEstimate[];
  listSurveyCounts(speciesId: string): SpeciesSurveyCount[];
  listAcousticDetections(speciesId: string): SpeciesAcousticDetection[];
  listTracks(speciesId: string): SpeciesTrack[];
  listStrandingEvents(speciesId: string): SpeciesStrandingEvent[];
  getDistributionRegions(speciesId: string): SpeciesDistributionRegion[];
  getThreatProfile(speciesId: string): SpeciesThreatProfile | null;
  listAnatomy(speciesId: string): any[];
  listFossils(speciesId: string): any[];
  listEcosystems(speciesId: string): any[];
  linkEvidence(input: any): void;
  listEvidenceForTarget(targetId: string, targetTable: string): any[];
}

export function createBiodiversityRepository(): BiodiversityRepository {
  const dbPath = resolveDatabasePath();
  
  const withDb = <T>(fn: (db: SqliteDatabaseLike) => T): T | [] => {
    if (!hasDatabasePath(dbPath)) return [] as any;
    const db = openReadOnlyDatabase(dbPath);
    try {
      return fn(db);
    } finally {
      db.close();
    }
  };

  return {
    listPopulationEstimates: (speciesId) => 
      withDb(db => db.prepare("SELECT * FROM species_population_estimates WHERE species_id = ?").all(speciesId).map(row => toPopulationEstimate(row as any))) as any,
    
    listSurveyCounts: (speciesId) => 
      withDb(db => db.prepare("SELECT * FROM species_survey_counts WHERE species_id = ?").all(speciesId).map(row => {
        const r = row as any;
        return {
          ...mapMetadata(r),
          id: r.id,
          speciesId: r.species_id,
          surveyId: r.survey_id,
          region: r.region,
          count: r.count,
          latitude: r.latitude,
          longitude: r.longitude,
        };
      })) as any,

    listAcousticDetections: (speciesId) =>
      withDb(db => db.prepare("SELECT * FROM species_acoustic_detections WHERE species_id = ?").all(speciesId).map(row => {
        const r = row as any;
        return {
          ...mapMetadata(r),
          id: r.id,
          speciesId: r.species_id,
          stationId: r.station_id,
          frequencyHz: r.frequency_hz,
          callType: r.call_type,
          durationMs: r.duration_ms,
        };
      })) as any,

    listTracks: (speciesId) =>
      withDb(db => {
        const tracks = db.prepare("SELECT * FROM species_tracks WHERE species_id = ?").all(speciesId) as any[];
        return tracks.map(t => {
          const points = db.prepare("SELECT * FROM species_track_points WHERE track_id = ?").all(t.id) as any[];
          return {
            ...mapMetadata(t),
            id: t.id,
            speciesId: t.species_id,
            individualId: t.individual_id,
            points: points.map(p => ({
              ...mapMetadata(p),
              trackId: p.track_id,
              latitude: p.latitude,
              longitude: p.longitude,
              depthM: p.depth_m,
            })),
          };
        });
      }) as any,

    listStrandingEvents: (speciesId) =>
      withDb(db => db.prepare("SELECT * FROM species_stranding_events WHERE species_id = ?").all(speciesId).map(row => {
        const r = row as any;
        return {
          ...mapMetadata(r),
          id: r.id,
          speciesId: r.species_id,
          region: r.region,
          latitude: r.latitude,
          longitude: r.longitude,
          condition: r.condition as any,
          outcome: r.outcome,
        };
      })) as any,

    getDistributionRegions: (speciesId) =>
      withDb(db => db.prepare("SELECT * FROM species_distribution_regions WHERE species_id = ?").all(speciesId).map(row => {
        const r = row as any;
        return {
          ...mapMetadata(r),
          id: r.id,
          speciesId: r.species_id,
          regionId: r.region_id,
          season: r.season as any,
          geometry: JSON.parse(r.geometry),
        };
      })) as any,

    getThreatProfile: (speciesId) => {
      const db = openReadOnlyDatabase(dbPath);
      try {
        const row = db.prepare("SELECT * FROM species_threat_profiles WHERE species_id = ?").all(speciesId)[0] as any;
        if (!row) return null;
        return {
          ...mapMetadata(row),
          speciesId: row.species_id,
          primaryThreats: JSON.parse(row.primary_threats),
          climateVulnerability: row.climate_vulnerability as any,
          habitatLossRisk: row.habitat_loss_risk,
        };
      } finally {
        db.close();
      }
    },

    listAnatomy: (speciesId) =>
      withDb(db => db.prepare("SELECT * FROM species_anatomy WHERE species_id = ?").all(speciesId).map(row => {
        const r = row as any;
        return {
          ...mapMetadata(r),
          id: r.id,
          speciesId: r.species_id,
          partName: r.part_name,
          description: r.description,
          imageUrl: r.image_url,
        };
      })) as any,

    listFossils: (speciesId) =>
      withDb(db => db.prepare("SELECT * FROM species_fossils WHERE species_id = ?").all(speciesId).map(row => {
        const r = row as any;
        return {
          ...mapMetadata(r),
          id: r.id,
          speciesId: r.species_id,
          era: r.era,
          locationFound: r.location_found,
          description: r.description,
        };
      })) as any,

    listEcosystems: (speciesId) =>
      withDb(db => db.prepare("SELECT * FROM species_ecosystems WHERE species_id = ?").all(speciesId).map(row => {
        const r = row as any;
        return {
          ...mapMetadata(r),
          id: r.id,
          speciesId: r.species_id,
          ecosystemType: r.ecosystem_type,
          role: r.role,
          dependencies: JSON.parse(r.dependencies),
        };
      })) as any,

    linkEvidence: (input) => {
      const db = openWritableDatabase(dbPath);
      try {
        db.prepare(`
          INSERT INTO species_evidence_links 
          (id, target_id, target_table, signal_type, contribution, confidence_contribution, source, source_url)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          crypto.randomUUID(),
          input.targetId,
          input.targetTable,
          input.signalType,
          input.contribution,
          input.confidenceContribution,
          input.source,
          input.sourceUrl ?? null
        );
      } finally {
        db.close();
      }
    },

    listEvidenceForTarget: (targetId, targetTable) =>
      withDb(db => db.prepare("SELECT * FROM species_evidence_links WHERE target_id = ? AND target_table = ?").all(targetId, targetTable).map(row => {
        const r = row as any;
        return {
          id: r.id,
          targetId: r.target_id,
          targetTable: r.target_table,
          signalType: r.signal_type,
          contribution: r.contribution,
          confidenceContribution: r.confidence_contribution,
          source: r.source,
          sourceUrl: r.source_url,
          createdAt: r.created_at,
        };
      })) as any,
  };
}
