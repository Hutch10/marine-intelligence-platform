import type { RouteDefinition } from "../types";
import { getDataLineageByRecordId } from "../repositories/data-lineage";

export interface DataLineageResponse {
  source: "db" | "unavailable";
  fallback_reason?: string;
  lineage: {
    record_id: string;
    record_type: string;
    provenance_id: string | null;
    source_station_id: string;
    source: string;
    anchor_observed_at: string;
    sea_temp_observed_at: string | null;
    wave_height_observed_at: string | null;
    wind_observed_at: string | null;
    pressure_observed_at: string | null;
    ingestion_observed_at: string | null;
    source_timestamp: string;
    source_reference: string;
    metrics_concurrent: boolean;
    backfill_indicators: {
      sea_surface_temp: boolean;
      wave_height: boolean;
    };
    freshness_classification: string;
    sync_status: string | null;
    provenance_payload: Record<string, unknown>;
  } | null;
}

export async function buildDataLineageRouteResponse(recordId: string): Promise<{
  status: number;
  json: DataLineageResponse;
}> {
  const readResult = await getDataLineageByRecordId(recordId);

  if (readResult.source === "db") {
    return {
      status: 200,
      json: {
        source: "db",
        lineage: {
          record_id: readResult.lineage.recordId,
          record_type: readResult.lineage.recordType,
          provenance_id: readResult.lineage.provenanceId,
          source_station_id: readResult.lineage.sourceStationId,
          source: readResult.lineage.source,
          anchor_observed_at: readResult.lineage.anchorObservedAt,
          sea_temp_observed_at: readResult.lineage.seaTempObservedAt,
          wave_height_observed_at: readResult.lineage.waveHeightObservedAt,
          wind_observed_at: readResult.lineage.windObservedAt,
          pressure_observed_at: readResult.lineage.pressureObservedAt,
          ingestion_observed_at: readResult.lineage.ingestionObservedAt,
          source_timestamp: readResult.lineage.sourceTimestamp,
          source_reference: readResult.lineage.sourceReference,
          metrics_concurrent: readResult.lineage.metricsConcurrent,
          backfill_indicators: {
            sea_surface_temp: readResult.lineage.backfillIndicators.seaSurfaceTemp,
            wave_height: readResult.lineage.backfillIndicators.waveHeight,
          },
          freshness_classification: readResult.lineage.freshnessClassification,
          sync_status: readResult.lineage.syncStatus,
          provenance_payload: readResult.lineage.provenancePayload,
        },
      },
    };
  }

  return {
    status: readResult.fallbackReason === "not_found" ? 404 : 503,
    json: {
      source: "unavailable",
      fallback_reason: readResult.fallbackReason,
      lineage: null,
    },
  };
}

export const getDataLineageRoute: RouteDefinition<DataLineageResponse, undefined, { recordId?: string }> = {
  method: "GET",
  path: "/internal/lineage/:recordId",
  async handler({ params }) {
    const recordId = params?.recordId?.trim() ?? "";
    if (!recordId) {
      return {
        status: 400,
        json: {
          source: "unavailable",
          lineage: null,
        },
      };
    }

    return await buildDataLineageRouteResponse(recordId);
  },
};
