# Phase 10: Day Auto-Organize - Context

**Gathered:** 2026-06-17
**Status:** Ready for planning

<domain>
## Phase Boundary

The user requests a proposed day plan that fills the free time around their calendar events with prioritized pending tasks, reviews and edits the proposed blocks, then approves once — committing the plan to local storage and surfacing it in the Today view.

This phase delivers:
- A **pure planner** that finds free intervals between fixed calendar events within a work window and assigns pending tasks into them (`planner_service.propose_day_plan`, per ARCHITECTURE.md §3).
- A **propose → review → approve** flow: `GET /plan/propose` (no DB write), `POST /plan/approve` (commits), `GET /plan/blocks` (reads committed), `DELETE /plan/blocks/{id}`.
- An **Organize page** for reviewing/editing the proposal, and **Today view integration** showing committed blocks alongside events and tasks with a staleness warning.

**Phase requirements:** PLAN-01, PLAN-02.

**Explicitly out of scope (later phases / future milestones):**
- No Google Calendar write-back — plan is stored locally only (PLAN-02, v2.0 constraint).
- No multi-day / week planning — single target date per propose/approve.
- No goal-guided guidance surfacing (next-best-task, goal snapshot, stall nudges) — Phase 11 (GUIDE-01/02/03).
- No habit/recurrence scheduling into the plan (habits excluded — see D-03).
- No voice/Google Home interaction for planning in this phase.

</domain>

<decisions>
## Implementation Decisions

### Task selection & ordering (PLAN-01)
- **D-01:** Candidate task pool = **tasks due today + overdue** (past-due, still pending). This is the pressing-work set that "organize my day" implies.
- **D-02:** **Backfill** remaining free time with **other pending tasks** (not yet due, or no due date) once due/overdue tasks are placed. Backfill tasks are ordered **after** the pressing set, still by priority → due-date proximity. User can remove them in review.
- **D-03:** **Habits excluded** — `is_habit` tasks are NOT scheduled as blocks. They are driven by their own reminders/recurrence; the day plan stays concrete one-off tasks. (Deferred — see Deferred Ideas for scheduling habits later.)
- **D-04:** Ordering within each tier is **priority → due-date proximity** (carried forward from PLAN-01, already locked). Tier order overall: due/overdue first, then backfill.

### Work window & pacing (PLAN-01)
- **D-05:** Planning hours are **configurable in Settings** — add `work_start` / `work_end` to `AppSettings` (defaults **9:00 / 18:00**), editable on the Settings page. Free time is found only within this window. This supersedes the hardcoded `time(9,0)`/`time(18,0)` defaults in ARCHITECTURE.md §3 (defaults stay the same, but become settings-backed).
- **D-06:** **Pack blocks back-to-back** — place blocks contiguously from the start of each free gap. No auto-inserted buffers/breaks. The user can manually leave gaps in review if desired.
- **D-07:** **Place-if-fits-else-skip** — a task is scheduled only into a free gap large enough for its full `estimated_minutes` (default 30 if unset). No truncation, no splitting across gaps. Tasks that don't fit any gap are left unplaced and surfaced (D-11).

### Approve & re-plan behavior (PLAN-02, ROADMAP criterion 3)
- **D-08:** **First Approve for a date commits.** A subsequent *naked* Approve for the same date is **rejected (HTTP 409)** — honors ROADMAP's "second Approve is rejected, not duplicated." This resolves the ROADMAP-vs-ARCHITECTURE conflict (ARCHITECTURE.md §3 described unconditional delete-then-insert).
- **D-09:** To change an already-approved day, the user invokes an explicit **Re-plan** action that knowingly **replaces** the committed plan (delete existing `ScheduledBlock` rows for the date, then insert the new approved set). The delete-then-insert from ARCHITECTURE.md §3 is the *Re-plan* path, not the default Approve path. Suggested contract: `POST /plan/approve` rejects with 409 when blocks exist for the date unless an explicit replace/re-plan intent is signaled (exact mechanism — flag, separate endpoint, or `?replace=true` — is Claude's discretion; the behavior is what matters).
- **D-10:** **Revisiting Organize for an already-approved date** loads the committed blocks as the starting view in a clear "already approved" state, with a **Re-plan** button to regenerate a fresh proposal. Do NOT silently show a fresh proposal over an approved day.

### Today integration & edge states (PLAN-02, ROADMAP criterion 4)
- **D-11:** **Unplaced/overflow tasks** (didn't fit any gap, per D-07) appear in a distinct **"Didn't fit"** list under the proposal on the Organize page — so the user sees what was dropped.
- **D-12:** **Fully-booked day** (no free time in the work window) → `propose()` returns **no blocks**; Organize shows a clear message ("No free time today — your calendar is full."). Never invent blocks or schedule outside the work window.
- **D-13:** **Staleness warning** — when a calendar event added *after* approval overlaps a committed block, mark the **specific conflicting block(s)** in Today with a visual badge ("conflicts with [event]") and nudge toward Re-plan. Per-block, not a vague day-level banner. Detection happens on read (compare committed blocks against current events for the date).
- **D-14:** **Organize edit affordances** — per block: **remove**, **reorder** (move up/down via tap buttons — NOT drag-drop, for reliable mobile/touch behavior), and **adjust start/duration**. This satisfies ROADMAP criterion 3 ("remove, reorder, or adjust") without fragile drag-and-drop on phone.

### Claude's Discretion
- Exact mechanism for signaling replace vs. reject on approve (flag, `?replace=true`, or separate `/plan/replan` endpoint) — behavior in D-08/D-09 is what's locked.
- Best-fit vs. first-fit gap assignment for D-07 (which gap a task lands in when multiple fit) — planning research may pick; default to first-fit by chronological gap.
- Exact visual styling of the staleness badge, the "Didn't fit" list, buffer-slot vs task-block rendering in Today.
- Whether `GET /plan/propose` excludes already-passed gaps (gaps earlier than "now" on the current day) — recommended yes for today; planner's call.
- Schema/field layout for `ProposedBlock` / `ScheduledBlock` beyond what ARCHITECTURE.md §3 specifies.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture & data model (PRIMARY — most technical decisions already made here)
- `.planning/research/ARCHITECTURE.md` §3 "Day Planner: Pure Service, Proposed vs. Committed Blocks" — the pure `propose_day_plan()` signature, `ProposedBlock` (transient) vs `ScheduledBlock` (persisted) shapes, the four `/plan/*` endpoints, `date_key` indexing, the `0009_create_scheduled_blocks` migration, and frontend integration (Organize page, `Today.tsx` + `agenda.ts` modifications, `usePlan` hook). **Note:** §3's "delete-then-insert on every approve" is overridden by D-08/D-09 — that flow is now the explicit Re-plan path, not the default Approve.
- `.planning/research/PITFALLS.md` — anti-patterns (e.g. SQLite ALTER constraints, async/sync service boundaries).
- `.planning/research/STACK.md` — SQLAlchemy 2.0 async, Alembic, Pydantic v2, FastAPI version constraints.

### Requirements & roadmap
- `.planning/REQUIREMENTS.md` — full text of PLAN-01, PLAN-02 (lines 71-72).
- `.planning/ROADMAP.md` §"Phase 10: Day Auto-Organize" — phase goal + 4 success criteria (the verification target). Criterion 3's "second Approve rejected" and ARCHITECTURE's overwrite are reconciled by D-08/D-09.

### Existing code to reuse / extend (read before modifying)
- `backend/app/models/__init__.py` — `Task` model (note `estimated_minutes`, `priority`, `due_date`, `completed`, `is_habit`, `goal_id`); `AppSettings` (add `work_start`/`work_end` per D-05).
- `backend/app/models/calendar.py` — `CalendarEvent` (`start_dt`, `end_dt`, `all_day`, `start_date`, `cancelled`, `done`) + `UtcDateTime` type decorator. All-day events have `start_date` (string) and no `start_dt`.
- `backend/app/models/goal.py` — `Goal` entity (urgency context; not required for core planner but referenced by roadmap "Depends on Phase 8").
- `backend/app/routers/tasks.py`, `backend/app/routers/events.py` — router/async-session pattern to mirror for `plan.py`.
- `backend/app/routers/settings.py` + `backend/app/schemas/` — pattern for adding `work_start`/`work_end` to settings.
- `backend/migrations/versions/` — Alembic numbered-migration style for `0009_create_scheduled_blocks`.

### Frontend integration points (read before modifying)
- `frontend/src/lib/agenda.ts` — `buildDayItems` / `buildWeekAgenda` composition. Committed blocks must be injected into the timed-items list (accept an optional `blocks` param). Note current `AgendaItem` shape and all-day vs timed handling.
- `frontend/src/pages/Today.tsx` — renders `buildWeekAgenda`; add a plan-blocks fetch and the staleness badge (D-13).
- `frontend/src/components/AgendaItem.tsx` — item rendering to extend for block/buffer/stale styling.
- `frontend/src/types/task.ts`, `frontend/src/types/calendar.ts` — `AgendaItem`, `Task`, `CalendarEvent` TS types to extend for blocks.
- `frontend/src/hooks/useTasks.ts`, `frontend/src/hooks/useCalendarEvents.ts` — data-fetching hook pattern to mirror for `usePlan`.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`CalendarEvent` model + `UtcDateTime`**: the planner reads these for fixed blocks. All-day events have `all_day=True` + `start_date` (no `start_dt`) — treat as context, NOT time blockers (ROADMAP criterion 1).
- **`Task` model**: `estimated_minutes` (nullable → default 30), `priority` enum, `due_date`, `completed`, `is_habit` already exist (migration 0007). The planner filters/sorts on these directly.
- **`AppSettings`**: existing settings table + Settings page — extend with `work_start`/`work_end` (D-05) following the existing `brief_hour`/`brief_minute` pattern.
- **`agenda.ts::buildAgenda`**: the documented frontend composition point for the Today view (ARCHITECTURE.md line 92) — committed blocks fold in here.
- **Async session + router pattern** (`tasks.py`, `events.py`): mirror for `plan.py`.

### Established Patterns
- **SQLAlchemy 2.0 typed `Mapped[...]`** columns; `UtcDateTime` decorator for tz-aware UTC storage; Alembic numbered migrations (`0009_…`).
- **API prefix** `/api/v1` via `settings.api_prefix`.
- **Frontend**: hooks fetch per-resource (`useTasks`, `useCalendarEvents`); pages compose via `agenda.ts`; inline-style components (no CSS framework).
- **Tap-button interactions** preferred over drag (D-14) — phone browser is the primary device per gate tests.

### Integration Points
- New: `backend/app/models/plan.py` (`ScheduledBlock`), `backend/app/schemas/plan.py` (`ProposedBlock`), `backend/app/services/planner_service.py` (pure fn), `backend/app/routers/plan.py` (registered in `main.py`), migration `0009_create_scheduled_blocks`.
- Modified: `AppSettings` model + settings router/schema/page (work hours), `frontend/src/lib/agenda.ts` (+ blocks param), `frontend/src/pages/Today.tsx` (blocks fetch + staleness badge), `AgendaItem.tsx` (block/stale styling).
- New frontend: `frontend/src/pages/Organize.tsx`, `frontend/src/hooks/usePlan.ts`, nav entry in `BottomNav.tsx`.

</code_context>

<specifics>
## Specific Ideas

- The propose endpoint is **read-only** — a hard guarantee, not best-effort. `GET /plan/propose` writes nothing to the DB (ROADMAP criterion 2; explicit test target).
- Staleness is **per-block and specific**: the badge names the conflicting event ("conflicts with [event title]"), not a generic "out of date" message.
- The "Didn't fit" list is a first-class part of the Organize review — dropping work silently is explicitly rejected.
- Reorder is **up/down tap buttons**, deliberately not drag-and-drop, because the phone browser is the primary device.

</specifics>

<deferred>
## Deferred Ideas

- **Scheduling habits into the day plan** — evaluating `is_habit` recurrence to place habits as blocks (D-03 excludes them for now). Revisit if a future phase wants habit-aware planning.
- **Auto-inserted buffers/breaks** between blocks (D-06 packs back-to-back). Could become a Settings toggle later.
- **Splitting or truncating long tasks** across gaps (D-07 skips non-fitting tasks). A future enhancement if "didn't fit" lists get long.
- **Google Calendar write-back** of approved blocks — explicitly out of scope for v2.0 (PLAN-02). Future milestone.
- **Multi-day / week planning** — single date only this phase.
- **Voice / Google Home "organize my day"** trigger — no voice interaction for planning in this phase.
- **Goal-urgency weighting** in task ordering — Phase 11 (GUIDE) territory; this phase orders by priority → due-date only.

</deferred>

---

*Phase: 10-day-auto-organize*
*Context gathered: 2026-06-17*
