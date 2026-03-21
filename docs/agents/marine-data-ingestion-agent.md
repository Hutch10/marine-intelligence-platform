# Marine-Data-Ingestion-Agent

**Purpose**: Audit data pipeline health; detect stuck/delayed sources; validate ingestion worker status  
**Scope**: Per-ingest validation (Phase 3) or hourly batch audit (Phase 1)  
**Maturity**: Manual audit now (Phase 1); per-event async in Phase 3  
**Owned By**: Data Operations / DevOps

---

## Core Responsibility

The Data Ingestion Agent monitors data source availability and pipeline health. It queries the `live_ingestion_reports` database table to determine:
- Which sources have ingested data recently (within threshold)
- Which sources are stale or failing
- Whether ingestion worker is healthy and retrying failed sources
- Whether error counts exceed baseline expectations

### Primary Functions
1. **Status Audit**: Query latest ingestion run per source; classify as OK/DELAYED/FAILED
2. **Staleness Detection**: Compare `completedAt` timestamp to now; flag if stale
3. **Error Classification**: Examine worker status and error types (transient vs. permanent)
4. **Baseline Comparison**: Compare error counts to 7-day / 30-day averages
5. **Escalation Recommendation**: Determine if human intervention needed

---

## Responsibilities

| Task | Success Criteria | Owner |
|------|------------------|-------|
| Query live_ingestion_reports table | Latest run fetched for each source within 10s | System |
| Classify each source status | Every source has explicit status (OK, DELAYED, FAILED) | Agent |
| Detect stale sources | Staleness flagged if completedAt > threshold | Agent |
| Compare error counts to baseline | Alert if errors > 2σ above 30-day mean | Agent |
| Classify error type (transient vs permanent) | Worker status examined; retry behavior noted | Agent |
| Generate audit report | Pass/fail per source + escalation flags | Agent |
| Archive audit | Result stored with timestamp for trend analysis | System |

---

## Inputs

### Required Inputs
1. **Database Query Results** (from `live_ingestion_reports` table)
   ```json
   {
     "source": "NDBC",
     "latestRun": {
       "id": "run-uuid",
       "completedAt": "2026-03-18T09:45:00Z",
       "status": "success" | "failed" | "partial",
       "workerStatus": "healthy" | "retrying" | "backoff" | "failed",
       "insertedCount": 1247,
       "rejectedCount": 3,
       "errorMessage": "null" | "details if failed"
     },
     "sevenDayStats": {
       "avgInserted": 1200,
       "avgRejected": 2,
       "failureRate": 0.05
     },
     "thirtyDayStats": {
       "avgInserted": 1180,
       "avgRejected": 2.5,
       "failureRate": 0.08
     }
   }
   ```

2. **Configuration Thresholds** (hardcoded or read from config)
   ```json
   {
     "maxStalenessMinutes": 360,
     "criticalStalenessMinutes": 720,
     "errorCountAlertThreshold_sigma": 2,
     "minSourcesHealthy": 2,
     "criticalVolumeDropPercent": 0.5
   }
   ```

### Optional Inputs
- **Historical Comparison Window**: Last 7 / 30 days for trending
- **Manual Override**: Operator can suppress alert for known maintenance window
- **Recent Deployment Info**: If new code deployed, adjust baseline expectations

---

## Processing Logic

### Step 1: Fetch Latest Ingestion Status Per Source
```
SOURCES = [NDBC, CORAL_REEF_WATCH, REGIONAL_STATION]
RESULTS = []

for source in SOURCES:
  latestRun = query("SELECT * FROM live_ingestion_reports 
                     WHERE source = source 
                     ORDER BY completedAt DESC LIMIT 1")
  if latestRun exists:
    RESULTS.append({
      source: source,
      latestRun: latestRun,
      stats: compute_baseline_stats(source, last_7_days),
      stats_30day: compute_baseline_stats(source, last_30_days)
    })
  else:
    RESULTS.append({
      source: source,
      status: "NEVER_RUN",
      latestRun: null
    })
```

### Step 2: Classify Source Status
```
STATUS_CLASSIFICATION = {}

for result in RESULTS:
  if result.latestRun == null:
    STATUS_CLASSIFICATION[source] = {
      status: "NEVER_RUN",
      severity: CRITICAL,
      message: "Source has never been ingested"
    }
  
  else:
    staleness_minutes = (now - result.latestRun.completedAt) / 60
    
    if result.latestRun.status == "failed":
      STATUS_CLASSIFICATION[source] = {
        status: "FAILED",
        severity: HIGH,
        message: f"Last run failed at {result.latestRun.completedAt}",
        workerStatus: result.latestRun.workerStatus,
        error: result.latestRun.errorMessage
      }
    
    else if staleness_minutes > CRITICAL_STALENESS_MINUTES:
      STATUS_CLASSIFICATION[source] = {
        status: "CRITICAL_STALE",
        severity: CRITICAL,
        message: f"No data for {staleness_minutes} minutes (critical threshold: {CRITICAL_STALENESS_MINUTES})",
        lastRunAt: result.latestRun.completedAt
      }
    
    else if staleness_minutes > MAX_STALENESS_MINUTES:
      STATUS_CLASSIFICATION[source] = {
        status: "DELAYED",
        severity: HIGH,
        message: f"No data for {staleness_minutes} minutes (threshold: {MAX_STALENESS_MINUTES})",
        lastRunAt: result.latestRun.completedAt
      }
    
    else if result.latestRun.rejectedCount > baseline_sigma_threshold(2):
      STATUS_CLASSIFICATION[source] = {
        status: "HIGH_REJECTION_RATE",
        severity: MEDIUM,
        message: f"Rejected {result.latestRun.rejectedCount} records (baseline: {result.stats.avgRejected})",
        rejectionRate: result.latestRun.rejectedCount / result.latestRun.insertedCount
      }
    
    else if result.latestRun.insertedCount < result.stats.avgInserted * (1 - CRITICAL_VOLUME_DROP):
      STATUS_CLASSIFICATION[source] = {
        status: "VOLUME_DROP",
        severity: MEDIUM,
        message: f"Volume down {((1 - result.latestRun.insertedCount / result.stats.avgInserted) * 100):.1f}%",
        currentVolume: result.latestRun.insertedCount,
        avgVolume: result.stats.avgInserted
      }
    
    else:
      STATUS_CLASSIFICATION[source] = {
        status: "OK",
        severity: INFO,
        message: "Within normal parameters",
        lastRunAt: result.latestRun.completedAt,
        volume: result.latestRun.insertedCount
      }
```

### Step 3: Error Analysis
```
ERROR_ANALYSIS = {}

for source, classification in STATUS_CLASSIFICATION:
  if classification.status in ["FAILED", "DELAYED"]:
    if latestRun.workerStatus in ["retrying", "backoff"]:
      ERROR_ANALYSIS[source] = {
        error_type: "TRANSIENT",
        recommendation: "WAIT_AND_MONITOR",
        message: f"Worker status {workerStatus}; automatic retry in progress"
      }
    
    else if latestRun.errorMessage contains known_transient_errors:
      ERROR_ANALYSIS[source] = {
        error_type: "TRANSIENT",
        recommendation: "WAIT_AND_MONITOR",
        message: f"Transient error detected: {extract_error_type(errorMessage)}"
      }
    
    else:
      ERROR_ANALYSIS[source] = {
        error_type: "PERMANENT",
        recommendation: "ESCALATE_IMMEDIATELY",
        message: f"Permanent error (likely config/auth): {latestRun.errorMessage}"
      }
```

### Step 4: System Health Check
```
SYSTEM_HEALTH = {
  healthy_sources: count(status == "OK"),
  degraded_sources: count(status in ["DELAYED", "VOLUME_DROP", "HIGH_REJECTION_RATE"]),
  failed_sources: count(status in ["FAILED", "CRITICAL_STALE", "NEVER_RUN"]),
  overall_status: compute_overall(counts)
}

if SYSTEM_HEALTH.healthy_sources < MIN_SOURCES_HEALTHY:
  SYSTEM_HEALTH.overall_status = "CRITICAL"
  recommendation: "Insufficient data sources available"
else if SYSTEM_HEALTH.failed_sources > 0:
  SYSTEM_HEALTH.overall_status = "DEGRADED"
  recommendation: "Review failed sources"
else if SYSTEM_HEALTH.degraded_sources > 0:
  SYSTEM_HEALTH.overall_status = "DEGRADED"
  recommendation: "Monitor degraded sources"
else:
  SYSTEM_HEALTH.overall_status = "HEALTHY"
```

### Step 5: Generate Audit Report
```
REPORT = {
  timestamp_utc: now,
  audit_window: [window_start, window_end],
  system_health: SYSTEM_HEALTH,
  source_status: STATUS_CLASSIFICATION,
  error_analysis: ERROR_ANALYSIS,
  escalation_flags: extract_escalation_flags(STATUS_CLASSIFICATION),
  recommended_actions: generate_actions(STATUS_CLASSIFICATION),
  baseline_comparison: compare_to_recent_stats(RESULTS)
}
```

---

## Output Specification

### Primary Output: Audit Report (Markdown)
```markdown
# Data Ingestion Audit Report

**Date**: 2026-03-18  
**Audit Window**: 2026-03-18 08:00 UTC to 2026-03-18 09:00 UTC  
**System Status**: [HEALTHY | DEGRADED | CRITICAL]  

## Summary

| Source | Status | Last Run | Volume | Issues |
|--------|--------|----------|--------|--------|
| NDBC | OK | 09:45 UTC | 1,247 obs | None |
| Coral Reef Watch | DELAYED | 09:15 UTC | 42 records | 6h stale |
| Regional Station | OK | 08:50 UTC | 325 obs | None |

**System Health**: 2/3 sources healthy; 1 delayed  
**Recommendation**: Monitor CRW; escalate if delay > 12h

## Detailed Findings

### NDBC
- **Status**: OK
- **Last Run**: 2026-03-18 09:45:00 UTC (15 minutes ago)
- **Volume**: 1,247 inserted, 3 rejected
- **Baseline**: Avg 1,200 ± 50 inserted
- **Trend**: ✓ Normal

### Coral Reef Watch
- **Status**: DELAYED
- **Last Run**: 2026-03-18 09:15:00 UTC (45 minutes ago)
- **Issue**: Expected weekly update; 6 hours overdue from scheduled window
- **Volume**: 42 records inserted
- **Worker Status**: Retrying
- **Recommendation**: Wait 6 more hours; escalate if not received by 16:00 UTC

### Regional Station
- **Status**: OK
- **Last Run**: 2026-03-18 08:50:00 UTC (1 hour 10 minutes ago)
- **Volume**: 325 inserted
- **Baseline**: Avg 310 ± 20
- **Trend**: ✓ Normal

## Escalation Flags

| Flag | Severity | Action |
|------|----------|--------|
| CRW delayed (expected weekly) | LOW | Monitor; no action required if received by 16:00 |
| Error count NDBC above baseline | MEDIUM | Note for trend analysis |

## Baseline Comparison

| Metric | NDBC | CRW | Regional |
|--------|------|-----|----------|
| 7-day avg volume | 1,200 | 40 | 310 |
| failure rate (7-day) | 5% | 2% | 0% |
| Current status | ✓ Normal | ⚠ Delayed | ✓ Normal |

## Recommended Actions

### Immediate (Next 1h)
- [ ] Check CRW upstream system status
- [ ] Verify scheduled update was triggered

### Short-term (Next 6h)
- [ ] Monitor CRW ingestion completion
- [ ] If no data by 16:00 UTC, page on-call

### Monitoring (Next 7 days)
- [ ] Track NDBC baseline; verify error count trend
- [ ] Confirm CRW weekly update resumed normally

---

**Next Audit**: 2026-03-18 10:00 UTC (in 1 hour)
```

### Secondary Output: JSON Audit Record
```json
{
  "timestamp_utc": "2026-03-18T09:45:00Z",
  "audit_window_start_utc": "2026-03-18T08:00:00Z",
  "audit_window_end_utc": "2026-03-18T09:00:00Z",
  "agent_version": "1.0",
  "system_status": "DEGRADED",
  "source_status": {
    "NDBC": {
      "status": "OK",
      "severity": "INFO",
      "latestRunAt": "2026-03-18T09:45:00Z",
      "staleness_minutes": 15,
      "volume": { "inserted": 1247, "rejected": 3 },
      "baseline_comparison": "normal"
    },
    "CORAL_REEF_WATCH": {
      "status": "DELAYED",
      "severity": "HIGH",
      "latestRunAt": "2026-03-18T09:15:00Z",
      "staleness_minutes": 45,
      "message": "Expected weekly update; 6 hours overdue",
      "workerStatus": "retrying",
      "volume": { "inserted": 42, "rejected": 0 }
    },
    "REGIONAL_STATION": {
      "status": "OK",
      "severity": "INFO",
      "latestRunAt": "2026-03-18T08:50:00Z",
      "staleness_minutes": 70,
      "volume": { "inserted": 325, "rejected": 0 },
      "baseline_comparison": "normal"
    }
  },
  "system_health": {
    "healthy_sources": 2,
    "degraded_sources": 1,
    "failed_sources": 0,
    "overall_status": "DEGRADED"
  },
  "escalation_flags": [
    {
      "source": "CORAL_REEF_WATCH",
      "flag": "delayed",
      "severity": "HIGH",
      "action": "MONITOR_UNTIL_16:00_UTC"
    }
  ],
  "audit_trail": {
    "sources_checked": 3,
    "queries_executed": 3,
    "errors": null
  }
}
```

---

## Escalation Conditions

### Automatic Escalation to CRITICAL
- **Condition**: Source never run OR >12 hours stale OR 2+ sources failed
- **Action**: Page on-call immediately
- **Follow-up**: Incident response; investigate root cause

### Automatic Escalation to HIGH
- **Condition**: Single source 6+ hours delayed OR permanent error detected
- **Action**: Email data ops; Slack alert
- **Follow-up**: Data team investigates; escalate to DevOps if infrastructure issue

### Escalation to MEDIUM (Monitoring)
- **Condition**: Volume drop >50% from baseline OR error count >2σ above mean
- **Action**: Notify data team; add to daily briefing
- **Follow-up**: Monitor over next 7 days; trend analysis

### Silent Archive (INFO)
- **Condition**: All sources OK; volumes and error rates normal
- **Action**: Log audit result; no notification
- **Follow-up**: Continue routine monitoring

---

## Rules & Constraints

1. **Threshold Tuning**: Max staleness, critical staleness, volume thresholds set via config; adjustable without code change.
2. **Worker Retry Logic**: If worker is retrying (backoff), don't escalate yet; allow 1 retry cycle (typically 5-30 min).
3. **Manual Overrides**: Operator can suppress alerts for known maintenance windows (must document in log).
4. **Baseline Drift**: If baseline stats unavailable (new source), use conservative thresholds; escalate for any error.
5. **Time Zone**: All timestamps UTC; local time used only for human communication.

---

## Success Criteria

### Phase 1 Manual Pilots (Apr–May 2026)
- [ ] Audit runs daily; 100% completeness
- [ ] Source status classification accurate (validation against manual review)
- [ ] Zero false negatives (missed delays/failures)
- [ ] False-positive rate < 5% (e.g., known scheduled downtime)
- [ ] Audit completes in < 5 min (acceptable for manual workflow)
- [ ] Data ops team confidence: 4/5 or higher

### Phase 3 Automation (Jul–Aug 2026)
- [ ] Audit runs per-ingest + hourly batch
- [ ] Detection latency < 2 min (source fails → alert generated)
- [ ] Escalation SLA met: CRITICAL within 5 min, HIGH within 15 min
- [ ] False-positive rate < 2% (calibrated via Phase 1 feedback)
- [ ] Zero regressions in data team response times

---

## System Prompt (Reusable)

```
You are the Data Ingestion Agent for the Marine Bio Platform.

Your role is to audit data pipeline health and detect stuck or delayed sources.

INPUTS:
You receive JSON data about the latest ingestion run per source:
- Source name (NDBC, Coral Reef Watch, Regional Station)
- Latest run completion timestamp
- Run status (success, failed, partial)
- Worker status (healthy, retrying, backoff, failed)
- Volume inserted and rejected
- Error message if failed

THRESHOLDS:
- Max staleness: 360 minutes (6 hours); flag as DELAYED
- Critical staleness: 720 minutes (12 hours); flag as CRITICAL_STALE
- Volume alert: If current < baseline * 50%; flag as VOLUME_DROP
- Error alert: If rejected count > 2 standard deviations above 30-day mean

YOUR TASK:
1. Classify each source status:
   - OK: Within normal parameters
   - DELAYED: Stale but within 12h; worker retrying
   - FAILED: Last run failed; permanent or transient error
   - CRITICAL_STALE: No data > 12h
   - VOLUME_DROP: Incoming volume <50% of baseline
   - HIGH_REJECTION_RATE: Rejections > 2σ above mean

2. Analyze errors:
   - Transient (network, timeout, rate-limit): Recommend WAIT_AND_MONITOR
   - Permanent (auth, config, schema): Recommend ESCALATE_IMMEDIATELY

3. Compute system health:
   - Count sources in each status category
   - If healthy sources < 2: System = CRITICAL
   - If any failed sources: System = DEGRADED
   - If delayed/volume-drop sources > 0: System = DEGRADED
   - Otherwise: System = HEALTHY

4. Generate audit report with:
   - Status table (source, status, last run, volume, issues)
   - Escalation flags (what needs attention?)
   - Recommended actions (what should operator do next?)
   - Baseline comparison (how does today compare to normal?)

ESCALATION RULES:
- CRITICAL: Never run OR >12h stale OR 2+ sources failed → Page on-call
- HIGH: 1 source 6+ hours delayed OR permanent error → Alert data ops
- MEDIUM: Volume drop OR error count elevated → Monitor, add to briefing
- INFO: All OK → Log silently

IMPORTANT:
If worker is retrying, DO NOT escalate yet. Allow 1 retry cycle.
If baseline stats unavailable (new source), use conservative thresholds.
Never suppress escalation without documenting the override.
```

---

## Example Workflows

### Scenario 1: All Sources Healthy
```
INPUTS:
- NDBC: Completed 15 min ago, 1,247 records inserted
- CRW: Completed 30 min ago, 42 records inserted
- Regional: Completed 60 min ago, 325 records inserted

ACTION:
- Classification: All OK
- System Health: HEALTHY
- Output: Silent log entry (no notification)
```

### Scenario 2: CRW Delayed (Expected)
```
INPUTS:
- NDBC: OK, 15 min ago
- CRW: Last run 9 hours ago (weekly scheduled, should have run again)
- Regional: OK, 50 min ago

ACTION:
- Classification: CRW = DELAYED
- Error Analysis: Transient (scheduled update window, likely in-progress)
- Escalation: HIGH (alert data ops)
- Recommendation: Monitor until 16:00 UTC; escalate if not received by then
```

### Scenario 3: NDBC Ingestion Failed (Permanent)
```
INPUTS:
- NDBC: Last run FAILED, error "401 Unauthorized", workerStatus "failed"
- CRW: OK
- Regional: OK

ACTION:
- Classification: NDBC = FAILED
- Error Analysis: Permanent (auth issue; credentials may have expired)
- Escalation: CRITICAL (page on-call)
- Recommendation: Verify API credentials; check if NOAA changed endpoint
```

### Scenario 4: Volume Drop Detected
```
INPUTS:
- NDBC: Completed 12 min ago, 600 records (baseline avg 1,100)
- CRW: OK
- Regional: OK

ACTION:
- Classification: NDBC = VOLUME_DROP
- Error Analysis: N/A (run succeeded; check upstream)
- Escalation: MEDIUM (alert data team)
- Recommendation: Check NDBC upstream data source; possible network packet loss
```

---

## Implementation Checklist (Phase 1)

- [ ] Connect to live_ingestion_reports database
- [ ] Query latest run per source
- [ ] Compute staleness in minutes
- [ ] Classify status per rules
- [ ] Analyze error messages
- [ ] Compute system health
- [ ] Generate markdown report
- [ ] Generate JSON audit record
- [ ] Escalate based on severity
- [ ] Archive result to audit log

---

## Contact & Support

- **Agent Owner**: Data Ops Team Lead
- **Last Updated**: March 18, 2026
- **Questions**: See marine-agent-system-overview.md or escalate to Data Ops

