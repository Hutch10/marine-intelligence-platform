/**
 * Integration tests for similar-investigation ranking.
 *
 * Uses an in-memory SQLite database to verify vector ranking,
 * deterministic keyword fallback, and route query plumbing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { buildSimilarInvestigationsRouteResponse } from "../routes/similar-investigations";
import type { SqliteDatabaseLike } from "../db/client";
import { ensureVectorEmbeddingsTable } from "./store";
import { indexInvestigation } from "./index-investigation";
import { findSimilarInvestigationsFromDb } from "./find-similar";

const NOW = Date.parse("2026-03-22T00:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

function openMemoryDb(): SqliteDatabaseLike {
  const runtimeRequire = eval("require") as NodeRequire;
  const { DatabaseSync } = runtimeRequire("node:sqlite") as {
    DatabaseSync: new (path: string) => {
      prepare: (sql: string) => {
        all: (...params: unknown[]) => unknown[];
        run: (...params: unknown[]) => unknown;
      };
      close: () => void;
    };
  };

  const raw = new DatabaseSync(":memory:");

  return {
    prepare(sql: string) {
      return raw.prepare(sql);
    },
    close() {
      raw.close();
    },
  };
}

function setEmbeddedAt(db: SqliteDatabaseLike, investigationId: string, embeddedAt: number): void {
  const statement = db.prepare("UPDATE vector_embeddings SET embedded_at = ? WHERE record_id = ?");

  if (typeof statement.run === "function") {
    statement.run(embeddedAt, investigationId);
    return;
  }

  statement.all(embeddedAt, investigationId);
}

function seedInvestigation(
  db: SqliteDatabaseLike,
  input: {
    investigationId: string;
    title: string;
    summary: string;
    explanation?: string;
    stationId?: string | null;
    severity?: string | null;
    embeddedAt?: number;
  },
): void {
  indexInvestigation(db as never, {
    investigationId: input.investigationId,
    title: input.title,
    summary: input.summary,
    explanation: input.explanation,
    stationId: input.stationId ?? null,
    severity: input.severity ?? null,
  });

  if (input.embeddedAt !== undefined) {
    setEmbeddedAt(db, input.investigationId, input.embeddedAt);
  }
}

test("findSimilarInvestigationsFromDb returns vector-ranked results when indexed records exist", () => {
  const db = openMemoryDb();
  ensureVectorEmbeddingsTable(db as never);

  seedInvestigation(db, {
    investigationId: "INV-QUERY",
    title: "Thermal anomaly at station 46042",
    summary: "Sea surface temperature spike and reef stress at the monitoring station.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 10 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-SAME-STATION",
    title: "Thermal anomaly at station 46042",
    summary: "Sea surface temperature spike and reef stress at the monitoring station.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 12 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-DIFF-STATION",
    title: "Thermal anomaly at station 46042",
    summary: "Sea surface temperature spike and reef stress at the monitoring station.",
    stationId: "41009",
    severity: "high",
    embeddedAt: NOW - 12 * DAY_MS,
  });

  const result = findSimilarInvestigationsFromDb(db as never, "INV-QUERY", {
    k: 2,
    now: NOW,
    windowDays: 90,
  });

  assert.equal(result.rankingMode, "vector");
  assert.equal(result.investigations.length, 2);

  const sameStationIndex = result.investigations.findIndex((item) => item.investigationId === "INV-SAME-STATION");
  const diffStationIndex = result.investigations.findIndex((item) => item.investigationId === "INV-DIFF-STATION");
  assert.ok(sameStationIndex !== -1 && diffStationIndex !== -1);
  assert.ok(sameStationIndex < diffStationIndex);

  db.close();
});

test("findSimilarInvestigationsFromDb prefers newer records within the 90-day window", () => {
  const db = openMemoryDb();
  ensureVectorEmbeddingsTable(db as never);

  seedInvestigation(db, {
    investigationId: "INV-QUERY",
    title: "Low pressure system with increasing wave height",
    summary: "Storm band and wind field are the same in all candidates.",
    stationId: "46042",
    severity: "medium",
    embeddedAt: NOW - 5 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-RECENT",
    title: "Low pressure system with increasing wave height",
    summary: "Storm band and wind field are the same in all candidates.",
    stationId: "46042",
    severity: "medium",
    embeddedAt: NOW - 10 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-OLDER",
    title: "Low pressure system with increasing wave height",
    summary: "Storm band and wind field are the same in all candidates.",
    stationId: "46042",
    severity: "medium",
    embeddedAt: NOW - 80 * DAY_MS,
  });

  const result = findSimilarInvestigationsFromDb(db as never, "INV-QUERY", { k: 2, now: NOW });

  const recentIndex = result.investigations.findIndex((item) => item.investigationId === "INV-RECENT");
  const olderIndex = result.investigations.findIndex((item) => item.investigationId === "INV-OLDER");
  assert.ok(recentIndex !== -1 && olderIndex !== -1);
  assert.ok(recentIndex < olderIndex);

  db.close();
});

test("findSimilarInvestigationsFromDb prefers higher severity when text and station are tied", () => {
  const db = openMemoryDb();
  ensureVectorEmbeddingsTable(db as never);

  seedInvestigation(db, {
    investigationId: "INV-QUERY",
    title: "Reef anomaly under review",
    summary: "Shared text makes severity the deciding factor.",
    stationId: "46042",
    severity: "medium",
    embeddedAt: NOW - 5 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-CRITICAL",
    title: "Reef anomaly under review",
    summary: "Shared text makes severity the deciding factor.",
    stationId: "46042",
    severity: "critical",
    embeddedAt: NOW - 5 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-LOW",
    title: "Reef anomaly under review",
    summary: "Shared text makes severity the deciding factor.",
    stationId: "46042",
    severity: "low",
    embeddedAt: NOW - 5 * DAY_MS,
  });

  const result = findSimilarInvestigationsFromDb(db as never, "INV-QUERY", { k: 2, now: NOW });

  const criticalIndex = result.investigations.findIndex((item) => item.investigationId === "INV-CRITICAL");
  const lowIndex = result.investigations.findIndex((item) => item.investigationId === "INV-LOW");
  assert.ok(criticalIndex !== -1 && lowIndex !== -1);
  assert.ok(criticalIndex < lowIndex);

  db.close();
});

test("findSimilarInvestigationsFromDb enforces the default 90-day window", () => {
  const db = openMemoryDb();
  ensureVectorEmbeddingsTable(db as never);

  seedInvestigation(db, {
    investigationId: "INV-QUERY",
    title: "Thermal anomaly window test",
    summary: "A recent record should stay while an old one drops out.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 3 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-RECENT",
    title: "Thermal anomaly window test",
    summary: "A recent record should stay while an old one drops out.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 30 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-STALE",
    title: "Thermal anomaly window test",
    summary: "A recent record should stay while an old one drops out.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 120 * DAY_MS,
  });

  const result = findSimilarInvestigationsFromDb(db as never, "INV-QUERY", { k: 5, now: NOW });

  assert.ok(result.investigations.some((item) => item.investigationId === "INV-RECENT"));
  assert.ok(!result.investigations.some((item) => item.investigationId === "INV-STALE"));

  db.close();
});

test("findSimilarInvestigationsFromDb returns empty results when the vector index is empty (no corpus)", () => {
  const db = openMemoryDb();
  ensureVectorEmbeddingsTable(db as never);

  const result = findSimilarInvestigationsFromDb(db as never, "TRK-201", { k: 3, now: NOW });

  // No indexed records and no fallback corpus → empty keyword results.
  assert.equal(result.rankingMode, "keyword");
  assert.equal(result.investigations.length, 0);

  db.close();
});

test("findSimilarInvestigationsFromDb similarity scores stay within [0, 1]", () => {
  const db = openMemoryDb();
  ensureVectorEmbeddingsTable(db as never);

  seedInvestigation(db, {
    investigationId: "INV-QUERY",
    title: "Thermal anomaly at station 46042",
    summary: "Sea surface temperature spike and reef stress at the monitoring station.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 10 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-SAME-STATION",
    title: "Thermal anomaly at station 46042",
    summary: "Sea surface temperature spike and reef stress at the monitoring station.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 12 * DAY_MS,
  });

  const result = findSimilarInvestigationsFromDb(db as never, "INV-QUERY", { k: 2, now: NOW });

  for (const item of result.investigations) {
    assert.ok(item.similarity >= 0 && item.similarity <= 1);
  }

  db.close();
});

test("findSimilarInvestigationsFromDb respects k limit", () => {
  const db = openMemoryDb();
  ensureVectorEmbeddingsTable(db as never);

  seedInvestigation(db, {
    investigationId: "INV-QUERY",
    title: "Thermal anomaly at station 46042",
    summary: "Sea surface temperature spike and reef stress at the monitoring station.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 10 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-A",
    title: "Thermal anomaly at station 46042",
    summary: "Sea surface temperature spike and reef stress at the monitoring station.",
    stationId: "46042",
    severity: "high",
    embeddedAt: NOW - 12 * DAY_MS,
  });
  seedInvestigation(db, {
    investigationId: "INV-B",
    title: "Thermal anomaly at station 46042",
    summary: "Sea surface temperature spike and reef stress at the monitoring station.",
    stationId: "41009",
    severity: "high",
    embeddedAt: NOW - 12 * DAY_MS,
  });

  const result = findSimilarInvestigationsFromDb(db as never, "INV-QUERY", { k: 1, now: NOW });
  assert.ok(result.investigations.length <= 1);

  db.close();
});

test("findSimilarInvestigations route response forwards station and window filters", () => {
  const calls: Array<{ id: string; options: { k?: number; stationId?: string | null; windowDays?: number; now?: number } }> = [];

  const response = buildSimilarInvestigationsRouteResponse(
    { id: "TRK-201", k: "8", stationId: "46042", windowDays: "30" },
    (id, options) => {
      calls.push({ id, options });
      return { source: "db", rankingMode: "vector", investigations: [] };
    },
  );

  assert.equal(response.status, 200);
  assert.equal(calls[0]?.id, "TRK-201");
  assert.deepEqual(calls[0]?.options, { k: 8, stationId: "46042", windowDays: 30 });
});

test("findSimilarInvestigations route marks keyword fallback in telemetry", () => {
  const response = buildSimilarInvestigationsRouteResponse({ id: "TRK-201" }, () => ({
    source: "db",
    rankingMode: "keyword",
    investigations: [
      {
        investigationId: "TRK-187",
        title: "Chlorophyll suppression overlap",
        summary: "Bloom density is tapering inside the same grid cells as the thermal front.",
        similarity: 0.61,
        embeddingSimilarity: 0.45,
        matchedOn: ["title", "summary"],
        matchedStation: null,
        severity: "medium",
        indexedAt: new Date(NOW - 14 * DAY_MS).toISOString(),
        timeframeLabel: "2 weeks ago",
      },
    ],
  }));

  assert.equal(response.telemetry.rankingMode, "keyword");
  assert.equal(response.telemetry.fallbackReason, "keyword_fallback");
  assert.equal(response.telemetry.resultCount, 1);
});
