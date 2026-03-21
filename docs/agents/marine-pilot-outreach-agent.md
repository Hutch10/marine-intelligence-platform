# Marine-Pilot-Outreach-Agent

**Purpose**: Draft outreach messages from alerts; coordinate multi-channel delivery; manage communication cadence  
**Scope**: Deferred for Phase 4+ (after pilot packaging finalized)  
**Maturity**: Specification & design only (implementation deferred)  
**Owned By**: Communications / Pilot Relations Team (future)

---

## Context: Why This Agent is Deferred

### Current State (Mar 2026)
- **Pilot Programs**: 2 active (Caicos Banks, Exuma Sound); 1 in planning
- **Outreach Method**: Email + community leader meetings (manual)
- **Message Frequency**: Ad-hoc (when alerts occur); ~2–4 per month
- **Message Quality**: High (personally crafted, feedback-tested)
- **Automation Maturity**: Low (no templating, individual composition per message)

### Deferral Rationale
1. **Outreach Process Immature**: Pilot packaging, stakeholder preferences, and effective messaging still being refined through manual processes
2. **High Reputation Risk**: Any automation error could damage community trust; manual review must remain 100% until process stable
3. **Customization Required**: Pilot communities have different needs, communication preferences, and literacy levels; templating premature
4. **Organizational Learning**: Communications team needs 6+ months of operational experience before automating
5. **Scalability Unclear**: Future pilot count unknown; may scale differently than anticipated

### When to Activate (Phase 4: Q4 2026)
- Pilot outreach process documented and stable (3+ months history)
- 4+ pilot programs active; patterns in message types identified
- Draft quality sufficiently high that human review time < 2 min per message
- Pilot leaders request faster communication turnaround
- Communications team complete training on automation + use cases

---

## Agent Specification (Implementation Plan)

## Core Responsibility

The Pilot-Outreach Agent amplifies and accelerates human communication to pilot communities by drafting outreach messages from raw alerts, selecting appropriate communication channels, and managing message delivery coordination. It remains in a human-in-the-loop model: agent drafts, humans review & approve, then delivers.

### Primary Functions (Planned)
1. **Message Drafting**: Convert alert + context into community-appropriate outreach
2. **Audience Segmentation**: Determine which pilot groups/sub-groups should receive message
3. **Channel Selection**: Choose delivery method (email, SMS, community meeting, etc.)
4. **Tone Adaptation**: Match communication style to audience literacy and concerns
5. **Approval Workflow**: Route to communications lead for review + signature
6. **Delivery Coordination**: Schedule multi-channel messaging; track delivery status
7. **Archive & Analytics**: Log all messages; measure reach and engagement

---

## Planned Inputs (When Implemented)

### Required Inputs
1. **Alert or Notification Event** (from Safety-Ethics agent)
   ```json
   {
     "alert_id": "alert-uuid",
     "event_type": "temperature_spike",
     "severity": "WARNING",
     "affected_pilots": ["pilot_1", "pilot_2"],
     "description": "Temperature spike 31.2°C; likely upwelling",
     "recommendation": "fisheries awareness; no emergency action"
   }
   ```

2. **Pilot Group Profiles** (from database or config)
   ```json
   {
     "pilots": [
       {
         "id": "pilot_1",
         "name": "Caicos Banks Pilot",
         "leader_name": "John Smith",
         "leader_email": "john@caicos.local",
         "population": 200,
         "primary_concern": "fisheries sustainability",
         "communication_preference": ["email", "meeting"],
         "literacy_level": "high school",
         "language": "English"
       }
     ]
   }
   ```

3. **Message Template Library** (pre-crafted patterns)
   ```json
   {
     "templates": [
       {
         "id": "temp-spike-warning",
         "trigger": "alert.severity == WARNING && alert.type == temperature_spike",
         "subject_template": "Marine Alert: Temperature Anomaly Detected",
         "body_template": "Dear {leader_name}, We detected a temperature spike at {location}. Context: {explanation}. Recommended actions: {recommendations}."
       }
     ]
   }
   ```

4. **Communication History** (to personalize and avoid redundancy)
   ```json
   {
     "recent_messages": [
       {
         "date": "2026-03-10",
         "type": "thermal_warning",
         "pilot": "pilot_1",
         "response": "acknowledged; no action taken"
       }
     ]
   }
   ```

---

## Planned Processing Logic (When Implemented)

### Step 1: Receive Alert
```
ALERT = input_from_safety_ethics_agent()

Parse:
- Event type (temperature, salinity, sensor failure, etc.)
- Severity (info, caution, warning, critical)
- Affected pilots (list of pilot IDs)
- Recommended action (monitor, alert, emergency, etc.)
```

### Step 2: Select Matching Template
```
TEMPLATES = load_message_templates()

for template in TEMPLATES:
  if template.trigger_condition matches ALERT:
    selected_template = template
    break

if no matching template:
  escalate to human ("New alert type; template needed")
```

### Step 3: Gather Context
```
CONTEXT = {
  historical_events: query_similar_past_events(ALERT.type, limit=3),
  seasonal_background: get_seasonal_context(ALERT.timestamp),
  pilot_history: get_pilot_communication_history(ALERT.affected_pilots),
  external_data: fetch_external_corroboration(ALERT)  // satellite, models, etc.
}
```

### Step 4: Personalize Message for Each Pilot
```
for pilot_id in ALERT.affected_pilots:
  PILOT = get_pilot_profile(pilot_id)
  
  DRAFT = fill_message_template(
    template=selected_template,
    alert_data=ALERT,
    context=CONTEXT,
    pilot_profile=PILOT
  )
  
  // Adapt tone + complexity to literacy level
  if PILOT.literacy_level == "middle_school":
    DRAFT = simplify_language(DRAFT)
    DRAFT = remove_technical_jargon(DRAFT)
  
  // Check for recent message redundancy
  if similar_message_sent_recent(PILOT, days=7):
    DRAFT.note: "Similar message sent recently; consider consolidating"
  
  DRAFTS[pilot_id] = DRAFT
```

### Step 5: Route to Human Review
```
for pilot_id, draft in DRAFTS:
  REVIEW_TASK = {
    message_draft: draft,
    pilot: PILOT_PROFILE[pilot_id],
    approval_required: true,
    suggested_channels: determine_channels(PILOT.preference),
    reviewer_assigned: assign_reviewer(PILOT.leader_email)
  }
  
  send_to_review_workflow(REVIEW_TASK)
```

### Step 6: Post-Approval Delivery (Human-Triggered)
```
// Once human approves & sends:
DELIVERY_STATUS = {
  timestamp_sent: now,
  pilot_id: pilot_id,
  channels: approved_channels,
  message_id: generate_tracking_id(),
  delivery_status: "sent"
}

// Log delivery event
log_outreach_event(DELIVERY_STATUS)

// Schedule tracking (ask for read receipt, acknowledgment, etc.)
schedule_tracking(
  message_id=DELIVERY_STATUS.message_id,
  pilot_id=pilot_id,
  follow_up_window_days=3
)
```

---

## Planned Output (When Implemented)

### Message Draft (for Human Review)
```markdown
---
TO: John Smith, Caicos Banks Pilot Leader
SUBJECT: Marine Alert: Temperature Anomaly Detected
SEVERITY: WARNING  
APPROVE? [YES] [EDIT] [REJECT]  
SEND VIA: Email + Calendar meeting invite

---

Dear John,

We detected an unusual temperature spike at nearby ocean stations today. Here's what we found:

**What happened:**
Water temperature jumped to 31.2°C, about 4°C warmer than normal for mid-March. Scientists believe this is a natural upwelling event — water rising from deeper ocean layers.

**Why you should know:**
Upwelling brings cold, nutrient-rich water that can support more fish. For your fisheries, this could mean:
- More active feeding conditions for 3–5 days
- Possible change in fish migration patterns
- Clearer water (good for visibility fishing)

**What to do:**
- Monitor local conditions over next 2 days
- Note any changes in fish behavior or water clarity
- Report back any observations to me

This is NOT an emergency. We're flagging it for your awareness so you can plan fishing activities accordingly.

Similar events happened on Feb 18 and Jan 3 — both brief (2–3 days) with no harmful effects.

Questions? Call or email me anytime.

Best,
[Sender Name]
Marine Platform Team

---

**NOTES FOR REVIEWER:**
- Grammar/spelling checked ✓
- Literacy level adjusted ✓ (high school comprehension)
- References simplified ✓
- Action items clear ✓
- Last similar message: 30 days ago (safe to send)
```

### Delivery Log (JSON)
```json
{
  "message_id": "msg-uuid-1",
  "timestamp_created": "2026-03-18T12:00:00Z",
  "alert_id": "alert-uuid",
  "pilot_recipients": ["pilot_1", "pilot_2"],
  "message_type": "temperature_anomaly_warning",
  "status": "approved_and_delivered",
  "approver": "communications_lead_name",
  "approval_timestamp": "2026-03-18T12:05:00Z",
  "delivery_details": {
    "pilot_1": {
      "recipient_name": "John Smith",
      "channels": ["email", "sms"],
      "sent_timestamp": "2026-03-18T12:10:00Z",
      "email_status": "delivered",
      "sms_status": "delivered",
      "read_receipt": false,
      "acknowledgment": null
    },
    "pilot_2": {
      "recipient_name": "Maria Garcia",
      "channels": ["email"],
      "sent_timestamp": "2026-03-18T12:11:00Z",
      "email_status": "delivered"
    }
  },
  "engagement": {
    "email_open_rate": null,  // Tracked later
    "responses_received": []
  },
  "archive_reference": "outreach_log_2026_03_18.json"
}
```

---

## Planned Escalation & Approval Workflow

### Human Review Process
```
1. Agent generates draft
2. Sends to Communications Lead
3. Lead reviews (2–5 min):
   - Tone appropriate?
   - Accuracy verified?
   - Information sufficient?
   - Typos/grammar OK?
4. Lead can: APPROVE, EDIT, or REJECT

5a. If APPROVE: Message immediately delivered to recipients
5b. If EDIT: Returns to Agent with feedback; agent regenerates
5c. If REJECT: Escalates to Policy Review (attorney/ethics check)
```

### Escalation Triggers (Require Human Judgment)
- **New alert type**: No template matched → manual review required
- **Sensitive information**: Health emergency, critical infrastructure → attorney review
- **Multi-community coordination**: Message affects 3+ pilot groups → leadership approval
- **Policy conflict**: Message contradicts prior communication → escalate to ops lead

---

## Success Criteria (When Implemented)

### Phase 4 Development & Pilot (Oct–Dec 2026)
- [ ] Message template library complete (8+ templates covering common alert types)
- [ ] Tone/literacy adaptation tested for 2+ pilot groups
- [ ] Approval workflow integrates with communications team tools (email + calendar)
- [ ] Draft quality high enough for <2 min human review per message
- [ ] Pilot community feedback: ≥80% prefer this format over previous

### Phase 4 Operational (Jan+ 2027)
- [ ] Message drafting latency <5 min (from alert to draft ready for review)
- [ ] Message approval latency <15 min (rapid turnaround for urgent alerts)
- [ ] Publication latency <2 hours (alert occurs → community notification)
- [ ] Engagement metrics tracked (open rate, response rate, etc.)
- [ ] Zero unwarranted escalations (false emergencies)

---

## Staffing & Resource Requirements (Deferred)

- **Communications Lead (0.5 FTE)**: Template library development, approval oversight
- **Data/Messaging Specialist (0.5 FTE)**: Pilot profile maintenance, template refinement
- **Platform Engineering (0.25 FTE)**: Integration with alert system + message delivery
- **Timeline**: 2–3 months (design + template creation + integration)

---

## Risks & Mitigations (Anticipated)

| Risk | Impact | Mitigation |
|------|--------|-----------|
| Low message quality → Community distrust | Credibility damage | Extensive human review; conservative approve thresholds |
| Tone mismatch for audience | Ineffective communication | Pilot community feedback; iterative template refinement |
| Over-automation → Loss of personal touch | Community feels "robotized" | Maintain personal signature; highlight human review |
| Message fatigue → Reduced engagement | Pilot communities ignore future alerts | Intelligent message deduplication; consolidate non-urgent alerts |
| Accessibility issues (language, literacy) | Excludes members of community | Provide translation services; simplify language options |

---

## System Prompt Template (For Future Use)

```
[NOT YET ACTIVE — Template for Phase 4 Implementation]

You are the Pilot-Outreach Agent for the Marine Bio Platform.

Your role is to draft community-appropriate outreach messages from technical alerts, 
making information accessible and actionable for non-technical audiences.

IMPORTANT: You do NOT send messages directly. All messages require human review and approval 
from the Communications Lead before delivery.

INPUTS:
- Alert from Safety-Ethics Agent (event type, severity, affected pilots)
- Pilot group profiles (names, communication preferences, literacy level)
- Message template library (pre-approved patterns)
- Communication history (recent messages to avoid redundancy)

YOUR TASK:
1. Select matching template for alert type
2. Gather context (historical events, seasonal background)
3. Personalize message for each pilot group
4. Adapt language/tone to audience literacy level
5. Generate human-reviewable draft
6. Flag any issues requiring approval authority

TONE GUIDELINES:
- Clear, direct communication (avoid jargon)
- Action-oriented (what should they do?)
- Proportionate (match tone to actual risk)
- Culturally respectful (acknowledge local context)

OUTPUT FORMAT:
Generate a draft with:
- Clear recipient and subject
- Recipient-appropriate language
- Specific recommended actions
- Historical context (if relevant)
- Contact info for questions
- Auto-generated notes for reviewer

Do NOT send directly. Always route to Communications Lead for approval.
All messages must be logged for audit trail and engagement tracking.
```

---

## Why Deferred Rationale (Detailed)

### Process Maturity
Current manual outreach is **working well** and provides valuable feedback:
- Communications team learning what pilots need, value, and ignore
- Message templates emerging organically from manual process
- Tone/style preferences becoming clear through feedback
- Trust being built through personal relationships

**Benefit of delay**: 6–9 months of operational experience stabilizes process before automating; reduces risk of embedding bad patterns into automation.

### Reputational Risk
Pilot communities are **highly sensitive** to communication quality:
- Misinformation erodes trust
- Automated messages perceived as impersonal
- Emergency messaging failures catastrophic
- Community maintains active social media; negative feedback spreads fast

**Benefit of delay**: Proves capability through manual process first; pilot leaders become advocates for automation when they see benefits.

### Pilot Packaging Uncertainty
Future pilot program structure unclear:
- Current 2 pilots; planning for 4–6 by Q4 2026
- Each new pilot may have different communication needs
- Pilot leader turnover possible (requires re-relationship-building)
- Message types may evolve as pilot needs change

**Benefit of delay**: Stabilize at 4+ pilots, then automate; patterns clearer with more diverse communities.

### Scalability Questions
Unclear whether outreach scales as:
- Each new pilot (→ horizontal scaling; more recipients)
- Alert frequency increases (→ vertical scaling; more messages per group)
- Geographic expansion (→ new languages, cultural contexts)

**Benefit of delay**: Operational experience reveals actual scaling path; avoid premature optimization.

### Compliance & Legal
- Message content may require legal review (liability, accuracy)
- Public records retention requirements TBD
- Privacy regulations (email addresses, engagement tracking) evolving

**Benefit of delay**: Legal framework more stable by Q4 2026; reduces compliance risk.

---

## Activation Checklist (For Phase 4)

- [ ] Confirm outreach process documented and stable (3+ months history)
- [ ] Assemble message template library (template per alert type; 8+ templates)
- [ ] Test tone adaptation for 2+ pilot groups
- [ ] Design approval workflow (integration with team tools)
- [ ] Communications lead training on using agent
- [ ] Pilot group feedback on draft quality
- [ ] Approval workflow tested (end-to-end)
- [ ] Legal/compliance review of message content and data handling
- [ ] Engagement tracking infrastructure ready (analytics, feedback)
- [ ] Gradual rollout (start with 1 pilot group, expand to others)
- [ ] Calibration based on first month of operational drafts

---

## Next Steps

1. **Archive this specification**: Store in version control for Phase 4 reference
2. **Assign Phase 4 owner**: Identify communications lead who will own implementation
3. **Maintain communications playbook**: Document manual process + emerging templates
4. **Collect pilot feedback**: What messages worked? What confusing?
5. **Schedule Phase 4 retrospective**: Oct 2026, review spec + update as needed
6. **Monitor readiness indicators**:
   - Pilot program count (goal: 4+)
   - Message type stability (goal: patterns clear)
   - Template library maturity (goal: 8+ templates, reusable)
   - Team experience level (goal: 6+ months operations)

---

## Relationship to Dashboard & Briefing Agents

**Orchestration Note**: Pilot-Outreach Agent is **downstream** of other agents:

```
Ingestion → Validation → Safety-Ethics → Escalation → Outreach

The Safety-Ethics agent classifies alerts and determines who needs notification.
The Outreach agent ONLY executes notifications already approved by Safety-Ethics.

Outreach does NOT create new alerts or escalations;
it accelerates delivery of decisions already made by Safety-Ethics.
```

---

## Contact & Support

- **Agent Owner** (Future): Communications Lead (TBD)
- **Last Updated**: March 18, 2026
- **Status**: Deferred to Phase 4 (Q4 2026)
- **Activation Date**: Tentative Oct 2026 (subject to process maturity + resource availability)
- **Questions**: See marine-agent-system-overview.md or escalate to Communications Team

