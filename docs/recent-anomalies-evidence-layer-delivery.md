# Recent Anomalies + Evidence Layer Delivery

## Files Modified
- apps/web/lib/marine-intelligence.ts
- apps/web/app/v1/risk/[stationId]/page.tsx
- apps/web/app/v1/regions/[regionId]/risk/page.tsx
- apps/web/app/v1/risk/[stationId]/page.test.tsx
- apps/web/app/v1/regions/[regionId]/risk/page.test.tsx
- apps/web/app/page.tsx

## Files Created
- None for this feature.

## Data Source / Provenance
- Recent anomaly evidence is sourced from the existing live anomalies API route: GET /anomalies.
- Station evidence uses stationId + since filters through existing web data access.
- Regional evidence aggregates anomalies by existing configured station IDs in MarineRegionConfig.
- No new endpoint, no mock data, and no new model were introduced.

## Full Content: apps/web/lib/marine-intelligence.ts

```ts
import type {
  DashboardAnomalySummary,
  LiveMarineCondition,
  ReefStressWatchItem,
  SignalDetection,
} from "@/lib/api/types";
import {
  getMarineRegionConfig,
  listMarineRegionConfigs,
} from "@marine/shared";

// ─── API base URL ─────────────────────────────────────────────────────────────

function getApiBase(): string {
  return (process.env.MARINE_API_BASE_URL ?? "http://localhost:4000").replace(/\/$/, "");
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
    criticalHref: string;
    regionsHref: string | null;
  };
  anomalySummaryStatus: SurfaceStatus;
  prioritizedSignals: SignalDetection[];
  signalCenterStatus: SurfaceStatus;
  liveConditions: LiveMarineCondition[];
  liveConditionsStatus: SurfaceStatus;
  reefAlerts: ReefStressWatchItem[];
  reefAlertsStatus: SurfaceStatus;
  primaryRegion: MarineRegionLink | null;
  quickLinks: DashboardQuickLink[];
  notices: DashboardTruthNotice[];
  disabledSurfaces: string[];
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

export function getMarineRegionForStation(stationId: string | null | undefined): MarineRegionLink | null {
  if (!stationId) {
    return null;
  }

  const match = listMarineRegionConfigs().find((region) => region.stationIds.includes(stationId));

  return match ? { id: match.id, name: match.name } : null;
}

export function getMarineRegionByName(regionName: string | null | undefined): MarineRegionLink | null {
  if (!regionName) {
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

export function getSignalInvestigationHref(signal: SignalDetection): string | null {
  return signal.linkedInvestigationId
    ? `/investigations?focus=${encodeURIComponent(signal.linkedInvestigationId)}`
    : null;
}

// ─── Public data functions ────────────────────────────────────────────────────

export async function getDashboardMarineSurfaceData(): Promise<DashboardMarineSurfaceData> {
  const [liveConditionsResult, reefAlertsResult, prioritizedSignals, anomalies] =
    await Promise.all([
      readLiveConditions(),
      readReefAlerts(),
      readSignals(8),
      readAnomalies(200),
    ]);

  const liveConditions = liveConditionsResult.conditions;
  const reefAlerts = reefAlertsResult.alerts;
  const regionRisks = await listRegionRisks();
  const primaryRegion = buildPrimaryRegion(regionRisks);
  const primaryTrend = primaryRegion ? (await getRegionRiskTrend(primaryRegion.id)).data : null;
  const anomalySummary = buildAnomalySummary(anomalies, regionRisks, primaryTrend);

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

  const notices: DashboardTruthNotice[] = [];

  if (!liveConditionsResult.apiOk) {
    notices.push({
      title: "Station conditions unavailable",
      detail: liveConditionsStatus.detail,
      tone: "warning",
    });
  }

  if (!reefAlertsResult.apiOk) {
    notices.push({
      title: "Reef stress feed unavailable",
      detail: reefAlertsStatus.detail,
      tone: "warning",
    });
  }

  notices.push({
    title: "Removed from this dashboard",
    detail: "Mission status, activity feeds, species summaries, and system-wide health badges are hidden until they are backed by the same live APIs as the risk surfaces.",
    tone: "info",
  });

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
      criticalHref: "/investigations",
      regionsHref: primaryRegion ? `/v1/regions/${primaryRegion.id}/risk/trend` : null,
    },
    anomalySummaryStatus,
    prioritizedSignals,
    signalCenterStatus,
    liveConditions,
    liveConditionsStatus,
    reefAlerts,
    reefAlertsStatus,
    primaryRegion,
    quickLinks: [
      {
        label: "Investigations",
        description: "Review anomaly records and linked investigations.",
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
    disabledSurfaces: [
      "/ocean-map",
      "/data-explorer",
      "/species-database",
      "/ocean-stations",
      "/station/[slug]",
    ],
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
```

## Full Content: apps/web/app/v1/risk/[stationId]/page.tsx

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/platform/empty-state";
import { ErrorState } from "@/components/platform/error-state";
import {
  formatSurfaceStatusLine,
  getMarineRegionForStation,
  getStationRecentAnomalyEvidence,
  getStationRiskAssessment,
} from "@/lib/marine-intelligence";

interface StationRiskPageProps {
  params: {
    stationId: string;
  };
}

export const metadata: Metadata = {
  title: "Station Risk",
};

function badgeTone(riskLevel: "low" | "medium" | "high" | "critical"): string {
  switch (riskLevel) {
    case "critical":
      return "border-rose-500/25 bg-rose-500/10 text-rose-200";
    case "high":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
    case "medium":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200";
    default:
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  }
}

function formatValue(value: number | null, unit: string): string {
  if (value === null) {
    return "--";
  }

  return `${value.toFixed(unit === "hPa" ? 0 : 1)} ${unit}`;
}

function actionGuidanceText(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
      return "Recommended action: Verify conditions immediately. Cross-check with nearest station before proceeding.";
    case "high":
      return "Elevated conditions detected. Review active signals and monitor closely.";
    case "medium":
      return "Conditions deviating from baseline. Monitor for escalation.";
    default:
      return "No significant deviations detected. Normal conditions.";
  }
}

function actionGuidanceTone(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
      return "border-rose-500/25 bg-rose-500/10 text-rose-100";
    case "high":
      return "border-amber-500/25 bg-amber-500/10 text-amber-100";
    case "medium":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
    default:
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
  }
}

function formatSignalLabel(metric: string): string {
  return metric
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

export default async function StationRiskPage({ params }: StationRiskPageProps) {
  const stationId = params.stationId;
  const [result, recentAnomalies] = await Promise.all([
    getStationRiskAssessment(stationId),
    getStationRecentAnomalyEvidence(stationId),
  ]);
  const region = getMarineRegionForStation(stationId);

  if (!result.ok || !result.data) {
    return (
      <AppShell
        pageTitle={`Station ${stationId}`}
        pageSubtitle="Public station risk endpoint"
        hideAIPanel
      >
        <div className="mx-auto max-w-5xl p-6">
          <ErrorState
            title="Station risk unavailable"
            message={result.message ?? "This station does not have a current risk assessment."}
            action={
              region ? (
                <Link
                  href={`/v1/regions/${encodeURIComponent(region.id)}/risk`}
                  className="inline-flex rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
                >
                  Open {region.name} regional view
                </Link>
              ) : undefined
            }
          />
        </div>
      </AppShell>
    );
  }

  const assessment = result.data;

  return (
    <AppShell
      pageTitle={`Station ${assessment.stationId}`}
      pageSubtitle="Public station risk endpoint"
      hideAIPanel
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        {/* ── Pilot disclaimer ── */}
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-400">Pilot system</p>
          <p className="mt-1.5 text-sm text-amber-100">
            This is an early-stage signal system. Risk levels and projections are derived indicators —
            not predictive or operational guarantees.
          </p>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
                Station Risk
              </p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-slate-100">{assessment.stationId}</h2>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${badgeTone(assessment.riskLevel)}`}>
                  {assessment.riskLevel}
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-400">{assessment.summary}</p>
              <p className="max-w-3xl text-[11px] leading-relaxed text-slate-500">
                {formatSurfaceStatusLine(assessment.provenance)}
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span>Evaluated {assessment.evaluatedAt.slice(0, 16).replace("T", " ")} UTC</span>
                <span
                  title="Reflects how much historical data is available. Not a probability."
                >
                  Baseline coverage {Math.round(assessment.baselineCoverage.score * 100)}%
                </span>
                <span>{assessment.baselineCoverage.quality} baseline quality</span>
                <span>{assessment.baselineCoverage.historicalDataPoints} historical points</span>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3">
                <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Freshness</p>
                <p className="mt-1 text-sm text-slate-200">{assessment.freshness.label}</p>
              </div>
              {region ? (
                <Link
                  href={`/v1/regions/${encodeURIComponent(region.id)}/risk`}
                  className="rounded-xl border border-cyan-500/25 bg-cyan-500/10 px-4 py-3 transition-colors hover:bg-cyan-500/20"
                >
                  <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-300">Region</p>
                  <p className="mt-1 text-sm font-medium text-slate-100">{region.name}</p>
                </Link>
              ) : (
                <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3">
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Region</p>
                  <p className="mt-1 text-sm text-slate-400">Not mapped to a configured region</p>
                </div>
              )}
            </div>
          </div>

          {(assessment.freshness.stale || assessment.dataQuality.warning) && (
            <div className="mt-4 grid gap-2">
              {assessment.freshness.stale && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Latest observation is stale. Use regional context and neighboring stations before treating this as current operating truth.
                </div>
              )}
              {assessment.dataQuality.warning && (
                <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  {assessment.dataQuality.warning}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Sea surface temperature</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">
              {formatValue(assessment.conditions.seaSurfaceTemperatureC, "°C")}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Wave height</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">
              {formatValue(assessment.conditions.waveHeightM, "m")}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Wind speed</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">
              {formatValue(assessment.conditions.windSpeedMps, "m/s")}
            </p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Pressure</p>
            <p className="mt-2 text-xl font-semibold text-slate-100">
              {formatValue(assessment.conditions.pressureHpa, "hPa")}
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <h3 className="text-sm font-semibold text-slate-100">Recommended Action</h3>
          <div className="mt-4 space-y-2">
            <div className={`rounded-xl border px-4 py-3 text-sm ${actionGuidanceTone(assessment.riskLevel)}`}>
              {actionGuidanceText(assessment.riskLevel)}
            </div>
            {assessment.baselineCoverage.quality === "low" && (
              <div className="rounded-xl border border-slate-500/25 bg-slate-500/10 px-4 py-3 text-sm text-slate-300">
                Limited historical data — interpret with caution.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Alerts</h3>
              <p className="text-[11px] text-slate-500">Hard-threshold alerts only. A blank section here does not mean the station is risk-free.</p>
            </div>
          </div>

          {assessment.alerts.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {assessment.alerts.map((alert) => (
                <article key={`${alert.title}-${alert.detail}`} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-100">{alert.title}</h4>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${badgeTone(alert.severity === "warning" ? "medium" : "critical")}`}>
                      {alert.severity}
                    </span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-slate-400">{alert.detail}</p>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No active threshold alerts"
                subtitle="The fusion score can still be elevated from baseline anomalies, neighbor corroboration, or CRW context even when no hard threshold is active."
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Recent anomalies</h3>
              <p className="mt-1 text-[11px] text-slate-500">Recent anomaly records from the live anomaly pipeline for this station.</p>
              <p className="mt-2 text-sm text-slate-300">{recentAnomalies.summaryLine}</p>
            </div>
            {recentAnomalies.exportHref && recentAnomalies.exportFileName ? (
              <a
                href={recentAnomalies.exportHref}
                download={recentAnomalies.exportFileName}
                className="inline-flex h-fit rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                Download CSV
              </a>
            ) : null}
          </div>

          {recentAnomalies.state === "unavailable" ? (
            <div className="mt-4 rounded-xl border border-slate-500/25 bg-slate-500/10 px-4 py-3 text-sm text-slate-300">
              Recent anomaly history unavailable
            </div>
          ) : recentAnomalies.anomalies.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {recentAnomalies.anomalies.map((anomaly) => (
                <article key={anomaly.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{anomaly.deviation}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{anomaly.detectedAtLabel ?? "Timestamp unavailable"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                        {anomaly.signalTypeLabel}
                      </span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${badgeTone(anomaly.severity)}`}>
                        {anomaly.severity}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Deviation</p>
                      <p className="mt-1 text-sm text-slate-200">{anomaly.deviation}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Description</p>
                      <p className="mt-1 text-sm text-slate-200">{anomaly.description}</p>
                    </div>
                  </div>
                  {anomaly.evidenceSummary ? (
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{anomaly.evidenceSummary}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3 text-sm text-slate-300">
              No recent anomalies detected
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">Signal Breakdown</h3>
            <p className="text-[11px] text-slate-500">These anomaly scores come from the live station risk endpoint. They explain why the final risk level moved.</p>
          </div>

          {assessment.signals.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {assessment.signals.map((signal) => (
                <article key={signal.metric} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-100">{formatSignalLabel(signal.metric)}</h4>
                    <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                      {signal.direction.replace(/_/g, " ")}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Current value</p>
                      <p className="mt-1 text-sm text-slate-200">{signal.currentValue ?? "--"} {signal.unit}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Anomaly score</p>
                      <p className="mt-1 font-mono text-sm text-slate-200">
                        {signal.anomalyScore === null ? "--" : signal.anomalyScore.toFixed(2)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No signal metrics returned"
                subtitle="The endpoint returned a station-level risk without metric-level explainability. Treat the overall score as incomplete."
              />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
```

## Full Content: apps/web/app/v1/regions/[regionId]/risk/page.tsx

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { EmptyState } from "@/components/platform/empty-state";
import { ErrorState } from "@/components/platform/error-state";
import {
  formatSurfaceStatusLine,
  getRegionRecentAnomalyEvidence,
  getRegionRiskAssessment,
} from "@/lib/marine-intelligence";

interface RegionRiskPageProps {
  params: {
    regionId: string;
  };
}

export const metadata: Metadata = {
  title: "Regional Risk",
};

function regionalDecisionText(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
    case "high":
      return "Multiple stations indicate elevated risk. Regional conditions may require operational caution.";
    case "medium":
      return "Some stations show deviations. Monitor regional trend.";
    case "low":
      return "Region is within baseline conditions.";
    case "insufficient_data":
      return "Not enough data to assess regional risk.";
    default:
      return "Regional risk status is unclear.";
  }
}

function regionalDecisionTone(riskLevel: string): string {
  switch (riskLevel) {
    case "critical":
      return "border-rose-500/25 bg-rose-500/10 text-rose-100";
    case "high":
      return "border-amber-500/25 bg-amber-500/10 text-amber-100";
    case "medium":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
    case "low":
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
    default:
      return "border-slate-500/25 bg-slate-500/10 text-slate-300";
  }
}

function badgeTone(riskLevel: "low" | "medium" | "high" | "critical" | "insufficient_data"): string {
  switch (riskLevel) {
    case "critical":
      return "border-rose-500/25 bg-rose-500/10 text-rose-200";
    case "high":
      return "border-amber-500/25 bg-amber-500/10 text-amber-200";
    case "medium":
      return "border-cyan-500/25 bg-cyan-500/10 text-cyan-200";
    case "insufficient_data":
      return "border-slate-500/25 bg-slate-500/10 text-slate-300";
    default:
      return "border-emerald-500/25 bg-emerald-500/10 text-emerald-200";
  }
}

export default async function RegionRiskPage({ params }: RegionRiskPageProps) {
  const [result, recentAnomalies] = await Promise.all([
    getRegionRiskAssessment(params.regionId),
    getRegionRecentAnomalyEvidence(params.regionId),
  ]);

  if (!result.ok || !result.data) {
    return (
      <AppShell
        pageTitle="Regional Risk"
        pageSubtitle="Public regional marine risk endpoint"
        hideAIPanel
      >
        <div className="mx-auto max-w-5xl p-6">
          <ErrorState
            title="Regional risk unavailable"
            message={result.message ?? "This region does not have a live risk response yet."}
          />
        </div>
      </AppShell>
    );
  }

  const region = result.data;

  return (
    <AppShell
      pageTitle={region.regionName}
      pageSubtitle="Public regional marine risk endpoint"
      hideAIPanel
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-6 p-6">
        {/* ── Pilot disclaimer ── */}
        <section className="rounded-2xl border border-amber-500/25 bg-amber-500/10 p-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-amber-400">Pilot system</p>
          <p className="mt-1.5 text-sm text-amber-100">
            This is an early-stage signal system. Risk levels and projections are derived indicators —
            not predictive or operational guarantees.
          </p>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">Regional Risk</p>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-2xl font-semibold text-slate-100">{region.regionName}</h2>
                <span className={`rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] ${badgeTone(region.riskLevel)}`}>
                  {region.riskLevel}
                </span>
              </div>
              <p className="max-w-3xl text-sm leading-relaxed text-slate-400">{region.summary}</p>
              <p className="max-w-3xl text-[11px] leading-relaxed text-slate-500">
                {formatSurfaceStatusLine(region.provenance)}
              </p>
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-400">
                <span>Evaluated {region.evaluatedAt.slice(0, 16).replace("T", " ")} UTC</span>
                <span
                  title="Reflects how much historical data is available. Not a probability."
                >
                  Baseline coverage {Math.round(region.confidence.score * 100)}%
                </span>
                <span>{region.confidence.quality} baseline quality</span>
              </div>
            </div>

            <Link
              href={`/v1/regions/${encodeURIComponent(region.regionId)}/risk/trend`}
              className="inline-flex h-fit rounded-full border border-cyan-500/25 bg-cyan-500/10 px-4 py-2 text-sm font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
            >
              View trend and projected outlook
            </Link>
          </div>

          {region.riskLevel === "insufficient_data" && (
            <div className="mt-4 rounded-xl border border-slate-500/25 bg-slate-500/10 px-4 py-3 text-sm text-slate-200">
              This region does not have enough healthy stations to produce a reliable risk assessment. The risk level shown above is not an operational classification — it indicates a data gap, not a low-risk condition.
            </div>
          )}
          {region.coverageWarning && region.riskLevel !== "insufficient_data" && (
            <div className="mt-4 rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {region.coverageWarning}
            </div>
          )}
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Configured stations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{region.coverage.configuredStations}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Analyzed stations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{region.coverage.analyzedStations}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Healthy stations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{region.coverage.healthyStations}</p>
          </div>
          <div className="rounded-xl border border-surface-border bg-ocean-900 px-4 py-4">
            <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Minimum healthy stations</p>
            <p className="mt-2 text-2xl font-semibold text-slate-100">{region.coverage.minimumHealthyStations}</p>
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <h3 className="text-sm font-semibold text-slate-100">What this means</h3>
          <div className={`mt-3 rounded-xl border px-4 py-3 text-sm ${regionalDecisionTone(region.riskLevel)}`}>
            {regionalDecisionText(region.riskLevel)}
          </div>
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <h3 className="text-sm font-semibold text-slate-100">Dominant Drivers</h3>
          <p className="mt-1 text-[11px] text-slate-500">These labels explain what is driving the regional score right now.</p>
          {region.dominantDrivers.length > 0 ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {region.dominantDrivers.map((driver) => (
                <span key={driver} className="rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300">
                  {driver}
                </span>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No dominant drivers reported"
                subtitle="The response did not include explainability for this regional score."
              />
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-100">Recent anomalies</h3>
              <p className="mt-1 text-[11px] text-slate-500">Aggregated recent anomaly records from the configured stations in this region.</p>
              <p className="mt-2 text-sm text-slate-300">{recentAnomalies.summaryLine}</p>
            </div>
            {recentAnomalies.exportHref && recentAnomalies.exportFileName ? (
              <a
                href={recentAnomalies.exportHref}
                download={recentAnomalies.exportFileName}
                className="inline-flex h-fit rounded-full border border-cyan-500/25 bg-cyan-500/10 px-3 py-1.5 text-[11px] font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
              >
                Download CSV
              </a>
            ) : null}
          </div>

          {recentAnomalies.state === "unavailable" ? (
            <div className="mt-4 rounded-xl border border-slate-500/25 bg-slate-500/10 px-4 py-3 text-sm text-slate-300">
              Recent anomaly history unavailable
            </div>
          ) : recentAnomalies.anomalies.length > 0 ? (
            <div className="mt-4 grid gap-3">
              {recentAnomalies.anomalies.map((anomaly) => (
                <article key={anomaly.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-medium text-slate-100">{anomaly.deviation}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{anomaly.detectedAtLabel ?? "Timestamp unavailable"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {anomaly.stationId ? (
                        <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                          Station {anomaly.stationId}
                        </span>
                      ) : null}
                      <span className="rounded-full border border-surface-borderSubtle bg-ocean-900 px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-slate-300">
                        {anomaly.signalTypeLabel}
                      </span>
                      <span className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${badgeTone(anomaly.severity)}`}>
                        {anomaly.severity}
                      </span>
                    </div>
                  </div>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Deviation</p>
                      <p className="mt-1 text-sm text-slate-200">{anomaly.deviation}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Description</p>
                      <p className="mt-1 text-sm text-slate-200">{anomaly.description}</p>
                    </div>
                  </div>
                  {anomaly.evidenceSummary ? (
                    <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{anomaly.evidenceSummary}</p>
                  ) : null}
                </article>
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-surface-borderSubtle bg-ocean-850/70 px-4 py-3 text-sm text-slate-300">
              No recent anomalies detected
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <h3 className="text-sm font-semibold text-slate-100">Top Contributing Stations</h3>
          <p className="mt-1 text-[11px] text-slate-500">These station pages are the best next step for manual verification.</p>
          {region.topStations.length > 0 ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {region.topStations.map((station) => (
                <Link
                  key={station.stationId}
                  href={`/v1/risk/${encodeURIComponent(station.stationId)}`}
                  className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4 transition-colors hover:bg-ocean-800"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium text-slate-100">{station.stationId}</h4>
                    <span className={`rounded-full border px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] ${badgeTone(station.riskLevel)}`}>
                      {station.riskLevel}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="mt-4">
              <EmptyState
                title="No contributing stations available"
                subtitle="The regional response did not return station contributors. Treat this regional score as weakly explained."
              />
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
```

## Full Content: apps/web/app/v1/risk/[stationId]/page.test.tsx

```tsx
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import StationRiskPage from "@/app/v1/risk/[stationId]/page";

const { mockMarineIntelligence } = vi.hoisted(() => ({
  mockMarineIntelligence: {
    getStationRiskAssessment: vi.fn(),
    getStationRecentAnomalyEvidence: vi.fn(),
    getMarineRegionForStation: vi.fn(),
    formatSurfaceStatusLine: vi.fn(),
  },
}));

vi.mock("@/lib/marine-intelligence", () => ({
  getStationRiskAssessment: mockMarineIntelligence.getStationRiskAssessment,
  getStationRecentAnomalyEvidence: mockMarineIntelligence.getStationRecentAnomalyEvidence,
  getMarineRegionForStation: mockMarineIntelligence.getMarineRegionForStation,
  formatSurfaceStatusLine: mockMarineIntelligence.formatSurfaceStatusLine,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  mockMarineIntelligence.getStationRiskAssessment.mockReset();
  mockMarineIntelligence.getStationRecentAnomalyEvidence.mockReset();
  mockMarineIntelligence.getMarineRegionForStation.mockReset();
  mockMarineIntelligence.formatSurfaceStatusLine.mockReset();

  mockMarineIntelligence.getStationRiskAssessment.mockReturnValue({
    ok: true,
    status: 200,
    message: null,
    data: {
      stationId: "41009",
      evaluatedAt: "2026-03-25T18:00:00.000Z",
      riskLevel: "high",
      summary: "Elevated warming and wave activity are active.",
      conditions: {
        observedAt: "2026-03-25T12:00:00.000Z",
        seaSurfaceTemperatureC: 28.4,
        waveHeightM: 2.1,
        windSpeedMps: 6.5,
        pressureHpa: 1012.8,
      },
      alerts: [],
      signals: [
        {
          metric: "sea_surface_temperature",
          unit: "°C",
          currentValue: 28.4,
          anomalyScore: 2.7,
          direction: "above_normal",
        },
      ],
      baselineCoverage: {
        score: 0.78,
        quality: "high",
        historicalDataPoints: 18,
        coverageNote: "Reflects how many historical data points are available for this station.",
      },
      provenance: {
        source: "live",
        label: "Live API-backed",
        detail: "Public v1 station risk endpoint.",
        fallbackReason: null,
        updatedAt: "2026-03-25T18:00:00.000Z",
        freshnessLabel: "6h old",
        isStale: false,
      },
      freshness: {
        observedAgeHours: 6,
        evaluatedAgeHours: 0.5,
        stale: true,
        label: "Latest observation is 6h old. Treat this station as stale until a newer reading arrives.",
      },
      dataQuality: {
        missingMetrics: ["Wave height"],
        warning: "Wave height is missing from the latest observation.",
        actionability: "Review the active threshold alerts first, then inspect the per-metric anomaly breakdown before escalating.",
      },
    },
  });
  mockMarineIntelligence.getStationRecentAnomalyEvidence.mockReturnValue({
    state: "available",
    windowDays: 14,
    summaryLine: "1 anomaly detected in past 48 hours",
    exportHref: "data:text/csv;charset=utf-8,test",
    exportFileName: "station-41009-recent-anomalies.csv",
    anomalies: [
      {
        id: "SIG-41009-1",
        stationId: "41009",
        detectedAt: "2026-03-25T16:00:00.000Z",
        detectedAtLabel: "2026-03-25 16:00 UTC",
        signalType: "thermal_anomaly",
        signalTypeLabel: "Thermal Anomaly",
        severity: "high",
        deviation: "Baseline anomaly at 41009: seaSurfaceTempC z=2.70",
        description: "Sea surface temperature deviated from the station baseline.",
        evidenceSummary: "Backed by 1 recent observation for station 41009 and source record risk-score-41009.",
      },
    ],
  });
  mockMarineIntelligence.getMarineRegionForStation.mockReturnValue({
    id: "southeast-florida",
    name: "Southeast Florida",
  });
  mockMarineIntelligence.formatSurfaceStatusLine.mockImplementation((status) => status.detail);
});

test("station risk page renders provenance, stale warnings, actionability, and recent anomaly evidence", async () => {
  const page = await StationRiskPage({ params: { stationId: "41009" } });
  render(page);

  expect(screen.getByText("41009")).toBeInTheDocument();
  expect(screen.getByText("Elevated warming and wave activity are active.")).toBeInTheDocument();
  expect(screen.getByText("Public v1 station risk endpoint.")).toBeInTheDocument();
  expect(screen.getByText(/Latest observation is stale/i)).toBeInTheDocument();
  expect(screen.getByText("Wave height is missing from the latest observation.")).toBeInTheDocument();
  expect(screen.getByText(/Elevated conditions detected\. Review active signals and monitor closely\./i)).toBeInTheDocument();
  expect(screen.getByText("No active threshold alerts")).toBeInTheDocument();
  expect(screen.getByText("Recent anomalies")).toBeInTheDocument();
  expect(screen.getByText("1 anomaly detected in past 48 hours")).toBeInTheDocument();
  expect(screen.getByText("Thermal Anomaly")).toBeInTheDocument();
  expect(screen.getAllByText("Baseline anomaly at 41009: seaSurfaceTempC z=2.70").length).toBeGreaterThan(0);
  expect(screen.getByText("Sea surface temperature deviated from the station baseline.")).toBeInTheDocument();
  expect(screen.getByText(/Backed by 1 recent observation/i)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute("download", "station-41009-recent-anomalies.csv");
});

test("station risk page renders unavailable history honestly when recent anomalies cannot be loaded", async () => {
  mockMarineIntelligence.getStationRecentAnomalyEvidence.mockReturnValueOnce({
    state: "unavailable",
    windowDays: 14,
    summaryLine: "Recent anomaly history unavailable",
    exportHref: null,
    exportFileName: null,
    anomalies: [],
  });

  const page = await StationRiskPage({ params: { stationId: "41009" } });
  render(page);

  expect(screen.getAllByText("Recent anomaly history unavailable").length).toBeGreaterThan(0);
});

test("station risk page renders an honest error state when the API response is unavailable", async () => {
  mockMarineIntelligence.getStationRiskAssessment.mockReturnValueOnce({
    ok: false,
    status: 503,
    data: null,
    message: "Station risk is unavailable.",
  });

  const page = await StationRiskPage({ params: { stationId: "missing" } });
  render(page);

  expect(screen.getByText("Station risk unavailable")).toBeInTheDocument();
  expect(screen.getByText("Station risk is unavailable.")).toBeInTheDocument();
});
```

## Full Content: apps/web/app/v1/regions/[regionId]/risk/page.test.tsx

```tsx
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { vi } from "vitest";
import RegionRiskPage from "@/app/v1/regions/[regionId]/risk/page";

const { mockMarineIntelligence } = vi.hoisted(() => ({
  mockMarineIntelligence: {
    getRegionRiskAssessment: vi.fn(),
    getRegionRecentAnomalyEvidence: vi.fn(),
    formatSurfaceStatusLine: vi.fn(),
  },
}));

vi.mock("@/lib/marine-intelligence", () => ({
  getRegionRiskAssessment: mockMarineIntelligence.getRegionRiskAssessment,
  getRegionRecentAnomalyEvidence: mockMarineIntelligence.getRegionRecentAnomalyEvidence,
  formatSurfaceStatusLine: mockMarineIntelligence.formatSurfaceStatusLine,
}));

vi.mock("@/components/layout/app-shell", () => ({
  AppShell: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

beforeEach(() => {
  mockMarineIntelligence.getRegionRiskAssessment.mockReset();
  mockMarineIntelligence.getRegionRecentAnomalyEvidence.mockReset();
  mockMarineIntelligence.formatSurfaceStatusLine.mockReset();
  mockMarineIntelligence.getRegionRiskAssessment.mockReturnValue({
    ok: true,
    status: 200,
    message: null,
    data: {
      regionId: "southeast-florida",
      regionName: "Southeast Florida",
      evaluatedAt: "2026-03-25T18:00:00.000Z",
      riskLevel: "high",
      summary: "Regional warming remains elevated.",
      dominantDrivers: ["surface warming", "higher seas"],
      topStations: [{ stationId: "41009", riskLevel: "high" }],
      coverage: {
        configuredStations: 6,
        analyzedStations: 4,
        healthyStations: 2,
        minimumHealthyStations: 3,
      },
      confidence: {
        score: 0.82,
        quality: "high",
      },
      provenance: {
        source: "live",
        label: "Live API-backed",
        detail: "Public v1 regional risk endpoint.",
        fallbackReason: null,
        updatedAt: "2026-03-25T18:00:00.000Z",
        freshnessLabel: "1h old",
        isStale: false,
      },
      coverageWarning: "Coverage is weak: 2 healthy stations are available, below the minimum 3.",
    },
  });
  mockMarineIntelligence.getRegionRecentAnomalyEvidence.mockReturnValue({
    state: "available",
    windowDays: 14,
    summaryLine: "2 anomalies detected in past 48 hours",
    exportHref: "data:text/csv;charset=utf-8,test",
    exportFileName: "region-southeast-florida-recent-anomalies.csv",
    anomalies: [
      {
        id: "SIG-41009-1",
        stationId: "41009",
        detectedAt: "2026-03-25T16:00:00.000Z",
        detectedAtLabel: "2026-03-25 16:00 UTC",
        signalType: "thermal_anomaly",
        signalTypeLabel: "Thermal Anomaly",
        severity: "high",
        deviation: "Baseline anomaly at 41009: seaSurfaceTempC z=2.70",
        description: "Sea surface temperature deviated from the station baseline.",
        evidenceSummary: "Backed by 1 recent observation for station 41009 and source record risk-score-41009.",
      },
    ],
  });
  mockMarineIntelligence.formatSurfaceStatusLine.mockImplementation((status) => status.detail);
});

test("region risk page renders provenance, weak-coverage warnings, and aggregated recent anomalies", async () => {
  const page = await RegionRiskPage({ params: { regionId: "southeast-florida" } });
  render(page);

  expect(screen.getByText("Southeast Florida")).toBeInTheDocument();
  expect(screen.getByText("Regional warming remains elevated.")).toBeInTheDocument();
  expect(screen.getByText("Public v1 regional risk endpoint.")).toBeInTheDocument();
  expect(screen.getByText("Coverage is weak: 2 healthy stations are available, below the minimum 3.")).toBeInTheDocument();
  expect(screen.getByText("surface warming")).toBeInTheDocument();
  expect(screen.getByText("41009")).toBeInTheDocument();
  expect(screen.getByText("Recent anomalies")).toBeInTheDocument();
  expect(screen.getByText("2 anomalies detected in past 48 hours")).toBeInTheDocument();
  expect(screen.getByText("Thermal Anomaly")).toBeInTheDocument();
  expect(screen.getByText("Sea surface temperature deviated from the station baseline.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Download CSV" })).toHaveAttribute("download", "region-southeast-florida-recent-anomalies.csv");
});

test("region risk page renders no-anomaly state honestly", async () => {
  mockMarineIntelligence.getRegionRecentAnomalyEvidence.mockReturnValueOnce({
    state: "available",
    windowDays: 14,
    summaryLine: "No anomalies in past 14 days",
    exportHref: null,
    exportFileName: null,
    anomalies: [],
  });

  const page = await RegionRiskPage({ params: { regionId: "southeast-florida" } });
  render(page);

  expect(screen.getByText("No recent anomalies detected")).toBeInTheDocument();
});

test("region risk page renders unavailable anomaly history honestly", async () => {
  mockMarineIntelligence.getRegionRecentAnomalyEvidence.mockReturnValueOnce({
    state: "unavailable",
    windowDays: 14,
    summaryLine: "Recent anomaly history unavailable",
    exportHref: null,
    exportFileName: null,
    anomalies: [],
  });

  const page = await RegionRiskPage({ params: { regionId: "southeast-florida" } });
  render(page);

  expect(screen.getAllByText("Recent anomaly history unavailable").length).toBeGreaterThan(0);
});

test("region risk page shows an honest error state when data is unavailable", async () => {
  mockMarineIntelligence.getRegionRiskAssessment.mockReturnValueOnce({
    ok: false,
    status: 404,
    data: null,
    message: "Unknown region",
  });

  const page = await RegionRiskPage({ params: { regionId: "missing" } });
  render(page);

  expect(screen.getByText("Regional risk unavailable")).toBeInTheDocument();
  expect(screen.getByText("Unknown region")).toBeInTheDocument();
});
```

## Full Content: apps/web/app/page.tsx

```tsx
import type { Metadata } from "next";
import Link from "next/link";
import { AppShell } from "@/components/layout/app-shell";
import { DashboardAnomalySummaryCard } from "@/components/dashboard/dashboard-anomaly-summary";
import { SignalCenter } from "@/components/signals/signal-center";
import {
  formatSurfaceStatusLine,
  getDashboardMarineSurfaceData,
  getMarineRegionByName,
  getSignalDetailHref,
  getSignalInvestigationHref,
} from "@/lib/marine-intelligence";
import {
  AlertTriangle,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Dashboard" };

interface DashboardPageProps {
  searchParams?: { notice?: string };
}

const METRIC_TONE = {
  neutral: "border-surface-borderSubtle bg-ocean-850/60 text-slate-400",
  info: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  warning: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  critical: "border-rose-500/25 bg-rose-500/10 text-rose-300",
} as const;

function triageSummary(anomalySummary: {
  criticalAnomalies: number;
  elevatedAnomalies: number;
  trendDirection: "up" | "down" | "flat";
}): { text: string; tone: "neutral" | "warning" | "critical" } {
  if (anomalySummary.criticalAnomalies > 0 && anomalySummary.trendDirection === "up") {
    return { text: "Regional risk increasing — investigate trend", tone: "critical" };
  }

  if (anomalySummary.criticalAnomalies > 0 || anomalySummary.elevatedAnomalies > 0) {
    return { text: "Elevated signals detected — review affected stations", tone: "warning" };
  }

  return { text: "No active anomalies detected across monitored regions", tone: "neutral" };
}

function formatConditionMetric(value: number | null, digits = 1): string {
  if (value === null || value === undefined) {
    return "--";
  }

  return value.toFixed(digits);
}

function formatStressLevel(level: string | null): string {
  if (!level) {
    return "--";
  }

  return level
    .replace(/_/g, " ")
    .replace(/\b\w/g, (token) => token.toUpperCase());
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const showQuarantineNotice = searchParams?.notice === "route_quarantined";
  const marineData = await getDashboardMarineSurfaceData();
  const {
    metrics,
    anomalySummary,
    anomalySummaryLinks,
    anomalySummaryStatus,
    prioritizedSignals,
    signalCenterStatus,
    liveConditions,
    liveConditionsStatus,
    reefAlerts,
    reefAlertsStatus,
    quickLinks,
    notices,
    disabledSurfaces,
  } = marineData;

  return (
    <AppShell
      pageTitle="Marine Intelligence"
      pageSubtitle="Live-backed marine risk surfaces only"
    >
      <div className="mx-auto flex max-w-[1400px] flex-col gap-6 p-6">
        {showQuarantineNotice && (
          <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
            <span className="font-medium">Route not available.</span>{" "}
            The page you requested is quarantined — it is not backed by live marine data and is not promoted in this build.
            You have been redirected here.
          </div>
        )}

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
                Dashboard Scope
              </p>
              <h2 className="text-lg font-semibold text-slate-100">
                This dashboard now shows only live-backed marine risk surfaces.
              </h2>
              <p className="max-w-3xl text-sm text-slate-400">
                Station conditions, reef stress, anomalies, regional risk, and signal detections are wired to the marine intelligence API.
                Demo-only mission, activity, species, and system-health widgets are intentionally removed from this page until they are backed by the same sources.
              </p>
              {(() => {
                const triage = triageSummary(anomalySummary);
                return (
                  <p className={cn(
                    "inline-flex w-fit rounded-full border px-3 py-1 text-[11px] font-medium",
                    triage.tone === "critical"
                      ? "border-rose-500/25 bg-rose-500/10 text-rose-200"
                      : triage.tone === "warning"
                        ? "border-amber-500/25 bg-amber-500/10 text-amber-200"
                        : "border-emerald-500/25 bg-emerald-500/10 text-emerald-200",
                  )}>
                    {triage.text}
                  </p>
                );
              })()}
            </div>

            <div className="grid gap-2 md:min-w-[360px]">
              {notices.map((notice) => (
                <article
                  key={notice.title}
                  className={cn(
                    "rounded-xl border px-4 py-3 text-sm",
                    notice.tone === "warning"
                      ? "border-amber-500/25 bg-amber-500/10 text-amber-100"
                      : "border-cyan-500/25 bg-cyan-500/10 text-cyan-100",
                  )}
                >
                  <p className="font-medium">{notice.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-slate-300">{notice.detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => {
              const content = (
                <div className={cn("rounded-xl border p-4", METRIC_TONE[metric.tone])}>
                  <p className="text-[10px] uppercase tracking-[0.18em]">{metric.label}</p>
                  <p className="mt-2 text-2xl font-semibold text-slate-100">{metric.value}</p>
                  <p className="mt-1 text-[11px]">{metric.caption}</p>
                </div>
              );

              return metric.href ? (
                <Link key={metric.label} href={metric.href} className="transition-transform hover:-translate-y-0.5">
                  {content}
                </Link>
              ) : (
                <div key={metric.label}>
                  {content}
                </div>
              );
            })}
          </div>
        </section>

        <DashboardAnomalySummaryCard
          summary={anomalySummary}
          links={anomalySummaryLinks}
          statusLine={formatSurfaceStatusLine(anomalySummaryStatus)}
        />

        <SignalCenter
          signals={prioritizedSignals}
          getSignalHref={getSignalDetailHref}
          getInvestigationHref={getSignalInvestigationHref}
          statusLine={formatSurfaceStatusLine(signalCenterStatus)}
          emptyStateTitle="No live signal detections are open"
          emptyStateSubtitle="The persisted signal store returned no active detections. Use regional and station pages for direct risk output."
        />

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Live Marine Conditions</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {formatSurfaceStatusLine(liveConditionsStatus)}
              </p>
            </div>
            {liveConditionsStatus.source === "fallback" && (
              <span className="inline-flex w-fit rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300">
                Fallback mode
              </span>
            )}
          </div>

          {liveConditions.length > 0 ? (
            <div className="grid gap-2">
              {liveConditions.slice(0, 6).map((condition) => (
                <article
                  key={`${condition.stationId}-${condition.timestamp}`}
                  className="grid gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-3 text-[11px] text-slate-300 sm:grid-cols-[120px_repeat(4,minmax(0,1fr))_170px]"
                >
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Station</p>
                    <p className="mt-1 font-semibold text-slate-100">
                      <Link
                        href={`/v1/risk/${encodeURIComponent(condition.stationId)}`}
                        className="hover:text-cyan-300"
                      >
                        {condition.stationId}
                      </Link>
                    </p>
                    <p className="mt-1 text-[10px] text-slate-500">
                      {condition.source === "noaa_ndbc" ? "NOAA NDBC" : condition.source ?? "source unavailable"}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Sea temp</p>
                    <p className="mt-1">{formatConditionMetric(condition.sstC)} °C</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wave height</p>
                    <p className="mt-1">{formatConditionMetric(condition.waveHeightM, 2)} m</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Wind</p>
                    <p className="mt-1">{formatConditionMetric(condition.windSpeedMps)} m/s</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Pressure</p>
                    <p className="mt-1">{formatConditionMetric(condition.pressureHpa)} hPa</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Observed</p>
                    <p className="mt-1 font-mono text-slate-400">{condition.timestamp.slice(0, 16).replace("T", " ")} UTC</p>
                    {condition.ingestedAt && (
                      <p className="mt-0.5 font-mono text-[9px] text-slate-600">
                        ingested {condition.ingestedAt.slice(0, 16).replace("T", " ")} UTC
                      </p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
              No station conditions are available from the current source.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5 space-y-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-slate-200">Reef Stress Watch</p>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {formatSurfaceStatusLine(reefAlertsStatus)}
              </p>
            </div>
            {reefAlertsStatus.source === "fallback" && (
              <span className="inline-flex w-fit rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-[11px] font-medium text-amber-300">
                Fallback mode
              </span>
            )}
          </div>

          {reefAlerts.length > 0 ? (
            <div className="grid gap-2">
              {reefAlerts.slice(0, 6).map((alert) => {
                const region = getMarineRegionByName(alert.region);

                return (
                  <article
                    key={`${alert.region}-${alert.stationId ?? "region"}-${alert.timestamp}`}
                    className="grid gap-2 rounded-lg border border-surface-borderSubtle bg-ocean-850/70 px-3 py-3 text-[11px] text-slate-300 sm:grid-cols-[180px_repeat(4,minmax(0,1fr))_160px]"
                  >
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Region</p>
                      <p className="mt-1 font-semibold text-slate-100">
                        {region ? (
                          <Link
                            href={`/v1/regions/${encodeURIComponent(region.id)}/risk/trend`}
                            className="hover:text-cyan-300"
                          >
                            {alert.region}
                          </Link>
                        ) : (
                          alert.region
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">SST anomaly</p>
                      <p className="mt-1">{formatConditionMetric(alert.sstAnomalyC)} °C</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">HotSpot</p>
                      <p className="mt-1">{formatConditionMetric(alert.hotSpotC)} °C</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">DHW</p>
                      <p className="mt-1">{formatConditionMetric(alert.dhw)} week</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Stress level</p>
                      <p className="mt-1">{formatStressLevel(alert.stressLevel)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.2em] text-slate-500">Observed</p>
                      <p className="mt-1 font-mono text-slate-400">{alert.timestamp.slice(0, 16).replace("T", " ")} UTC</p>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400">
              No reef stress records are available from the current source.
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-surface-border bg-ocean-900 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-slate-100">Intentionally Hidden Until Live-Backed</h3>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            The following routes remain reachable in the codebase but are not promoted on this dashboard because they still present mock or partially wired data.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {disabledSurfaces.map((surface) => (
              <span
                key={surface}
                className="rounded-full border border-surface-borderSubtle bg-ocean-850 px-3 py-1 text-[11px] text-slate-400"
              >
                {surface}
              </span>
            ))}
          </div>
        </section>

        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-widest text-slate-500">
            Live Views
          </p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {quickLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="group rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 transition-colors hover:bg-cyan-500/10"
              >
                <p className="text-sm font-semibold text-cyan-300">{link.label}</p>
                <p className="mt-1 text-[11px] text-slate-400">{link.description}</p>
                <ChevronRight size={12} className="mt-3 text-cyan-400 transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
```

