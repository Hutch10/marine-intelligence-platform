# Researcher Workflow Review

Walkthrough: **research question → anomaly → investigation → lineage → export**

## Path in platform

| Step | Surface | Data / trust hooks |
|------|---------|-------------------|
| 1. Research question | Dashboard `/` | Region risk, anomaly summary, live conditions (freshness-gated) |
| 2. Anomaly | Dashboard + `GET /anomalies` (via web proxy) | Provenance block on anomaly: `sourceMetrics`, `sourceObservationTimestamps`, evidence summary |
| 3. Investigation | `/investigations`, `/investigations/[id]` | Marine investigations API; signals linked; analytics counts open (no id stored) |
| 4. Lineage | `/operator/lineage?recordId=…` (operator) | Per-metric timestamps, backfill flags, `metrics_concurrent`, freshness, provenance payload |
| 5. Export | `GET /internal/scientific/export`, `POST /v1/explorer/export` (observations dataset) | Provenance id, ingestion time, confidence adjustment, backfill indicators |

## Friction points

| Area | Issue | Severity |
|------|-------|----------|
| Lineage access | Lineage UI is **operator-only**, not on public investigation detail | High for self-serve researchers |
| Observation id discovery | Researchers must know `OBS-…` record id to trace lineage | Medium |
| Investigation ↔ observation link | Investigation page shows signals but not direct “view lineage” for backing observation | Medium |
| Export access | Scientific export requires operator token / internal path | High for external beta |
| CRW/IOOS temporal tagging | Per-metric times are NDBC-centric in provenance | Medium for multi-source papers |
| Recovery backfill | Re-ingest is source-level, not window-precise replay | Low for ops, medium for gap audits |

## Terminology

| Term | Clarity | Note |
|------|---------|------|
| `metrics_concurrent` | May confuse | Prefer helper text: “metrics may be from different observation times” |
| `freshness_classification` | Good | Values `live` / `stale` / `withheld` / `unknown` |
| `confidence_adjustment` | Technical | Export explains backfill/non-concurrent degradation |
| `operator_usage` vs “operator view” | Internal naming | Maps to operator console analytics |
| `export` vs “export generated” | Internal naming | Same event in analytics |

## Missing evidence (gaps)

- Public investigation page does not surface **provenance id** or per-metric observation times inline.
- Anomaly card does not link to **lineage** or **export** in one click.
- No researcher-facing **audit bundle** (ZIP/JSON) combining investigation + lineage + export manifest.
- 72h soak not yet executed in production (checklist only).

## Provenance strengths

- Strict temporal tagging on NDBC observations
- Provenance records on ingest with backfill indicators
- Scientific export audit fields verified by tests
- Fail-closed live promotion when sources fail (hostile verification)

## Recommended UX tweaks (post-validation, not in sprint scope)

1. Read-only lineage snippet on investigation detail (provenance summary only, no operator token).
2. “Download evidence package” on investigation when observation id known.
3. Glossary tooltips for `metrics_concurrent` and freshness classes.
