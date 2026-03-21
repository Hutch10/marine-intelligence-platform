# Marine Agent System Overview

**Version:** 1.0  
**Date:** March 18, 2026  
**Status:** Documentation & Design Phase  

---

## Executive Summary

The Marine Bio Platform is introducing a structured agent system to operationalize decision-making, data quality assurance, and stakeholder communication across real-time oceanographic monitoring. This agent system formalizes workflows that have emerged from three years of ingestion architecture, validation patterns, and stakeholder engagement experience.

---

## Why Agents Now?

### Current Challenge
The Marine Bio Platform now ingests and processes data from multiple sources (NDBC buoys, Coral Reef Watch, regional stations) at scale. Decision-making has become distributed:
- **Data teams** validate ingestion quality and detect anomalies
- **Safety coordinators** assess ecosystem threat levels
- **Dashboard stakeholders** need real-time summaries without manual refresh
- **Architecture maintainers** monitor system health and integration points
- **Pilot programs** require coordinated communication and packaging

### Why This Works Now
1. **Ingestion is mature**: NDBC and Coral Reef Watch pipelines are stable; schema is locked.
2. **Validation rules are proven**: 18+ months of operational data informs detection patterns.
3. **Stakeholder workflows exist**: Each team has repeatable manual processes ready to formalize.
4. **Escalation patterns are clear**: We know when humans must intervene and why.
5. **Risk surfaces are understood**: Safety, ethics, and compliance concerns have documented thresholds.

### Non-Goals (Not Yet)
- **Full automation**: Agents augment human judgment; critical decisions remain human-owned.
- **Runtime framework**: Agents start as documented workflows, then integrate into asynchronous jobs/crons.
- **Real-time reactive agents**: Signal detection remains scheduled batch for now; outreach stays manual.
- **Complex orchestration**: Multi-agent negotiations are deferred until single-agent patterns are proven.

---

## Project Phase: Validation & Decision Infrastructure

### Current Phase (Q1 2026)
**Goal**: Document and prove agent workflows before runtime integration  
**Approach**: Structured templates, reusable prompts, manual team pilots  
**Outcome**: Ready-to-automate agent configs + team feedback on escalation/thresholds

### Implementation Timeline
1. **Phase 1 (Apr–May 2026)**: Active agent pilots (manual execution by teams)
2. **Phase 2 (Jun 2026)**: Dashboard-Briefing agent goes automated (scheduled daily)
3. **Phase 3 (Jul–Aug 2026)**: Validation agent automation (per-ingest or hourly)
4. **Phase 4 (Sep+ 2026)**: Signal Detection + Outreach gradual integration

---

## What Has Been Implemented

### Data Ingestion & Persistence
- **NDBC buoy ingestion**: 5K+ observations/day from NOAA buoys; 4-hour cache refresh
- **Coral Reef Watch ingestion**: Weekly thermal stress indices; 3-month lookback
- **Regional station ingestion**: Custom network plugin for pilot station data
- **Live Ingestion Reports**: Persisted database schema tracking ingestion runs, worker status, error counts
- **Ingestion Worker**: Async task processor with exponential backoff and failure classification

### API Surface (Data Access Layer)
- **Live Conditions Route** (`GET /live`): Real-time observation snapshots per source
- **Reef Alerts Route** (`GET /reef-alerts`): Anomaly + thermal stress alerts with risk scores
- **Feed Health Route** (`GET /feed-health`): Ingestion status, stale-source detection, health summary
- **Validation Routes** (TBD): Per-source validation rule results + recommendations

### Data Quality & Validation Framework
- **Schema-level validation**: Type constraints, nullability rules
- **Business rules engine ready**: Thresholds defined, rule evaluators stubbed
- **Anomaly detection patterns**: Temperature spikes, missing data sequences identified in analysis

### Knowledge Artifacts
- **MFA Architecture docs** (security layer)
- **Station Admin Lifecycle docs** (onboarding/offboarding patterns)
- **Ingestion telemetry model** (worker runs, completion status, error types)

---

## Recommended Active Agents (Now)

These six agents have proven manual workflows, clear responsibility boundaries, and can pilot with existing tooling:

### 1. Marine-Orchestrator
**Role**: Command decision; aggregates signal from all other agents  
**Trigger**: Manual (operator) or scheduled daily  
**Maturity**: Manual now; async job in Phase 2  
**Outcome**: Daily briefing summarizing ingestion health, alerts, recommendations

### 2. Marine-Data-Ingestion-Agent
**Role**: Validates ingestion runs; surfaces stuck pipelines  
**Trigger**: Per-ingest completion (manual check) or hourly audit  
**Maturity**: Manual audit now; per-event automation in Phase 3  
**Outcome**: Pass/fail per source; escalation if failure counts exceed threshold

### 3. Marine-Validation-Agent
**Role**: Audits data quality; flags anomalies needing human review  
**Trigger**: Batch (daily) or per-ingest (manual)  
**Maturity**: Manual now; scheduled batch in Phase 1  
**Outcome**: Rule violation report + severity classification; recommendations

### 4. Marine-Safety-Ethics-Agent
**Role**: Classifies alerts for pilot/community impact; applies ethics filters  
**Trigger**: Alert generation or manual override  
**Maturity**: Manual now; integrated into alert route in Phase 2  
**Outcome**: Severity label (info/caution/warning), audience scope, communication template

### 5. Marine-Dashboard-Briefing-Agent
**Role**: Synthesizes live data + alerts into stakeholder dashboard summary  
**Trigger**: Scheduled daily or on-demand  
**Maturity**: Manual now; scheduled daily job in Phase 2  
**Outcome**: Briefing document with key metrics, notable alerts, recommended actions

### 6. Marine-Architecture-Audit-Agent
**Role**: Monitors system health, config drift, integration health  
**Trigger**: Scheduled (daily or per-deploy)  
**Maturity**: Manual now; autonomous audit job in Phase 3  
**Outcome**: Health scorecard; alert if critical systems are unavailable

---

## Deferred Agents (Phase 2+)

### Signal-Detection-Agent
**Why Deferred**: 
- Signal detection currently handled by batch anomaly analysis (working well)
- Requires integrated ML/statistical model (not yet mature)
- Benefit accrues only with many sources; currently 3 sources viable

**When Ready**: Q3 2026, after 2+ more data sources integrated  
**Future Role**: Pattern detection across multi-source time-series; anomaly thresholding  
**Manual Pathway**: Data team runs weekly anomaly reports; feeds to Validation agent

---

### Pilot-Outreach-Agent
**Why Deferred**: 
- Outreach messaging is high-touch and reputation-critical
- Pilot program structure still evolving; packaging immature
- Requires human review of all outreach before dispatch

**When Ready**: Q4 2026, after pilot packaging finalized and first outreach campaigns complete  
**Future Role**: Draft outreach messages from alerts + context; coordinate multi-channel delivery  
**Manual Pathway**: Communications team crafts messages per pilot; logs in outreach ledger

---

## Default Orchestration Order

When agents run (manually or automated), follow this order to respect data dependencies:

1. **Marine-Data-Ingestion-Agent** (Runs first)
   - Prerequisite: New data ingested or audit window starts
   - Output: Ingestion status (success/fail per source)

2. **Marine-Validation-Agent** (Depends on Ingestion)
   - Input: Ingestion status + new observations
   - Output: Quality issues + anomaly flags

3. **Marine-Safety-Ethics-Agent** (Depends on Validation)
   - Input: Alerts from validation + domain rules
   - Output: Severity labels + audience scope

4. **Marine-Dashboard-Briefing-Agent** (Depends on all above)
   - Input: Ingestion health + validation summary + safety classifications
   - Output: Stakeholder briefing

5. **Marine-Architecture-Audit-Agent** (Independent)
   - Runs in parallel with others
   - Output: System health scorecard

6. **Marine-Orchestrator** (Aggregates all)
   - Runs last
   - Input: All agent outputs
   - Output: Command decision + escalation memo

---

## How to Use Agents Manually (Before Runtime Automation)

### Daily Manual Workflow

#### Step 1: Operator Runs Ingestion Audit (8 AM)
```
$ marine-data-ingestion-agent --audit-window "last-24h"
```
- Agent reviews live_ingestion_reports table
- Outputs: "NDBC: OK | CRW: OK | Regional: DELAYED (last report 8h ago)"
- Operator notes any delays (if expected, archive; if not, escalate)

#### Step 2: Data Team Runs Validation (8:15 AM)
```
$ marine-validation-agent --source ndbc --mode batch
```
- Agent applies 12+ validation rules to observations from last 24h
- Outputs: Rule violations, anomaly flags, suggested filters
- Data team reviews, marks false-positives, confirms real anomalies

#### Step 3: Safety Coordinator Reviews Alerts (8:30 AM)
```
$ marine-safety-ethics-agent --alert-batch "latest"
```
- Agent ingests alert stream + safety rules
- Outputs: Severity labels, audience scope, communication template
- Coordinator decides: "This is CAUTION-level, needs community alert"

#### Step 4: Dashboard Generator Runs (9 AM)
```
$ marine-dashboard-briefing-agent --window "today" --audience stakeholders
```
- Agent synthesizes: Ingestion health + validation summary + safety classifications + live metrics
- Outputs: Briefing document in markdown + JSON
- Communications team publishes to web dashboard

#### Step 5: Architecture Audit Runs (9:30 AM)
```
$ marine-architecture-audit-agent --scope full
```
- Agent checks: API uptime, database health, external dependencies, schema drift
- Outputs: Health scorecard + alert if any RED status
- DevOps team reviews; escalates if critical

#### Step 6: Orchestrator Summarizes (10 AM)
```
$ marine-orchestrator --window "today" --role command
```
- Agent synthesizes all outputs into executive memo
- Outputs: "Today's status: Systems healthy. Validation flagged 3 anomalies (no escalation). NDBC slightly delayed (expected). Recommendation: Monitor outage recovery."

### Escalation Triggers (When to Interrupt This Flow)

| Condition | Agent | Action |
|-----------|-------|--------|
| Ingestion gap > 6h | Ingestion | Page on-call immediately |
| Validation anomaly count > 5x baseline | Validation | Notify data lead; request 2-person review |
| Safety threshold crossed | Safety-Ethics | Engage communications + ops |
| Architecture component unavailable | Architecture-Audit | Page DevOps; trigger incident response |
| Orchestrator detects contradiction | Orchestrator | Halt downstream; require human resolution |

---

## Success Criteria for Agent System

### Phase 1 (Apr–May 2026): Documentation & Manual Pilots
- [ ] Each agent documented fully; reusable prompts created
- [ ] Each team runs agent manually 2+ times; provides feedback
- [ ] Escalation thresholds validated against operationaldata
- [ ] Zero missed escalations during manual pilot
- [ ] Prompt latency acceptable (<5 min per agent for manual run)

### Phase 2 (Jun 2026): Dashboard-Briefing Automation
- [ ] Briefing agent scheduled daily; outputs to web dashboard
- [ ] Stakeholder satisfaction survey: 4/5 or higher on usefulness
- [ ] Zero regressions in manual workflows that depend on briefing
- [ ] Dashboard view count / time-on-page increases 30%+

### Phase 3 (Jul–Aug 2026): Validation Automation
- [ ] Validation agent runs on ingestion completion (async job)
- [ ] False-positive rate < 2% (calibrated against manual reviews)
- [ ] Detection latency < 5 min (rule evaluation + report generation)
- [ ] Data team saves 2+ hours/week vs. manual audit

### Phase 4 (Sep+ 2026): Signal & Outreach Integration
- [ ] Signal Detection agent detects 3+ novel patterns per month
- [ ] Outreach agent drafts messages; 90%+ pass safety review without edits
- [ ] Multi-source correlation experiments show measurable value
- [ ] Autonomous runtime begins (operator-supervised)

---

## Agent System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     MARINE AGENT SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  DATA SOURCES                                                   │
│  ├─ NDBC Buoys                                                  │
│  ├─ Coral Reef Watch                                            │
│  └─ Regional Stations                                           │
│         │                                                        │
│         ▼                                                        │
│  ┌──────────────────┐                                           │
│  │ Ingestion Worker │◄─┐                                        │
│  └──────────────────┘  │                                        │
│         │              │                                        │
│         ▼              │                                        │
│  LIVE_INGESTION_REPORTS (Persisted)                            │
│         │              │                                        │
│    ┌────┴────────┬────┴─────────┬─────────────────┐            │
│    │             │              │                 │            │
│    ▼             ▼              ▼                 ▼            │
│  INGESTION   VALIDATION  SAFETY-ETHICS     ARCHITECTURE       │
│   AGENT        AGENT        AGENT             AUDIT AGENT     │
│    (1)         (2)          (3)                  (5)          │
│    │           │            │                    │            │
│    └────┬───────┴────────────┴────────────────────┘            │
│         │                                                      │
│         ▼                                                      │
│    DASHBOARD-BRIEFING AGENT (4)                               │
│    (synthesizes all inputs)                                   │
│         │                                                      │
│         ▼                                                      │
│    ORCHESTRATOR AGENT (6)                                     │
│    (final command decision)                                   │
│         │                                                      │
│    ┌────┴────────┬──────────┬──────────────┐                  │
│    ▼             ▼          ▼              ▼                  │
│  BRIEF-   ESCALATION   ARCHIVE      STAKEHOLDER                │
│  ING      MEMO         FOR AUDIT    NOTIFICATION               │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Files in This Agent System

| File | Purpose | Audience |
|------|---------|----------|
| `marine-agent-system-overview.md` | This file; system rationale and architecture | Leadership, DevOps, Planning |
| `marine-orchestrator.md` | Command aggregation; escalation logic | Leadership, Operators |
| `marine-data-ingestion-agent.md` | Ingestion audit; pipeline health | Data Ops, DevOps |
| `marine-validation-agent.md` | Data quality; anomaly flagging | Data Scientists, QA Team |
| `marine-safety-ethics-agent.md` | Alert severity; community impact | Safety Officers, Communications |
| `marine-dashboard-briefing-agent.md` | Stakeholder summary synthesis | Communications, Stakeholders |
| `marine-architecture-audit-agent.md` | System health monitoring | DevOps, Architecture Team |
| `marine-signal-detection-agent.md` | Advanced pattern detection (deferred) | Data Scientists (future) |
| `marine-pilot-outreach-agent.md` | Outreach message drafting (deferred) | Communications (future) |

---

## Next Steps After This Documentation

1. **Form agent working groups** (1 week)
   - Assign each active agent to a team owner
   - Review agent specs; validate escalation thresholds against historical data
   - Prepare pilot execution schedule

2. **Manual agent pilots** (2–3 weeks)
   - Each team runs assigned agent manually following documented workflow
   - Collect feedback: prompt quality, output usefulness, time investment
   - Iterate prompts based on real usage

3. **Escalation threshold validation** (1 week)
   - Backtest escalation rules against 6+ months of historical data
   - Adjust thresholds if false-positive or false-negative rates high
   - Document final thresholds in each agent spec

4. **Define runtime integration points** (1 week)
   - Identify which agents should become scheduled jobs (cron) vs. event-triggered
   - Define monitoring/alerting for agent failures
   - Design agent output schema for auditing and handoff

5. **Begin Phase 1 pilots** (Apr 2026)
   - Activate Dashboard-Briefing agent on daily schedule (tentative)
   - Log all outputs + escalations for calibration

---

## Contact & Maintenance

- **System Owner**: Platform Architecture Team
- **Last Updated**: March 18, 2026
- **Next Review**: April 15, 2026 (post-pilot feedback)
- **Questions**: Refer to individual agent specs or escalate to architecture team

