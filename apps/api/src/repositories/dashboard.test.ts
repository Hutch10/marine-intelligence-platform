import test from "node:test";
import assert from "node:assert/strict";
import { getDashboardSummary } from "./dashboard";
import type { SqliteDatabaseLike } from "../db/client";

interface AlertRow {
  id: string;
  title: string;
  status: string;
  detected_at: string | null;
}

interface ReportRow {
  id: string;
  title: string;
  published_at: string | null;
}

interface SpeciesSightingRow {
  species_id: string;
  common_name: string;
  created_at: number;
}

interface MovementSignalRow {
  movement_type: string;
  confidence: number;
  created_at: number;
}

const NOW = () => Date.parse("2026-03-13T12:00:00.000Z");

const ALERT_ROWS: AlertRow[] = [
  { id: "ALT-214", title: "Thermal spike detected", status: "Open", detected_at: "2026-03-13T11:49:00.000Z" },
  { id: "ALT-209", title: "Buoy warming persistence", status: "Open", detected_at: "2026-03-13T11:37:00.000Z" },
  { id: "ALT-198", title: "Nutrient imbalance cluster", status: "Open", detected_at: "2026-03-13T11:06:00.000Z" },
  { id: "ALT-180", title: "Oxygen depletion warning", status: "Monitoring", detected_at: "2026-03-13T10:00:00.000Z" },
];

const REPORT_ROWS: ReportRow[] = [
  { id: "RPT-001", title: "North Pacific Thermal Analysis", published_at: "2026-03-13T09:30:00.000Z" },
  { id: "RPT-002", title: "Reef Edge Corridor Status Update", published_at: "2026-03-13T08:00:00.000Z" },
];

function createDatabase(
  alertRows: AlertRow[],
  reportRows: ReportRow[],
  options?: { throwOnQuery?: boolean; datasetCount?: number; investigationCount?: number },
): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (options?.throwOnQuery) {
            throw new Error("query failed");
          }

          if (sql.includes("COUNT(*) AS total") && sql.includes("FROM alerts")) {
            return [{ total: alertRows.filter((r) => r.status === "Open").length }];
          }

          if (sql.includes("COUNT(*) AS total") && sql.includes("FROM datasets")) {
            return [{ total: options?.datasetCount ?? 0 }];
          }

          if (sql.includes("COUNT(*) AS total") && sql.includes("FROM investigations")) {
            return [{ total: options?.investigationCount ?? 0 }];
          }

          if (sql.includes("FROM alerts")) {
            const limit = Number(params[0] ?? alertRows.length);
            const sorted = [...alertRows]
              .filter((r) => r.detected_at !== null)
              .sort((a, b) => (b.detected_at ?? "").localeCompare(a.detected_at ?? ""));
            return sorted.slice(0, limit);
          }

          if (sql.includes("FROM reports")) {
            const limit = Number(params[0] ?? reportRows.length);
            const sorted = [...reportRows]
              .filter((r) => r.published_at !== null)
              .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
            return sorted.slice(0, limit);
          }

          return [];
        },
      };
    },
    close() {},
  };
}

function createFullDatabase(
  alertRows: AlertRow[],
  reportRows: ReportRow[],
  sightingRows: SpeciesSightingRow[],
  movementRows: MovementSignalRow[],
  options?: { throwOnSpeciesQuery?: boolean },
): SqliteDatabaseLike {
  return {
    prepare(sql: string) {
      return {
        all(...params: unknown[]) {
          if (
            sql.includes("species_sightings") ||
            sql.includes("species_movement_signals") ||
            (sql.includes("sighting_count") && sql.includes("JOIN species"))
          ) {
            if (options?.throwOnSpeciesQuery) {
              throw new Error("no such table: species_sightings");
            }

            if (sql.includes("COUNT(*) AS total") && sql.includes("FROM species_sightings")) {
              const windowStart = Number(params[0] ?? 0);
              return [{ total: sightingRows.filter((r) => r.created_at >= windowStart).length }];
            }

            if (sql.includes("total_count") && sql.includes("max_confidence")) {
              const windowStart = Number(params[0] ?? 0);
              const recent = movementRows.filter((r) => r.created_at >= windowStart);
              if (recent.length === 0) {
                return [{ total_count: 0, max_confidence: 0 }];
              }
              return [{
                total_count: recent.length,
                max_confidence: Math.max(...recent.map((r) => r.confidence)),
              }];
            }

            if (sql.includes("movement_type") && sql.includes("signal_count")) {
              const windowStart = Number(params[0] ?? 0);
              const recent = movementRows.filter((r) => r.created_at >= windowStart);
              const counts: Record<string, number> = {};
              for (const row of recent) {
                counts[row.movement_type] = (counts[row.movement_type] ?? 0) + 1;
              }
              return Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([movement_type, signal_count]) => ({ movement_type, signal_count }));
            }

            if (sql.includes("sighting_count") && sql.includes("JOIN species")) {
              const windowStart = Number(params[0] ?? 0);
              const recent = sightingRows.filter((r) => r.created_at >= windowStart);
              const counts: Record<string, { common_name: string; count: number }> = {};
              for (const row of recent) {
                if (!counts[row.species_id]) {
                  counts[row.species_id] = { common_name: row.common_name, count: 0 };
                }
                counts[row.species_id]!.count += 1;
              }
              return Object.entries(counts)
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 5)
                .map(([species_id, { common_name, count }]) => ({
                  species_id,
                  common_name,
                  sighting_count: count,
                }));
            }

            return [];
          }

          if (sql.includes("COUNT(*) AS total") && sql.includes("FROM alerts")) {
            return [{ total: alertRows.filter((r) => r.status === "Open").length }];
          }
          if (sql.includes("COUNT(*) AS total") && sql.includes("FROM datasets")) {
            return [{ total: 0 }];
          }
          if (sql.includes("COUNT(*) AS total") && sql.includes("FROM investigations")) {
            return [{ total: 0 }];
          }
          if (sql.includes("FROM alerts")) {
            const limit = Number(params[0] ?? alertRows.length);
            const sorted = [...alertRows]
              .filter((r) => r.detected_at !== null)
              .sort((a, b) => (b.detected_at ?? "").localeCompare(a.detected_at ?? ""));
            return sorted.slice(0, limit);
          }
          if (sql.includes("FROM reports")) {
            const limit = Number(params[0] ?? reportRows.length);
            const sorted = [...reportRows]
              .filter((r) => r.published_at !== null)
              .sort((a, b) => (b.published_at ?? "").localeCompare(a.published_at ?? ""));
            return sorted.slice(0, limit);
          }

          return [];
        },
      };
    },
    close() {},
  };
}

test("dashboard repository returns DB counts", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(ALERT_ROWS, REPORT_ROWS, { datasetCount: 4, investigationCount: 3 }),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.counts.openAlertCount, 3);
    assert.equal(result.counts.totalDatasets, 4);
    assert.equal(result.counts.totalInvestigations, 3);
  }
});

test("dashboard repository counts only Open status alerts", () => {
  const mixed: AlertRow[] = [
    { id: "A1", title: "Open one", status: "Open", detected_at: "2026-03-13T10:00:00.000Z" },
    { id: "A2", title: "Monitoring one", status: "Monitoring", detected_at: "2026-03-13T09:00:00.000Z" },
    { id: "A3", title: "Closed one", status: "Closed", detected_at: "2026-03-13T08:00:00.000Z" },
  ];

  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(mixed, []),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.counts.openAlertCount, 1);
  }
});

test("dashboard repository returns activity items merged and sorted by timestamp desc", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(ALERT_ROWS, REPORT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.activity.length > 0);
    const types = result.activity.map((item) => item.type);
    assert.ok(types.includes("alert"));
    assert.ok(types.includes("report"));
    assert.equal(result.activity[0]?.type, "alert");
    assert.equal(result.activity[0]?.text, "Thermal spike detected");
  }
});

test("dashboard repository formats relative timestamps for activity items", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () =>
      createDatabase(
        [{ id: "A1", title: "Recent alert", status: "Open", detected_at: "2026-03-13T11:49:00.000Z" }],
        [],
      ),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.activity[0]?.time, "11 min ago");
  }
});

test("dashboard repository returns empty activity list when no alerts or reports", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase([], []),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.activity, []);
    assert.equal(result.counts.openAlertCount, 0);
  }
});

test("dashboard repository caps activity at 6 items", () => {
  const manyAlerts: AlertRow[] = Array.from({ length: 10 }, (_, i) => ({
    id: `ALT-${i}`,
    title: `Alert ${i}`,
    status: "Open",
    detected_at: `2026-03-13T${String(i).padStart(2, "0")}:00:00.000Z`,
  }));

  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(manyAlerts, REPORT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.activity.length <= 6);
  }
});

test("dashboard repository falls back with db_path_missing when the DB file does not exist", () => {
  const result = getDashboardSummary({
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_path_missing" });
});

test("dashboard repository falls back with db_open_failed when opening the DB throws", () => {
  const result = getDashboardSummary({
    resolvePath: () => "broken.sqlite",
    hasPath: () => true,
    openDatabase: () => {
      throw new Error("open failed");
    },
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_open_failed" });
});

test("dashboard repository falls back with db_query_failed when querying throws", () => {
  const result = getDashboardSummary({
    resolvePath: () => "query.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(ALERT_ROWS, REPORT_ROWS, { throwOnQuery: true }),
  });

  assert.deepEqual(result, { source: "mock", fallbackReason: "db_query_failed" });
});

const WINDOW_START_MS = Date.parse("2026-03-13T12:00:00.000Z") - 14 * 24 * 60 * 60 * 1000;

const SIGHTING_ROWS: SpeciesSightingRow[] = [
  { species_id: "SP-001", common_name: "Blue Whale", created_at: WINDOW_START_MS + 1000 },
  { species_id: "SP-001", common_name: "Blue Whale", created_at: WINDOW_START_MS + 2000 },
  { species_id: "SP-001", common_name: "Blue Whale", created_at: WINDOW_START_MS + 3000 },
  { species_id: "SP-002", common_name: "Humpback Whale", created_at: WINDOW_START_MS + 4000 },
];

const MOVEMENT_ROWS: MovementSignalRow[] = [
  { movement_type: "route_deviation", confidence: 84, created_at: WINDOW_START_MS + 1000 },
  { movement_type: "aggregation_shift", confidence: 75, created_at: WINDOW_START_MS + 2000 },
  { movement_type: "route_deviation", confidence: 60, created_at: WINDOW_START_MS + 3000 },
];

test("dashboard repository returns species activity with sighting and movement counts", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createFullDatabase(ALERT_ROWS, REPORT_ROWS, SIGHTING_ROWS, MOVEMENT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.ok(result.speciesActivity !== null && result.speciesActivity !== undefined);
    if (result.speciesActivity) {
      assert.equal(result.speciesActivity.recentSightingCount, 4);
      assert.equal(result.speciesActivity.recentMovementSignalCount, 3);
      assert.equal(result.speciesActivity.windowDays, 14);
      assert.ok(result.speciesActivity.generatedAt.startsWith("2026-03-13"));
    }
  }
});

test("dashboard repository species activity top movement types ordered by frequency", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createFullDatabase(ALERT_ROWS, REPORT_ROWS, SIGHTING_ROWS, MOVEMENT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.speciesActivity) {
    assert.equal(result.speciesActivity.topMovementTypes[0], "route_deviation");
    assert.ok(result.speciesActivity.topMovementTypes.includes("aggregation_shift"));
  }
});

test("dashboard repository species activity top active species ordered by sighting count", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createFullDatabase(ALERT_ROWS, REPORT_ROWS, SIGHTING_ROWS, MOVEMENT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.speciesActivity) {
    assert.equal(result.speciesActivity.topActiveSpecies[0]?.speciesId, "SP-001");
    assert.equal(result.speciesActivity.topActiveSpecies[0]?.commonName, "Blue Whale");
    assert.equal(result.speciesActivity.topActiveSpecies[0]?.sightingCount, 3);
  }
});

test("dashboard repository species activity includes ecological reasons from aggregated data", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createFullDatabase(ALERT_ROWS, REPORT_ROWS, SIGHTING_ROWS, MOVEMENT_ROWS),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.speciesActivity) {
    const kinds = result.speciesActivity.ecologicalReasons.map((r) => r.kind);
    assert.ok(kinds.includes("increased_sighting_rate"));
    assert.ok(kinds.includes("feeding_aggregation_detected"));
    assert.ok(kinds.includes("migration_shift_detected"));
    assert.ok(kinds.includes("species_anomaly_window_overlap"));
    assert.ok(kinds.includes("elevated_movement_confidence"));
  }
});

test("dashboard repository species activity returns valid empty state when no recent data", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createFullDatabase(ALERT_ROWS, REPORT_ROWS, [], []),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db" && result.speciesActivity) {
    assert.equal(result.speciesActivity.recentSightingCount, 0);
    assert.equal(result.speciesActivity.recentMovementSignalCount, 0);
    assert.deepEqual(result.speciesActivity.topMovementTypes, []);
    assert.deepEqual(result.speciesActivity.topActiveSpecies, []);
    assert.deepEqual(result.speciesActivity.ecologicalReasons, []);
  }
});

test("dashboard repository species activity returns null when species tables are absent", () => {
  const result = getDashboardSummary({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createFullDatabase(ALERT_ROWS, REPORT_ROWS, [], [], { throwOnSpeciesQuery: true }),
    now: NOW,
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.speciesActivity, null);
  }
});
