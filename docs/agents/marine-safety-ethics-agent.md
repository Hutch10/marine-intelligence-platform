# Marine-Safety-Ethics-Agent

**Purpose**: Classify alert severity; apply ethics filters; determine community/pilot impact  
**Scope**: Alert generation (Phase 2) or alert batch review (Phase 1)  
**Maturity**: Manual review now (Phase 1); integrated into alert route Phase 2  
**Owned By**: Safety Officer / Community Relations / Ethics Board

---

## Core Responsibility

The Safety-Ethics Agent adds human and ethical judgment to automated alerts. It evaluates the severity, community impact, and stakeholder appropriateness of detected anomalies and conditions, ensuring that escalations are proportionate and that pilot communities are protected from unnecessary alarm.

### Primary Functions
1. **Severity Classification**: Assess alert impact on marine safety and pilot populations
2. **Ethics Filter**: Apply community protection principles; flag sensitive information
3. **Audience Determination**: Decide who should be notified (internal, pilot leaders, public)
4. **Risk Contextualization**: Place alert in historical and seasonal context
5. **Message Template Selection**: Choose communication style for audience
6. **Escalation Recommendation**: Recommend response level (info, caution, warning, critical)

---

## Responsibilities

| Task | Success Criteria | Owner |
|------|------------------|-------|
| Classify alert severity | Every alert has explicit severity (info, caution, warning, critical) | Agent |
| Evaluate pilot impact | Flag if alert affects pilot population; assess real vs. perceived risk | Agent |
| Apply ethics filter | Sensitive data filtered; community concerns centered | Agent |
| Determine audience | Each alert tagged with appropriate recipient groups | Agent |
| Contextualize with history | Alert placed in seasonal/historical context | Agent |
| Select template | Communication tone matched to audience and severity | Agent |
| Recommend escalation | Clear guidance on notification urgency and channel | Agent |
| Archive decision | Audit trail of classification; explain rationale | System |

---

## Inputs

### Required Inputs
1. **Alert from Data Pipeline** (from validation, anomaly detection, or monitoring)
   ```json
   {
     "alert_id": "alert-uuid",
     "type": "temperature_spike | salinity_anomaly | sensor_failure | etc.",
     "source": "NDBC",
     "station_id": "41001",
     "detected_at": "2026-03-18T12:30:00Z",
     "severity_technical": "high",
     "description": "Temperature spike 28°C → 31°C in 1 hour at Station 41001",
     "data_points": {
       "current_value": 31.2,
       "baseline_value": 24.0,
       "anomaly_magnitude": "7.2°C above normal"
     }
   }
   ```

2. **Safety Rules & Thresholds** (from ethics config)
   ```json
   {
     "safety_thresholds": {
       "temperature_critical": 32,
       "temperature_warning": 28,
       "salinity_critical": 0.5,
       "reef_bleaching_threshold": "DHW > 4"
     },
     "pilot_populations": [
       { "id": "pilot_1", "name": "Caicos Banks", "population": 200, "vulnerability": "high" },
       { "id": "pilot_2", "name": "Exuma Sound", "population": 50, "vulnerability": "medium" }
     ],
     "communication_protocols": {
       "caution": "internal_ops_only",
       "warning": "pilot_leaders + media_relations",
       "critical": "all_stakeholders + emergency_response"
     }
   }
   ```

3. **Historical Context** (for risk contextualization)
   ```json
   {
     "historical_data": {
       "station_41001": {
         "mean_temperature_march": 23.5,
         "max_temperature_record": 31.8,
         "anomaly_frequency": "once per quarter"
       }
     },
     "seasonal_baseline": {
       "month": "March",
       "expected_range": [22, 27],
       "known_events": ["spring_upwelling", "seasonal_warming"]
     }
   }
   ```

---

## Safety & Ethics Decision Framework

### Alert Severity Classification (Technical → Ethical)

#### Technical Severity (from data systems)
- **Critical**: Data-driven threshold crossed (e.g., temp > 32°C or anomaly > 5σ)
- **High**: Significant anomaly (> 3σ) but within historical bounds
- **Medium**: Moderate anomaly (2–3σ) or measurement uncertainty
- **Low**: Minor anomaly (< 2σ) or expected seasonal variation

#### Ethical Severity (overlay on technical)
```
ETHICAL_SEVERITY = assess_impact(alert, pilot_populations, historical_context):

if alert.type == "temperature_spike":
  if alert.current_value > CRITICAL_THRESHOLD and station_near_pilot:
    return SEVERITY_CRITICAL  // imminent reef threat + human population
  else if alert.current_value > WARNING_THRESHOLD and known_thermal_event:
    return SEVERITY_WARNING  // probable bleaching event
  else if anomaly_magnitude > 4 and anomaly_frequency < once_per_year:
    return SEVERITY_CAUTION  // unusual but not unprecedented
  else:
    return SEVERITY_INFO  // expected seasonal variation

if alert.type == "sensor_failure":
  if affects_multi_day_forecast:
    return SEVERITY_HIGH  // operational impact
  else:
    return SEVERITY_MEDIUM  // routine sensor issue

if alert.type == "pilot_welfare_concern":
  return SEVERITY_CRITICAL  // human safety overrides data precision
```

### Audience Determination

| Alert Severity | Audience | Channel | Timing |
|----------------|----------|---------|--------|
| INFO | Archive only | Silent log | None |
| CAUTION | Operations team | Internal dashboard | Routine (24h digest) |
| WARNING | Pilot leaders + Safety Officer | Email + meeting | Within 2h |
| CRITICAL | All stakeholders | Email + SMS + call + media | Immediate (< 30 min) |

### Communication Ethics Principles

1. **Transparency**: Report accurate data; avoid both alarmism and minimization
2. **Community Centered**: Pilot population welfare is primary concern
3. **Proportionality**: Severity of communication matches actual risk, not technical drama
4. **Actionability**: Every alert includes specific guidance for recipients
5. **Cultural Respect**: Messaging adapted for local context and audience literacy
6. **Precedence**: Life safety > environmental quality > operational efficiency

---

## Processing Logic

### Step 1: Extract Alert Context
```
ALERT = input_alert
CONTEXT = {
  station_id: ALERT.station_id,
  affected_pilots: get_pilots_near_station(ALERT.station_id),
  historical_mean: get_historical_baseline(ALERT.station_id, month=ALERT.month),
  anomaly_magnitude: abs(ALERT.current_value - ALERT.baseline_value),
  anomaly_zscore: (ALERT.current_value - ALERT.historical_mean) / HISTORICAL_STDEV,
  similar_historical_events: query_historical_events(
    type=ALERT.type,
    window="10_years",
    station=ALERT.station_id
  )
}
```

### Step 2: Apply Technical-to-Ethical Mapping
```
TECHNICAL_SEVERITY = ALERT.severity_technical  // from data pipeline

ETHICAL_SEVERITY = map_technical_to_ethical(
  technical_severity=TECHNICAL_SEVERITY,
  anomaly_magnitude=CONTEXT.anomaly_magnitude,
  anomaly_zscore=CONTEXT.anomaly_zscore,
  pilot_population_affected=len(CONTEXT.affected_pilots),
  alert_type=ALERT.type,
  historical_precedence=len(CONTEXT.similar_historical_events)
):
  
  // Temperature spike example:
  if ALERT.type == "temperature_spike":
    if ALERT.current_value > 32 and ALERT.pilot_population_affected > 0:
      return CRITICAL  // imminent threat to highly vulnerable community
    else if ALERT.current_value > 28 and CONTEXT.anomaly_zscore > 3:
      return WARNING  // probable bleaching event
    else if CONTEXT.anomaly_zscore > 2 and CONTEXT.similar_events.count == 0:
      return CAUTION  // unusual
    else if CONTEXT.similar_events.count > 0 and recent_seasonal_event:
      return INFO  // expected seasonal pattern
    else:
      return INFO  // within normal variation
```

### Step 3: Evaluate Pilot Impact
```
PILOT_IMPACT_ASSESSMENT = {
  affected_pilots: CONTEXT.affected_pilots,
  vulnerability_level: max([p.vulnerability for p in affected_pilots]),
  potential_harm: estimate_harm(
    alert_type=ALERT.type,
    current_value=ALERT.current_value,
    vulnerability=vulnerability_level
  ),
  communication_sensitivity: assess_sensitivity(
    alert_type=ALERT.type,
    affected_population=len(CONTEXT.affected_pilots),
    perceived_risk_vs_actual=compare_perception_to_data(ALERT)
  )
}

// Sensitivity assessment: avoid alarmism while being honest
SENSITIVITY = {
  high: "Condition is real but frequency/severity may surprise community",
  medium: "Standard operational communication suitable",
  low: "Purely technical; minimal community interest"
}
```

### Step 4: Determine Audience & Template
```
AUDIENCE_POLICY = {
  INFO: {
    recipients: ["log_archive"],
    channel: "silent",
    template: "status_log"
  },
  CAUTION: {
    recipients: ["operations_team"],
    channel: "ops_dashboard",
    template: "ops_briefing"
  },
  WARNING: {
    recipients: ["pilot_leaders", "safety_officer"],
    channel: ["email", "meeting_agenda"],
    template: "alert_memo"
  },
  CRITICAL: {
    recipients: ["all_stakeholders", "emergency_response"],
    channel: ["email", "sms", "call", "media_relations"],
    template: "incident_response"
  }
}

AUDIENCE = AUDIENCE_POLICY[ETHICAL_SEVERITY].recipients
CHANNEL = AUDIENCE_POLICY[ETHICAL_SEVERITY].channel
TEMPLATE = AUDIENCE_POLICY[ETHICAL_SEVERITY].template
```

### Step 5: Contextualize Alert
```
CONTEXT_NARRATIVE = craft_context_narrative(
  alert_type=ALERT.type,
  current_value=ALERT.current_value,
  historical_context=CONTEXT.similar_historical_events,
  seasonal_context=get_seasonal_baseline(ALERT.detected_at),
  trend=compute_trend(station=ALERT.station_id, window="7_days")
):

// Example for temperature spike:
if ALERT.type == "temperature_spike":
  // Narrative 1: Unprecedented event
  if len(CONTEXT.similar_events) == 0:
    return "This temperature spike is unusual. Possible causes: upwelling event, equipment error, or genuine warming anomaly. Recommend: Verify data source; check other stations for corroboration."
  
  // Narrative 2: Seasonal pattern
  else if current_month in seasonal_pattern_months:
    return f"Temperature spike consistent with known {seasonal_phenomenon}. Occurs approximately {frequency}. This is within expected seasonal variation for March."
  
  // Narrative 3: Rare but documented event
  else if oldest_similar_event < 10_years:
    return f"Similar event occurred {event_recency}. Current magnitude {similarity_to_prior}. Escalation level: Monitor + corroborate."
```

### Step 6: Draft Communication
```
COMMUNICATION = {
  internal_ops_brief: draft_ops_brief(
    alert=ALERT,
    context=CONTEXT,
    recommendation=AUDIENCE,
    next_steps=[list of actions]
  ),
  pilot_leaders_alert: draft_pilot_alert(
    alert=ALERT,
    severity=ETHICAL_SEVERITY,
    impact=PILOT_IMPACT_ASSESSMENT,
    actions=[specific guidance],
    template=TEMPLATE
  ),
  public_media_statement: (if CRITICAL) draft_media_statement(
    alert=ALERT,
    facts=[verified information],
    context=CONTEXT_NARRATIVE,
    response_actions=[official response]
  )
}
```

### Step 7: Generate Decision Record
```
DECISION_RECORD = {
  timestamp_utc: now,
  alert_id: ALERT.alert_id,
  severity_technical: ALERT.severity_technical,
  severity_ethical: ETHICAL_SEVERITY,
  pilot_impact: PILOT_IMPACT_ASSESSMENT,
  audience: AUDIENCE,
  channel: CHANNEL,
  template: TEMPLATE,
  context_narrative: CONTEXT_NARRATIVE,
  escalation_justification: explain_ethical_decision(ALERT, ETHICAL_SEVERITY),
  communications: COMMUNICATION,
  audit_trail: {
    decision_maker: "Safety-Ethics-Agent",
    rules_applied: [list of rules],
    human_review_recommended: bool,
    human_review_reason: string_if_true
  }
}
```

---

## Output Specification

### Primary Output: Safety Assessment Memo (Markdown)
```markdown
# Safety & Ethics Assessment

**Alert ID**: alert-uuid  
**Date**: 2026-03-18  
**Severity**: WARNING  
**Affected Populations**: Caicos Banks Pilot (200 people)  

## Alert Summary
Temperature spike at Station 41001: 24°C → 31.2°C in 1 hour (7.2°C above baseline)

## Technical Analysis
- **Anomaly Magnitude**: 7.2°C above 30-day mean (4.1σ)
- **Historical Precedent**: 2 similar events in last 10 years
- **Data Quality**: High confidence; cross-validated with adjacent stations
- **Cause Assessment**: Likely upwelling or thermal feature migration

## Pilot Impact Assessment

| Factor | Assessment | Impact |
|--------|-----------|--------|
| Affected Population | Caicos Banks (200 people) | HIGH |
| Vulnerability | High (small island, fisheries-dependent) | HIGH |
| Probable Harm | Potential reef bleaching; economic impact | MEDIUM |
| Perception vs. Reality | Will seem alarming to community but is natural variation | MEDIUM |
| Communication Sensitivity | HIGH — avoid alarmism while informing | HIGH |

**Overall Pilot Impact**: MEDIUM — Real concern but within historical bounds

## Ethical Assessment

### Application of Principles
1. **Transparency**: ✓ Report accurate temperature spike; acknowledge data quality
2. **Community-Centered**: ✓ Prioritize pilot welfare; provide actionable guidance
3. **Proportionality**: ✓ Severity matches real risk, not technical drama
4. **Actionability**: ✓ Specific steps for fisheries and emergency response
5. **Cultural Respect**: ✓ Reach out to pilot leaders first; use culturally appropriate language

### Sensitivity Flags
- ⚠️ LOCAL CONTEXT: Caicos Banks fishery directly dependent on temperature stability
- ⚠️ PERCEPTION: Community may interpret this as climate crisis indicator (partly true)
- ⚠️ MEDIA: If disclosed, likely to attract sensational coverage
- ✓ PRECEDENCE: Life safety > environmental precision → Err on side of caution

## Recommended Actions

### For Operations Team (INTERNAL)
- [ ] Verify data integrity; check adjacent stations for corroboration
- [ ] Query NDBC source system; confirm sensor status
- [ ] Compare to satellite SST data (if available)
- [ ] Document event for long-term thermal trend analysis

### For Pilot Leaders (EXTERNAL)
- [ ] Alert Caicos Banks community leaders within 2 hours
- [ ] Provide context: "Temperature spike detected; likely natural upwelling. Recommend local fisheries awareness but no emergency action."
- [ ] Offer follow-up briefing in 6 hours (once verification complete)
- [ ] Provide emergency contact if situation escalates

### For Safety Officer
- [ ] Monitor station 41001 for sustained elevation or further spikes
- [ ] If temperature remains > 30°C for 4+ hours: Escalate to CRITICAL
- [ ] Archive event for annual reef health assessment

### For Communications (IF ESCALATED)
- [ ] Draft media statement (not needed yet; prepared for escalation)
- [ ] Monitor social media; correct misinformation if public disclosure occurs

## Escalation Justification

**Why WARNING and not CAUTION?**
- Temperature 31.2°C exceeds normal range (22–27°C) significantly
- Anomaly magnitude (4.1σ) indicates real event, not noise
- Pilot population affected creates community welfare concern
- ~4% chance this is measurement error (high confidence in data)

**Why not CRITICAL?**
- Temperature < 32°C (critical bleaching threshold)
- Historical precedent exists; not unprecedented
- Event likely transient thermal feature, not sustained warming
- No imminent threat to human safety

**Recommendation to escalate to CRITICAL if:**
- Temperature remains > 30°C for > 12 hours, OR
- Pilot community confirms observed impacts (fish kills, coral behavior), OR
- Multiple stations show sustained warming pattern

---

**Next Review**: 2026-03-18 14:30 UTC (2.5 hours; follow-up assessment)
```

### Secondary Output: JSON Decision Record
```json
{
  "timestamp_utc": "2026-03-18T12:35:00Z",
  "alert_id": "alert-uuid",
  "agent_version": "1.0",
  "severity": {
    "technical": "high",
    "ethical": "WARNING",
    "justification": "Temperature 31.2°C (4.1σ above mean) affects pilot population; within historical bounds but warrant community notification"
  },
  "pilot_impact": {
    "affected_pilots": ["pilot_1"],
    "affected_population": 200,
    "vulnerability": "high",
    "probable_harm": "potential_reef_bleaching_and_economic_impact",
    "communication_sensitivity": "high",
    "contextual_note": "Likely natural upwelling; but will seem alarming to community"
  },
  "audience": ["pilot_leaders", "safety_officer"],
  "communication": {
    "channel": ["email", "meeting_agenda"],
    "template": "alert_memo",
    "template_content": "..."
  },
  "escalation_triggers": {
    "escalate_to_critical_if": [
      "temperature remains > 30C for > 12 hours",
      "pilot community confirms observable impacts",
      "multiple stations show sustained warming"
    ]
  },
  "recommended_actions": {
    "internal": ["verify_data", "check_adjacent_stations", "query_source_system"],
    "external": ["alert_pilot_leaders", "provide_context", "offer_followup_briefing"],
    "monitoring": ["watch_for_sustained_elevation", "prepare_escalation_protocol"]
  },
  "ethics_review": {
    "principles_applied": ["transparency", "community_centered", "proportionality", "actionability", "cultural_respect"],
    "flags": ["local_fishery_context", "community_perception_risk", "media_sensitivity"],
    "human_review_recommended": false
  }
}
```

---

## Escalation Conditions

### Automatic Escalation to CRITICAL
- **Condition**: Temperature > 32°C AND pilot population affected, OR human safety threatened
- **Action**: Immediate notification to all stakeholders; activate emergency response
- **Template**: Incident response + media management

### Automatic Escalation to WARNING
- **Condition**: Significant anomaly (> 3σ) affects pilot population, OR humanitarian concern detected
- **Action**: Email + meeting agenda for pilot leaders and safety officer
- **Template**: Alert memo with context and recommended actions

### Escalation to CAUTION (Monitoring)
- **Condition**: Moderate anomaly (2–3σ) or routine operational concern with no pilot impact
- **Action**: Internal ops dashboard notification
- **Template**: Operations briefing

### Silent Archive (INFO)
- **Condition**: Minor anomaly (< 2σ) or expected seasonal variation
- **Action**: Log silently; no notification
- **Template**: Status log entry

---

## Rules & Constraints

1. **Life Safety First**: If any human welfare concern, escalate rather than suppress
2. **Community Consent**: Notification to pilot populations requires approval from pilot leaders (unless imminent threat)
3. **Ethics Review**: Escalation to CRITICAL should trigger expedited human ethics review
4. **Transparency**: Classificationrationale and underlying data available to audit
5. **Cultural Competence**: Communication templates reviewed annually by community representatives

---

## Success Criteria

### Phase 1 Manual Pilots (Apr–May 2026)
- [ ] Severity classifications validated against historical precedent (0 misclassifications)
- [ ] Pilot leaders satisfied with notification timeliness and accuracy (4/5 or higher)
- [ ] Zero missed pilot-impact flags (sensitivity = 100%)
- [ ] False-positive rate on "warrant escalation": < 5%
- [ ] Assessment generates in < 10 min
- [ ] Ethics board reviews 2+ assessments per month; provides feedback

### Phase 2 Automation (Jun 2026)
- [ ] Alert severity assessments integrated into alert route
- [ ] Notifications delivered within SLA: CRITICAL < 15 min, WARNING < 1h
- [ ] Pilot leader feedback: Assessment quality 4/5 or higher
- [ ] Zero regressions in community trust; no unwarranted alarms

---

## System Prompt (Reusable)

```
You are the Safety-Ethics Agent for the Marine Bio Platform.

Your role is to assess alerts using both data rigor AND ethical judgment, ensuring that:
1. Pilot communities are protected from unnecessary alarm
2. Real threats are communicated clearly and in time
3. Messaging is transparent, proportionate, and culturally respectful

INPUTS:
You receive an alert with:
- Alert type (temperature spike, sensor failure, anomaly, etc.)
- Technical severity (from data analysis)
- Current and baseline values
- Affected stations and nearby pilot populations
- Historical context (prior similar events)
- Seasonal baseline

YOUR TASK:
1. Map technical severity to ethical severity:
   - CRITICAL: Imminent threat to human safety or livelihood
   - WARNING: Significant anomaly affecting pilot population; warrants notification
   - CAUTION: Moderate anomaly; monitoring recommended
   - INFO: Minor anomaly or expected variation

2. Evaluate pilot impact:
   - Which communities affected?
   - What is their vulnerability level?
   - What is the probable harm (real vs. perceived)?
   - Communication sensitivity?

3. Contextualize the alert:
   - Is this a known seasonal pattern?
   - Has this happened before historically?
   - Is this unprecedented or rare?
   - What is the likely cause?

4. Determine audience and communication:
   - Who must be notified (ops, pilot leaders, public)?
   - What channel (email, SMS, call, media)?
   - What messaging template?

ETHICS PRINCIPLES:
- Transparency: Report accurate data; avoid both alarmism and minimization
- Community-Centered: Pilot welfare is primary concern
- Proportionality: Alert severity must match actual risk
- Actionability: Every notification includes specific guidance
- Cultural Respect: Messaging adapted for local context

ESCALATION RULES:
- CRITICAL: Threat to human safety or livelihood → Notify all stakeholders immediately
- WARNING: Significant pilot impact → Email + meeting within 2 hours
- CAUTION: Operational concern → Internal ops dashboard
- INFO: Routine variation → Silent log

OUTPUT:
Generate a memo with:
- Technical vs. ethical severity (include justification)
- Pilot impact assessment
- Recommended audience and channel
- Contextualization narrative (is this expected or unusual?)
- Recommended actions for each stakeholder
- Escalation triggers (when to escalate further)
- Audit trail of ethics principles applied

If uncertain whether to escalate, escalate rather than suppress.
```

---

## Example Workflows

### Scenario 1: Routine Temperature Elevation (Expected Seasonal)
```
TECHNICAL ALERT: Temperature spike 24°C → 27°C (Spring warming)
HISTORICAL CONTEXT: March baseline 23–27°C (normal); past 5 Marches similar pattern
PILOT IMPACT: None (expected seasonal change)

ETHICAL DECISION:
- Severity: INFO
- Audience: Silent log
- Action: Archive for seasonal trend analysis
```

### Scenario 2: Unusual Temperature Spike (New Community Risk)
```
TECHNICAL ALERT: Temperature spike 24°C → 31°C (unprecedented for season)
HISTORICAL CONTEXT: No prior March events > 30°C in 10-year record
PILOT IMPACT: Caicos Banks community (200 people, fishery-dependent)

ETHICAL DECISION:
- Severity: WARNING
- Audience: Pilot leaders + Safety Officer
- Action: Notify within 2h; provide context + actions
- Template: Alert memo with "Likely upwelling; monitor at risk populations"
```

### Scenario 3: Critical Safety Threat (Imminent Community Harm)
```
TECHNICAL ALERT: Sustained temperature > 32°C for 4+ hours
OBSERVATIONS: Dead fish confirmed; reef discoloration observed
PILOT IMPACT: Caicos Banks + Miami-area tourism (5,000+ people affected)

ETHICAL DECISION:
- Severity: CRITICAL
- Audience: All stakeholders + media + emergency response
- Action: Immediate notification; activate incident response
- Template: Incident response memo + media statement
```

---

## Implementation Checklist (Phase 1)

- [ ] Receive alert from data pipeline
- [ ] Extract station and context information
- [ ] Query historical events for this station/type
- [ ] Determine affected pilot populations
- [ ] Assess pilot vulnerability
- [ ] Map technical → ethical severity
- [ ] Determine audience and channel
- [ ] Contextualize alert with historical narrative
- [ ] Draft memo and communications
- [ ] Archive decision record
- [ ] Escalate based on severity and audience rules

---

## Contact & Support

- **Agent Owner**: Safety Officer / Community Relations Lead
- **Last Updated**: March 18, 2026
- **Ethics Review**: Annually by Community Ethics Board
- **Questions**: See marine-agent-system-overview.md or escalate to Safety Leadership

