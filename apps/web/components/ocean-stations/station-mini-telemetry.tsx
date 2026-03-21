import { MiniLineChart } from "@/components/platform/mini-line-chart";
import type { DataExplorerPreviewSeriesPoint } from "@/lib/api/types";

interface StationTelemetryData {
  temperature: DataExplorerPreviewSeriesPoint[];
  oxygen: DataExplorerPreviewSeriesPoint[];
  salinity: DataExplorerPreviewSeriesPoint[];
  acousticActivity: DataExplorerPreviewSeriesPoint[];
}

interface StationMiniTelemetryProps {
  stationId: string;
  data: StationTelemetryData;
}

export function StationMiniTelemetry({ data }: StationMiniTelemetryProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <MiniLineChart
        data={data.temperature}
        title="Temperature (°C)"
        unit="°C"
        height={80}
        color="amber"
      />
      <MiniLineChart
        data={data.oxygen}
        title="Dissolved O₂ (mg/L)"
        unit="mg/L"
        height={80}
        color="cyan"
      />
      <MiniLineChart
        data={data.salinity}
        title="Salinity (PSU)"
        unit="PSU"
        height={80}
        color="emerald"
      />
      <MiniLineChart
        data={data.acousticActivity}
        title="Acoustic Activity"
        unit="dB"
        height={80}
        color="rose"
      />
    </div>
  );
}
