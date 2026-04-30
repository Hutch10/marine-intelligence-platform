import test from "node:test";
import assert from "node:assert/strict";
import {
  getStationAdminById,
  getStationAdminAuditById,
  getStationAnalytics,
  getStationById,
  listStations,
  recordStationPageView,
  updateStationAdmin,
} from "./stations";
import type { AsyncDbAdapter } from "../db/async-client";

interface StationTestRow {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  status: string;
  summary: string;
  location_label: string;
  depth_m: number | null;
  last_reported_at: string | null;
  hero_metric: string | null;
  sponsor_name: string | null;
  operator_name: string | null;
  logo_url: string | null;
  logo_label: string | null;
  exhibit_title: string | null;
  accent_color: string | null;
  public_description: string | null;
  created_at: string;
  updated_at: string;
}

interface StationSpeciesRow {
  id: string;
  station_id: string;
  name: string;
  status: string;
  population_trend: string | null;
  observed_at: string | null;
  notes: string | null;
  sort_order: number;
}

interface StationSensorRow {
  id: string;
  station_id: string;
  name: string;
  category: string;
  value: string;
  unit: string | null;
  status: string;
  sampled_at: string | null;
  sort_order: number;
}

interface StationAlertRow {
  id: string;
  station_id: string;
  title: string;
  severity: string;
  status: string;
  detail: string | null;
  detected_at: string | null;
}

interface StationTimelineRow {
  id: string;
  station_id: string;
  label: string;
  phase: string;
  detail: string;
  happened_at: string | null;
  sort_order: number;
}

interface StationContentRow {
  id: string;
  station_id: string;
  content_type: string;
  title: string;
  summary: string;
  href: string | null;
  published_at: string | null;
  sort_order: number;
}

interface StationPageViewRow {
  id: string;
  station_id: string;
  view_type: "detail" | "exhibit" | "public";
  viewed_at: string;
}

interface StationAdminAuditRow {
  id: string;
  station_id: string;
  actor_id: string;
  actor_role: string;
  area: string;
  changed_fields: string;
  changed_at: string;
}

const STATIONS: StationTestRow[] = [
  {
    id: "STA-NPC-01",
    slug: "north-pacific-corridor",
    name: "North Pacific Corridor",
    region: "North Pacific",
    status: "Active Monitoring",
    summary: "Flagship station",
    location_label: "34.6N, 143.2W",
    depth_m: 420,
    last_reported_at: "2026-03-13T11:58:00.000Z",
    hero_metric: "Coral Stress Index 82",
    sponsor_name: "Blue Current Foundation",
    operator_name: "Ocean Systems Lab",
    logo_url: null,
    logo_label: "Blue Current x Ocean Systems",
    exhibit_title: "North Pacific Living Reef Exhibit",
    accent_color: "cyan",
    public_description: "Public-facing station summary",
    created_at: "2026-02-01T09:00:00.000Z",
    updated_at: "2026-03-13T11:58:00.000Z",
  },
  {
    id: "STA-ES-01",
    slug: "eastern-shelf-grid",
    name: "Eastern Shelf Grid",
    region: "Eastern Shelf",
    status: "Standby",
    summary: "Secondary shelf station",
    location_label: "33.9N, 141.7W",
    depth_m: 280,
    last_reported_at: "2026-03-13T09:12:00.000Z",
    hero_metric: null,
    sponsor_name: null,
    operator_name: null,
    logo_url: null,
    logo_label: null,
    exhibit_title: null,
    accent_color: null,
    public_description: null,
    created_at: "2026-02-04T09:00:00.000Z",
    updated_at: "2026-03-13T09:12:00.000Z",
  },
];

const SPECIES: StationSpeciesRow[] = [
  {
    id: "SPC-001",
    station_id: "STA-NPC-01",
    name: "Acropora hyacinthus",
    status: "Stressed",
    population_trend: "-12%",
    observed_at: "2026-03-13T11:20:00.000Z",
    notes: "Paling",
    sort_order: 1,
  },
  {
    id: "SPC-002",
    station_id: "STA-NPC-01",
    name: "Chromis viridis",
    status: "Monitoring",
    population_trend: "+4%",
    observed_at: "2026-03-13T11:32:00.000Z",
    notes: "Shifted",
    sort_order: 2,
  },
];

const SENSORS: StationSensorRow[] = [
  {
    id: "SNS-001",
    station_id: "STA-NPC-01",
    name: "Sea Surface Temperature",
    category: "Thermal",
    value: "18.9",
    unit: "C",
    status: "Live",
    sampled_at: "2026-03-13T11:58:00.000Z",
    sort_order: 1,
  },
  {
    id: "SNS-002",
    station_id: "STA-NPC-01",
    name: "Dissolved Oxygen",
    category: "Chemistry",
    value: "4.8",
    unit: "mg/L",
    status: "Watch",
    sampled_at: "2026-03-13T11:50:00.000Z",
    sort_order: 2,
  },
];

const ALERTS: StationAlertRow[] = [
  {
    id: "STA-ALT-01",
    station_id: "STA-NPC-01",
    title: "Thermal anomaly exceeded stress threshold",
    severity: "high",
    status: "Open",
    detail: "Thermal persistence",
    detected_at: "2026-03-13T11:49:00.000Z",
  },
  {
    id: "STA-ALT-02",
    station_id: "STA-NPC-01",
    title: "Unknown severity alert",
    severity: "critical",
    status: "Monitoring",
    detail: null,
    detected_at: "2026-03-13T11:40:00.000Z",
  },
];

const TIMELINE: StationTimelineRow[] = [
  {
    id: "STL-001",
    station_id: "STA-NPC-01",
    label: "Deployment",
    phase: "Completed",
    detail: "Ready",
    happened_at: "2026-02-01T09:00:00.000Z",
    sort_order: 1,
  },
  {
    id: "STL-002",
    station_id: "STA-NPC-01",
    label: "Response Window",
    phase: "Active",
    detail: "Monitoring",
    happened_at: "2026-03-13T11:00:00.000Z",
    sort_order: 2,
  },
];

const CONTENT: StationContentRow[] = [
  {
    id: "CNT-001",
    station_id: "STA-NPC-01",
    content_type: "brief",
    title: "Morning Brief",
    summary: "Summary",
    href: "/investigations",
    published_at: "2026-03-13T11:30:00.000Z",
    sort_order: 1,
  },
  {
    id: "CNT-002",
    station_id: "STA-NPC-01",
    content_type: "dataset",
    title: "Thermal Feed",
    summary: "Data",
    href: "/data-explorer",
    published_at: "2026-03-13T11:20:00.000Z",
    sort_order: 2,
  },
];

const STATION_PAGE_VIEWS: StationPageViewRow[] = [
  {
    id: "SPV-001",
    station_id: "STA-NPC-01",
    view_type: "detail",
    viewed_at: "2026-03-13T11:25:00.000Z",
  },
  {
    id: "SPV-002",
    station_id: "STA-NPC-01",
    view_type: "exhibit",
    viewed_at: "2026-03-13T11:30:00.000Z",
  },
  {
    id: "SPV-003",
    station_id: "STA-NPC-01",
    view_type: "public",
    viewed_at: "2026-03-13T11:40:00.000Z",
  },
  {
    id: "SPV-004",
    station_id: "STA-NPC-01",
    view_type: "detail",
    viewed_at: "2026-03-13T11:50:00.000Z",
  },
];

const STATION_ADMIN_AUDITS: StationAdminAuditRow[] = [
  {
    id: "AUD-000",
    station_id: "STA-NPC-01",
    actor_id: "seed.admin@marine.local",
    actor_role: "admin",
    area: "branding",
    changed_fields: JSON.stringify(["exhibitTitle"]),
    changed_at: "2026-03-13T10:00:00.000Z",
  },
];

function sortStations(rows: StationTestRow[]): StationTestRow[] {
  return [...rows].sort((left, right) => {
    const updatedCmp = right.updated_at.localeCompare(left.updated_at);
    if (updatedCmp !== 0) return updatedCmp;
    const createdCmp = right.created_at.localeCompare(left.created_at);
    if (createdCmp !== 0) return createdCmp;
    return left.id.localeCompare(right.id);
  });
}

function createMockAdapter(
  options?: { throwOnQuery?: boolean; throwOnChildren?: boolean },
): AsyncDbAdapter {
  const pageViews = STATION_PAGE_VIEWS.map((row) => ({ ...row }));
  const adminAudits = STATION_ADMIN_AUDITS.map((row) => ({ ...row }));

  return {
    resourceId: "mock-resource",
    async execute(sql: string, params: unknown[] = []) {
      if (options?.throwOnQuery) {
        throw new Error("query failed");
      }

      const stationId = String(params[0] ?? "");

      if (options?.throwOnChildren && (
        sql.includes("FROM station_species")
        || sql.includes("FROM station_sensors")
        || sql.includes("FROM station_alerts")
        || sql.includes("FROM station_timelines")
        || sql.includes("FROM station_content")
      )) {
        throw new Error("child query failed");
      }

      if (sql.includes("FROM station_species")) {
        return SPECIES.filter((row) => row.station_id === stationId).sort((left, right) => {
          const orderCmp = left.sort_order - right.sort_order;
          if (orderCmp !== 0) return orderCmp;
          const observedCmp = (right.observed_at ?? "").localeCompare(left.observed_at ?? "");
          if (observedCmp !== 0) return observedCmp;
          return left.id.localeCompare(right.id);
        });
      }

      if (sql.includes("FROM station_sensors")) {
        return SENSORS.filter((row) => row.station_id === stationId).sort((left, right) => {
          const orderCmp = left.sort_order - right.sort_order;
          if (orderCmp !== 0) return orderCmp;
          const sampledCmp = (right.sampled_at ?? "").localeCompare(left.sampled_at ?? "");
          if (sampledCmp !== 0) return sampledCmp;
          return left.id.localeCompare(right.id);
        });
      }

      if (sql.includes("FROM station_alerts")) {
        return ALERTS.filter((row) => row.station_id === stationId).sort((left, right) => {
          const detectedCmp = (right.detected_at ?? "").localeCompare(left.detected_at ?? "");
          if (detectedCmp !== 0) return detectedCmp;
          return left.id.localeCompare(right.id);
        });
      }

      if (sql.includes("FROM station_timelines")) {
        return TIMELINE.filter((row) => row.station_id === stationId).sort((left, right) => {
          const orderCmp = left.sort_order - right.sort_order;
          if (orderCmp !== 0) return orderCmp;
          const happenedCmp = (right.happened_at ?? "").localeCompare(left.happened_at ?? "");
          if (happenedCmp !== 0) return happenedCmp;
          return left.id.localeCompare(right.id);
        });
      }

      if (sql.includes("FROM station_content")) {
        return CONTENT.filter((row) => row.station_id === stationId).sort((left, right) => {
          const orderCmp = left.sort_order - right.sort_order;
          if (orderCmp !== 0) return orderCmp;
          const publishedCmp = (right.published_at ?? "").localeCompare(left.published_at ?? "");
          if (publishedCmp !== 0) return publishedCmp;
          return left.id.localeCompare(right.id);
        });
      }

      if (sql.includes("FROM station_page_views")) {
        const rows = pageViews.filter((row) => row.station_id === stationId);
        const detailViews = rows.filter((row) => row.view_type === "detail").length;
        const exhibitViews = rows.filter((row) => row.view_type === "exhibit").length;
        const publicViews = rows.filter((row) => row.view_type === "public").length;
        const lastViewedAt = rows
          .map((row) => row.viewed_at)
          .sort((left, right) => right.localeCompare(left))[0] ?? null;

        return [{
          detail_views: detailViews,
          exhibit_views: exhibitViews,
          public_views: publicViews,
          last_viewed_at: lastViewedAt,
        }];
      }

      if (sql.includes("FROM station_admin_audits")) {
        return adminAudits
          .filter((row) => row.station_id === stationId)
          .sort((left, right) => {
            const changedCmp = right.changed_at.localeCompare(left.changed_at);
            if (changedCmp !== 0) return changedCmp;
            return right.id.localeCompare(left.id);
          });
      }

      if (sql.includes("WHERE s.id = ? OR s.slug = ?")) {
        const stationIdOrSlug = String(params[0] ?? "");
        const station = sortStations(STATIONS).find(
          (row) => row.id === stationIdOrSlug || row.slug === stationIdOrSlug,
        );
        return station ? [station] : [];
      }

      if (sql.includes("INSERT INTO station_page_views")) {
        pageViews.push({
          id: String(params[0]),
          station_id: String(params[1]),
          view_type: params[2] as StationPageViewRow["view_type"],
          viewed_at: String(params[3]),
        });
        return [];
      }

      if (sql.includes("INSERT INTO station_admin_audits")) {
        adminAudits.push({
          id: String(params[0]),
          station_id: String(params[1]),
          actor_id: String(params[2]),
          actor_role: String(params[3]),
          area: String(params[4]),
          changed_fields: String(params[5]),
          changed_at: String(params[6]),
        });
        return [];
      }

      return sortStations(STATIONS);
    },
    async close() {},
  };
}

const NOW = () => Date.parse("2026-03-13T12:00:00.000Z");

test("station repository returns DB-backed station summaries", async () => {
  const result = await listStations({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.stations.length, 2);
    assert.equal(result.stations[0]?.id, "STA-NPC-01");
    assert.equal(result.stations[0]?.lastReported, "2 min ago");
    assert.equal(result.stations[0]?.branding.sponsorName, "Blue Current Foundation");
    assert.equal(result.stations[0]?.branding.exhibitTitle, "North Pacific Living Reef Exhibit");
    assert.equal(result.stations[1]?.heroMetric, "No active metric");
    assert.equal(result.stations[1]?.branding.sponsorName, "Marine Bio Partner Network");
    assert.equal(result.stations[1]?.branding.accentColor, "cyan");
  }
});

test("station repository returns an empty DB list without fallback", async () => {
  const result = await listStations({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => ({
      resourceId: "empty",
      async execute() { return []; },
      async close() {},
    }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.stations, []);
  }
});

test("station detail repository returns DB-backed detail for station id", async () => {
  const result = await getStationById("STA-NPC-01", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.equal(result.station.name, "North Pacific Corridor");
    assert.equal(result.station.branding.operatorName, "Ocean Systems Lab");
    assert.equal(result.station.branding.publicDescription, "Public-facing station summary");
    assert.equal(result.station.species.length, 2);
    assert.equal(result.station.sensors.length, 2);
    assert.equal(result.station.alerts[1]?.severity, "medium");
    assert.equal(result.station.timeline.length, 2);
    assert.equal(result.station.content.length, 2);
  }
});

test("station detail repository resolves DB-backed detail by slug", async () => {
  const result = await getStationById("north-pacific-corridor", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "found");
  }
});

test("station detail repository tolerates child query failures with empty arrays", async () => {
  const result = await getStationById("STA-NPC-01", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter({ throwOnChildren: true }),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.deepEqual(result.station.species, []);
    assert.deepEqual(result.station.sensors, []);
    assert.deepEqual(result.station.alerts, []);
    assert.deepEqual(result.station.timeline, []);
    assert.deepEqual(result.station.content, []);
  }
});

test("station detail repository returns not_found from DB when no row exists", async () => {
  const result = await getStationById("STA-MISSING", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
  });

  assert.deepEqual(result, { source: "db", result: "not_found" });
});

test("station repository falls back with db_path_missing", async () => {
  const listResult = await listStations({
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  const detailResult = await getStationById("STA-NPC-01", {
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(listResult, { source: "mock", fallbackReason: "db_path_missing" });
  assert.deepEqual(detailResult, { source: "mock", fallbackReason: "db_path_missing" });
});

test("station repository falls back with db_open_failed", async () => {
  const listResult = await listStations({
    resolvePath: () => "broken.sqlite",
    hasPath: () => true,
    getAdapter: () => {
      throw new Error("open failed");
    },
  });

  const detailResult = await getStationById("STA-NPC-01", {
    resolvePath: () => "broken.sqlite",
    hasPath: () => true,
    getAdapter: () => {
      throw new Error("open failed");
    },
  });

  assert.deepEqual(listResult, { source: "mock", fallbackReason: "db_open_failed" });
  assert.deepEqual(detailResult, { source: "mock", fallbackReason: "db_open_failed" });
});

test("station repository falls back with db_query_failed", async () => {
  const listResult = await listStations({
    resolvePath: () => "query.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter({ throwOnQuery: true }),
  });

  const detailResult = await getStationById("STA-NPC-01", {
    resolvePath: () => "query.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter({ throwOnQuery: true }),
  });

  assert.deepEqual(listResult, { source: "mock", fallbackReason: "db_query_failed" });
  assert.deepEqual(detailResult, { source: "mock", fallbackReason: "db_query_failed" });
});

test("station analytics repository returns DB-backed counts", async () => {
  const result = await getStationAnalytics("STA-NPC-01", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "found") {
    assert.equal(result.analytics.stationId, "STA-NPC-01");
    assert.equal(result.analytics.views.detail, 2);
    assert.equal(result.analytics.views.exhibit, 1);
    assert.equal(result.analytics.views.public, 1);
    assert.equal(result.analytics.views.total, 4);
    assert.equal(result.analytics.lastViewedAt, "2026-03-13T11:50:00.000Z");
  }
});

test("station page view tracking records a DB event", async () => {
  const result = await recordStationPageView("STA-NPC-01", "detail", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
    now: () => Date.parse("2026-03-13T12:10:00.000Z"),
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.result === "recorded") {
    assert.equal(result.stationId, "STA-NPC-01");
    assert.equal(result.viewType, "detail");
    assert.equal(result.viewedAt, "2026-03-13T12:10:00.000Z");
  }
});

test("station admin read mirrors detail read behavior", async () => {
  const result = await getStationAdminById("STA-NPC-01", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "found");
  }
});

test("station admin update rejects invalid accent values", async () => {
  const result = await updateStationAdmin("STA-NPC-01", {
    accentColor: "invalid" as "cyan",
  }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "invalid");
  }
});

test("station admin update accepts valid branding and content patches", async () => {
  const result = await updateStationAdmin("STA-NPC-01", {
    exhibitTitle: "North Pacific Admin Exhibit",
    publicDescription: "Updated description",
    sponsorName: "Updated Sponsor",
    operatorName: "Updated Operator",
    accentColor: "emerald",
    species: [
      {
        name: "Admin species",
        status: "Monitoring",
        populationTrend: "Stable",
        notes: "Updated",
      },
    ],
    alerts: [
      {
        title: "Admin alert",
        severity: "medium",
        status: "Open",
        detail: "Updated alert",
      },
    ],
    timeline: [
      {
        label: "Admin timeline",
        phase: "Active",
        detail: "Updated timeline",
      },
    ],
    content: [
      {
        contentType: "guide",
        title: "Admin card",
        summary: "Updated content",
        href: "/ai-lab",
      },
    ],
  }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => createMockAdapter(),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.result, "updated");
  }
});

test("station admin update creates audit entries with actor and changed areas", async () => {
  const sharedAdapter = createMockAdapter();

  const updateResult = await updateStationAdmin("STA-NPC-01", {
    exhibitTitle: "North Pacific Admin Exhibit",
    content: [
      {
        contentType: "guide",
        title: "Admin card",
        summary: "Updated content",
        href: "/ai-lab",
      },
    ],
  }, {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => sharedAdapter,
    now: NOW,
  }, {
    actorId: "pilot.admin@marine.local",
    role: "admin",
    permissions: [
      "station.view_admin",
      "station.edit_branding",
      "station.edit_content",
      "station.view_audit",
      "station.publish",
    ],
    csrfToken: "test-csrf-repo-001",
  });

  assert.equal(updateResult.source, "db");
  if (updateResult.source === "db") {
    assert.equal(updateResult.result, "updated");
  }

  const auditResult = await getStationAdminAuditById("STA-NPC-01", {
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    getAdapter: () => sharedAdapter,
  });

  assert.equal(auditResult.source, "db");
  if (auditResult.source === "db" && auditResult.result === "found") {
    const pilotEntries = auditResult.entries.filter((entry) => entry.actorId === "pilot.admin@marine.local");
    assert.equal(pilotEntries.length, 2);
    assert.ok(pilotEntries.some((entry) => entry.area === "branding"));
    assert.ok(pilotEntries.some((entry) => entry.area === "content"));
  }
});
