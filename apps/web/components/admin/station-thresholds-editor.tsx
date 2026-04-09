"use client";

import { useEffect, useState, useTransition } from "react";

type ThresholdMetric =
  | "seaSurfaceTempC"
  | "waveHeightM"
  | "windSpeedMps"
  | "pressureHpa";

type ThresholdComparator = "above" | "below";
type ThresholdSource = "default" | "station_override";

interface StationThreshold {
  metric: ThresholdMetric;
  thresholdValue: number;
  comparator: ThresholdComparator;
  source: ThresholdSource;
}

interface StationThresholdResponse {
  stationId: string;
  thresholds: StationThreshold[];
}

interface StationThresholdsEditorProps {
  stationId: string;
  stationName: string;
  csrfToken: string;
}

type OverrideDraft = Record<ThresholdMetric, string>;

const METRIC_LABELS: Record<ThresholdMetric, string> = {
  seaSurfaceTempC: "Sea Surface Temperature",
  waveHeightM: "Wave Height",
  windSpeedMps: "Wind Speed",
  pressureHpa: "Pressure",
};

const METRIC_UNITS: Record<ThresholdMetric, string> = {
  seaSurfaceTempC: "°C",
  waveHeightM: "m",
  windSpeedMps: "m/s",
  pressureHpa: "hPa",
};

const COMPARATOR_LABELS: Record<ThresholdComparator, string> = {
  above: "Above",
  below: "Below",
};

function emptyDraft(): OverrideDraft {
  return {
    seaSurfaceTempC: "",
    waveHeightM: "",
    windSpeedMps: "",
    pressureHpa: "",
  };
}

function buildDraft(thresholds: StationThreshold[]): OverrideDraft {
  const nextDraft = emptyDraft();

  for (const threshold of thresholds) {
    nextDraft[threshold.metric] = threshold.source === "station_override"
      ? String(threshold.thresholdValue)
      : "";
  }

  return nextDraft;
}

function toRequestValue(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

export function StationThresholdsEditor({
  stationId,
  stationName,
  csrfToken,
}: StationThresholdsEditorProps) {
  const [thresholds, setThresholds] = useState<StationThreshold[] | null>(null);
  const [draft, setDraft] = useState<OverrideDraft>(emptyDraft);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;

    async function loadThresholds() {
      setError(null);

      try {
        const response = await fetch(`/api/admin/stations/${encodeURIComponent(stationId)}/thresholds`, {
          method: "GET",
          headers: {
            Accept: "application/json",
          },
          cache: "no-store",
        });
        const payload = await response.json() as StationThresholdResponse | { message?: string };

        if (!response.ok) {
          throw new Error(
            typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Threshold request failed.",
          );
        }

        if (!cancelled && payload && typeof payload === "object" && "thresholds" in payload) {
          setThresholds(payload.thresholds);
          setDraft(buildDraft(payload.thresholds));
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Threshold request failed.");
        }
      }
    }

    void loadThresholds();

    return () => {
      cancelled = true;
    };
  }, [stationId]);

  function updateDraft(metric: ThresholdMetric, value: string) {
    setDraft((current) => ({
      ...current,
      [metric]: value,
    }));
    setSuccessMessage(null);
  }

  function saveThresholds() {
    startTransition(async () => {
      setError(null);
      setSuccessMessage(null);

      try {
        const response = await fetch(`/api/admin/stations/${encodeURIComponent(stationId)}/thresholds`, {
          method: "PUT",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            seaSurfaceTempC: toRequestValue(draft.seaSurfaceTempC),
            waveHeightM: toRequestValue(draft.waveHeightM),
            windSpeedMps: toRequestValue(draft.windSpeedMps),
            pressureHpa: toRequestValue(draft.pressureHpa),
            csrfToken,
          }),
        });
        const payload = await response.json() as StationThresholdResponse | { message?: string };

        if (!response.ok) {
          throw new Error(
            typeof payload === "object" && payload && "message" in payload && typeof payload.message === "string"
              ? payload.message
              : "Threshold save failed.",
          );
        }

        if (payload && typeof payload === "object" && "thresholds" in payload) {
          setThresholds(payload.thresholds);
          setDraft(buildDraft(payload.thresholds));
          setSuccessMessage("Threshold overrides saved.");
        } else {
          throw new Error("Threshold save returned an invalid payload.");
        }
      } catch (saveError) {
        setError(saveError instanceof Error ? saveError.message : "Threshold save failed.");
      }
    });
  }

  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-6 py-8">
      <div className="rounded-3xl border border-cyan-900/40 bg-slate-950/70 p-6 shadow-[0_20px_80px_rgba(8,145,178,0.08)]">
        <p className="text-[11px] uppercase tracking-[0.24em] text-cyan-400">Station Thresholds</p>
        <h1 className="mt-2 text-3xl font-semibold text-slate-100">{stationName}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-400">
          Manage station-specific overrides for deterministic risk thresholds. Leave an override blank to inherit the
          current default or higher-level configuration.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-950/40 px-4 py-3 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/40 px-4 py-3 text-sm text-emerald-200">
          {successMessage}
        </div>
      ) : null}

      <div className="grid gap-4">
        {(thresholds ?? []).map((threshold) => (
          <article
            key={threshold.metric}
            className="grid gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-5 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]"
          >
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-slate-100">{METRIC_LABELS[threshold.metric]}</h2>
                <span className="rounded-full border border-slate-700 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-slate-400">
                  {COMPARATOR_LABELS[threshold.comparator]}
                </span>
                <span className="rounded-full border border-cyan-900/50 bg-cyan-950/40 px-2.5 py-1 text-[11px] uppercase tracking-[0.2em] text-cyan-300">
                  {threshold.source === "station_override" ? "Override" : "Default"}
                </span>
              </div>
              <p className="text-sm text-slate-300">
                Effective threshold:{" "}
                <span className="font-medium text-slate-100">
                  {threshold.thresholdValue} {METRIC_UNITS[threshold.metric]}
                </span>
              </p>
              <p className="text-xs text-slate-500">
                Source: {threshold.source === "station_override" ? "station override" : "default or inherited"}
              </p>
            </div>

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium text-slate-200">Station Override</span>
              <div className="flex items-center gap-3">
                <input
                  value={draft[threshold.metric]}
                  onChange={(event) => updateDraft(threshold.metric, event.target.value)}
                  placeholder="inherit"
                  inputMode="decimal"
                  className="w-full rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-sm text-slate-100 outline-none transition focus:border-cyan-400"
                />
                <span className="text-sm text-slate-400">{METRIC_UNITS[threshold.metric]}</span>
              </div>
              <span className="text-xs text-slate-500">
                Blank clears the station override and keeps inherited threshold resolution.
              </span>
            </label>
          </article>
        ))}

        {thresholds === null && !error ? (
          <div className="rounded-3xl border border-slate-800 bg-slate-950/70 p-5 text-sm text-slate-400">
            Loading thresholds...
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-950/70 p-5">
        <p className="text-sm text-slate-400">
          Threshold source labels reflect the currently resolved values returned by the risk engine.
        </p>
        <button
          type="button"
          onClick={saveThresholds}
          disabled={isPending || thresholds === null}
          className="rounded-2xl bg-cyan-500 px-5 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-400"
        >
          {isPending ? "Saving..." : "Save Thresholds"}
        </button>
      </div>
    </section>
  );
}
