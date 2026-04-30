import test from "node:test";
import assert from "node:assert/strict";
const { InMemoryAlertStore } = require("./in-memory-alert-store");
const { DbAlertStore } = require("./db-alert-store");
const { createAsyncTestDatabase } = require("../db/test-utils");

function baseAlert() {
  return {
    id: "alert-base",
    source: "test-source",
    stationId: "station-1",
    ruleType: "source_failed",
    severity: "critical",
    status: "active",
    lifecycleStatus: "open",
    title: "Test Alert",
    detail: "Test detail",
    metadataJson: null,
    detectedAt: 1711876800000,
    resolvedAt: null,
    occurrenceCount: 1,
    windowStartedAt: 1711876800000,
    windowEndsAt: 1711880400000,
    createdAt: new Date(1711876800000).toISOString(),
    updatedAt: new Date(1711876800000).toISOString(),
  };
}

// Insert a station row if needed for stationId
async function ensureStation(store: any, stationId: string) {
  if (!stationId) return;
  // Try to insert, ignore if exists
  try {
    if (store.adapter && typeof store.adapter.execute === "function") {
      const now = new Date().toISOString();
      // Ensure region exists first
      await store.adapter.execute(
        "INSERT OR IGNORE INTO regions (id, name, status, summary, created_at, updated_at) VALUES (?, ?, 'active', '', ?, ?)",
        ["test-region", "Test Region", now, now]
      );

      await store.adapter.execute(
        "INSERT OR IGNORE INTO stations (id, name, slug, region_id, status, summary, location_label, created_at, updated_at) VALUES (?, ?, ?, 'test-region', 'active', '', '', ?, ?)",
        [stationId, stationId, stationId, now, now]
      );
    }
  } catch (e) {
    console.error("[DEBUG][ensureStation] FAILED:", e);
  }
}

function runContractTests(getStore: () => any) {
  test("create alert", async () => {
    const store = getStore();
    const alert = { ...baseAlert(), id: "alert-1" };
    await ensureStation(store, alert.stationId);
    await store.setAlert(alert, "key-1");
    const found = await store.getAlertById(alert.id);
    assert.ok(found);
    for (const k of Object.keys(alert) as Array<keyof typeof alert>) {
      assert.deepStrictEqual(found[k], alert[k]);
    }
  });

  test("dedupe by key/station", async () => {
    const store = getStore();
    const alert1 = { ...baseAlert(), id: "alert-1" };
    const alert2 = { ...baseAlert(), id: "alert-2" };
    await ensureStation(store, alert1.stationId);
    await ensureStation(store, alert2.stationId);
    const dedupeKey = `${alert1.source}|${alert1.ruleType}|${alert1.stationId}`;
    await store.setAlert(alert1, dedupeKey);
    await store.setAlert(alert2, dedupeKey);
    const all = await store.listAlerts({});
    assert.strictEqual(all.length, 1);
    assert.strictEqual(all[0].id, "alert-2");
  });

  test("repeated trigger escalation", async () => {
    const store = getStore();
    const alert1 = { ...baseAlert(), id: "alert-1", severity: "warning", occurrenceCount: 1 };
    const alert2 = { ...baseAlert(), id: "alert-2", severity: "critical", occurrenceCount: 2 };
    await ensureStation(store, alert1.stationId);
    await ensureStation(store, alert2.stationId);
    const dedupeKey = `${alert1.source}|${alert1.ruleType}|${alert1.stationId}`;
    await store.setAlert(alert1, dedupeKey);
    await store.setAlert(alert2, dedupeKey);
    const found = await store.getAlertById("alert-2");
    assert.ok(found);
    assert.strictEqual(found.severity, "critical");
    assert.strictEqual(found.occurrenceCount, 2);
  });

  test("resolve/update flows", async () => {
    const store = getStore();
    const alert1 = { ...baseAlert(), id: "alert-1", status: "active" };
    const alert2 = { ...baseAlert(), id: "alert-1", status: "resolved", resolvedAt: 1711877800000, lifecycleStatus: "resolved" };
    await ensureStation(store, alert1.stationId);
    await ensureStation(store, alert2.stationId);
    const dedupeKey = `${alert1.source}|${alert1.ruleType}|${alert1.stationId}`;
    await store.setAlert(alert1, dedupeKey);
    await store.setAlert(alert2, dedupeKey);
    const found = await store.getAlertById("alert-1");
    assert.ok(found);
    assert.strictEqual(found.status, "resolved");
    assert.ok(found.resolvedAt);
  });
}


test("AlertStore contract: InMemoryAlertStore", () => {
  runContractTests(() => new InMemoryAlertStore());
});

test("AlertStore contract: DbAlertStore", () => {
  runContractTests(() => new DbAlertStore(createAsyncTestDatabase()));
});

test("parity: identical outputs for same operations", async () => {
  const now = Date.now();
  const alertA = {
    id: "alert-parity",
    source: "test-source",
    stationId: "station-parity",
    ruleType: "source_failed",
    severity: "critical",
    status: "active",
    lifecycleStatus: "open",
    title: "Parity Alert",
    detail: "Parity detail",
    metadataJson: null,
    detectedAt: now,
    resolvedAt: null,
    occurrenceCount: 1,
    windowStartedAt: now,
    windowEndsAt: now + 3600000,
    createdAt: new Date(now).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
  const alertB = { ...alertA };
  const mem = new InMemoryAlertStore();
  const db = new DbAlertStore(createAsyncTestDatabase());
  await ensureStation(db, alertA.stationId);
  await mem.setAlert(alertA, "key-parity");
  await db.setAlert(alertB, "key-parity");
  const memAlert = await mem.getAlertById(alertA.id);
  const dbAlert = await db.getAlertById(alertB.id);
  assert.deepStrictEqual(memAlert, dbAlert);
  assert.strictEqual((await mem.listAlerts({})).length, (await db.listAlerts({})).length);
});
