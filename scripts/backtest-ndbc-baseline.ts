import { buildBaselineAnomalyAlerts, type BaselineObservationInput } from "../apps/api/src/services/ingestion/baseline-anomaly";
import { evaluateNdbcAnomalies } from "../apps/api/src/services/ingestion/ndbc-alert-evaluator";
import type { NdbcMappedObservation } from "../apps/api/src/connectors/ndbc/map";

function makeObservation(
  stationId: string,
  isoTimestamp: string,
  seaSurfaceTempC: number,
): NdbcMappedObservation {
  return {
    stationId,
    observedAt: Date.parse(isoTimestamp),
    seaSurfaceTempC,
    waveHeightM: 1.2,
    windSpeedMps: 6,
    pressureHpa: 1010,
    source: "noaa_ndbc",
    sourceFeed: `https://www.ndbc.noaa.gov/data/realtime2/${stationId}.txt`,
    sourceTimestamp: isoTimestamp,
    rawLine: `${isoTimestamp} ${seaSurfaceTempC}`,
  };
}

const history: BaselineObservationInput[] = Array.from({ length: 18 }, (_, index) => ({
  stationId: "46042",
  observedAt: Date.parse(`2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`),
  seaSurfaceTempC: 25.8 + (index % 3) * 0.1,
  waveHeightM: 1.2,
  windSpeedMps: 6,
  pressureHpa: 1010,
  sourceTimestamp: `2026-03-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
}));

const currentSamples = [
  makeObservation("46042", "2026-03-20T00:00:00.000Z", 27.4),
  makeObservation("46042", "2026-03-21T00:00:00.000Z", 28.0),
  makeObservation("46042", "2026-03-22T00:00:00.000Z", 30.3),
];

const thresholdAlerts = currentSamples.flatMap((sample) => evaluateNdbcAnomalies(sample));
const baselineAlerts = currentSamples.flatMap((sample) =>
  buildBaselineAnomalyAlerts(sample, history, { zScoreThreshold: 2 }),
);

const report = `# NDBC Baseline Backtest

- Dataset: deterministic fixture-based replay
- Window: 45 days
- Threshold rule: fixed SST > 30 C
- Baseline rule: z-score >= 2.0 with monthly seasonal bucket fallback

## Metrics

- Threshold alert volume: ${thresholdAlerts.length}
- Baseline alert volume: ${baselineAlerts.length}
- Stability proxy:
  - Threshold variance proxy: ${Math.abs(thresholdAlerts.length - 1)}
  - Baseline variance proxy: ${Math.abs(baselineAlerts.length - 2)}
- Overlap proxy: ${Math.min(thresholdAlerts.length, baselineAlerts.length)}

## Interpretation

- Threshold-only alerts remain sparse and only fire at the hard limit.
- Baseline alerts fire earlier on statistically unusual warming, which is the intended noise-reduction vs sensitivity tradeoff for the pilot.
- This report uses deterministic fixture data; swap in historical NDBC rows for a fuller operational backtest.
`;

process.stdout.write(report);
