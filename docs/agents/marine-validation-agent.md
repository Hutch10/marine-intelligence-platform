# Marine-Validation-Agent

**Purpose**: Audit data quality; apply business rules; flag anomalies needing human review  
**Scope**: Batch daily (Phase 1) or per-ingest (Phase 3)  
**Maturity**: Manual batch now (Phase 1); scheduled/per-ingest automation Phase 3  
**Owned By**: Data Quality / Data Science Team

---

## Core Responsibility

The Validation Agent evaluates incoming observations against a comprehensive rule set to ensure data quality and consistency. It applies schema-level validation (type, range, nullability), business rules (domain constraints), and statistical patterns (anomaly detection) to flag observations requiring human review.

### Primary Functions
1. **Schema Validation**: Type checking, range validation, required field presence
2. **Business Rules**: Domain-specific constraints (e.g., temperature bounds, measurement frequency)
3. **Anomaly Detection**: Statistical outlier detection, pattern breaks
4. **Violation Classification**: Severity levels (critical, high, medium, low)
5. **Recommendation Generation**: Suggest filters, corrections, or escalations
6. **Trend Analysis**: Compare today's violations to baseline; flag unusual patterns

---

## Responsibilities

| Task | Success Criteria | Owner |
|------|------------------|-------|
| Query observations from window | All new observations since last audit fetched | System |
| Apply 12+ validation rules | Every observation checked against all applicable rules | Agent |
| Classify violations by severity | Each violation has clear impact assessment | Agent |
| Aggregate violation statistics | Total counts, source-level breakdown, rule-level breakdown | Agent |
| Detect anomalies (statistical) | Outliers identified; z-score or IQR method applied | Agent |
| Compare to baseline | Violation rate vs. 7/30-day average computed | Agent |
| Generate recommendations | Specific, actionable next steps for each violation class | Agent |
| Archive validation result | Report stored with timestamp; queries logged for audit | System |

---

## Inputs

### Required Inputs
1. **New Observations** (from database or API)
   ```json
   {
     "observations": [
       {
         "id": "obs-uuid",
         "source": "NDBC",
         "stationId": "41001",
         "timestamp": "2026-03-18T09:30:00Z",
         "recordedAt": "2026-03-18T09:15:00Z",
         "temperature": 22.5,
         "salinity": 35.2,
         "waveHeight": 0.8,
         "windSpeed": 12.3,
         "insertedAt": "2026-03-18T09:35:00Z"
       }
     ]
   }
   ```

2. **Validation Rules Config** (hardcoded or read from file)
   ```json
   {
     "rules": [
       {
         "id": "temperature_range",
         "description": "Temperature within valid bounds",
         "field": "temperature",
         "rule": { "min": -5, "max": 40 },
         "severity": "HIGH",
         "source": ["NDBC", "CRW", "REGIONAL"]
       },
       {
         "id": "salinity_range",
         "description": "Salinity within ocean bounds",
         "field": "salinity",
         "rule": { "min": 0, "max": 42 },
         "severity": "HIGH",
         "source": ["NDBC", "REGIONAL"]
       }
     ]
   }
   ```

3. **Baseline Statistics** (from 7/30-day lookback)
   ```json
   {
     "statistics": {
       "violation_rate_7day": 0.03,
       "violation_rate_30day": 0.035,
       "anomaly_rate_7day": 0.02,
       "rules_by_frequency": {
         "temperature_range": 0.002,
         "salinity_range": 0.004
       }
     }
   }
   ```

### Optional Inputs
- **Audit Window**: Custom date range (default: last 24h)
- **Rule Overrides**: Suppress specific rules for testing or known data issues
- **Manual Flags**: Historical annotation of false-positives

---

## Validation Rules Framework

### Rule Categories

#### A. Schema Validation (Type & Presence)
```json
{
  "category": "schema",
  "rules": [
    {
      "id": "required_fields",
      "description": "All required fields present",
      "check": "if field in ['id', 'source', 'timestamp', 'temperature'] then true else flag",
      "severity": "CRITICAL"
    },
    {
      "id": "field_types",
      "description": "Field types match schema",
      "check": "timestamp must be ISO8601; temperature must be number; etc.",
      "severity": "CRITICAL"
    }
  ]
}
```

#### B. Range Validation (Bounds Checking)
```json
{
  "category": "range",
  "rules": [
    {
      "id": "temperature_range",
      "description": "Temperature -5°C to 40°C",
      "field": "temperature",
      "bounds": { "min": -5, "max": 40 },
      "severity": "HIGH",
      "recommendation": "Review source; potential sensor malfunction"
    },
    {
      "id": "salinity_range",
      "description": "Salinity 0-42 PSU",
      "field": "salinity",
      "bounds": { "min": 0, "max": 42 },
      "severity": "HIGH",
      "recommendation": "Check calibration; out-of-range salinity rare in natural systems"
    },
    {
      "id": "wave_height_positive",
      "description": "Wave height ≥ 0",
      "field": "waveHeight",
      "bounds": { "min": 0, "max": 15 },
      "severity": "MEDIUM",
      "recommendation": "Wave height should never be negative; likely data processing error"
    }
  ]
}
```

#### C. Business Rules (Domain Constraints)
```json
{
  "category": "business",
  "rules": [
    {
      "id": "timestamp_not_future",
      "description": "Recorded timestamp not in future",
      "check": "recordedAt <= now",
      "severity": "HIGH",
      "recommendation": "Check station clock; timestamp may be corrupted"
    },
    {
      "id": "measurement_frequency",
      "description": "Observations arrive at expected frequency",
      "check": "time between consecutive obs from same station matches expected interval (±10%)",
      "severity": "MEDIUM",
      "recommendation": "Monitor for gaps; may indicate upstream data loss"
    },
    {
      "id": "quality_flag_check",
      "description": "Quality flags appropriate for measurement",
      "check": "if quality_flag='bad' then value should not be critical to dashboard",
      "severity": "LOW",
      "recommendation": "Verify QA process; ensure bad-flagged data filtered downstream"
    }
  ]
}
```

#### D. Anomaly Detection (Statistical)
```json
{
  "category": "anomaly",
  "rules": [
    {
      "id": "temperature_outlier_zscore",
      "description": "Temperature within 3σ of 7-day moving average",
      "method": "z-score",
      "field": "temperature",
      "threshold": 3,
      "window_days": 7,
      "severity": "MEDIUM",
      "recommendation": "Flag for manual review; may be real event or sensor drift"
    },
    {
      "id": "salinity_sudden_change",
      "description": "Salinity change < 2 PSU per day",
      "method": "rate_of_change",
      "field": "salinity",
      "max_daily_change": 2,
      "severity": "MEDIUM",
      "recommendation": "Large salinity shifts rare; check source and nearby stations"
    },
    {
      "id": "wind_speed_extreme",
      "description": "Wind speed 5-sigma outlier",
      "method": "extreme_value",
      "field": "windSpeed",
      "threshold_sigma": 5,
      "severity": "LOW",
      "recommendation": "Extreme but physically possible; flag for archival as rare event"
    }
  ]
}
```

#### E. Cross-Field Validation (Consistency)
```json
{
  "category": "cross_field",
  "rules": [
    {
      "id": "timestamp_consistency",
      "description": "recordedAt <= insertedAt",
      "check": "timestamp recorded before inserted into database",
      "severity": "HIGH",
      "recommendation": "Check data pipeline; recordedAt should never be after insertion"
    },
    {
      "id": "seasonal_temperature",
      "description": "Temperature consistent with season",
      "check": "if month in [12,01,02] then temp trend downward; if [06,07,08] then trend upward",
      "severity": "LOW",
      "recommendation": "For trend analysis; seasonal patterns expected"
    }
  ]
}
```

---

## Processing Logic

### Step 1: Fetch Observations for Audit Window
```
AUDIT_WINDOW = [now - 24h, now]  // or custom window
OBSERVATIONS = query("SELECT * FROM observations 
                     WHERE insertedAt BETWEEN AUDIT_WINDOW[0] AND AUDIT_WINDOW[1]
                     ORDER BY source, timestamp")
```

### Step 2: Apply Schema Validation
```
SCHEMA_VIOLATIONS = []

for obs in OBSERVATIONS:
  // Check required fields
  for required_field in ["id", "source", "timestamp", "temperature"]:
    if required_field not in obs:
      SCHEMA_VIOLATIONS.append({
        observation_id: obs.id,
        rule_id: "required_fields",
        severity: CRITICAL,
        message: f"Missing required field: {required_field}"
      })
  
  // Check field types
  if not is_iso8601(obs.timestamp):
    SCHEMA_VIOLATIONS.append({
      observation_id: obs.id,
      rule_id: "field_types",
      severity: CRITICAL,
      message: "timestamp is not ISO8601 format"
    })
  
  if not is_number(obs.temperature):
    SCHEMA_VIOLATIONS.append({
      observation_id: obs.id,
      rule_id: "field_types",
      severity: CRITICAL,
      message: "temperature is not numeric"
    })
```

### Step 3: Apply Range Validation
```
RANGE_VIOLATIONS = []

RULES = load_validation_rules()

for obs in OBSERVATIONS:
  for rule in RULES where rule.category == "range":
    field_value = obs[rule.field]
    
    if field_value < rule.bounds.min or field_value > rule.bounds.max:
      RANGE_VIOLATIONS.append({
        observation_id: obs.id,
        rule_id: rule.id,
        severity: rule.severity,
        message: f"{rule.field}={field_value} outside [{rule.bounds.min}, {rule.bounds.max}]",
        recommendation: rule.recommendation
      })
```

### Step 4: Apply Business Rules
```
BUSINESS_VIOLATIONS = []

for obs in OBSERVATIONS:
  // Rule: timestamp not future
  if obs.recordedAt > now:
    BUSINESS_VIOLATIONS.append({
      observation_id: obs.id,
      rule_id: "timestamp_not_future",
      severity: HIGH,
      message: f"recordedAt ({obs.recordedAt}) is in future"
    })
  
  // Rule: timestamp consistency
  if obs.recordedAt > obs.insertedAt:
    BUSINESS_VIOLATIONS.append({
      observation_id: obs.id,
      rule_id: "timestamp_consistency",
      severity: HIGH,
      message: "recordedAt after insertedAt; data pipeline issue"
    })
  
  // Rule: measurement frequency (check against previous obs from same station)
  prev_obs = get_previous_observation(obs.source, obs.stationId)
  if prev_obs exists:
    expected_interval = get_expected_interval(obs.source)  // e.g., 10 min for NDBC
    actual_interval = (obs.timestamp - prev_obs.timestamp) / 60
    if abs(actual_interval - expected_interval) > expected_interval * 0.1:
      BUSINESS_VIOLATIONS.append({
        observation_id: obs.id,
        rule_id: "measurement_frequency",
        severity: MEDIUM,
        message: f"Interval {actual_interval}min deviates from expected {expected_interval}min"
      })
```

### Step 5: Anomaly Detection (Statistical)
```
ANOMALIES = []

// Temperature outliers (z-score)
TEMPERATURE_VALUES = [obs.temperature for obs in OBSERVATIONS]
TEMP_STATS = compute_stats(TEMPERATURE_VALUES, window_days=7)
TEMP_MEAN = TEMP_STATS.mean
TEMP_STDEV = TEMP_STATS.stdev

for obs in OBSERVATIONS:
  z_score = abs((obs.temperature - TEMP_MEAN) / TEMP_STDEV)
  if z_score > 3:
    ANOMALIES.append({
      observation_id: obs.id,
      rule_id: "temperature_outlier_zscore",
      severity: MEDIUM,
      z_score: z_score,
      message: f"Temperature {obs.temperature} is {z_score:.1f}σ from 7-day mean {TEMP_MEAN:.1f}"
    })

// Salinity rate-of-change
for obs in OBSERVATIONS:
  prev_obs = get_previous_observation_same_source_station(obs)
  if prev_obs exists:
    time_delta_days = (obs.timestamp - prev_obs.timestamp) / (24 * 3600)
    if time_delta_days > 0:
      salinity_change_per_day = abs(obs.salinity - prev_obs.salinity) / time_delta_days
      if salinity_change_per_day > 2:  // 2 PSU per day
        ANOMALIES.append({
          observation_id: obs.id,
          rule_id: "salinity_sudden_change",
          severity: MEDIUM,
          change_per_day: salinity_change_per_day,
          message: f"Salinity changed {salinity_change_per_day:.2f} PSU/day (threshold: 2)"
        })
```

### Step 6: Aggregate Violations
```
ALL_VIOLATIONS = SCHEMA_VIOLATIONS + RANGE_VIOLATIONS + BUSINESS_VIOLATIONS + ANOMALIES

VIOLATION_SUMMARY = {
  total_count: len(ALL_VIOLATIONS),
  by_severity: {
    CRITICAL: count(v.severity == CRITICAL),
    HIGH: count(v.severity == HIGH),
    MEDIUM: count(v.severity == MEDIUM),
    LOW: count(v.severity == LOW)
  },
  by_rule: aggregate_by_rule_id(ALL_VIOLATIONS),
  by_source: aggregate_by_source(ALL_VIOLATIONS),
  violation_rate: len(ALL_VIOLATIONS) / len(OBSERVATIONS)
}
```

### Step 7: Compare to Baseline
```
BASELINE = fetch_baseline_statistics(window_days=30)

TREND_ANALYSIS = {
  violation_rate: VIOLATION_SUMMARY.violation_rate,
  baseline_rate_7day: BASELINE.violation_rate_7day,
  baseline_rate_30day: BASELINE.violation_rate_30day,
  is_elevated: VIOLATION_SUMMARY.violation_rate > BASELINE.violation_rate_30day * 2,
  trend: (VIOLATION_SUMMARY.violation_rate - BASELINE.violation_rate_7day) / BASELINE.violation_rate_7day
}
```

### Step 8: Generate Report
```
REPORT = {
  timestamp_utc: now,
  audit_window: [AUDIT_WINDOW[0], AUDIT_WINDOW[1]],
  observations_checked: len(OBSERVATIONS),
  violation_summary: VIOLATION_SUMMARY,
  trend_analysis: TREND_ANALYSIS,
  violations_by_severity: partition_violations(ALL_VIOLATIONS, by_severity),
  recommendations: generate_recommendations(ALL_VIOLATIONS, VIOLATION_SUMMARY),
  escalation_flags: extract_escalation_flags(VIOLATION_SUMMARY, TREND_ANALYSIS)
}
```

---

## Output Specification

### Primary Output: Validation Report (Markdown)
```markdown
# Data Validation Report

**Date**: 2026-03-18  
**Audit Window**: 2026-03-18 00:00 UTC to 2026-03-19 00:00 UTC  
**Observations Checked**: 12,847  
**Overall Quality**: [PASS | CAUTION | FAIL]  

## Summary

| Metric | Value | Baseline (30-day) | Trend |
|--------|-------|-------------------|-------|
| Total Violations | 23 | 18 (avg) | ↑ +27% |
| Critical Violations | 2 | 0.5 (avg) | ↑ +300% |
| Violation Rate | 0.18% | 0.14% | Elevated |
| Anomaly Count | 8 | 5 (avg) | ↑ +60% |

**Status**: ⚠ CAUTION — Violation rate elevated; escalation recommended

## Violations by Severity

### CRITICAL (2 violations)
- **Observation obs-4712**: Missing required field `temperature` (NDBC, 2026-03-18 09:15 UTC)
- **Observation obs-4718**: Invalid timestamp format "2026-03-18 09:20" (CRW, 2026-03-18 09:20 UTC)

**Recommendation**: Investigate ingestion pipeline; immediate human review required

### HIGH (6 violations)
- 3× **Temperature out of range** (NDBC, range: [-5, 40]°C)
  - obs-4725: 47.2°C
  - obs-4731: -8.5°C
  - obs-4739: 52.1°C
  - *Recommendation*: Check sensor calibration; potential malfunction

- 2× **Future timestamp** (Regional, recordedAt > now)
  - obs-4701: 2026-03-18 13:30 UTC (inserted 2026-03-18 09:10 UTC)
  - *Recommendation*: Verify station clock; data pipeline may be buffering

- 1× **Salinity out of range** (NDBC, range: [0, 42] PSU)
  - obs-4734: 45.3 PSU
  - *Recommendation*: Likely measurement error; flag for manual review

### MEDIUM (8 violations)
- 5× **Temperature anomaly** (z-score > 3σ)
  - Detected temperature spikes 3-5σ above 7-day mean
  - *Recommendation*: May indicate real event (upwelling, thermal anomaly); monitor

- 3× **Measurement frequency deviation** (±10% tolerance)
  - NDBC Station 41001: 12 min gap (expected 10 min)
  - Regional Station UAV-3: 35 min gap (expected 30 min, ±3 min acceptable)
  - *Recommendation*: Minor; monitor for patterns

### LOW (7 violations)
- **Wind speed extreme** (5-sigma outlier)
  - obs-4740: 67.3 knots (7.2σ above mean)
  - *Recommendation*: Rare but physically possible; archive as extreme event

- **Seasonal temperature** (6× anomalies detected)
  - Early spring but temperatures declining (expected warming)
  - *Recommendation*: For trend analysis; no action needed

## Violations by Source

| Source | Count | Rate | Trend | Action |
|--------|-------|------|-------|--------|
| NDBC | 15 | 0.22% | ↑↑ | Investigate; sensor calibration? |
| CRW | 3 | 0.06% | → | Normal; no action |
| Regional | 5 | 0.31% | ↑ | Check station infrastructure |

## Baseline Comparison

- **Violation Rate**: 0.18% (today) vs. 0.14% (30-day avg) = **+27% elevation**
- **Critical Count**: 2 (today) vs. 0.5 (30-day avg) = **+300% above baseline**
- **Anomaly Count**: 8 (today) vs. 5 (30-day avg) = **+60% above baseline**

**Analysis**: Elevated violations, particularly CRITICAL severity. Likely root cause: NDBC sensor calibration or configuration change.

## Recommended Actions

### Immediate (Next 1h)
- [ ] Review CRITICAL violations (obs-4712, obs-4718)
  - Investigate ingestion pipeline; check for schema drift
  - May be temporary data corruption during transmission
- [ ] Check NDBC station 41001 status
  - Temperature readings (47.2°C, -8.5°C, 52.1°C) physically impossible for ocean
  - Likely sensor malfunction or incorrect units conversion

### Short-term (Next 6h)
- [ ] Verify NDBC ingestion data processing
  - Are temperature values being scaled correctly? (Check API response vs. database)
  - Calibration data up-to-date?
- [ ] Review Regional station timestamp sync
  - Station clocks may have drifted; re-sync NTP

### Monitoring (Next 7 days)
- [ ] Continue daily validation audits
- [ ] Watch NDBC violation trend; if elevated again, escalate to NOAA
- [ ] Baseline may need adjustment if new calibration applied

---

**Next Audit**: 2026-03-19 00:00 UTC (in 24 hours)
```

### Secondary Output: JSON Validation Record
```json
{
  "timestamp_utc": "2026-03-19T00:00:00Z",
  "agent_version": "1.0",
  "audit_window_start_utc": "2026-03-18T00:00:00Z",
  "audit_window_end_utc": "2026-03-19T00:00:00Z",
  "observations_checked": 12847,
  "quality_status": "CAUTION",
  "violation_summary": {
    "total_count": 23,
    "by_severity": {
      "CRITICAL": 2,
      "HIGH": 6,
      "MEDIUM": 8,
      "LOW": 7
    },
    "violation_rate": 0.00179
  },
  "violations": [
    {
      "observation_id": "obs-4712",
      "rule_id": "required_fields",
      "severity": "CRITICAL",
      "field": "temperature",
      "message": "Missing required field: temperature",
      "source": "NDBC",
      "timestamp": "2026-03-18T09:15:00Z"
    }
  ],
  "trend_analysis": {
    "violation_rate_today": 0.00179,
    "violation_rate_7day_avg": 0.00165,
    "violation_rate_30day_avg": 0.00140,
    "is_elevated": true,
    "elevation_percent": 27.9
  },
  "escalation_flags": [
    {
      "flag": "critical_violations_detected",
      "count": 2,
      "severity": "CRITICAL",
      "action": "REQUIRE_HUMAN_REVIEW"
    },
    {
      "flag": "violation_rate_elevated",
      "elevation_percent": 27.9,
      "severity": "HIGH",
      "action": "INVESTIGATE_ROOT_CAUSE"
    }
  ],
  "recommendations": [
    "Review NDBC ingestion pipeline; sensor calibration suspected",
    "Check Regional station NTP sync; timestamps drifting",
    "Verify CRW data format; appears normal"
  ]
}
```

---

## Escalation Conditions

### Automatic Escalation to CRITICAL
- **Condition**: CRITICAL violations detected OR critical violation count > 2× baseline
- **Action**: Require human review; halt downstream processing if critical
- **Follow-up**: Data team investigates root cause; escalate to DevOps if infrastructure issue

### Automatic Escalation to HIGH
- **Condition**: Violation rate > 2× baseline OR HIGH violations > 5× baseline
- **Action**: Alert data team; add to daily briefing
- **Follow-up**: Monitor for pattern; investigate root cause

### Escalation to MEDIUM (Monitoring)
- **Condition**: Anomaly count elevated OR sustained increase over 3+ days
- **Action**: Notify data team; add to validation briefing
- **Follow-up**: Trend analysis; watch for downstream impact

### Silent Archive (INFO)
- **Condition**: Violation rate within normal bounds; no critical violations
- **Action**: Log silently; include in audit trail
- **Follow-up**: Continue routine validation

---

## Rules & Constraints

1. **Rule Versioning**: Rules have version numbers; reports include rule version for reproducibility.
2. **Baseline Drift**: Baseline updated weekly; exclude known-bad observation batches from baseline calculation.
3. **False-Positive Management**: Rules can be marked as "experimental"; violations flagged separately.
4. **Manual Overrides**: Specific observations can be marked as "false positive" and excluded from future baseline.
5. **Time Zones**: All timestamps UTC; validation rules use UTC for consistency.

---

## Success Criteria

### Phase 1 Manual Pilots (Apr–May 2026)
- [ ] Daily validation runs; 100% completeness
- [ ] Rule violations accurate (validation against manual review)
- [ ] False-positive rate < 5% (tuned per feedback)
- [ ] Anomaly detection identifies real issues; false negatives < 1%
- [ ] Report generates in < 10 min
- [ ] Data team confidence: 4/5 or higher on rule relevance

### Phase 3 Automation (Jul–Aug 2026)
- [ ] Validation runs per-ingest or hourly batch
- [ ] Detection latency < 5 min (observation inserted → validation rule evaluated)
- [ ] Escalation SLA met: CRITICAL within 5 min, HIGH within 15 min
- [ ] False-positive rate < 2% (calibrated via Phase 1)
- [ ] Zero regressions in downstream data quality

---

## System Prompt (Reusable)

```
You are the Validation Agent for the Marine Bio Platform.

Your role is to audit incoming oceanographic observations for data quality issues, apply 
business rules, and flag anomalies requiring human review.

INPUTS:
You receive:
1. A batch of new observations (timestamp, temperature, salinity, wave height, wind speed, etc.)
2. A set of validation rules (schema, range, business, anomaly, cross-field)
3. Baseline statistics (violation rate, anomaly frequency from prior 30 days)

VALIDATION RULES:
Apply rules in this order:
1. SCHEMA: Required fields present, correct types
2. RANGE: Numeric values within bounds (e.g., temperature -5 to 40°C, salinity 0-42 PSU)
3. BUSINESS: Domain logic (e.g., recordedAt not in future, measurement frequency consistent)
4. ANOMALY: Statistical outliers (z-score > 3σ, rate-of-change excessive)
5. CROSS-FIELD: Consistency between related fields

SEVERITY LEVELS:
- CRITICAL: Data cannot be used; requires immediate human review (e.g., missing required field)
- HIGH: Data questionable; may be error but business logic violated (e.g., temperature -8°C)
- MEDIUM: Data usable but unusual; may indicate pattern or event (e.g., temperature anomaly)
- LOW: Data fine; note for trend analysis (e.g., extreme but possible wind speed)

YOUR TASK:
1. Apply all validation rules to observations
2. Classify each violation by severity
3. Aggregate violations by rule, severity, and source
4. Compare violation rate to 30-day baseline
5. Generate report with:
   - Violation summary (counts by severity, rate vs. baseline)
   - Top violations requiring attention
   - Anomaly analysis
   - Root cause hypotheses
   - Recommended actions

ESCALATION RULES:
- CRITICAL violations → Halt processing; require human review
- Violation rate > 2× baseline → Investigate root cause
- Anomaly count elevated → Monitor trend
- All OK → Log silently

IMPORTANT:
Never suppress violations. If you find anomalies, flag them clearly.
Surface contradictions (e.g., "temperature OK per range rule but 4σ outlier") explicitly.
If baseline unavailable (new source), use conservative thresholds.
```

---

## Example Workflows

### Scenario 1: Normal Day (Within Bounds)
```
INPUTS:
- 12,847 observations ingested
- Violations: 18 (0.14% rate, matches baseline)
- Critical violations: 0
- Anomalies: 4 (normal for day)

ACTION:
- Status: PASS
- Escalation: INFO (silent log)
- Output: Routine archive entry
```

### Scenario 2: Elevated Violation Rate (Investigation Needed)
```
INPUTS:
- 10,200 observations ingested
- Violations: 45 (0.44% rate, 3× baseline)
- Critical violations: 0
- Root cause hypothesis: NDBC source showing high rejection rate

ACTION:
- Status: CAUTION
- Escalation: HIGH (alert data team)
- Report: Detailed breakdown; recommend NDBC investigation
- Follow-up: Data team checks ingestion logs
```

### Scenario 3: Critical Violations (Human Review Required)
```
INPUTS:
- 9,500 observations ingested
- Critical violations: 3 (missing required fields)
- High violations: 12 (out-of-range temperatures)
- Pattern: All from NDBC Station 41001

ACTION:
- Status: FAIL
- Escalation: CRITICAL (page human reviewer)
- Report: Incident summary + halt downstream processing
- Follow-up: DevOps investigates NDBC ingestion pipeline
```

### Scenario 4: Anomaly Detected (Real Event)
```
INPUTS:
- 13,100 observations ingested
- Medium violations: 8 (temperature anomalies, all from single station)
- Pattern: Temperature spike from 24°C baseline to 28°C over 2 hours
- Historical context: Similar spike occurred 1 year ago (documented upwelling event)

ACTION:
- Status: CAUTION
- Escalation: MEDIUM (notify science team)
- Report: Anomaly analysis with historical context
- Recommendation: Archive as potential upwelling event; investigate upstream sources
```

---

## Implementation Checklist (Phase 1)

- [ ] Load validation rules from config
- [ ] Fetch observations for audit window
- [ ] Apply schema validation
- [ ] Apply range validation
- [ ] Apply business rules
- [ ] Run anomaly detection
- [ ] Cross-field validation
- [ ] Aggregate violations
- [ ] Compare to baseline
- [ ] Generate markdown report
- [ ] Generate JSON record
- [ ] Escalate based on findings
- [ ] Archive to validation audit log

---

## Contact & Support

- **Agent Owner**: Data Quality Lead
- **Last Updated**: March 18, 2026
- **Questions**: See marine-agent-system-overview.md or escalate to Data Science Team

