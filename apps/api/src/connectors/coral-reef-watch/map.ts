import type { CrwParsedRecord } from "./parse";

export interface CrwMappedMetric {
  stationId: string | null;
  region: string;
  observedAt: number;
  metricType: "sst_anomaly_c" | "hotspot_c" | "dhw";
  metricValue: number;
  metricUnit: "celsius" | "week";
  sourceTimestamp: string;
}

export interface CrwMappedSignal {
  stationId: string | null;
  region: string;
  observedAt: number;
  signalType: "reef_bleaching_alert_level";
  signalValue: number | null;
  signalLabel: string | null;
  severity: "low" | "medium" | "high" | "critical";
  sourceTimestamp: string;
}

export interface CrwMappedBatch {
  metrics: CrwMappedMetric[];
  signals: CrwMappedSignal[];
}

function normalizeSeverity(stressLevel: string | null, dhw: number | null): "low" | "medium" | "high" | "critical" {
  const normalized = (stressLevel ?? "").toLowerCase();

  if (normalized.includes("alert_level_2") || normalized.includes("critical") || (dhw ?? 0) >= 8) {
    return "critical";
  }

  if (normalized.includes("alert_level_1") || normalized.includes("warning") || (dhw ?? 0) >= 4) {
    return "high";
  }

  if (normalized.includes("watch") || (dhw ?? 0) >= 1) {
    return "medium";
  }

  return "low";
}

export function mapCrwRecords(records: CrwParsedRecord[]): CrwMappedBatch {
  const metrics: CrwMappedMetric[] = [];
  const signals: CrwMappedSignal[] = [];

  for (const record of records) {
    if (record.observedAt === null) {
      continue;
    }

    const sourceTimestamp = new Date(record.observedAt).toISOString();

    if (record.sstAnomalyC !== null) {
      metrics.push({
        stationId: record.stationId,
        region: record.region,
        observedAt: record.observedAt,
        metricType: "sst_anomaly_c",
        metricValue: record.sstAnomalyC,
        metricUnit: "celsius",
        sourceTimestamp,
      });
    }

    if (record.hotSpotC !== null) {
      metrics.push({
        stationId: record.stationId,
        region: record.region,
        observedAt: record.observedAt,
        metricType: "hotspot_c",
        metricValue: record.hotSpotC,
        metricUnit: "celsius",
        sourceTimestamp,
      });
    }

    if (record.dhw !== null) {
      metrics.push({
        stationId: record.stationId,
        region: record.region,
        observedAt: record.observedAt,
        metricType: "dhw",
        metricValue: record.dhw,
        metricUnit: "week",
        sourceTimestamp,
      });
    }

    signals.push({
      stationId: record.stationId,
      region: record.region,
      observedAt: record.observedAt,
      signalType: "reef_bleaching_alert_level",
      signalValue: record.dhw,
      signalLabel: record.stressLevel,
      severity: normalizeSeverity(record.stressLevel, record.dhw),
      sourceTimestamp,
    });
  }

  return { metrics, signals };
}
