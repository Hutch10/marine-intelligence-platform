# Marine-Signal-Detection-Agent

**Purpose**: Advanced pattern detection across multi-source time-series; anomaly correlation  
**Scope**: Deferred for Phase 4+ (after 2+ additional data sources integrated)  
**Maturity**: Specification & design only (implementation deferred)  
**Owned By**: Data Science / Modeling Team (future)

---

## Context: Why This Agent is Deferred

### Current State (Mar 2026)
- **Data Sources**: 3 (NDBC, Coral Reef Watch, Regional stations)
- **Time-Series Data**: 3 months of continuous observations
- **Pattern Library**: ~12 known anomaly types documented from operational experience
- **Detection Method**: Statistical thresholds (z-score, rate-of-change); rule-based

### Deferral Rationale
1. **Insufficient Data Sources**: Signal detection requires correlated observations across 5+ sources to distinguish real phenomena (e.g., upwelling, thermal events) from sensor noise or local anomalies
2. **Immature ML Models**: Current approach (statistical thresholds) works well; ML models should Not be introduced without operational baseline and domain ground-truth
3. **Limited Priority**: Current anomaly detection serves stakeholder needs adequately; advanced correlation analysis can wait
4. **Risk Profile**: Automating signal detection too early risks high false-alarm rate that erodes stakeholder trust

### When to Activate (Phase 4: Q3 2026)
- 5+ integrated data sources with 6+ months continuous data
- Comprehensive validation of anomaly types against domain expertise (**ground-truth labeling**)
- Dashboard stakeholders request multi-source correlation analysis
- Sufficient modeling resources allocated to development + validation

---

## Agent Specification (Implementation Plan)

## Core Responsibility

The Signal-Detection Agent performs advanced time-series analysis across all available data sources to identify multi-scale phenomena (upwelling events, thermal anomalies, biotic response patterns) that may not be apparent in single-source analysis. It correlates signals, identifies event timing, and estimates physical/biological causation.

### Primary Functions (Planned)
1. **Multi-Source Correlation**: Analyze co-occurrence of anomalies across sources
2. **Temporal Pattern Recognition**: Identify sequence patterns (e.g., upwelling → temperature drop → nutrient influx)
3. **Spatial Coherence**: Map anomalies to ocean features (eddies, upwelling zones)
4. **Event Extraction**: Identify distinct phenomena with boundaries (start/peak/end times)
5. **Causation Inference**: Suggest causal relationships between signals
6. **Real vs. Artifact Classification**: Distinguish real physics from sensor/data processing artifacts

---

## Planned Inputs (When Implemented)

### Required Inputs
1. **Multi-Source Time-Series** (at least 5 sources)
   - Temperature, salinity, nutrient levels, chlorophyll, current velocity, etc.
   - Synchronized timestamps (UTC); consistent temporal resolution
   - Quality flags or uncertainty estimates

2. **External Forcing Data** (physical drivers)
   - Wind stress, atmospheric pressure, tidal phase
   - Satellite SST, sea level anomalies
   - Solar radiation, seasonal indicators

3. **Historical Event Catalog** (with ground-truth labels)
   - Known upwelling events (dates, locations, magnitude)
   - Thermal anomalies with ecological impacts
   - Identified sensor failures vs. real signals

4. **Domain Knowledge Graph** (ocean processes)
   - Typical upwelling signatures (temp, salinity, nutrient patterns)
   - Expected time lags between drivers and responses
   - Spatial extent of typical phenomena

---

## Planned Processing Logic (When Implemented)

### Stage 1: Multi-Source Preprocessing
```
Aggregate observations from all sources into unified time-series grid:
- Spatial interpolation (kriging, spline methods)
- Temporal alignment (resampling to common resolution)
- Quality filtering (remove duplicates, obvious errors)
- Standardization (z-score scaling per source)
```

### Stage 2: Anomaly Detection (Enhanced)
```
For each observation location and variable:
1. Compute local anomaly using updated statistical baseline
2. Weight by data quality and source reliability
3. Compute multi-scale anomalies (daily, weekly, seasonal deviations)
4. Identify synchronized anomalies across variables
```

### Stage 3: Pattern Recognition
```
Apply learned models / heuristics:
- Clustering: Group synchronized anomalies into potential events
- Sequence mining: Identify recurring sequences of anomalies
- Correlation analysis: Measure co-variability across sources
- Lag analysis: Identify causal time lags (e.g., upwelling → temperature drop)
```

### Stage 4: Event Classification
```
For each detected cluster/sequence:
1. Extract event features (magnitude, duration, spatial extent)
2. Match against historical event catalog
3. Assign event type (upwelling, thermal anomaly, nutrient pulse, etc.)
4. Estimate confidence score
5. Generate causal hypothesis
```

### Stage 5: Real-vs-Artifact Classification
```
For high-confidence events:
1. Cross-validate against satellite/external data (if available)
2. Check for known sensor failure patterns
3. Validate physics (do parameters co-vary as expected?)
4. Assign confidence (high / medium / low / artifact)
```

---

## Planned Output (When Implemented)

### Event Report (Markdown)
```markdown
# Detected Marine Events

**Detection Date**: 2026-09-15  
**Events This Period**: 3 confirmed, 2 tentative

## Event 1: Coastal Upwelling (CONFIRMED)
- **Date Range**: Sep 12–15, 2026
- **Location**: NDBC Stations 41001–41004 (shelf break)
- **Type**: Coastal upwelling
- **Confidence**: 95%

### Signatures Detected
- Temperature drop: 2.5°C (Sep 13–14)
- Salinity increase: +0.8 PSU
- Nutrient pulse: Nitrate +3.2 µM
- Current shift: 180° rotation (upwelling-favorable wind response)

### Correlation Analysis
- Wind stress leads temperature drop by 6–12 hours (expected physical lag)
- Temperature and salinity changes synchronous across 3 sources
- Nutrient response delayed 24h (biological mixing time)

### Causation Assessment
- **Primary Driver**: Upwelling-favorable wind (verified from external wind data)
- **Expected Impact**: Nutrient fertilization; phytoplankton bloom in 5–7 days
- **Recommendation**: Flag for monitoring; ecosystem response expected

---

## Event 2: Thermal Anomaly (TENTATIVE)
- **Date Range**: Sep 14–16 (ongoing)
- **Location**: CRW Station, surface layer
- **Type**: Warm core ring OR sensor artifact
- **Confidence**: 45% (insufficient corroboration)

### Signatures Detected
- Temperature spike: +3.2°C (isolated to CRW surface layer)
- Other sources: No corresponding anomaly

### Assessment
- Insufficient multi-source corroboration; could be:
  1. Real phenomenon locally isolated to CRW footprint
  2. Sensor error or calibration drift
  3. Data processing artifact (quality flag check needed)

### Recommendation
- Request secondary validation (satellite SST, nearby buoys)
- Escalate to QA if confirmed artifact

---

```

### Structured Event Record (JSON)
```json
{
  "timestamp_utc": "2026-09-15T12:00:00Z",
  "detection_events": [
    {
      "event_id": "event-uuid-1",
      "event_type": "upwelling",
      "date_start": "2026-09-12T00:00:00Z",
      "date_end": "2026-09-15T12:00:00Z",
      "location": [41.0, -71.5],  // Lat/Lon
      "spatial_extent_km": 50,
      "confidence": 0.95,
      "signatures": [
        { "variable": "temperature", "magnitude_change": -2.5, "unit": "°C" },
        { "variable": "salinity", "magnitude_change": 0.8, "unit": "PSU" },
        { "variable": "nitrate", "magnitude_change": 3.2, "unit": "µM" }
      ],
      "sources_involved": ["NDBC", "NDBC", "REGIONAL"],
      "causation": {
        "primary_driver": "upwelling_favorable_wind",
        "lag_hours": 12,
        "expected_response": "phytoplankton_bloom"
      },
      "recommendation": "monitor_ecosystem_response"
    },
    {
      "event_id": "event-uuid-2",
      "event_type": "uncertain",  
      "confidence": 0.45,
      "reason": "insufficient_corroboration",
      "recommendation": "request_validation"
    }
  ]
}
```

---

## Success Criteria (When Implemented)

### Phase 4 Development (Q3 2026)
- [ ] Multi-source interpolation algorithm validated
- [ ] Historical event catalog with ground-truth labels created (50+ events)
- [ ] Pattern recognition algorithm tested against known events
- [ ] Real-vs-artifact classifier trained; accuracy > 90%
- [ ] Event detection on historical data: sensitivity > 80%, specificity > 95%

### Phase 4 Validation (Aug–Sep 2026)
- [ ] Real-time detection on 2 months new data
- [ ] Domain expert review of 100% of detections (ground-truth validation)
- [ ] False-positive rate in operational setting < 5%
- [ ] Zero missed major events (sensitivity = 100% for high-confidence thresholds)

### Phase 4+ Operational (Oct+ 2026)
- [ ] Event detection latency < 24h (detected next day after event completes)
- [ ] Scientist satisfaction: 4/5 on event quality and actionability
- [ ] Corroboration with external data sources (satellites, models) successful > 90%

---

## Implementation Roadmap (Deferred to Phase 4)

### Q2 2026 (Planning Phase)
- Data science team assembles historical event catalog (50+ labeled events)
- Literature review on ocean signal detection methods
- Design pattern recognition algorithm (clustering, sequence mining)
- Procurement/setup of ML infrastructure (if needed)

### Q3 2026 (Development Phase)
- Develop multi-source correlation engine
- Train pattern recognition models
- Build real-vs-artifact classifier
- Validation testing on historical data
- Integration with rest of platform

### Sep 2026 (Pilot Phase)
- Deploy with operator oversight
- Domain expert review of all detections
- Calibration based on feedback
- Gradual increase in automation

### Oct+ 2026 (Autonomous Operation)
- Event detection runs autonomously
- Results published to dashboard
- Integrated into orchestrator signal stream

---

## Staffing & Resource Requirements (Deferred)

- **Data Scientist (1 FTE)**: Algorithm development, model training, validation
- **Domain Expert (0.5 FTE)**: Ground-truth labeling, algorithm consultation
- **ML Infrastructure**: Access to compute resources (GPU training, if needed)
- **Data Access**: Full time-series archive (3+ years); external satellite/model data
- **Timeline**: 3-4 months (planning + development + validation)

---

## Risks & Mitigations (Anticipated)

| Risk | Impact | Mitigation |
|------|--------|-----------|
| False-positive rate high | Loss of stakeholder trust; alert fatigue | Extensive validation; conservative confidence thresholds |
| Insufficient data coverage | Undetectable patterns in sparse regions | Wait for more data sources; spatial interpolation methods |
| Model overfitting to historical events | Poor generalization to new phenomena | Cross-validation; domain expert review; test on held-out data |
| Causation inference errors | Misleading scientific conclusions | Use explicit uncertainty; frame as "hypotheses" not "facts" |

---

## System Prompt Template (For Future Use)

```
[NOT YET ACTIVE — Template for Phase 4 Implementation]

You are the Signal-Detection Agent for the Marine Bio Platform.

Your role is to identify multi-source phenomena and infer causal relationships 
between observations from multiple sources.

INPUTS:
- Multi-source time-series (5+ sources with synchronized timestamps)
- External forcing data (wind, pressure, satellite SST, etc.)
- Historical event catalog (for training and validation)

YOUR TASK:
1. Detect multi-scale anomalies across all sources
2. Identify synchronized anomalies (same time, different variables)
3. Cluster anomalies into potential events
4. Match events against known patterns from history
5. Classify real phenomena vs. artifacts
6. Infer driving mechanisms and causation

OUTPUT:
Generate event records with:
- Event type and occurrence windows
- Corroborating signatures from multiple sources
- Confidence score
- Causal hypothesis and supporting evidence
- Scientific interpretation

Distinguish between CONFIRMED (high confidence, multi-source), 
TENTATIVE (moderate confidence, needs validation), 
and ARTIFACT (likely sensor error).

Do not over-claim causation; covariation ≠ causation.
Present results as hypotheses; let domain experts verify.
```

---

## Why Deferred Rationale (Detailed)

### Operational Sufficiency
Current threshold-based anomaly detection serves all stakeholder needs:
- Beach closures triggered on temperature + safety thresholds (not multi-source correlation)
- Fisheries warnings triggered on individual anomaly alerts (not pattern causation)
- Ecosystem monitoring uses seasonal baselines (not event clustering)

**Benefit of delay**: Stakeholders still get actionable alerts; no service gap.

### Data Maturity
With 3 sources and 3 months of data (Mar 2026), insufficient for robust pattern recognition:
- Seasonal cycles not fully understood yet
- Insufficient ground-truth events to train models
- Spatial coverage too sparse for reliable interpolation

**Benefit of delay**: 6 additional months (Sep 2026) provides 9 months continuous data, 5+ sources, and ~50 labeled events for training.

### Risk Profile
Introducing complex ML models early creates risks:
- Stakeholder confusion ("Why is the algorithm predicting upwelling?")
- High false-alarm rate erodes trust
- Model failures catastrophic if not well-understood

**Benefit of delay**: Build organizational trust with simpler alerts first; advance to complexity gradually.

### Resource Allocation
Data science team currently focused on:
- Data validation infrastructure
- Dashboard development
- Pilot program management

**Benefit of delay**: Allows team to deliver foundational infrastructure first; Signal Detection can be added when team bandwidth available (Q3 2026).

---

## Activation Checklist (For Phase 4)

- [ ] Confirm 5+ data sources integrated with 6+ months continuous data
- [ ] Assemble and label historical event catalog (50+ events)
- [ ] Assign dedicated data scientist to project
- [ ] Design and prototype pattern recognition algorithm
- [ ] Validate on historical data (>80% sensitivity, >95% specificity)
- [ ] Build integration with orchestrator + dashboard
- [ ] Domain expert review of design
- [ ] Stakeholder feedback on event format/presentation
- [ ] Pilot deployment with operator oversight
- [ ] Calibrate based on first month of operational detections
- [ ] Gradual rollout to autonomous operation

---

## Next Steps

1. **Archive this specification**: Store in version control for Phase 4 reference
2. **Assign Phase 4 owner**: Identify data scientist who will lead implementation
3. **Schedule Phase 3 retrospective**: When Q3 2026 arrives, review this spec + update as needed
4. **Monitor readiness indicators**:
   - Data source count (goal: 5+)
   - Continuous data age (goal: 6+ months)
   - Team bandwidth (goal: 1 FTE available)
5. **Re-plan in Aug 2026**: Finalize Phase 4 timeline based on actual progress

---

## Contact & Support

- **Agent Owner** (Future): Data Science Lead (TBD)
- **Last Updated**: March 18, 2026
- **Status**: Deferred to Phase 4 (Q3–Oct 2026)
- **Activation Date**: Tentative Sep 2026 (subject to data/resource readiness)
- **Questions**: See marine-agent-system-overview.md or escalate to Platform Architecture Team

