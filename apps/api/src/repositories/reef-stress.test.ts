import test from "node:test";
import assert from "node:assert/strict";
import { listLatestReefStress, readLatestReefStressFromDb } from "./reef-stress";
import type { AsyncDbAdapter, AsyncDbRow } from "../db/async-client";

function createDatabaseAdapter(rows: Record<string, unknown[]>): AsyncDbAdapter {
  return {
    async execute(sql: string, params: unknown[] = []) {
      if (sql.includes("FROM derived_signals")) {
        return rows.signals as AsyncDbRow[];
      }

      if (sql.includes("FROM station_metrics")) {
        const observedAt = Number(params[1]);

        if (!Number.isFinite(observedAt)) {
          return [];
        }

        return rows.metrics as AsyncDbRow[];
      }

      return [];
    },
    close() {},
  } as unknown as AsyncDbAdapter;
}

test("readLatestReefStressFromDb builds reef stress snapshots from metrics and signals", async () => {
  const db = createDatabaseAdapter({
    signals: [
      {
        station_id: null,
        region_key: "Great Barrier Reef",
        signal_label: "alert_level_1",
        observed_at: Date.parse("2026-03-18T10:00:00.000Z"),
      },
    ],
    metrics: [
      { metric_type: "sst_anomaly_c", metric_value: 1.8 },
      { metric_type: "hotspot_c", metric_value: 1.4 },
      { metric_type: "dhw", metric_value: 6.2 },
    ],
  });

  const alerts = await readLatestReefStressFromDb(db, 20);

  assert.equal(alerts.length, 1);
  assert.equal(alerts[0]?.region, "Great Barrier Reef");
  assert.equal(alerts[0]?.hotSpotC, 1.4);
  assert.equal(alerts[0]?.dhw, 6.2);
  assert.equal(alerts[0]?.outputClass, "derived");
});

test("listLatestReefStress falls back when database path is missing", async () => {
  const previousTursoUrl = process.env.TURSO_DATABASE_URL;
  const previousTursoToken = process.env.TURSO_AUTH_TOKEN;
  delete process.env.TURSO_DATABASE_URL;
  delete process.env.TURSO_AUTH_TOKEN;

  try {
    const result = await listLatestReefStress({
      resolvePath: () => "missing.sqlite",
      hasPath: () => false,
    });

    assert.deepEqual(result, { source: "mock", fallbackReason: "db_path_missing" });
  } finally {
    if (previousTursoUrl === undefined) {
      delete process.env.TURSO_DATABASE_URL;
    } else {
      process.env.TURSO_DATABASE_URL = previousTursoUrl;
    }

    if (previousTursoToken === undefined) {
      delete process.env.TURSO_AUTH_TOKEN;
    } else {
      process.env.TURSO_AUTH_TOKEN = previousTursoToken;
    }
  }
});

test("listLatestReefStress reads db when Turso is configured without local sqlite path", async () => {
  const previousTursoUrl = process.env.TURSO_DATABASE_URL;
  const previousTursoToken = process.env.TURSO_AUTH_TOKEN;
  process.env.TURSO_DATABASE_URL = "libsql://example.turso.io";
  process.env.TURSO_AUTH_TOKEN = "test-token";

  try {
    const result = await listLatestReefStress({
      resolvePath: () => "missing.sqlite",
      hasPath: () => false,
      getAdapter: () => createDatabaseAdapter({
        signals: [
          {
            station_id: null,
            region_key: "Southeast Florida",
            signal_label: "watch",
            observed_at: Date.parse("2026-06-04T03:00:00.000Z"),
          },
        ],
        metrics: [
          { metric_type: "sst_anomaly_c", metric_value: 0.4 },
          { metric_type: "hotspot_c", metric_value: 0.2 },
          { metric_type: "dhw", metric_value: 1.1 },
        ],
      }),
    });

    assert.equal(result.source, "db");
    if (result.source === "db") {
      assert.equal(result.alerts[0]?.region, "Southeast Florida");
      assert.equal(result.alerts[0]?.timestamp, "2026-06-04T03:00:00.000Z");
    }
  } finally {
    if (previousTursoUrl === undefined) {
      delete process.env.TURSO_DATABASE_URL;
    } else {
      process.env.TURSO_DATABASE_URL = previousTursoUrl;
    }

    if (previousTursoToken === undefined) {
      delete process.env.TURSO_AUTH_TOKEN;
    } else {
      process.env.TURSO_AUTH_TOKEN = previousTursoToken;
    }
  }
});

test("listLatestReefStress returns db source when query succeeds", async () => {
  const result = await listLatestReefStress({
    resolvePath: () => "reef.sqlite",
    hasPath: () => true,
    getAdapter: () => createDatabaseAdapter({
      signals: [
        {
          station_id: null,
          region_key: "Coral Sea",
          signal_label: "no_stress",
          observed_at: Date.parse("2026-03-18T11:00:00.000Z"),
        },
      ],
      metrics: [],
    }),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.alerts.length, 1);
  }
});

