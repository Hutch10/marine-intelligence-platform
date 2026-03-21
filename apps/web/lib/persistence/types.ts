import type {
  DataExplorerDatasetFilters,
  DataExplorerDatasetSortBy,
  DataExplorerSortDirection,
} from "@/lib/api/types";

export interface PersistenceStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type DataExplorerPresetFilters = Pick<
  Required<DataExplorerDatasetFilters>,
  "q" | "category" | "region" | "status" | "sortBy" | "sortDir" | "pageSize"
>;

export type DataExplorerPresetScope = "shared" | "personal";

export interface DataExplorerPresetRecord {
  id: string;
  name: string;
  scope: DataExplorerPresetScope;
  filters: DataExplorerPresetFilters;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string | null;
  useCount?: number;
}

export interface DataExplorerPresetDraft {
  name: string;
  scope?: DataExplorerPresetScope;
  filters: Partial<DataExplorerPresetFilters>;
}

export type DataExplorerPresetMutationReason =
  | "storage_unavailable"
  | "read_failed"
  | "write_failed"
  | "corrupt_json"
  | "invalid_schema"
  | "unsupported_version"
  | "duplicate_name"
  | "validation"
  | "not_found";

export interface DataExplorerPresetMutationResult {
  ok: boolean;
  presets: DataExplorerPresetRecord[];
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export type DataExplorerPresetAuditAction = "created" | "updated" | "deleted" | "marked_used";

export type DataExplorerPresetAuditActorType = "station_admin" | "unknown";

export type DataExplorerPresetAuditOutcome = "success" | "failure";

export interface DataExplorerPresetAuditEvent {
  id: string;
  presetId: string | null;
  presetName: string;
  scope: DataExplorerPresetScope;
  action: DataExplorerPresetAuditAction;
  actorId: string | null;
  actorType: DataExplorerPresetAuditActorType;
  ownerId: string | null;
  outcome: DataExplorerPresetAuditOutcome;
  reason?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface DataExplorerPresetAuditListResult {
  ok: boolean;
  events: DataExplorerPresetAuditEvent[];
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export type DataExplorerBehaviorEventType =
  | "preset_applied"
  | "dataset_selected"
  | "dataset_detail_viewed";

export interface DataExplorerBehaviorEvent {
  id: string;
  eventType: DataExplorerBehaviorEventType;
  scope: DataExplorerPresetScope;
  actorId: string | null;
  actorLabel: string | null;
  ownerId: string | null;
  presetId: string | null;
  presetName: string | null;
  datasetId: string | null;
  datasetName: string | null;
  createdAt: string;
  sourceContext?: Record<string, unknown>;
}

export interface DataExplorerBehaviorEventWriteResult {
  ok: boolean;
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export interface DataExplorerBehaviorEventListResult {
  ok: boolean;
  events: DataExplorerBehaviorEvent[];
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export interface DataExplorerBehaviorDedupeDropSummaryItem {
  datasetId: string;
  dropCount: number;
  mostRecentDroppedAt: string;
}

export interface DataExplorerBehaviorDedupeDropSummaryResult {
  ok: boolean;
  summary: DataExplorerBehaviorDedupeDropSummaryItem[];
  windowMinutes: number;
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export interface DataExplorerBehaviorDedupeDropSummaryQuery {
  scope?: DataExplorerPresetScope;
  windowMinutes?: number;
  limit?: number;
}

export const DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING = {
  primary: "dropCount:desc",
  secondary: "datasetId:asc",
} as const;

export function compareDataExplorerBehaviorDedupeDropSummaryItems(
  left: DataExplorerBehaviorDedupeDropSummaryItem,
  right: DataExplorerBehaviorDedupeDropSummaryItem,
): number {
  if (left.dropCount !== right.dropCount) {
    return right.dropCount - left.dropCount;
  }

  return left.datasetId.localeCompare(right.datasetId);
}

export type DataExplorerBehaviorDedupeDropSummaryExportFormat = "json" | "csv";

export interface DataExplorerBehaviorDedupeDropSummaryExportQuery extends DataExplorerBehaviorDedupeDropSummaryQuery {
  format?: DataExplorerBehaviorDedupeDropSummaryExportFormat;
}

export const DATA_EXPLORER_DEDUPE_EXPORT_LOG_NAMESPACE = "DataExplorer.dedupeExport";

export type DataExplorerDedupeExportLogLayer = "route" | "client" | "repository";

export type DataExplorerDedupeExportLogEvent = "request" | "success" | "failure" | "empty";

export interface DataExplorerDedupeExportLogPayload {
  layer: DataExplorerDedupeExportLogLayer;
  event: DataExplorerDedupeExportLogEvent;
  scope?: DataExplorerPresetScope;
  format?: DataExplorerBehaviorDedupeDropSummaryExportFormat;
  windowMinutes?: number;
  limit?: number;
  datasetCount?: number;
  requests?: number;
  failures?: number;
  emptyResults?: number;
  reason?: DataExplorerPresetMutationReason;
  error?: string;
}

export interface DataExplorerBehaviorDedupeDropSummaryExportHistoryItem {
  exportedAt: string;
  format: DataExplorerBehaviorDedupeDropSummaryExportFormat;
  scope: DataExplorerPresetScope;
  totalDatasets: number;
  actorId: string | null;
}

export interface DataExplorerBehaviorDedupeDropSummaryExportHistoryResult {
  ok: boolean;
  history: DataExplorerBehaviorDedupeDropSummaryExportHistoryItem[];
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export interface DataExplorerBehaviorDedupeDropSummaryExportProvenance {
  source: "repository";
  route: "/api/data-explorer/activity/dedupe-summary/export";
  requestedFormat: DataExplorerBehaviorDedupeDropSummaryExportFormat;
  requestedLimit?: number;
  ordering: {
    primary: typeof DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING.primary;
    secondary: typeof DATA_EXPLORER_BEHAVIOR_DEDUPE_SUMMARY_ORDERING.secondary;
  };
  requestedBy: {
    actorId: string | null;
    actorType: DataExplorerPresetAuditActorType;
    ownerId: string | null;
  };
  exportHistory: DataExplorerBehaviorDedupeDropSummaryExportHistoryItem[];
}

export interface DataExplorerBehaviorDedupeDropSummaryExportSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  scope: DataExplorerPresetScope;
  windowMinutes: number;
  totalDatasets: number;
  summary: DataExplorerBehaviorDedupeDropSummaryItem[];
  provenance: DataExplorerBehaviorDedupeDropSummaryExportProvenance;
}

export interface DataExplorerBehaviorDedupeDropSummaryExportResult {
  ok: boolean;
  format: DataExplorerBehaviorDedupeDropSummaryExportFormat;
  snapshot: DataExplorerBehaviorDedupeDropSummaryExportSnapshot | null;
  filename: string | null;
  content: string | null;
  contentType: string | null;
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export interface DataExplorerPresetSessionStatus {
  sessionActive: boolean;
  actorLabel: string | null;
  personalScopeAvailable: boolean;
}

export interface DataExplorerPresetSessionStatusResult {
  ok: boolean;
  status: DataExplorerPresetSessionStatus | null;
  error?: string;
  reason?: DataExplorerPresetMutationReason;
}

export interface DataExplorerPresetStorageEnvelope {
  version: number;
  presets: DataExplorerPresetRecord[];
}

export type IntelligenceClassification = "stable" | "warning" | "critical";

export interface PersistedIntelligenceMatchedTerm {
  term: string;
  weight: number;
}

export interface PersistedIntelligenceEntry {
  id: string;
  timestamp: string;
  rawInput: string;
  score: number;
  classification: IntelligenceClassification;
  matchedTerms: PersistedIntelligenceMatchedTerm[];
}

export interface PersistedIntelligenceStore {
  list(): Promise<PersistedIntelligenceEntry[]>;
  save(entry: PersistedIntelligenceEntry): Promise<void>;
  remove(id: string): Promise<void>;
}

export const DATA_EXPLORER_DEFAULT_PRESET_FILTERS: DataExplorerPresetFilters = {
  q: "",
  category: "",
  region: "",
  status: "",
  sortBy: "updated",
  sortDir: "desc",
  pageSize: 25,
};

export const DATA_EXPLORER_ALLOWED_SORTS: DataExplorerDatasetSortBy[] = [
  "updated",
  "name",
  "records",
  "status",
];

export const DATA_EXPLORER_ALLOWED_DIRECTIONS: DataExplorerSortDirection[] = [
  "asc",
  "desc",
];
