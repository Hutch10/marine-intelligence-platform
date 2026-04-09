import { listStations } from "../repositories/stations";
import { listSignals } from "../repositories/signals";
// Add other repo imports as needed

export interface ExplorerQueryFilters {
  stationIds?: string[];
  regions?: string[];
  dateRange?: { start: string; end: string };
}
export interface ExplorerQueryResult {
  id: string;
  timestamp: string;
  stationId: string;
  parameters: Record<string, unknown>;
  confidenceScore?: number;
}

export interface ExplorerQueryResponse {
  results: ExplorerQueryResult[];
  metadata: {
    totalResults: number;
    dataSource: "live" | "partial" | "fallback";
  };
}

export async function getRepositoryData(filters: any = {}, limit?: number): Promise<ExplorerQueryResponse> {
  // Use listStations (not getStations) and handle union result
  console.log("[explorer-service] calling listStations");
  const stationsResult = listStations();
  console.log("[explorer-service] stationsResult:", stationsResult);
  if (stationsResult.source !== "db") {
    return {
      results: [],
      metadata: {
        totalResults: 0,
        dataSource: "fallback",
      },
    };
  }
  const stations = stationsResult.stations;

  console.log("[explorer-service] calling listSignals");
  const signalsResult = await listSignals();
  console.log("[explorer-service] signalsResult:", signalsResult);
  if (signalsResult.source !== "db") {
    return {
      results: [],
      metadata: {
        totalResults: 0,
        dataSource: "fallback",
      },
    };
  }
  let filtered = signalsResult.signals;
  if (filters.stationIds && filters.stationIds.length > 0) {
    filtered = filtered.filter((s: any) => filters.stationIds!.includes(s.stationId));
  }
  if (filters.regions && filters.regions.length > 0) {
    const regionStations = stations.filter((st: any) => filters.regions!.includes(st.region)).map((st: any) => st.id);
    filtered = filtered.filter((s: any) => regionStations.includes(s.stationId));
  }
  if (filters.dateRange) {
    filtered = filtered.filter((s: any) => {
      const ts = new Date(s.timestamp || s.detectedAt || s.createdAt).getTime();
      return ts >= new Date(filters.dateRange!.start).getTime() && ts <= new Date(filters.dateRange!.end).getTime();
    });
  }
  if (limit && limit > 0) {
    filtered = filtered.slice(0, limit);
  }

  const results: ExplorerQueryResult[] = filtered.map((s: any) => ({
    id: s.id,
    timestamp: s.timestamp || s.detectedAt || s.createdAt,
    stationId: s.stationId,
    parameters: {
      ...s,
    },
    confidenceScore: s.confidence ?? s.confidenceScore ?? undefined,
  }));

  return {
    results,
    metadata: {
      totalResults: results.length,
      dataSource: "live",
    },
  };
}
