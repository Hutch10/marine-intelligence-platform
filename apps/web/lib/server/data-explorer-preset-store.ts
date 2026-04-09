import {
  appendDataExplorerBehaviorDedupeExportEvent,
  appendDataExplorerBehaviorEvent,
  clearSharedDataExplorerPresetStoreForTests,
  deleteDataExplorerPresetById,
  deleteSharedDataExplorerPresetById,
  listDataExplorerBehaviorDedupeExportHistory,
  listDataExplorerBehaviorDedupeDropSummary,
  listDataExplorerBehaviorEvents,
  listPresetAuditEvents,
  loadDataExplorerPresets,
  loadSharedDataExplorerPresets,
  markDataExplorerPresetUsed,
  markSharedDataExplorerPresetUsed,
  upsertDataExplorerPreset,
  upsertSharedDataExplorerPreset,
  type DataExplorerBehaviorDedupeDropSummaryOptions,
} from "@/lib/server/data-explorer-presets-repository";
import type {
  DataExplorerBehaviorDedupeDropSummaryExportQuery,
  DataExplorerBehaviorDedupeDropSummaryExportFormat,
  DataExplorerBehaviorDedupeDropSummaryExportResult,
  DataExplorerPresetAuditActorType,
} from "@/lib/persistence/types";
import {
  DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING,
  compareDataExplorerBehaviorDedupeDropSummaryItems,
} from "@/lib/persistence/types";

interface DataExplorerBehaviorDedupeExportOptions extends DataExplorerBehaviorDedupeDropSummaryOptions, DataExplorerBehaviorDedupeDropSummaryExportQuery {
  historyLimit?: number;
}

function buildDedupeSummaryFilename(
  scope: "shared" | "personal",
  exportedAt: string,
  format: DataExplorerBehaviorDedupeDropSummaryExportFormat,
): string {
  const timestamp = exportedAt.replace(/[:.]/g, "-");
  return `data-explorer-dedupe-summary-${scope}-${timestamp}.${format}`;
}

function sortDedupeSummary(summary: NonNullable<DataExplorerBehaviorDedupeDropSummaryExportResult["snapshot"]>["summary"]) {
  return [...summary].sort(compareDataExplorerBehaviorDedupeDropSummaryItems);
}

function escapeCsvValue(value: string | number | null): string {
  if (value === null) {
    return "";
  }

  const normalized = String(value);

  if (/[",\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

function buildDedupeSummaryCsv(snapshot: NonNullable<DataExplorerBehaviorDedupeDropSummaryExportResult["snapshot"]>): string {
  const metadataLines = [
    `# schemaVersion=${snapshot.schemaVersion}`,
    `# exportedAt=${snapshot.exportedAt}`,
    `# scope=${snapshot.scope}`,
    `# windowMinutes=${snapshot.windowMinutes}`,
    `# requestedLimit=${snapshot.provenance.requestedLimit ?? ""}`,
    `# totalDatasets=${snapshot.totalDatasets}`,
    `# source=${snapshot.provenance.source}`,
    `# route=${snapshot.provenance.route}`,
    `# requestedFormat=${snapshot.provenance.requestedFormat}`,
    `# orderingPrimary=${snapshot.provenance.ordering.primary}`,
    `# orderingSecondary=${snapshot.provenance.ordering.secondary}`,
    `# requestedByActorId=${snapshot.provenance.requestedBy.actorId ?? ""}`,
    `# requestedByActorType=${snapshot.provenance.requestedBy.actorType}`,
    `# requestedByOwnerId=${snapshot.provenance.requestedBy.ownerId ?? ""}`,
    `# exportHistory=${JSON.stringify(snapshot.provenance.exportHistory)}`,
  ];
  const header = "datasetId,dropCount,mostRecentDroppedAt";
  const rows = snapshot.summary.map((entry) => [
    escapeCsvValue(entry.datasetId),
    escapeCsvValue(entry.dropCount),
    escapeCsvValue(entry.mostRecentDroppedAt),
  ].join(","));

  return [...metadataLines, header, ...rows].join("\n");
}

export function exportDataExplorerBehaviorDedupeDropSummarySnapshot(
  options: DataExplorerBehaviorDedupeExportOptions = {},
): DataExplorerBehaviorDedupeDropSummaryExportResult {
  const format: DataExplorerBehaviorDedupeDropSummaryExportFormat = options.format === "csv" ? "csv" : "json";
  const summaryResult = listDataExplorerBehaviorDedupeDropSummary(options);

  if (!summaryResult.ok) {
    return {
      ok: false,
      format,
      snapshot: null,
      filename: null,
      content: null,
      contentType: null,
      reason: summaryResult.reason,
      error: summaryResult.error,
    };
  }

  const scope: "personal" | "shared" = options.scope === "personal" ? "personal" : "shared";
  const exportedAt = new Date().toISOString();
  const actorId = options.actor?.actorId ?? null;
  const actorType: DataExplorerPresetAuditActorType = actorId ? "station_admin" : "unknown";

  appendDataExplorerBehaviorDedupeExportEvent({
    scope,
    ownerId: options.ownerId,
    actor: options.actor,
    format,
    windowMinutes: summaryResult.windowMinutes,
    datasetCount: summaryResult.summary.length,
    createdAt: exportedAt,
  });

  const historyResult = listDataExplorerBehaviorDedupeExportHistory({
    scope,
    ownerId: options.ownerId,
    limit: options.historyLimit,
  });

  const snapshot = {
    schemaVersion: 1 as const,
    exportedAt,
    scope,
    windowMinutes: summaryResult.windowMinutes,
    totalDatasets: summaryResult.summary.length,
    summary: sortDedupeSummary(summaryResult.summary),
    provenance: {
      source: "repository" as const,
      route: "/api/data-explorer/activity/dedupe-summary/export" as const,
      requestedFormat: format,
      ...(typeof options.limit === "number" && Number.isFinite(options.limit) ? { requestedLimit: Math.floor(options.limit) } : {}),
      ordering: {
        primary: DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING.primary,
        secondary: DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING.secondary,
      },
      requestedBy: {
        actorId,
        actorType,
        ownerId: options.ownerId ?? null,
      },
      exportHistory: historyResult.ok ? historyResult.history : [],
    },
  };
  const filename = buildDedupeSummaryFilename(scope, exportedAt, format);
  const content = format === "csv"
    ? buildDedupeSummaryCsv(snapshot)
    : JSON.stringify(snapshot, null, 2);

  return {
    ok: true,
    format,
    snapshot,
    filename,
    content,
    contentType: format === "csv"
      ? "text/csv; charset=utf-8"
      : "application/json; charset=utf-8",
  };
}

export {
  appendDataExplorerBehaviorDedupeExportEvent,
  appendDataExplorerBehaviorEvent,
  clearSharedDataExplorerPresetStoreForTests,
  deleteDataExplorerPresetById,
  deleteSharedDataExplorerPresetById,
  listDataExplorerBehaviorDedupeExportHistory,
  listDataExplorerBehaviorDedupeDropSummary,
  listDataExplorerBehaviorEvents,
  listPresetAuditEvents,
  loadDataExplorerPresets,
  loadSharedDataExplorerPresets,
  markDataExplorerPresetUsed,
  markSharedDataExplorerPresetUsed,
  upsertDataExplorerPreset,
  upsertSharedDataExplorerPreset,
};
