"use client";

import {
  BellDot,
  Bot,
  Database,
  Download,
  Eye,
  FileSearch,
  Filter,
  Layers3,
  Play,
  Search,
  Sparkles,
  Table2,
  Waves,
  X,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { apiClient } from "@/lib/api/client";
import type {
  DataExplorerDatasetDetail,
  DataExplorerDatasetFilters,
  DataExplorerDatasetSortBy,
  DataExplorerFetchMeta,
  DataExplorerPageInfo,
  DataExplorerDatasetRow,
  DataExplorerMetadataItem,
  DataExplorerRelatedRecord,
  DataExplorerRelatedRecordsPageInfo,
  DataExplorerRelatedRecordsQuery,
  DataExplorerRelatedRecordSortBy,
  DataExplorerSortDirection,
  DataExplorerWorkspaceData,
  ExplorerAction,
} from "@/lib/api/types";
import {
  deleteDataExplorerPresetById,
  loadDataExplorerPresets,
  markDataExplorerPresetUsed,
  saveDataExplorerPreset,
  upsertDataExplorerPreset,
} from "@/lib/persistence/data-explorer-presets";
import type {
  DataExplorerBehaviorDedupeDropSummaryExportSnapshot,
  DataExplorerBehaviorDedupeDropSummaryItem,
  DataExplorerBehaviorEvent,
  DataExplorerPresetAuditEvent,
  DataExplorerPresetMutationReason,
  DataExplorerPresetRecord,
  DataExplorerPresetSessionStatus,
  DataExplorerPresetScope,
} from "@/lib/persistence/types";
import { cn } from "@/lib/utils";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  formatDataExplorerPresetUsageMeta,
  isDataExplorerPresetInSync,
  selectDataExplorerPresetById,
  selectSortedDataExplorerPresets,
  toDataExplorerPresetFilterSnapshot,
} from "@/components/data-explorer/preset-presentation";

const STATUS_STYLES = {
  Curated: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  Live: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  Draft: "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const TONE_STYLES = {
  cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const ACTION_ICONS: Record<ExplorerAction["icon"], LucideIcon> = {
  play: Play,
  download: Download,
  layers: Layers3,
};

const EMPTY_FILTERS: Required<DataExplorerDatasetFilters> = {
  q: "",
  category: "",
  region: "",
  status: "",
  sortBy: "updated",
  sortDir: "desc",
  page: 1,
  pageSize: 25,
};

const EMPTY_RECORD_FILTERS: Required<DataExplorerRelatedRecordsQuery> = {
  sortBy: "updated",
  sortDir: "desc",
  page: 1,
  pageSize: 5,
};

const PRESET_HISTORY_DETAIL_LIMIT = 25;
const BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES = 60;
const BEHAVIOR_DEDUPE_DIAGNOSTIC_LIMIT = 3;

type DetailStatus = "idle" | "loading" | "not_found" | "error";
type RecordsStatus = "idle" | "loading" | "empty" | "not_found" | "error";
type ListStatus = "idle" | "loading" | "empty" | "error";
type PresetStatus = "idle" | "error";
type PresetSessionState = "idle" | "loading" | "error";
type PresetActivityStatus = "idle" | "loading" | "error";
type PresetHistoryStatus = "idle" | "loading" | "error";
type PresetHistoryActionFilter = "all" | DataExplorerPresetAuditEvent["action"];
type PresetHistoryPresetFilter = "all" | "selected";
type BehaviorActivityStatus = "idle" | "loading" | "error";
type BehaviorDedupeSummaryStatus = "idle" | "loading" | "error";
type BehaviorDedupeExportStatus = "idle" | "exporting";

const SHOW_DEBUG = process.env.NODE_ENV !== "production";

interface DataExplorerWorkspaceProps {
  data: DataExplorerWorkspaceData;
  initialMeta?: DataExplorerFetchMeta | null;
}

function formatFallbackReasonLabel(
  fallbackReason: DataExplorerFetchMeta["fallbackReason"],
): string {
  if (fallbackReason === "db_path_missing") {
    return "DB path missing";
  }

  if (fallbackReason === "db_open_failed") {
    return "DB open failed";
  }

  if (fallbackReason === "db_query_failed") {
    return "DB query failed";
  }

  return "Backend unavailable";
}

function buildFallbackDetail(dataset: DataExplorerDatasetRow | undefined, metadata: DataExplorerMetadataItem[]) {
  if (!dataset) {
    return null;
  }

  return {
    id: dataset.id,
    name: dataset.name,
    category: dataset.category,
    region: dataset.region,
    updated: dataset.updated,
    records: dataset.records,
    status: dataset.status,
    metadata: Object.fromEntries(metadata.map((item) => [item.label, item.value])),
  } satisfies DataExplorerDatasetDetail;
}

function toMetadataItems(detail: DataExplorerDatasetDetail | null): DataExplorerMetadataItem[] {
  if (!detail?.metadata) {
    return [];
  }

  return Object.entries(detail.metadata).map(([label, value]) => ({
    label,
    value: value == null ? "Unavailable" : String(value),
  }));
}

function normalizeFilters(filters: Required<DataExplorerDatasetFilters>): DataExplorerDatasetFilters {
  return {
    q: filters.q.trim() || undefined,
    category: filters.category || undefined,
    region: filters.region || undefined,
    status: filters.status || undefined,
    sortBy: filters.sortBy,
    sortDir: filters.sortDir,
    page: filters.page,
    pageSize: filters.pageSize,
  };
}

function formatDebugMeta(meta: DataExplorerFetchMeta | null): string {
  if (!meta) {
    return "No diagnostics yet";
  }

  const parts = [
    meta.section,
    meta.state,
    meta.delivery ?? "delivery-unknown",
    meta.source ?? "unknown",
    `${meta.durationMs}ms`,
  ];

  if (meta.fallbackReason) {
    parts.push(meta.fallbackReason);
  }

  if (meta.datasetId) {
    parts.push(meta.datasetId);
  }

  return parts.join(" · ");
}

function shouldFallbackToLocalPresetStore(reason: DataExplorerPresetMutationReason | undefined): boolean {
  return reason === "storage_unavailable"
    || reason === "read_failed"
    || reason === "write_failed"
    || reason === "invalid_schema"
    || reason === "corrupt_json"
    || reason === "unsupported_version";
}

function canUseLocalPresetFallback(
  scope: DataExplorerPresetScope,
  reason: DataExplorerPresetMutationReason | undefined,
): boolean {
  return scope === "shared" && shouldFallbackToLocalPresetStore(reason);
}

function formatPresetScopeLabel(scope: DataExplorerPresetScope): string {
  return scope === "personal" ? "Personal" : "Shared";
}

function formatPresetScopeDescription(scope: DataExplorerPresetScope): string {
  return scope === "personal"
    ? "Personal scope follows the active station admin session and stays unavailable if that session cannot be verified. Preset mutations are audit logged with that session actor."
    : "Shared scope uses the repository-backed preset catalog and can fall back to this browser if the repository path is unavailable. Preset mutations are audit logged when repository storage is available.";
}

function formatPresetActivityAction(action: DataExplorerPresetAuditEvent["action"]): string {
  switch (action) {
    case "created":
      return "Created";
    case "updated":
      return "Updated";
    case "deleted":
      return "Deleted";
    case "marked_used":
      return "Marked used";
    default:
      return action;
  }
}

function formatPresetActivityActor(event: DataExplorerPresetAuditEvent): string {
  if (event.actorId) {
    return event.actorId;
  }

  return event.actorType === "unknown" ? "Unknown actor" : "Station admin";
}

function formatPresetActivityTimestamp(value: string): string {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    return value;
  }

  return new Date(parsed).toISOString().replace("T", " ").replace(".000Z", "Z");
}

function formatBehaviorEventLabel(event: DataExplorerBehaviorEvent): string {
  switch (event.eventType) {
    case "preset_applied":
      return "Preset applied";
    case "dataset_selected":
      return "Dataset selected";
    case "dataset_detail_viewed":
      return "Dataset detail viewed";
    default:
      return event.eventType;
  }
}

function formatBehaviorEventSubject(event: DataExplorerBehaviorEvent): string {
  if (event.presetName) {
    return event.presetName;
  }

  if (event.datasetName) {
    return event.datasetName;
  }

  if (event.datasetId) {
    return event.datasetId;
  }

  if (event.presetId) {
    return event.presetId;
  }

  return "(no label)";
}

function downloadDedupeSummarySnapshot(
  snapshot: DataExplorerBehaviorDedupeDropSummaryExportSnapshot,
  filename: string,
) {
  if (typeof document === "undefined" || typeof URL === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }

  const payload = JSON.stringify(snapshot, null, 2);
  const blob = new Blob([payload], {
    type: "application/json; charset=utf-8",
  });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";

  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}

function DebugBadge({ meta, label }: { meta: DataExplorerFetchMeta | null; label: string }) {
  if (!SHOW_DEBUG) {
    return null;
  }

  return (
    <div
      data-testid={`debug-${label}`}
      className="rounded-xl border border-dashed border-cyan-500/20 bg-cyan-500/5 px-3 py-2 text-[10px] text-slate-400"
    >
      <span className="font-medium uppercase tracking-[0.18em] text-cyan-400">{label}</span>
      <span className="ml-2">{formatDebugMeta(meta)}</span>
    </div>
  );
}

export function DataExplorerWorkspace({ data, initialMeta = null }: DataExplorerWorkspaceProps) {
  const { actions, datasets: initialDatasets, previewSeries, metadata, summarySignals } = data;
  const [datasets, setDatasets] = useState(initialDatasets);
  const [draftFilters, setDraftFilters] = useState(EMPTY_FILTERS);
  const [presetName, setPresetName] = useState("");
  const [presetScope, setPresetScope] = useState<DataExplorerPresetScope>("shared");
  const [selectedPresetId, setSelectedPresetId] = useState("");
  const [savedPresets, setSavedPresets] = useState<DataExplorerPresetRecord[]>([]);
  const [presetStatus, setPresetStatus] = useState<PresetStatus>("idle");
  const [presetError, setPresetError] = useState<string | null>(null);
  const [presetSession, setPresetSession] = useState<DataExplorerPresetSessionStatus | null>(null);
  const [presetSessionState, setPresetSessionState] = useState<PresetSessionState>("loading");
  const [presetSessionError, setPresetSessionError] = useState<string | null>(null);
  const [presetActivity, setPresetActivity] = useState<DataExplorerPresetAuditEvent[]>([]);
  const [presetActivityStatus, setPresetActivityStatus] = useState<PresetActivityStatus>("idle");
  const [presetActivityError, setPresetActivityError] = useState<string | null>(null);
  const [presetHistoryOpen, setPresetHistoryOpen] = useState(false);
  const [presetHistory, setPresetHistory] = useState<DataExplorerPresetAuditEvent[]>([]);
  const [presetHistoryStatus, setPresetHistoryStatus] = useState<PresetHistoryStatus>("idle");
  const [presetHistoryError, setPresetHistoryError] = useState<string | null>(null);
  const [presetHistoryActionFilter, setPresetHistoryActionFilter] = useState<PresetHistoryActionFilter>("all");
  const [presetHistoryPresetFilter, setPresetHistoryPresetFilter] = useState<PresetHistoryPresetFilter>("all");
  const [presetHistoryRefreshNonce, setPresetHistoryRefreshNonce] = useState(0);
  const [behaviorActivity, setBehaviorActivity] = useState<DataExplorerBehaviorEvent[]>([]);
  const [behaviorActivityStatus, setBehaviorActivityStatus] = useState<BehaviorActivityStatus>("idle");
  const [behaviorActivityError, setBehaviorActivityError] = useState<string | null>(null);
  const [behaviorDedupeSummary, setBehaviorDedupeSummary] = useState<DataExplorerBehaviorDedupeDropSummaryItem[]>([]);
  const [behaviorDedupeSummaryWindowMinutes, setBehaviorDedupeSummaryWindowMinutes] = useState(
    BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES,
  );
  const [behaviorDedupeSummaryStatus, setBehaviorDedupeSummaryStatus] = useState<BehaviorDedupeSummaryStatus>("idle");
  const [behaviorDedupeSummaryError, setBehaviorDedupeSummaryError] = useState<string | null>(null);
  const [behaviorDedupeExportStatus, setBehaviorDedupeExportStatus] = useState<BehaviorDedupeExportStatus>("idle");
  const [behaviorDedupeExportError, setBehaviorDedupeExportError] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<DataExplorerDatasetFilters>({});
  const [pageInfo, setPageInfo] = useState<DataExplorerPageInfo>(
    data.pageInfo ?? {
      page: 1,
      pageSize: Math.max(initialDatasets.length, 1),
      totalItems: initialDatasets.length,
      totalPages: initialDatasets.length > 0 ? 1 : 0,
      sortBy: "updated",
      sortDir: "desc",
    },
  );
  const [selectedDatasetId, setSelectedDatasetId] = useState<string | null>(initialDatasets[0]?.id ?? null);
  const [selectedDetail, setSelectedDetail] = useState<DataExplorerDatasetDetail | null>(
    buildFallbackDetail(initialDatasets[0], metadata),
  );
  const [listMeta, setListMeta] = useState<DataExplorerFetchMeta | null>(initialMeta);
  const [detailMeta, setDetailMeta] = useState<DataExplorerFetchMeta | null>(null);
  const [recordsMeta, setRecordsMeta] = useState<DataExplorerFetchMeta | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>(initialDatasets[0] ? "loading" : "idle");
  const [detailError, setDetailError] = useState<string | null>(null);
  const [relatedRecords, setRelatedRecords] = useState<DataExplorerRelatedRecord[]>([]);
  const [recordFilters, setRecordFilters] = useState(EMPTY_RECORD_FILTERS);
  const [recordsPageInfo, setRecordsPageInfo] = useState<DataExplorerRelatedRecordsPageInfo>({
    page: 1,
    pageSize: EMPTY_RECORD_FILTERS.pageSize,
    totalItems: 0,
    totalPages: 0,
    sortBy: EMPTY_RECORD_FILTERS.sortBy,
    sortDir: EMPTY_RECORD_FILTERS.sortDir,
  });
  const [recordsStatus, setRecordsStatus] = useState<RecordsStatus>(initialDatasets[0] ? "loading" : "idle");
  const [recordsError, setRecordsError] = useState<string | null>(null);
  const [listStatus, setListStatus] = useState<ListStatus>(initialDatasets.length > 0 ? "idle" : "empty");
  const [listError, setListError] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const maxValue = Math.max(1, ...previewSeries.map((item) => item.value));

  const categoryOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.category))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const regionOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.region))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const statusOptions = useMemo(
    () => [...new Set(initialDatasets.map((dataset) => dataset.status))].sort((a, b) => a.localeCompare(b)),
    [initialDatasets],
  );
  const sortedPresets = useMemo(() => selectSortedDataExplorerPresets(savedPresets), [savedPresets]);
  const selectedPreset = useMemo(
    () => selectDataExplorerPresetById(sortedPresets, selectedPresetId),
    [sortedPresets, selectedPresetId],
  );
  const selectedPresetInSync = useMemo(() => {
    if (!selectedPreset) {
      return false;
    }

    return isDataExplorerPresetInSync(selectedPreset, draftFilters);
  }, [selectedPreset, draftFilters]);

  const personalScopeAvailable = presetSession?.personalScopeAvailable ?? false;
  const isPersonalScopeBlocked = presetSessionState === "idle" && !personalScopeAvailable;
  const personalScopeUnavailableMessage = "Personal preset scope requires an authenticated station admin session.";
  const activePresetActorLabel = presetSession?.actorLabel
    ?? (presetSession?.sessionActive ? "Authenticated station admin" : "No active station admin session");
  const presetSessionAvailabilityMessage = presetSessionState === "loading"
    ? "Checking station admin session for personal preset access."
    : presetSessionState === "error"
      ? (presetSessionError ?? "Unable to verify station admin session right now.")
      : personalScopeAvailable
        ? "Personal preset scope is available."
        : "Personal preset scope unavailable until a station admin session is active.";
  const historyPresetId = presetHistoryPresetFilter === "selected"
    ? (selectedPresetId || undefined)
    : undefined;
  const historyAction = presetHistoryActionFilter === "all"
    ? undefined
    : presetHistoryActionFilter;

  function ensurePersonalPresetScopeAvailable(): boolean {
    if (presetScope !== "personal") {
      return true;
    }

    if (personalScopeAvailable) {
      return true;
    }

    setPresetStatus("error");
    setPresetError(personalScopeUnavailableMessage);
    return false;
  }

  function requestPresetHistoryRefresh() {
    setPresetHistoryRefreshNonce((value) => value + 1);
  }

  async function refreshPresetActivity(scope: DataExplorerPresetScope = presetScope) {
    if (scope === "personal" && !personalScopeAvailable) {
      setPresetActivity([]);
      setPresetActivityStatus("idle");
      setPresetActivityError(null);
      return;
    }

    setPresetActivityStatus("loading");
    setPresetActivityError(null);

    try {
      const result = await apiClient.dataExplorer.listPresetAuditEvents({
        scope,
        limit: 5,
      });

      if (!result.ok) {
        if (scope === "personal" && result.reason === "validation") {
          setPresetActivity([]);
          setPresetActivityStatus("idle");
          setPresetActivityError(null);
          return;
        }

        setPresetActivity([]);
        setPresetActivityStatus("error");
        setPresetActivityError(result.error ?? "Unable to load preset activity right now.");
        return;
      }

      setPresetActivity(result.events);
      setPresetActivityStatus("idle");
      setPresetActivityError(null);
    } catch {
      setPresetActivity([]);
      setPresetActivityStatus("error");
      setPresetActivityError("Unable to load preset activity right now.");
    }
  }

  const refreshBehaviorActivity = useCallback(async (scope: DataExplorerPresetScope) => {
    if (scope === "personal" && !personalScopeAvailable) {
      setBehaviorActivity([]);
      setBehaviorActivityStatus("idle");
      setBehaviorActivityError(null);
      return;
    }

    setBehaviorActivityStatus("loading");
    setBehaviorActivityError(null);

    try {
      const result = await apiClient.dataExplorer.listBehaviorEvents({
        scope,
        limit: 5,
      });

      if (!result.ok) {
        if (scope === "personal" && result.reason === "validation") {
          setBehaviorActivity([]);
          setBehaviorActivityStatus("idle");
          setBehaviorActivityError(null);
          return;
        }

        setBehaviorActivity([]);
        setBehaviorActivityStatus("error");
        setBehaviorActivityError(result.error ?? "Unable to load recent operator activity right now.");
        return;
      }

      setBehaviorActivity(result.events);
      setBehaviorActivityStatus("idle");
      setBehaviorActivityError(null);
    } catch {
      setBehaviorActivity([]);
      setBehaviorActivityStatus("error");
      setBehaviorActivityError("Unable to load recent operator activity right now.");
    }
  }, [personalScopeAvailable]);

  const refreshBehaviorDedupeSummary = useCallback(async (scope: DataExplorerPresetScope) => {
    if (scope === "personal" && !personalScopeAvailable) {
      setBehaviorDedupeSummary([]);
      setBehaviorDedupeSummaryWindowMinutes(BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES);
      setBehaviorDedupeSummaryStatus("idle");
      setBehaviorDedupeSummaryError(null);
      return;
    }

    setBehaviorDedupeSummaryStatus("loading");
    setBehaviorDedupeSummaryError(null);

    try {
      const result = await apiClient.dataExplorer.listBehaviorDedupeDropSummary({
        scope,
        windowMinutes: BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES,
        limit: BEHAVIOR_DEDUPE_DIAGNOSTIC_LIMIT,
      });

      if (!result.ok) {
        if (scope === "personal" && result.reason === "validation") {
          setBehaviorDedupeSummary([]);
          setBehaviorDedupeSummaryWindowMinutes(BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES);
          setBehaviorDedupeSummaryStatus("idle");
          setBehaviorDedupeSummaryError(null);
          return;
        }

        setBehaviorDedupeSummary([]);
        setBehaviorDedupeSummaryWindowMinutes(result.windowMinutes ?? BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES);
        setBehaviorDedupeSummaryStatus("error");
        setBehaviorDedupeSummaryError(result.error ?? "Unable to load dedupe diagnostics right now.");
        return;
      }

      setBehaviorDedupeSummary(result.summary);
      setBehaviorDedupeSummaryWindowMinutes(result.windowMinutes);
      setBehaviorDedupeSummaryStatus("idle");
      setBehaviorDedupeSummaryError(null);
    } catch {
      setBehaviorDedupeSummary([]);
      setBehaviorDedupeSummaryWindowMinutes(BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES);
      setBehaviorDedupeSummaryStatus("error");
      setBehaviorDedupeSummaryError("Unable to load dedupe diagnostics right now.");
    }
  }, [personalScopeAvailable]);

  const recordBehaviorEvent = useCallback((input: {
    eventType: DataExplorerBehaviorEvent["eventType"];
    presetId?: string;
    presetName?: string;
    datasetId?: string;
    datasetName?: string;
    sourceContext?: Record<string, unknown>;
  }) => {
    void apiClient.dataExplorer.writeBehaviorEvent({
      eventType: input.eventType,
      scope: presetScope,
      presetId: input.presetId,
      presetName: input.presetName,
      datasetId: input.datasetId,
      datasetName: input.datasetName,
      sourceContext: input.sourceContext,
    }).then((result) => {
      if (!result.ok) {
        return;
      }

      void refreshBehaviorActivity(presetScope);
      void refreshBehaviorDedupeSummary(presetScope);
    }).catch(() => {
      // Behavior tracking is best-effort and should never block workspace interactions.
    });
  }, [presetScope, refreshBehaviorActivity, refreshBehaviorDedupeSummary]);

  useEffect(() => {
    let cancelled = false;

    setPresetSessionState("loading");
    setPresetSessionError(null);

    void apiClient.dataExplorer.getPresetSessionStatus().then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok || !result.status) {
        setPresetSession(null);
        setPresetSessionState("error");
        setPresetSessionError(result.error ?? "Unable to verify station admin session right now.");
        return;
      }

      setPresetSession(result.status);
      setPresetSessionState("idle");
      setPresetSessionError(null);
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setPresetSession(null);
      setPresetSessionState("error");
      setPresetSessionError("Unable to verify station admin session right now.");
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelectedPresetId("");
    setSavedPresets(presetScope === "shared" ? loadDataExplorerPresets(presetScope) : []);
    setPresetStatus("idle");
    setPresetError(null);
    setPresetHistoryOpen(false);
    setPresetHistory([]);
    setPresetHistoryStatus("idle");
    setPresetHistoryError(null);
    setPresetHistoryActionFilter("all");
    setPresetHistoryPresetFilter("all");

    if (presetScope === "personal" && isPersonalScopeBlocked) {
        setSavedPresets([]);
        setPresetStatus("error");
        setPresetError(personalScopeUnavailableMessage);
        return;
    }

    let cancelled = false;

    void apiClient.dataExplorer.listPresets(presetScope).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (canUseLocalPresetFallback(presetScope, result.reason)) {
          return;
        }

        setSavedPresets([]);
        setPresetStatus("error");
        setPresetError(result.error ?? "Unable to load presets right now.");
        return;
      }

      setSavedPresets(result.presets);
      setPresetStatus("idle");
      setPresetError(null);
    }).catch(() => {
      if (cancelled || presetScope === "shared") {
        return;
      }

      setSavedPresets([]);
      setPresetStatus("error");
      setPresetError("Unable to load personal presets right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [isPersonalScopeBlocked, presetScope]);

  useEffect(() => {
    if (presetHistoryPresetFilter === "selected" && !selectedPresetId) {
      setPresetHistoryPresetFilter("all");
    }
  }, [presetHistoryPresetFilter, selectedPresetId]);

  useEffect(() => {
    if (!presetHistoryOpen) {
      setPresetHistory([]);
      setPresetHistoryStatus("idle");
      setPresetHistoryError(null);
      return;
    }

    if (presetScope === "personal" && presetSessionState === "idle" && !personalScopeAvailable) {
      setPresetHistory([]);
      setPresetHistoryStatus("idle");
      setPresetHistoryError(null);
      return;
    }

    let cancelled = false;

    setPresetHistoryStatus("loading");
    setPresetHistoryError(null);

    void apiClient.dataExplorer.listPresetAuditEvents({
      scope: presetScope,
      action: historyAction,
      presetId: historyPresetId,
      limit: PRESET_HISTORY_DETAIL_LIMIT,
    }).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (presetScope === "personal" && result.reason === "validation") {
          setPresetHistory([]);
          setPresetHistoryStatus("idle");
          setPresetHistoryError(null);
          return;
        }

        setPresetHistory([]);
        setPresetHistoryStatus("error");
        setPresetHistoryError(result.error ?? "Unable to load preset history right now.");
        return;
      }

      setPresetHistory(result.events);
      setPresetHistoryStatus("idle");
      setPresetHistoryError(null);
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setPresetHistory([]);
      setPresetHistoryStatus("error");
      setPresetHistoryError("Unable to load preset history right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [
    historyAction,
    historyPresetId,
    personalScopeAvailable,
    presetHistoryOpen,
    presetHistoryRefreshNonce,
    presetScope,
    presetSessionState,
  ]);

  useEffect(() => {
    if (presetScope === "personal" && isPersonalScopeBlocked) {
      setBehaviorActivity([]);
      setBehaviorActivityStatus("idle");
      setBehaviorActivityError(null);
      return;
    }

    let cancelled = false;

    setBehaviorActivity([]);
    setBehaviorActivityStatus("loading");
    setBehaviorActivityError(null);

    void apiClient.dataExplorer.listBehaviorEvents({
      scope: presetScope,
      limit: 5,
    }).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (presetScope === "personal" && result.reason === "validation") {
          setBehaviorActivity([]);
          setBehaviorActivityStatus("idle");
          setBehaviorActivityError(null);
          return;
        }

        setBehaviorActivity([]);
        setBehaviorActivityStatus("error");
        setBehaviorActivityError(result.error ?? "Unable to load recent operator activity right now.");
        return;
      }

      setBehaviorActivity(result.events);
      setBehaviorActivityStatus("idle");
      setBehaviorActivityError(null);
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setBehaviorActivity([]);
      setBehaviorActivityStatus("error");
      setBehaviorActivityError("Unable to load recent operator activity right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [isPersonalScopeBlocked, presetScope]);

  useEffect(() => {
    if (presetScope === "personal" && isPersonalScopeBlocked) {
      setBehaviorDedupeSummary([]);
      setBehaviorDedupeSummaryWindowMinutes(BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES);
      setBehaviorDedupeSummaryStatus("idle");
      setBehaviorDedupeSummaryError(null);
      return;
    }

    let cancelled = false;

    setBehaviorDedupeSummary([]);
    setBehaviorDedupeSummaryStatus("loading");
    setBehaviorDedupeSummaryError(null);

    void apiClient.dataExplorer.listBehaviorDedupeDropSummary({
      scope: presetScope,
      windowMinutes: BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES,
      limit: BEHAVIOR_DEDUPE_DIAGNOSTIC_LIMIT,
    }).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (presetScope === "personal" && result.reason === "validation") {
          setBehaviorDedupeSummary([]);
          setBehaviorDedupeSummaryWindowMinutes(BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES);
          setBehaviorDedupeSummaryStatus("idle");
          setBehaviorDedupeSummaryError(null);
          return;
        }

        setBehaviorDedupeSummary([]);
        setBehaviorDedupeSummaryWindowMinutes(result.windowMinutes ?? BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES);
        setBehaviorDedupeSummaryStatus("error");
        setBehaviorDedupeSummaryError(result.error ?? "Unable to load dedupe diagnostics right now.");
        return;
      }

      setBehaviorDedupeSummary(result.summary);
      setBehaviorDedupeSummaryWindowMinutes(result.windowMinutes);
      setBehaviorDedupeSummaryStatus("idle");
      setBehaviorDedupeSummaryError(null);
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setBehaviorDedupeSummary([]);
      setBehaviorDedupeSummaryWindowMinutes(BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES);
      setBehaviorDedupeSummaryStatus("error");
      setBehaviorDedupeSummaryError("Unable to load dedupe diagnostics right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [isPersonalScopeBlocked, presetScope]);

  useEffect(() => {
    if (presetScope === "personal" && isPersonalScopeBlocked) {
      setPresetActivity([]);
      setPresetActivityStatus("idle");
      setPresetActivityError(null);
      return;
    }

    let cancelled = false;

    setPresetActivity([]);
    setPresetActivityStatus("loading");
    setPresetActivityError(null);

    void apiClient.dataExplorer.listPresetAuditEvents({
      scope: presetScope,
      limit: 5,
    }).then((result) => {
      if (cancelled) {
        return;
      }

      if (!result.ok) {
        if (presetScope === "personal" && result.reason === "validation") {
          setPresetActivity([]);
          setPresetActivityStatus("idle");
          setPresetActivityError(null);
          return;
        }

        setPresetActivity([]);
        setPresetActivityStatus("error");
        setPresetActivityError(result.error ?? "Unable to load preset activity right now.");
        return;
      }

      setPresetActivity(result.events);
      setPresetActivityStatus("idle");
      setPresetActivityError(null);
    }).catch(() => {
      if (cancelled) {
        return;
      }

      setPresetActivity([]);
      setPresetActivityStatus("error");
      setPresetActivityError("Unable to load preset activity right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [isPersonalScopeBlocked, presetScope]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setSelectedDetail(null);
      setDetailStatus("idle");
      setDetailError(null);
      return;
    }

    let cancelled = false;
    setDetailStatus("loading");
    setDetailError(null);

    void apiClient.dataExplorer.getDatasetDetail(selectedDatasetId).then(({ data: detail, meta }) => {
      if (cancelled) return;
      setDetailMeta(meta);
      if (!detail) {
        setDetailStatus(meta.state === "error" ? "error" : "not_found");
        if (meta.state === "error") {
          setDetailError(meta.errorMessage ?? "Unable to load dataset detail right now.");
        }
        return;
      }
      setSelectedDetail(detail);
      setDetailStatus("idle");

      recordBehaviorEvent({
        eventType: "dataset_detail_viewed",
        datasetId: detail.id,
        datasetName: detail.name,
        sourceContext: {
          interaction: "dataset-detail-loaded",
          detailSource: meta.source ?? "unknown",
          detailDelivery: meta.delivery ?? "unknown",
        },
      });
    }).catch(() => {
      if (cancelled) return;
      setDetailStatus("error");
      setDetailError("Unable to load dataset detail right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [recordBehaviorEvent, selectedDatasetId]);

  useEffect(() => {
    if (!selectedDatasetId) {
      setRelatedRecords([]);
      setRecordsPageInfo({
        page: 1,
        pageSize: recordFilters.pageSize,
        totalItems: 0,
        totalPages: 0,
        sortBy: recordFilters.sortBy,
        sortDir: recordFilters.sortDir,
      });
      setRecordsStatus("idle");
      setRecordsError(null);
      return;
    }

    let cancelled = false;
    setRecordsStatus("loading");
    setRecordsError(null);
    setRelatedRecords([]);

    void apiClient.dataExplorer.getDatasetRecords(selectedDatasetId, recordFilters).then(({ data: result, meta }) => {
      if (cancelled) return;
      setRecordsMeta(meta);
      if (!result) {
        setRecordsStatus(meta.state === "error" ? "error" : "not_found");
        if (meta.state === "error") {
          setRecordsError(meta.errorMessage ?? "Unable to load related records right now.");
        }
        return;
      }
      setRelatedRecords(result.records);
      setRecordsPageInfo(
        result.pageInfo ?? {
          page: recordFilters.page,
          pageSize: recordFilters.pageSize,
          totalItems: result.records.length,
          totalPages: result.records.length > 0 ? 1 : 0,
          sortBy: recordFilters.sortBy,
          sortDir: recordFilters.sortDir,
        },
      );
      setRecordsStatus(result.records.length > 0 ? "idle" : "empty");
    }).catch(() => {
      if (cancelled) return;
      setRecordsStatus("error");
      setRecordsError("Unable to load related records right now.");
    });

    return () => {
      cancelled = true;
    };
  }, [recordFilters, selectedDatasetId]);

  function prepareSelection(dataset: DataExplorerDatasetRow | undefined) {
    setSelectedDatasetId(dataset?.id ?? null);
    setSelectedDetail(buildFallbackDetail(dataset, metadata));
    setDetailStatus(dataset ? "loading" : "idle");
    setDetailError(null);
    setDetailMeta(null);
    setRecordFilters(EMPTY_RECORD_FILTERS);
    setRelatedRecords([]);
    setRecordsPageInfo({
      page: 1,
      pageSize: EMPTY_RECORD_FILTERS.pageSize,
      totalItems: 0,
      totalPages: 0,
      sortBy: EMPTY_RECORD_FILTERS.sortBy,
      sortDir: EMPTY_RECORD_FILTERS.sortDir,
    });
    setRecordsStatus(dataset ? "loading" : "idle");
    setRecordsError(null);
    setRecordsMeta(null);
  }

  function handleDatasetSelect(dataset: DataExplorerDatasetRow) {
    prepareSelection(dataset);
    recordBehaviorEvent({
      eventType: "dataset_selected",
      datasetId: dataset.id,
      datasetName: dataset.name,
      sourceContext: {
        interaction: "dataset-list-click",
        listSource: listMeta?.source ?? "unknown",
        listDelivery: listMeta?.delivery ?? "unknown",
      },
    });
  }

  async function applyFilters(filters: Required<DataExplorerDatasetFilters>) {
    const requestId = requestSequence.current + 1;
    requestSequence.current = requestId;
    const normalized = normalizeFilters(filters);

    setListStatus("loading");
    setListError(null);

    try {
      const response = await apiClient.dataExplorer.getWorkspace(normalized);

      if (requestSequence.current !== requestId) {
        return;
      }

      setListMeta(response.meta);
      setDatasets(response.data.datasets);
      setActiveFilters(normalized);
      setPageInfo(
        response.data.pageInfo ?? {
          page: normalized.page ?? 1,
          pageSize: normalized.pageSize ?? 25,
          totalItems: response.data.datasets.length,
          totalPages: response.data.datasets.length > 0 ? 1 : 0,
          sortBy: normalized.sortBy ?? "updated",
          sortDir: normalized.sortDir ?? "desc",
        },
      );

      if (response.data.datasets.length === 0) {
        setListStatus("empty");
        prepareSelection(undefined);
        return;
      }

      setListStatus("idle");

      if (selectedDatasetId && response.data.datasets.some((dataset) => dataset.id === selectedDatasetId)) {
        return;
      }

      prepareSelection(response.data.datasets[0]);
    } catch {
      if (requestSequence.current !== requestId) {
        return;
      }
      setListStatus("error");
      setListError("Unable to refresh datasets right now.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void applyFilters(draftFilters);
  }

  function handleResetFilters() {
    setDraftFilters(EMPTY_FILTERS);
    void applyFilters(EMPTY_FILTERS);
  }

  async function handleSavePreset() {
    if (!ensurePersonalPresetScopeAvailable()) {
      return;
    }

    const draft = {
      name: presetName,
      scope: presetScope,
      filters: {
        q: draftFilters.q,
        category: draftFilters.category,
        region: draftFilters.region,
        status: draftFilters.status,
        sortBy: draftFilters.sortBy,
        sortDir: draftFilters.sortDir,
        pageSize: draftFilters.pageSize,
      },
    };

    const sharedResult = await apiClient.dataExplorer.upsertPreset(draft);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      const savedPreset = sharedResult.presets.find((preset) => preset.name === presetName.trim());
      setSelectedPresetId(savedPreset?.id ?? "");
      setPresetName("");
      setPresetStatus("idle");
      setPresetError(null);
      void refreshPresetActivity(presetScope);
      requestPresetHistoryRefresh();
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to save ${presetScope} presets right now.`);
      return;
    }

    const result = saveDataExplorerPreset(draft);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to save presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    const savedPreset = result.presets.find((preset) => preset.name === presetName.trim());
    setSelectedPresetId(savedPreset?.id ?? "");
    setPresetName("");
    setPresetStatus("idle");
    setPresetError(null);
  }

  function handleApplyPreset() {
    const preset = savedPresets.find((item) => item.id === selectedPresetId);

    if (!preset) {
      return;
    }

    const nextFilters: Required<DataExplorerDatasetFilters> = {
      ...EMPTY_FILTERS,
      ...preset.filters,
      page: 1,
    };

    setDraftFilters(nextFilters);
    setPresetStatus("idle");
    setPresetError(null);

    recordBehaviorEvent({
      eventType: "preset_applied",
      presetId: preset.id,
      presetName: preset.name,
      sourceContext: {
        interaction: "preset-apply",
        listSource: listMeta?.source ?? "unknown",
      },
    });

    // Usage tracking is best-effort and should never block preset application.
    void apiClient.dataExplorer.markPresetUsed(preset.id, presetScope).then((result) => {
      if (result.ok) {
        setSavedPresets(result.presets);
        void refreshPresetActivity(presetScope);
        requestPresetHistoryRefresh();
        return;
      }

      if (!canUseLocalPresetFallback(presetScope, result.reason)) {
        return;
      }

      const markUsedResult = markDataExplorerPresetUsed(preset.id, presetScope);

      if (markUsedResult.ok) {
        setSavedPresets(markUsedResult.presets);
      }
    }).catch(() => {
      if (presetScope !== "shared") {
        return;
      }

      const markUsedResult = markDataExplorerPresetUsed(preset.id, presetScope);

      if (markUsedResult.ok) {
        setSavedPresets(markUsedResult.presets);
      }
    });

    void applyFilters(nextFilters);
  }

  async function handleUpdatePreset() {
    if (!ensurePersonalPresetScopeAvailable()) {
      return;
    }

    const preset = selectDataExplorerPresetById(savedPresets, selectedPresetId);

    if (!preset) {
      return;
    }

    const draft = {
      id: preset.id,
      name: preset.name,
      scope: presetScope,
      filters: toDataExplorerPresetFilterSnapshot(draftFilters),
    };

    const sharedResult = await apiClient.dataExplorer.upsertPreset(draft);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      setSelectedPresetId(preset.id);
      setPresetStatus("idle");
      setPresetError(null);
      void refreshPresetActivity(presetScope);
      requestPresetHistoryRefresh();
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to update ${presetScope} presets right now.`);
      return;
    }

    const result = upsertDataExplorerPreset(draft);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to update presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    setSelectedPresetId(preset.id);
    setPresetStatus("idle");
    setPresetError(null);
  }

  async function handleDeletePreset() {
    if (!ensurePersonalPresetScopeAvailable()) {
      return;
    }

    if (!selectedPresetId) {
      return;
    }

    const sharedResult = await apiClient.dataExplorer.deletePreset(selectedPresetId, presetScope);

    if (sharedResult.ok) {
      setSavedPresets(sharedResult.presets);
      setSelectedPresetId("");
      setPresetStatus("idle");
      setPresetError(null);
      void refreshPresetActivity(presetScope);
      requestPresetHistoryRefresh();
      return;
    }

    if (!canUseLocalPresetFallback(presetScope, sharedResult.reason)) {
      setPresetStatus("error");
      setPresetError(sharedResult.error ?? `Unable to delete ${presetScope} presets right now.`);
      return;
    }

    const result = deleteDataExplorerPresetById(selectedPresetId, presetScope);

    if (!result.ok) {
      setPresetStatus("error");
      setPresetError(result.error ?? "Unable to update presets in this browser.");
      return;
    }

    setSavedPresets(result.presets);
    setSelectedPresetId("");
    setPresetStatus("idle");
    setPresetError(null);
  }

  async function handleExportBehaviorDedupeSummary() {
    setBehaviorDedupeExportStatus("exporting");
    setBehaviorDedupeExportError(null);

    try {
      const result = await apiClient.dataExplorer.exportBehaviorDedupeSummary({
        scope: presetScope,
        windowMinutes: BEHAVIOR_DEDUPE_DIAGNOSTIC_WINDOW_MINUTES,
        limit: BEHAVIOR_DEDUPE_DIAGNOSTIC_LIMIT,
      });

      if (!result.ok || !result.snapshot) {
        setBehaviorDedupeExportStatus("idle");
        setBehaviorDedupeExportError(result.error ?? "Unable to export dedupe diagnostics right now.");
        return;
      }

      downloadDedupeSummarySnapshot(
        result.snapshot,
        result.filename ?? `data-explorer-dedupe-summary-${presetScope}.json`,
      );
      setBehaviorDedupeExportStatus("idle");
      setBehaviorDedupeExportError(null);
    } catch {
      setBehaviorDedupeExportStatus("idle");
      setBehaviorDedupeExportError("Unable to export dedupe diagnostics right now.");
    }
  }

  const detailMetadata = toMetadataItems(selectedDetail);
  const filtersApplied = Boolean(activeFilters.q || activeFilters.category || activeFilters.region || activeFilters.status);
  const canGoToPreviousPage = pageInfo.page > 1;
  const canGoToNextPage = pageInfo.totalPages > 0 && pageInfo.page < pageInfo.totalPages;
  const canGoToPreviousRecordsPage = recordsPageInfo.page > 1;
  const canGoToNextRecordsPage =
    recordsPageInfo.totalPages > 0 && recordsPageInfo.page < recordsPageInfo.totalPages;
  const workspaceDegraded = listMeta?.state === "success" && listMeta.source === "mock";
  const workspaceDegradedReason = workspaceDegraded
    ? formatFallbackReasonLabel(listMeta?.fallbackReason)
    : null;
  const recordsDegraded = recordsMeta?.state === "success" && recordsMeta.source === "mock";
  const recordsDegradedReason = recordsDegraded
    ? formatFallbackReasonLabel(recordsMeta?.fallbackReason)
    : null;
  const recentPresetActivity = presetActivity.slice(0, 5);
  const shouldShowPresetActivity = sortedPresets.length > 0
    || recentPresetActivity.length > 0
    || presetActivityStatus !== "idle";
  const recentPresetHistory = presetHistory.slice(0, PRESET_HISTORY_DETAIL_LIMIT);
  const recentBehaviorActivity = behaviorActivity.slice(0, 5);
  const recentBehaviorDedupeSummary = behaviorDedupeSummary.slice(0, BEHAVIOR_DEDUPE_DIAGNOSTIC_LIMIT);
  const shouldShowBehaviorActivity = sortedPresets.length > 0
    || recentBehaviorActivity.length > 0
    || behaviorActivityStatus !== "idle";
  const shouldShowBehaviorDedupeDiagnostics = SHOW_DEBUG
    && (recentBehaviorDedupeSummary.length > 0 || behaviorDedupeSummaryStatus !== "idle");
  const shouldShowBehaviorPanel = shouldShowBehaviorActivity || shouldShowBehaviorDedupeDiagnostics;

  function handleSortByChange(value: DataExplorerDatasetSortBy) {
    const next = { ...draftFilters, sortBy: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handleSortDirChange(value: DataExplorerSortDirection) {
    const next = { ...draftFilters, sortDir: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handlePageSizeChange(value: number) {
    const next = { ...draftFilters, pageSize: value, page: 1 };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handlePageChange(nextPage: number) {
    const next = { ...draftFilters, page: nextPage };
    setDraftFilters(next);
    void applyFilters(next);
  }

  function handleRecordSortByChange(value: DataExplorerRelatedRecordSortBy) {
    setRecordFilters((current) => ({ ...current, sortBy: value, page: 1 }));
  }

  function handleRecordSortDirChange(value: DataExplorerSortDirection) {
    setRecordFilters((current) => ({ ...current, sortDir: value, page: 1 }));
  }

  function handleRecordPageSizeChange(value: number) {
    setRecordFilters((current) => ({ ...current, pageSize: value, page: 1 }));
  }

  function handleRecordPageChange(nextPage: number) {
    setRecordFilters((current) => ({ ...current, page: nextPage }));
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-6">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">Data Explorer</p>
        <h2 className="mt-2 text-xl font-semibold text-slate-100">Research dataset access and rapid preview workspace</h2>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Search across active marine datasets, inspect structure and freshness, and review AI-assisted
          summaries before exporting or joining with other feeds.
        </p>
      </div>

      <Panel
        title="Search and Actions"
        subtitle="Refine the active catalog without leaving the platform shell."
        action={
          <div className="flex items-center gap-2 text-[10px] text-slate-500">
            <Database size={12} className="text-cyan-400" />
            {pageInfo.totalItems} indexed matches
          </div>
        }
      >
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <form className="flex flex-1 flex-col gap-3" onSubmit={handleSubmit}>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_180px_180px_160px]">
              <div className="relative">
                <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  value={draftFilters.q}
                  onChange={(event) => setDraftFilters((current) => ({ ...current, q: event.target.value }))}
                  className="w-full rounded-xl border border-surface-borderSubtle bg-ocean-850 py-2.5 pl-9 pr-4 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                  aria-label="Dataset search"
                  placeholder="Search by dataset name or category"
                />
              </div>
              <select value={draftFilters.category} onChange={(event) => setDraftFilters((current) => ({ ...current, category: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset category filter">
                <option value="">All categories</option>
                {categoryOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={draftFilters.region} onChange={(event) => setDraftFilters((current) => ({ ...current, region: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset region filter">
                <option value="">All regions</option>
                {regionOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
              <select value={draftFilters.status} onChange={(event) => setDraftFilters((current) => ({ ...current, status: event.target.value }))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset status filter">
                <option value="">All statuses</option>
                {statusOptions.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </div>

            <div className="grid gap-3 lg:grid-cols-[180px_160px_160px_minmax(0,1fr)]">
              <select value={draftFilters.sortBy} onChange={(event) => handleSortByChange(event.target.value as DataExplorerDatasetSortBy)} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset sort field">
                <option value="updated">Sort: Updated</option>
                <option value="name">Sort: Name</option>
                <option value="records">Sort: Records</option>
                <option value="status">Sort: Status</option>
              </select>
              <select value={draftFilters.sortDir} onChange={(event) => handleSortDirChange(event.target.value as DataExplorerSortDirection)} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset sort direction">
                <option value="desc">Descending</option>
                <option value="asc">Ascending</option>
              </select>
              <select value={draftFilters.pageSize} onChange={(event) => handlePageSizeChange(Number.parseInt(event.target.value, 10))} className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30" aria-label="Dataset page size">
                <option value="10">10 / page</option>
                <option value="25">25 / page</option>
                <option value="50">50 / page</option>
              </select>
              <div className="flex items-center justify-end text-[11px] text-slate-500">
                Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page} of {pageInfo.totalPages}
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-[220px_minmax(0,1fr)]">
              <select
                value={presetScope}
                onChange={(event) => setPresetScope(event.target.value as DataExplorerPresetScope)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Preset scope"
              >
                <option value="shared">Shared preset scope</option>
                <option value="personal" disabled={isPersonalScopeBlocked}>Personal preset scope</option>
              </select>
              <div
                data-testid="preset-scope-description"
                className="flex items-center rounded-xl border border-surface-borderSubtle bg-ocean-900/60 px-3 py-2.5 text-[11px] leading-relaxed text-slate-400"
              >
                {formatPresetScopeDescription(presetScope)}
              </div>
            </div>

            <div
              data-testid="preset-session-status"
              className="rounded-xl border border-surface-borderSubtle bg-ocean-900/55 px-3 py-2 text-[11px] text-slate-400"
            >
              <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Preset session</p>
              <p className="mt-1" data-testid="preset-session-actor">Actor: {activePresetActorLabel}</p>
              <p className="mt-0.5" data-testid="preset-session-availability">{presetSessionAvailabilityMessage}</p>
            </div>

            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_auto_auto]">
              <input
                type="text"
                value={presetName}
                onChange={(event) => setPresetName(event.target.value)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Preset name"
                placeholder="Save current search as..."
              />
              <select
                value={selectedPresetId}
                onChange={(event) => setSelectedPresetId(event.target.value)}
                className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2.5 text-sm text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                aria-label="Saved presets"
              >
                <option value="">Saved presets</option>
                {sortedPresets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => {
                  void handleSavePreset();
                }}
                disabled={presetScope === "personal" && !personalScopeAvailable}
                className="inline-flex items-center justify-center rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-300 transition-colors hover:bg-emerald-500/15 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Save preset
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleApplyPreset}
                  disabled={!selectedPresetId}
                  className="inline-flex items-center justify-center rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Apply preset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleUpdatePreset();
                  }}
                  disabled={!selectedPresetId || selectedPresetInSync || (presetScope === "personal" && !personalScopeAvailable)}
                  className="inline-flex items-center justify-center rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Update preset
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void handleDeletePreset();
                  }}
                  disabled={!selectedPresetId || (presetScope === "personal" && !personalScopeAvailable)}
                  className="inline-flex items-center justify-center rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-rose-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>

            <div className="text-[11px] text-slate-500" data-testid="saved-preset-usage-meta">
              {selectedPreset
                ? formatDataExplorerPresetUsageMeta(selectedPreset)
                : "Select a preset to view usage metadata."}
            </div>
            <div className="text-[11px] text-slate-500" data-testid="selected-preset-scope">
              Scope: {formatPresetScopeLabel(selectedPreset?.scope ?? presetScope)}
            </div>
            {shouldShowPresetActivity && (
              <div
                data-testid="preset-activity-panel"
                className="rounded-xl border border-surface-borderSubtle bg-ocean-900/55 px-3 py-2.5"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Recent preset activity</p>
                  <button
                    type="button"
                    data-testid="preset-history-toggle"
                    onClick={() => setPresetHistoryOpen((current) => !current)}
                    className="inline-flex items-center justify-center rounded-lg border border-surface-borderSubtle bg-ocean-850 px-2 py-1 text-[10px] text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100"
                  >
                    {presetHistoryOpen ? "Close history" : "View full history"}
                  </button>
                </div>
                {presetActivityStatus === "loading" && (
                  <p className="mt-1 text-[11px] text-slate-500">Loading recent preset activity...</p>
                )}
                {presetActivityStatus === "error" && (
                  <p className="mt-1 text-[11px] text-slate-500" data-testid="preset-activity-error">
                    {presetActivityError ?? "Unable to load preset activity right now."}
                  </p>
                )}
                {presetActivityStatus === "idle" && recentPresetActivity.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500" data-testid="preset-activity-empty">
                    No recent preset activity for this scope.
                  </p>
                )}
                {presetActivityStatus === "idle" && recentPresetActivity.length > 0 && (
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-400" data-testid="preset-activity-list">
                    {recentPresetActivity.map((event) => (
                      <li key={event.id} data-testid="preset-activity-item">
                        {formatPresetActivityAction(event.action)} {event.presetName} ({formatPresetScopeLabel(event.scope)})
                        {" · "}
                        {formatPresetActivityTimestamp(event.createdAt)}
                        {" · "}
                        {formatPresetActivityActor(event)}
                      </li>
                    ))}
                  </ul>
                )}
                {presetHistoryOpen && (
                  <div
                    data-testid="preset-history-detail"
                    className="mt-3 rounded-xl border border-surface-borderSubtle bg-ocean-950/60 px-3 py-2.5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={presetHistoryActionFilter}
                        onChange={(event) => {
                          setPresetHistoryActionFilter(event.target.value as PresetHistoryActionFilter);
                        }}
                        className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-2 py-1 text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                        aria-label="Preset history action filter"
                      >
                        <option value="all">All actions</option>
                        <option value="created">Created</option>
                        <option value="updated">Updated</option>
                        <option value="deleted">Deleted</option>
                        <option value="marked_used">Marked used</option>
                      </select>
                      <select
                        value={presetHistoryPresetFilter}
                        onChange={(event) => {
                          setPresetHistoryPresetFilter(event.target.value as PresetHistoryPresetFilter);
                        }}
                        className="rounded-lg border border-surface-borderSubtle bg-ocean-850 px-2 py-1 text-[11px] text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                        aria-label="Preset history preset filter"
                      >
                        <option value="all">All presets in scope</option>
                        <option value="selected" disabled={!selectedPresetId}>Selected preset only</option>
                      </select>
                      <span className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
                        Scope {formatPresetScopeLabel(presetScope)}
                      </span>
                    </div>
                    {presetHistoryStatus === "loading" && (
                      <p className="mt-2 text-[11px] text-slate-500">Loading preset history...</p>
                    )}
                    {presetHistoryStatus === "error" && (
                      <p className="mt-2 text-[11px] text-slate-500" data-testid="preset-history-error">
                        {presetHistoryError ?? "Unable to load preset history right now."}
                      </p>
                    )}
                    {presetHistoryStatus === "idle" && recentPresetHistory.length === 0 && (
                      <p className="mt-2 text-[11px] text-slate-500" data-testid="preset-history-empty">
                        No preset history entries matched this filter.
                      </p>
                    )}
                    {presetHistoryStatus === "idle" && recentPresetHistory.length > 0 && (
                      <ul className="mt-2 space-y-1.5 text-[11px] text-slate-300" data-testid="preset-history-list">
                        {recentPresetHistory.map((event) => (
                          <li
                            key={event.id}
                            data-testid="preset-history-item"
                            className="grid gap-1 rounded-lg border border-surface-borderSubtle bg-ocean-900/55 px-2 py-1.5 lg:grid-cols-[120px_minmax(0,1fr)_70px_170px_170px]"
                          >
                            <span className="text-slate-200">{formatPresetActivityAction(event.action)}</span>
                            <span className="truncate">{event.presetName}</span>
                            <span>{formatPresetScopeLabel(event.scope)}</span>
                            <span className="truncate">{formatPresetActivityActor(event)}</span>
                            <span className="text-slate-400">{formatPresetActivityTimestamp(event.createdAt)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            {shouldShowBehaviorPanel && (
              <div
                data-testid="behavior-activity-panel"
                className="rounded-xl border border-surface-borderSubtle bg-ocean-900/55 px-3 py-2.5"
              >
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Recent operator activity</p>
                {behaviorActivityStatus === "loading" && (
                  <p className="mt-1 text-[11px] text-slate-500">Loading recent operator activity...</p>
                )}
                {behaviorActivityStatus === "error" && (
                  <p className="mt-1 text-[11px] text-slate-500" data-testid="behavior-activity-error">
                    {behaviorActivityError ?? "Unable to load recent operator activity right now."}
                  </p>
                )}
                {behaviorActivityStatus === "idle" && recentBehaviorActivity.length === 0 && (
                  <p className="mt-1 text-[11px] text-slate-500" data-testid="behavior-activity-empty">
                    No recent operator activity for this scope.
                  </p>
                )}
                {behaviorActivityStatus === "idle" && recentBehaviorActivity.length > 0 && (
                  <ul className="mt-1 space-y-1 text-[11px] text-slate-400" data-testid="behavior-activity-list">
                    {recentBehaviorActivity.map((event) => (
                      <li key={event.id} data-testid="behavior-activity-item">
                        {formatBehaviorEventLabel(event)} {formatBehaviorEventSubject(event)}
                        {" · "}
                        {formatPresetScopeLabel(event.scope)}
                        {" · "}
                        {formatPresetActivityTimestamp(event.createdAt)}
                        {" · "}
                        {event.actorLabel ?? "Unknown actor"}
                      </li>
                    ))}
                  </ul>
                )}
                {shouldShowBehaviorDedupeDiagnostics && (
                  <div
                    data-testid="behavior-dedupe-diagnostics"
                    className="mt-3 rounded-xl border border-dashed border-cyan-500/25 bg-cyan-500/5 px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-400">
                        Dedupe diagnostics ({behaviorDedupeSummaryWindowMinutes}m window)
                      </p>
                      <button
                        type="button"
                        data-testid="behavior-dedupe-export-action"
                        onClick={() => {
                          void handleExportBehaviorDedupeSummary();
                        }}
                        disabled={behaviorDedupeExportStatus === "exporting"}
                        className="inline-flex items-center justify-center rounded-lg border border-cyan-500/25 bg-cyan-500/10 px-2 py-1 text-[10px] text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {behaviorDedupeExportStatus === "exporting" ? "Exporting..." : "Export"}
                      </button>
                    </div>
                    {behaviorDedupeExportError && (
                      <p className="mt-1 text-[11px] text-slate-500" data-testid="behavior-dedupe-export-error">
                        {behaviorDedupeExportError}
                      </p>
                    )}
                    {behaviorDedupeSummaryStatus === "loading" && (
                      <p className="mt-1 text-[11px] text-slate-500">Loading dedupe diagnostics...</p>
                    )}
                    {behaviorDedupeSummaryStatus === "error" && (
                      <p className="mt-1 text-[11px] text-slate-500" data-testid="behavior-dedupe-diagnostics-error">
                        {behaviorDedupeSummaryError ?? "Unable to load dedupe diagnostics right now."}
                      </p>
                    )}
                    {behaviorDedupeSummaryStatus === "idle" && recentBehaviorDedupeSummary.length === 0 && (
                      <p className="mt-1 text-[11px] text-slate-500" data-testid="behavior-dedupe-diagnostics-empty">
                        No dropped dataset detail events in the current window.
                      </p>
                    )}
                    {behaviorDedupeSummaryStatus === "idle" && recentBehaviorDedupeSummary.length > 0 && (
                      <ul className="mt-1 space-y-1 text-[11px] text-slate-400" data-testid="behavior-dedupe-diagnostics-list">
                        {recentBehaviorDedupeSummary.map((entry) => (
                          <li key={entry.datasetId} data-testid="behavior-dedupe-diagnostics-item">
                            {entry.datasetId}
                            {" · "}
                            {entry.dropCount} drops
                            {" · "}
                            {formatPresetActivityTimestamp(entry.mostRecentDroppedAt)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </div>
            )}
            {selectedPreset && (
              <div className="text-[11px] text-slate-500" data-testid="saved-preset-sync-status">
                {selectedPresetInSync
                  ? "Preset is in sync with current filters."
                  : "Current filters differ from selected preset."}
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button type="submit" disabled={listStatus === "loading"} className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15 disabled:cursor-wait disabled:opacity-70">
                <Filter size={13} />
                {listStatus === "loading" ? "Filtering..." : "Apply Filters"}
              </button>
              <button type="button" onClick={handleResetFilters} className="inline-flex items-center gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-2 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100">
                <X size={13} className="text-slate-400" />
                Reset
              </button>

              {(listStatus === "loading" || listStatus === "error" || presetStatus === "error" || filtersApplied || workspaceDegraded) && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  {listStatus === "loading" && <StatusBadge label="Refreshing dataset list" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />}
                  {listStatus === "error" && listError && <StatusBadge label={listError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                  {presetStatus === "error" && presetError && <StatusBadge label={presetError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                  {filtersApplied && <StatusBadge label="Filters active" className="border-amber-500/25 bg-amber-500/10 text-amber-300" />}
                  {workspaceDegraded && (
                    <StatusBadge
                      label={`Fallback data mode (${workspaceDegradedReason})`}
                      className="border-amber-500/25 bg-amber-500/10 text-amber-300"
                    />
                  )}
                </div>
              )}
            </div>

            <DebugBadge label="list" meta={listMeta} />
          </form>

          <div className="flex flex-wrap gap-2">
            {actions.map((action) => {
              const Icon = ACTION_ICONS[action.icon];
              return (
                <button
                  key={action.label}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-medium transition-colors",
                    action.tone === "primary"
                      ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-300 hover:bg-cyan-500/15"
                      : "border-surface-borderSubtle bg-ocean-850 text-slate-300 hover:border-cyan-500/30 hover:text-slate-100",
                  )}
                >
                  <Icon size={13} className={action.tone === "primary" ? "text-cyan-400" : "text-slate-400"} />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_360px]">
        <div className="space-y-6">
          <Panel title="Dataset Catalog" subtitle="A focused list view for recent data products relevant to the current case." action={<div className="flex items-center gap-2 text-[11px] text-slate-500"><Table2 size={13} className="text-cyan-400" />List view</div>}>
            {workspaceDegraded && (
              <div
                data-testid="workspace-degraded-state"
                className="mb-3 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 px-4 py-3"
              >
                <p className="text-xs font-medium text-slate-100">Backend degraded mode</p>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                  Showing fallback dataset output because the live repository is unavailable ({workspaceDegradedReason}).
                </p>
              </div>
            )}
            {listStatus === "empty" ? (
              <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/60 p-6">
                <p className="text-sm font-medium text-slate-100">
                  {workspaceDegraded ? "Live dataset catalog unavailable" : "No datasets match the current filters"}
                </p>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  {workspaceDegraded
                    ? `The backend is currently degraded (${workspaceDegradedReason}). Retry after recovery to access live dataset rows.`
                    : "Adjust the search or clear one of the category, region, or status filters to restore results."}
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-surface-borderSubtle">
                <div className="grid grid-cols-[120px_minmax(0,1.4fr)_110px_120px_90px_96px] gap-3 bg-ocean-850 px-4 py-3 text-[10px] uppercase tracking-[0.22em] text-slate-500">
                  <span>Dataset</span><span>Name</span><span>Category</span><span>Region</span><span>Records</span><span>Status</span>
                </div>
                <div className="divide-y divide-surface-borderSubtle">
                  {datasets.map((dataset) => {
                    const selected = dataset.id === selectedDatasetId;
                    return (
                      <button key={dataset.id} type="button" onClick={() => handleDatasetSelect(dataset)} className={cn("grid w-full grid-cols-[120px_minmax(0,1.4fr)_110px_120px_90px_96px] gap-3 px-4 py-4 text-left transition-colors", selected ? "bg-cyan-500/8" : "bg-ocean-900/70 hover:bg-ocean-850/70")}>
                        <div className="flex flex-col gap-1">
                          <span className="font-mono text-[10px] text-slate-500">{dataset.id}</span>
                          <span className="text-[10px] text-slate-600">{dataset.updated}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-100">{dataset.name}</p>
                          <p className="mt-1 flex items-center gap-2 text-[11px] text-slate-500"><FileSearch size={11} className="text-cyan-400" />Indexed for investigation joins and anomaly review</p>
                        </div>
                        <span className="text-xs text-slate-300">{dataset.category}</span>
                        <span className="text-xs text-slate-400">{dataset.region}</span>
                        <span className="font-mono text-xs text-slate-300">{dataset.records}</span>
                        <div className="flex items-start justify-start"><StatusBadge label={dataset.status} className={STATUS_STYLES[dataset.status]} /></div>
                      </button>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-surface-borderSubtle bg-ocean-900/70 px-4 py-3 text-[11px] text-slate-500">
                  <span>
                    Showing {datasets.length === 0 ? 0 : (pageInfo.page - 1) * pageInfo.pageSize + 1}
                    {" "}-{" "}
                    {Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.totalItems)} of {pageInfo.totalItems}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handlePageChange(pageInfo.page - 1)}
                      disabled={!canGoToPreviousPage || listStatus === "loading"}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Previous
                    </button>
                    <span className="font-mono text-[10px] text-slate-500">
                      Page {pageInfo.totalPages === 0 ? 0 : pageInfo.page}/{pageInfo.totalPages}
                    </span>
                    <button
                      type="button"
                      onClick={() => handlePageChange(pageInfo.page + 1)}
                      disabled={!canGoToNextPage || listStatus === "loading"}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Dataset Preview" subtitle="A fast look at the currently selected feed before deeper analysis." action={<button className="inline-flex items-center gap-2 rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/15"><Eye size={12} />Open full preview</button>}>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_280px]">
              <div className="rounded-2xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.14),_rgba(2,13,24,0)_38%),linear-gradient(180deg,rgba(6,27,48,0.94),rgba(4,20,37,0.96))] p-5">
                {selectedDetail ? (
                  <>
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.24em] text-cyan-400">Selected Dataset</p>
                        <h3 className="mt-2 text-lg font-semibold text-slate-100">{selectedDetail.name}</h3>
                        <p className="mt-2 text-sm leading-relaxed text-slate-400">Live blended observations tracking thermal front intensity across the reef boundary, optimized for fast anomaly checks and cross-feed joins.</p>
                        <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          <span>{selectedDetail.category}</span><span className="text-slate-700">•</span><span>{selectedDetail.region}</span><span className="text-slate-700">•</span><span>{selectedDetail.records} records</span>
                        </div>
                      </div>
                      <StatusBadge label={selectedDetail.status} className={STATUS_STYLES[selectedDetail.status]} />
                    </div>

                    {(detailStatus === "loading" || detailStatus === "not_found" || detailStatus === "error") && (
                      <div className="mt-4 flex flex-wrap items-center gap-2 text-[11px]">
                        {detailStatus === "loading" && <StatusBadge label="Loading dataset detail" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />}
                        {detailStatus === "not_found" && <StatusBadge label="Dataset not found" className="border-amber-500/25 bg-amber-500/10 text-amber-300" />}
                        {detailStatus === "error" && detailError && <StatusBadge label={detailError} className="border-rose-500/25 bg-rose-500/10 text-rose-300" />}
                      </div>
                    )}

                    <div className="mt-4">
                      <DebugBadge label="detail" meta={detailMeta} />
                    </div>

                    <div className="mt-6">
                      {detailStatus === "not_found" ? (
                        <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-5">
                          <p className="text-sm font-medium text-slate-100">Dataset detail unavailable</p>
                          <p className="mt-2 text-[11px] leading-relaxed text-slate-500">The selected dataset is no longer available in the current detail catalog.</p>
                        </div>
                      ) : (
                        <div className="flex h-48 items-end gap-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-4">
                          {previewSeries.map((point) => (
                            <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
                              <div className="flex h-full w-full items-end">
                                <div className="w-full rounded-t-md bg-gradient-to-t from-cyan-500 to-cyan-300" style={{ height: `${(point.value / maxValue) * 100}%` }} />
                              </div>
                              <span className="font-mono text-[10px] text-slate-500">{point.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/70 p-5">
                    <p className="text-sm font-medium text-slate-100">No dataset selected</p>
                    <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Adjust the filters or select a dataset from the catalog to load detail.</p>
                  </div>
                )}
              </div>
              <div className="space-y-3">
                <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Preview Metrics</p>
                  <div className="mt-3 space-y-3">
                    <div><p className="text-2xl font-semibold text-slate-100">97.4%</p><p className="text-[11px] text-slate-500">Completeness across active window</p></div>
                    <div><p className="text-2xl font-semibold text-slate-100">5 min</p><p className="text-[11px] text-slate-500">Median ingestion lag</p></div>
                    <div><p className="text-2xl font-semibold text-slate-100">14 grids</p><p className="text-[11px] text-slate-500">High-priority anomaly cells surfaced</p></div>
                  </div>
                </div>

                <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Related Records</p>
                    <BellDot size={14} className="text-cyan-400" />
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_120px_110px]">
                    <select
                      value={recordFilters.sortBy}
                      onChange={(event) =>
                        handleRecordSortByChange(event.target.value as DataExplorerRelatedRecordSortBy)
                      }
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records sort field"
                    >
                      <option value="updated">Sort: Updated</option>
                      <option value="title">Sort: Title</option>
                      <option value="status">Sort: Status</option>
                      <option value="type">Sort: Type</option>
                    </select>
                    <select
                      value={recordFilters.sortDir}
                      onChange={(event) => handleRecordSortDirChange(event.target.value as DataExplorerSortDirection)}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records sort direction"
                    >
                      <option value="desc">Desc</option>
                      <option value="asc">Asc</option>
                    </select>
                    <select
                      value={recordFilters.pageSize}
                      onChange={(event) => handleRecordPageSizeChange(Number.parseInt(event.target.value, 10))}
                      className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-xs text-slate-200 outline-none transition-colors focus:border-cyan-500/30"
                      aria-label="Related records page size"
                    >
                      <option value="2">2 / page</option>
                      <option value="5">5 / page</option>
                      <option value="10">10 / page</option>
                    </select>
                  </div>
                  <div className="mt-3">
                    <DebugBadge label="records" meta={recordsMeta} />
                  </div>
                  {recordsStatus === "loading" && <div className="mt-3"><StatusBadge label="Loading related records" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" /></div>}
                  {recordsStatus === "not_found" && <div className="mt-3 rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-4"><p className="text-xs font-medium text-slate-100">Dataset not found</p><p className="mt-2 text-[11px] leading-relaxed text-slate-500">Related records are unavailable because the selected dataset detail no longer exists.</p></div>}
                  {recordsStatus === "error" && <div className="mt-3 rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-4"><p className="text-xs font-medium text-slate-100">Related records unavailable</p><p className="mt-2 text-[11px] leading-relaxed text-slate-500">{recordsError ?? "The related records request failed. Try selecting the dataset again."}</p></div>}
                  {recordsStatus === "empty" && (
                    <div className="mt-3 rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/60 p-4">
                      <p className="text-xs font-medium text-slate-100">
                        {recordsDegraded ? "Related records unavailable in degraded mode" : "No related records yet"}
                      </p>
                      <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                        {recordsDegraded
                          ? `The related-record repository is currently degraded (${recordsDegradedReason}).`
                          : "No linked records were returned for the currently selected dataset."}
                      </p>
                    </div>
                  )}
                  {recordsStatus === "idle" && relatedRecords.length > 0 && (
                    <div className="mt-3 space-y-3">
                      {relatedRecords.map((record) => (
                        <div key={record.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-900/70 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-mono text-[10px] text-slate-500">{record.id}</p>
                              <p className="mt-1 text-xs font-medium text-slate-100">{record.title}</p>
                            </div>
                            <StatusBadge label={record.status} className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-slate-500"><span>{record.type}</span><span className="text-slate-700">•</span><span>{record.updated}</span></div>
                          {record.summary && <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{record.summary}</p>}
                        </div>
                      ))}
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-surface-borderSubtle bg-ocean-900/70 px-3 py-2 text-[11px] text-slate-500">
                        <span>
                          Showing {relatedRecords.length === 0 ? 0 : (recordsPageInfo.page - 1) * recordsPageInfo.pageSize + 1}
                          {" "}-{" "}
                          {Math.min(recordsPageInfo.page * recordsPageInfo.pageSize, recordsPageInfo.totalItems)} of {recordsPageInfo.totalItems}
                        </span>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleRecordPageChange(recordsPageInfo.page - 1)}
                            disabled={!canGoToPreviousRecordsPage}
                            className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Previous records
                          </button>
                          <span className="font-mono text-[10px] text-slate-500">
                            Page {recordsPageInfo.totalPages === 0 ? 0 : recordsPageInfo.page}/{recordsPageInfo.totalPages}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRecordPageChange(recordsPageInfo.page + 1)}
                            disabled={!canGoToNextRecordsPage}
                            className="rounded-xl border border-surface-borderSubtle bg-ocean-850 px-3 py-1.5 text-[11px] text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Next records
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="rounded-xl border border-dashed border-cyan-500/25 bg-cyan-500/5 p-4">
                  <div className="flex items-start gap-3">
                    <Waves size={16} className="mt-0.5 text-cyan-400" />
                    <div>
                      <p className="text-xs font-medium text-slate-200">Suggested next step</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Compare this feed against dissolved oxygen outliers before promoting it to the investigation evidence stack.</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Metadata" subtitle="Operational context for the selected dataset." action={<Database size={14} className="text-cyan-400" />} className="h-fit">
            <div className="space-y-3">
              {detailStatus === "not_found" ? (
                <div className="rounded-xl border border-dashed border-amber-500/25 bg-amber-500/5 p-4">
                  <p className="text-xs font-medium text-slate-100">Dataset not found</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Metadata could not be loaded because the selected dataset detail no longer exists.</p>
                </div>
              ) : detailStatus === "error" ? (
                <div className="rounded-xl border border-dashed border-rose-500/25 bg-rose-500/5 p-4">
                  <p className="text-xs font-medium text-slate-100">Detail unavailable</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">{detailError ?? "The dataset detail request failed. Try selecting the dataset again."}</p>
                </div>
              ) : detailMetadata.length > 0 ? (
                detailMetadata.map((item) => (
                  <div key={item.label} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{item.label}</p>
                    <p className="mt-2 text-xs leading-relaxed text-slate-200">{item.value}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/40 p-4">
                  <p className="text-xs font-medium text-slate-100">No metadata available</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Select a dataset to inspect operational context.</p>
                </div>
              )}
            </div>
          </Panel>

          <Panel title="AI Summary" subtitle="Machine-assisted readout of the active dataset." action={<Bot size={14} className="text-violet-400" />} className="h-fit">
            <div className="space-y-3">
              <div className="rounded-xl border border-violet-500/25 bg-violet-500/10 p-4">
                <div className="flex items-center gap-2"><Sparkles size={14} className="text-violet-400" /><p className="text-xs font-medium text-slate-100">OceanGPT assistant</p></div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-400">This dataset is a strong candidate for anomaly triage and temporal comparison because it combines stable cadence with high cross-source agreement.</p>
              </div>
              {summarySignals.map((signal) => (
                <div key={signal.title} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs font-medium text-slate-100">{signal.title}</p>
                    <StatusBadge label="Active" className={TONE_STYLES[signal.tone]} />
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{signal.detail}</p>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
