import { apiMockData } from "../data";
import type {
  OceanStationAdminAuditResponse,
  OceanStationAdminAuditTelemetry,
  OceanStationAdminResponse,
  OceanStationAdminTelemetry,
  OceanStationAdminPatch,
  OceanStationAdminBrandingPatch,
  OceanStationAdminContentPatch,
  OceanStationAnalyticsResponse,
  OceanStationAnalyticsTelemetry,
  OceanStationDetailTelemetry,
  OceanStationsResponse,
  OceanStationsTelemetry,
  RouteDefinition,
  OceanStationsFallbackReason,
  StationAlertAcknowledgeRequest,
  StationAlertAcknowledgeResponse,
  StationAlertAcknowledgeTelemetry,
  StationBrandingPatchRequest,
  StationContentPatchRequest,
  StationDetailResponse,
  StationPatchRequest,
  StationPatchResponse,
  StationPatchTelemetry,
  StationViewTrackRequest,
  StationViewTrackResponse,
  StationViewTrackTelemetry,
  OceanStationAdminPermission,
} from "../types";

type StationListReadResult =
  | { source: "db"; stations: OceanStationsResponse["stations"] }
  | { source: "mock"; fallbackReason: OceanStationsTelemetry["fallbackReason"] };

type StationDetailReadResult =
  | { source: "db"; result: "found"; station: StationDetailResponse }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationDetailTelemetry["fallbackReason"] };

type StationAnalyticsReadResult =
  | { source: "db"; result: "found"; analytics: OceanStationAnalyticsResponse["analytics"] }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationAnalyticsTelemetry["fallbackReason"] };

type StationViewTrackResult =
  | { source: "db"; result: "recorded"; stationId: string; viewType: StationViewTrackResponse["viewType"]; viewedAt: string }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: StationViewTrackTelemetry["fallbackReason"] };

type StationAdminReadResult =
  | { source: "db"; result: "found"; station: StationDetailResponse }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationAdminTelemetry["fallbackReason"] };

type StationAdminAuditReadResult =
  | { source: "db"; result: "found"; entries: OceanStationAdminAuditResponse["entries"] }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationAdminAuditTelemetry["fallbackReason"] };

type StationAdminUpdateResult =
  | { source: "db"; result: "updated"; station: StationDetailResponse }
  | { source: "db"; result: "not_found" }
  | { source: "db"; result: "invalid"; message: string }
  | { source: "mock"; fallbackReason: StationPatchTelemetry["fallbackReason"] };

type StationAdminAuth = {
  actorId: string;
  role: "admin" | "viewer";
  permissions: OceanStationAdminPermission[];
  csrfToken: string;
};

const mockStationAdminAudits: Record<string, OceanStationAdminAuditResponse["entries"]> = {};

function hasPermission(
  auth: StationAdminAuth | undefined,
  permission: StationAdminAuth["permissions"][number],
): auth is StationAdminAuth {
  if (!auth) {
    return false;
  }

  return auth.permissions.includes(permission);
}

function hasAnyPermission(
  auth: StationAdminAuth | undefined,
  permissions: StationAdminAuth["permissions"],
): auth is StationAdminAuth {
  if (!auth) {
    return false;
  }

  return permissions.some((permission) => auth.permissions.includes(permission));
}

function hasValidCsrfToken(
  auth: StationAdminAuth | undefined,
  submittedCsrfToken: string | undefined,
): auth is StationAdminAuth {
  if (!auth) {
    return false;
  }

  const normalized = (submittedCsrfToken ?? "").trim();

  if (!normalized) {
    return false;
  }

  return normalized === auth.csrfToken;
}

function requiredPermissionsForPatch(
  patch: OceanStationAdminPatch,
): StationAdminAuth["permissions"] {
  const permissions = new Set<StationAdminAuth["permissions"][number]>();

  if (
    patch.sponsorName !== undefined
    || patch.operatorName !== undefined
    || patch.exhibitTitle !== undefined
    || patch.publicDescription !== undefined
    || patch.accentColor !== undefined
  ) {
    permissions.add("station.edit_branding");
  }

  if (
    patch.species !== undefined
    || patch.alerts !== undefined
    || patch.timeline !== undefined
    || patch.content !== undefined
  ) {
    permissions.add("station.edit_content");
  }

  return [...permissions];
}

function changedFieldsFromPatch(patch: OceanStationAdminPatch): string[] {
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

function appendMockAuditEntry(
  stationId: string,
  patch: OceanStationAdminPatch,
  actorId: string,
  actorRole: StationAdminAuth["role"],
) {
  const fields = changedFieldsFromPatch(patch);

  if (fields.length === 0) {
    return;
  }

  const brandingFields = fields.filter((field) => (
    field === "sponsorName"
    || field === "operatorName"
    || field === "exhibitTitle"
    || field === "publicDescription"
    || field === "accentColor"
  ));
  const contentFields = fields.filter((field) => (
    field === "species"
    || field === "alerts"
    || field === "timeline"
    || field === "content"
  ));

  const stationAuditLog = mockStationAdminAudits[stationId] ?? [];

  if (brandingFields.length > 0) {
    stationAuditLog.unshift({
      id: `AUD-${stationId}-branding-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
      stationId,
      actorId,
      actorRole,
      area: "branding",
      changedAt: new Date().toISOString(),
      changedFields: brandingFields,
    });
  }

  if (contentFields.length > 0) {
    stationAuditLog.unshift({
      id: `AUD-${stationId}-content-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`,
      stationId,
      actorId,
      actorRole,
      area: "content",
      changedAt: new Date().toISOString(),
      changedFields: contentFields,
    });
  }

  mockStationAdminAudits[stationId] = stationAuditLog.slice(0, 25);
}

async function readDatabaseStations(): Promise<StationListReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      listStations: () => Promise<StationListReadResult>;
    };

    return await repository.listStations();
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readDatabaseStationById(stationId: string): Promise<StationDetailReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      getStationById: (stationId: string) => Promise<StationDetailReadResult>;
    };

    return await repository.getStationById(stationId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readDatabaseStationAnalytics(stationId: string): Promise<StationAnalyticsReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      getStationAnalytics: (stationId: string) => Promise<StationAnalyticsReadResult>;
    };

    return await repository.getStationAnalytics(stationId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function writeDatabaseStationView(
  stationId: string,
  viewType: StationViewTrackResponse["viewType"],
): Promise<StationViewTrackResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      recordStationPageView: (
        stationId: string,
        viewType: StationViewTrackResponse["viewType"],
      ) => Promise<StationViewTrackResult>;
    };

    return await repository.recordStationPageView(stationId, viewType);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readDatabaseStationAdmin(stationId: string): Promise<StationAdminReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      getStationAdminById: (stationId: string) => Promise<StationAdminReadResult>;
    };

    return await repository.getStationAdminById(stationId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function readDatabaseStationAdminAudit(stationId: string): Promise<StationAdminAuditReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      getStationAdminAuditById: (stationId: string) => Promise<StationAdminAuditReadResult>;
    };

    return await repository.getStationAdminAuditById(stationId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function writeDatabaseStationPatch(
  stationId: string,
  patch: OceanStationAdminPatch,
  auth: StationAdminAuth | undefined,
): Promise<StationAdminUpdateResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      updateStationAdmin: (
        stationId: string,
        patch: OceanStationAdminPatch,
        dependencies?: unknown,
        auth?: StationAdminAuth,
      ) => Promise<StationAdminUpdateResult>;
    };

    return await repository.updateStationAdmin(stationId, patch, undefined, auth);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function writeDatabaseStationBrandingPatch(
  stationId: string,
  patch: OceanStationAdminBrandingPatch,
  auth: StationAdminAuth | undefined,
): Promise<StationAdminUpdateResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      updateStationBranding: (
        stationId: string,
        patch: OceanStationAdminBrandingPatch,
        dependencies?: unknown,
        auth?: StationAdminAuth,
      ) => Promise<StationAdminUpdateResult>;
    };

    return await repository.updateStationBranding(stationId, patch, undefined, auth);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

async function writeDatabaseStationContentPatch(
  stationId: string,
  patch: OceanStationAdminContentPatch,
  auth: StationAdminAuth | undefined,
): Promise<StationAdminUpdateResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      updateStationContent: (
        stationId: string,
        patch: OceanStationAdminContentPatch,
        dependencies?: unknown,
        auth?: StationAdminAuth,
      ) => Promise<StationAdminUpdateResult>;
    };

    return await repository.updateStationContent(stationId, patch, undefined, auth);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

function findMockStationById(stationId: string): StationDetailResponse | null {
  if (apiMockData.oceanStationDetails[stationId]) {
    return apiMockData.oceanStationDetails[stationId]!;
  }

  const bySlug = Object.values(apiMockData.oceanStationDetails).find(
    (station) => station.slug === stationId,
  );

  return bySlug ?? null;
}

function syncMockStationSummary(station: StationDetailResponse) {
  const summaryIndex = apiMockData.oceanStationsData.findIndex((item) => item.id === station.id);

  if (summaryIndex === -1) {
    return;
  }

  apiMockData.oceanStationsData[summaryIndex] = {
    id: station.id,
    slug: station.slug,
    name: station.name,
    region: station.region,
    status: station.status,
    summary: station.summary,
    locationLabel: station.locationLabel,
    depthM: station.depthM,
    lastReported: station.lastReported,
    heroMetric: station.heroMetric,
    branding: { ...station.branding },
  };
}

function applyMockStationPatch(
  stationId: string,
  patch: OceanStationAdminPatch,
): { result: "updated"; station: StationDetailResponse } | { result: "not_found" } {
  const station = findMockStationById(stationId);

  if (!station) {
    return { result: "not_found" };
  }

  if (patch.sponsorName !== undefined) {
    station.branding.sponsorName = patch.sponsorName;
  }

  if (patch.operatorName !== undefined) {
    station.branding.operatorName = patch.operatorName;
  }

  if (patch.exhibitTitle !== undefined) {
    station.branding.exhibitTitle = patch.exhibitTitle;
  }

  if (patch.publicDescription !== undefined) {
    station.branding.publicDescription = patch.publicDescription;
  }

  if (patch.accentColor !== undefined) {
    station.branding.accentColor = patch.accentColor;
  }

  if (patch.species !== undefined) {
    station.species = patch.species.map((item, index) => ({
      id: `SPC-${station.id}-${String(index + 1).padStart(3, "0")}`,
      name: item.name,
      status: item.status,
      populationTrend: item.populationTrend,
      notes: item.notes,
      observedAt: "Just now",
    }));
  }

  if (patch.alerts !== undefined) {
    station.alerts = patch.alerts.map((item, index) => ({
      id: `STA-ALT-${station.id}-${String(index + 1).padStart(3, "0")}`,
      title: item.title,
      severity: item.severity,
      status: item.status,
      detail: item.detail,
      detectedAt: "Just now",
      acknowledgedAt: null,
      acknowledgedBy: null,
    }));
  }

  if (patch.timeline !== undefined) {
    station.timeline = patch.timeline.map((item, index) => ({
      id: `STL-${station.id}-${String(index + 1).padStart(3, "0")}`,
      label: item.label,
      phase: item.phase,
      detail: item.detail,
      happenedAt: "Just now",
    }));
  }

  if (patch.content !== undefined) {
    station.content = patch.content.map((item, index) => ({
      id: `CNT-${station.id}-${String(index + 1).padStart(3, "0")}`,
      contentType: item.contentType,
      title: item.title,
      summary: item.summary,
      href: item.href ?? null,
      publishedAt: "Just now",
    }));
  }

  syncMockStationSummary(station);
  return { result: "updated", station };
}

function findMockStationAnalyticsById(stationId: string): OceanStationAnalyticsResponse["analytics"] | null {
  const byId = apiMockData.oceanStationAnalytics[stationId];

  if (byId) {
    return byId;
  }

  const station = findMockStationById(stationId);

  if (!station) {
    return null;
  }

  return apiMockData.oceanStationAnalytics[station.id] ?? null;
}

export async function buildStationsRouteResponse(
  readResultPromise = readDatabaseStations(),
): Promise<{ status: 200; json: OceanStationsResponse; telemetry: OceanStationsTelemetry }> {
  const readResult = await readResultPromise;
  const stations =
    readResult.source === "db" ? readResult.stations : apiMockData.oceanStationsData;

  return {
    status: 200,
    json: { stations },
    telemetry: {
      route: "GET /stations",
      source: readResult.source,
      stationCount: stations.length,
      fallbackReason:
        readResult.source === "mock" ? readResult.fallbackReason : undefined,
    },
  };
}

export async function buildStationDetailRouteResponse(
  stationId: string,
  readResultPromise = readDatabaseStationById(stationId),
): Promise<{
  status: 200 | 404;
  json: StationDetailResponse | { message: string };
  telemetry: OceanStationDetailTelemetry;
}> {
  const readResult = await readResultPromise;
  if (readResult.source === "db") {
    if (readResult.result === "found") {
      return {
        status: 200,
        json: readResult.station,
        telemetry: {
          route: "GET /stations/:id",
          stationId,
          source: "db",
          result: "found",
        },
      };
    }

    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "GET /stations/:id",
        stationId,
        source: "db",
        result: "not_found",
      },
    };
  }

  const mockStation = findMockStationById(stationId);

  if (mockStation) {
    return {
      status: 200,
      json: mockStation,
      telemetry: {
        route: "GET /stations/:id",
        stationId,
        source: "mock",
        result: "found",
        fallbackReason: readResult.fallbackReason,
      },
    };
  }

  return {
    status: 404,
    json: { message: "Station not found" },
    telemetry: {
      route: "GET /stations/:id",
      stationId,
      source: "mock",
      result: "not_found",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export async function buildStationAdminRouteResponse(
  stationId: string,
  auth: StationAdminAuth | undefined,
  readResultPromise = readDatabaseStationAdmin(stationId),
): Promise<{
  status: 200 | 403 | 404;
  json: OceanStationAdminResponse | { message: string };
  telemetry: OceanStationAdminTelemetry;
}> {
  if (!hasPermission(auth, "station.view_admin")) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_admin" },
      telemetry: {
        route: "GET /stations/:id/admin",
        stationId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  const readResult = await readResultPromise;
  if (readResult.source === "db") {
    if (readResult.result === "found") {
      return {
        status: 200,
        json: { station: readResult.station },
        telemetry: {
          route: "GET /stations/:id/admin",
          stationId,
          source: "db",
          result: "found",
        },
      };
    }

    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "GET /stations/:id/admin",
        stationId,
        source: "db",
        result: "not_found",
      },
    };
  }

  const mockStation = findMockStationById(stationId);

  if (mockStation) {
    return {
      status: 200,
      json: { station: mockStation },
      telemetry: {
        route: "GET /stations/:id/admin",
        stationId,
        source: "mock",
        result: "found",
        fallbackReason: readResult.fallbackReason,
      },
    };
  }

  return {
    status: 404,
    json: { message: "Station not found" },
    telemetry: {
      route: "GET /stations/:id/admin",
      stationId,
      source: "mock",
      result: "not_found",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export async function buildStationAdminAuditRouteResponse(
  stationId: string,
  auth: StationAdminAuth | undefined,
  readResultPromise = readDatabaseStationAdminAudit(stationId),
): Promise<{
  status: 200 | 403 | 404;
  json: OceanStationAdminAuditResponse | { message: string };
  telemetry: OceanStationAdminAuditTelemetry;
}> {
  if (!hasPermission(auth, "station.view_audit")) {
    return {
      status: 403,
      json: { message: "Missing permission: station.view_audit" },
      telemetry: {
        route: "GET /stations/:id/admin/audit",
        stationId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  const readResult = await readResultPromise;
  if (readResult.source === "db") {
    if (readResult.result === "found") {
      return {
        status: 200,
        json: { entries: readResult.entries },
        telemetry: {
          route: "GET /stations/:id/admin/audit",
          stationId,
          source: "db",
          result: "found",
          entryCount: readResult.entries.length,
        },
      };
    }

    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "GET /stations/:id/admin/audit",
        stationId,
        source: "db",
        result: "not_found",
      },
    };
  }

  const mockStation = findMockStationById(stationId);

  if (!mockStation) {
    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "GET /stations/:id/admin/audit",
        stationId,
        source: "mock",
        result: "not_found",
        fallbackReason: readResult.fallbackReason,
      },
    };
  }

  const entries = mockStationAdminAudits[mockStation.id] ?? [];

  return {
    status: 200,
    json: { entries },
    telemetry: {
      route: "GET /stations/:id/admin/audit",
      stationId,
      source: "mock",
      result: "found",
      entryCount: entries.length,
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export async function buildStationPatchRouteResponse(
  stationId: string,
  patch: OceanStationAdminPatch,
  auth: StationAdminAuth | undefined,
  updateResultPromise = writeDatabaseStationPatch(stationId, patch, auth),
  submittedCsrfToken = auth?.csrfToken,
): Promise<{
  status: 200 | 400 | 403 | 404;
  json: StationPatchResponse | { message: string };
  telemetry: StationPatchTelemetry;
}> {
  if (!hasValidCsrfToken(auth, submittedCsrfToken)) {
    return {
      status: 403,
      json: { message: "CSRF token invalid or missing" },
      telemetry: {
        route: "PATCH /stations/:id",
        stationId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  if (!auth) {
    return {
      status: 403,
      json: { message: "Missing permission: station.edit_branding or station.edit_content" },
      telemetry: {
        route: "PATCH /stations/:id",
        stationId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  const requiredPermissions = requiredPermissionsForPatch(patch);

  if (requiredPermissions.length > 0) {
    const hasRequiredPermissions = requiredPermissions.every((permission) =>
      auth.permissions.includes(permission)
    );

    if (!hasRequiredPermissions) {
      return {
        status: 403,
        json: { message: `Missing permissions: ${requiredPermissions.join(", ")}` },
        telemetry: {
          route: "PATCH /stations/:id",
          stationId,
          source: "db",
          result: "forbidden",
        },
      };
    }
  } else if (!hasAnyPermission(auth, ["station.edit_branding", "station.edit_content"])) {
    return {
      status: 403,
      json: { message: "Missing permission: station.edit_branding or station.edit_content" },
      telemetry: {
        route: "PATCH /stations/:id",
        stationId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  const updateResult = await updateResultPromise;
  if (updateResult.source === "db") {
    if (updateResult.result === "updated") {
      return {
        status: 200,
        json: { station: updateResult.station },
        telemetry: {
          route: "PATCH /stations/:id",
          stationId,
          source: "db",
          result: "updated",
          actorId: auth.actorId,
        },
      };
    }

    if (updateResult.result === "invalid") {
      return {
        status: 400,
        json: { message: updateResult.message },
        telemetry: {
          route: "PATCH /stations/:id",
          stationId,
          source: "db",
          result: "invalid",
          actorId: auth.actorId,
          validationError: updateResult.message,
        },
      };
    }

    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "PATCH /stations/:id",
        stationId,
        source: "db",
        result: "not_found",
        actorId: auth.actorId,
      },
    };
  }

  const patched = applyMockStationPatch(stationId, patch);

  if (patched.result === "not_found") {
    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "PATCH /stations/:id",
        stationId,
        source: "mock",
        result: "not_found",
        actorId: auth.actorId,
        fallbackReason: updateResult.fallbackReason,
      },
    };
  }

  appendMockAuditEntry(patched.station.id, patch, auth.actorId, auth.role);

  return {
    status: 200,
    json: { station: patched.station },
    telemetry: {
      route: "PATCH /stations/:id",
      stationId,
      source: "mock",
      result: "updated",
      actorId: auth.actorId,
      fallbackReason: updateResult.fallbackReason,
    },
  };
}

export async function buildStationBrandingPatchRouteResponse(
  stationId: string,
  patch: OceanStationAdminBrandingPatch,
  auth: StationAdminAuth | undefined,
  updateResultPromise = writeDatabaseStationBrandingPatch(stationId, patch, auth),
  submittedCsrfToken = auth?.csrfToken,
): Promise<{
  status: 200 | 400 | 403 | 404;
  json: StationPatchResponse | { message: string };
  telemetry: StationPatchTelemetry;
}> {
  if (!hasPermission(auth, "station.edit_branding")) {
    return {
      status: 403,
      json: { message: "Missing permission: station.edit_branding" },
      telemetry: {
        route: "PATCH /stations/:id/branding",
        stationId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  const response = await buildStationPatchRouteResponse(
    stationId,
    patch,
    auth,
    updateResultPromise,
    submittedCsrfToken,
  );

  return {
    ...response,
    telemetry: {
      ...response.telemetry,
      route: "PATCH /stations/:id/branding",
    },
  };
}

export async function buildStationContentPatchRouteResponse(
  stationId: string,
  patch: OceanStationAdminContentPatch,
  auth: StationAdminAuth | undefined,
  updateResultPromise = writeDatabaseStationContentPatch(stationId, patch, auth),
  submittedCsrfToken = auth?.csrfToken,
): Promise<{
  status: 200 | 400 | 403 | 404;
  json: StationPatchResponse | { message: string };
  telemetry: StationPatchTelemetry;
}> {
  if (!hasPermission(auth, "station.edit_content")) {
    return {
      status: 403,
      json: { message: "Missing permission: station.edit_content" },
      telemetry: {
        route: "PATCH /stations/:id/content",
        stationId,
        source: "db",
        result: "forbidden",
      },
    };
  }

  const response = await buildStationPatchRouteResponse(
    stationId,
    patch,
    auth,
    updateResultPromise,
    submittedCsrfToken,
  );

  return {
    ...response,
    telemetry: {
      ...response.telemetry,
      route: "PATCH /stations/:id/content",
    },
  };
}

export async function buildStationAnalyticsRouteResponse(
  stationId: string,
  readResultPromise = readDatabaseStationAnalytics(stationId),
): Promise<{
  status: 200 | 404;
  json: OceanStationAnalyticsResponse | { message: string };
  telemetry: OceanStationAnalyticsTelemetry;
}> {
  const readResult = await readResultPromise;
  if (readResult.source === "db") {
    if (readResult.result === "found") {
      return {
        status: 200,
        json: { analytics: readResult.analytics },
        telemetry: {
          route: "GET /stations/:id/analytics",
          stationId,
          source: "db",
          result: "found",
        },
      };
    }

    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "GET /stations/:id/analytics",
        stationId,
        source: "db",
        result: "not_found",
      },
    };
  }

  const mockAnalytics = findMockStationAnalyticsById(stationId);

  if (mockAnalytics) {
    return {
      status: 200,
      json: { analytics: mockAnalytics },
      telemetry: {
        route: "GET /stations/:id/analytics",
        stationId,
        source: "mock",
        result: "found",
        fallbackReason: readResult.fallbackReason,
      },
    };
  }

  return {
    status: 404,
    json: { message: "Station not found" },
    telemetry: {
      route: "GET /stations/:id/analytics",
      stationId,
      source: "mock",
      result: "not_found",
      fallbackReason: readResult.fallbackReason,
    },
  };
}

export async function buildStationViewTrackRouteResponse(
  stationId: string,
  viewType: StationViewTrackRequest["viewType"],
  trackResultPromise = writeDatabaseStationView(stationId, viewType),
): Promise<{
  status: 200 | 400 | 404;
  json: StationViewTrackResponse | { message: string };
  telemetry: StationViewTrackTelemetry;
}> {
  if (viewType !== "detail" && viewType !== "exhibit" && viewType !== "public") {
    return {
      status: 400,
      json: { message: "Invalid view type" },
      telemetry: {
        route: "POST /stations/:id/views",
        stationId,
        viewType: "detail",
        source: "mock",
        result: "not_found",
        fallbackReason: "db_query_failed",
      },
    };
  }

  const trackResult = await trackResultPromise;
  if (trackResult.source === "db") {
    if (trackResult.result === "recorded") {
      return {
        status: 200,
        json: {
          ok: true,
          stationId: trackResult.stationId,
          viewType: trackResult.viewType,
          viewedAt: trackResult.viewedAt,
        },
        telemetry: {
          route: "POST /stations/:id/views",
          stationId,
          viewType,
          source: "db",
          result: "recorded",
        },
      };
    }

    return {
      status: 404,
      json: { message: "Station not found" },
      telemetry: {
        route: "POST /stations/:id/views",
        stationId,
        viewType,
        source: "db",
        result: "not_found",
      },
    };
  }

  return {
    status: 200,
    json: {
      ok: true,
      stationId,
      viewType,
      viewedAt: new Date().toISOString(),
    },
    telemetry: {
      route: "POST /stations/:id/views",
      stationId,
      viewType,
      source: "mock",
      result: "recorded",
      fallbackReason: trackResult.fallbackReason,
    },
  };
}

export const getStationsRoute: RouteDefinition<OceanStationsResponse> = {
  method: "GET",
  path: "/stations",
  async handler() {
    return await buildStationsRouteResponse();
  },
};

export const getStationByIdRoute: RouteDefinition<
  StationDetailResponse | { message: string },
  { id: string }
> = {
  method: "GET",
  path: "/stations/:id",
  async handler(request) {
    const stationId = request.body.id;
    return await buildStationDetailRouteResponse(stationId);
  },
};

export const getStationAdminRoute: RouteDefinition<
  OceanStationAdminResponse | { message: string },
  { id: string }
> = {
  method: "GET",
  path: "/stations/:id/admin",
  async handler(request) {
    return await buildStationAdminRouteResponse(request.body.id, request.auth);
  },
};

export const getStationAdminAuditRoute: RouteDefinition<
  OceanStationAdminAuditResponse | { message: string },
  { id: string }
> = {
  method: "GET",
  path: "/stations/:id/admin/audit",
  async handler(request) {
    return await buildStationAdminAuditRouteResponse(request.body.id, request.auth);
  },
};

export const patchStationRoute: RouteDefinition<
  StationPatchResponse | { message: string },
  StationPatchRequest
> = {
  method: "PATCH",
  path: "/stations/:id",
  async handler(request) {
    return await buildStationPatchRouteResponse(
      request.body.id,
      request.body.patch,
      request.auth,
      undefined,
      request.body.csrfToken,
    );
  },
};

export const patchStationBrandingRoute: RouteDefinition<
  StationPatchResponse | { message: string },
  StationBrandingPatchRequest
> = {
  method: "PATCH",
  path: "/stations/:id/branding",
  async handler(request) {
    return await buildStationBrandingPatchRouteResponse(
      request.body.id,
      request.body.patch,
      request.auth,
      undefined,
      request.body.csrfToken,
    );
  },
};

export const patchStationContentRoute: RouteDefinition<
  StationPatchResponse | { message: string },
  StationContentPatchRequest
> = {
  method: "PATCH",
  path: "/stations/:id/content",
  async handler(request) {
    return await buildStationContentPatchRouteResponse(
      request.body.id,
      request.body.patch,
      request.auth,
      undefined,
      request.body.csrfToken,
    );
  },
};

export const getStationAnalyticsRoute: RouteDefinition<
  OceanStationAnalyticsResponse | { message: string },
  { id: string }
> = {
  method: "GET",
  path: "/stations/:id/analytics",
  async handler(request) {
    return await buildStationAnalyticsRouteResponse(request.body.id);
  },
};

export const postStationViewRoute: RouteDefinition<
  StationViewTrackResponse | { message: string },
  StationViewTrackRequest
> = {
  method: "POST",
  path: "/stations/:id/views",
  async handler(request) {
    return await buildStationViewTrackRouteResponse(request.body.id, request.body.viewType);
  },
};

type StationAlertAcknowledgeReadResult =
  | {
      source: "db";
      result: "acknowledged";
      alert: StationAlertAcknowledgeResponse["alert"];
      timelineEvent?: StationAlertAcknowledgeResponse["timelineEvent"];
    }
  | { source: "db"; result: "already_acknowledged"; alert: StationAlertAcknowledgeResponse["alert"] }
  | { source: "db"; result: "not_found" }
  | { source: "mock"; fallbackReason: OceanStationsFallbackReason };

async function writeAcknowledgeAlert(
  stationId: string,
  alertId: string,
  actorId: string,
): Promise<StationAlertAcknowledgeReadResult> {
  try {
    const runtimeRequire = eval("require") as NodeRequire;
    const repository = runtimeRequire("../repositories/stations") as {
      acknowledgeStationAlert: (
        stationIdOrSlug: string,
        alertId: string,
        actorId: string,
      ) => Promise<StationAlertAcknowledgeReadResult>;
    };

    return await repository.acknowledgeStationAlert(stationId, alertId, actorId);
  } catch {
    return { source: "mock", fallbackReason: "db_query_failed" };
  }
}

export async function buildStationAlertAcknowledgeResponse(
  stationId: string,
  alertId: string,
  actorId: string,
  ackResultPromise = writeAcknowledgeAlert(stationId, alertId, actorId),
): Promise<{
  status: 200 | 400 | 404 | 409;
  json: StationAlertAcknowledgeResponse | { message: string };
  telemetry: StationAlertAcknowledgeTelemetry;
}> {
  const ackResult = await ackResultPromise;
  if (ackResult.source === "db") {
    if (ackResult.result === "acknowledged") {
      return {
        status: 200,
        json: {
          ok: true,
          alert: ackResult.alert,
          timelineEvent: ackResult.timelineEvent,
        },
        telemetry: {
          route: "POST /stations/:id/alerts/:alertId/acknowledge",
          stationId,
          alertId,
          source: "db",
          result: "acknowledged",
        },
      };
    }

    if (ackResult.result === "already_acknowledged") {
      return {
        status: 409,
        json: { message: "Alert is already acknowledged." },
        telemetry: {
          route: "POST /stations/:id/alerts/:alertId/acknowledge",
          stationId,
          alertId,
          source: "db",
          result: "already_acknowledged",
        },
      };
    }

    return {
      status: 404,
      json: { message: "Station or alert not found" },
      telemetry: {
        route: "POST /stations/:id/alerts/:alertId/acknowledge",
        stationId,
        alertId,
        source: "db",
        result: "not_found",
      },
    };
  }

  // Mock fallback — acknowledge in-memory
  const mockStation = findMockStationById(stationId);

  if (!mockStation) {
    return {
      status: 404,
      json: { message: "Station or alert not found" },
      telemetry: {
        route: "POST /stations/:id/alerts/:alertId/acknowledge",
        stationId,
        alertId,
        source: "mock",
        result: "not_found",
        fallbackReason: ackResult.fallbackReason,
      },
    };
  }

  const alertIndex = mockStation.alerts.findIndex((a) => a.id === alertId);

  if (alertIndex === -1) {
    return {
      status: 404,
      json: { message: "Station or alert not found" },
      telemetry: {
        route: "POST /stations/:id/alerts/:alertId/acknowledge",
        stationId,
        alertId,
        source: "mock",
        result: "not_found",
        fallbackReason: ackResult.fallbackReason,
      },
    };
  }

  const alert = mockStation.alerts[alertIndex]!;

  if (alert.acknowledgedAt !== null) {
    return {
      status: 409,
      json: { message: "Alert is already acknowledged." },
      telemetry: {
        route: "POST /stations/:id/alerts/:alertId/acknowledge",
        stationId,
        alertId,
        source: "mock",
        result: "already_acknowledged",
        fallbackReason: ackResult.fallbackReason,
      },
    };
  }

  const nowIso = new Date().toISOString();
  const acknowledged = { ...alert, status: "acknowledged", acknowledgedAt: nowIso, acknowledgedBy: actorId };
  mockStation.alerts[alertIndex] = acknowledged;
  const timelineEvent = {
    id: `STL-ACK-${alertId}-${Date.now()}`,
    label: "Alert acknowledged",
    phase: "Response",
    detail: `${alert.title} acknowledged by ${actorId}.`,
    happenedAt: nowIso,
  };
  mockStation.timeline = [timelineEvent, ...mockStation.timeline];

  return {
    status: 200,
    json: { ok: true, alert: acknowledged, timelineEvent },
    telemetry: {
      route: "POST /stations/:id/alerts/:alertId/acknowledge",
      stationId,
      alertId,
      source: "mock",
      result: "acknowledged",
      fallbackReason: ackResult.fallbackReason,
    },
  };
}

export const postStationAlertAcknowledgeRoute: RouteDefinition<
  StationAlertAcknowledgeResponse | { message: string },
  StationAlertAcknowledgeRequest
> = {
  method: "POST",
  path: "/stations/:id/alerts/:alertId/acknowledge",
  async handler(request) {
    return await buildStationAlertAcknowledgeResponse(
      request.body.id,
      request.body.alertId,
      request.body.actorId,
    );
  },
};
