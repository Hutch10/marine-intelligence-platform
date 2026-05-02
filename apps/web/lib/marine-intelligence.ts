import type {
  DashboardAnomalySummary,
  LiveMarineCondition,
  ReefStressWatchItem,
  SignalDetection,
} from "@/lib/api/types";
import { getFeedHealth, getFeedHealthDiagnostics, type FeedHealthStatus, type FeedStationDiagnostics } from "@/lib/feed-health";
import {
  getMarineRegionConfig,
  listMarineRegionConfigs,
} from "@marine/shared";
import type { PlatformHealthOverview } from "@marine/shared";
import { SystemIntegrityStatus } from "@/lib/integrity-constants";

// ─── API base URL ─────────────────────────────────────────────────────────────

function getApiBase(): string {
  return (
    process.env.NEXT_PUBLIC_MARINE_API_URL
    ?? process.env.MARINE_API_BASE_URL
    ?? "http://localhost:4000"
  ).replace(/\/$/, "");
}

const FETCH_TIMEOUT_MS = 5000;

// ─── HTTP client ──────────────────────────────────────────────────────────────

type ApiResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; status: number; message: string };

async function fetchMarineApi<T>(path: string): Promise<ApiResult<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`${getApiBase()}${path}`, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    });

    clearTimeout(timer);

    if (response.status >= 500) {
      return {
        ok: false,
        status: response.status,
        message: `Marine API returned ${response.status}`,
      };
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return {
        ok: false,
        status: response.status,
        message: "Marine API returned a malformed response",
      };
    }

    if (!response.ok) {
      const message =
        typeof body === "object" && body !== null && "message" in body
          ? String((body as { message: unknown }).message)
          : "Marine API request failed";
      return { ok: false, status: response.status, message };
    }

    return { ok: true, data: body as T, status: response.status };
  } catch (error) {
    clearTimeout(timer);
    if (error instanceof Error && error.name === "AbortError") {
      return { ok: false, status: 504, message: "Marine API request timed out" };
    }
    return { ok: false, status: 503, message: "Marine API is unreachable" };
  }
}

// ─── V1 API response shapes ───────────────────────────────────────────────────
// These mirror the JSON contracts served by apps/api. Defined here as HTTP
// response types — not as imports from the API source — to enforce the
// service boundary.

export interface V1RiskAssessment {
  stationId: string;
  evaluatedAt: string;
  riskLevel: "low" | "medium" | "high" | "critical";
  summary: string;
  conditions: {
    observedAt: string;
    seaSurfaceTemperatureC: number | null;
    waveHeightM: number | null;
    windSpeedMps: number | null;
    pressureHpa: number | null;
  };
  alerts: Array<{
    severity: "warning" | "critical";
    title: string;
    detail: string;
  }>;
  signals: Array<{
    metric: string;
    unit: string;
    currentValue: number | null;
    anomalyScore: number | null;
    direction: string;
  }>;
  baselineCoverage: {
    score: number;
    quality: "high" | "medium" | "low";
    historicalDataPoints: number;
    coverageNote: string;
  };
  sovereignVerification?: {
    status: IntegrityStatus;
    claimId: string;
    contradictions: string[];
    verifiedAt: string;
  };
}

interface V1RegionRiskResponse {
  regionId: string;
  regionName: string;
  evaluatedAt: string;
  riskLevel: "low" | "medium" | "high" | "critical" | "insufficient_data";
  summary: string;
  dominantDrivers: string[];
  topStations: Array<{ stationId: string; riskLevel: "low" | "medium" | "high" | "critical" }>;
  coverage: {
    configuredStations: number;
    analyzedStations: number;
    healthyStations: number;
    minimumHealthyStations: number;
  };
  confidence: { score: number; quality: "high" | "medium" | "low" };
}

interface V1RegionRiskTrendResponse {
  regionId: string;
  regionName: string;
  evaluatedAt: string;
  currentRisk: {
    riskLevel: "low" | "medium" | "high" | "critical";
    confidenceScore: number;
  };
  trend: {
    direction: "rising" | "falling" | "stable";
    strength: "weak" | "moderate" | "strong";
    deltaScore: number;
    persistence: number;
  };
  forecast: {
    next12h: { riskLevel: "low" | "medium" | "high" | "critical"; confidence: number };
    next24h: { riskLevel: "low" | "medium" | "high" | "critical"; confidence: number };
  };
  summary: string;
}

// ─── Domain interfaces ────────────────────────────────────────────────────────

export interface MarineRegionLink {
  id: string;
  name: string;
}

export interface SurfaceStatus {
  source: "live" | "fallback" | "derived";
  label: string;
  detail: string;
  fallbackReason: string | null;
  updatedAt: string | null;
  freshnessLabel: string | null;
  isStale: boolean;
}

export interface DashboardMetricCard {
  label: string;
  value: string;
  caption: string;
  tone: "neutral" | "info" | "warning" | "critical";
  href: string | null;
}

export interface DashboardQuickLink {
  label: string;
  description: string;
  href: string;
}

export interface DashboardTruthNotice {
  title: string;
  detail: string;
  tone: "info" | "warning";
}

export interface RegionRiskPageData {
  regionId: string;
  regionName: string;
  evaluatedAt: string;
  riskLevel: "low" | "medium" | "high" | "critical" | "insufficient_data";
  summary: string;
  dominantDrivers: string[];
  topStations: Array<{
    stationId: string;
    riskLevel: "low" | "medium" | "high" | "critical";
  }>;
  coverage: {
    configuredStations: number;
    analyzedStations: number;
    healthyStations: number;
    minimumHealthyStations: number;
  };
  confidence: {
    score: number;
    quality: "high" | "medium" | "low";
  };
  provenance: SurfaceStatus;
  coverageWarning: string | null;
}

export interface RegionRiskTrendPageData {
  regionId: string;
  regionName: string;
  evaluatedAt: string;
  currentRisk: {
    riskLevel: "low" | "medium" | "high" | "critical";
    confidenceScore: number;
  };
  trend: {
    direction: "rising" | "falling" | "stable";
    strength: "weak" | "moderate" | "strong";
    deltaScore: number;
    persistence: number;
  };
  forecast: {
    next12h: {
      riskLevel: "low" | "medium" | "high" | "critical";
      confidence: number;
    };
    next24h: {
      riskLevel: "low" | "medium" | "high" | "critical";
      confidence: number;
    };
  };
  summary: string;
  provenance: SurfaceStatus;
  forecastMethod: string;
  coverageWarning: string | null;
}

export interface DashboardMarineSurfaceData {
  metrics: DashboardMetricCard[];
  anomalySummary: DashboardAnomalySummary;
  anomalySummaryLinks: {
    totalHref: string;
    elevatedHref: string;
    criticalHref: string | null;
    regionsHref: string | null;
  };
  anomalySummaryStatus: SurfaceStatus;
  anomalyInvestigationPrefill: InvestigationCreatePrefillData | null;
  prioritizedSignals: SignalDetection[];
  signalCenterStatus: SurfaceStatus;
  liveConditions: LiveMarineCondition[];
  liveConditionsStatus: SurfaceStatus;
  reefAlerts: ReefStressWatchItem[];
  reefAlertsStatus: SurfaceStatus;
  primaryRegion: MarineRegionLink | null;
  quickLinks: DashboardQuickLink[];
  notices: DashboardTruthNotice[];
  feedHealth: FeedHealthStatus;
  stationIngestionDiagnostics: FeedStationDiagnostics[];
}

export interface InvestigationCreatePrefillData {
  eventId: string | null;
  title: string;
  sourceType: "signal" | "anomaly" | null;
  region: string | null;
  detectedAt: string | null;
  stationId: string | null;
  relatedStations: string[];
}

export interface InvestigationLiveSummary {
  anomalySummary: DashboardAnomalySummary;
  openSignalCount: number;
  primaryRegion: MarineRegionLink | null;
  trustNote: string;
  signals: SignalDetection[];
}

export interface StationRiskPageData extends V1RiskAssessment {
  provenance: SurfaceStatus;
  freshness: {
    observedAgeHours: number | null;
    evaluatedAgeHours: number | null;
    stale: boolean;
    label: string;
  };
  dataQuality: {
    missingMetrics: string[];
    warning: string | null;
    actionability: string;
  };
  sovereignVerification?: {
    status: IntegrityStatus;
    claimId: string;
    contradictions: string[];
    verifiedAt: string;
  };
}

export interface RecentAnomalyEvidenceItem {
  id: string;
  stationId: string | null;
  detectedAt: string;
  detectedAtLabel: string | null;
  signalType: string;
  signalTypeLabel: string;
  severity: "low" | "medium" | "high" | "critical";
  deviation: string;
  description: string;
  evidenceSummary: string | null;
}

export interface RecentAnomalyEvidenceData {
  state: "available" | "unavailable";
  windowDays: number;
  summaryLine: string;
  exportHref: string | null;
  exportFileName: string | null;
  anomalies: RecentAnomalyEvidenceItem[];
}

interface PublicAnomalyItem {
  id: string;
  stationId: string | null;
  signalType: string;
  severity: "low" | "medium" | "high" | "critical";
  status: string;
  title: string;
  summary: string;
  detectedAt: string;
  provenance?: {
    evidenceSummary?: string;
  };
}

interface DataResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  message: string | null;
}

// ─── Internal data readers ────────────────────────────────────────────────────

async function readLiveConditions(): Promise<{ conditions: LiveMarineCondition[]; apiOk: boolean }> {
  const result = await fetchMarineApi<{ conditions: LiveMarineCondition[] }>("/live-conditions");
  if (!result.ok || !Array.isArray(result.data.conditions)) {
    return { conditions: [], apiOk: false };
  }
  return { conditions: result.data.conditions, apiOk: true };
}

async function readReefAlerts(): Promise<{ alerts: ReefStressWatchItem[]; apiOk: boolean }> {
  const result = await fetchMarineApi<{ alerts: ReefStressWatchItem[] }>("/reef-alerts");
  if (!result.ok || !Array.isArray(result.data.alerts)) {
    return { alerts: [], apiOk: false };
  }
  return { alerts: result.data.alerts, apiOk: true };
}

async function readSignals(limit = 8): Promise<SignalDetection[]> {
  const result = await fetchMarineApi<{ signals: SignalDetection[] }>(
    `/signals?status=open&limit=${limit}`,
  );
  if (!result.ok || !Array.isArray(result.data.signals)) {
    return [];
  }
  return result.data.signals;
}

async function readAnomalies(limit = 200): Promise<PublicAnomalyItem[]> {
  const result = await fetchMarineApi<{ anomalies: PublicAnomalyItem[] }>(
    `/anomalies?limit=${limit}`,
  );
  if (!result.ok || !Array.isArray(result.data.anomalies)) {
    return [];
  }
  return result.data.anomalies;
}

const RECENT_ANOMALY_WINDOW_DAYS = 14;
const RECENT_ANOMALY_SUMMARY_WINDOW_HOURS = 48;
const RECENT_ANOMALY_LIMIT = 200;

async function readRecentAnomalies(
  input: { stationId?: string; since: string; limit?: number },
): Promise<ApiResult<{ anomalies: PublicAnomalyItem[] }>> {
  const params = new URLSearchParams();
  params.set("since", input.since);
  params.set("limit", String(input.limit ?? RECENT_ANOMALY_LIMIT));

  if (input.stationId) {
    params.set("stationId", input.stationId);
  }

  return fetchMarineApi<{ anomalies: PublicAnomalyItem[] }>(`/anomalies?${params.toString()}`);
}

// ─── Timestamp helpers ────────────────────────────────────────────────────────

function parseIso(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatUtcTimestamp(value: string | null | undefined): string | null {
  const timestamp = parseIso(value);

  if (timestamp === null) {
    return null;
  }

  return new Date(timestamp).toISOString().slice(0, 16).replace("T", " ") + " UTC";
}

function formatAgeLabel(hours: number | null): string | null {
  if (hours === null) {
    return null;
  }

  if (hours < 1) {
    return "under 1h old";
  }

  if (hours < 24) {
    return `${Math.round(hours)}h old`;
  }

  return `${Math.round(hours / 24)}d old`;
}

function formatSignalTypeLabel(signalType: string): string {
  return signalType
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

function escapeCsvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

function buildRecentAnomalySummaryLine(anomalies: PublicAnomalyItem[], windowDays: number): string {
  if (anomalies.length === 0) {
    return `No anomalies in past ${windowDays} days`;
  }

  const cutoffMs = Date.now() - (RECENT_ANOMALY_SUMMARY_WINDOW_HOURS * 60 * 60 * 1000);
  const recentCount = anomalies.filter((item) => {
    const detectedAt = parseIso(item.detectedAt);
    return detectedAt !== null && detectedAt >= cutoffMs;
  }).length;

  if (recentCount > 0) {
    return `${recentCount} ${recentCount === 1 ? "anomaly" : "anomalies"} detected in past 48 hours`;
  }

  return `No anomalies in past 48 hours. ${anomalies.length} detected in past ${windowDays} days`;
}

function toRecentAnomalyEvidenceItem(item: PublicAnomalyItem): RecentAnomalyEvidenceItem {
  return {
    id: item.id,
    stationId: item.stationId,
    detectedAt: item.detectedAt,
    detectedAtLabel: formatUtcTimestamp(item.detectedAt),
    signalType: item.signalType,
    signalTypeLabel: formatSignalTypeLabel(item.signalType),
    severity: item.severity,
    deviation: item.title,
    description: item.summary,
    evidenceSummary: item.provenance?.evidenceSummary ?? null,
  };
}

function buildRecentAnomalyCsv(items: RecentAnomalyEvidenceItem[]): string {
  const header = [
    "detected_at",
    "station_id",
    "signal_type",
    "severity",
    "deviation",
    "description",
    "evidence_summary",
  ];
  const rows = items.map((item) => [
    item.detectedAt,
    item.stationId ?? "",
    item.signalType,
    item.severity,
    item.deviation,
    item.description,
    item.evidenceSummary ?? "",
  ]);

  return [header, ...rows]
    .map((row) => row.map((value) => escapeCsvField(value)).join(","))
    .join("\n");
}

function buildRecentAnomalyEvidenceData(
  anomalies: PublicAnomalyItem[],
  windowDays: number,
  exportFileName: string,
): RecentAnomalyEvidenceData {
  const items = anomalies
    .slice()
    .sort((left, right) => (parseIso(right.detectedAt) ?? 0) - (parseIso(left.detectedAt) ?? 0))
    .map(toRecentAnomalyEvidenceItem);

  return {
    state: "available",
    windowDays,
    summaryLine: buildRecentAnomalySummaryLine(anomalies, windowDays),
    exportHref: items.length > 0
      ? `data:text/csv;charset=utf-8,${encodeURIComponent(buildRecentAnomalyCsv(items))}`
      : null,
    exportFileName: items.length > 0 ? exportFileName : null,
    anomalies: items,
  };
}

function computeAgeHours(value: string | null | undefined): number | null {
  const timestamp = parseIso(value);

  if (timestamp === null) {
    return null;
  }

  return Math.max(0, (Date.now() - timestamp) / (60 * 60 * 1000));
}

function buildSurfaceStatus(input: {
  source: "live" | "fallback" | "derived";
  detail: string;
  fallbackReason?: string | null;
  updatedAt?: string | null;
  staleAfterHours?: number;
}): SurfaceStatus {
  const ageHours = computeAgeHours(input.updatedAt ?? null);
  const staleAfterHours = input.staleAfterHours ?? 12;
  const isStale = ageHours !== null && ageHours > staleAfterHours;

  return {
    source: input.source,
    label:
      input.source === "live"
        ? "Live API-backed"
        : input.source === "fallback"
          ? "Fallback data"
          : "Derived summary",
    detail: input.detail,
    fallbackReason: input.fallbackReason ?? null,
    updatedAt: input.updatedAt ?? null,
    freshnessLabel: formatAgeLabel(ageHours),
    isStale,
  };
}

// ─── Derived computations ─────────────────────────────────────────────────────

function riskLevelWeight(level: "low" | "medium" | "high" | "critical" | "insufficient_data"): number {
  switch (level) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}

function buildPrimaryRegion(regionResponses: RegionRiskPageData[]): MarineRegionLink | null {
  const topRegion = [...regionResponses].sort((left, right) => {
    const riskDelta = riskLevelWeight(right.riskLevel) - riskLevelWeight(left.riskLevel);

    if (riskDelta !== 0) {
      return riskDelta;
    }

    return right.confidence.score - left.confidence.score;
  })[0];

  if (!topRegion) {
    return null;
  }

  return {
    id: topRegion.regionId,
    name: topRegion.regionName,
  };
}

function buildAnomalySummary(
  anomalies: PublicAnomalyItem[],
  regionResponses: RegionRiskPageData[],
  primaryTrend: RegionRiskTrendPageData | null,
): DashboardAnomalySummary {
  return {
    totalAnomalies: anomalies.length,
    elevatedAnomalies: anomalies.filter((signal) => signal.severity === "high" || signal.severity === "medium").length,
    criticalAnomalies: anomalies.filter((signal) => signal.severity === "critical").length,
    regionsAffected: regionResponses.filter((region) => region.riskLevel !== "low" && region.riskLevel !== "insufficient_data").length,
    trendDirection:
      primaryTrend?.trend.direction === "rising"
        ? "up"
        : primaryTrend?.trend.direction === "falling"
          ? "down"
          : "flat",
  };
}

function buildMetricCards(input: {
  anomalySummary: DashboardAnomalySummary;
  openSignalCount: number;
  liveConditionCount: number;
  reefAlertCount: number;
  primaryRegion: MarineRegionLink | null;
}): DashboardMetricCard[] {
  return [
    {
      label: "Anomalies",
      value: String(input.anomalySummary.totalAnomalies),
      caption: "public anomaly feed records",
      tone: input.anomalySummary.criticalAnomalies > 0 ? "critical" : "warning",
      href: "/investigations",
    },
    {
      label: "Open signals",
      value: String(input.openSignalCount),
      caption: "persisted detection records",
      tone: input.openSignalCount > 0 ? "info" : "neutral",
      href: "/investigations",
    },
    {
      label: "Live stations",
      value: String(input.liveConditionCount),
      caption: "station condition snapshots shown below",
      tone: input.liveConditionCount > 0 ? "info" : "neutral",
      href: input.liveConditionCount > 0 && input.primaryRegion
        ? `/v1/regions/${input.primaryRegion.id}/risk`
        : null,
    },
    {
      label: "Reef regions",
      value: String(input.reefAlertCount),
      caption: "CRW stress records shown below",
      tone: input.reefAlertCount > 0 ? "warning" : "neutral",
      href: input.primaryRegion ? `/v1/regions/${input.primaryRegion.id}/risk/trend` : null,
    },
  ];
}

async function listRegionRisks(): Promise<RegionRiskPageData[]> {
  const results = await Promise.all(
    listMarineRegionConfigs().map((region) => getRegionRiskAssessment(region.id)),
  );
  return results
    .filter((result): result is { ok: true; data: RegionRiskPageData; status: number; message: null } =>
      result.ok && result.data !== null,
    )
    .map((result) => result.data);
}

function buildCoverageWarning(coverage: RegionRiskPageData["coverage"]): string | null {
  if (coverage.healthyStations < coverage.minimumHealthyStations) {
    return `Coverage is weak: ${coverage.healthyStations} healthy stations are available, below the minimum ${coverage.minimumHealthyStations}.`;
  }

  if (coverage.analyzedStations < coverage.configuredStations) {
    return `${coverage.analyzedStations} of ${coverage.configuredStations} configured stations are contributing to this regional score.`;
  }

  return null;
}

function buildStationMissingMetrics(assessment: V1RiskAssessment): string[] {
  const missing: string[] = [];

  if (assessment.conditions.seaSurfaceTemperatureC === null) missing.push("Sea surface temperature");
  if (assessment.conditions.waveHeightM === null) missing.push("Wave height");
  if (assessment.conditions.windSpeedMps === null) missing.push("Wind speed");
  if (assessment.conditions.pressureHpa === null) missing.push("Pressure");

  return missing;
}

function buildStationActionability(assessment: V1RiskAssessment): string {
  if (assessment.alerts.length > 0) {
    return "Review the active threshold alerts first, then inspect the per-metric anomaly breakdown before escalating.";
  }

  if (assessment.signals.length > 0) {
    return "No hard threshold is active. Use the anomaly breakdown to decide whether this is drift, corroborated change, or a monitoring-only condition.";
  }

  return "No signal-level context was returned. Treat this station as informational only until metric-level evidence is available.";
}

// ─── Region config helpers (static — no HTTP required) ───────────────────────

function shouldSuppressConfigOnlyRegionsInTruthMode(): boolean {
  if (process.env.NODE_ENV !== "production") {
    return false;
  }

  return String(process.env.MARINE_ALLOW_CONFIG_ONLY_TRUTH_ENTITIES ?? "false").trim().toLowerCase() !== "true";
}

export function getMarineRegionForStation(stationId: string | null | undefined): MarineRegionLink | null {
  if (!stationId) {
    return null;
  }

  if (shouldSuppressConfigOnlyRegionsInTruthMode()) {
    return null;
  }

  const match = listMarineRegionConfigs().find((region) => region.stationIds.includes(stationId));

  return match ? { id: match.id, name: match.name } : null;
}

export function getMarineRegionByName(regionName: string | null | undefined): MarineRegionLink | null {
  if (!regionName) {
    return null;
  }

  if (shouldSuppressConfigOnlyRegionsInTruthMode()) {
    return null;
  }

  const normalizedName = regionName.trim().toLowerCase();
  const match = listMarineRegionConfigs().find((region) => region.name.trim().toLowerCase() === normalizedName);

  return match ? { id: match.id, name: match.name } : null;
}

export function getSignalDetailHref(signal: SignalDetection): string | null {
  if (signal.stationId) {
    return `/v1/risk/${encodeURIComponent(signal.stationId)}`;
  }

  const region = getMarineRegionByName(signal.region);
  return region ? `/v1/regions/${encodeURIComponent(region.id)}/risk` : null;
}

// ─── Public data functions ────────────────────────────────────────────────────

export async function getSystemHealth(): Promise<PlatformHealthOverview> {
  const result = await fetchMarineApi<{ status?: string }>("/health");
  const systemIntegrity = result.ok
    ? SystemIntegrityStatus.NORMAL
    : SystemIntegrityStatus.DEGRADED;

  return {
    overallStatus: systemIntegrity === SystemIntegrityStatus.NORMAL ? "healthy" : "degraded",
    sources: [],
    activeAlerts: 0,
    updatedAt: new Date().toISOString(),
    systemIntegrity,
    partitionPurity: systemIntegrity === SystemIntegrityStatus.NORMAL ? "100.0%" : "0.0%",
    partitionPurityRatio: systemIntegrity === SystemIntegrityStatus.NORMAL ? 1 : 0,
  };
}

export async function getDashboardMarineSurfaceData(): Promise<DashboardMarineSurfaceData> {
  // CONTRACT-LEVEL FIX: Only emit investigation links if canonical investigation exists
  const [liveConditionsResult, reefAlertsResult, prioritizedSignals, anomalies, investigations] =
    await Promise.all([
      readLiveConditions(),
      readReefAlerts(),
      readSignals(8),
      readAnomalies(200),
      (await import("@/lib/server/investigations")).listInvestigations(),
    ]);

  const liveConditions = liveConditionsResult.conditions;
  const reefAlerts = reefAlertsResult.alerts;
  const regionRisks = await listRegionRisks();
  const primaryRegion = buildPrimaryRegion(regionRisks);
  const primaryTrend = primaryRegion ? (await getRegionRiskTrend(primaryRegion.id)).data : null;
  const anomalySummary = buildAnomalySummary(anomalies, regionRisks, primaryTrend);
  const firstAnomaly = anomalies[0] ?? null;
  const anomalyRegion = firstAnomaly?.stationId
    ? getMarineRegionForStation(firstAnomaly.stationId)?.name ?? null
    : null;
  const anomalyInvestigationPrefill: InvestigationCreatePrefillData | null = firstAnomaly
    ? {
        eventId: firstAnomaly.id,
        title: firstAnomaly.title,
        sourceType: "anomaly",
        region: anomalyRegion,
        detectedAt: firstAnomaly.detectedAt,
        stationId: firstAnomaly.stationId,
        relatedStations: firstAnomaly.stationId ? [firstAnomaly.stationId] : [],
      }
    : null;

  const latestConditionTimestamp = [...liveConditions]
    .map((condition) => condition.timestamp)
    .sort()
    .at(-1) ?? null;
  const latestReefTimestamp = [...reefAlerts]
    .map((alert) => alert.timestamp)
    .sort()
    .at(-1) ?? null;

  const liveConditionsStatus = buildSurfaceStatus({
    source: liveConditionsResult.apiOk ? "live" : "fallback",
    detail: liveConditionsResult.apiOk
      ? "Station conditions served by the Marine Intelligence API."
      : "Station conditions unavailable — Marine API did not respond.",
    updatedAt: latestConditionTimestamp,
    staleAfterHours: 8,
  });

  const reefAlertsStatus = buildSurfaceStatus({
    source: reefAlertsResult.apiOk ? "live" : "fallback",
    detail: reefAlertsResult.apiOk
      ? "CRW stress records served by the Marine Intelligence API."
      : "Reef stress feed unavailable — Marine API did not respond.",
    updatedAt: latestReefTimestamp,
    staleAfterHours: 24,
  });

  const anomalySummaryStatus = buildSurfaceStatus({
    source: "derived",
    detail: "Summary counts are derived from the public anomaly feed and the configured regional risk responses shown downstream.",
    updatedAt: primaryTrend?.evaluatedAt ?? latestConditionTimestamp ?? latestReefTimestamp,
    staleAfterHours: 8,
  });

  const signalCenterStatus = buildSurfaceStatus({
    source: prioritizedSignals.length > 0 ? "live" : "derived",
    detail:
      prioritizedSignals.length > 0
        ? "Cards below use persisted signal detections only. No values are fabricated in the UI."
        : "No persisted signal detections were found in the database. The signal center is empty.",
    updatedAt: prioritizedSignals[0]?.detectedAt ?? null,
    staleAfterHours: 12,
  });

  const feedHealth = getFeedHealth();
  const stationIngestionDiagnostics = getFeedHealthDiagnostics();
  const notices: DashboardTruthNotice[] = [];

  if (!liveConditionsResult.apiOk) {
    notices.push({
      title: "Station conditions unavailable",
      detail: liveConditionsStatus.detail,
      tone: "warning",
    });
  } else if (feedHealth.ndbc.status === "stale") {
    notices.push({
      title: `NDBC data is stale — last ingested ${feedHealth.ndbc.ageLabel ?? "unknown time"} ago`,
      detail: "Station conditions are being served from the last successful ingestion. Run pnpm --filter api ingest:live to refresh.",
      tone: "warning",
    });
  } else if (feedHealth.ndbc.status === "failed") {
    notices.push({
      title: "NDBC ingestion has not run recently",
      detail: feedHealth.dbAvailable
        ? `Last NDBC ingestion completed ${feedHealth.ndbc.ageLabel ?? "more than 24 hours"} ago or ended in failure. Station data may be severely out of date.`
        : "No ingestion history found. Run pnpm --filter api ingest:live to populate station data.",
      tone: "warning",
    });
  }

  if (liveConditionsResult.apiOk) {
    if (feedHealth.ioos.status === "stale") {
      notices.push({
        title: `IOOS data is stale — last ingested ${feedHealth.ioos.ageLabel ?? "unknown time"} ago`,
        detail: "Auxiliary station metrics are being served from the last successful ingestion. Run pnpm --filter api ingest:live to refresh.",
        tone: "warning",
      });
    } else if (feedHealth.ioos.status === "failed") {
      notices.push({
        title: "IOOS ingestion has not run recently",
        detail: feedHealth.ioos.ageLabel
          ? `Last IOOS ingestion completed ${feedHealth.ioos.ageLabel} ago or ended in failure. Auxiliary metrics may be out of date.`
          : "No recent IOOS ingestion metadata is available. Auxiliary metrics may be out of date.",
        tone: "warning",
      });
    } else if (feedHealth.ioos.status === "unknown") {
      notices.push({
        title: "IOOS ingestion has not run yet",
        detail: "No IOOS ingestion metadata found. Run pnpm --filter api ingest:live to start auxiliary source tracking.",
        tone: "warning",
      });
    }

    if (feedHealth.erddap.status === "stale") {
      notices.push({
        title: `ERDDAP data is stale — last ingested ${feedHealth.erddap.ageLabel ?? "unknown time"} ago`,
        detail: "Auxiliary station metrics are being served from the last successful ingestion. Run pnpm --filter api ingest:live to refresh.",
        tone: "warning",
      });
    } else if (feedHealth.erddap.status === "failed") {
      notices.push({
        title: "ERDDAP ingestion has not run recently",
        detail: feedHealth.erddap.ageLabel
          ? `Last ERDDAP ingestion completed ${feedHealth.erddap.ageLabel} ago or ended in failure. Auxiliary metrics may be out of date.`
          : "No recent ERDDAP ingestion metadata is available. Auxiliary metrics may be out of date.",
        tone: "warning",
      });
    } else if (feedHealth.erddap.status === "unknown") {
      notices.push({
        title: "ERDDAP ingestion has not run yet",
        detail: "No ERDDAP ingestion metadata found. Run pnpm --filter api ingest:live to start auxiliary source tracking.",
        tone: "warning",
      });
    }
  }

  if (!reefAlertsResult.apiOk) {
    notices.push({
      title: "Reef stress feed unavailable",
      detail: reefAlertsStatus.detail,
      tone: "warning",
    });
  } else if (feedHealth.crw.status === "stale") {
    notices.push({
      title: `CRW data is stale — last ingested ${feedHealth.crw.ageLabel ?? "unknown time"} ago`,
      detail: "Reef stress records are being served from the last successful ingestion. Run pnpm --filter api ingest:live to refresh.",
      tone: "warning",
    });
  } else if (feedHealth.crw.status === "failed") {
    notices.push({
      title: "CRW ingestion has not run recently",
      detail: feedHealth.dbAvailable
        ? `Last CRW ingestion completed ${feedHealth.crw.ageLabel ?? "more than 24 hours"} ago or ended in failure. Reef stress data may be severely out of date.`
        : "No ingestion history found. Run pnpm --filter api ingest:live to populate reef stress data.",
      tone: "warning",
    });
  }

  // Find a canonical investigation ID if available
  const canonicalInvestigation = Array.isArray(investigations) && investigations.length > 0 ? investigations[0] : null;

  return {
    metrics: buildMetricCards({
      anomalySummary,
      openSignalCount: prioritizedSignals.filter((signal) => signal.status === "open").length,
      liveConditionCount: liveConditions.length,
      reefAlertCount: reefAlerts.length,
      primaryRegion,
    }),
    anomalySummary,
    anomalySummaryLinks: {
      totalHref: "/investigations",
      elevatedHref: primaryRegion ? `/v1/regions/${primaryRegion.id}/risk` : "/investigations",
      // Only emit a criticalHref if a canonical investigation exists
      criticalHref: canonicalInvestigation ? `/investigations/${canonicalInvestigation.id}` : null,
      regionsHref: primaryRegion ? `/v1/regions/${primaryRegion.id}/risk/trend` : null,
    },
    anomalySummaryStatus,
    anomalyInvestigationPrefill,
    prioritizedSignals,
    signalCenterStatus,
    liveConditions,
    liveConditionsStatus,
    reefAlerts,
    reefAlertsStatus,
    primaryRegion,
    quickLinks: [
      {
        label: "Anomaly Feed",
        description: "Review live anomaly records and open signals.",
        href: "/investigations",
      },
      ...(primaryRegion ? [{
        label: `${primaryRegion.name} risk`,
        description: "Open the live regional risk assessment.",
        href: `/v1/regions/${primaryRegion.id}/risk`,
      }] : []),
      ...(primaryRegion ? [{
        label: `${primaryRegion.name} trend`,
        description: "Open the rule-based regional trend and forecast view.",
        href: `/v1/regions/${primaryRegion.id}/risk/trend`,
      }] : []),
      ...(liveConditions[0] ? [{
        label: `Station ${liveConditions[0].stationId}`,
        description: "Open the most recent station risk page in the current list.",
        href: `/v1/risk/${encodeURIComponent(liveConditions[0].stationId)}`,
      }] : []),
    ],
    notices,
    feedHealth,
    stationIngestionDiagnostics,
  };
}

export async function getInvestigationLiveSummary(): Promise<InvestigationLiveSummary> {
  const [prioritizedSignals, anomalies] = await Promise.all([
    readSignals(8),
    readAnomalies(200),
  ]);
  const regionRisks = await listRegionRisks();
  const primaryRegion = buildPrimaryRegion(regionRisks);
  const primaryTrend = primaryRegion ? (await getRegionRiskTrend(primaryRegion.id)).data : null;

  return {
    anomalySummary: buildAnomalySummary(anomalies, regionRisks, primaryTrend),
    openSignalCount: prioritizedSignals.filter((signal) => signal.status === "open").length,
    primaryRegion,
    trustNote: "Counts above are live-backed from the marine intelligence API. Use signal cards below to navigate directly to station risk detail.",
    signals: prioritizedSignals,
  };
}

export async function getStationRecentAnomalyEvidence(
  stationId: string,
  windowDays = RECENT_ANOMALY_WINDOW_DAYS,
): Promise<RecentAnomalyEvidenceData> {
  const since = new Date(Date.now() - (windowDays * 24 * 60 * 60 * 1000)).toISOString();
  const result = await readRecentAnomalies({
    stationId,
    since,
    limit: RECENT_ANOMALY_LIMIT,
  });

  if (!result.ok || !Array.isArray(result.data.anomalies)) {
    return {
      state: "unavailable",
      windowDays,
      summaryLine: "Recent anomaly history unavailable",
      exportHref: null,
      exportFileName: null,
      anomalies: [],
    };
  }

  return buildRecentAnomalyEvidenceData(
    result.data.anomalies,
    windowDays,
    `station-${stationId}-recent-anomalies.csv`,
  );
}

export async function getRegionRecentAnomalyEvidence(
  regionId: string,
  windowDays = RECENT_ANOMALY_WINDOW_DAYS,
): Promise<RecentAnomalyEvidenceData> {
  const region = getMarineRegionConfig(regionId);

  if (!region) {
    return {
      state: "unavailable",
      windowDays,
      summaryLine: "Recent anomaly history unavailable",
      exportHref: null,
      exportFileName: null,
      anomalies: [],
    };
  }

  const since = new Date(Date.now() - (windowDays * 24 * 60 * 60 * 1000)).toISOString();
  const result = await readRecentAnomalies({
    since,
    limit: RECENT_ANOMALY_LIMIT,
  });

  if (!result.ok || !Array.isArray(result.data.anomalies)) {
    return {
      state: "unavailable",
      windowDays,
      summaryLine: "Recent anomaly history unavailable",
      exportHref: null,
      exportFileName: null,
      anomalies: [],
    };
  }

  const stationIds = new Set(region.stationIds);
  const anomalies = result.data.anomalies.filter((item) => item.stationId !== null && stationIds.has(item.stationId));

  return buildRecentAnomalyEvidenceData(
    anomalies,
    windowDays,
    `region-${region.id}-recent-anomalies.csv`,
  );
}

export async function getStationRiskAssessment(stationId: string): Promise<DataResult<StationRiskPageData>> {
  const result = await fetchMarineApi<V1RiskAssessment>(
    `/v1/risk/${encodeURIComponent(stationId)}`,
  );

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      data: null,
      message: result.message,
    };
  }

  const assessment = result.data;
  const observedAgeHours = computeAgeHours(assessment.conditions.observedAt);
  const evaluatedAgeHours = computeAgeHours(assessment.evaluatedAt);
  const missingMetrics = buildStationMissingMetrics(assessment);
  const stale = observedAgeHours !== null && observedAgeHours > 8;

  return {
    ok: true,
    status: result.status,
    data: {
      ...assessment,
      provenance: buildSurfaceStatus({
        source: "live",
        detail: "Public v1 station risk endpoint.",
        updatedAt: assessment.evaluatedAt,
        staleAfterHours: 8,
      }),
      freshness: {
        observedAgeHours,
        evaluatedAgeHours,
        stale,
        label: stale
          ? `Latest observation is ${formatAgeLabel(observedAgeHours)}. Treat this station as stale until a newer reading arrives.`
          : `Latest observation is ${formatAgeLabel(observedAgeHours)}.`,
      },
      dataQuality: {
        missingMetrics,
        warning:
          missingMetrics.length > 0
            ? `${missingMetrics.join(", ")} ${missingMetrics.length === 1 ? "is" : "are"} missing from the latest observation.`
            : null,
        actionability: buildStationActionability(assessment),
      },
      sovereignVerification: assessment.sovereignVerification,
    },
    message: null,
  };
}

export async function getRegionRiskAssessment(regionId: string): Promise<DataResult<RegionRiskPageData>> {
  const normalized = getMarineRegionConfig(regionId)?.id ?? regionId;
  const result = await fetchMarineApi<V1RegionRiskResponse>(
    `/v1/regions/${encodeURIComponent(normalized)}/risk`,
  );

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      data: null,
      message: result.message,
    };
  }

  const data = result.data;

  return {
    ok: true,
    status: result.status,
    data: {
      ...data,
      provenance: buildSurfaceStatus({
        source: "live",
        detail: "Public v1 regional risk endpoint.",
        updatedAt: data.evaluatedAt,
        staleAfterHours: 8,
      }),
      coverageWarning: buildCoverageWarning(data.coverage),
    },
    message: null,
  };
}

export async function getRegionRiskTrend(regionId: string): Promise<DataResult<RegionRiskTrendPageData>> {
  const normalized = getMarineRegionConfig(regionId)?.id ?? regionId;
  const result = await fetchMarineApi<V1RegionRiskTrendResponse>(
    `/v1/regions/${encodeURIComponent(normalized)}/risk/trend`,
  );

  if (!result.ok) {
    return {
      ok: false,
      status: result.status,
      data: null,
      message: result.message,
    };
  }

  const data = result.data;

  return {
    ok: true,
    status: result.status,
    data: {
      ...data,
      provenance: buildSurfaceStatus({
        source: "live",
        detail: "Public v1 regional risk trend endpoint.",
        updatedAt: data.evaluatedAt,
        staleAfterHours: 8,
      }),
      forecastMethod: "Projected outlooks on this page are rule-based projections from regional score change, corroboration, CRW support, and coverage quality. They are not predictive models or observed conditions.",
      coverageWarning: null,
    },
    message: null,
  };
}

export function formatSurfaceStatusLine(status: SurfaceStatus): string {
  const timestamp = formatUtcTimestamp(status.updatedAt);
  const freshness = status.freshnessLabel ? `, ${status.freshnessLabel}` : "";

  if (timestamp) {
    return `${status.label}. ${status.detail} Latest timestamp ${timestamp}${freshness}.`.trim();
  }

  return `${status.label}. ${status.detail}`.trim();
}
