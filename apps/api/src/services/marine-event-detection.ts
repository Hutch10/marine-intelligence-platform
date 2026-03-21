import type {
  MarineDetectionContextualInput,
  MarineDetectionThresholdInput,
  MarineDetectionTrendInput,
  MarineEventCreateInput,
} from "../marine-intelligence-types";

/**
 * Evaluates a single SST observation against its climatological baseline.
 * Returns a threshold_alert event input when deviation >= 1.0°C, else null.
 *
 * Severity:
 *   deviation >= 2.0°C → "critical"  confidence = 70 + floor((dev - 2.0) * 10), capped at 100
 *   deviation >= 1.0°C → "high"      confidence = 50 + floor((dev - 1.0) * 20), capped at 69
 */
export function evaluateThresholdAlert(
  input: MarineDetectionThresholdInput,
): MarineEventCreateInput | null {
  const deviation = input.observedValue - input.baselineValue;

  if (deviation < 1.0) {
    return null;
  }

  const severity = deviation >= 2.0 ? "critical" : "high";
  const confidence =
    deviation >= 2.0
      ? Math.min(100, 70 + Math.floor((deviation - 2.0) * 10))
      : Math.min(69, 50 + Math.floor((deviation - 1.0) * 20));

  return {
    ontologyTermId: "mdl.threshold_alert",
    eventClass: "threshold_alert",
    severity,
    status: "detected",
    title: `SST Threshold Alert: ${deviation.toFixed(2)}\u00b0C above baseline`,
    summary:
      `Sea surface temperature ${input.observedValue.toFixed(2)}\u00b0C` +
      ` observed against baseline ${input.baselineValue.toFixed(2)}\u00b0C` +
      ` (\u0394\u00a0${deviation.toFixed(2)}\u00b0C).`,
    region: input.region,
    stationId: input.stationId,
    confidence,
    lineage: {
      source: input.source,
      sourceRecordId: input.sourceRecordId,
      ingestionRunId: input.ingestionRunId,
      observedAt: input.observedAt,
      ingestedAt: input.ingestedAt,
    },
    detectedAt: input.ingestedAt,
  };
}

/**
 * Evaluates a time-ordered series of temperature readings for rate-of-change.
 * Requires at least 3 observations. Returns a trend_signal event input when
 * the rise rate >= 0.1°C/hr, else null.
 *
 * Severity:
 *   rate >= 0.2°C/hr → "high"    confidence = 50 + floor(rate * 100), capped at 90
 *   rate >= 0.1°C/hr → "medium"  confidence = 40 + floor(rate * 150), capped at 75
 */
export function evaluateTrendSignal(
  input: MarineDetectionTrendInput,
): MarineEventCreateInput | null {
  if (input.observations.length < 3) {
    return null;
  }

  const sorted = [...input.observations].sort(
    (a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt),
  );

  const firstMs = Date.parse(sorted[0].observedAt);
  const lastMs = Date.parse(sorted[sorted.length - 1].observedAt);
  const hoursElapsed = (lastMs - firstMs) / (1000 * 60 * 60);

  if (hoursElapsed <= 0) {
    return null;
  }

  const ratePerHour =
    (sorted[sorted.length - 1].value - sorted[0].value) / hoursElapsed;

  if (ratePerHour < 0.1) {
    return null;
  }

  const severity = ratePerHour >= 0.2 ? "high" : "medium";
  const confidence =
    severity === "high"
      ? Math.min(90, 50 + Math.floor(ratePerHour * 100))
      : Math.min(75, 40 + Math.floor(ratePerHour * 150));

  const lastObs = sorted[sorted.length - 1];

  return {
    ontologyTermId: "mdl.trend_signal",
    eventClass: "trend_signal",
    severity,
    status: "detected",
    title: `SST Trend Signal: ${ratePerHour.toFixed(3)}\u00b0C/hr`,
    summary:
      `Sea surface temperature rising at ${ratePerHour.toFixed(3)}\u00b0C per hour` +
      ` over ${hoursElapsed.toFixed(1)} hours.`,
    region: input.region,
    stationId: input.stationId,
    confidence,
    lineage: {
      source: input.source,
      sourceRecordId: input.sourceRecordId,
      ingestionRunId: input.ingestionRunId,
      observedAt: lastObs.observedAt,
      ingestedAt: input.ingestedAt,
    },
    detectedAt: input.ingestedAt,
  };
}

/**
 * Evaluates multi-source convergence signals (HotSpot + DHW).
 * Returns a contextual_signal event input when hotspot > 0 AND dhw >= 4, else null.
 *
 * Severity:
 *   hotspot > 1.0 AND dhw >= 8 → "critical"
 *   otherwise → "high"
 * Confidence = 55 + floor(dhw * 3) + floor(hotspot * 5), capped at 95
 */
export function evaluateContextualSignal(
  input: MarineDetectionContextualInput,
): MarineEventCreateInput | null {
  if (input.hotspotValue <= 0 || input.dhwValue < 4) {
    return null;
  }

  const severity =
    input.hotspotValue > 1 && input.dhwValue >= 8 ? "critical" : "high";
  const confidence = Math.min(
    95,
    55 + Math.floor(input.dhwValue * 3) + Math.floor(input.hotspotValue * 5),
  );

  return {
    ontologyTermId: "mdl.contextual_signal",
    eventClass: "contextual_signal",
    severity,
    status: "detected",
    title:
      `Reef Stress Convergence: Hotspot ${input.hotspotValue.toFixed(2)}\u00b0C` +
      ` / DHW ${input.dhwValue.toFixed(2)}`,
    summary:
      `Multi-source convergence: HotSpot ${input.hotspotValue.toFixed(2)}\u00b0C above threshold` +
      ` with DHW ${input.dhwValue.toFixed(2)} degree-heating-weeks.`,
    region: input.region,
    stationId: input.stationId,
    confidence,
    lineage: {
      source: input.source,
      sourceRecordId: input.sourceRecordId,
      ingestionRunId: input.ingestionRunId,
      observedAt: input.observedAt,
      ingestedAt: input.ingestedAt,
    },
    detectedAt: input.observedAt,
  };
}
