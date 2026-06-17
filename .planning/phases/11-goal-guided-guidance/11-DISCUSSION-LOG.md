# Phase 11: Goal-Guided Guidance - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-17
**Phase:** 11-goal-guided-guidance
**Areas discussed:** Goal snapshot in daily brief, Next-best-task scoring & Today display, Stall detection mechanics, Guidance rate-limiting

---

## Goal snapshot in daily brief

| Option | Description | Selected |
|--------|-------------|----------|
| All active goals | Every goal with status=active is included | ✓ |
| Only goals with linked tasks due today/soon | Filter to goals with pending tasks due today or overdue | |
| Top N goals (user-configured cap) | Show at most N goals, ordered by urgency | |

**User's choice:** All active goals

---

| Option | Description | Selected |
|--------|-------------|----------|
| Progress % + most-urgent linked task title | e.g. 'Career growth: 45% — next: Update LinkedIn by Friday' | ✓ |
| Progress % only | Simpler, omits actionable nudge | |
| Progress % + target date + most-urgent task | More info but longer brief text | |

**User's choice:** Progress % + most-urgent linked task title (matches roadmap criterion)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Summarized count only | Read top 2-3 goals by urgency in TTS | ✓ |
| Full read-out matching Pushover text | Every goal read aloud | |
| Omit goals from TTS | Goals in Pushover only, not spoken | |

**User's choice:** Summarized count only (avoid TTS walls)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Earliest due_date among pending linked tasks | Simple, predictable fallback to priority | ✓ |
| Same scoring formula as next-best-task | Consistent but couples features | |
| Highest priority among pending linked tasks | Ignores due dates | |

**User's choice:** Earliest due_date (fallback: highest priority, then omit suffix)

---

## Next-best-task scoring & Today display

| Option | Description | Selected |
|--------|-------------|----------|
| Days until goal target_date, inverted | urgency = 1/max(days_remaining,1); no-goal tasks get 0.5 | ✓ |
| Manual urgency field on Goal | New column + UI required | |
| Goal type weights | Fixed per type, not time-sensitive | |

**User's choice:** Days until goal target_date, inverted

---

| Option | Description | Selected |
|--------|-------------|----------|
| Neutral middle score 0.5 | Tasks without due date can still surface | ✓ |
| Score zero — only show due-date tasks | Simpler but excludes valid tasks | |
| Always lowest priority | Forces below all due-date tasks | |

**User's choice:** Neutral middle score (0.5)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky banner at the top of Today | 'Focus on:' card above agenda | ✓ |
| First item in agenda list, visually differentiated | Risk of getting buried | |
| Sidebar / floating panel | Requires new layout | |

**User's choice:** Sticky banner at top of Today

---

| Option | Description | Selected |
|--------|-------------|----------|
| Banner disappears | No card when task list is empty | ✓ |
| Show 'All done!' message | Banner stays with positive message | |
| Show next goal to work on | Pivots to goal-level nudge | |

**User's choice:** Banner disappears when no pending tasks

---

## Stall detection mechanics

| Option | Description | Selected |
|--------|-------------|----------|
| Add completed_at to Task model | New nullable DateTime, migration required | ✓ |
| Use updated_at as a proxy | No migration but resets on any edit | |

**User's choice:** Add completed_at column (D-09)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Configurable in Settings UI | stall_threshold_days in AppSettings, default 7 | ✓ |
| Hardcoded default (7 days) | Simpler, no UI change | |

**User's choice:** Configurable in Settings UI (resolves STATE.md open question)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Goal title + days stalled | 'Goal stalled: X has had no completions for N days. Next: ...' | ✓ |
| Generic count nudge | '2 goals are stalling' | |
| Claude's discretion | Leave wording to implementation | |

**User's choice:** Goal title + days stalled

---

| Option | Description | Selected |
|--------|-------------|----------|
| One combined notification | All stalled goals in one Pushover message | ✓ |
| One notification per stalled goal | Violates one-per-day rule | |

**User's choice:** One combined notification

---

## Guidance rate-limiting

| Option | Description | Selected |
|--------|-------------|----------|
| AppSettings column: last_guidance_sent_date | Nullable Date, survives reboots | ✓ |
| In-memory flag | Resets on Pi reboot | |
| Separate guidance_log table | Overkill for one-per-day gate | |

**User's choice:** AppSettings column

---

| Option | Description | Selected |
|--------|-------------|----------|
| Stall nudges only | Brief goal snapshot not counted | ✓ |
| Any Pushover mentioning goals | Too restrictive, would block brief | |
| All guidance paths | Overly broad | |

**User's choice:** Stall nudges only count against the gate

---

## Claude's Discretion

- Whether next-best-task is a dedicated endpoint or folded into Today data response
- APScheduler job ID and time for stall-check job
- Visual styling of the "Focus on:" banner
- Whether tasks already scheduled as ScheduledBlock are excluded from next-best-task

## Deferred Ideas

- Weekly goal digest / automated Friday review
- In-app goal-progress chart or dedicated Guidance page
- Per-goal custom stall thresholds
