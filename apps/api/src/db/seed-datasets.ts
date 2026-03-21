import { mkdirSync } from "fs";
import { dirname } from "path";
import { aiLabWorkspaceData, dataExplorerWorkspaceData } from "../../../web/lib/api/mock-data";
import { resolveDatabasePath } from "./client";

function parseMockRecordCount(value: string): number | null {
  const normalized = value.trim().toUpperCase();
  const numericValue = Number.parseFloat(normalized);

  if (Number.isNaN(numericValue)) {
    return null;
  }

  if (normalized.endsWith("M")) {
    return Math.round(numericValue * 1_000_000);
  }

  if (normalized.endsWith("K")) {
    return Math.round(numericValue * 1_000);
  }

  return Math.round(numericValue);
}

function getWritableDatabase() {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      exec(sql: string): void;
      prepare(sql: string): {
        run(...params: unknown[]): void;
      };
      close(): void;
    };
  };

  const dbPath = resolveDatabasePath();
  mkdirSync(dirname(dbPath), { recursive: true });

  return {
    dbPath,
    db: new DatabaseSync(dbPath),
  };
}

function hashPasswordForSeed(password: string): { hash: string; salt: string } {
  const runtimeRequire = eval("require") as NodeRequire;
  const { randomBytes, scryptSync } = runtimeRequire("node:crypto") as {
    randomBytes: (size: number) => Buffer;
    scryptSync: (password: string, salt: Buffer, keylen: number) => Buffer;
  };
  const saltBuffer = randomBytes(16);
  const hash = scryptSync(password, saltBuffer, 64).toString("hex");
  return { hash, salt: saltBuffer.toString("hex") };
}

function hashRecoveryCodeForSeed(code: string): string {
  const runtimeRequire = eval("require") as NodeRequire;
  const { createHash } = runtimeRequire("node:crypto") as {
    createHash: (algorithm: string) => {
      update: (value: string) => {
        digest: (encoding: "hex") => string;
      };
    };
  };

  return createHash("sha256").update(code.trim().replace(/[\-\s]/g, "").toUpperCase()).digest("hex");
}

function seedDatasetDatabase() {
  const { dbPath, db } = getWritableDatabase();

  db.exec(`
    CREATE TABLE IF NOT EXISTS regions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      geometry JSON,
      buoy_count INTEGER,
      nearest_buoy_label TEXT,
      thermal_anomaly_label TEXT,
      current_direction_label TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      region_id TEXT REFERENCES regions(id),
      status TEXT NOT NULL,
      record_count INTEGER,
      refreshed_at TIMESTAMP,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      state TEXT NOT NULL,
      region_id TEXT REFERENCES regions(id),
      owner TEXT,
      confidence INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS investigation_events (
      id TEXT PRIMARY KEY,
      investigation_id TEXT NOT NULL REFERENCES investigations(id),
      event_type TEXT NOT NULL,
      source TEXT NOT NULL,
      actor TEXT,
      summary TEXT NOT NULL,
      detail TEXT,
      confidence INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS signal_detections (
      id TEXT PRIMARY KEY,
      signal_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      region TEXT NOT NULL,
      station_id TEXT REFERENCES stations(id),
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      detail TEXT NOT NULL,
      status TEXT NOT NULL,
      detected_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      linked_investigation_id TEXT REFERENCES investigations(id)
    );

    CREATE TABLE IF NOT EXISTS species (
      id TEXT PRIMARY KEY,
      common_name TEXT NOT NULL,
      scientific_name TEXT NOT NULL,
      conservation_status TEXT NOT NULL,
      habitat_region TEXT NOT NULL,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS species_sightings (
      id TEXT PRIMARY KEY,
      species_id TEXT NOT NULL REFERENCES species(id),
      station_id TEXT,
      region TEXT NOT NULL,
      observed_at INTEGER NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      count INTEGER NOT NULL,
      source TEXT NOT NULL,
      summary TEXT NOT NULL,
      verification_status TEXT NOT NULL DEFAULT 'pending',
      verified_at INTEGER,
      verified_by TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS species_movement_signals (
      id TEXT PRIMARY KEY,
      species_id TEXT NOT NULL REFERENCES species(id),
      signal_id TEXT REFERENCES signal_detections(id),
      investigation_id TEXT REFERENCES investigations(id),
      movement_type TEXT NOT NULL,
      confidence INTEGER NOT NULL,
      summary TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_analyses (
      id TEXT PRIMARY KEY,
      investigation_id TEXT REFERENCES investigations(id),
      prompt TEXT NOT NULL,
      summary TEXT,
      result_payload JSON,
      confidence_label TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      region_id TEXT REFERENCES regions(id),
      dataset_id TEXT REFERENCES datasets(id),
      investigation_id TEXT REFERENCES investigations(id),
      detail TEXT,
      detected_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS reports (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      report_type TEXT NOT NULL,
      status TEXT NOT NULL,
      region_id TEXT REFERENCES regions(id),
      investigation_id TEXT REFERENCES investigations(id),
      author TEXT,
      published_at TIMESTAMP,
      content TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS map_layers (
      label TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      active BOOLEAN NOT NULL,
      accent TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    DROP TABLE IF EXISTS station_admin_auth_events;
    DROP TABLE IF EXISTS station_admin_mfa_challenges;
    DROP TABLE IF EXISTS station_admin_audits;
    DROP TABLE IF EXISTS station_admin_sessions;
    DROP TABLE IF EXISTS station_admin_credentials;
    DROP TABLE IF EXISTS station_content;
    DROP TABLE IF EXISTS station_timelines;
    DROP TABLE IF EXISTS station_alerts;
    DROP TABLE IF EXISTS station_sensors;
    DROP TABLE IF EXISTS station_species;
    DROP TABLE IF EXISTS station_page_views;
    DROP TABLE IF EXISTS stations;

    CREATE TABLE IF NOT EXISTS stations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      region_id TEXT REFERENCES regions(id),
      status TEXT NOT NULL,
      summary TEXT NOT NULL,
      location_label TEXT NOT NULL,
      depth_m INTEGER,
      latitude TEXT,
      longitude TEXT,
      last_reported_at TIMESTAMP,
      hero_metric TEXT,
      sponsor_name TEXT,
      operator_name TEXT,
      logo_url TEXT,
      logo_label TEXT,
      exhibit_title TEXT,
      accent_color TEXT,
      public_description TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_species (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      name TEXT NOT NULL,
      status TEXT NOT NULL,
      population_trend TEXT,
      observed_at TIMESTAMP,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_page_views (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      view_type TEXT NOT NULL,
      viewed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_sensors (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT,
      status TEXT NOT NULL,
      sampled_at TIMESTAMP,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_alerts (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      title TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      detail TEXT,
      detected_at TIMESTAMP,
      acknowledged_at TIMESTAMP,
      acknowledged_by TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_timelines (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      label TEXT NOT NULL,
      phase TEXT NOT NULL,
      detail TEXT NOT NULL,
      happened_at TIMESTAMP,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_content (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      content_type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      href TEXT,
      published_at TIMESTAMP,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_admin_audits (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      area TEXT NOT NULL,
      changed_fields JSON,
      changed_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_admin_sessions (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      actor_role TEXT NOT NULL,
      permissions JSON,
      csrf_token TEXT NOT NULL DEFAULT '',
      issued_at TIMESTAMP NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      last_active_at TIMESTAMP,
      revoked_at TIMESTAMP,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_admin_credentials (
      id TEXT PRIMARY KEY,
      actor_role TEXT NOT NULL DEFAULT 'viewer',
      password_hash TEXT NOT NULL,
      salt TEXT NOT NULL,
      mfa_enabled INTEGER NOT NULL DEFAULT 0,
      mfa_secret TEXT,
      mfa_recovery_codes JSON,
      mfa_enrolled_at TIMESTAMP,
      mfa_last_verified_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_admin_mfa_challenges (
      id TEXT PRIMARY KEY,
      actor_id TEXT NOT NULL,
      challenge_purpose TEXT NOT NULL,
      session_id TEXT REFERENCES station_admin_sessions(id),
      expires_at TIMESTAMP NOT NULL,
      attempts_remaining INTEGER NOT NULL DEFAULT 5,
      consumed_at TIMESTAMP,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_admin_auth_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      actor_id TEXT,
      session_id TEXT,
      occurred_at TIMESTAMP NOT NULL,
      metadata JSON,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_events (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      status TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      detected_at TIMESTAMP NOT NULL,
      resolved_at TIMESTAMP,
      investigation_id TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_event_evidence (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES station_events(id),
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      captured_at TIMESTAMP NOT NULL,
      detail TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_event_notes (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES station_events(id),
      author_id TEXT NOT NULL,
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_event_actions (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES station_events(id),
      label TEXT NOT NULL,
      actor_id TEXT NOT NULL,
      performed_at TIMESTAMP NOT NULL,
      detail TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_event_history (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL REFERENCES station_events(id),
      from_status TEXT,
      to_status TEXT NOT NULL,
      changed_by TEXT NOT NULL,
      changed_at TIMESTAMP NOT NULL,
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS station_investigations (
      id TEXT PRIMARY KEY,
      station_id TEXT NOT NULL REFERENCES stations(id),
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL,
      owner TEXT,
      opened_at TIMESTAMP NOT NULL,
      closed_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const upsertMapLayer = db.prepare(`
    INSERT OR REPLACE INTO map_layers (label, description, active, accent, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  upsertMapLayer.run("Sea Surface Temperature", "Thermal anomaly overlay and hotspot gradients", 1, "cyan", 1);
  upsertMapLayer.run("Current Vectors", "Directional flow and shear indicators", 1, "emerald", 2);
  upsertMapLayer.run("Buoy Network", "Live sensor positions and telemetry links", 1, "amber", 3);
  upsertMapLayer.run("Protected Zones", "Reef boundaries and monitoring sectors", 0, "cyan", 4);

  const upsertRegion = db.prepare(`
    INSERT OR REPLACE INTO regions (id, name, status, summary, buoy_count, nearest_buoy_label, thermal_anomaly_label, current_direction_label)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertDataset = db.prepare(`
    INSERT OR REPLACE INTO datasets (id, name, category, region_id, status, record_count, refreshed_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertInvestigation = db.prepare(`
    INSERT OR REPLACE INTO investigations (id, title, summary, state, region_id, owner, confidence)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertInvestigationEvent = db.prepare(`
    INSERT OR REPLACE INTO investigation_events
      (id, investigation_id, event_type, source, actor, summary, detail, confidence, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertSignalDetection = db.prepare(`
    INSERT OR REPLACE INTO signal_detections
      (id, signal_type, severity, confidence, source_type, source_id, region, station_id, title, summary, detail, status, detected_at, created_at, updated_at, linked_investigation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertSpecies = db.prepare(`
    INSERT OR REPLACE INTO species
      (id, common_name, scientific_name, conservation_status, habitat_region, summary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertSpeciesSighting = db.prepare(`
    INSERT OR REPLACE INTO species_sightings
      (id, species_id, station_id, region, observed_at, latitude, longitude, count, source, summary, verification_status, verified_at, verified_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertSpeciesMovementSignal = db.prepare(`
    INSERT OR REPLACE INTO species_movement_signals
      (id, species_id, signal_id, investigation_id, movement_type, confidence, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertAiAnalysis = db.prepare(`
    INSERT OR REPLACE INTO ai_analyses (id, investigation_id, prompt, summary, result_payload, confidence_label, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertAlert = db.prepare(`
    INSERT OR REPLACE INTO alerts (id, title, severity, status, region_id, dataset_id, detail, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertReport = db.prepare(`
    INSERT OR REPLACE INTO reports (id, title, report_type, status, region_id, investigation_id, author, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStation = db.prepare(`
    INSERT OR REPLACE INTO stations
      (id, name, slug, region_id, status, summary, location_label, depth_m, latitude, longitude, last_reported_at, hero_metric, sponsor_name, operator_name, logo_url, logo_label, exhibit_title, accent_color, public_description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationSpecies = db.prepare(`
    INSERT OR REPLACE INTO station_species
      (id, station_id, name, status, population_trend, observed_at, notes, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationSensor = db.prepare(`
    INSERT OR REPLACE INTO station_sensors
      (id, station_id, name, category, value, unit, status, sampled_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationAlert = db.prepare(`
    INSERT OR REPLACE INTO station_alerts
      (id, station_id, title, severity, status, detail, detected_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationTimeline = db.prepare(`
    INSERT OR REPLACE INTO station_timelines
      (id, station_id, label, phase, detail, happened_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationContent = db.prepare(`
    INSERT OR REPLACE INTO station_content
      (id, station_id, content_type, title, summary, href, published_at, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationPageView = db.prepare(`
    INSERT OR REPLACE INTO station_page_views
      (id, station_id, view_type, viewed_at)
    VALUES (?, ?, ?, ?)
  `);
  const upsertStationAdminAudit = db.prepare(`
    INSERT OR REPLACE INTO station_admin_audits
      (id, station_id, actor_id, actor_role, area, changed_fields, changed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationAdminSession = db.prepare(`
    INSERT OR REPLACE INTO station_admin_sessions
      (id, actor_id, actor_role, permissions, csrf_token, issued_at, expires_at, last_active_at, revoked_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationAdminCredential = db.prepare(`
    INSERT OR REPLACE INTO station_admin_credentials
      (id, actor_role, password_hash, salt, mfa_enabled, mfa_secret, mfa_recovery_codes, mfa_enrolled_at, mfa_last_verified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationAdminAuthEvent = db.prepare(`
    INSERT OR REPLACE INTO station_admin_auth_events
      (id, event_type, actor_id, session_id, occurred_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  upsertRegion.run(
    "REG-NP",
    "North Pacific",
    "Elevated reef stress window",
    aiLabWorkspaceData.results[0].body,
    21,
    "ATLAS-19 · 18 km east",
    "+2.4 °C above seasonal mean",
    "ENE at 1.9 kn",
  );
  upsertRegion.run(
    "REG-ES",
    "Eastern Shelf",
    "Monitoring active",
    "Shelf edge observation region used for dataset verification and preview.",
    11,
    "SHELF-04 · 7 km west",
    null,
    null,
  );
  upsertRegion.run(
    "REG-GBR",
    "Great Barrier Reef",
    "Active coral resilience monitoring",
    "High-resolution reef station corridor supporting bleaching response education and reef resilience campaigns.",
    16,
    "REEF-07 · 9 km north",
    "+1.7 °C above seasonal mean",
    "SE at 1.1 kn",
  );
  upsertRegion.run(
    "REG-MBY",
    "Monterey Bay",
    "Kelp canopy variability watch",
    "Nearshore kelp-forest monitoring for ecosystem swings, upwelling shifts, and public engagement programming.",
    14,
    "KELP-03 · 4 km offshore",
    "+0.6 °C above seasonal mean",
    "NW at 0.8 kn",
  );
  upsertRegion.run(
    "REG-MAR",
    "Mid-Atlantic Ridge",
    "Hydrothermal plume tracking",
    "Deep-ocean observatory supporting hydrothermal ecology storytelling and vent biodiversity studies.",
    9,
    "RIDGE-11 · 22 km east",
    "+0.9 °C vent plume variance",
    "SW at 0.6 kn",
  );

  for (const dataset of dataExplorerWorkspaceData.datasets) {
    upsertDataset.run(
      dataset.id,
      dataset.name,
      dataset.category,
      dataset.region === "Eastern Shelf" ? "REG-ES" : "REG-NP",
      dataset.status,
      parseMockRecordCount(dataset.records),
      new Date().toISOString(),
      JSON.stringify({
        regionLabel: dataset.region,
      }),
    );
  }

  upsertInvestigation.run(
    "TRK-201",
    "Surface temperature acceleration",
    "Elevated SST continues to widen eastward beyond the historic seasonal envelope.",
    "Escalated",
    "REG-NP",
    "Dr. Clarke",
    86,
  );
  upsertInvestigation.run(
    "TRK-187",
    "Chlorophyll suppression overlap",
    "Bloom density is tapering inside the same grid cells as the thermal front.",
    "Correlated",
    "REG-NP",
    "M. Patel",
    72,
  );
  upsertInvestigation.run(
    "TRK-193",
    "Current shear migration",
    "Current vectors show a moderate shear shift that may explain signal drift near the reef edge.",
    "Watch",
    "REG-ES",
    "A. Romero",
    61,
  );

  upsertInvestigationEvent.run(
    "EVT-TRK-201-OPEN",
    "TRK-201",
    "case_opened",
    "Investigation engine",
    "Dr. Clarke",
    "Case opened for thermal anomaly progression in reef boundary sector.",
    "Initial detection exceeded baseline variance threshold.",
    64,
    Date.parse("2026-03-13T09:00:00.000Z"),
  );
  upsertInvestigationEvent.run(
    "EVT-TRK-201-SIGNAL",
    "TRK-201",
    "signal_linked",
    "Buoy ATLAS-19",
    "Dr. Clarke",
    "Linked buoy subsurface profile confirming persistent warming.",
    "Profile confirmed warming to 42 m depth with reduced nocturnal recovery.",
    78,
    Date.parse("2026-03-13T10:20:00.000Z"),
  );
  upsertInvestigationEvent.run(
    "EVT-TRK-201-ESC",
    "TRK-201",
    "track_escalated",
    "Analysis canvas",
    "Dr. Clarke",
    "Track escalated due to confidence increase and cross-source agreement.",
    "Escalation triggered by 4/5 feed agreement.",
    86,
    Date.parse("2026-03-13T11:40:00.000Z"),
  );

  upsertSignalDetection.run(
    "SIG-THERMAL-001",
    "thermal_anomaly",
    "critical",
    90,
    "dashboard_anomaly_summary",
    "dashboard-anomaly-summary",
    "North Pacific",
    null,
    "Thermal anomaly escalation",
    "Detected elevated thermal anomaly pressure across monitored reef sectors.",
    "Derived from anomaly summary and correlated with active investigation track TRK-201.",
    "open",
    Date.parse("2026-03-13T11:48:00.000Z"),
    Date.parse("2026-03-13T11:48:00.000Z"),
    Date.parse("2026-03-13T11:48:00.000Z"),
    "TRK-201",
  );
  upsertSignalDetection.run(
    "SIG-OXYGEN-001",
    "oxygen_depletion",
    "high",
    81,
    "activity_alert_stream",
    "ALT-180",
    "Eastern Shelf",
    null,
    "Oxygen depletion risk cluster",
    "Oxygen depletion warning indicates sustained low dissolved oxygen trend.",
    "Derived from alerts stream and chemistry monitoring context in zone Z-08.",
    "monitoring",
    Date.parse("2026-03-13T10:06:00.000Z"),
    Date.parse("2026-03-13T10:06:00.000Z"),
    Date.parse("2026-03-13T10:06:00.000Z"),
    null,
  );
  upsertSignalDetection.run(
    "SIG-STATION-001",
    "station_health",
    "medium",
    69,
    "station_network",
    "active-sensors",
    "North Pacific",
    "STA-NPC-01",
    "Station health variance detected",
    "Sensor network reports a mild station health degradation signature.",
    "Derived from active sensor metrics and station operations trend checks.",
    "monitoring",
    Date.parse("2026-03-13T11:32:00.000Z"),
    Date.parse("2026-03-13T11:32:00.000Z"),
    Date.parse("2026-03-13T11:32:00.000Z"),
    null,
  );

  upsertSpecies.run(
    "SP-BLUE-WHALE",
    "Blue Whale",
    "Balaenoptera musculus",
    "endangered",
    "North Pacific",
    "Large migratory baleen whale tracked across the North Pacific corridor for route stability and feeding ground shifts.",
    Date.parse("2026-03-11T08:00:00.000Z"),
    Date.parse("2026-03-13T11:20:00.000Z"),
  );
  upsertSpecies.run(
    "SP-GREEN-TURTLE",
    "Green Sea Turtle",
    "Chelonia mydas",
    "endangered",
    "Eastern Shelf",
    "Tag-tracked marine turtle population used to monitor habitat fidelity and corridor stress response.",
    Date.parse("2026-03-10T07:00:00.000Z"),
    Date.parse("2026-03-13T10:45:00.000Z"),
  );
  upsertSpecies.run(
    "SP-REEF-SHARK",
    "Grey Reef Shark",
    "Carcharhinus amblyrhynchos",
    "near_threatened",
    "Great Barrier Reef",
    "Reef predator indicator species used to detect unusual aggregation and feeding-route disruption.",
    Date.parse("2026-03-09T12:00:00.000Z"),
    Date.parse("2026-03-13T09:10:00.000Z"),
  );

  upsertSpeciesSighting.run(
    "SIGHT-001",
    "SP-BLUE-WHALE",
    "STA-NPC-01",
    "North Pacific",
    Date.parse("2026-03-13T11:04:00.000Z"),
    34.712,
    -143.118,
    2,
    "Acoustic buoy mesh",
    "Two tagged whales exhibited a widened spacing pattern near the thermal corridor edge.",
    "verified",
    Date.parse("2026-03-13T11:12:00.000Z"),
    "ops.admin",
    Date.parse("2026-03-13T11:06:00.000Z"),
  );
  upsertSpeciesSighting.run(
    "SIGHT-002",
    "SP-GREEN-TURTLE",
    "STA-NPC-01",
    "Eastern Shelf",
    Date.parse("2026-03-13T10:42:00.000Z"),
    33.984,
    -142.502,
    4,
    "ROV visual survey",
    "Tagged turtles shifted approximately 1.1 km downslope relative to the previous survey window.",
    "pending",
    null,
    null,
    Date.parse("2026-03-13T10:44:00.000Z"),
  );
  upsertSpeciesSighting.run(
    "SIGHT-003",
    "SP-REEF-SHARK",
    "STA-GBR-02",
    "Great Barrier Reef",
    Date.parse("2026-03-13T09:06:00.000Z"),
    -18.421,
    147.668,
    7,
    "Autonomous drone transect",
    "Higher-than-baseline aggregation observed in outer arc hunting lanes.",
    "rejected",
    null,
    null,
    Date.parse("2026-03-13T09:08:00.000Z"),
  );

  upsertSpeciesMovementSignal.run(
    "MOV-001",
    "SP-BLUE-WHALE",
    "SIG-THERMAL-001",
    "TRK-201",
    "route_deviation",
    84,
    "Blue whale route deviated 14 km south of expected corridor while thermal stress signal remained elevated.",
    Date.parse("2026-03-13T11:10:00.000Z"),
  );
  upsertSpeciesMovementSignal.run(
    "MOV-002",
    "SP-GREEN-TURTLE",
    "SIG-OXYGEN-001",
    "TRK-193",
    "habitat_exit",
    73,
    "Green turtle cluster moved away from low oxygen shelf pockets aligned with oxygen depletion signal.",
    Date.parse("2026-03-13T10:48:00.000Z"),
  );
  upsertSpeciesMovementSignal.run(
    "MOV-003",
    "SP-REEF-SHARK",
    "SIG-STATION-001",
    null,
    "aggregation_shift",
    68,
    "Reef shark aggregation intensified near a station health variance zone requiring continued monitoring.",
    Date.parse("2026-03-13T09:14:00.000Z"),
  );

  upsertAiAnalysis.run(
    "ANL-001",
    "TRK-201",
    "Summarize the active reef-edge anomaly using the latest thermal and field signals.",
    "Heat stress remains the primary driver of the anomaly, with current shear acting as a secondary amplifier.",
    JSON.stringify({
      sections: {
        summary:
          "Heat stress remains the primary driver of the anomaly, with current shear acting as a secondary amplifier.",
        findings:
          "Buoy depth profiles and satellite composites converge on the same stress corridor across the eastern reef edge.",
        evidence:
          "Evidence cluster includes NOAA composite maps, buoy ATLAS-19 profiles, and Reef Team Bravo transect notes.",
        confidence:
          "Confidence is moderate-high because independent source classes align across the same time and region window.",
        uncertainty:
          "Uncertainty remains around secondary biological impacts due to sparse overnight dissolved oxygen coverage.",
        suggestedNextActions:
          "Run a dissolved oxygen join and request one additional shelf transect before escalating regional response guidance.",
      },
      suggestedPrompts: [
        {
          title: "Draft an updated field brief",
          detail:
            "Generate a concise field briefing based on the latest thermal corridor evidence and buoy profile agreement.",
        },
        {
          title: "Stress-test uncertainty drivers",
          detail:
            "Compare dissolved oxygen sparse zones against confidence drop-offs to prioritize next sensor deployment.",
        },
      ],
      sources: [
        {
          id: "SRC-21",
          title: "Pacific Thermal Front Observations",
          type: "Dataset",
          note: "Core thermal anomaly feed aligned with the active research prompt.",
          freshness: "Updated 8 min ago",
        },
        {
          id: "SRC-18",
          title: "Reef Team Bravo Transect 04",
          type: "Field Report",
          note: "Visual confirmation of coral paling in eastern shelf transects.",
          freshness: "Submitted 27 min ago",
        },
        {
          id: "SRC-09",
          title: "Coral Stress Ensemble v5",
          type: "Model",
          note: "Forecast layer projecting the next 36-hour stress window.",
          freshness: "Run 1 hr ago",
        },
      ],
    }),
    "moderate-high",
    "2026-03-13T11:55:00.000Z",
  );
  upsertAiAnalysis.run(
    "ANL-000",
    "TRK-187",
    "Summarize linked chlorophyll and thermal drift indicators.",
    "Chlorophyll suppression remains correlated with thermal front movement but needs one more validation pass.",
    null,
    "moderate",
    "2026-03-13T10:40:00.000Z",
  );

  upsertAlert.run(
    "ALT-214",
    "Thermal spike detected in reef-edge grid",
    "high",
    "Open",
    "REG-NP",
    "DST-104",
    "Elevated surface temperature exceeded the seasonal envelope across two adjacent cells.",
    "2026-03-13T11:49:00.000Z",
  );
  upsertAlert.run(
    "ALT-209",
    "Buoy cross-check flagged warming persistence",
    "medium",
    "Open",
    "REG-NP",
    "DST-104",
    "Subsurface confirmation suggests the front is holding deeper than the last modeled pass.",
    "2026-03-13T11:37:00.000Z",
  );
  upsertAlert.run(
    "ALT-198",
    "Nutrient imbalance cluster",
    "medium",
    "Open",
    "REG-ES",
    "DST-051",
    "Recent chemistry profiles indicate nitrate drift near the eastern shelf transition zone.",
    "2026-03-13T11:06:00.000Z",
  );
  upsertAlert.run(
    "ALT-180",
    "Oxygen depletion warning in monitoring zone Z-08",
    "high",
    "Monitoring",
    "REG-ES",
    null,
    "Low dissolved oxygen levels recorded across two shelf stations.",
    "2026-03-13T10:00:00.000Z",
  );

  upsertReport.run(
    "RPT-001",
    "North Pacific Thermal Analysis — Phase 1",
    "analysis",
    "Published",
    "REG-NP",
    "TRK-201",
    "Dr. Clarke",
    "2026-03-13T09:30:00.000Z",
  );
  upsertReport.run(
    "RPT-002",
    "Reef Edge Corridor Status Update",
    "status",
    "Published",
    "REG-NP",
    "TRK-187",
    "M. Patel",
    "2026-03-13T08:00:00.000Z",
  );

  upsertStation.run(
    "STA-NPC-01",
    "North Pacific Corridor",
    "north-pacific-corridor",
    "REG-NP",
    "Active Monitoring",
    "Flagship ocean station tracking reef-edge stress interactions between thermal fronts, current shear, and biodiversity drift.",
    "34.6N, 143.2W · Eastern Reef Boundary",
    420,
    "34.6N",
    "143.2W",
    "2026-03-13T11:58:00.000Z",
    "Coral Stress Index 82",
    "Blue Current Foundation",
    "Ocean Systems Lab",
    null,
    "Blue Current x Ocean Systems",
    "North Pacific Living Reef Exhibit",
    "cyan",
    "Explore real-time reef health signals from the North Pacific Corridor and see how ocean science supports conservation.",
  );

  upsertStationSpecies.run(
    "SPC-001",
    "STA-NPC-01",
    "Acropora hyacinthus",
    "Stressed",
    "-12% vs seasonal baseline",
    "2026-03-13T11:20:00.000Z",
    "Paling signatures remain concentrated along the northeast transect edge.",
    1,
  );
  upsertStationSpecies.run(
    "SPC-002",
    "STA-NPC-01",
    "Chromis viridis",
    "Monitoring",
    "+4% juvenile density",
    "2026-03-13T11:32:00.000Z",
    "Juvenile schools have shifted 1.3 km downslope in the last 24h.",
    2,
  );
  upsertStationSpecies.run(
    "SPC-003",
    "STA-NPC-01",
    "Chelonia mydas",
    "Stable",
    "No significant deviation",
    "2026-03-13T10:45:00.000Z",
    "Tagged green turtles continue expected migratory path with minor detours.",
    3,
  );

  upsertStationSensor.run(
    "SNS-001",
    "STA-NPC-01",
    "Sea Surface Temperature",
    "Thermal",
    "18.9",
    "C",
    "Live",
    "2026-03-13T11:58:00.000Z",
    1,
  );
  upsertStationSensor.run(
    "SNS-002",
    "STA-NPC-01",
    "Current Velocity",
    "Hydrodynamics",
    "1.9",
    "kn",
    "Live",
    "2026-03-13T11:56:00.000Z",
    2,
  );
  upsertStationSensor.run(
    "SNS-003",
    "STA-NPC-01",
    "Dissolved Oxygen",
    "Chemistry",
    "4.8",
    "mg/L",
    "Watch",
    "2026-03-13T11:50:00.000Z",
    3,
  );
  upsertStationSensor.run(
    "SNS-004",
    "STA-NPC-01",
    "Acoustic Noise Floor",
    "Acoustic",
    "71",
    "dB",
    "Live",
    "2026-03-13T11:47:00.000Z",
    4,
  );

  upsertStationAlert.run(
    "STA-ALT-01",
    "STA-NPC-01",
    "Thermal anomaly exceeded stress threshold for 37 minutes",
    "high",
    "Open",
    "Surface layer remained +2.4 C above climatology while subsurface decay failed to recover overnight.",
    "2026-03-13T11:49:00.000Z",
  );
  upsertStationAlert.run(
    "STA-ALT-02",
    "STA-NPC-01",
    "Dissolved oxygen dipped below advisory floor",
    "medium",
    "Monitoring",
    "Two adjacent depth channels reported 4.8 mg/L for three consecutive samples.",
    "2026-03-13T11:40:00.000Z",
  );
  upsertStationAlert.run(
    "STA-ALT-03",
    "STA-NPC-01",
    "Current shear crossover sustained near reef boundary",
    "medium",
    "Open",
    "Vector spread widened to 23 degrees, increasing nutrient transport uncertainty.",
    "2026-03-13T11:18:00.000Z",
  );

  upsertStationTimeline.run(
    "STL-001",
    "STA-NPC-01",
    "Deployment",
    "Completed",
    "Station array and telemetry uplink commissioned across the North Pacific corridor.",
    "2026-02-01T09:00:00.000Z",
    1,
  );
  upsertStationTimeline.run(
    "STL-002",
    "STA-NPC-01",
    "Thermal Front Expansion",
    "Completed",
    "Heat band expanded east and overlapped protected transects for the first time this quarter.",
    "2026-03-12T18:30:00.000Z",
    2,
  );
  upsertStationTimeline.run(
    "STL-003",
    "STA-NPC-01",
    "Response Window",
    "Active",
    "Field coordination remains active while AI-assisted triage prioritizes oxygen joins.",
    "2026-03-13T11:00:00.000Z",
    3,
  );

  upsertStationContent.run(
    "CNT-001",
    "STA-NPC-01",
    "brief",
    "Morning Reef Stress Brief",
    "Cross-source synthesis of thermal, sensor, and field evidence for mission control.",
    "/investigations",
    "2026-03-13T11:30:00.000Z",
    1,
  );
  upsertStationContent.run(
    "CNT-002",
    "STA-NPC-01",
    "dataset",
    "Pacific Thermal Front Observations",
    "Primary thermal feed aligned to this station's active anomaly corridor.",
    "/data-explorer",
    "2026-03-13T11:20:00.000Z",
    2,
  );
  upsertStationContent.run(
    "CNT-003",
    "STA-NPC-01",
    "playbook",
    "Rapid Oxygen Validation Playbook",
    "Checklist used by operators when oxygen floors dip below advisory thresholds.",
    "/ai-lab",
    "2026-03-13T10:50:00.000Z",
    3,
  );

  upsertStation.run(
    "STA-GBR-02",
    "Great Barrier Reef Sector",
    "great-barrier-reef-sector",
    "REG-GBR",
    "Coral Watch",
    "Flagship reef station focused on coral bleaching thresholds, biodiversity resilience, and visitor education programming.",
    "18.4S, 147.7E · Outer Reef Arc",
    55,
    "18.4S",
    "147.7E",
    "2026-03-13T11:46:00.000Z",
    "Bleaching Pressure Index 64",
    "Reef Futures Trust",
    "Queensland Marine Observatory",
    null,
    "Reef Futures x Queensland Marine",
    "Great Barrier Reef Living Classroom",
    "emerald",
    "Dive into coral resilience science from one of the most iconic reef ecosystems on Earth.",
  );

  upsertStationSpecies.run(
    "SPC-101",
    "STA-GBR-02",
    "Pocillopora damicornis",
    "Monitoring",
    "-4% colony density",
    "2026-03-13T11:10:00.000Z",
    "Patchy paling observed near shallow crest transects.",
    1,
  );
  upsertStationSpecies.run(
    "SPC-102",
    "STA-GBR-02",
    "Acanthurus triostegus",
    "Stable",
    "+2% juvenile presence",
    "2026-03-13T11:16:00.000Z",
    "Schooling behavior remains consistent with seasonal baseline.",
    2,
  );
  upsertStationSpecies.run(
    "SPC-103",
    "STA-GBR-02",
    "Tridacna gigas",
    "Watch",
    "Localized stress in 2 plots",
    "2026-03-13T10:58:00.000Z",
    "Reduced mantle extension in high-irradiance patches.",
    3,
  );

  upsertStationSensor.run(
    "SNS-101",
    "STA-GBR-02",
    "Sea Surface Temperature",
    "Thermal",
    "29.1",
    "C",
    "Live",
    "2026-03-13T11:46:00.000Z",
    1,
  );
  upsertStationSensor.run(
    "SNS-102",
    "STA-GBR-02",
    "Photosynthetically Active Radiation",
    "Optical",
    "1120",
    "umol/m2/s",
    "Live",
    "2026-03-13T11:42:00.000Z",
    2,
  );
  upsertStationSensor.run(
    "SNS-103",
    "STA-GBR-02",
    "Dissolved Oxygen",
    "Chemistry",
    "5.4",
    "mg/L",
    "Live",
    "2026-03-13T11:39:00.000Z",
    3,
  );

  upsertStationAlert.run(
    "STA-ALT-11",
    "STA-GBR-02",
    "Midday thermal spike exceeded coral comfort band",
    "medium",
    "Monitoring",
    "Two shallow reef grids crossed 29.0 C for 24 minutes.",
    "2026-03-13T11:31:00.000Z",
  );
  upsertStationAlert.run(
    "STA-ALT-12",
    "STA-GBR-02",
    "High irradiance stress window opened",
    "low",
    "Open",
    "PAR peaks suggest midday bleaching risk remains elevated.",
    "2026-03-13T11:22:00.000Z",
  );

  upsertStationTimeline.run(
    "STL-101",
    "STA-GBR-02",
    "Exhibit Launch",
    "Completed",
    "Public reef resilience exhibit launched with live telemetry wall.",
    "2026-02-18T06:30:00.000Z",
    1,
  );
  upsertStationTimeline.run(
    "STL-102",
    "STA-GBR-02",
    "Heat Wave Window",
    "Completed",
    "Thermal surge entered the outer arc and triggered rapid response briefings.",
    "2026-03-11T21:15:00.000Z",
    2,
  );
  upsertStationTimeline.run(
    "STL-103",
    "STA-GBR-02",
    "Reef Education Week",
    "Active",
    "On-site programming now ties live habitat metrics to visitor learning modules.",
    "2026-03-13T09:00:00.000Z",
    3,
  );

  upsertStationContent.run(
    "CNT-101",
    "STA-GBR-02",
    "brief",
    "Coral Heat Watch Brief",
    "Daily operator summary on thermal pressure and expected bleaching stress.",
    "/investigations",
    "2026-03-13T11:12:00.000Z",
    1,
  );
  upsertStationContent.run(
    "CNT-102",
    "STA-GBR-02",
    "dataset",
    "Outer Arc Reef Telemetry Feed",
    "Live sensor stream for surface temperature, irradiance, and oxygen.",
    "/data-explorer",
    "2026-03-13T10:58:00.000Z",
    2,
  );
  upsertStationContent.run(
    "CNT-103",
    "STA-GBR-02",
    "guide",
    "Coral Resilience Field Guide",
    "Educational guide connecting live data to coral adaptation principles.",
    "/ai-lab",
    "2026-03-13T10:40:00.000Z",
    3,
  );

  upsertStation.run(
    "STA-MBY-03",
    "Monterey Bay Kelp Forest",
    "monterey-bay-kelp-forest",
    "REG-MBY",
    "Canopy Watch",
    "Flagship coastal station tracking kelp canopy health, marine mammal corridors, and upwelling-driven habitat changes.",
    "36.7N, 122.2W · Monterey Coastal Shelf",
    120,
    "36.7N",
    "122.2W",
    "2026-03-13T11:51:00.000Z",
    "Kelp Canopy Retention 78%",
    "Pacific Habitat Alliance",
    "Monterey Marine Institute",
    null,
    "Pacific Habitat x Monterey Marine",
    "Monterey Kelp Forest Discovery Deck",
    "amber",
    "Follow live kelp forest conditions and learn how upwelling shapes biodiversity along California's coast.",
  );

  upsertStationSpecies.run(
    "SPC-201",
    "STA-MBY-03",
    "Macrocystis pyrifera",
    "Monitoring",
    "-6% canopy cover",
    "2026-03-13T11:14:00.000Z",
    "Canopy thinning persists in two nearshore sectors.",
    1,
  );
  upsertStationSpecies.run(
    "SPC-202",
    "STA-MBY-03",
    "Enhydra lutris nereis",
    "Stable",
    "Foraging lanes unchanged",
    "2026-03-13T11:08:00.000Z",
    "Sea otter rafts remain concentrated in protected kelp beds.",
    2,
  );
  upsertStationSpecies.run(
    "SPC-203",
    "STA-MBY-03",
    "Sebastes paucispinis",
    "Watch",
    "Juvenile density uneven",
    "2026-03-13T10:49:00.000Z",
    "Patchy recruitment near canopy gaps on west transect.",
    3,
  );

  upsertStationSensor.run(
    "SNS-201",
    "STA-MBY-03",
    "Nitrate Concentration",
    "Chemistry",
    "8.2",
    "umol/L",
    "Live",
    "2026-03-13T11:51:00.000Z",
    1,
  );
  upsertStationSensor.run(
    "SNS-202",
    "STA-MBY-03",
    "Upwelling Index",
    "Hydrodynamics",
    "42",
    "index",
    "Live",
    "2026-03-13T11:45:00.000Z",
    2,
  );
  upsertStationSensor.run(
    "SNS-203",
    "STA-MBY-03",
    "Kelp Biomass Proxy",
    "Optical",
    "0.78",
    "ratio",
    "Watch",
    "2026-03-13T11:38:00.000Z",
    3,
  );

  upsertStationAlert.run(
    "STA-ALT-21",
    "STA-MBY-03",
    "Canopy fragmentation increased in west shelf lane",
    "medium",
    "Open",
    "Drone transects show canopy continuity dropped below weekly target.",
    "2026-03-13T11:27:00.000Z",
  );
  upsertStationAlert.run(
    "STA-ALT-22",
    "STA-MBY-03",
    "Nutrient pulse forecast updated",
    "low",
    "Monitoring",
    "Expected upwelling pulse may improve canopy recovery in 12-18 hours.",
    "2026-03-13T11:04:00.000Z",
  );

  upsertStationTimeline.run(
    "STL-201",
    "STA-MBY-03",
    "Kelp Array Upgrade",
    "Completed",
    "New multispectral canopy package integrated with nearshore buoy mesh.",
    "2026-02-22T15:20:00.000Z",
    1,
  );
  upsertStationTimeline.run(
    "STL-202",
    "STA-MBY-03",
    "Storm Event Recovery",
    "Completed",
    "Post-storm canopy recovery reached 81% before current downtrend.",
    "2026-03-10T06:10:00.000Z",
    2,
  );
  upsertStationTimeline.run(
    "STL-203",
    "STA-MBY-03",
    "Community Science Window",
    "Active",
    "Visitor observations now feed annotated kelp and species storyboards.",
    "2026-03-13T08:45:00.000Z",
    3,
  );

  upsertStationContent.run(
    "CNT-201",
    "STA-MBY-03",
    "brief",
    "Kelp Forest Daily Conditions",
    "Operator digest for canopy metrics, nutrient pulses, and biodiversity markers.",
    "/investigations",
    "2026-03-13T11:18:00.000Z",
    1,
  );
  upsertStationContent.run(
    "CNT-202",
    "STA-MBY-03",
    "dataset",
    "Monterey Nearshore Upwelling Feed",
    "Integrated chemistry and current vectors for kelp forecasting.",
    "/data-explorer",
    "2026-03-13T11:03:00.000Z",
    2,
  );
  upsertStationContent.run(
    "CNT-203",
    "STA-MBY-03",
    "story",
    "Kelp Forest Food-Web Explorer",
    "Educational content linking canopy shifts to predator-prey dynamics.",
    "/ai-lab",
    "2026-03-13T10:42:00.000Z",
    3,
  );

  upsertStation.run(
    "STA-MAR-04",
    "Mid-Atlantic Ridge",
    "mid-atlantic-ridge",
    "REG-MAR",
    "Deep Vent Survey",
    "Flagship deep-sea station monitoring hydrothermal vent plumes, chemosynthetic communities, and tectonic habitat variability.",
    "14.1N, 45.3W · Mid-Atlantic Vent Field",
    2450,
    "14.1N",
    "45.3W",
    "2026-03-13T11:43:00.000Z",
    "Vent Flux Stability 91",
    "Deep Ocean Discovery Fund",
    "Atlantic Ridge Research Consortium",
    null,
    "Deep Ocean Discovery x ARC",
    "Mid-Atlantic Ridge Deep-Ocean Theater",
    "violet",
    "Experience deep-ocean exploration with live hydrothermal vent insights and biodiversity discoveries.",
  );

  upsertStationSpecies.run(
    "SPC-301",
    "STA-MAR-04",
    "Riftia pachyptila",
    "Stable",
    "Colony growth steady",
    "2026-03-13T11:09:00.000Z",
    "Tube worm colony boundaries remained stable across two passes.",
    1,
  );
  upsertStationSpecies.run(
    "SPC-302",
    "STA-MAR-04",
    "Bathymodiolus azoricus",
    "Monitoring",
    "+3% vent-cluster density",
    "2026-03-13T10:56:00.000Z",
    "Mussel beds expanded slightly near eastern chimney branch.",
    2,
  );
  upsertStationSpecies.run(
    "SPC-303",
    "STA-MAR-04",
    "Bythograea thermydron",
    "Watch",
    "Foraging spread widened",
    "2026-03-13T10:40:00.000Z",
    "Crab activity increased along cooler plume boundary.",
    3,
  );

  upsertStationSensor.run(
    "SNS-301",
    "STA-MAR-04",
    "Hydrogen Sulfide",
    "Chemistry",
    "154",
    "umol/L",
    "Live",
    "2026-03-13T11:43:00.000Z",
    1,
  );
  upsertStationSensor.run(
    "SNS-302",
    "STA-MAR-04",
    "Vent Temperature",
    "Thermal",
    "312",
    "C",
    "Live",
    "2026-03-13T11:40:00.000Z",
    2,
  );
  upsertStationSensor.run(
    "SNS-303",
    "STA-MAR-04",
    "Plume Turbidity",
    "Optical",
    "0.64",
    "ntu",
    "Monitoring",
    "2026-03-13T11:33:00.000Z",
    3,
  );

  upsertStationAlert.run(
    "STA-ALT-31",
    "STA-MAR-04",
    "Vent chimney B plume spread exceeded baseline envelope",
    "medium",
    "Open",
    "Cross-current dispersion increased 14% versus 7-day average.",
    "2026-03-13T11:24:00.000Z",
  );
  upsertStationAlert.run(
    "STA-ALT-32",
    "STA-MAR-04",
    "ROV communication latency event",
    "low",
    "Resolved",
    "Transient acoustic relay degradation resolved after channel reset.",
    "2026-03-13T10:52:00.000Z",
  );

  upsertStationTimeline.run(
    "STL-301",
    "STA-MAR-04",
    "Deep Vent Commissioning",
    "Completed",
    "Primary vent mooring and plume profiler commissioned on ridge segment.",
    "2026-01-30T04:10:00.000Z",
    1,
  );
  upsertStationTimeline.run(
    "STL-302",
    "STA-MAR-04",
    "Chemosynthesis Survey",
    "Completed",
    "Baseline species mosaic established across four chimney clusters.",
    "2026-03-02T13:35:00.000Z",
    2,
  );
  upsertStationTimeline.run(
    "STL-303",
    "STA-MAR-04",
    "Public Deep-Ocean Showcase",
    "Active",
    "Live vent telemetry now powers immersive exhibit walkthroughs.",
    "2026-03-13T07:20:00.000Z",
    3,
  );

  upsertStationContent.run(
    "CNT-301",
    "STA-MAR-04",
    "brief",
    "Vent Field Operations Brief",
    "Daily synthesis of plume behavior, chemistry, and biology around active chimneys.",
    "/investigations",
    "2026-03-13T11:07:00.000Z",
    1,
  );
  upsertStationContent.run(
    "CNT-302",
    "STA-MAR-04",
    "dataset",
    "Ridge Plume Chemistry Stream",
    "Hydrothermal chemistry and turbidity telemetry for ridge modeling.",
    "/data-explorer",
    "2026-03-13T10:54:00.000Z",
    2,
  );
  upsertStationContent.run(
    "CNT-303",
    "STA-MAR-04",
    "explainer",
    "Life Without Sunlight",
    "Educational explainer on chemosynthetic ecosystems at deep-sea vents.",
    "/ai-lab",
    "2026-03-13T10:28:00.000Z",
    3,
  );

  upsertStationPageView.run("SPV-NPC-DETAIL-001", "STA-NPC-01", "detail", "2026-03-13T09:10:00.000Z");
  upsertStationPageView.run("SPV-NPC-DETAIL-002", "STA-NPC-01", "detail", "2026-03-13T10:25:00.000Z");
  upsertStationPageView.run("SPV-NPC-EXH-001", "STA-NPC-01", "exhibit", "2026-03-13T10:41:00.000Z");
  upsertStationPageView.run("SPV-NPC-PUB-001", "STA-NPC-01", "public", "2026-03-13T11:02:00.000Z");

  upsertStationPageView.run("SPV-GBR-DETAIL-001", "STA-GBR-02", "detail", "2026-03-13T09:24:00.000Z");
  upsertStationPageView.run("SPV-GBR-EXH-001", "STA-GBR-02", "exhibit", "2026-03-13T10:12:00.000Z");
  upsertStationPageView.run("SPV-GBR-PUB-001", "STA-GBR-02", "public", "2026-03-13T10:56:00.000Z");
  upsertStationPageView.run("SPV-GBR-PUB-002", "STA-GBR-02", "public", "2026-03-13T11:19:00.000Z");

  upsertStationPageView.run("SPV-MBY-DETAIL-001", "STA-MBY-03", "detail", "2026-03-13T09:48:00.000Z");
  upsertStationPageView.run("SPV-MBY-DETAIL-002", "STA-MBY-03", "detail", "2026-03-13T10:44:00.000Z");
  upsertStationPageView.run("SPV-MBY-EXH-001", "STA-MBY-03", "exhibit", "2026-03-13T11:05:00.000Z");
  upsertStationPageView.run("SPV-MBY-PUB-001", "STA-MBY-03", "public", "2026-03-13T11:21:00.000Z");

  upsertStationPageView.run("SPV-MAR-DETAIL-001", "STA-MAR-04", "detail", "2026-03-13T08:57:00.000Z");
  upsertStationPageView.run("SPV-MAR-EXH-001", "STA-MAR-04", "exhibit", "2026-03-13T10:09:00.000Z");
  upsertStationPageView.run("SPV-MAR-EXH-002", "STA-MAR-04", "exhibit", "2026-03-13T10:47:00.000Z");
  upsertStationPageView.run("SPV-MAR-PUB-001", "STA-MAR-04", "public", "2026-03-13T11:14:00.000Z");

  upsertStationAdminAudit.run(
    "AUD-NPC-001",
    "STA-NPC-01",
    "ops.lead@marine.local",
    "admin",
    "branding",
    JSON.stringify(["exhibitTitle", "publicDescription", "accentColor"]),
    "2026-03-13T10:12:00.000Z",
  );
  upsertStationAdminAudit.run(
    "AUD-NPC-002",
    "STA-NPC-01",
    "ops.lead@marine.local",
    "admin",
    "content",
    JSON.stringify(["species", "alerts", "timeline", "content"]),
    "2026-03-13T10:18:00.000Z",
  );
  upsertStationAdminAudit.run(
    "AUD-GBR-001",
    "STA-GBR-02",
    "reef.program@marine.local",
    "admin",
    "content",
    JSON.stringify(["alerts", "content"]),
    "2026-03-13T09:44:00.000Z",
  );

  upsertStationAdminSession.run(
    "sess-admin-ops-001",
    "ops.lead@marine.local",
    "admin",
    JSON.stringify([
      "station.view_admin",
      "station.edit_branding",
      "station.edit_content",
      "station.view_audit",
      "station.publish",
    ]),
    "seeded-csrf-admin-ops-001",
    "2026-03-13T08:00:00.000Z",
    "2026-12-31T23:59:59.000Z",
    null,
    null,
    JSON.stringify({
      seeded: true,
      notes: "Primary station admin session for local integration testing",
    }),
  );
  upsertStationAdminSession.run(
    "sess-viewer-ops-001",
    "observer.ops@marine.local",
    "viewer",
    JSON.stringify([
      "station.view_admin",
    ]),
    "seeded-csrf-viewer-ops-001",
    "2026-03-13T08:00:00.000Z",
    "2026-12-31T23:59:59.000Z",
    null,
    null,
    JSON.stringify({
      seeded: true,
      notes: "Non-admin session to validate access boundaries",
    }),
  );
  upsertStationAdminSession.run(
    "sess-expired-001",
    "former.admin@marine.local",
    "admin",
    JSON.stringify([
      "station.view_admin",
      "station.edit_branding",
      "station.edit_content",
      "station.view_audit",
      "station.publish",
    ]),
    "seeded-csrf-expired-001",
    "2025-01-01T00:00:00.000Z",
    "2025-01-01T01:00:00.000Z",
    null,
    null,
    JSON.stringify({
      seeded: true,
      notes: "Expired session for negative-path validation",
    }),
  );

  const adminCreds = hashPasswordForSeed("marine-admin-2026");
  const recoveryCodes = [
    { codeHash: hashRecoveryCodeForSeed("RECOVERY-OPS-001"), usedAt: null },
    { codeHash: hashRecoveryCodeForSeed("RECOVERY-OPS-002"), usedAt: null },
    { codeHash: hashRecoveryCodeForSeed("RECOVERY-OPS-003"), usedAt: "2026-03-15T14:05:00.000Z" },
  ];

  upsertStationAdminCredential.run(
    "ops.lead@marine.local",
    "admin",
    adminCreds.hash,
    adminCreds.salt,
    1,
    "246810",
    JSON.stringify(recoveryCodes),
    "2026-03-10T09:00:00.000Z",
    "2026-03-16T07:56:00.000Z",
  );

  upsertStationAdminAuthEvent.run(
    "AUTH-EVT-001",
    "login_success",
    "ops.lead@marine.local",
    "sess-admin-ops-001",
    "2026-03-16T07:55:00.000Z",
    JSON.stringify({
      ip: "203.0.113.42",
      userAgent: "Marine Ops Console/1.0",
      source: "POST /api/station-admin/login",
    }),
  );
  upsertStationAdminAuthEvent.run(
    "AUTH-EVT-002",
    "refresh",
    "ops.lead@marine.local",
    "sess-admin-ops-001",
    "2026-03-16T08:20:00.000Z",
    JSON.stringify({
      ip: "203.0.113.42",
      userAgent: "Marine Ops Console/1.0",
      source: "POST /api/station-admin/session/refresh",
    }),
  );
  upsertStationAdminAuthEvent.run(
    "AUTH-EVT-002A",
    "mfa_enrollment",
    "ops.lead@marine.local",
    null,
    "2026-03-10T09:00:00.000Z",
    JSON.stringify({
      source: "POST /api/station-admin/mfa/enroll",
      method: "totp_foundation",
    }),
  );
  upsertStationAdminAuthEvent.run(
    "AUTH-EVT-002B",
    "mfa_challenge_success",
    "ops.lead@marine.local",
    "sess-admin-ops-001",
    "2026-03-16T07:56:00.000Z",
    JSON.stringify({
      source: "POST /api/station-admin/mfa/verify",
      challengePurpose: "login",
    }),
  );
  upsertStationAdminAuthEvent.run(
    "AUTH-EVT-003",
    "login_failure",
    "observer.ops@marine.local",
    null,
    "2026-03-16T08:40:00.000Z",
    JSON.stringify({
      ip: "198.51.100.12",
      userAgent: "Browser Test Agent",
      source: "POST /api/station-admin/login",
    }),
  );
  upsertStationAdminAuthEvent.run(
    "AUTH-EVT-003A",
    "mfa_challenge_failure",
    "ops.lead@marine.local",
    null,
    "2026-03-16T08:44:00.000Z",
    JSON.stringify({
      source: "POST /api/station-admin/mfa/verify",
      challengePurpose: "login",
      attemptsRemaining: 4,
    }),
  );
  upsertStationAdminAuthEvent.run(
    "AUTH-EVT-003B",
    "recovery_code_used",
    "ops.lead@marine.local",
    null,
    "2026-03-15T14:05:00.000Z",
    JSON.stringify({
      source: "POST /api/station-admin/mfa/verify",
      challengePurpose: "login",
    }),
  );
  upsertStationAdminAuthEvent.run(
    "AUTH-EVT-004",
    "logout",
    "ops.lead@marine.local",
    "sess-admin-ops-001",
    "2026-03-16T09:10:00.000Z",
    JSON.stringify({
      ip: "203.0.113.42",
      userAgent: "Marine Ops Console/1.0",
      source: "POST /api/station-admin/logout",
    }),
  );

  const upsertStationEvent = db.prepare(`
    INSERT OR REPLACE INTO station_events
      (id, station_id, event_type, severity, status, title, summary, detected_at, resolved_at, investigation_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationEventEvidence = db.prepare(`
    INSERT OR REPLACE INTO station_event_evidence
      (id, event_id, source, kind, captured_at, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const upsertStationEventNote = db.prepare(`
    INSERT OR REPLACE INTO station_event_notes
      (id, event_id, author_id, body)
    VALUES (?, ?, ?, ?)
  `);
  const upsertStationEventAction = db.prepare(`
    INSERT OR REPLACE INTO station_event_actions
      (id, event_id, label, actor_id, performed_at, detail)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const upsertStationEventHistory = db.prepare(`
    INSERT OR REPLACE INTO station_event_history
      (id, event_id, from_status, to_status, changed_by, changed_at, reason)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const upsertStationInvestigation = db.prepare(`
    INSERT OR REPLACE INTO station_investigations
      (id, station_id, title, description, status, owner, opened_at, closed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Station STA-NPC-01 events
  upsertStationEvent.run(
    "EVT-NPC-001",
    "STA-NPC-01",
    "thermal_spike",
    "high",
    "investigating",
    "Sea surface temperature anomaly",
    "SST reading 4.2°C above seasonal baseline at primary sensor array. Persisting for 18 hours.",
    "2026-03-14T06:30:00.000Z",
    null,
    "INV-NPC-001",
  );
  upsertStationEvent.run(
    "EVT-NPC-002",
    "STA-NPC-01",
    "dissolved_oxygen_drop",
    "medium",
    "acknowledged",
    "Dissolved oxygen below threshold",
    "DO sensor reading 5.1 mg/L, below 6.0 mg/L minimum threshold for reef health.",
    "2026-03-15T14:10:00.000Z",
    null,
    null,
  );
  upsertStationEvent.run(
    "EVT-NPC-003",
    "STA-NPC-01",
    "sensor_health_degraded",
    "low",
    "resolved",
    "Salinity sensor intermittent",
    "Salinity sensor reporting intermittent null readings. Sensor reset resolved the issue.",
    "2026-03-10T09:00:00.000Z",
    "2026-03-10T11:30:00.000Z",
    null,
  );

  // Station STA-SBA-01 events
  upsertStationEvent.run(
    "EVT-SBA-001",
    "STA-SBA-01",
    "ph_drop",
    "high",
    "investigating",
    "Rapid pH decline detected",
    "pH dropped from 8.12 to 7.84 over 6-hour window. Consistent with upwelling event.",
    "2026-03-16T02:15:00.000Z",
    null,
    "INV-SBA-001",
  );
  upsertStationEvent.run(
    "EVT-SBA-002",
    "STA-SBA-01",
    "turbidity_spike",
    "medium",
    "new",
    "Elevated turbidity after storm event",
    "NTU reading 42 following overnight storm system. Monitoring for coral impact.",
    "2026-03-16T08:00:00.000Z",
    null,
    null,
  );

  // Evidence for NPC thermal event
  upsertStationEventEvidence.run(
    "EVD-NPC-001-A",
    "EVT-NPC-001",
    "Sensor Array NPC-TEMP-01",
    "sensor",
    "2026-03-14T06:30:00.000Z",
    "Primary thermistor logging 29.4°C. Secondary confirms reading within ±0.1°C.",
  );
  upsertStationEventEvidence.run(
    "EVD-NPC-001-B",
    "EVT-NPC-001",
    "NOAA SST Satellite",
    "satellite",
    "2026-03-14T08:00:00.000Z",
    "GOES-West composite confirms elevated SST patch 12km × 8km centered on station.",
  );

  // Evidence for SBA pH event
  upsertStationEventEvidence.run(
    "EVD-SBA-001-A",
    "EVT-SBA-001",
    "Sensor Array SBA-PH-01",
    "sensor",
    "2026-03-16T02:15:00.000Z",
    "pH electrode calibrated 48h prior. Dual-sensor confirms decline. DIC sample collected.",
  );

  // Notes
  upsertStationEventNote.run(
    "NOTE-NPC-001-A",
    "EVT-NPC-001",
    "ops.lead@marine.local",
    "Cross-referencing with HYCOM model run for 2026-03-13. Warm advection from offshore eddy plausible.",
  );
  upsertStationEventNote.run(
    "NOTE-SBA-001-A",
    "EVT-SBA-001",
    "researcher@marine.local",
    "pH decline rate consistent with CO2 enrichment from upwelling. Alkalinity sample sent to lab.",
  );

  // Actions
  upsertStationEventAction.run(
    "ACT-NPC-001-A",
    "EVT-NPC-001",
    "Investigation opened",
    "ops.lead@marine.local",
    "2026-03-14T09:00:00.000Z",
    "Linked to investigation INV-NPC-001 for tracking.",
  );
  upsertStationEventAction.run(
    "ACT-NPC-002-A",
    "EVT-NPC-002",
    "Alert acknowledged",
    "ops.lead@marine.local",
    "2026-03-15T14:30:00.000Z",
    null,
  );
  upsertStationEventAction.run(
    "ACT-SBA-001-A",
    "EVT-SBA-001",
    "Investigation opened",
    "researcher@marine.local",
    "2026-03-16T03:00:00.000Z",
    "Opened INV-SBA-001 to track pH decline and upwelling response.",
  );

  // History
  upsertStationEventHistory.run(
    "HST-NPC-001-A",
    "EVT-NPC-001",
    null,
    "new",
    "system",
    "2026-03-14T06:30:00.000Z",
    "Event detected by sensor threshold rule",
  );
  upsertStationEventHistory.run(
    "HST-NPC-001-B",
    "EVT-NPC-001",
    "new",
    "investigating",
    "ops.lead@marine.local",
    "2026-03-14T09:00:00.000Z",
    "Opened investigation for thermal anomaly tracking",
  );
  upsertStationEventHistory.run(
    "HST-NPC-002-A",
    "EVT-NPC-002",
    null,
    "new",
    "system",
    "2026-03-15T14:10:00.000Z",
    "Event detected by sensor threshold rule",
  );
  upsertStationEventHistory.run(
    "HST-NPC-002-B",
    "EVT-NPC-002",
    "new",
    "acknowledged",
    "ops.lead@marine.local",
    "2026-03-15T14:30:00.000Z",
    null,
  );
  upsertStationEventHistory.run(
    "HST-NPC-003-A",
    "EVT-NPC-003",
    null,
    "new",
    "system",
    "2026-03-10T09:00:00.000Z",
    "Event detected by sensor health monitor",
  );
  upsertStationEventHistory.run(
    "HST-NPC-003-B",
    "EVT-NPC-003",
    "new",
    "resolved",
    "ops.lead@marine.local",
    "2026-03-10T11:30:00.000Z",
    "Sensor reset cleared intermittent fault",
  );
  upsertStationEventHistory.run(
    "HST-SBA-001-A",
    "EVT-SBA-001",
    null,
    "new",
    "system",
    "2026-03-16T02:15:00.000Z",
    "Event detected by pH threshold rule",
  );
  upsertStationEventHistory.run(
    "HST-SBA-001-B",
    "EVT-SBA-001",
    "new",
    "investigating",
    "researcher@marine.local",
    "2026-03-16T03:00:00.000Z",
    "Opened investigation for pH decline tracking",
  );
  upsertStationEventHistory.run(
    "HST-SBA-002-A",
    "EVT-SBA-002",
    null,
    "new",
    "system",
    "2026-03-16T08:00:00.000Z",
    "Event detected by turbidity threshold rule",
  );

  // Investigations
  upsertStationInvestigation.run(
    "INV-NPC-001",
    "STA-NPC-01",
    "North Pacific thermal anomaly — March 2026",
    "Investigating sustained sea surface temperature spike linked to possible offshore eddy advection. Monitoring impact on coral thermal tolerance thresholds.",
    "open",
    "ops.lead@marine.local",
    "2026-03-14T09:00:00.000Z",
    null,
  );
  upsertStationInvestigation.run(
    "INV-SBA-001",
    "STA-SBA-01",
    "Santa Barbara upwelling pH event — March 2026",
    "Rapid pH decline consistent with CO2-enriched upwelling water. Tracking coral calcification impact and advection timeline.",
    "open",
    "researcher@marine.local",
    "2026-03-16T03:00:00.000Z",
    null,
  );

  db.close();
  console.log(`Seeded dataset sample DB at ${dbPath}`);
}

seedDatasetDatabase();
