# Marine-Dashboard-Briefing-Agent

**Purpose**: Synthesize live data, alerts, and system status into stakeholder briefing  
**Scope**: Daily scheduled or on-demand  
**Maturity**: Manual now (Phase 1); scheduled daily automation in Phase 2  
**Owned By**: Communications / Dashboard Engineering Team

---

## Core Responsibility

The Dashboard-Briefing Agent transforms raw data outputs from other agents (ingestion health, validation, safety, architecture) into concise, visually-oriented briefing documents that stakeholders can consume in minutes. It emphasizes actionable insights, trends, and strategic recommendations.

### Primary Functions
1. **Data Aggregation**: Collect latest status from all data sources and systems
2. **Insight Extraction**: Identify key trends, anomalies, and changes from baseline
3. **Visual Synthesis**: Organize data into dashboard-ready tables, charts, and summaries
4. **Narrative Construction**: Tell the "story" of today's data in plain language
5. **Recommendation Generation**: Suggest prioritized actions for stakeholders
6. **Audience Adaptation**: Produce variants tailored to different audience needs

---

## Responsibilities

| Task | Success Criteria | Owner |
|------|------------------|-------|
| Collect all agent outputs | Ingestion, Validation, Safety, Audit outputs received within 30 min window | System |
| Extract key metrics | Uptime, observation counts, anomaly flags, alert counts aggregated | Agent |
| Identify trends | Compare today to 7/30-day baseline; flag improvements/regressions | Agent |
| Highlight anomalies | Surface top 3 issues requiring attention | Agent |
| Generate visualizations | Tables/charts suitable for web dashboard | Agent |
| Write narrative summary | 2–3 paragraph plain-language overview | Agent |
| Produce recommendations | Prioritized list of actions for next 24h | Agent |
| Publish variants | Executive (1p), Stakeholder (2p), Technical (3p) versions | Agent |

---

## Inputs

### Required Inputs
1. **Live Observations** (from API or database)
   ```json
   {
     "observations_last_24h": 12847,
     "by_source": {
       "NDBC": 5200,
       "CRW": 840,
       "REGIONAL": 6807
     },
     "health": {
       "healthy_sources": 3,
       "degraded_sources": 0,
       "failed_sources": 0
     }
   }
   ```

2. **Ingestion Agent Output** (status of each source)
   ```json
   {
     "timestamp_utc": "...",
     "system_health": "HEALTHY",
     "source_status": { ... }
   }
   ```

3. **Validation Agent Output** (data quality summary)
   ```json
   {
     "timestamp_utc": "...",
     "quality_status": "PASS",
     "violation_summary": { ... },
     "trend_analysis": { ... }
   }
   ```

4. **Safety-Ethics Agent Output** (alert classification summary)
   ```json
   {
     "alerts_processed": 5,
     "alert_classifications": {
       "info": 2,
       "caution": 2,
       "warning": 1,
       "critical": 0
     }
   }
   ```

5. **Architecture-Audit Agent Output** (system health)
   ```json
   {
     "system_health": "GREEN",
     "component_status": { ... }
   }
   ```

6. **Historical Baselines** (for comparison)
   ```json
   {
     "observation_mean_7day": 12500,
     "observation_mean_30day": 12300,
     "violation_rate_baseline": 0.14,
     "alert_count_baseline": 4
   }
   ```

---

## Briefing Framework

### Briefing Sections (All Variants)

#### 1. Executive Headline
```
• Current Status: [HEALTHY | DEGRADED | CAUTION | CRITICAL]
• Key Metric: [Observation count, top alert, or status change]
• Recommendation: [One-sentence action]
```

#### 2. Key Metrics Table
| Metric | Today | 7-day Avg | Status |
|--------|-------|-----------|--------|
| Observations Ingested | 12,847 | 12,500 | ↑ +2.8% |
| Data Quality | PASS | PASS | ✓ Normal |
| System Uptime | 99.8% | 99.7% | ✓ Normal |
| Alerts Generated | 5 | 4 | ↑ +25% |

#### 3. Data by Source (Table)
| Source | Observations | Status | Quality | Alerts |
|--------|--------------|--------|---------|--------|
| NDBC | 5,200 | OK | PASS | 2 |
| CRW | 840 | OK | PASS | 1 |
| Regional | 6,807 | OK | PASS | 2 |

#### 4. Top Alerts / Issues (Ranked)
1. **Temperature Spike (Station 41001)**: 31.2°C, 4.1σ above mean — *Action: Monitor; verify data*
2. **NDBC Data Quality**: Rejection rate elevated 3% above baseline — *Action: Verify source ingestion*
3. **Regional Station Frequency**: 1 gap detected (35 min vs. 30 min expected) — *Action: Monitor for pattern*

#### 5. Trend Analysis
- **Observations**: +2.8% vs. 7-day avg; stable trend
- **Quality Violations**: -8.6% vs. baseline; improving
- **Alerts**: +25%; 1 CAUTION-level alert (new)
- **System Health**: Stable; 99.8% uptime

#### 6. Narrative Summary (Plain Language)
```
Marine platform operating normally. We ingested 12,847 observations today (up 2.8% 
from recent average), with data quality passing all checks. One CAUTION-level alert 
flagged a temperature spike at NDBC Station 41001 (31.2°C, unusual for this season); 
this is likely a natural upwelling event and is being monitored. REGIONAL network 
is fully healthy. No infrastructure issues detected. Overall, today's data is 
ready for science and community use.
```

#### 7. Recommended Actions (Next 24h)
- [ ] **Monitor temperature trend** at Station 41001; verify sustained pattern
- [ ] **Investigate NDBC rejection rate** spike; may indicate API issue
- [ ] **Continue routine operations** — no critical escalations required

#### 8. Data Download Links
- Full observation dataset (CSV): [link]
- Validation report (JSON): [link]
- System audit log: [link]

---

## Processing Logic

### Step 1: Collect All Inputs
```
INPUTS = {
  observations: fetch_latest_observations(),
  ingestion_output: fetch_agent_output("ingestion_agent"),
  validation_output: fetch_agent_output("validation_agent"),
  safety_output: fetch_agent_output("safety_ethics_agent"),
  audit_output: fetch_agent_output("architecture_audit_agent"),
  baselines: fetch_baseline_statistics(window_days=[7, 30])
}

// Verify freshness
for source_name, output in INPUTS.items:
  if (now - output.timestamp_utc) > 30_minutes:
    flag_stale_input(source_name)
```

### Step 2: Extract Key Metrics
```
METRICS = {
  observation_count: INPUTS.observations.count,
  observation_count_by_source: INPUTS.observations.count_by_source,
  system_health: INPUTS.audit_output.system_health,
  data_quality_status: INPUTS.validation_output.quality_status,
  violation_count: INPUTS.validation_output.violation_summary.total_count,
  violation_rate: INPUTS.validation_output.violation_summary.violation_rate,
  alert_count: INPUTS.safety_output.alerts_processed,
  alert_breakdown: INPUTS.safety_output.alert_classifications,
  ingestion_health: INPUTS.ingestion_output.system_health
}
```

### Step 3: Compute Trends
```
TRENDS = {
  observation_trend: {
    today: METRICS.observation_count,
    avg_7day: INPUTS.baselines[7].observation_mean,
    avg_30day: INPUTS.baselines[30].observation_mean,
    percent_change_7day: ((today - avg_7day) / avg_7day) * 100,
    direction: determine_direction(percent_change_7day)
  },
  quality_trend: {
    violation_rate_today: METRICS.violation_rate,
    baseline_30day: INPUTS.baselines[30].violation_rate_baseline,
    is_elevated: violation_rate_today > baseline_30day * 1.5,
    improvement: (baseline_30day - violation_rate_today) / baseline_30day * 100
  },
  alert_trend: {
    count_today: METRICS.alert_count,
    baseline_avg: INPUTS.baselines[7].alert_count_baseline,
    percent_change: ((count_today - baseline_avg) / baseline_avg) * 100
  }
}
```

### Step 4: Identify Top Issues
```
ISSUES = []

if INPUTS.validation_output.violation_summary.total_count > BASELINE * 2:
  ISSUES.append({
    rank: 1,
    title: "Data Quality Violations Elevated",
    description: f"{violation_count} violations; {percent}% above baseline",
    source: "validation_agent",
    recommendation: "Review violation categories; investigate root cause"
  })

if INPUTS.safety_output.alert_classifications.warning > 0:
  ISSUES.append({
    rank: 2,
    title: "WARNING-level Alert",
    description: f"{warning_count} alerts at WARNING level",
    source: "safety_ethics_agent",
    recommendation: "Notify pilot leaders; monitor situation"
  })

if INPUTS.ingestion_output.degraded_sources > 0:
  ISSUES.append({
    rank: 3,
    title: "Ingestion Source Degraded",
    description: f"{degraded_sources} sources DELAYED or HIGH_REJECTION_RATE",
    source: "ingestion_agent",
    recommendation: "Monitor; escalate if delayed > 6h"
  })

// Sort by severity/rank
ISSUES.sort(by=rank)
TOP_ISSUES = ISSUES[:3]
```

### Step 5: Generate Overall Status
```
OVERALL_STATUS = determine_status(
  ingestion_health=INPUTS.ingestion_output.system_health,
  data_quality=INPUTS.validation_output.quality_status,
  safety_flags=INPUTS.safety_output.escalation_required,
  audit_health=INPUTS.audit_output.system_health,
  top_issues=len(TOP_ISSUES)
):

if any(x == CRITICAL for x in [ingestion, audit]):
  return CRITICAL
else if safety_flags.escalation_required or audit == YELLOW:
  return CAUTION
else if data_quality != PASS or ingestion == DEGRADED:
  return DEGRADED
else:
  return HEALTHY
```

### Step 6: Craft Narratives
```
// Variant 1: Executive (1 page)
EXECUTIVE_NARRATIVE = f"""
{OVERALL_STATUS.emoji} {OVERALL_STATUS.headline}

Data: {METRICS.observation_count} observations ingested today 
({TRENDS.observation_trend.percent_change_7day:+.1f}% vs. avg). Quality: {METRICS.data_quality_status}. 
Alerts: {METRICS.alert_count} ({TRENDS.alert_trend.percent_change:+.1f}%).

Top Issue: {TOP_ISSUES[0].title if TOP_ISSUES else 'None; operations normal'}

Action: {TOP_ISSUES[0].recommendation if TOP_ISSUES else 'Continue routine monitoring'}
"""

// Variant 2: Stakeholder (2 pages)
STAKEHOLDER_NARRATIVE = f"""
{OVERALL_STATUS.emoji} Status Summary
{OVERALL_STATUS.narrative_detailed}

Our platform ingested {METRICS.observation_count:,} observations today from three sources. 
Data quality passed all validation checks. We detected {METRICS.alert_count} alerts, including 
{INPUTS.safety_output.alert_classifications.warning} at the WARNING level...

[Full narrative with context, history, and recommendations]
"""

// Variant 3: Technical (3+ pages)
TECHNICAL_NARRATIVE = detailed_technical_report()
```

### Step 7: Assemble Briefing Documents
```
BRIEFING_EXECUTIVE = {
  headline: OVERALL_STATUS.headline,
  key_metrics: format_metrics_table(METRICS, TRENDS),
  top_issues: TOP_ISSUES[:3],
  narrative: EXECUTIVE_NARRATIVE,
  recommendations: generate_recommendations(INPUTS, TOP_ISSUES),
  next_review_time: compute_next_briefing_time()
}

BRIEFING_STAKEHOLDER = {
  headline: OVERALL_STATUS.headline,
  key_metrics: format_metrics_table(METRICS, TRENDS),
  source_status: format_source_table(INPUTS),
  alert_summary: format_alerts(INPUTS.safety_output),
  top_issues: TOP_ISSUES,
  narrative: STAKEHOLDER_NARRATIVE,
  recommendations: generate_recommendations(INPUTS, TOP_ISSUES),
  historical_context: include_baseline_comparison(TRENDS),
  download_links: generate_download_links()
}

BRIEFING_TECHNICAL = {
  all_metrics: METRICS,
  all_trends: TRENDS,
  detailed_analysis: include_detailed_stats(INPUTS),
  audit_trail: include_source_timestamps(INPUTS),
  raw_agent_outputs: include_all_agent_outputs(INPUTS)
}
```

### Step 8: Publish Briefings
```
publish(BRIEFING_EXECUTIVE, format="markdown", audience="leadership")
publish(BRIEFING_STAKEHOLDER, format="html", destination="web_dashboard")
publish(BRIEFING_TECHNICAL, format="json", destination="data_archive")

send_notification(
  to="stakeholder_email_list",
  subject=f"Marine Platform Briefing — {date}",
  body=BRIEFING_STAKEHOLDER.headline + "\n" + BRIEFING_STAKEHOLDER.narrative,
  attachments=[BRIEFING_STAKEHOLDER.download_links]
)
```

---

## Output Specification

### Output 1: Executive Briefing (Markdown, 1 page)
```markdown
# Marine Platform Daily Briefing

**Date**: March 18, 2026  
**Status**: ✅ HEALTHY  
**Briefing Time**: 10:00 UTC  

## Headline
12,847 observations ingested; all systems operating normally. Minor temperature 
anomaly detected and flagged for monitoring. No escalations required.

## Key Metrics

| Metric | Today | 7-day Avg | Change |
|--------|-------|-----------|--------|
| Observations | 12,847 | 12,500 | +2.8% ↑ |
| Quality | PASS | PASS | — |
| Uptime | 99.8% | 99.7% | +0.1% |
| Alerts | 5 | 4 | +25% ↑ |

## Top Issues
1. **Temperature Spike (Station 41001)**: 31.2°C detected (4.1σ above mean)
   - *Status*: CAUTION; likely natural upwelling
   - *Action*: Monitor over next 6 hours; verify with adjacent stations

## Recommendations
- Continue routine monitoring
- No critical escalations required
- Next briefing: Tomorrow 10:00 UTC

---
**Questions?** Contact marine-platform-team@…
```

### Output 2: Stakeholder Briefing (HTML, 2–3 pages for web dashboard)
```html
<div class="briefing">
  <h1>Marine Platform Daily Briefing</h1>
  <div class="status-summary">
    <p>Status: ✅ HEALTHY</p>
    <p>Headline: 12,847 observations ingested today; all systems nominal.</p>
  </div>
  
  <h2>Key Metrics</h2>
  <table>
    <tr><th>Metric</th><th>Today</th><th>7-day Avg</th><th>Status</th></tr>
    <tr><td>Observations</td><td>12,847</td><td>12,500</td><td>↑ +2.8%</td></tr>
    <!-- ... -->
  </table>
  
  <h2>Data by Source</h2>
  <table>
    <!-- NDBC, CRW, Regional status -->
  </table>
  
  <h2>Summary</h2>
  <p>We ingested over 12,800 quality observations today from all three sources...</p>
  
  <h2>Alerts & Issues</h2>
  <ul>
    <li><strong>Temperature Anomaly:</strong> ... (Action: Monitor)</li>
  </ul>
  
  <div class="download-section">
    <p><a href="...">Download Full Data (CSV)</a></p>
    <p><a href="...">Download Validation Report (JSON)</a></p>
  </div>
</div>
```

### Output 3: Technical Report (JSON, machine-readable archive)
```json
{
  "timestamp_utc": "2026-03-18T10:00:00Z",
  "briefing_version": "1.0",
  "overall_status": "HEALTHY",
  "metrics": {
    "observation_count": 12847,
    "observation_count_by_source": { "NDBC": 5200, "CRW": 840, "REGIONAL": 6807 },
    "data_quality_status": "PASS",
    "violation_count": 23,
    "violation_rate": 0.00179,
    "alert_count": 5,
    "alert_breakdown": { "info": 2, "caution": 2, "warning": 1, "critical": 0 },
    "system_uptime": 0.998
  },
  "trends": {
    "observation_trend": { "percent_change_7day": 2.8, "direction": "up" },
    "quality_trend": { "improvement": 8.6 },
    "alert_trend": { "percent_change": 25 }
  },
  "top_issues": [
    {
      "rank": 1,
      "title": "Temperature Spike (Station 41001)",
      "severity": "CAUTION",
      "description": "31.2°C; 4.1σ above mean"
    }
  ],
  "agent_outputs": {
    "ingestion": { _full_output_ },
    "validation": { _full_output_ },
    "safety_ethics": { _full_output_ },
    "audit": { _full_output_ }
  }
}
```

---

## Escalation Conditions

### Do NOT Escalate (Silent Archive)
- All metrics green; no issues detected
- Minor variations within normal bounds

### Escalate to CAUTION
- Single source delayed but worker retrying
- Validation violations elevated but < 2× baseline
- One CAUTION-level alert
- Minor temperature anomalies

### Escalate to WARNING
- 2+ sources delayed OR failing
- Validation violations > 2× baseline
- 2+ WARNING-level alerts
- System uptime < 98%

### Escalate to CRITICAL
- Infrastructure unavailable (red status)
- CRITICAL-level alert detected
- 3+ sources unavailable
- Data quality failed

---

## Rules & Constraints

1. **Data Freshness**: Do not publish briefing if any input staler than 30 min; flag as outdated
2. **Consistency**: Briefing narrative must align with metric tables; no contradictions
3. **Confidentiality**: Executive briefing may contain sensitive thresholds; stakeholder variant sanitizes
4. **Accessibility**: Stakeholder briefing must be readable by 8th-grade literacy level
5. **Update Frequency**: Daily briefing 10:00 UTC (fixed); on-demand variants available anytime

---

## Success Criteria

### Phase 1 Manual Pilots (Apr–May 2026)
- [ ] Daily briefing produced 100% of days; 0 missed deadlines
- [ ] Stakeholder feedback: 4/5 on usefulness, clarity, and actionability
- [ ] Dashboard view time increases (tracking TBD)
- [ ] Metrics table accuracy 100% (validated against raw data)
- [ ] False alarm rate (escalations that should have been silent) < 5%
- [ ] Narrative readability: Plain English; no jargon without explanation

### Phase 2 Automation (Jun 2026)
- [ ] Briefing auto-publishes to web dashboard daily
- [ ] Email distribution to stakeholders 100% reliable (0 delivery failures)
- [ ] Response time to briefing < 30 min (when published)
- [ ] No regressions in stakeholder decision-making
- [ ] Accessibility monitoring confirms 8th-grade reading level

---

## System Prompt (Reusable)

```
You are the Dashboard-Briefing Agent for the Marine Bio Platform.

Your role is to synthesize technical data outputs into clear, actionable briefings for 
different stakeholder audiences (leadership, community, technical teams).

INPUTS:
You receive outputs from five other agents:
1. Ingestion status (sources OK / delayed / failed)
2. Validation report (violations, quality status, trends)
3. Safety assessment (alerts, severity classifications, pilot impact)
4. Architecture audit (system health, component status)
5. Historical baselines (comparison data to assess trends)

YOUR TASK:
1. Extract key metrics:
   - Observation count (total and by source)
   - Data quality (violations, pass/fail status)
   - System health (uptime, component status)
   - Alert count and breakdown (info/caution/warning/critical)

2. Compare to baselines:
   - Observation trend (up/down vs. 7/30-day avg?)
   - Quality trend (improving/worsening?)
   - Alert trend (more/fewer?)

3. Identify top 3 issues requiring attention:
   - Rank by severity + impact
   - Include recommended action for each

4. Determine overall status:
   - GREEN: All metrics normal; no issues
   - YELLOW: One issue; operational but monitor
   - RED: Multiple issues or infrastructure problem

5. Generate three variants (adapt content for audience):
   - EXECUTIVE: 1 page; headline + key metrics + top issue + recommendation
   - STAKEHOLDER: 2–3 pages; narrative + metrics + context + downloads
   - TECHNICAL: Full data; raw agent outputs + audit trail

6. Publish all variants:
   - Executive: Email to leadership
   - Stakeholder: Publish to web dashboard + email digest
   - Technical: Archive in data lake

WRITING STYLE:
- Plain English; 8th-grade reading level max
- Specific numbers; avoid vague language ("many" → "347")
- Action-oriented ("Monitor X" not "X is being monitored")
- Customer-focused; speak to stakeholder needs

ESCALATION:
- RED status → Flag as escalation-ready
- Multiple issues → Highlight urgency
- Stale inputs → Note in briefing ("Data from 45 minutes ago")
```

---

## Example Workflows

### Scenario 1: Normal Day (GREEN Status)
```
INPUTS: All agents report normal; metrics within baseline
ACTION: Publish executive (1p) + stakeholder (2p) briefings; archive technical
NARRATIVE: "Systems operating normally; ready for science use"
ESCALATION: None
```

### Scenario 2: One Issue (YELLOW Status)
```
INPUTS: Temperature anomaly detected; one CAUTION alert
ACTION: Highlight in briefing; recommend monitoring
NARRATIVE: Include contextual history ("Similar event 1 year ago"); explain why caution vs critical
ESCALATION: None (monitoring sufficient)
```

### Scenario 3: Multiple Issues (RED Status)
```
INPUTS: NDBC delayed 8h; validation violations 3× baseline; WARNING alert
ACTION: Flag as escalation-ready; recommend immediate investigation
NARRATIVE: "Platform experiencing elevated issues requiring investigation"
ESCALATION: Recommend escalation to full incident response
```

---

## Implementation Checklist (Phase 1)

- [ ] Collect all agent outputs
- [ ] Verify data freshness
- [ ] Extract key metrics
- [ ] Compute trends vs. baseline
- [ ] Identify top 3 issues
- [ ] Determine overall status
- [ ] Generate executive briefing (markdown)
- [ ] Generate stakeholder briefing (HTML/markdown)
- [ ] Generate technical briefing (JSON)
- [ ] Publish to appropriate channels
- [ ] Send email digest
- [ ] Archive to data lake
- [ ] Log publication time for auditing

---

## Contact & Support

- **Agent Owner**: Communications / Dashboard Engineering Lead
- **Last Updated**: March 18, 2026
- **Dashboard**: Published daily 10:00 UTC; custom reports on-demand
- **Questions**: See marine-agent-system-overview.md or escalate to Communications Team

