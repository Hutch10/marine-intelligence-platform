# Marine-Orchestrator Agent

**Purpose**: Executive command aggregation; transforms individual agent outputs into actionable directives and escalation memos  
**Scope**: Daily or on-demand operation; critical decision authority  
**Maturity**: Manual (Phase 1), Scheduled (Phase 2+)  
**Owned By**: Operations Commander / Leadership

---

## Core Responsibility

The Orchestrator synthesizes outputs from all other agents into a unified **command decision** and **escalation memo**. It resolves contradictions, applies strategic filters, and determines whether escalation to leadership or external stakeholders is warranted.

### Primary Functions
1. **Aggregation**: Collect outputs from Ingestion, Validation, Safety, Briefing, Audit agents
2. **Conflict Resolution**: If agents flag conflicting signals, apply tiebreaker rules
3. **Strategic Filtering**: Apply leadership priorities (e.g., "pilot safety > data perfection")
4. **Escalation Classification**: Determine severity (info → caution → warning → critical) and escalation path
5. **Memo Generation**: Produce executive memo with recommended actions and context

---

## Responsibilities

| Task | Success Criteria | Owner |
|------|------------------|-------|
| Aggregate all agent outputs within 5 min | All 5 inputs received or timeout marked | System |
| Identify contradictions (e.g., Validation flags anomaly, Ingestion says data is missing) | Flag contradiction explicitly in memo | Orchestrator |
| Apply strategic decision matrix | Escalation matches matrix for given conditions | Orchestrator |
| Determine audience & communication template | Leadership, external stakeholders, silent archive | Orchestrator |
| Archive all decisions for audit trail | Complete decision log stored with timestamp | System |
| Escalate if uncertain (human judgment needed) | Escalate rather than suppress ambiguity | Orchestrator |

---

## Inputs

### Required Inputs
1. **Ingestion Agent Output** (JSON object)
   - `status: "success" | "partial" | "failed"`
   - `sources: { [source_name]: { status, count, errors_if_failed } }`
   - `timestamp_utc: ISO8601`
   - `stale_sources: string[]`

2. **Validation Agent Output** (JSON object)
   - `total_rule_violations: number`
   - `critical_violations: number` (rule severity HIGH)
   - `anomaly_flags: number`
   - `recommendations: string[]`
   - `timestamp_utc: ISO8601`

3. **Safety-Ethics Agent Output** (JSON object)
   - `alerts_processed: number`
   - `alert_classifications: { [severity]: number }` (info, caution, warning, critical)
   - `pilot_impact_flags: string[]`
   - `escalation_required: boolean`
   - `timestamp_utc: ISO8601`

4. **Dashboard-Briefing Agent Output** (JSON object)
   - `headline: string`
   - `key_metrics: { [metric_name]: value }`
   - `notable_alerts: Alert[]`
   - `timestamp_utc: ISO8601`

5. **Architecture-Audit Agent Output** (JSON object)
   - `system_health: "green" | "yellow" | "red"`
   - `component_status: { [component]: "ok" | "degraded" | "unavailable" }`
   - `timestamp_utc: ISO8601`

### Optional Inputs
- **Human Override**: Operator-provided input to force escalation level or silence specific categories
- **Historical Context**: Comparison to same day/week in prior months (for anomaly context)

---

## Processing Logic

### Step 1: Validate Inputs
```
For each required input:
  if input.timestamp_utc > now - 30 min:
    include in aggregation
  else:
    add [source_missing] flag and set default
```

### Step 2: Extract Risk Signals
```
RISK_SIGNALS = []

from Ingestion:
  if any source missing 6+ hours:
    add SIGNAL(type: data_unavailable, source: source_name, severity: HIGH)
  if failed_count > 3:
    add SIGNAL(type: ingestion_failing, severity: CRITICAL)

from Validation:
  if critical_violations > threshold(baseline_avg * 3):
    add SIGNAL(type: data_quality, severity: HIGH)
  if anomaly_flags > threshold(baseline_avg * 5):
    add SIGNAL(type: distribution_anomaly, severity: MEDIUM)

from Safety-Ethics:
  if critical_alerts > 0:
    add SIGNAL(type: safety_threshold_crossed, severity: CRITICAL)
  if pilot_impact_flags.length > 0:
    add SIGNAL(type: stakeholder_impact, severity: HIGH)

from Architecture-Audit:
  if system_health == "red":
    add SIGNAL(type: infrastructure_unavailable, severity: CRITICAL)
```

### Step 3: Apply Decision Matrix
```
ESCALATION_LEVEL = compute_escalation(RISK_SIGNALS):

  if any SIGNAL.severity == CRITICAL:
    return ESCALATION_LEVEL = "CRITICAL"
  else if count(SIGNAL.severity == HIGH) >= 2:
    return ESCALATION_LEVEL = "WARNING"
  else if count(SIGNAL.severity == HIGH) == 1:
    return ESCALATION_LEVEL = "CAUTION"
  else if count(SIGNAL.severity == MEDIUM) >= 3:
    return ESCALATION_LEVEL = "CAUTION"
  else:
    return ESCALATION_LEVEL = "INFO"
```

### Step 4: Resolve Contradictions
```
CONTRADICTIONS = []

if Ingestion.status == "success" AND Validation has HIGH severity violations:
  add CONTRADICTION(
    a: "Ingestion reported success",
    b: "Validation found data quality issues",
    resolution: "Ingestion success means pipeline ran; Validation success means data is usable. Both can be true. Escalate to INFO if issues are known/expected."
  )

if Architecture-Audit.system_health == "red" AND Briefing.timestamp < now - 5min:
  add CONTRADICTION(
    a: "Audit flagged infrastructure unavailable",
    b: "Briefing loaded successfully",
    resolution: "Briefing may have cached data. DO NOT SUPPRESS audit flag. Escalate to CRITICAL; trigger incident response."
  )

if count(CONTRADICTIONS) > 0:
  add SIGNAL(type: data_contradiction_detected, severity: HIGH)
  if no human override provided:
    escalate_to_human("Orchestrator detected contradictory signals; human review required")
```

### Step 5: Determine Communication Audience

| Escalation Level | Audience | Template | Action |
|------------------|----------|----------|--------|
| INFO | Silent Archive | Status log entry | Store in audit trail; no notification |
| CAUTION | Operations Team | Daily briefing memo | Publish to ops dashboard; email optional |
| WARNING | Leadership + Ops | Escalation memo | Email leadership; Slack alert; page on-call if OOH |
| CRITICAL | All Stakeholders | Incident summary + action items | All channels; trigger incident response |

### Step 6: Generate Command Decision

```
COMMAND_DECISION = {
  timestamp_utc: now.toISOString(),
  escalation_level: ESCALATION_LEVEL,
  status_headline: craft_headline(RISK_SIGNALS),
  key_findings: [list top 3 signals],
  recommended_actions: [list actions for each signal],
  risk_state: {
    data_freshness: status,
    data_quality: status,
    safety_compliance: status,
    infrastructure: status,
  },
  human_intervention_needed: extract_escalation_flags(RISK_SIGNALS),
  confidence: compute_confidence(input_completeness),
}
```

---

## Output Specification

### Primary Output: Command Memo (Markdown)
```markdown
# Marine Platform Command Memo

**Date**: [ISO8601 date]  
**Escalation Level**: [INFO | CAUTION | WARNING | CRITICAL]  
**Decision Authority**: Orchestrator Agent  

## Status Summary
[1-2 sentence headline]

## Key Findings
1. [Signal 1: description + impact]
2. [Signal 2: description + impact]
3. [Signal 3: description + impact]

## Risk State

| Risk Factor | Status | Trend |
|-------------|--------|-------|
| Data Freshness | [OK | DEGRADED | CRITICAL] | [↑ improving | → stable | ↓ declining] |
| Data Quality | [OK | DEGRADED | CRITICAL] | [↑ | → | ↓] |
| Safety Compliance | [OK | DEGRADED | CRITICAL] | [↑ | → | ↓] |
| Infrastructure | [OK | DEGRADED | CRITICAL] | [↑ | → | ↓] |

## Recommended Actions

### Immediate (Next 1h)
- [Action 1 for team]
- [Action 2 for team]

### Short-Term (Next 24h)
- [Action 3]
- [Action 4]

### Monitoring
- [What to watch over next 7 days]

## Escalation Trigger(s)
[List which agents triggered escalation; why]

## Confidence & Limitations
- Input completeness: X%
- Data staleness: ≤Ym
- Known limitations: [list]

---

**Next Review**: [Timestamp when next memo should be generated]
```

### Secondary Output: JSON Decision Record
```json
{
  "timestamp_utc": "2026-03-18T10:00:00Z",
  "orchestrator_version": "1.0",
  "escalation_level": "INFO" | "CAUTION" | "WARNING" | "CRITICAL",
  "input_sources": {
    "ingestion": { "received": true, "staleness_seconds": 120 },
    "validation": { "received": true, "staleness_seconds": 90 },
    "safety_ethics": { "received": true, "staleness_seconds": 60 },
    "dashboard_briefing": { "received": true, "staleness_seconds": 45 },
    "architecture_audit": { "received": true, "staleness_seconds": 30 }
  },
  "risk_signals": [
    { "type": "data_quality", "severity": "HIGH", "agent": "validation", "detail": "..." }
  ],
  "contradictions_detected": [],
  "command_decision": {
    "status_headline": "Systems operating normally; minor data quality flags detected.",
    "recommended_actions": ["Monitor validation results", "Review anomaly patterns"],
    "audience": "operations_team",
    "human_intervention_needed": false
  },
  "audit_trail": {
    "inputs_hash": "sha256:...",
    "decision_hash": "sha256:..."
  }
}
```

---

## Escalation Conditions

### Automatic Escalation to CRITICAL
- **Condition**: Any agent signals CRITICAL severity OR infrastructure unavailable
- **Action**: Page on-call immediately; trigger incident response protocol
- **Template**: Incident summary + action items; all stakeholder notification

### Automatic Escalation to WARNING
- **Condition**: 2+ HIGH severity signals OR contradiction detected
- **Action**: Email leadership; Slack alert to ops channel
- **Template**: Escalation memo with context and recommended actions

### Escalation to Human Review (Override)
- **Condition**: Contradictory signals; input completeness < 80%; agent disagreement
- **Action**: Halt auto-decision; require human approval before escalating further
- **Template**: Flag anomaly + request human judgment

### Silent Archive (INFO)
- **Condition**: All signals GREEN; no contradictions; normal operations
- **Action**: Store in audit log; no notification required
- **Template**: Status log entry only

---

## Rules & Constraints

1. **Contradiction Priority**: If signals contradict, DON'T SUPPRESS. Escalate contradiction as a signal.
2. **Stale Data Handling**: If any input is >30 min stale, mark in memo and reduce confidence %-age.
3. **No Overrides of Safety**: If Safety-Ethics agent flags pilot impact, NEVER suppress; always escalate to at least CAUTION.
4. **Audit Trail**: Every decision must be logged with inputs, logic, and output for post-incident review.
5. **Freshness Window**: Cannot make decisions on data older than 1 hour without explicit human override.

---

## Success Criteria

### Phase 1 Manual Pilots (Apr–May 2026)
- [ ] Orchestrator runs daily; memo completeness 100%
- [ ] All escalations accurate; zero false negatives (missed critical alerts)
- [ ] Memo generates in < 2 min (acceptable for manual workflow)
- [ ] Leadership feedback: actionable, clear escalation reasoning
- [ ] Contradiction detection tested; false-positive rate < 5%

### Phase 2 Automation (Jun+ 2026)
- [ ] Orchestrator runs on schedule; outputs published to dashboard
- [ ] Escalation response SLA met: CRITICAL within 5 min, WARNING within 15 min
- [ ] Zero regressions in stakeholder decision-making
- [ ] Audit trail completeness: 100% of decisions logged with full context

---

## System Prompt (Reusable)

```
You are the Orchestrator Agent for the Marine Bio Platform.

Your role is to synthesize outputs from five specialized agents (Ingestion, Validation, 
Safety-Ethics, Dashboard-Briefing, Architecture-Audit) into a unified executive command decision.

INPUTS:
You will receive five JSON objects from agent systems:
1. ingestion_status: Pipeline health, source availability, error counts
2. validation_report: Data quality findings, anomaly flags, rule violations
3. safety_assessment: Alert classifications, pilot impact flags, escalation flags
4. dashboard_briefing: Key metrics, notable alerts, stakeholder headline
5. architecture_audit: System health (green/yellow/red), component status

YOUR TASK:
1. Validate all inputs are received and recent (< 30 min old)
2. Extract risk signals from each agent output
3. Identify contradictions between agents (e.g., Ingestion OK but Validation flags bad data)
4. Apply decision matrix:
   - Any CRITICAL signal → CRITICAL escalation
   - 2+ HIGH signals OR contradiction → WARNING
   - 1 HIGH signal OR 3+ MEDIUM → CAUTION
   - Otherwise → INFO
5. Determine audience (silent archive, ops team, leadership, all stakeholders)
6. Generate command memo with recommended actions

ESCALATION RULES:
- NEVER suppress contradictions; escalate them as signals
- NEVER suppress Safety-Ethics flags for pilot impact
- If data is stale (>30 min), mark it in memo and reduce confidence
- If input completeness < 80%, require human review before escalating

CONTRADICTION RESOLUTION:
If you detect contradictory signals:
- Example: Ingestion says "success", Validation says "data_quality critical"
- Resolution: Both can be true. Ingestion success means pipeline ran; Validation 
  critical means data has issues. Flag the contradiction explicitly and ask: 
  "Which takes priority for this decision?"

OUTPUT:
Generate a markdown memo with:
- Escalation level clearly stated
- 2-3 key findings (what changed from baseline?)
- Risk state matrix (4 risk factors: freshness, quality, safety, infrastructure)
- Recommended actions (immediate, short-term, monitoring)
- Explanation of escalation logic
- Timestamp and confidence percentage

Also generate a JSON decision record for audit trail.

If human intervention is needed, escalate with explicit request for judgment.
```

---

## Example Workflows

### Scenario 1: Normal Day (All GREEN)
```
INPUT:
- Ingestion: All sources on schedule, no errors
- Validation: 2 rule violations (within baseline)
- Safety: No alerts ≥ CAUTION level
- Briefing: Headline "Systems nominal"
- Audit: All components OK

DECISION:
- Escalation: INFO
- Action: Archive status log; no notification
- Memo: One-liner summary to audit trail
```

### Scenario 2: Data Quality Concern (Medium Signal)
```
INPUT:
- Ingestion: All sources OK
- Validation: 12 rule violations (baseline avg 4); 3 anomaly flags
- Safety: Zero alerts
- Briefing: Key metric shows spike
- Audit: Components OK

DECISION:
- Escalation: CAUTION
- Action: Notify operations team; publish to dashboard
- Memo: Detailed findings; recommend review of validation rules
- Next Step: Data team investigates anomaly patterns
```

### Scenario 3: Infrastructure Incident (CRITICAL Signal)
```
INPUT:
- Ingestion: NDBC source missing 8 hours
- Validation: Cannot run; no ingestion data
- Safety: Cannot assess (no data)
- Briefing: Stale (2+ hours old)
- Audit: Database connection failed

DECISION:
- Escalation: CRITICAL
- Action: Page on-call immediately
- Memo: Incident summary + action items
- Next Step: Trigger incident response; identify root cause
```

### Scenario 4: Contradiction Detected (Uncertain)
```
INPUT:
- Ingestion: Says "success", but anomalously low data volume
- Validation: Flags distribution anomaly; cannot determine if data or rule issue
- Safety: Few alerts, but depends on Validation accuracy
- Briefing: Cannot synthesize safely
- Audit: Components OK

DECISION:
- Escalation: HUMAN REVIEW REQUIRED
- Action: Escalate to human operator; suspend auto-decisions
- Memo: Contradiction detected; request manual judgment
- Next Step: Operator reviews raw data + rules; makes override decision
```

---

## Implementation Checklist (Phase 1)

- [ ] Receive agent outputs (can be JSON files, API calls, or manual input)
- [ ] Parse and validate each input
- [ ] Apply decision matrix logic
- [ ] Detect contradictions
- [ ] Generate memo markdown
- [ ] Generate JSON decision record
- [ ] Archive decision to audit log
- [ ] Notify audience (based on escalation level)
- [ ] Log any manual overrides

---

## Contact & Support

- **Agent Owner**: Operations Commander
- **Last Updated**: March 18, 2026
- **Questions**: See marine-agent-system-overview.md or escalate to Platform Architecture Team

