# Marine-Architecture-Audit-Agent

**Purpose**: Monitor system health, config drift, and integration availability  
**Scope**: Scheduled daily or per-deploy  
**Maturity**: Manual audit now (Phase 1); autonomous daily job Phase 3  
**Owned By**: DevOps / Site Reliability Engineering (SRE)

---

## Core Responsibility

The Architecture-Audit Agent continuously monitors the health of platform infrastructure, identifying component failures, performance degradation, config drift, and integration errors before they impact data collection or analysis. It serves as an early warning system for operational issues.

### Primary Functions
1. **Component Health Check**: Query API endpoints, database connectivity, external service status
2. **Performance Monitoring**: CPU, memory, disk usage; query latency; ingestion throughput
3. **Config Drift Detection**: Compare current config vs. deployed baseline; flag unauthorized changes
4. **Integration Health**: Check upstream data sources (NOAA API, CRW servers); validate credentials
5. **Dependency Status**: External APIs, CDN, third-party services reachability
6. **Trend Analysis**: Compare current metrics to baseline; identify deterioration patterns

---

## Responsibilities

| Task | Success Criteria | Owner |
|------|------------------|-------|
| Health-check all components | Every component queried; status determined within 10s | System |
| Measure performance metrics | CPU, memory, disk, query latency, throughput sampled | Agent |
| Detect config drift | Current config compared to baseline; drift flagged | Agent |
| Validate integrations | NOAA API, CRW source, auth credentials tested | Agent |
| Aggregate status | Per-component status + overall system health computed | Agent |
| Identify trends | Compare metrics to 7/30-day baseline; flag deterioration | Agent |
| Generate audit report | Scorecard with all findings; remediation recommendations | Agent |
| Archive audit | Result stored with timestamp; queryable for trend analysis | System |

---

## Inputs

### Required Inputs
1. **Component List** (hardcoded or config-driven)
   ```json
   {
     "components": [
       {
         "name": "API Server",
         "type": "rest_api",
         "endpoint": "https://api.marineplatform.local/health",
         "timeout_ms": 5000,
         "critical": true
       },
       {
         "name": "Postgres Database",
         "type": "database",
         "endpoint": "postgres://db.internal:5432",
         "critical": true
       },
       {
         "name": "Redis Cache",
         "type": "cache",
         "endpoint": "redis://cache.internal:6379",
         "critical": false
       },
       {
         "name": "Web Dashboard",
         "type": "web_frontend",
         "endpoint": "https://dashboard.marineplatform.local",
         "critical": false
       },
       {
         "name": "NOAA API",
         "type": "external_api",
         "endpoint": "https://api.noaa.gov/...",
         "critical": true
       },
       {
         "name": "CRW Data Server",
         "type": "external_api",
         "endpoint": "https://crw.noaa.gov/...",
         "critical": false
       }
     ]
   }
   ```

2. **Performance Baselines** (from 7/30-day history)
   ```json
   {
     "baselines": {
       "api_response_time_p99_ms": 150,
       "db_query_time_p99_ms": 500,
       "api_error_rate_percent": 0.1,
       "ingestion_throughput_obs_per_min": 180,
       "cpu_utilization_percent": 35,
       "memory_utilization_percent": 60,
       "disk_utilization_percent": 45
     }
   }
   ```

3. **Configuration Baseline** (from last known-good deployment)
   ```json
   {
     "config_version": "v2.3.1",
     "ingestion_settings": { ... },
     "api_settings": { ... },
     "database_settings": { ... }
   }
   ```

---

## Health Check Framework

### Component Health Status

#### Status Levels
- **OK** (Green): Component responding normally; metrics within baseline
- **DEGRADED** (Yellow): Component responding slowly or with elevated error rate
- **UNAVAILABLE** (Red): Component unreachable or critically unhealthy

#### Health Check Types

**1. Connectivity Checks**
```
for component in COMPONENTS:
  try:
    response = GET component.endpoint (timeout: component.timeout_ms)
    if response.status in [200, 301, 302]:
      return OK
    else if response.status >= 500:
      return UNAVAILABLE
    else if response.status >= 400:
      return DEGRADED
  except TimeoutError:
    return UNAVAILABLE
  except ConnectionError:
    return UNAVAILABLE
```

**2. Application Health Endpoints** (preferred)
```
// API Server
GET /health → { status: "healthy", version: "2.3.1", uptime_seconds: 86400, ... }

// Database
SELECT 1; // Test connectivity + basic query
// Measure: response time, error rate

// Cache
PING; SET test_key "1"; GET test_key // Test connectivity + set/get
```

**3. Performance Metrics**
```
// API Response Time
measure_response_time(GET /feed-health?limit=100):
  if p99_time_ms < baseline * 1.5:
    status = OK
  else if p99_time_ms < baseline * 2:
    status = DEGRADED
  else:
    status = UNAVAILABLE

// Database Query Latency
measure_query_time(SELECT COUNT(*) FROM observations LIMIT 1):
  if p99_time_ms < baseline * 1.5:
    status = OK
  else if p99_time_ms < baseline * 2:
    status = DEGRADED

// Ingestion Throughput
measure_ingest_rate():
  if obs_per_min_5min_avg > baseline * 0.8:
    status = OK
  else:
    status = DEGRADED
```

**4. Resource Utilization** (via system metrics)
```
// CPU
if cpu_percent < 50:
  status = OK
else if cpu_percent < 80:
  status = DEGRADED
else:
  status = UNAVAILABLE

// Memory
if memory_percent < 70:
  status = OK
else if memory_percent < 85:
  status = DEGRADED
else:
  status = UNAVAILABLE

// Disk
if disk_percent < 80:
  status = OK
else if disk_percent < 90:
  status = DEGRADED
else:
  status = UNAVAILABLE
```

**5. External Integration Checks**
```
// NOAA API Connectivity
try:
  response = GET https://api.noaa.gov/health/ (or known working endpoint)
  if response.status == 200:
    return OK
  else:
    return DEGRADED
except:
  return UNAVAILABLE

// CRW Data Server Status
try:
  response = GET https://crw.noaa.gov/data/ (test public dataset)
  if response.status in [200, 404]:
    status = OK  // 404 OK; endpoint exists
  else:
    status = DEGRADED
except:
  return UNAVAILABLE

// Authentication Validation
test_api_credentials(ndbc_api_key, ndbc_endpoint):
  try:
    response = GET ndbc_endpoint?api_key=... (small request)
    if response.status == 200:
      return OK
    elif response.status == 401:
      return UNAVAILABLE  // Credentials expired/revoked
    else:
      return DEGRADED
  except:
    return UNAVAILABLE
```

**6. Config Drift Detection**
```
CURRENT_CONFIG = read_config_from_system()
BASELINE_CONFIG = read_config_from_version_control(tag="last_deployment")

DRIFT_ITEMS = []
for key in BASELINE_CONFIG.keys():
  if key not in CURRENT_CONFIG:
    DRIFT_ITEMS.append({ key: key, issue: "missing" })
  elif CURRENT_CONFIG[key] != BASELINE_CONFIG[key]:
    DRIFT_ITEMS.append({
      key: key,
      baseline_value: BASELINE_CONFIG[key],
      current_value: CURRENT_CONFIG[key],
      issue: "modified"
    })

if len(DRIFT_ITEMS) > 0:
  return {
    status: DEGRADED,
    drift_count: len(DRIFT_ITEMS),
    drift_details: DRIFT_ITEMS
  }
else:
  return { status: OK }
```

---

## Processing Logic

### Step 1: Query Component Status
```
COMPONENT_STATUS = {}

for component in COMPONENTS:
  status = perform_health_check(component)
  metrics = collect_performance_metrics(component)
  
  COMPONENT_STATUS[component.name] = {
    status: status,
    metrics: metrics,
    checked_at: now,
    component_type: component.type,
    is_critical: component.critical
  }
```

### Step 2: Compute Component Scores
```
COMPONENT_SCORES = {}

for component_name, component_result in COMPONENT_STATUS:
  
  if component_result.status == UNAVAILABLE:
    score = 0
  else if component_result.status == DEGRADED:
    score = 50
  else:  // OK
    score = 100
  
  COMPONENT_SCORES[component_name] = score
  
  // If critical component, flag for escalation
  if component_result.is_critical and score < 100:
    flag_for_escalation(component_name)
```

### Step 3: Aggregate System Health
```
CRITICAL_SCORES = [s for c, s in COMPONENT_SCORES.items() if COMPONENTS[c].critical]
ALL_SCORES = COMPONENT_SCORES.values()

SYSTEM_HEALTH = determine_health(CRITICAL_SCORES, ALL_SCORES):
  
  if any(score == 0 for score in CRITICAL_SCORES):
    return CRITICAL  // Critical component unavailable
  else if any(score == 0 for score in ALL_SCORES):
    return RED  // Non-critical component down
  else if all(score == 100 for score in CRITICAL_SCORES):
    if any(score < 100 for score in ALL_SCORES):
      return YELLOW  // Non-critical degraded
    else:
      return GREEN  // All OK
  else:
    return YELLOW  // Critical component degraded
```

### Step 4: Detect Trends
```
TREND_ANALYSIS = {}

for component_name, current_score in COMPONENT_SCORES:
  historical_scores = get_score_history(component_name, window_days=30)
  
  TREND_ANALYSIS[component_name] = {
    current_score: current_score,
    avg_30day: mean(historical_scores),
    trend: compute_trend(historical_scores),  // improving / stable / declining
    volatility: compute_stdev(historical_scores)
  }
  
  if current_score < trend.avg_30day * 0.9:
    flag_deterioration(component_name, percent_decline=...)
```

### Step 5: Check Config Drift
```
CONFIG_STATUS = check_config_drift()

if CONFIG_STATUS.drift_count > 0:
  flag_for_review(CONFIG_STATUS.drift_details)
```

### Step 6: Integration Auth Validation
```
AUTH_STATUS = {
  ndbc_api: validate_credential("NDBC_API_KEY"),
  crw_data: validate_credential("CRW_API_KEY"),
  // ... other integrations
}

for integration, status in AUTH_STATUS:
  if status == FAILED:
    flag_for_escalation(integration, message="Credentials may have expired")
```

### Step 7: Generate Audit Report
```
REPORT = {
  timestamp_utc: now,
  audit_window: [window_start, window_end],
  system_health: SYSTEM_HEALTH,
  component_status: COMPONENT_STATUS,
  component_scores: COMPONENT_SCORES,
  trend_analysis: TREND_ANALYSIS,
  config_drift: CONFIG_STATUS,
  auth_status: AUTH_STATUS,
  escalation_flags: extract_escalation_flags(all_above),
  recommended_actions: generate_recommendations(REPORT)
}
```

---

## Output Specification

### Primary Output: Architecture Audit Report (Markdown)
```markdown
# Architecture Audit Report

**Date**: 2026-03-18  
**Audit Time**: 09:30 UTC  
**System Status**: 🟢 GREEN — All systems healthy  

## Component Health Scorecard

| Component | Status | Score | Trend | Notes |
|-----------|--------|-------|-------|-------|
| API Server | OK | 100 | ↑ Stable | Response time 95ms (baseline: 120ms) |
| Postgres DB | OK | 100 | → Stable | Query latency normal; disk 45% |
| Redis Cache | OK | 100 | → Stable | Hit rate 95% |
| Web Dashboard | OK | 100 | → Stable | Page load 1.2s |
| NOAA API | OK | 100 | → Stable | All requests successful |
| CRW Server | OK | 100 | → Stable | Data feed available |

**Summary**: 6/6 components healthy; 0 critical issues

## Performance Metrics

| Metric | Current | Baseline (30-day) | Status |
|--------|---------|-------------------|--------|
| API Response (p99) | 95 ms | 120 ms | ✓ Better |
| DB Query (p99) | 480 ms | 500 ms | ✓ Normal |
| API Error Rate | 0.08% | 0.10% | ✓ Normal |
| Ingest Throughput | 185 obs/min | 180 obs/min | ✓ Normal |
| CPU Utilization | 32% | 35% | ✓ Normal |
| Memory Utilization | 58% | 60% | ✓ Normal |
| Disk Utilization | 44% | 45% | ✓ Normal |

## Config Drift

**Status**: ✓ No drift detected  
Last verified: 2026-03-17 09:30 UTC  
Config version: v2.3.1 (deployed 2026-03-10)

## Integration Status

| Integration | Status | Last Verified | Action |
|-------------|--------|---------------|--------|
| NOAA API | ✓ OK | 5 min ago | None |
| CRW Server | ✓ OK | 5 min ago | None |
| NDBC Credentials | ✓ Valid | 30 min ago | None |

## 30-day Trends

- **API Performance**: ↑ Improving (5 ms faster than avg)
- **Database**: → Stable (normal variation)
- **Ingestion**: ↑ Slight improvement (throughput +3%)
- **Infrastructure**: → Stable (utilization normal)

## Recommendations

### Immediate (Next 1h)
- [ ] Continue monitoring; no action required

### Short-term (Next 7 days)
- [ ] Plan DB index analysis (query times stable but approaching 500ms)
- [ ] Schedule performance baseline recalibration (quarterly)

### Long-term (Next 30 days)
- [ ] Plan capacity assessment (disk 44% usage)
- [ ] Evaluate cache upgrade if hit rate drops below 90%

---

**Next Audit**: 2026-03-18 10:30 UTC (tomorrow, same time)
```

### Secondary Output: JSON Audit Record
```json
{
  "timestamp_utc": "2026-03-18T09:30:00Z",
  "audit_report_version": "1.0",
  "system_health": "GREEN",
  "component_health": {
    "api_server": {
      "status": "OK",
      "score": 100,
      "response_time_p99_ms": 95,
      "error_count": 0
    },
    "postgres_database": {
      "status": "OK",
      "score": 100,
      "query_time_p99_ms": 480,
      "disk_utilization_percent": 45
    },
    "redis_cache": {
      "status": "OK",
      "score": 100,
      "hit_rate_percent": 95
    },
    "web_dashboard": {
      "status": "OK",
      "score": 100,
      "page_load_time_s": 1.2
    },
    "noaa_api": {
      "status": "OK",
      "score": 100,
      "last_successful_request": "2026-03-18T09:25:00Z"
    },
    "crw_server": {
      "status": "OK",
      "score": 100,
      "last_successful_request": "2026-03-18T09:25:00Z"
    }
  },
  "system_metrics": {
    "cpu_utilization_percent": 32,
    "memory_utilization_percent": 58,
    "disk_utilization_percent": 44,
    "api_error_rate_percent": 0.08,
    "ingest_throughput_obs_per_min": 185
  },
  "trend_analysis": {
    "api_performance": { "trend": "improving", "change_ms": -5 },
    "database": { "trend": "stable" },
    "ingestion": { "trend": "improving", "change_percent": 3 }
  },
  "config_drift": {
    "status": "no_drift",
    "config_version": "v2.3.1",
    "last_verified_utc": "2026-03-17T09:30:00Z"
  },
  "auth_status": {
    "ndbc_api_key": "valid",
    "crw_api_key": "valid"
  },
  "escalation_flags": [],
  "recommendations": [
    "continue_monitoring"
  ]
}
```

---

## Escalation Conditions

### Automatic Escalation to CRITICAL
- **Condition**: Critical component unavailable (API, DB, or ingestion pipeline down)
- **Action**: Page on-call immediately; trigger incident response
- **Follow-up**: Incident investigation; root cause analysis

### Automatic Escalation to RED
- **Condition**: Non-critical component unavailable OR performance > 2× baseline
- **Action**: Alert DevOps team; create incident ticket
- **Follow-up**: Monitor for impact on data quality/availability

### Automatic Escalation to YELLOW
- **Condition**: Component degraded (1–2× baseline) OR config drift detected OR auth expired
- **Action**: Notify on-call engineer; add to daily briefing
- **Follow-up**: Monitor trend; schedule remediation if needed

### Silent Archive (GREEN)
- **Condition**: All components OK; metrics normal; no drift
- **Action**: Log silently
- **Follow-up**: Continue routine audits

---

## Rules & Constraints

1. **Critical Component Priority**: If any critical component scores < 100, system health ≤ YELLOW
2. **Baseline Recalibration**: Baselines updated monthly; anomalies excluded from new baseline
3. **Alert Fatigue Prevention**: Component must be degraded for 2 consecutive audits before true escalation
4. **Config Drift Tolerance**: Minor version differences ignored (e.g., build numbers, timestamps)
5. **Time Zone**: All timestamps UTC; audit window: rolling 24-hour

---

## Success Criteria

### Phase 1 Manual Audits (Apr–May 2026)
- [ ] Daily audit runs; 100% completeness
- [ ] Component status classification accurate (validated against manual checks)
- [ ] Zero false negatives (missed unavailable components)
- [ ] False-positive rate < 5% (e.g., transient API lag)
- [ ] Audit completes in < 5 min
- [ ] DevOps team confidence: 4/5 on report accuracy

### Phase 3 Automation (Jul–Aug 2026)
- [ ] Audit runs daily at scheduled time; 100% reliability
- [ ] Escalation latency < 2 min (component failure → alert generated)
- [ ] False-positive rate < 2% (calibrated via Phase 1)
- [ ] Zero missed critical escalations
- [ ] Config drift detection accuracy 100%

---

## System Prompt (Reusable)

```
You are the Architecture-Audit Agent for the Marine Bio Platform.

Your role is to continuously monitor platform health and detect infrastructure issues 
before they impact data collection or analysis.

INPUTS:
You perform health checks on:
1. API Server (connectivity, response time, error rate)
2. Postgres Database (connectivity, query latency, disk usage)
3. Redis Cache (connectivity, hit rate)
4. Web Dashboard (connectivity, page load time)
5. External APIs (NOAA, CRW server reachability)
6. Authentication credentials (API key validity)
7. System resources (CPU, memory, disk utilization)
8. Configuration (drift from baseline)

HEALTH CHECK LOGIC:
For each component:
- Try to connect/query (with timeout)
- Measure response time
- Compare to baseline threshold
- If response time < baseline * 1.5: Status = OK (100)
- If response time < baseline * 2: Status = DEGRADED (50)
- If unreachable or critically slow: Status = UNAVAILABLE (0)

COMPONENT SCORING:
- OK = 100 points
- DEGRADED = 50 points
- UNAVAILABLE = 0 points

SYSTEM HEALTH:
- GREEN: All critical components scoring 100
- YELLOW: Any critical component scoring < 100, OR any non-critical down
- RED: Unable to determine health (audit infrastructure failed)

YOUR TASK:
1. Health-check all components
2. Measure performance metrics
3. Compare to baselines (flag if > 1.5× baseline)
4. Detect config drift
5. Validate auth credentials
6. Aggregate to component scores
7. Compute system health status
8. Generate scorecard report

ESCALATION RULES:
- CRITICAL: Any critical component unavailable → Page on-call
- RED: Non-critical component unavailable → Alert DevOps
- YELLOW: Component degraded OR config drift → Monitor + briefing
- GREEN: All OK → Log silently

OUTPUT:
Generate a report with:
- Component health scorecard (status, score, trend)
- Performance metrics table
- Config drift status
- Integration/auth status
- Trend analysis (improving/stable/declining)
- Recommendations (actions for next 24h)
- Escalation flags (if any)
```

---

## Example Workflows

### Scenario 1: All Green (Normal Operations)
```
HEALTH CHECKS:
- API Server: OK, 95ms response (baseline 120ms)
- Postgres: OK, 480ms query time
- Redis: OK, 95% hit rate
- Web: OK, 1.2s load time
- NOAA API: OK, reachable
- CRW: OK, reachable
- Auth: All valid

ACTION:
- Status: GREEN
- Escalation: None
- Output: Silent archive + metrics log
```

### Scenario 2: One Component Degraded
```
HEALTH CHECKS:
- API Server: DEGRADED, 250ms response (baseline 120ms; >2× threshold)
- Postgres: OK
- Redis: OK
- Others: OK

ACTION:
- Status: YELLOW
- Escalation: YELLOW (alert DevOps)
- Recommendation: Investigate API load; check for slow queries
- Follow-up: Monitor next 2 audits; escalate if sustained
```

### Scenario 3: Critical Component Down
```
HEALTH CHECKS:
- API Server: UNAVAILABLE (connection refused)
- Postgres: Unreachable
- Others: Cannot be checked (no API)

ACTION:
- Status: CRITICAL
- Escalation: Page on-call immediately
- Actions: Incident response protocol
- Investigation: App server logs, network connectivity, disk space
```

---

## Implementation Checklist (Phase 1)

- [ ] Health-check API server (connectivity + response time)
- [ ] Health-check Postgres database (query execution)
- [ ] Health-check Redis cache (connectivity + performance)
- [ ] Health-check web dashboard (HTTP + page load)
- [ ] Test NOAA API connectivity (test endpoint)
- [ ] Test CRW server connectivity (test endpoint)
- [ ] Validate auth credentials (test API calls)
- [ ] Collect system metrics (CPU, memory, disk via tools)
- [ ] Compare to baselines
- [ ] Check config drift (vs. known-good baseline)
- [ ] Aggregate scores
- [ ] Generate audit report
- [ ] Escalate if needed
- [ ] Archive to audit log

---

## Contact & Support

- **Agent Owner**: DevOps / SRE Lead
- **Last Updated**: March 18, 2026
- **Escalation Contact**: On-call engineer (on-call schedule)
- **Questions**: See marine-agent-system-overview.md or escalate to DevOps Team

