import type { EnvironmentalEvidencePacket } from "@marine/shared";
import type { RouteDefinition } from "../types";
import {
  generateEnvironmentalEvidencePacketForAlertId,
  generateEnvironmentalEvidencePacketForEventId,
  generateEnvironmentalEvidencePacketForSignalId,
} from "../services/environmental-harness/replay";

export interface ReplayRouteResponse {
  source: "db" | "withheld";
  fallback_reason?: string;
  evidence_status?: "complete" | "partial" | "withheld";
  withheld_sections?: string[];
  packet: EnvironmentalEvidencePacket | null;
}

function toRouteResponse(
  result: { status: "available"; packet: EnvironmentalEvidencePacket } | { status: "withheld"; reason: string },
): { status: number; json: ReplayRouteResponse } {
  if (result.status === "withheld") {
    return {
      status: result.reason === "not_found" ? 404 : 503,
      json: {
        source: "withheld",
        fallback_reason: result.reason,
        packet: null,
      },
    };
  }

  return {
    status: 200,
    json: {
      source: "db",
      evidence_status: result.packet.evidenceStatus,
      withheld_sections: result.packet.withheldSections,
      packet: result.packet,
    },
  };
}

export async function buildReplaySignalRouteResponse(
  signalId: string,
): Promise<{ status: number; json: ReplayRouteResponse }> {
  if (!signalId.trim()) {
    return {
      status: 400,
      json: {
        source: "withheld",
        fallback_reason: "missing_signal_id",
        packet: null,
      },
    };
  }

  return toRouteResponse(await generateEnvironmentalEvidencePacketForSignalId(signalId.trim()));
}

export async function buildReplayAlertRouteResponse(
  alertId: string,
): Promise<{ status: number; json: ReplayRouteResponse }> {
  if (!alertId.trim()) {
    return {
      status: 400,
      json: {
        source: "withheld",
        fallback_reason: "missing_alert_id",
        packet: null,
      },
    };
  }

  return toRouteResponse(await generateEnvironmentalEvidencePacketForAlertId(alertId.trim()));
}

export async function buildReplayEventRouteResponse(
  eventId: string,
): Promise<{ status: number; json: ReplayRouteResponse }> {
  if (!eventId.trim()) {
    return {
      status: 400,
      json: {
        source: "withheld",
        fallback_reason: "missing_event_id",
        packet: null,
      },
    };
  }

  return toRouteResponse(await generateEnvironmentalEvidencePacketForEventId(eventId.trim()));
}

export const getReplaySignalRoute: RouteDefinition<ReplayRouteResponse> = {
  method: "GET",
  path: "/api/replay/signal/:id",
  async handler({ params }) {
    return await buildReplaySignalRouteResponse(params?.id ?? "");
  },
};

export const getReplayAlertRoute: RouteDefinition<ReplayRouteResponse> = {
  method: "GET",
  path: "/api/replay/alert/:id",
  async handler({ params }) {
    return await buildReplayAlertRouteResponse(params?.id ?? "");
  },
};

export const getReplayEventRoute: RouteDefinition<ReplayRouteResponse> = {
  method: "GET",
  path: "/api/replay/event/:id",
  async handler({ params }) {
    return await buildReplayEventRouteResponse(params?.id ?? "");
  },
};
