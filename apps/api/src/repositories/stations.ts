import type {
  OceanStationAdminAuthContext,
  OceanStationAdminAuditArea,
  OceanStationAdminAuditEntry,
  OceanStationAdminBrandingPatch,
  OceanStationAdminContentItem,
  OceanStationAdminContentPatch,
  OceanStationAdminPatch,
  OceanStationAdminSpeciesItem,
  OceanStationAdminTimelineItem,
  OceanStationAnalytics,
  OceanStationAlert,
  OceanStationAlertSeverity,
  OceanStationBranding,
  OceanStationContentItem,
  OceanStationDetail,
  OceanStationSensor,
  OceanStationSpecies,
  OceanStationSummary,
  OceanStationThemeAccent,
  OceanStationTimelineItem,
  OceanStationViewType,
} from "../../../web/lib/api/types";
import {
  hasDatabasePath,
  openReadOnlyDatabase,
  openWritableDatabase,
  resolveDatabasePath,
  type SqliteDatabaseLike,
} from "../db/client";
import type { OceanStationsFallbackReason } from "../types";

interface StationRow {
  id: string;
  slug: string;
  name: string;
  region: string | null;
  status: string;
  summary: string;
  location_label: string;
  depth_m: number | null;
  last_reported_at: string | null;
  hero_metric: string | null;
  sponsor_name: string | null;
  operator_name: string | null;
  logo_url: string | null;
  logo_label: string | null;
  exhibit_title: string | null;
  accent_color: string | null;
  public_description: string | null;
}

interface SpeciesRow {
  id: string;
  name: string;
  status: string;
  population_trend: string | null;
  observed_at: string | null;
  notes: string | null;
}

interface SensorRow {
  id: string;
  name: string;
  category: string;
  value: string;
  unit: string | null;
  status: string;
  sampled_at: string | null;
}

interface AlertRow {
  id: string;
  title: string;
  severity: string;
  status: string;
  detail: string | null;
  detected_at: string | null;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

interface TimelineRow {
  id: string;
  label: string;
  phase: string;
  detail: string;
  happened_at: string | null;
}

interface ContentRow {
  id: string;
  content_type: string;
  title: string;
  summary: string;
  href: string | null;
  published_at: string | null;
}

interface AnalyticsAggregateRow {
  detail_views: number | null;
  exhibit_views: number | null;
  public_views: number | null;
  last_viewed_at: string | null;
}

interface StationAdminAuditRow {
  id: string;
  station_id: string;
  actor_id: string;
  actor_role: string;
  area: string;
  changed_fields: string | null;
  changed_at: string;
}

interface StationRepositoryDependencies {
  resolvePath?: typeof resolveDatabasePath;
  hasPath?: typeof hasDatabasePath;
  openDatabase?: typeof openReadOnlyDatabase;
  openWritable?: typeof openWritableDatabase;
  now?: () => number;
}

export type StationListReadResult =
  | { source: "db"; stations: OceanStationSummary[] }
  | { source: "mock"; fallbackReason: OceanStationsFallbackReason };

export type StationDetailReadResult =
  | { source: "db"; result: "found"; station: OceanStationDetail }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationsFallbackReason };

export type StationAnalyticsReadResult =
  | { source: "db"; result: "found"; analytics: OceanStationAnalytics }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationsFallbackReason };

export type StationViewTrackResult =
  | { source: "db"; result: "recorded"; stationId: string; viewType: OceanStationViewType; viewedAt: string }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationsFallbackReason };

export type StationAdminReadResult = StationDetailReadResult;

export type StationAdminAuditReadResult =
  | { source: "db"; result: "found"; entries: OceanStationAdminAuditEntry[] }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationsFallbackReason };

export type StationAdminUpdateResult =
  | { source: "db"; result: "updated"; station: OceanStationDetail }
  | { source: "db"; result: "not_found" }
  | { source: "db"; result: "invalid"; message: string }
  | { source: "mock"; fallbackReason: OceanStationsFallbackReason };

function formatRelativeUpdated(value: string | null, now = Date.now()): string {
  if (!value) {
    return "Unknown";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown";
  }

  const diffMs = now - timestamp.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));

  if (diffMinutes < 1) {
    return "Just now";
  }

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);

  return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
}

function normalizeSeverity(value: string): OceanStationAlertSeverity {
  if (value === "high" || value === "medium" || value === "low") {
    return value;
  }

  return "medium";
}

function normalizeAccentColor(value: string | null): OceanStationThemeAccent {
  if (value === "cyan" || value === "emerald" || value === "amber" || value === "violet" || value === "rose") {
    return value;
  }

  return "cyan";
}

function normalizeViewType(value: string): OceanStationViewType | null {
  if (value === "detail" || value === "exhibit" || value === "public") {
    return value;
  }

  return null;
}

function normalizeAdminAuditRole(value: string): OceanStationAdminAuditEntry["actorRole"] {
  if (value === "admin" || value === "viewer") {
    return value;
  }

  return "unknown";
}

function parseChangedFields(value: string | null): string[] {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

function deriveChangedFieldNames(patch: OceanStationAdminPatch): string[] {
  const fields: string[] = [];

  if (patch.sponsorName !== undefined) fields.push("sponsorName");
  if (patch.operatorName !== undefined) fields.push("operatorName");
  if (patch.exhibitTitle !== undefined) fields.push("exhibitTitle");
  if (patch.publicDescription !== undefined) fields.push("publicDescription");
  if (patch.accentColor !== undefined) fields.push("accentColor");
  if (patch.species !== undefined) fields.push("species");
  if (patch.alerts !== undefined) fields.push("alerts");
  if (patch.timeline !== undefined) fields.push("timeline");
  if (patch.content !== undefined) fields.push("content");

  return fields;
}

function deriveAuditAreas(patch: OceanStationAdminPatch): OceanStationAdminAuditArea[] {
  const areas = new Set<OceanStationAdminAuditArea>();

  if (
    patch.sponsorName !== undefined
    || patch.operatorName !== undefined
    || patch.exhibitTitle !== undefined
    || patch.publicDescription !== undefined
    || patch.accentColor !== undefined
  ) {
    areas.add("branding");
  }

  if (
    patch.species !== undefined
    || patch.alerts !== undefined
    || patch.timeline !== undefined
    || patch.content !== undefined
  ) {
    areas.add("content");
  }

  return [...areas];
}

function changedFieldsForArea(area: OceanStationAdminAuditArea, changedFields: string[]): string[] {
  if (area === "branding") {
    return changedFields.filter((field) => (
      field === "sponsorName"
      || field === "operatorName"
      || field === "exhibitTitle"
      || field === "publicDescription"
      || field === "accentColor"
    ));
  }

  return changedFields.filter((field) => (
    field === "species"
    || field === "alerts"
    || field === "timeline"
    || field === "content"
  ));
}

interface NormalizedSpeciesItem {
  name: string;
  status: string;
  populationTrend: string;
  notes: string;
}

interface NormalizedAlertItem {
  title: string;
  severity: OceanStationAlertSeverity;
  status: string;
  detail: string;
}

interface NormalizedTimelineItem {
  label: string;
  phase: string;
  detail: string;
}

interface NormalizedContentItem {
  contentType: string;
  title: string;
  summary: string;
  href: string | null;
}

interface NormalizedAdminPatch {
  sponsorName?: string;
  operatorName?: string;
  exhibitTitle?: string;
  publicDescription?: string;
  accentColor?: OceanStationThemeAccent;
  species?: NormalizedSpeciesItem[];
  alerts?: NormalizedAlertItem[];
  timeline?: NormalizedTimelineItem[];
  content?: NormalizedContentItem[];
}

function normalizeTextField(
  label: string,
  value: string | undefined,
  maxLength: number,
): { ok: true; value: string | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  const normalized = value.trim();

  if (!normalized) {
    return { ok: false, message: `${label} cannot be empty.` };
  }

  if (normalized.length > maxLength) {
    return { ok: false, message: `${label} must be ${maxLength} characters or fewer.` };
  }

  return { ok: true, value: normalized };
}

function normalizeStationSpeciesItems(
  value: OceanStationAdminSpeciesItem[] | undefined,
): { ok: true; value: NormalizedSpeciesItem[] | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value.length > 12) {
    return { ok: false, message: "Species editor supports at most 12 records." };
  }

  const items: NormalizedSpeciesItem[] = [];

  for (const [index, item] of value.entries()) {
    const name = normalizeTextField(`Species ${index + 1} name`, item.name, 120);
    if (!name.ok) return name;
    const status = normalizeTextField(`Species ${index + 1} status`, item.status, 60);
    if (!status.ok) return status;
    const trend = normalizeTextField(`Species ${index + 1} trend`, item.populationTrend, 160);
    if (!trend.ok) return trend;
    const notes = normalizeTextField(`Species ${index + 1} notes`, item.notes, 300);
    if (!notes.ok) return notes;

    items.push({
      name: name.value!,
      status: status.value!,
      populationTrend: trend.value!,
      notes: notes.value!,
    });
  }

  return { ok: true, value: items };
}

function normalizeStationAlerts(
  value: OceanStationAdminContentPatch["alerts"],
): { ok: true; value: NormalizedAlertItem[] | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value.length > 16) {
    return { ok: false, message: "Alert editor supports at most 16 records." };
  }

  const items: NormalizedAlertItem[] = [];

  for (const [index, item] of value.entries()) {
    const title = normalizeTextField(`Alert ${index + 1} title`, item.title, 160);
    if (!title.ok) return title;
    const status = normalizeTextField(`Alert ${index + 1} status`, item.status, 80);
    if (!status.ok) return status;
    const detail = normalizeTextField(`Alert ${index + 1} detail`, item.detail, 320);
    if (!detail.ok) return detail;

    if (item.severity !== "high" && item.severity !== "medium" && item.severity !== "low") {
      return { ok: false, message: `Alert ${index + 1} severity must be high, medium, or low.` };
    }

    items.push({
      title: title.value!,
      severity: item.severity,
      status: status.value!,
      detail: detail.value!,
    });
  }

  return { ok: true, value: items };
}

function normalizeStationTimeline(
  value: OceanStationAdminTimelineItem[] | undefined,
): { ok: true; value: NormalizedTimelineItem[] | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value.length > 16) {
    return { ok: false, message: "Timeline editor supports at most 16 records." };
  }

  const items: NormalizedTimelineItem[] = [];

  for (const [index, item] of value.entries()) {
    const label = normalizeTextField(`Timeline ${index + 1} label`, item.label, 120);
    if (!label.ok) return label;
    const phase = normalizeTextField(`Timeline ${index + 1} phase`, item.phase, 80);
    if (!phase.ok) return phase;
    const detail = normalizeTextField(`Timeline ${index + 1} detail`, item.detail, 320);
    if (!detail.ok) return detail;

    items.push({
      label: label.value!,
      phase: phase.value!,
      detail: detail.value!,
    });
  }

  return { ok: true, value: items };
}

function normalizeStationContent(
  value: OceanStationAdminContentItem[] | undefined,
): { ok: true; value: NormalizedContentItem[] | undefined } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }

  if (value.length > 16) {
    return { ok: false, message: "Educational content editor supports at most 16 records." };
  }

  const items: NormalizedContentItem[] = [];

  for (const [index, item] of value.entries()) {
    const contentType = normalizeTextField(`Content ${index + 1} type`, item.contentType, 80);
    if (!contentType.ok) return contentType;
    const title = normalizeTextField(`Content ${index + 1} title`, item.title, 140);
    if (!title.ok) return title;
    const summary = normalizeTextField(`Content ${index + 1} summary`, item.summary, 320);
    if (!summary.ok) return summary;

    const href = item.href === undefined || item.href === null ? null : item.href.trim();

    items.push({
      contentType: contentType.value!,
      title: title.value!,
      summary: summary.value!,
      href: href && href.length > 0 ? href : null,
    });
  }

  return { ok: true, value: items };
}

function normalizeAdminPatch(
  patch: OceanStationAdminPatch,
): { ok: true; value: NormalizedAdminPatch } | { ok: false; message: string } {
  const sponsorName = normalizeTextField("Sponsor name", patch.sponsorName, 120);
  if (!sponsorName.ok) return sponsorName;
  const operatorName = normalizeTextField("Operator name", patch.operatorName, 120);
  if (!operatorName.ok) return operatorName;
  const exhibitTitle = normalizeTextField("Exhibit title", patch.exhibitTitle, 140);
  if (!exhibitTitle.ok) return exhibitTitle;
  const publicDescription = normalizeTextField("Public description", patch.publicDescription, 360);
  if (!publicDescription.ok) return publicDescription;

  if (
    patch.accentColor !== undefined
    && patch.accentColor !== "cyan"
    && patch.accentColor !== "emerald"
    && patch.accentColor !== "amber"
    && patch.accentColor !== "violet"
    && patch.accentColor !== "rose"
  ) {
    return { ok: false, message: "Accent color is invalid." };
  }

  const species = normalizeStationSpeciesItems(patch.species);
  if (!species.ok) return species;
  const alerts = normalizeStationAlerts(patch.alerts);
  if (!alerts.ok) return alerts;
  const timeline = normalizeStationTimeline(patch.timeline);
  if (!timeline.ok) return timeline;
  const content = normalizeStationContent(patch.content);
  if (!content.ok) return content;

  return {
    ok: true,
    value: {
      sponsorName: sponsorName.value,
      operatorName: operatorName.value,
      exhibitTitle: exhibitTitle.value,
      publicDescription: publicDescription.value,
      accentColor: patch.accentColor,
      species: species.value,
      alerts: alerts.value,
      timeline: timeline.value,
      content: content.value,
    },
  };
}

function buildBranding(row: StationRow): OceanStationBranding {
  return {
    sponsorName: row.sponsor_name ?? "Marine Bio Partner Network",
    operatorName: row.operator_name ?? "Ocean Systems Lab",
    logoUrl: row.logo_url,
    logoLabel: row.logo_label ?? `${row.name} Mark`,
    exhibitTitle: row.exhibit_title ?? `${row.name} Exhibit`,
    accentColor: normalizeAccentColor(row.accent_color),
    publicDescription: row.public_description ?? row.summary,
  };
}

function toStationSummary(row: StationRow, now: number): OceanStationSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    region: row.region ?? "Unassigned",
    status: row.status,
    summary: row.summary,
    locationLabel: row.location_label,
    depthM: row.depth_m,
    lastReported: formatRelativeUpdated(row.last_reported_at, now),
    heroMetric: row.hero_metric ?? "No active metric",
    branding: buildBranding(row),
  };
}

function querySpecies(db: SqliteDatabaseLike, stationId: string, now: number): OceanStationSpecies[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, status, population_trend, observed_at, notes
         FROM station_species
         WHERE station_id = ?
         ORDER BY sort_order ASC, observed_at DESC, id ASC`,
      )
      .all(stationId) as SpeciesRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      status: row.status,
      populationTrend: row.population_trend ?? "No trend available",
      observedAt: formatRelativeUpdated(row.observed_at, now),
      notes: row.notes ?? "No field notes provided.",
    }));
  } catch {
    return [];
  }
}

function querySensors(db: SqliteDatabaseLike, stationId: string, now: number): OceanStationSensor[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, name, category, value, unit, status, sampled_at
         FROM station_sensors
         WHERE station_id = ?
         ORDER BY sort_order ASC, sampled_at DESC, id ASC`,
      )
      .all(stationId) as SensorRow[];

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      value: row.value,
      unit: row.unit,
      status: row.status,
      sampledAt: formatRelativeUpdated(row.sampled_at, now),
    }));
  } catch {
    return [];
  }
}

function queryAlerts(db: SqliteDatabaseLike, stationId: string, now: number): OceanStationAlert[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, title, severity, status, detail, detected_at, acknowledged_at, acknowledged_by
         FROM station_alerts
         WHERE station_id = ?
         ORDER BY detected_at DESC, id ASC`,
      )
      .all(stationId) as AlertRow[];

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      severity: normalizeSeverity(row.severity),
      status: row.status,
      detail: row.detail ?? "No alert detail provided.",
      detectedAt: formatRelativeUpdated(row.detected_at, now),
      acknowledgedAt: row.acknowledged_at ?? null,
      acknowledgedBy: row.acknowledged_by ?? null,
    }));
  } catch {
    return [];
  }
}

function formatTimelineTime(value: string | null): string {
  if (!value) {
    return "Unknown";
  }

  const timestamp = new Date(value);

  if (Number.isNaN(timestamp.getTime())) {
    return "Unknown";
  }

  return timestamp.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function queryTimeline(db: SqliteDatabaseLike, stationId: string): OceanStationTimelineItem[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, label, phase, detail, happened_at
         FROM station_timelines
         WHERE station_id = ?
         ORDER BY sort_order ASC, happened_at DESC, id ASC`,
      )
      .all(stationId) as TimelineRow[];

    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      phase: row.phase,
      detail: row.detail,
      happenedAt: formatTimelineTime(row.happened_at),
    }));
  } catch {
    return [];
  }
}

function queryContent(db: SqliteDatabaseLike, stationId: string, now: number): OceanStationContentItem[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, content_type, title, summary, href, published_at
         FROM station_content
         WHERE station_id = ?
         ORDER BY sort_order ASC, published_at DESC, id ASC`,
      )
      .all(stationId) as ContentRow[];

    return rows.map((row) => ({
      id: row.id,
      contentType: row.content_type,
      title: row.title,
      summary: row.summary,
      href: row.href,
      publishedAt: formatRelativeUpdated(row.published_at, now),
    }));
  } catch {
    return [];
  }
}

function queryStationAdminAudits(db: SqliteDatabaseLike, stationId: string): OceanStationAdminAuditEntry[] {
  try {
    const rows = db
      .prepare(
        `SELECT id, station_id, actor_id, actor_role, area, changed_fields, changed_at
         FROM station_admin_audits
         WHERE station_id = ?
         ORDER BY changed_at DESC, id DESC
         LIMIT 25`,
      )
      .all(stationId) as StationAdminAuditRow[];

    return rows
      .filter((row) => row.area === "branding" || row.area === "content")
      .map((row) => ({
        id: row.id,
        stationId: row.station_id,
        actorId: row.actor_id,
        actorRole: normalizeAdminAuditRole(row.actor_role),
        area: row.area as OceanStationAdminAuditArea,
        changedAt: row.changed_at,
        changedFields: parseChangedFields(row.changed_fields),
      }));
  } catch {
    return [];
  }
}

function buildAnalytics(stationId: string, row: AnalyticsAggregateRow | undefined): OceanStationAnalytics {
  const detailViews = Number(row?.detail_views ?? 0);
  const exhibitViews = Number(row?.exhibit_views ?? 0);
  const publicViews = Number(row?.public_views ?? 0);

  return {
    stationId,
    views: {
      detail: detailViews,
      exhibit: exhibitViews,
      public: publicViews,
      total: detailViews + exhibitViews + publicViews,
    },
    lastViewedAt: row?.last_viewed_at ?? null,
  };
}

function resolveStationRow(db: SqliteDatabaseLike, stationIdOrSlug: string): StationRow | null {
  const rows = db
    .prepare(
      `SELECT
        s.id,
        s.slug,
        s.name,
        r.name AS region,
        s.status,
        s.summary,
        s.location_label,
        s.depth_m,
        s.last_reported_at,
        s.hero_metric,
        s.sponsor_name,
        s.operator_name,
        s.logo_url,
        s.logo_label,
        s.exhibit_title,
        s.accent_color,
        s.public_description
       FROM stations s
       LEFT JOIN regions r ON r.id = s.region_id
       WHERE s.id = ? OR s.slug = ?
       ORDER BY s.updated_at DESC, s.created_at DESC, s.id ASC
       LIMIT 1`,
    )
    .all(stationIdOrSlug, stationIdOrSlug) as StationRow[];

  return rows[0] ?? null;
}

function buildStationDetailFromRow(db: SqliteDatabaseLike, stationRow: StationRow, now: number): OceanStationDetail {
  const summary = toStationSummary(stationRow, now);

  return {
    ...summary,
    species: querySpecies(db, stationRow.id, now),
    sensors: querySensors(db, stationRow.id, now),
    alerts: queryAlerts(db, stationRow.id, now),
    timeline: queryTimeline(db, stationRow.id),
    content: queryContent(db, stationRow.id, now),
  };
}

function replaceStationSpecies(
  db: SqliteDatabaseLike,
  stationId: string,
  species: NormalizedSpeciesItem[],
  nowIso: string,
) {
  const deleteStatement = db.prepare("DELETE FROM station_species WHERE station_id = ?");
  const insertStatement = db.prepare(
    `INSERT INTO station_species (id, station_id, name, status, population_trend, observed_at, notes, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  if (!deleteStatement.run || !insertStatement.run) {
    throw new Error("Writable station species statements are unavailable");
  }

  deleteStatement.run(stationId);

  for (const [index, item] of species.entries()) {
    insertStatement.run(
      `SPC-${stationId}-${String(index + 1).padStart(3, "0")}`,
      stationId,
      item.name,
      item.status,
      item.populationTrend,
      nowIso,
      item.notes,
      index + 1,
    );
  }
}

function replaceStationAlerts(
  db: SqliteDatabaseLike,
  stationId: string,
  alerts: NormalizedAlertItem[],
  nowIso: string,
) {
  const deleteStatement = db.prepare("DELETE FROM station_alerts WHERE station_id = ?");
  const insertStatement = db.prepare(
    `INSERT INTO station_alerts (id, station_id, title, severity, status, detail, detected_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  if (!deleteStatement.run || !insertStatement.run) {
    throw new Error("Writable station alert statements are unavailable");
  }

  deleteStatement.run(stationId);

  for (const [index, item] of alerts.entries()) {
    insertStatement.run(
      `STA-ALT-${stationId}-${String(index + 1).padStart(3, "0")}`,
      stationId,
      item.title,
      item.severity,
      item.status,
      item.detail,
      nowIso,
    );
  }
}

function replaceStationTimeline(
  db: SqliteDatabaseLike,
  stationId: string,
  timeline: NormalizedTimelineItem[],
  nowIso: string,
) {
  const deleteStatement = db.prepare("DELETE FROM station_timelines WHERE station_id = ?");
  const insertStatement = db.prepare(
    `INSERT INTO station_timelines (id, station_id, label, phase, detail, happened_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  if (!deleteStatement.run || !insertStatement.run) {
    throw new Error("Writable station timeline statements are unavailable");
  }

  deleteStatement.run(stationId);

  for (const [index, item] of timeline.entries()) {
    insertStatement.run(
      `STL-${stationId}-${String(index + 1).padStart(3, "0")}`,
      stationId,
      item.label,
      item.phase,
      item.detail,
      nowIso,
      index + 1,
    );
  }
}

function replaceStationContent(
  db: SqliteDatabaseLike,
  stationId: string,
  content: NormalizedContentItem[],
  nowIso: string,
) {
  const deleteStatement = db.prepare("DELETE FROM station_content WHERE station_id = ?");
  const insertStatement = db.prepare(
    `INSERT INTO station_content (id, station_id, content_type, title, summary, href, published_at, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  if (!deleteStatement.run || !insertStatement.run) {
    throw new Error("Writable station content statements are unavailable");
  }

  deleteStatement.run(stationId);

  for (const [index, item] of content.entries()) {
    insertStatement.run(
      `CNT-${stationId}-${String(index + 1).padStart(3, "0")}`,
      stationId,
      item.contentType,
      item.title,
      item.summary,
      item.href,
      nowIso,
      index + 1,
    );
  }
}

export function listStations(
  dependencies: StationRepositoryDependencies = {},
): StationListReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const rows = db
      .prepare(
        `SELECT
          s.id,
          s.slug,
          s.name,
          r.name AS region,
          s.status,
          s.summary,
          s.location_label,
          s.depth_m,
          s.last_reported_at,
          s.hero_metric,
          s.sponsor_name,
          s.operator_name,
          s.logo_url,
          s.logo_label,
          s.exhibit_title,
          s.accent_color,
          s.public_description
         FROM stations s
         LEFT JOIN regions r ON r.id = s.region_id
         ORDER BY s.updated_at DESC, s.created_at DESC, s.id ASC`,
      )
      .all() as StationRow[];

    return {
      source: "db",
      stations: rows.map((row) => toStationSummary(row, now())),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function getStationById(
  stationIdOrSlug: string,
  dependencies: StationRepositoryDependencies = {},
): StationDetailReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const stationRow = resolveStationRow(db, stationIdOrSlug);

    if (!stationRow) {
      return { source: "db", result: "not_found" };
    }

    const nowMs = now();

    return {
      source: "db",
      result: "found",
      station: buildStationDetailFromRow(db, stationRow, nowMs),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function recordStationPageView(
  stationIdOrSlug: string,
  viewType: OceanStationViewType,
  dependencies: StationRepositoryDependencies = {},
): StationViewTrackResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const stationRow = resolveStationRow(db, stationIdOrSlug);

    if (!stationRow) {
      return { source: "db", result: "not_found" };
    }

    const normalizedViewType = normalizeViewType(viewType);

    if (!normalizedViewType) {
      return { source: "db", result: "not_found" };
    }

    const viewedAt = new Date(now()).toISOString();
    const insertStatement = db.prepare(
      `INSERT INTO station_page_views (id, station_id, view_type, viewed_at)
       VALUES (?, ?, ?, ?)`,
    );

    if (!insertStatement.run) {
      throw new Error("Writable statement does not support run");
    }

    insertStatement.run(
      `SPV-${stationRow.id}-${normalizedViewType}-${now()}-${Math.round(Math.random() * 1_000_000)}`,
      stationRow.id,
      normalizedViewType,
      viewedAt,
    );

    return {
      source: "db",
      result: "recorded",
      stationId: stationRow.id,
      viewType: normalizedViewType,
      viewedAt,
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function getStationAnalytics(
  stationIdOrSlug: string,
  dependencies: StationRepositoryDependencies = {},
): StationAnalyticsReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const stationRow = resolveStationRow(db, stationIdOrSlug);

    if (!stationRow) {
      return { source: "db", result: "not_found" };
    }

    const rows = db
      .prepare(
        `SELECT
          COALESCE(SUM(CASE WHEN view_type = 'detail' THEN 1 ELSE 0 END), 0) AS detail_views,
          COALESCE(SUM(CASE WHEN view_type = 'exhibit' THEN 1 ELSE 0 END), 0) AS exhibit_views,
          COALESCE(SUM(CASE WHEN view_type = 'public' THEN 1 ELSE 0 END), 0) AS public_views,
          MAX(viewed_at) AS last_viewed_at
         FROM station_page_views
         WHERE station_id = ?`,
      )
      .all(stationRow.id) as AnalyticsAggregateRow[];

    return {
      source: "db",
      result: "found",
      analytics: buildAnalytics(stationRow.id, rows[0]),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function getStationAdminById(
  stationIdOrSlug: string,
  dependencies: StationRepositoryDependencies = {},
): StationAdminReadResult {
  return getStationById(stationIdOrSlug, dependencies);
}

export function getStationAdminAuditById(
  stationIdOrSlug: string,
  dependencies: StationRepositoryDependencies = {},
): StationAdminAuditReadResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openDatabase = dependencies.openDatabase ?? openReadOnlyDatabase;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openDatabase(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const stationRow = resolveStationRow(db, stationIdOrSlug);

    if (!stationRow) {
      return { source: "db", result: "not_found" };
    }

    return {
      source: "db",
      result: "found",
      entries: queryStationAdminAudits(db, stationRow.id),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function updateStationAdmin(
  stationIdOrSlug: string,
  patch: OceanStationAdminPatch,
  dependencies: StationRepositoryDependencies = {},
  authContext?: OceanStationAdminAuthContext,
): StationAdminUpdateResult {
  const normalized = normalizeAdminPatch(patch);

  if (!normalized.ok) {
    return {
      source: "db",
      result: "invalid",
      message: normalized.message,
    };
  }

  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const now = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const stationRow = resolveStationRow(db, stationIdOrSlug);

    if (!stationRow) {
      return { source: "db", result: "not_found" };
    }

    const updateStationStatement = db.prepare(
      `UPDATE stations
       SET
         sponsor_name = COALESCE(?, sponsor_name),
         operator_name = COALESCE(?, operator_name),
         exhibit_title = COALESCE(?, exhibit_title),
         accent_color = COALESCE(?, accent_color),
         public_description = COALESCE(?, public_description),
         updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    );

    if (!updateStationStatement.run) {
      throw new Error("Writable station update statement is unavailable");
    }

    updateStationStatement.run(
      normalized.value.sponsorName ?? null,
      normalized.value.operatorName ?? null,
      normalized.value.exhibitTitle ?? null,
      normalized.value.accentColor ?? null,
      normalized.value.publicDescription ?? null,
      stationRow.id,
    );

    const nowIso = new Date(now()).toISOString();
    const changedFields = deriveChangedFieldNames(patch);
    const auditAreas = deriveAuditAreas(patch);

    if (normalized.value.species) {
      replaceStationSpecies(db, stationRow.id, normalized.value.species, nowIso);
    }

    if (normalized.value.alerts) {
      replaceStationAlerts(db, stationRow.id, normalized.value.alerts, nowIso);
    }

    if (normalized.value.timeline) {
      replaceStationTimeline(db, stationRow.id, normalized.value.timeline, nowIso);
    }

    if (normalized.value.content) {
      replaceStationContent(db, stationRow.id, normalized.value.content, nowIso);
    }

    if (auditAreas.length > 0 && changedFields.length > 0) {
      const insertAuditStatement = db.prepare(
        `INSERT INTO station_admin_audits
           (id, station_id, actor_id, actor_role, area, changed_fields, changed_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      );

      if (!insertAuditStatement.run) {
        throw new Error("Writable station admin audit statement is unavailable");
      }

      const actorId = authContext?.actorId?.trim() || "system";
      const actorRole = authContext?.role ?? "unknown";

      for (const area of auditAreas) {
        const scopedFields = changedFieldsForArea(area, changedFields);

        insertAuditStatement.run(
          `AUD-${stationRow.id}-${area}-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
          stationRow.id,
          actorId,
          actorRole,
          area,
          JSON.stringify(scopedFields),
          nowIso,
        );
      }
    }

    const refreshedStationRow = resolveStationRow(db, stationRow.id);

    if (!refreshedStationRow) {
      return { source: "db", result: "not_found" };
    }

    return {
      source: "db",
      result: "updated",
      station: buildStationDetailFromRow(db, refreshedStationRow, now()),
    };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}

export function updateStationBranding(
  stationIdOrSlug: string,
  patch: OceanStationAdminBrandingPatch,
  dependencies: StationRepositoryDependencies = {},
  authContext?: OceanStationAdminAuthContext,
): StationAdminUpdateResult {
  return updateStationAdmin(stationIdOrSlug, patch, dependencies, authContext);
}

export function updateStationContent(
  stationIdOrSlug: string,
  patch: OceanStationAdminContentPatch,
  dependencies: StationRepositoryDependencies = {},
  authContext?: OceanStationAdminAuthContext,
): StationAdminUpdateResult {
  return updateStationAdmin(stationIdOrSlug, patch, dependencies, authContext);
}

export type StationAlertAcknowledgeResult =
  | { source: "db"; result: "acknowledged"; alert: OceanStationAlert; timelineEvent?: OceanStationTimelineItem }
  | { source: "db"; result: "not_found" }
  | { source: "db"; result: "already_acknowledged"; alert: OceanStationAlert }
  | { source: "mock"; fallbackReason: string };

export function acknowledgeStationAlert(
  stationIdOrSlug: string,
  alertId: string,
  actorId: string,
  dependencies: StationRepositoryDependencies = {},
): StationAlertAcknowledgeResult {
  const resolvePath = dependencies.resolvePath ?? resolveDatabasePath;
  const hasPath = dependencies.hasPath ?? hasDatabasePath;
  const openWritable = dependencies.openWritable ?? openWritableDatabase;
  const nowFn = dependencies.now ?? Date.now;
  const databasePath = resolvePath();

  if (!hasPath(databasePath)) {
    return { source: "mock", fallbackReason: "db_path_missing" };
  }

  let db: SqliteDatabaseLike;

  try {
    db = openWritable(databasePath);
  } catch {
    return { source: "mock", fallbackReason: "db_open_failed" };
  }

  try {
    const stationRow = resolveStationRow(db, stationIdOrSlug);

    if (!stationRow) {
      return { source: "db", result: "not_found" };
    }

    const alertCheckRows = db
      .prepare("SELECT id, title, acknowledged_at FROM station_alerts WHERE id = ? AND station_id = ?")
      .all(alertId, stationRow.id) as Array<{ id: string; title: string; acknowledged_at: string | null }>;
    const alertCheck = alertCheckRows[0];

    if (!alertCheck) {
      return { source: "db", result: "not_found" };
    }

    const nowMs = nowFn();
    const nowIso = new Date(nowMs).toISOString();

    if (alertCheck.acknowledged_at !== null) {
      const existing = queryAlerts(db, stationRow.id, nowMs).find((a) => a.id === alertId);
      return {
        source: "db",
        result: "already_acknowledged",
        alert: existing ?? { id: alertId, title: "", severity: "low", status: "acknowledged", detail: "", detectedAt: "", acknowledgedAt: alertCheck.acknowledged_at, acknowledgedBy: null },
      };
    }

    const updateStatement = db.prepare(
      `UPDATE station_alerts
       SET status = 'acknowledged', acknowledged_at = ?, acknowledged_by = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND station_id = ?`,
    );

    if (!updateStatement.run) {
      throw new Error("Writable alert update statement is unavailable");
    }

    updateStatement.run(nowIso, actorId, alertId, stationRow.id);

    const timelineSummaryRows = db
      .prepare("SELECT COALESCE(MAX(sort_order), 0) AS max_sort_order FROM station_timelines WHERE station_id = ?")
      .all(stationRow.id) as Array<{ max_sort_order: number | null }>;
    const nextSortOrder = Number(timelineSummaryRows[0]?.max_sort_order ?? 0) + 1;
    const timelineId = `STL-ACK-${alertId}-${nowMs}`;
    const timelineEvent: OceanStationTimelineItem = {
      id: timelineId,
      label: "Alert acknowledged",
      phase: "Response",
      detail: `${alertCheck.title} acknowledged by ${actorId}.`,
      happenedAt: nowIso,
    };
    const insertTimelineStatement = db.prepare(
      `INSERT INTO station_timelines (id, station_id, label, phase, detail, happened_at, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );

    if (!insertTimelineStatement.run) {
      throw new Error("Writable station timeline statement is unavailable");
    }

    insertTimelineStatement.run(
      timelineEvent.id,
      stationRow.id,
      timelineEvent.label,
      timelineEvent.phase,
      timelineEvent.detail,
      timelineEvent.happenedAt,
      nextSortOrder,
    );

    const updated = queryAlerts(db, stationRow.id, nowMs).find((a) => a.id === alertId);

    if (!updated) {
      return { source: "db", result: "not_found" };
    }

    return { source: "db", result: "acknowledged", alert: updated, timelineEvent };
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  } finally {
    db.close();
  }
}
