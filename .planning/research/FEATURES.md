# Feature Research — v2.0 "Ingest, Organize, Guide"

**Domain:** Single-user personal secretary (self-hosted, Raspberry Pi, solo career + life management)
**Researched:** 2026-06-15
**Confidence:** HIGH for goal tracking and time-blocking patterns; MEDIUM for LLM payload schema (no dominant standard exists); LOW for AI-driven guidance patterns (product space is maturing fast)

> This file covers v2.0 net-new features only. Existing features (Task CRUD, Calendar sync, Pushover, TTS, daily brief, recurring routines) are documented in the v1 FEATURES.md and are treated as dependencies here.

---

## Category 1: Import Payload (LLM-produced structured ingest)

The user talks to an external LLM about goals and plans. The LLM emits a JSON payload. The secretary validates it, shows a preview, and on confirm writes Goals/Tasks/Routines into the DB.

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Versioned JSON schema | Without a version field, every schema change is a breaking ingest failure | LOW | `"schema_version": "1.0"` at root; validate on receipt |
| `goals` entity in payload | The whole v2 value prop is first-class goals; they must be importable | LOW | See fields below |
| `tasks` entity in payload | Tasks are already first-class; import must link them to goals | LOW | Reuse existing Task model; add `goal_id` FK |
| `routines` entity in payload | User explicitly said "add recurring events for recurring things" | MEDIUM | Map to existing Routine model; validate cron fields |
| Preview before commit | User must see exactly what will be created before it hits the DB | LOW | Diff-style: "3 goals, 7 tasks, 2 routines will be created" |
| Validation with field-level errors | An LLM will occasionally emit malformed JSON; fail loudly with specific errors | LOW | Pydantic models on the FastAPI endpoint; return 422 with detail |
| Paste or file upload | Both paths needed — paste for quick use, file upload for long payloads | LOW | Textarea + `<input type="file">` in UI |
| Idempotent ingest (no duplicate goals) | Re-importing the same payload should not create duplicates | MEDIUM | Match on `external_id` or `(title, type)` pair; upsert not insert |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Documented LLM prompt shipped with the app | User doesn't have to craft their own schema-compliant prompt | LOW | Prompt stored in `/docs/` or visible in UI; versioned alongside schema |
| `milestones` array on each goal | Goals with intermediate checkpoints are more motivating and trackable than open-ended goals | MEDIUM | Milestone: `{title, target_date, done: bool}` |
| `habits` entity in payload | Habits (daily/weekly behaviors) are distinct from tasks (one-shot work items) and routines (system-level cron jobs) | MEDIUM | Habit: `{title, frequency, goal_id}` — maps to recurring tasks with a habit flag |
| Partial ingest with conflict report | "2 of 3 goals imported; 1 skipped — title conflicts with existing goal. Review?" | HIGH | Requires diff logic; defer until after basic ingest ships |
| `notes` / `context` field on goals | User pastes background context (e.g. "I want to switch careers to ML") — stored but not acted on until AI milestone | LOW | `context: string` on goal; rendered in goal detail view |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Built-in LLM chat or API key | Adds cost, dependency, and key management to v2.0; user already has an LLM | External LLM, user pastes output — cleaner, zero ongoing cost |
| Streaming ingest (real-time LLM output parsing) | Complexity with no benefit; the payload is finalized before upload | Paste/upload of complete payload only |
| Auto-ingest from email or webhook | Unreviewed writes are dangerous; the preview step is critical | Always gate on explicit user confirm |
| Schema auto-evolution / AI schema repair | Adds black-box behavior; if schema breaks, user should know | Strict validation + clear error messages |
| Support for CSV / iCal / other formats | Scope creep; the LLM prompt can emit JSON — no need for more parsers | JSON only for v2.0 |

### Recommended Payload Schema Fields

**Goal:**
```json
{
  "external_id": "string (stable LLM-assigned ID for upsert)",
  "title": "string",
  "type": "career | life | health | learning | financial",
  "description": "string",
  "context": "string (background prose)",
  "target_date": "ISO 8601 date | null",
  "milestones": [
    { "title": "string", "target_date": "ISO 8601 date | null" }
  ]
}
```

**Task (extends existing model):**
```json
{
  "title": "string",
  "description": "string | null",
  "due_date": "ISO 8601 date | null",
  "priority": "high | medium | low",
  "goal_id": "external_id reference | null",
  "estimated_minutes": "integer | null"
}
```

**Routine (extends existing model):**
```json
{
  "name": "string",
  "cron": "cron expression",
  "goal_id": "external_id reference | null",
  "notes": "string | null"
}
```

**Habit:**
```json
{
  "title": "string",
  "frequency": "daily | weekdays | weekly",
  "goal_id": "external_id reference | null"
}
```

---

## Category 2: Goals (first-class entity with progress tracking)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Goal CRUD (create/edit/archive) | Can't track what you can't manage | LOW | Archive, not delete — preserve history |
| `type` field (career, life, health, etc.) | Different goal types need different views and metrics | LOW | Enum; drives filtering in UI |
| `target_date` field | Without a deadline, a goal is a wish | LOW | Optional but strongly encouraged by UX |
| Task-to-goal linkage | Tasks are the unit of work toward a goal; linkage closes the loop | LOW | `goal_id` FK on Task; already exists as a model change |
| Progress % from linked task completion | Most important single metric — "what % of the work toward this goal is done" | MEDIUM | `completed_tasks / total_linked_tasks`; recalculate on task status change |
| Milestone tracking (done/not done) | Intermediate checkpoints make long goals feel tractable | MEDIUM | `Milestone` child table with `goal_id`, `done`, `target_date` |
| Goals view in UI | Users need a dedicated place to see all goals and their progress | LOW | List + detail panel; distinct from task list |
| Goal shown on task detail | When editing a task, user can see and change its parent goal | LOW | Dropdown on task form |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Milestone-based progress (not just task %) | Milestones map to real-world outcomes ("shipped feature X", "got cert Y"); more meaningful than task counts | MEDIUM | Progress = milestone completion + task completion blended or selectable |
| Goal summary in daily brief | Every morning: "You are 40% toward 'Get ML cert' — 2 tasks due this week" — keeps goals top of mind | LOW | Extend existing daily brief APScheduler job |
| Weekly goal digest (Friday or Sunday) | Separate from daily brief; surfaces what moved and what stalled | MEDIUM | New APScheduler job; Pushover + optional TTS |
| Stall detection | If a goal has had no task completions in N days, surface it as "stalled" | MEDIUM | Background job compares `last_task_completed_at` vs threshold |
| Goal-linked routine tagging | Routines (e.g. "daily coding practice") show as contributing to a goal | LOW | `goal_id` FK on Routine — same as Task; display in goal detail |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Habit streaks / streak counters | Break on one missed day, cause abandonment not motivation; gamification for a solo tool adds no value | Show completion frequency as a % over last 30 days instead |
| OKR scoring (0.0–1.0 confidence scores, key result scoring) | Business-grade overhead for a personal tool; correct for teams, wrong for one person | Simple milestone done/not-done + task % is sufficient |
| "Social accountability" (share goals, public streaks) | Solo self-hosted app; no other users; any sharing feature is dead weight | n/a — single-user hard constraint |
| Complex weighted scoring formulas | Requires calibration and feels arbitrary when solo | Flat % from tasks + milestone binary |
| Goal templates library | Nice to have but the LLM prompt already generates structure | Defer until patterns emerge from real use |

---

## Category 3: Day Auto-Organization (time-blocking with approval)

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Respects existing calendar events as fixed blocks | Any time-blocker that ignores meetings is useless | LOW | Read from synced `CalendarEvent` table; treat as immovable |
| Proposes blocks only in free time | Scheduler must compute gaps between fixed events | MEDIUM | Simple gap-finding algorithm: sort events by start, find intervals |
| Approve / reject each proposed block | The "suggest-then-approve" contract; never silent-commit | LOW | UI shows proposed blocks; user clicks Accept/Edit/Reject per block |
| Block duration from task `estimated_minutes` | Without an estimate the block length is a guess | MEDIUM | Default to 30 min if no estimate; prompt user to add estimates during ingest |
| Priority ordering in proposals | High-priority tasks fill earlier free slots | LOW | Sort pending tasks by priority + due_date before fitting into gaps |
| One-day planning scope | Plan today only; forward planning adds complexity with limited benefit | LOW | Always plan for the current day only in v2.0 |
| Write approved blocks to calendar (or local only) | After approval, the day plan needs to be somewhere visible | MEDIUM | Option A: write to Google Calendar (requires write scope — complex); Option B: local plan stored in DB, shown in Today view only. Start with Option B. |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Energy-aware ordering (morning = deep work, afternoon = admin) | Aligns hard tasks with peak focus hours; scientifically backed | MEDIUM | User configures "peak hours" (e.g. 9am–12pm); deep work tasks fill those slots first |
| Buffer blocks between tasks | Prevents back-to-back cognitive load; gap analysis inserts 10–15 min buffer after each block | LOW | Parameterize buffer duration in settings; default 10 min |
| Goal-prioritized filling | Given two equal-priority tasks, fill the one linked to the most-stalled goal first | MEDIUM | Requires stall score from Goal entity; depends on Category 2 stall detection |
| Re-plan button (mid-day reschedule) | Morning plan is stale by noon; one-click re-proposal for remaining time | MEDIUM | Same algorithm, restricted to remaining free slots after current time |
| Task estimate prompting during proposal | "This task has no estimate — how long?" inline in the plan proposal UI | LOW | Only prompt for tasks in the proposal; don't batch-prompt all tasks |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Silent auto-commit (write to calendar without approval) | Kills trust immediately; one wrong write to a shared calendar is catastrophic | Always require explicit user confirm before writes |
| Multi-day forward planning | Today's plan is stale by end of day; next week's plan is fiction | Plan one day at a time; re-plan daily |
| Google Calendar event write in v2.0 | Requires Google Calendar write scope (separate OAuth permission), conflict resolution, and undo flow — high complexity | Store approved plan locally in DB; render in Today view. Defer calendar write to v2.1. |
| ML-based energy modeling from historical data | Requires weeks of data collection before useful; over-engineered for day 1 | Simple user-configured "peak hours" preference in settings |
| Pomodoro auto-splitting (break blocks into 25/5 chunks) | Forces a rigid technique on the user | User sets block sizes; no forced split |
| Blocking out personal time / leisure | Auto-scheduler should plan work and tasks; personal time is the user's domain | Only propose blocks for tasks on the task list |

---

## Category 4: Goal-Guided Proactive Guidance

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Goal progress in daily brief | If you show a daily brief, goal status belongs in it — missing = the brief is incomplete | LOW | Extend existing brief job: add "Goal snapshot" section showing each goal's % |
| "Next best task" surface | When a user opens the Today view, the single most important task to work on next should be obvious | LOW | Surface highest-priority task linked to most-urgent or most-stalled goal; no ML needed |
| Stalled goal alert | If a career goal has had zero progress for 7 days, push a Pushover notification | MEDIUM | APScheduler weekly job; compare `last_task_completed_at` on goals |
| Goal detail view | Users must be able to drill into a goal to see milestones, linked tasks, and progress timeline | LOW | Static page: goal info + milestone list + linked task list |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Weekly digest (Friday 5pm or Sunday 8pm) | Structured weekly review is the highest-ROI personal productivity habit (GTD); automates the "Get Current" phase | MEDIUM | New APScheduler job; Pushover + Google Home TTS; content: tasks completed, milestones hit, stalled goals, upcoming week |
| "Next best task" respects goal urgency | NBA logic: `(priority × goal_urgency × days_until_due_penalty)` — still simple, no ML | MEDIUM | Scoring function in Python; testable; no external dependency |
| Milestone completion celebration | When a milestone is marked done, fire a brief TTS announcement + Pushover ("Milestone hit: Completed course module 3") | LOW | Event hook on milestone update endpoint; reuses existing TTS + Pushover infrastructure |
| Goal context in daily brief (not just %) | "Your top career goal 'ML transition' is 40% done — task due today: Complete numpy tutorial" — actionable, not just a number | LOW | Extend brief template; pick the single most-urgent goal-linked task per goal |

### Anti-Features

| Feature | Why Avoid | Alternative |
|---------|-----------|-------------|
| Daily "motivational" messages or affirmations | Noise after day 3; no one reads them | Only surface goal content when there is something actionable |
| Push notifications for every task completion | 64% of users disable notifications when >5/week; completion events are too frequent | Notify on milestone completions only; daily/weekly digests for task counts |
| "Coaching" or advice generation (LLM-driven) | Requires API key, cost, latency, and prompt engineering in v2.0 | Static templates: "You have N tasks linked to this goal due this week" |
| Habit streak UI / consecutive day counters | Streaks punish misses and cause abandonment; wrong incentive structure for career goals | Show "completed X of Y times this month" as a frequency, not a streak |
| Gamification (points, badges, levels) | Adds no value for a solo self-aware user; creates perverse incentives (checking tasks for points, not doing work) | Plain numeric progress; let the work speak |
| Weekly review that requires user input | If the review requires the user to fill in fields, they will skip it | Fully automated digest computed from existing task/milestone data; zero input required |
| Notification spam for "you haven't logged today" | Intrusive; treats the tool as a habit app | Only nudge when a goal is genuinely stalled (7+ days no progress) |

---

## Feature Dependencies

```
Import Payload
    └──requires──> Goals entity (DB model + API)
    └──requires──> Task model extended with goal_id FK
    └──requires──> Routine model extended with goal_id FK
    └──enables──>  Habit entity (new; maps to recurring task with habit flag)

Goals entity
    └──requires──> Task model extended with goal_id FK
    └──enables──>  Progress % calculation
    └──enables──>  Stall detection job
    └──enables──>  Goal-guided NBA logic
    └──enables──>  Day auto-organize (goal urgency scoring)

Milestone sub-entity
    └──requires──> Goals entity
    └──enables──>  Milestone-based progress
    └──enables──>  Milestone completion celebration (TTS + Pushover)

Day Auto-Organize
    └──requires──> Goals entity (for goal-priority sorting)
    └──requires──> CalendarEvent (existing — read-only, gap detection)
    └──requires──> Task.estimated_minutes (new field on Task model)
    └──requires──> User "peak hours" setting (new settings field)
    └──enables──>  Plan view in Today UI

Proactive Guidance / Weekly Digest
    └──requires──> Goals entity + progress %
    └──requires──> Stall detection (background job)
    └──requires──> Existing: APScheduler, Pushover, TTS
    └──enhances──> Daily brief (Goal snapshot section)
```

### Dependency Notes

- **Import Payload requires Goals entity:** Goals must exist as a DB model with full CRUD before ingest can write to them. Build Goals entity first.
- **Day Auto-Organize requires Task.estimated_minutes:** Without duration estimates, block sizing is guesswork. Add this field to Task in the same phase as auto-organize.
- **Weekly Digest requires stall detection:** The digest is only useful if it can surface stalled goals. Stall logic (background job) must ship in the same phase as the digest.
- **Milestone celebration enhances existing TTS + Pushover:** No new infrastructure needed — just a new event hook. Can ship in the same phase as Goals.

---

## MVP for v2.0 (Phase Groupings)

### Phase 8 — Foundation: Goals entity + Import contract

Must ship together because the import is the primary way goals get created.

- Goals DB model (title, type, description, context, target_date, archived)
- Milestone child model (title, target_date, done, goal_id)
- Task.goal_id FK + Task.estimated_minutes field (Alembic migration)
- Routine.goal_id FK (Alembic migration)
- Habit model (recurring task with habit flag)
- Versioned JSON import schema v1.0
- Documented LLM prompt (in `/docs/` or in-app)
- Ingest endpoint: validate → preview response → confirm → write
- Paste + file upload UI for ingest
- Basic Goals list + detail view in UI
- Progress % from linked task completion (computed on read, not stored)

### Phase 9 — Intelligence: Day Auto-Organize + Goal Guidance

Can ship as one phase since both depend on Goals entity being stable.

- Gap-finding algorithm (free slots between CalendarEvents)
- Priority + goal-urgency sort for task fitting
- Peak hours user setting
- Buffer block parameterization
- Propose-then-approve UI in Today view
- Local plan storage (no Google Calendar write yet)
- "Next best task" surface on Today view
- Goal snapshot section in daily brief
- Stall detection APScheduler job
- Stalled goal Pushover notification
- Weekly digest APScheduler job (Friday or Sunday)
- Milestone completion celebration hook (TTS + Pushover)

### Phase 10+ — Deferred (not v2.0)

- Google Calendar write for approved plan blocks
- Partial ingest with per-item conflict report
- Re-plan button (mid-day reschedule)
- Goal-guided coaching via LLM API (v3.0 concept)

---

## Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Goals entity + CRUD | HIGH | LOW | P1 |
| Versioned import schema + LLM prompt | HIGH | LOW | P1 |
| Ingest endpoint (validate/preview/write) | HIGH | MEDIUM | P1 |
| Task.goal_id FK | HIGH | LOW | P1 |
| Milestone model + tracking | HIGH | MEDIUM | P1 |
| Progress % from tasks | HIGH | LOW | P1 |
| Goals view in UI | HIGH | LOW | P1 |
| Goal snapshot in daily brief | HIGH | LOW | P1 |
| "Next best task" surface | HIGH | LOW | P1 |
| Day auto-organize (propose + approve) | HIGH | MEDIUM | P2 |
| Peak hours setting | MEDIUM | LOW | P2 |
| Stall detection + nudge | HIGH | MEDIUM | P2 |
| Weekly digest job | HIGH | MEDIUM | P2 |
| Milestone celebration (TTS + Pushover) | MEDIUM | LOW | P2 |
| Re-plan button (mid-day) | MEDIUM | MEDIUM | P3 |
| Partial ingest conflict report | LOW | HIGH | P3 |
| Google Calendar write for plan blocks | MEDIUM | HIGH | P3 |
| Habit streak UI | LOW | LOW | OUT — anti-feature |
| Gamification / points | LOW | MEDIUM | OUT — anti-feature |

---

## Sources

- [Reclaim.ai — Goal Tracker Apps roundup (2026)](https://reclaim.ai/blog/goal-tracker-apps)
- [Morgen AI Planner — suggest-then-approve UX](https://www.morgen.so/ai-planner)
- [RescueTime — Flexible Time Blocking Method](https://blog.rescuetime.com/time-blocking-method/)
- [Todoist — Weekly Review (GTD)](https://www.todoist.com/productivity-methods/weekly-review)
- [Appbot — Push notification anti-patterns 2026](https://appbot.co/blog/app-push-notifications-2026-best-practices/)
- [Trophy.so — Gamification that doesn't backfire](https://trophy.so/blog/productivity-app-gamification-doesnt-backfire)
- [Griply — Goal + task linkage pattern](https://griply.app/faq/best-free-goal-tracking-app)
- [Dotprod — personal productivity JSON format spec (WIP)](https://dotprod.readthedocs.io/en/latest/)
- [Bitrix24 — Time blocking advanced techniques 2026](https://www.bitrix24.com/articles/time-blocking-in-2025-advanced-techniques-for-deep-work-and-peak-productivity.php)

---

*Feature research for: My Secretary v2.0 — Ingest, Organize, Guide*
*Researched: 2026-06-15*
