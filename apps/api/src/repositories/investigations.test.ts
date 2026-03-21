import test from "node:test";
import assert from "node:assert/strict";
import { listInvestigations } from "./investigations";
import type { SqliteDatabaseLike } from "../db/client";

interface InvestigationTestRow {
  id: string;
  title: string;
  summary: string;
  state: string;
  confidence: number | null;
  created_at: string;
  updated_at: string;
}

const INVESTIGATION_ROWS: InvestigationTestRow[] = [
  {
    id: "TRK-201",
    title: "Surface temperature acceleration",
    summary: "Elevated SST continues to widen eastward beyond the historic seasonal envelope.",
    state: "Escalated",
    confidence: 86,
    created_at: "2026-03-13T10:00:00.000Z",
    updated_at: "2026-03-13T12:00:00.000Z",
  },
  {
    id: "TRK-187",
    title: "Chlorophyll suppression overlap",
    summary: "Bloom density is tapering inside the same grid cells as the thermal front.",
    state: "Correlated",
    confidence: 72,
    created_at: "2026-03-13T09:00:00.000Z",
    updated_at: "2026-03-13T11:00:00.000Z",
  },
  {
    id: "TRK-193",
    title: "Current shear migration",
    summary: "Current vectors show a moderate shear shift near the reef edge.",
    state: "Watch",
    confidence: 61,
    created_at: "2026-03-13T09:30:00.000Z",
    updated_at: "2026-03-13T10:30:00.000Z",
  },
];

function sortRows(rows: InvestigationTestRow[]): InvestigationTestRow[] {
  return [...rows].sort((left, right) => {
    const updatedCmp = right.updated_at.localeCompare(left.updated_at);
    if (updatedCmp !== 0) return updatedCmp;
    const createdCmp = right.created_at.localeCompare(left.created_at);
    if (createdCmp !== 0) return createdCmp;
    return left.id.localeCompare(right.id);
  });
}

function createDatabase(
  rows: InvestigationTestRow[],
  options?: { throwOnQuery?: boolean },
): SqliteDatabaseLike {
  return {
    prepare(_sql: string) {
      return {
        all() {
          if (options?.throwOnQuery) {
            throw new Error("query failed");
          }
          return sortRows(rows);
        },
      };
    },
    close() {},
  };
}

test("investigation repository returns DB rows ordered by updated_at descending", () => {
  const result = listInvestigations({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(INVESTIGATION_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(
      result.analysisTracks.map((t) => t.id),
      ["TRK-201", "TRK-187", "TRK-193"],
    );
  }
});

test("investigation repository maps rows to InvestigationAnalysisTrack shape", () => {
  const result = listInvestigations({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(INVESTIGATION_ROWS),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    const first = result.analysisTracks[0];
    assert.equal(first?.id, "TRK-201");
    assert.equal(first?.title, "Surface temperature acceleration");
    assert.equal(first?.confidence, 86);
    assert.equal(first?.state, "Escalated");
    assert.equal(typeof first?.summary, "string");
  }
});

test("investigation repository normalizes unknown state to Watch", () => {
  const badStateRow: InvestigationTestRow = {
    ...INVESTIGATION_ROWS[0]!,
    id: "TRK-BADSTATE",
    state: "Unknown",
    confidence: 50,
  };

  const result = listInvestigations({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase([badStateRow]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.analysisTracks[0]?.state, "Watch");
  }
});

test("investigation repository uses default confidence (50) when confidence is null", () => {
  const nullConfidenceRow: InvestigationTestRow = {
    ...INVESTIGATION_ROWS[0]!,
    id: "TRK-NULL-CONF",
    confidence: null,
  };

  const result = listInvestigations({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase([nullConfidenceRow]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.equal(result.analysisTracks[0]?.confidence, 50);
  }
});

test("investigation repository returns empty track list when the DB table is empty", () => {
  const result = listInvestigations({
    resolvePath: () => "test.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase([]),
  });

  assert.equal(result.source, "db");
  if (result.source === "db") {
    assert.deepEqual(result.analysisTracks, []);
  }
});

test("investigation repository falls back with db_path_missing when the DB file does not exist", () => {
  const result = listInvestigations({
    resolvePath: () => "missing.sqlite",
    hasPath: () => false,
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_path_missing",
  });
});

test("investigation repository falls back with db_open_failed when opening the DB throws", () => {
  const result = listInvestigations({
    resolvePath: () => "broken.sqlite",
    hasPath: () => true,
    openDatabase: () => {
      throw new Error("open failed");
    },
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_open_failed",
  });
});

test("investigation repository falls back with db_query_failed when querying throws", () => {
  const result = listInvestigations({
    resolvePath: () => "query.sqlite",
    hasPath: () => true,
    openDatabase: () => createDatabase(INVESTIGATION_ROWS, { throwOnQuery: true }),
  });

  assert.deepEqual(result, {
    source: "mock",
    fallbackReason: "db_query_failed",
  });
});
