# NDBC Baseline Backtest

- Dataset: deterministic fixture-based replay
- Window: 45 days
- Threshold rule: fixed SST > 30 C
- Baseline rule: z-score >= 2.0 with monthly seasonal bucket fallback

## Metrics

- Threshold alert volume: 1
- Baseline alert volume: 3
- Stability proxy:
  - Threshold variance proxy: 0
  - Baseline variance proxy: 1
- Overlap proxy: 1

## Interpretation

- Threshold-only alerts stay sparse and only fire at the hard limit.
- Baseline alerts surface earlier statistically unusual warming while keeping the rule deterministic.
- This report is fixture-driven today and is ready to be replaced with a historical NDBC replay once a larger archive is wired into the backtest script.
