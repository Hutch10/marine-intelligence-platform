interface DataPoint {
  label: string;
  value: number;
}

interface MiniLineChartProps {
  data: DataPoint[];
  title?: string;
  unit?: string;
  height?: number;
  color?: "cyan" | "emerald" | "amber" | "rose";
}

const colorMap = {
  cyan: "from-cyan-500 to-cyan-300",
  emerald: "from-emerald-500 to-emerald-300",
  amber: "from-amber-500 to-amber-300",
  rose: "from-rose-500 to-rose-300",
};

export function MiniLineChart({
  data,
  title,
  unit,
  height = 120,
  color = "cyan",
}: MiniLineChartProps) {
  if (data.length === 0) {
    return (
      <div
        className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-900/40"
        style={{ height }}
      >
        <div className="flex h-full items-center justify-center text-xs text-slate-500">
          No data
        </div>
      </div>
    );
  }

  const maxValue = Math.max(...data.map((p) => p.value));
  const minValue = Math.min(...data.map((p) => p.value));
  const range = maxValue === minValue ? 1 : maxValue - minValue;

  return (
    <div className="space-y-2">
      {title && (
        <div className="flex items-baseline justify-between">
          <p className="text-[11px] font-medium text-slate-400">{title}</p>
          <p className="text-xs font-mono text-slate-300">
            {maxValue.toFixed(1)}
            {unit && <span className="text-[10px] text-slate-500">{unit}</span>}
          </p>
        </div>
      )}
      <div
        className="flex items-end gap-2 rounded-xl border border-surface-borderSubtle bg-ocean-900/50 p-3"
        style={{ height: `${height}px` }}
      >
        {data.map((point, idx) => {
          const normalizedValue = (point.value - minValue) / range;
          return (
            <div key={idx} className="flex flex-1 flex-col items-center justify-end gap-1">
              <div className="h-full w-full flex items-end justify-center">
                <div
                  className={`w-full rounded-t-sm bg-gradient-to-t ${colorMap[color]}`}
                  style={{
                    height: `${Math.max(normalizedValue * 100, 2)}%`,
                  }}
                />
              </div>
              <span className="font-mono text-[8px] text-slate-600 truncate">
                {point.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
