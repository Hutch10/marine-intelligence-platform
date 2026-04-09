import type { DataExplorerPresetScope } from "@/lib/persistence/types";
import { apiClient } from "@/lib/api/client";
import { getStationAdminSessionCookie } from "@/lib/api/session-cookies";

type DataExplorerPresetActorContext = {
  actorId: string | null;
  actorType: "station_admin" | "unknown";
};

type DataExplorerPresetScopeContext = {
  scope?: DataExplorerPresetScope;
  ownerId?: string;
  actor?: DataExplorerPresetActorContext;
};

export const DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR =
  "Personal preset scope requires an authenticated station admin session.";

export interface PresetSessionStatus {
  sessionActive: boolean;
  actorLabel: string | null;
  personalScopeAvailable: boolean;
}

interface PresetScopeResolutionSuccess {
  ok: true;
  context: DataExplorerPresetScopeContext;
}

interface PresetScopeResolutionFailure {
  ok: false;
  status: 401;
  result: {
    ok: false;
    presets: [];
    reason: "validation";
    error: typeof DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR;
  };
}

export type PresetScopeResolution = PresetScopeResolutionSuccess | PresetScopeResolutionFailure;

function parsePresetScope(value: string | null | undefined): DataExplorerPresetScope {
  return value === "personal" ? "personal" : "shared";
}

function getStationAdminSessionId(): string | null {
  const cookieSessionId = getStationAdminSessionCookie();

  if (cookieSessionId) {
    return cookieSessionId;
  }

  if (process.env.NODE_ENV !== "production") {
    const devSessionId = process.env.STATION_ADMIN_DEV_SESSION_ID?.trim() ?? "";
    return devSessionId || null;
  }

  return null;
}

async function resolvePresetActorContext(): Promise<DataExplorerPresetActorContext> {
  const sessionId = getStationAdminSessionId();
  const auth = sessionId ? await apiClient.stationAdminAuth.getSession(sessionId) : null;
  const actorId = auth?.actorId?.trim() ?? "";

  if (!actorId) {
    return {
      actorId: null,
      actorType: "unknown",
    };
  }

  return {
    actorId,
    actorType: "station_admin",
  };
}

export async function resolvePresetSessionStatus(): Promise<PresetSessionStatus> {
  const actor = await resolvePresetActorContext();

  return {
    sessionActive: Boolean(actor.actorId),
    actorLabel: actor.actorId,
    personalScopeAvailable: Boolean(actor.actorId),
  };
}

export async function resolvePresetScopeContext(
  request: Request,
  fallbackScope?: string | null,
  options?: { includeActor?: boolean },
): Promise<PresetScopeResolution> {
  const url = new URL(request.url);
  const scope = parsePresetScope(url.searchParams.get("scope") ?? fallbackScope);

  if (scope !== "personal") {
    if (options?.includeActor) {
      const actor = await resolvePresetActorContext();
      return {
        ok: true,
        context: {
          scope,
          actor,
        },
      };
    }

    return {
      ok: true,
      context: {
        scope,
      },
    };
  }

  const actor = await resolvePresetActorContext();

  if (!actor.actorId) {
    return {
      ok: false,
      status: 401,
      result: {
        ok: false,
        presets: [],
        reason: "validation",
        error: DATA_EXPLORER_PERSONAL_PRESET_AUTH_ERROR,
      },
    };
  }

  return {
    ok: true,
    context: {
      scope,
      ownerId: actor.actorId,
      actor,
    },
  };
}
