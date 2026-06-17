# Phase 11: Goal-Guided Guidance - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

The secretary proactively surfaces goal progress in three places:
1. **Daily brief** — a goal snapshot section appended to the existing Pushover + TTS brief.
2. **Today view** — a "next-best-task" sticky banner above the agenda showing the highest-scoring pending task.
3. **Stall nudge** — a proactive Pushover notification when a goal has had no task completions for a configurable threshold (default 7 days); at most one guidance nudge per calendar day.

**Phase requirements:** GUIDE-01, GUIDE-02, GUIDE-03.

**Explicitly out of scope:**
- Weekly goal digest or periodic review emails — not in this phase (partially served by quick task 260615-bse).
- In-app goal-progress chart or dedicated guidance page.
- Voice/Google Home interaction for stall nudges.

</domain>

<decisions>
## Implementation Decisions

### Goal snapshot in daily brief (GUIDE-01)

- **D-01:** All active goals appear in the brief snapshot — every `status=active` goal is included, with no cap. For a personal secretary the list is expected to stay small.
- **D-02:** Each goal entry shows: `{goal title}: {progress %}% — next: {most-urgent task title}`. Matches the roadmap success criterion exactly.
- **D-03:** "Most-urgent linked task" = the pending linked task with the **earliest `due_date`**. Fallback: highest `priority` if no linked task has a due date. Fallback: omit the "next:" suffix if no pending linked tasks exist.
- **D-04:** In TTS speech the goal section is **summarized**: total active goal count + the top 2–3 goals by urgency (closest `target_date`) read aloud. Goals are NOT fully enumerated in TTS to avoid long speech.
- **D-05:** `build_brief_body()` and `build_brief_speech()` in `brief.py` (SYNC service) gain a new goal-snapshot section. `goal_service.py`'s `compute_progress()` is async — a SYNC equivalent is needed in `brief.py` using raw SQL or the same `create_engine`/`sessionmaker` pattern.

### Next-best-task scoring & Today display (GUIDE-02)

- **D-06:** Scoring formula: `score = priority_weight × goal_urgency × due_proximity`
  - `priority_weight`: high=3, medium=2, low=1
  - `goal_urgency`: `1 / max(days_until_goal_target_date, 1)` where days are from today. Tasks with no linked goal get a fixed neutral urgency = **0.5**.
  - `due_proximity`: `1 / max(days_until_task_due, 1)` for tasks with a due date. Tasks with **no due date** get a fixed neutral score = **0.5**.
- **D-07:** A new `GET /guidance/next-best-task` endpoint (or inline in the Today data endpoint — Claude's discretion) returns the single top-scoring pending task (not completed, not a habit).
- **D-08:** The next-best-task surfaces as a **sticky "Focus on:" banner at the top of Today.tsx**, above the agenda. If no pending tasks exist (all completed or none linked to goals), the banner does not render.

### Stall detection mechanics (GUIDE-03)

- **D-09:** Add a `completed_at` nullable `DateTime` column to the `Task` model (new Alembic migration). Set when `completed` flips to `True` in the PATCH /tasks/{id} route. This is the authoritative signal for stall detection.
- **D-10:** Stall = a goal has **no linked task** where `completed_at >= now() - threshold_days`. Goals with zero linked tasks are NOT considered stalled (no work was ever attached).
- **D-11:** Stall threshold is **configurable** — add `stall_threshold_days` (Integer, default 7) to `AppSettings`, exposed on the Settings page alongside work hours.
- **D-12:** The stall nudge Pushover message lists **all stalled goals in one notification**: `"Goal stalled: {title} — {N} days without a completion. Next: {most-urgent task title}."` For multiple stalled goals, each is a bullet line in the same message.
- **D-13:** The stall check runs as an **APScheduler job** — daily at a configurable time (default same as brief, or shortly after — Claude's discretion). It fires at most once per calendar day per the rate-limit gate (D-14).

### Guidance rate-limiting (GUIDE-03)

- **D-14:** Rate limit tracked via a **`last_guidance_sent_date` Date column on `AppSettings`** (nullable). Before firing the stall nudge, check if `last_guidance_sent_date == today`. If so, skip. On fire, set `last_guidance_sent_date = today`.
- **D-15:** Only the **stall Pushover nudge** counts against the once-per-day gate. The daily brief goal snapshot (D-01–D-05) is part of the normal brief and does not consume the guidance slot.

### Claude's Discretion

- Whether next-best-task is a dedicated endpoint or folded into the existing Today/agenda data response.
- Exact APScheduler job ID and time for the stall-check job.
- Visual styling of the "Focus on:" banner in Today.tsx (color, icon, dismiss behavior).
- Whether `GET /guidance/next-best-task` excludes tasks that are already scheduled as `ScheduledBlock` for today (recommended: include them — the banner is about intent, not re-scheduling).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & patterns
- `.planning/research/ARCHITECTURE.md` — overall service patterns; `brief.py` SYNC pattern is the model for `guidance_service.py` (from STATE.md decision: guidance_service must be SYNC).
- `.planning/research/PITFALLS.md` — SQLite ALTER constraints, async/sync service boundaries.
- `.planning/research/STACK.md` — SQLAlchemy 2.0 async, Alembic, Pydantic v2, FastAPI version constraints.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — full text of GUIDE-01, GUIDE-02, GUIDE-03.
- `.planning/ROADMAP.md` §"Phase 11: Goal-Guided Guidance" — phase goal + 3 success criteria.

### Existing code to reuse / extend
- `backend/app/services/brief.py` — SYNC service pattern; add goal snapshot section here (D-05).
- `backend/app/services/goal_service.py` — `compute_progress()` async; needs SYNC equivalent for brief.
- `backend/app/models/goal.py` — `Goal` model with `target_date`, `status`, `tasks` relationship.
- `backend/app/models/__init__.py` — `Task` model; add `completed_at` column (D-09).
- `backend/app/routers/settings.py` + `backend/app/schemas/` — pattern for adding `stall_threshold_days` + `last_guidance_sent_date` to AppSettings (D-11, D-14).
- `backend/app/routers/tasks.py` — PATCH handler where `completed_at` must be set (D-09).
- `frontend/src/pages/Today.tsx` — add the "Focus on:" sticky banner (D-08).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `brief.py` SYNC engine+sessionmaker: exact pattern to replicate for guidance/stall service.
- `goal_service.compute_progress()`: logic reusable; needs a SYNC wrapper for `brief.py` context.
- `AppSettings` ORM row (id=1 singleton): already used for work hours — add `stall_threshold_days` and `last_guidance_sent_date` the same way.
- `PushoverClient` (sync): used in `brief.py` and `celebrate.py` — same import for stall nudge.
- APScheduler job registration pattern: existing `scheduler.py` for stall-check job wiring.

### Established Patterns
- SYNC service in thread pool for APScheduler 3.x (brief.py model — do NOT use async here).
- `AppSettings` columns added as nullable with no server_default to avoid NOT NULL on existing row (Phase 10 precedent).
- `lazy=selectin` on all Goal relationships (Phase 08 decision — required for async SQLAlchemy).

### Integration Points
- `brief.py` → `build_brief_body()` + `build_brief_speech()`: extend with goal snapshot section.
- `routers/tasks.py` PATCH /tasks/{id}: set `task.completed_at = datetime.now(timezone.utc)` when `completed` flips True.
- `frontend/src/pages/Today.tsx`: add "Focus on:" banner above agenda using data from a new API call.
- Settings page: add stall_threshold_days field alongside existing work-hours fields.

</code_context>

<specifics>
## Specific Ideas

- STATE.md open question resolved: stall threshold is configurable in Settings UI (D-11), default 7 days.
- TTS goal summary reads top 2–3 goals only to avoid speech walls (D-04).
- `completed_at` migration needed — this is a forward-looking schema improvement that benefits future phases too.

</specifics>

<deferred>
## Deferred Ideas

- Weekly goal digest / automated Friday review email — not in this phase (partially served by quick task 260615-bse).
- In-app goal-progress chart or dedicated Guidance page.
- Energy-aware scheduling / mid-day re-plan (already in backlog per REQUIREMENTS.md).
- Per-goal custom stall thresholds (D-11 adds one global threshold; per-goal is future).

</deferred>

---

*Phase: 11-goal-guided-guidance*
*Context gathered: 2026-06-17*
