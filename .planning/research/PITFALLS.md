# Pitfalls Research

**Domain:** LLM payload ingest + Goals entity + Day auto-organize + Proactive guidance — added to an existing FastAPI/SQLAlchemy/APScheduler/SQLite/React personal secretary
**Researched:** 2026-06-15
**Confidence:** HIGH (stack-specific; grounded in existing codebase knowledge and verified patterns)

---

## Critical Pitfalls

### Pitfall 1: Re-import Creates Duplicates (Idempotency Not Built In)

**What goes wrong:**
User pastes the same LLM payload twice (accidentally, or after editing the prompt), or the UI re-submits on page refresh. The backend has no duplicate guard, so every ingest call creates a fresh set of goals, tasks, and routines — no dedup, no merge.

**Why it happens:**
"It's just the user" produces a false sense of safety. HTTP POST is not idempotent by default. Pydantic validation passes if the payload is well-formed; it has no concept of "already imported."

**How to avoid:**
- Assign a `payload_hash` to every ingest: `sha256(canonical_json(payload))`. Before writing anything, query for an existing import record with that hash.
- Return `409 Conflict` with a diff of what would have been created vs. what already exists.
- Store an `IngestRecord` table: `id, payload_hash, payload_version, imported_at, status, item_count`. Every preview and every commit writes or updates this record.
- Require an explicit `?force=true` query param to re-import a previously-seen hash.

**Warning signs:**
- Users report doubled tasks or goals after "trying again"
- `SELECT COUNT(*) FROM goals` jumps by the same increment twice
- No `ingest_records` table in the schema

**Phase to address:** Phase 8 (Ingest contract + endpoint) — must be in the endpoint before the first commit path is wired.

---

### Pitfall 2: Destructive Overwrite of Existing Tasks/Goals on Re-import

**What goes wrong:**
Re-import logic uses upsert semantics that overwrite user edits. The user imports a goal, edits its target date manually, then re-imports an updated payload — and the original target date is silently restored.

**Why it happens:**
`INSERT OR REPLACE` / SQLAlchemy `merge()` on a natural key replaces all columns, discarding local changes. "Upsert" sounds safe but is a full replacement unless coded otherwise.

**How to avoid:**
- Distinguish create vs. update explicitly. On re-import of an existing item (matched by `external_id` from the payload), show a diff to the user: "Goal 'Write novel' already exists. Payload wants to set target_date=2026-12-31 but yours is 2026-09-01. Keep yours or override?"
- Never auto-overwrite an item the user has manually edited. Track `user_modified_at` vs. `imported_at` per entity; if `user_modified_at > imported_at`, treat user version as authoritative.
- Ingest endpoint is preview-only; commit requires explicit field-level conflict resolution for any conflict.

**Warning signs:**
- No `user_modified_at` column on goals/tasks
- Ingest uses `session.merge()` unconditionally
- No diff step in the preview UI

**Phase to address:** Phase 8 (Ingest) — data model must include `user_modified_at` and `imported_at` before any write path.

---

### Pitfall 3: Payload Schema Drift (LLM Doesn't Follow the Contract)

**What goes wrong:**
LLMs hallucinate field names, rename keys ("due_date" → "deadline"), add unexpected nesting, or omit required fields. Pydantic validation catches hard mismatches, but "valid JSON with wrong semantics" passes through: a task's priority field gets "urgent" instead of "high", a date arrives as a natural-language string ("next Monday"), or a goal's `linked_task_ids` is a list of names instead of IDs.

**Why it happens:**
The LLM receives a prompt with a schema description but has no runtime enforcement. Different LLM versions (Claude Sonnet 4 vs. 3.5 vs. a future model) interpret the schema differently. Users also modify the prompt.

**How to avoid:**
- Version the schema explicitly: `"schema_version": "1.0"` as a top-level required field. Reject unknown versions with a clear error message referencing the documented prompt.
- Use strict Pydantic models with `model_config = ConfigDict(extra="forbid")` — unknown extra keys are a validation error, not silently ignored.
- Enumerate all allowed values as `Literal` or `Enum` types; reject freeform strings where a constrained set is expected.
- Parse all date fields through a normalizer that handles ISO 8601, YYYY-MM-DD, and common natural-language aliases ("today", "tomorrow") but rejects everything else with a descriptive error surfaced in the preview UI.
- In the preview UI, show raw validation errors line-by-line so the user knows what to fix in the LLM output, not a generic "invalid payload."

**Warning signs:**
- Pydantic models use `model_config = ConfigDict(extra="allow")` or no extra config
- Date fields typed as `str` with no further validation
- No `schema_version` field in the contract

**Phase to address:** Phase 8 (Schema contract + ingest endpoint). The versioned JSON Schema file must exist before the endpoint.

---

### Pitfall 4: Partial Payload Commit Leaves Database in Inconsistent State

**What goes wrong:**
User confirms the ingest. The backend writes 3 goals, 12 tasks, then fails on the 4th routine (e.g., invalid cron expression). The 3 goals and 12 tasks are committed; the 4 routines are not. The next ingest attempt hits the duplicate guard on goals and tasks but tries to create routines again — or skips them because the hash matches and the import is marked "done."

**Why it happens:**
Each entity type is written in a separate loop. Without a wrapping transaction, any mid-loop failure leaves partial state. The ingest hash is set to "complete" at the end, which never executes if an exception occurs mid-way.

**How to avoid:**
- Wrap the entire commit (all goals + tasks + routines) in a single `async with session.begin()` block. Either everything commits or nothing does.
- Set `IngestRecord.status` to `"committed"` only inside the same transaction as the entity writes.
- If a partial import was previously attempted (status `"in_progress"`), show the user what was written and what wasn't, and offer to complete or roll back.

**Warning signs:**
- Commit logic uses multiple `await session.commit()` calls across entity types
- `IngestRecord` has no `status` field or it's always `"done"`
- No integration test that injects a failure mid-commit and checks rollback

**Phase to address:** Phase 8 (Ingest commit path).

---

### Pitfall 5: Goals Data Model — Over-Engineered Progress Tracking

**What goes wrong:**
Progress tracking is designed as a computed field with complex weighting: linked tasks contribute N%, linked routines contribute M%, the goal has sub-goals with their own weights. The computation is expensive, hard to cache, and the weights are arbitrary. Users don't understand why their 80%-complete goal shows 43%.

**Why it happens:**
"Progress tracking" sounds like it needs a formula. The impulse is to compute something meaningful. But for a personal tool, "tasks completed / total tasks linked" is always sufficient, and even that is often wrong (a goal has 1 task done of 10, but the 1 done task was 90% of the work).

**How to avoid:**
- Store progress as a user-supplied `progress_pct INTEGER` (0–100) on the Goal row. The user sets it.
- Optionally show a read-only computed hint: `(completed_tasks / total_linked_tasks * 100)` as a tooltip, not the authoritative value.
- No weighted sub-goal trees, no routine completion percentages. Add complexity only if the user explicitly asks for it.

**Warning signs:**
- `progress_pct` is a column-less computed property in SQLAlchemy
- More than one table is involved in calculating progress
- The schema has a `goal_weights` or `sub_goals` table before v2.0 ships

**Phase to address:** Phase 9 (Goals entity design). Lock the simple model at schema design time.

---

### Pitfall 6: Orphaned Goal–Task Links When Tasks Are Deleted

**What goes wrong:**
User deletes a task (existing TASK-04 requirement). The `goal_task_links` association row still exists but points to a non-existent task. SQLite with FK enforcement disabled (the default) allows this silently. The goal's progress calculation now references a ghost task. The UI crashes or shows wrong counts.

**Why it happens:**
SQLite does not enforce foreign keys unless `PRAGMA foreign_keys = ON` is set per connection. SQLAlchemy's async SQLite setup commonly omits this. Association table rows are orphaned silently.

**How to avoid:**
- Add `PRAGMA foreign_keys = ON` to the SQLAlchemy event listener that runs on every new connection (use `@event.listens_for(engine.sync_engine, "connect")`).
- Define the association table FK with `ondelete="CASCADE"` so deleting a task auto-removes its goal links.
- The same pattern applies to routine links.
- Write a test: create a goal with 2 tasks, delete one task, assert goal link count is 1.

**Warning signs:**
- No `PRAGMA foreign_keys = ON` in the engine setup
- Association table FKs have no `ondelete` clause
- No test exercises the delete-propagation path

**Phase to address:** Phase 9 (Goals data model) — FK cascade must be in the Alembic migration, not added later.

---

### Pitfall 7: Dead Goals — Goals That Are Never Reviewed

**What goes wrong:**
User imports 8 goals in January. By April, 5 are stale (job changed, project cancelled). The UI shows all 8 equally; the "next best action" guidance surfaces actions for dead goals. Over time the system feels irrelevant.

**Why it happens:**
Goals are created with no review cadence built in. There's no prompt, no expiry, no "last reviewed" signal. The data just accumulates.

**How to avoid:**
- Add a `reviewed_at` timestamp to the Goal model. Surface a warning badge in the UI for goals not reviewed in 30 days.
- Add a `status` field: `active | paused | completed | abandoned`. Default is `active`. "Next best action" guidance only surfaces `active` goals.
- The proactive guidance phase should include a weekly "review your goals" nudge (a single Pushover notification, not nagging — once per week max).
- No auto-archival. The user must explicitly change status.

**Warning signs:**
- Goal model has no `status` field
- "Next best action" queries all goals without a status filter
- No `reviewed_at` column

**Phase to address:** Phase 9 (Goals data model) for the columns; Phase 11 (Proactive guidance) for the weekly nudge.

---

### Pitfall 8: Day Auto-Organize Ignores All-Day and Multi-Day Events

**What goes wrong:**
The auto-organize algorithm slots tasks into free time by finding gaps between calendar events. All-day events (birthday, holiday, "Out of office") have no start/end time — they occupy midnight-to-midnight or are represented as date-only objects. The algorithm treats them as having zero duration or crashes on time arithmetic.

Multi-day events (a 3-day conference) appear in the day's event list for all three days but with inconsistent time representation depending on the Google Calendar API response.

**Why it happens:**
Google Calendar returns all-day events as `date` (not `datetime`) objects in the `start` and `end` fields. Code that assumes all events have `start.dateTime` raises `KeyError` on `start.date`-only events.

**How to avoid:**
- Normalize all calendar events at ingest time to an internal representation: `EventBlock(start_dt: datetime | None, end_dt: datetime | None, is_all_day: bool)`.
- All-day events: set `is_all_day=True`, `start_dt=None`, `end_dt=None`. The auto-organize algorithm skips them as free-time blockers but shows them in the day header as context.
- Multi-day events: if the event spans today (start ≤ today ≤ end), treat as an all-day event for today's purposes.
- Test explicitly: feed a payload with one all-day event, one multi-day event, and one timed event; assert the gap-finder returns the correct free windows.

**Warning signs:**
- Calendar event model stores `start_time` as `datetime` with no `is_all_day` boolean
- Auto-organize code accesses `event.start_time` without a null check
- No test for all-day or multi-day events in the auto-organize logic

**Phase to address:** Phase 10 (Day auto-organize) — normalization must happen before the gap-finding algorithm is written.

---

### Pitfall 9: DST Transition Corrupts Time-Block Suggestions

**What goes wrong:**
Auto-organize computes free time windows in naive local time. When clocks fall back (e.g., 2:00 AM → 1:00 AM), a naive 1-hour window from 1:00–2:00 occurs twice. Time blocks suggested in that window are either off by an hour or scheduled in the ambiguous hour. When clocks spring forward, a 1-hour gap disappears entirely and the algorithm may suggest a block that doesn't exist.

**Why it happens:**
Python's `datetime` arithmetic on naive local datetimes is correct for standard time but breaks at DST transitions. `datetime(2026, 11, 1, 1, 30) + timedelta(hours=1)` returns `02:30` when the real wall clock jumped back to `01:30`.

**How to avoid:**
- Store all datetimes as UTC in the database. Convert to local time only for display.
- All auto-organize computation is done in UTC. Convert user's "8 AM–6 PM work window" to a UTC range at request time using `zoneinfo.ZoneInfo` and the Pi's configured timezone (store in settings, not derived from OS locale).
- Use `datetime.now(tz=ZoneInfo("Europe/London"))` not `datetime.now()`. Naive datetimes are banned from the auto-organize code paths.

**Warning signs:**
- `datetime.now()` (no tz argument) appears in scheduler or auto-organize code
- Time windows stored as `TIME` columns (no date, no timezone)
- Tests use hardcoded naive datetimes and pass, masking the bug

**Phase to address:** Phase 10 (Day auto-organize) and Phase 9 (Goals/Tasks date fields) — UTC-everywhere must be established before time arithmetic.

---

### Pitfall 10: Recurring Task Expansion Floods the Auto-Organize Plan

**What goes wrong:**
Auto-organize sees recurring tasks as "needs a time block today." If the user has 5 recurring tasks (morning routine, exercise, reading, etc.), the algorithm tries to slot all 5 every day, leaving no room for ad-hoc or goal-linked tasks. The resulting plan is always the same and feels mechanical.

**Why it happens:**
Recurring tasks generate a new instance each day. The auto-organize query pulls all pending tasks for today including all recurring instances. There's no priority layering between "routine" and "goal-driven" work.

**How to avoid:**
- Distinguish recurring task instances from one-off tasks in the auto-organize input. Recurring tasks from established routines occupy their designated time slot (they are fixed anchors, not floating blocks). Only goal-linked and one-off tasks are floated.
- Expose a boolean `is_time_anchored` on tasks that APScheduler-generated routine instances set to `True`. Auto-organize treats anchored tasks like calendar events — they anchor the plan, not fill it.
- Limit floating tasks to N per day (configurable, default 3). Surface the rest as "backlog."

**Warning signs:**
- Auto-organize input query: `WHERE status='pending' AND due_date=today` with no distinction between recurring and one-off
- No `is_time_anchored` concept in the task model

**Phase to address:** Phase 10 (Day auto-organize input model).

---

### Pitfall 11: Suggested Plan Goes Stale When Calendar Changes

**What goes wrong:**
User approves an auto-organized day plan at 8 AM. At 10 AM a meeting is added to Google Calendar. The approved plan now has two overlapping blocks (the new meeting and the task block that was scheduled in that slot). The UI shows the approved plan without warning that it's outdated.

**Why it happens:**
The approved plan is stored as a snapshot. The live calendar is polled every 5 minutes but the plan is not re-validated against new events.

**How to avoid:**
- After storing an approved `DayPlan`, maintain a `valid_through` timestamp (default: `now + 2 hours`).
- On plan display, re-check whether any stored block overlaps a calendar event added since plan approval. If yes, show a banner: "Your plan may be outdated — a new calendar event conflicts with your 2 PM block."
- Do not auto-revise the plan. Let the user decide to re-organize or dismiss the warning.
- The plan staleness check is a read-only comparison; no write, no APScheduler job needed — run it at render time on the frontend via a cheap API call.

**Warning signs:**
- `DayPlan` table has no `generated_at` or `valid_through` column
- Frontend renders the stored plan without fetching current calendar events for comparison

**Phase to address:** Phase 10 (Day auto-organize commit + display).

---

### Pitfall 12: Double-Commit of the Suggested Plan

**What goes wrong:**
User clicks "Approve" on the day plan. The request is slow (Pi under load). User clicks again. Two `DayPlan` rows are created for the same date. Subsequent queries return either or both, producing duplicate blocks in the UI or conflicting data.

**Why it happens:**
The "Approve" button is not disabled after the first click. The backend does not enforce one plan per date.

**How to avoid:**
- Add a `UNIQUE` constraint on `(plan_date, user_id)` in the `day_plans` table (even for single-user, enforces the invariant at DB level).
- On 409 from the backend, return the existing plan — treat it as an idempotent upsert from the UX perspective.
- Disable the Approve button in React immediately on click (set `isSubmitting = true`), re-enable on error.

**Warning signs:**
- No unique constraint on `day_plans.plan_date`
- "Approve" button remains clickable after submission

**Phase to address:** Phase 10 (Day auto-organize schema + UI).

---

### Pitfall 13: APScheduler Job Duplication When Adding New Job Types (v2.0)

**What goes wrong:**
v2.0 adds new APScheduler jobs (e.g., "daily goal check" or "weekly goal review nudge"). The startup hook calls `scheduler.add_job(...)` without `replace_existing=True`. Every Pi restart or service redeploy adds another copy of the job. By day 7, the goal check fires 7 times per day.

**Why it happens:**
The existing codebase has this pattern for some jobs, but adding new jobs under time pressure leads to missed `id=` / `replace_existing=True`. There is no audit log of active jobs.

**How to avoid:**
- Enforce a project convention (document in CLAUDE.md): every `add_job` call MUST include `id="<descriptive_snake_case_name>"` and `replace_existing=True`.
- At startup, log `[scheduler] existing jobs: {[j.id for j in scheduler.get_jobs()]}` before adding any new ones.
- Add a smoke test: start the scheduler twice in the test harness, assert `len(scheduler.get_jobs())` equals the expected count (not double).

**Warning signs:**
- Any `add_job` call without an explicit `id=` argument
- Job count in APScheduler DB grows after restarts

**Phase to address:** Every phase that adds a new APScheduler job (Phase 9 for goal checks, Phase 10 for plan validation, Phase 11 for nudges).

---

### Pitfall 14: Alembic Migration Ordering With New Tables Added to Existing Schema

**What goes wrong:**
v2.0 needs new tables: `goals`, `goal_task_links`, `ingest_records`, `day_plans`. A developer creates a migration that adds these tables, but the migration's `down_revision` is wrong — it points to a stale head or to a migration that hasn't been applied on the Pi yet. Running `alembic upgrade head` on the Pi either fails ("target database is not up to date") or skips the new migration silently.

The inverse failure: a developer adds a new SQLAlchemy model and forgets to create a migration at all, relying on `metadata.create_all()` that no longer exists in this codebase (by policy: the app does NOT call `create_all`).

**Why it happens:**
On a branching workflow, two developers (or two separate Claude sessions) each create a migration from the same `head`, producing a branched migration history. On a solo workflow, the migration is simply forgotten after the model is defined.

**How to avoid:**
- After defining any new SQLAlchemy model, immediately run `alembic revision --autogenerate -m "add <table>"` and review the generated file. Do not merge model changes without a matching migration.
- Before pushing, run `alembic heads` to confirm there is exactly one head. If there are two, create a merge migration: `alembic merge -m "merge heads" <rev1> <rev2>`.
- The Pi redeploy command (`alembic upgrade head`) is already in the project's documented redeploy steps — keep it there, run it every deploy.
- Add a startup assertion in FastAPI: compare `alembic current` vs. `alembic heads`; if behind, log a CRITICAL warning (not a crash — the app should still start).

**Warning signs:**
- `alembic heads` returns more than one revision
- A new model class exists in `models.py` but `alembic history` shows no corresponding migration
- `create_all` appears anywhere in the v2.0 codebase

**Phase to address:** Phase 8 (first new table) — establish the migration checklist before any new schema lands.

---

### Pitfall 15: Trust Boundary of "The User's Own LLM Output"

**What goes wrong:**
Because the payload originates from the user's own LLM session, it's treated as trusted. Validation is relaxed or skipped for "convenience." Malformed or adversarially crafted payloads (even unintentionally — the user copied the wrong JSON block) slip through: cron expressions that run every second, task titles with 10,000 characters, goal descriptions containing template injection strings that appear in Pushover messages.

**Why it happens:**
The mental model "it's just my data" maps to "I trust it." But the attack surface is real: payload from clipboard can include extra content, LLM hallucinated data can be structurally valid but semantically wrong, and a future feature might expose a public ingest URL.

**How to avoid:**
- Treat the ingest endpoint the same as any external API input: validate all fields, enforce length limits (`title: max 255 chars`, `description: max 2000 chars`), sanitize strings before they appear in notifications.
- Validate cron expressions before storing: use `CronTrigger.from_crontab(expr)` in a try/except; reject invalid expressions.
- Numeric bounds: task priority must be one of `["high", "medium", "low"]`; goal `progress_pct` must be 0–100; linked IDs must resolve to existing records.
- Cap total items per ingest: max 20 goals, 100 tasks, 20 routines. Reject payloads over these limits with a clear error.

**Warning signs:**
- Ingest models use `str` with no `max_length` constraint
- Cron expression from payload stored without validation
- No field-length test in the ingest test suite

**Phase to address:** Phase 8 (Ingest schema + validation).

---

### Pitfall 16: Proactive Guidance Becomes Nagging

**What goes wrong:**
The system sends a "have you reviewed your goals?" nudge every day. Then a daily priority suggestion. Then a weekly summary. Then a reminder that a goal deadline is approaching. The user starts dismissing Pushover notifications without reading them — the secretary becomes noise.

**Why it happens:**
Each nudge type is added independently and seems reasonable in isolation. There's no global rate limit on guidance notifications.

**How to avoid:**
- Define a notification budget: maximum 1 guidance-type Pushover message per day (distinct from task reminders and the daily brief, which are expected). Guidance nudges share one slot.
- Implement a `last_guidance_sent_at` timestamp in settings. Any guidance notification skips if `last_guidance_sent_at > now - 24h`.
- The weekly goal review nudge is the highest-priority guidance notification; if it's been sent this week, suppress all other guidance for the week.
- Never add a new proactive notification type without auditing the total daily notification count.

**Warning signs:**
- Multiple APScheduler jobs that fire Pushover messages on independent schedules with no coordination
- No `last_guidance_sent_at` field in settings
- Adding a new nudge type in a phase without auditing existing nudge frequency

**Phase to address:** Phase 11 (Proactive guidance) — establish the budget before the first nudge is implemented.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Skip `IngestRecord` table, validate-then-write in one step | Simpler code | No audit trail; re-import crashes or silently duplicates | Never — log the ingest |
| Store datetimes as naive local time | Avoids timezone boilerplate | DST bugs; plan suggests wrong times twice per year | Never for time-block data |
| Progress as computed property (task completion %) | No UI input needed | Complex queries; meaningless for non-uniform tasks | Never; use user-supplied int |
| Skip `PRAGMA foreign_keys = ON` | Fewer connection events | Silent orphaned rows; ghost task links in goals | Never; cheap to add |
| Use `add_job` without `id=` and `replace_existing=True` | Marginally less code | Job duplication after restarts | Never; enforced by convention |
| All-day events treated as having `start_time=00:00` | Simpler event model | Auto-organize blocks midnight–midnight as "busy" | Never; use `is_all_day` flag |
| Single `session.commit()` per entity type in ingest | Easier to debug partial results | Inconsistent DB state on mid-commit error | Never in production path |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Google Calendar API — all-day events | Access `event['start']['dateTime']` unconditionally | Check for `'dateTime'` key first; fall back to `'date'` and set `is_all_day=True` |
| SQLite + SQLAlchemy async — FK enforcement | FK constraints silently ignored | Add `PRAGMA foreign_keys = ON` via `@event.listens_for(engine.sync_engine, "connect")` |
| APScheduler 3.x + FastAPI async | Calling async functions from BackgroundScheduler thread | Use `AsyncIOScheduler` or synchronous job functions only; never `await` inside a BackgroundScheduler job |
| Pydantic v2 ingest models | `extra="allow"` lets schema drift pass validation | `model_config = ConfigDict(extra="forbid")` for all ingest models |
| LLM payload cron fields | Store raw string from payload | Validate with `CronTrigger.from_crontab()` before storing; reject invalid expressions |
| Alembic + existing prod DB | Autogenerate migration includes tables already on the Pi | Always run `alembic current` on the Pi before deploying a new migration; inspect generated files |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Progress recalculated via JOIN on every goal list load | Goal list page slow; Pi CPU spikes | Store as `progress_pct INT` on goal row; update on task complete | > 50 linked tasks |
| Auto-organize fetches all tasks (including completed) | Suggest-plan is slow; includes stale tasks | Filter: `status='pending' AND (due_date IS NULL OR due_date <= today + 7)` | > 500 historical tasks |
| Day plan staleness check fetches all calendar events | Checking plan validity is slow | Cache calendar events in memory with 5-min TTL matching the existing sync interval | Always a risk on Pi |
| Ingest validates and writes large payloads synchronously | Ingest endpoint times out (30s+) on 100-task payload | Cap payload at reasonable limits (20 goals, 100 tasks); write in batches with `session.flush()` | Payloads > 50 items |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Ingest endpoint unauthenticated (Tailscale = trusted) | If Tailscale node is compromised or shared, arbitrary data is written | Add the existing `WEBHOOK_SECRET` pattern or a basic API key header to the ingest endpoint |
| Cron expressions from payload executed without validation | Malformed cron causes APScheduler crash; "* * * * * *" runs every second | Validate with `CronTrigger.from_crontab()` before storing |
| Long strings from payload stored then rendered in Pushover/TTS | 10k-char title floods notification; TTS hangs | Enforce `max_length` on all string fields in ingest Pydantic models |
| `DayPlan` contains task/event details written to disk | Not a risk today; risk if export feature added later | No action now; note it |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Preview shows raw JSON diff | Too technical; user can't evaluate what will be created | Preview shows human-readable card list: "3 goals, 12 tasks, 4 routines — here's what will be added" |
| Approve button with no loading state | User double-clicks; plan double-committed | Disable button immediately on click; show spinner; re-enable on error |
| Goal guidance surfaces for all goals including abandoned ones | Irrelevant suggestions; feels broken | Filter all guidance queries by `status='active'` |
| Auto-organize produces a plan with no free time | User feels trapped; rejects the plan | Cap task blocks at 80% of available time; always leave 20% unscheduled |
| Validation error from ingest shows Python traceback | Confusing; unprofessional for a personal tool | Return structured `{"errors": [{"field": "tasks[2].due_date", "message": "..."}]}` from the endpoint |

---

## "Looks Done But Isn't" Checklist

- [ ] **Ingest idempotency:** Re-submitting the same payload returns 409, not a second set of rows
- [ ] **Ingest rollback:** Injecting a failure mid-commit leaves zero new rows (all-or-nothing)
- [ ] **Orphaned links:** Deleting a task removes its `goal_task_links` rows (test with `COUNT(*)`)
- [ ] **FK enforcement:** `PRAGMA foreign_keys = ON` is set; verify with `SELECT * FROM pragma_foreign_key_list('goal_task_links')`
- [ ] **All-day events:** Auto-organize with an all-day event in the calendar produces a valid plan (no crash, no midnight block)
- [ ] **APScheduler dedup:** Service restarted twice; `len(scheduler.get_jobs())` unchanged
- [ ] **Migration completeness:** Every SQLAlchemy model added in v2.0 has a corresponding Alembic migration; `alembic heads` returns exactly one head
- [ ] **Plan double-commit:** Clicking Approve twice returns 409 on the second request
- [ ] **Naive datetime guard:** `grep -r "datetime.now()" backend/` returns zero results in business logic (only in tests with explicit UTC mock)
- [ ] **Guidance budget:** Two guidance nudges cannot fire on the same day; `last_guidance_sent_at` is checked before every guidance push

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Duplicate goals/tasks from re-import | MEDIUM | Write a one-off SQL script to deduplicate by `external_id`; add idempotency guard before next import |
| Destructive overwrite of user edits | HIGH | Restore from backup (weekly DB backup to remote); add `user_modified_at` tracking before re-enabling ingest |
| Partial commit leaving inconsistent state | LOW | Delete orphaned rows via SQL (`DELETE FROM goals WHERE ingest_id = X AND ingest_record.status = 'in_progress'`); wrap future commits in transactions |
| APScheduler job duplication | LOW | `scheduler.remove_all_jobs()` then restart; jobs recreated cleanly on next boot |
| Branched Alembic migration history | LOW | `alembic merge -m "merge heads" <rev1> <rev2>`; deploy merge migration to Pi |
| Naive datetime stored in prod | HIGH | Migration to re-parse and convert stored naive datetimes to UTC; may require manual correction of ambiguous DST values |
| Plan double-committed | LOW | `DELETE FROM day_plans WHERE plan_date = X AND id != (SELECT MIN(id) FROM day_plans WHERE plan_date = X)` |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Duplicate creation on re-import | Phase 8 — Ingest endpoint | Test: POST same payload twice; second returns 409 |
| Destructive overwrite on re-import | Phase 8 — Ingest + preview UI | Test: import goal, edit it, re-import, assert user edit survives |
| Payload schema drift / LLM hallucination | Phase 8 — Schema contract | Test: payload with extra fields rejected; unknown `schema_version` rejected |
| Partial commit / inconsistent state | Phase 8 — Ingest commit path | Test: inject failure mid-commit; assert zero rows written |
| Trust boundary / length exploits | Phase 8 — Ingest validation | Test: 10k-char title rejected with 422 |
| Over-engineered progress tracking | Phase 9 — Goals model design | Code review: progress is a plain INT column, not a computed property |
| Orphaned goal–task links | Phase 9 — Goals schema + FK cascade | Test: delete task; assert link row removed |
| Dead goals / no review signal | Phase 9 — Goals model + Phase 11 guidance | UI: badge shown for goals with `reviewed_at > 30d` |
| All-day / multi-day event handling | Phase 10 — Auto-organize input normalization | Test: all-day event in calendar → valid plan, no crash |
| DST timezone corruption | Phase 10 — Auto-organize datetime handling | Test: plan generated around DST transition date |
| Recurring task expansion flooding plan | Phase 10 — Auto-organize input model | Test: 5 recurring tasks → only fixed anchors, not floated |
| Stale plan after calendar change | Phase 10 — Plan display | UI: conflict badge shown when calendar event added post-approval |
| Double-commit of approved plan | Phase 10 — Plan schema + UI | Test: POST approve twice; second returns 409; `UNIQUE` constraint verified |
| APScheduler job duplication (new jobs) | Each phase adding a job | Smoke test: restart scheduler twice, assert job count unchanged |
| Alembic migration ordering | Phase 8 (first new table) | CI check: `alembic heads` returns exactly one revision |
| Proactive guidance becoming nagging | Phase 11 — Guidance budget | Audit: count all Pushover-sending code paths; verify shared `last_guidance_sent_at` gate |

---

## Sources

- [APScheduler 3.x user guide — job stores and replace_existing](https://apscheduler.readthedocs.io/en/3.x/userguide.html)
- [Soft deletion probably isn't worth it — Brandur](https://brandur.org/soft-deletion)
- [SQLite WAL concurrency — SkyPilot blog](https://blog.skypilot.co/abusing-sqlite-to-handle-concurrency/)
- [SQLAlchemy UTC timestamps — mike.depalatis.net](https://mike.depalatis.net/blog/sqlalchemy-timestamps.html)
- [LLM structured outputs in production — Towards AI 2026](https://pub.towardsai.net/llm-structured-outputs-in-production-how-to-stop-json-from-breaking-your-ai-workflow-66703754d341)
- [Structured output isn't reliable output — Rotascale](https://rotascale.com/blog/structured-output-isnt-reliable-output/)
- [Alembic migrations with existing database — GitHub discussion](https://github.com/sqlalchemy/alembic/discussions/1425)
- [Alembic autogenerate docs](https://alembic.sqlalchemy.org/en/latest/autogenerate.html)
- [Pydantic for LLM integration — pydantic.dev](https://pydantic.dev/articles/llm-intro)
- [SQLite3 naive datetime pitfall — Python.org discussion](https://discuss.python.org/t/fixing-sqlite-timestamp-converter-to-handle-utc-offsets/10985)
- [Foreign key constraints — HackerOne blog](https://www.hackerone.com/blog/navigating-waters-foreign-key-constraints-role-update-and-delete)
- [Idempotency in FastAPI — Medium](https://medium.com/@riley.dev/a-simple-way-to-handle-idempotency-in-fastapi-using-idemptx-08d57f0faf88)

---
*Pitfalls research for: My Secretary v2.0 — Ingest, Organize, Guide*
*Researched: 2026-06-15*
