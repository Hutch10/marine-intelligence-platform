"use client";

import { useState } from "react";
import {
  Activity,
  Clock3,
  Compass,
  Eye,
  Layers3,
  LocateFixed,
  MapPinned,
  Pause,
  Play,
  Radar,
  Route,
  Satellite,
  SlidersHorizontal,
  Waves,
  Wind,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  OceanMapHotspotOverlay,
  OceanMapLayerControl,
  OceanMapOverlayEntity,
  OceanMapSpatialOverlayCategory,
  OceanMapStat,
  OceanMapWorkspaceData,
} from "@/lib/api/types";
import { Panel } from "@/components/ui/panel";
import { StatusBadge } from "@/components/ui/status-badge";

const ACCENT_STYLES = {
  cyan: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  emerald: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  amber: "border-amber-500/25 bg-amber-500/10 text-amber-300",
} as const;

const MAP_STAT_ICONS: Record<OceanMapStat["icon"], LucideIcon> = {
  satellite: Satellite,
  radar: Radar,
  route: Route,
};

const OVERLAY_SEVERITY_STYLES: Record<OceanMapOverlayEntity["severity"], string> = {
  high: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  medium: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  low: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
};

const CATEGORY_LABELS: Record<OceanMapSpatialOverlayCategory, string> = {
  sightings: "Species sightings",
  movement_signals: "Movement signals",
  hotspots: "Ecological hotspots",
  corridors_foundation: "Corridor foundations",
};

const CATEGORY_CARD_ACCENTS: Record<OceanMapSpatialOverlayCategory, string> = {
  sightings: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
  movement_signals: "border-amber-500/25 bg-amber-500/10 text-amber-300",
  hotspots: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
  corridors_foundation: "border-cyan-500/25 bg-cyan-500/10 text-cyan-300",
};

const MARKER_STYLES: Record<Exclude<OceanMapSpatialOverlayCategory, "corridors_foundation">, string> = {
  sightings: "border-cyan-400/60 bg-cyan-400/20 text-cyan-200",
  movement_signals: "border-amber-400/60 bg-amber-400/20 text-amber-200",
  hotspots: "border-emerald-400/60 bg-emerald-400/20 text-emerald-200",
};

type VisibleMarkerPoint = {
  id: string;
  label: string;
  detail: string;
  category: Exclude<OceanMapSpatialOverlayCategory, "corridors_foundation">;
  latitude: number;
  longitude: number;
};

type CoordinateBounds = {
  minLatitude: number;
  maxLatitude: number;
  minLongitude: number;
  maxLongitude: number;
};

const HORIZONTAL_POSITION_CLASSES = [
  "left-[12%]",
  "left-[24%]",
  "left-[36%]",
  "left-[48%]",
  "left-[60%]",
  "left-[72%]",
  "left-[84%]",
] as const;

const VERTICAL_POSITION_CLASSES = [
  "top-[22%]",
  "top-[32%]",
  "top-[42%]",
  "top-[52%]",
  "top-[62%]",
  "top-[72%]",
] as const;

function formatMovementType(value: string): string {
  return value.replace(/_/g, " ");
}

function hasSpatialData(data: OceanMapWorkspaceData["spatialOverlays"]): boolean {
  if (!data) {
    return false;
  }

  return (
    data.sightings.length > 0
    || data.movementSignals.length > 0
    || data.hotspots.length > 0
    || data.corridorsFoundation.length > 0
  );
}

function getActiveCategories(layers: OceanMapLayerControl[]): Set<OceanMapSpatialOverlayCategory> {
  return new Set(
    layers
      .filter((layer) => layer.active && layer.overlayCategory)
      .map((layer) => layer.overlayCategory as OceanMapSpatialOverlayCategory),
  );
}

function getVisibleMarkerPoints(
  data: OceanMapWorkspaceData["spatialOverlays"],
  activeCategories: Set<OceanMapSpatialOverlayCategory>,
): VisibleMarkerPoint[] {
  if (!data) {
    return [];
  }

  const points: VisibleMarkerPoint[] = [];

  if (activeCategories.has("sightings")) {
    points.push(
      ...data.sightings.map((sighting) => ({
        id: sighting.id,
        label: sighting.commonName,
        detail: sighting.detail,
        category: "sightings" as const,
        latitude: sighting.latitude,
        longitude: sighting.longitude,
      })),
    );
  }

  if (activeCategories.has("movement_signals")) {
    points.push(
      ...data.movementSignals
        .filter((signal) => signal.latitude !== null && signal.longitude !== null)
        .map((signal) => ({
          id: signal.id,
          label: `${signal.commonName} · ${formatMovementType(signal.movementType)}`,
          detail: signal.detail,
          category: "movement_signals" as const,
          latitude: signal.latitude as number,
          longitude: signal.longitude as number,
        })),
    );
  }

  if (activeCategories.has("hotspots")) {
    points.push(
      ...data.hotspots
        .filter((hotspot) => hotspot.latitude !== null && hotspot.longitude !== null)
        .map((hotspot) => ({
          id: hotspot.id,
          label: hotspot.label,
          detail: hotspot.detail,
          category: "hotspots" as const,
          latitude: hotspot.latitude as number,
          longitude: hotspot.longitude as number,
        })),
    );
  }

  return points;
}

function getCoordinateBounds(points: VisibleMarkerPoint[]): CoordinateBounds | null {
  if (points.length === 0) {
    return null;
  }

  const latitudes = points.map((point) => point.latitude);
  const longitudes = points.map((point) => point.longitude);

  const minLatitude = Math.min(...latitudes);
  const maxLatitude = Math.max(...latitudes);
  const minLongitude = Math.min(...longitudes);
  const maxLongitude = Math.max(...longitudes);

  return {
    minLatitude,
    maxLatitude: maxLatitude === minLatitude ? maxLatitude + 1 : maxLatitude,
    minLongitude,
    maxLongitude: maxLongitude === minLongitude ? maxLongitude + 1 : maxLongitude,
  };
}

function clampIndex(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

function getMarkerPositionClasses(
  point: VisibleMarkerPoint,
  bounds: CoordinateBounds | null,
  index: number,
): string {
  if (!bounds) {
    return cn(
      HORIZONTAL_POSITION_CLASSES[index % HORIZONTAL_POSITION_CLASSES.length],
      VERTICAL_POSITION_CLASSES[index % VERTICAL_POSITION_CLASSES.length],
    );
  }

  const longitudeSpan = bounds.maxLongitude - bounds.minLongitude;
  const latitudeSpan = bounds.maxLatitude - bounds.minLatitude;
  const x = (point.longitude - bounds.minLongitude) / longitudeSpan;
  const y = (point.latitude - bounds.minLatitude) / latitudeSpan;
  const horizontalIndex = clampIndex(
    Math.round(x * (HORIZONTAL_POSITION_CLASSES.length - 1)),
    HORIZONTAL_POSITION_CLASSES.length - 1,
  );
  const verticalIndex = clampIndex(
    Math.round((1 - y) * (VERTICAL_POSITION_CLASSES.length - 1)),
    VERTICAL_POSITION_CLASSES.length - 1,
  );

  return cn(HORIZONTAL_POSITION_CLASSES[horizontalIndex], VERTICAL_POSITION_CLASSES[verticalIndex]);
}

function hotspotAnchorLabel(hotspot: OceanMapHotspotOverlay): string {
  return hotspot.stationId ?? hotspot.region;
}

export function OceanMapWorkspace({ data }: { data: OceanMapWorkspaceData }) {
  const [layers, setLayers] = useState(data.layers);
  const spatialOverlays = data.spatialOverlays;
  const activeCategories = getActiveCategories(layers);
  const visibleSightings = spatialOverlays && activeCategories.has("sightings") ? spatialOverlays.sightings : [];
  const visibleMovementSignals =
    spatialOverlays && activeCategories.has("movement_signals") ? spatialOverlays.movementSignals : [];
  const visibleHotspots = spatialOverlays && activeCategories.has("hotspots") ? spatialOverlays.hotspots : [];
  const visibleCorridors =
    spatialOverlays && activeCategories.has("corridors_foundation")
      ? spatialOverlays.corridorsFoundation
      : [];
  const visibleMarkerPoints = getVisibleMarkerPoints(spatialOverlays, activeCategories);
  const markerBounds = getCoordinateBounds(visibleMarkerPoints);

  function toggleLayer(label: string) {
    setLayers((current) =>
      current.map((layer) => (layer.label === label ? { ...layer, active: !layer.active } : layer)),
    );
  }

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-6 p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-cyan-400">
            Ocean Map
          </p>
          <h2 className="mt-2 text-xl font-semibold text-slate-100">
            Spatial monitoring workspace for live ocean conditions
          </h2>
          <p className="mt-1 max-w-3xl text-sm text-slate-400">
            Review active layers, inspect target sectors, and stage the central canvas for future
            Mapbox integration without changing the shared app architecture.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge label="Viewport synced" className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />
          <StatusBadge label="Mapbox-ready placeholder" className="border-emerald-500/25 bg-emerald-500/10 text-emerald-300" />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
        <Panel
          title="Layer Controls"
          subtitle="Toggle overlays and spatial aids for the current viewport."
          action={<Layers3 size={14} className="text-cyan-400" />}
          className="h-fit"
        >
          <div className="space-y-3">
            {layers.map((layer) => (
              <button
                key={layer.label}
                type="button"
                aria-label={`${layer.label} layer toggle`}
                onClick={() => toggleLayer(layer.label)}
                className="w-full rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4 text-left transition-colors hover:border-cyan-500/25"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium text-slate-100">{layer.label}</p>
                    <p className="mt-1 text-[11px] leading-relaxed text-slate-500">{layer.description}</p>
                    {layer.overlayCategory ? (
                      <p className="mt-2 text-[10px] uppercase tracking-[0.22em] text-slate-600">
                        {CATEGORY_LABELS[layer.overlayCategory]}
                      </p>
                    ) : null}
                  </div>
                  <StatusBadge
                    label={layer.active ? "On" : "Off"}
                    className={
                      layer.active
                        ? ACCENT_STYLES[layer.accent]
                        : "border-surface-borderSubtle bg-ocean-900 text-slate-500"
                    }
                  />
                </div>
              </button>
            ))}

            <div className="rounded-xl border border-dashed border-cyan-500/25 bg-cyan-500/5 p-4">
              <div className="flex items-start gap-3">
                <SlidersHorizontal size={16} className="mt-0.5 text-cyan-400" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Preset</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Investigation mode emphasizes thermal, current, buoy, and recent species overlays for anomaly review.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Panel>

        <div className="space-y-6">
          <Panel
            title="Map Canvas"
            subtitle="Clean placeholder area prepared for later interactive map integration."
            action={
              <div className="flex items-center gap-2 text-[11px] text-slate-500">
                <LocateFixed size={13} className="text-cyan-400" />
                Centered on sector 14-C
              </div>
            }
          >
            <div className="space-y-5">
              <div className="grid gap-3 sm:grid-cols-3">
                {data.mapStats.map((stat) => {
                  const Icon = MAP_STAT_ICONS[stat.icon];

                  return (
                    <div key={stat.label} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                      <div className="flex items-center justify-between">
                        <Icon size={15} className="text-cyan-400" />
                        <Eye size={13} className="text-slate-500" />
                      </div>
                      <p className="mt-4 text-2xl font-semibold text-slate-100">{stat.value}</p>
                      <p className="mt-1 text-[11px] text-slate-500">{stat.label}</p>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-2xl border border-cyan-500/20 bg-[radial-gradient(circle_at_top_left,_rgba(34,211,238,0.16),_rgba(2,13,24,0)_35%),linear-gradient(180deg,rgba(6,27,48,0.94),rgba(4,20,37,0.98))] p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-400">Placeholder Canvas</p>
                    <h3 className="mt-2 text-lg font-semibold text-slate-100">
                      Ocean operations map staging area
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">
                      This reserved canvas is ready for future Mapbox integration. For now it provides a
                      consistent visual footprint for overlay controls, annotations, and time-range review.
                    </p>
                  </div>
                  <div className="grid gap-2 text-[11px] text-slate-400">
                    <div className="flex items-center gap-2">
                      <Compass size={12} className="text-cyan-400" />
                      View bearing 42°
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPinned size={12} className="text-cyan-400" />
                      Reef edge anomaly corridor
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock3 size={12} className="text-cyan-400" />
                      Last viewport sync 4 min ago
                    </div>
                    {spatialOverlays ? (
                      <div className="flex items-center gap-2">
                        <Activity size={12} className="text-emerald-400" />
                        Last {spatialOverlays.windowDays} days · {spatialOverlays.generatedAt.slice(0, 10)}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-5">
                  <div className="relative h-[420px] overflow-hidden rounded-2xl border border-surface-borderSubtle bg-ocean-900/80">
                    <div className="absolute inset-0 opacity-40 [background-image:radial-gradient(circle_at_20%_25%,rgba(34,211,238,0.18),transparent_18%),radial-gradient(circle_at_72%_38%,rgba(16,185,129,0.14),transparent_20%),radial-gradient(circle_at_58%_68%,rgba(245,158,11,0.12),transparent_16%),linear-gradient(rgba(22,78,122,0.1)_1px,transparent_1px),linear-gradient(90deg,rgba(22,78,122,0.1)_1px,transparent_1px)] [background-size:auto,auto,auto,32px_32px,32px_32px]" />
                    <div className="absolute left-[11%] top-[18%] h-24 w-24 rounded-full border border-cyan-400/40 bg-cyan-400/10 blur-[2px]" />
                    <div className="absolute left-[52%] top-[42%] h-28 w-28 rounded-full border border-emerald-400/30 bg-emerald-400/10 blur-[2px]" />
                    <div className="absolute left-[68%] top-[20%] h-20 w-20 rounded-full border border-amber-400/30 bg-amber-400/10 blur-[2px]" />
                    <div className="absolute inset-x-10 top-1/3 border-t border-dashed border-cyan-500/25" />
                    <div className="absolute left-1/4 top-16 bottom-12 border-l border-dashed border-surface-borderSubtle" />

                    {visibleMarkerPoints.map((point, index) => {
                      const positionClassName = getMarkerPositionClasses(point, markerBounds, index);
                      return (
                        <div
                          key={point.id}
                          data-testid={`map-marker-${point.category}`}
                          className={cn("absolute -translate-x-1/2 -translate-y-1/2", positionClassName)}
                        >
                          <div className={cn("min-w-[110px] rounded-full border px-3 py-1 shadow-lg backdrop-blur", MARKER_STYLES[point.category])}>
                            <p className="truncate text-[10px] font-semibold uppercase tracking-[0.18em]">{CATEGORY_LABELS[point.category]}</p>
                            <p className="mt-1 truncate text-[11px] font-medium">{point.label}</p>
                          </div>
                        </div>
                      );
                    })}

                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="rounded-2xl border border-cyan-500/20 bg-ocean-900/85 px-8 py-6 text-center shadow-2xl">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10">
                          <Waves size={24} className="text-cyan-400" />
                        </div>
                        <p className="mt-4 text-base font-semibold text-slate-100">Map Canvas Placeholder</p>
                        <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                          Future interactive map mount point for Mapbox, marker layers, and live telemetry.
                        </p>
                        {visibleMarkerPoints.length === 0 && hasSpatialData(spatialOverlays) ? (
                          <p className="mt-3 text-[11px] text-slate-400">
                            No anchored markers are visible for the currently active overlay layers.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </div>

                {hasSpatialData(spatialOverlays) ? (
                  <div className="grid gap-3 lg:grid-cols-4">
                    {activeCategories.has("sightings") ? (
                      <article
                        data-testid="overlay-summary-sightings"
                        className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4"
                      >
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{CATEGORY_LABELS.sightings}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-100">{visibleSightings.length}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {visibleSightings.slice(0, 2).map((item) => item.commonName).join(", ") || "No visible sightings"}
                        </p>
                      </article>
                    ) : null}
                    {activeCategories.has("movement_signals") ? (
                      <article
                        data-testid="overlay-summary-movement_signals"
                        className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4"
                      >
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{CATEGORY_LABELS.movement_signals}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-100">{visibleMovementSignals.length}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {visibleMovementSignals[0] ? formatMovementType(visibleMovementSignals[0].movementType) : "No visible movement signals"}
                        </p>
                      </article>
                    ) : null}
                    {activeCategories.has("hotspots") ? (
                      <article
                        data-testid="overlay-summary-hotspots"
                        className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4"
                      >
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{CATEGORY_LABELS.hotspots}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-100">{visibleHotspots.length}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {visibleHotspots[0]?.label ?? "No visible hotspots"}
                        </p>
                      </article>
                    ) : null}
                    {activeCategories.has("corridors_foundation") ? (
                      <article
                        data-testid="overlay-summary-corridors_foundation"
                        className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4"
                      >
                        <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{CATEGORY_LABELS.corridors_foundation}</p>
                        <p className="mt-2 text-lg font-semibold text-slate-100">{visibleCorridors.length}</p>
                        <p className="mt-1 text-[11px] text-slate-500">
                          {visibleCorridors[0]?.label ?? "No visible corridor foundations"}
                        </p>
                      </article>
                    ) : null}
                  </div>
                ) : (
                  <div
                    data-testid="overlay-empty-state"
                    className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-sm text-slate-400"
                  >
                    No recent species overlays available for this map view.
                  </div>
                )}

                <div className="grid gap-3 lg:grid-cols-3">
                  {data.overlayEntities.map((entity) => (
                    <div key={entity.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/70 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-xs font-medium text-slate-100">{entity.label}</p>
                          <p className="mt-1 text-[11px] text-slate-500">{entity.region}</p>
                        </div>
                        <StatusBadge
                          label={entity.severity}
                          className={OVERLAY_SEVERITY_STYLES[entity.severity]}
                        />
                      </div>
                      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{entity.detail}</p>
                      <div className="mt-3 flex items-center justify-between text-[10px] uppercase tracking-[0.22em] text-slate-500">
                        <span>{entity.status}</span>
                        <span>{entity.detectedAt.slice(11, 16)} UTC</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </Panel>

          <Panel
            title="Timeline Controls"
            subtitle="Scrub the active window for historical or forecast review."
            action={
              <div className="flex items-center gap-2">
                <MapPinned size={12} className="text-cyan-400" />
                <button
                  type="button"
                  title="Pause timeline playback"
                  aria-label="Pause timeline playback"
                  className="rounded-full border border-surface-borderSubtle bg-ocean-850 p-2 text-slate-300 transition-colors hover:border-cyan-500/30 hover:text-slate-100"
                >
                  <Pause size={12} />
                </button>
                <button
                  type="button"
                  title="Resume timeline playback"
                  aria-label="Resume timeline playback"
                  className="rounded-full border border-cyan-500/25 bg-cyan-500/10 p-2 text-cyan-300 transition-colors hover:bg-cyan-500/15"
                >
                  <Play size={12} />
                </button>
              </div>
            }
          >
            <div className="space-y-4">
              <div className="h-2 overflow-hidden rounded-full bg-ocean-850">
                <div className="h-full w-[46%] rounded-full bg-gradient-to-r from-cyan-500 via-cyan-400 to-emerald-400" />
              </div>
              <div className="grid grid-cols-6 gap-2">
                {data.timelineSteps.map((step) => (
                  <button
                    key={step.label}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-xs transition-colors",
                      step.active
                        ? "border-cyan-500/25 bg-cyan-500/10 text-cyan-300"
                        : "border-surface-borderSubtle bg-ocean-850 text-slate-500 hover:text-slate-300",
                    )}
                  >
                    {step.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-500">
                <span>Range: Mar 13, 2026 00:00 UTC to Mar 14, 2026 12:00 UTC</span>
                <span className="font-mono text-slate-400">Playback speed: 6x</span>
              </div>
            </div>
          </Panel>
        </div>

        <Panel
          title="Region Details"
          subtitle="Focused context for the selected ocean sector."
          action={<Activity size={14} className="text-emerald-400" />}
          className="h-fit"
        >
          <div className="space-y-3">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/10 p-4">
              <p className="text-[10px] uppercase tracking-[0.22em] text-cyan-400">Selected Region</p>
              <p className="mt-2 text-lg font-semibold text-slate-100">Reef Edge Corridor</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                Spatial anomaly zone currently under active investigation for heat stress and current shear overlap.
              </p>
            </div>

            {data.regionMetrics.map((metric) => (
              <div key={metric.label} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">{metric.label}</p>
                <p className="mt-2 text-xs leading-relaxed text-slate-200">{metric.value}</p>
              </div>
            ))}

            {spatialOverlays ? (
              <div className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Spatial overlay window</p>
                    <p className="mt-2 text-xs text-slate-200">Last {spatialOverlays.windowDays} days</p>
                  </div>
                  <StatusBadge label={spatialOverlays.generatedAt.slice(0, 10)} className="border-cyan-500/25 bg-cyan-500/10 text-cyan-300" />
                </div>
              </div>
            ) : null}

            {hasSpatialData(spatialOverlays) ? (
              <>
                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Hotspot zones</p>
                  {activeCategories.has("hotspots") ? (
                    visibleHotspots.length > 0 ? (
                      visibleHotspots.map((hotspot) => (
                        <div key={hotspot.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium text-slate-100">{hotspot.label}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{hotspotAnchorLabel(hotspot)}</p>
                            </div>
                            <StatusBadge label={hotspot.severity} className={OVERLAY_SEVERITY_STYLES[hotspot.severity]} />
                          </div>
                          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{hotspot.detail}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-[11px] text-slate-400">
                        No hotspot groups are visible for the current layer state.
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-[11px] text-slate-400">
                      Hotspot layer is currently off.
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">Corridor foundations</p>
                  {activeCategories.has("corridors_foundation") ? (
                    visibleCorridors.length > 0 ? (
                      visibleCorridors.map((corridor) => (
                        <div key={corridor.id} className="rounded-xl border border-surface-borderSubtle bg-ocean-850/75 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-medium text-slate-100">{corridor.label}</p>
                              <p className="mt-1 text-[11px] text-slate-500">{corridor.region}</p>
                            </div>
                            <StatusBadge label={corridor.priority} className={CATEGORY_CARD_ACCENTS.corridors_foundation} />
                          </div>
                          <p className="mt-3 text-[11px] leading-relaxed text-slate-400">{corridor.summary}</p>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-[11px] text-slate-400">
                        No corridor foundations are visible for the current layer state.
                      </div>
                    )
                  ) : (
                    <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-[11px] text-slate-400">
                      Corridor foundations layer is currently off.
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-surface-borderSubtle bg-ocean-850/60 p-4 text-[11px] text-slate-400">
                No recent spatial overlay intelligence is available for the selected region.
              </div>
            )}

            <div className="rounded-xl border border-dashed border-emerald-500/25 bg-emerald-500/5 p-4">
              <div className="flex items-start gap-3">
                <Wind size={16} className="mt-0.5 text-emerald-400" />
                <div>
                  <p className="text-xs font-medium text-slate-200">Analyst note</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-500">
                    Current vector changes appear to be steering warmer water farther along the shelf edge than yesterday&#39;s pass.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}
