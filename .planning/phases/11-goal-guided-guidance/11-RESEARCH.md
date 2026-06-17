# Phase 11: Goal-Guided Guidance - Research

**Researched:** 2026-06-17
**Domain:** FastAPI / SQLAlchemy sync service extension, APScheduler job, React banner component
**Confidence:** HIGH

## Summary

Phase 11 adds three goal-guidance surfaces to an already-complete codebase. All architectural patterns are established: the SYNC service pattern (brief.py), AppSettings singleton extension (Phase 10 precedent), APScheduler job registration (scheduler.py), and async FastAPI router (plan.py). There is no novel library to evaluate — this phase is entirely additive using existing stack.

The most technically subtle piece is the `completed_at` column migration (0010) and the stall-detection service. The stall check must be SYNC (same thread-pool pattern as brief.py) because APScheduler 3.x jobs run in a thread pool, not in the asyncio event loop. The rate-limit gate lives on the AppSettings singleton row using a nullable Date column — exactly the pattern used for work-hours in Phase 10.

The next-best-task endpoint is the only new API surface. It can be a dedicated `GET /guidance/next-best-task` router or inlined into a guidance router. Given there will likely be more guidance-type queries in future, a dedicated `routers/guidance.py` is cleaner.

**Primary recommendation:** Follow brief.py exactly for guidance_service.py — SYNC create_engine + sessionmaker, deferred model imports inside functions, PushoverClient().send() for the nudge.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Goal snapshot in daily brief (GUIDE-01)**
- D-01: All active (`status=active`) goals appear — no cap.
- D-02: Each entry: `{goal title}: {progress %}% — next: {most-urgent task title}`
- D-03: Most-urgent linked task = earliest `due_date`; fallback highest `priority`; fallback omit "next:" suffix.
- D-04: TTS speech summarizes top 2–3 goals by urgency (closest `target_date`). NOT a full enumeration.
- D-05: `build_brief_body()` and `build_brief_speech()` in `brief.py` gain goal-snapshot section. Needs SYNC progress computation (raw SQL or same create_engine pattern).

**Next-best-task scoring & Today display (GUIDE-02)**
- D-06: `score = priority_weight × goal_urgency × due_proximity`
  - `priority_weight`: high=3, medium=2, low=1
  - `goal_urgency`: `1 / max(days_until_goal_target_date, 1)`; no linked goal = 0.5
  - `due_proximity`: `1 / max(days_until_task_due, 1)`; no due date = 0.5
- D-07: New endpoint (or inline in Today data) returns single top-scoring pending non-habit task.
- D-08: "Focus on:" sticky banner at top of Today.tsx above agenda. Absent if no pending tasks.

**Stall detection mechanics (GUIDE-03)**
- D-09: Add `completed_at` nullable DateTime column to Task model (new Alembic migration). Set when `completed` flips True in PATCH /tasks/{id}.
- D-10: Stall = goal has no linked task where `completed_at >= now() - threshold_days`. Goals with zero linked tasks are NOT stalled.
- D-11: `stall_threshold_days` (Integer, default 7) added to AppSettings, exposed in Settings UI.
- D-12: Stall nudge lists ALL stalled goals in one Pushover notification (bullet per goal).
- D-13: Stall check runs as APScheduler daily cron job.

**Guidance rate-limiting (GUIDE-03)**
- D-14: `last_guidance_sent_date` Date column on AppSettings (nullable). Skip nudge if already sent today; set on fire.
- D-15: Only the stall Pushover nudge counts against the once-per-day gate. Daily brief goal snapshot does not consume the slot.

### Claude's Discretion

- Whether next-best-task is a dedicated endpoint or folded into the Today/agenda data response.
- Exact APScheduler job ID and time for the stall-check job.
- Visual styling of the "Focus on:" banner in Today.tsx (color, icon, dismiss behavior).
- Whether `GET /guidance/next-best-task` excludes tasks already scheduled as ScheduledBlock for today (recommended: include them).

### Deferred Ideas (OUT OF SCOPE)

- Weekly goal digest / automated Friday review email.
- In-app goal-progress chart or dedicated Guidance page.
- Energy-aware scheduling / mid-day re-plan.
- Per-goal custom stall thresholds.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| GUIDE-01 | Daily brief includes goal snapshot — each active goal's progress % and single most-urgent linked task | brief.py SYNC pattern; goal_service.compute_progress() logic to replicate synchronously |
| GUIDE-02 | Today view surfaces "next best task" — highest-scoring pending task by priority × goal urgency × due-date proximity | New async endpoint + React hook + banner component |
| GUIDE-03 | If a goal has had no task completions for configurable threshold (default 7 days), fire one Pushover nudge; at most one guidance nudge per day | completed_at migration, SYNC guidance_service, APScheduler job, AppSettings columns |
</phase_requirements>

## Standard Stack

All libraries are already installed. No new dependencies required.

### Core (already in project)
| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| SQLAlchemy | 2.0.x | ORM — both sync (brief.py pattern) and async (routers) | Already in stack; 2.0 sync API used in brief.py |
| aiosqlite | 0.20.x | Async SQLite driver | Already in stack |
| Alembic | 1.13.x | Schema migrations | Already in stack; migration 0010 needed |
| APScheduler | 3.11.x | Stall-check cron job | Already in stack; MUST remain 3.x |
| FastAPI | 0.128.x | Guidance endpoint | Already in stack |
| httpx / PushoverClient | sync | Stall nudge notification | Already in stack |
| React 19 + Vite 8 | current | "Focus on:" banner in Today.tsx | Already in stack |

**Installation:** None required.

## Architecture Patterns

### Pattern 1: SYNC service for APScheduler jobs (CRITICAL)

**What:** Services called from APScheduler 3.x jobs MUST be synchronous. The scheduler runs jobs in a thread pool — calling `asyncio.run()` from a thread that already has an event loop causes a deadlock. Use `create_engine` (not `create_async_engine`) and `sessionmaker` (not `AsyncSession`).

**Model:** `backend/app/services/brief.py` lines 10–13.

```python
# Source: backend/app/services/brief.py (existing pattern)
_sync_url = app_settings.database_url.replace("+aiosqlite", "")
_engine = create_engine(_sync_url)
_Session = sessionmaker(_engine)
```

`guidance_service.py` must replicate this exactly. Do NOT use `async def` functions in the stall-check service.

### Pattern 2: AppSettings singleton column extension

**What:** AppSettings (id=1) is the single config row. New columns are added via Alembic `batch_alter_table` with `nullable=True` and NO `server_default` to avoid NOT NULL failure on the existing row. The router coalesces None to the default value on read.

**Model:** Migration 0009 (work-hours columns), `routers/settings.py` get_work_hours.

```python
# Source: backend/migrations/versions/0009_create_scheduled_blocks.py
with op.batch_alter_table("app_settings") as batch_op:
    batch_op.add_column(sa.Column("stall_threshold_days", sa.Integer(), nullable=True))
    batch_op.add_column(sa.Column("last_guidance_sent_date", sa.Date(), nullable=True))
```

In the model, these columns must also be nullable (no default at DB level):
```python
stall_threshold_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
last_guidance_sent_date: Mapped[date | None] = mapped_column(Date, nullable=True)
```

### Pattern 3: Alembic migration chain

**What:** Migration 0010 adds `completed_at` to tasks and adds two columns to `app_settings`. Can be one migration or two. Prior phase kept related schema changes together (0009 added scheduled_blocks AND work-hours).

```python
# Migration 0010 additions
# tasks table: completed_at DateTime nullable
# app_settings table: stall_threshold_days Integer nullable
#                     last_guidance_sent_date Date nullable
```

Since SQLite ALTER is constrained, task column addition via `batch_alter_table` is required (same as Phase 08 precedent).

### Pattern 4: APScheduler job registration

**What:** All jobs use `id=` + `replace_existing=True`. Stall job is a daily CronTrigger. Job ID convention: `"stall_check"`.

```python
# Source: backend/app/scheduler.py (pattern from schedule_daily_brief)
def schedule_stall_check(hour: int, minute: int) -> None:
    from apscheduler.triggers.cron import CronTrigger
    from app.services.guidance_service import send_stall_nudge
    scheduler.add_job(
        send_stall_nudge,
        CronTrigger(hour=hour, minute=minute, timezone=settings.timezone),
        id="stall_check",
        replace_existing=True,
        misfire_grace_time=None,
    )
```

Stall check should fire shortly after the daily brief (e.g., brief_hour, brief_minute + 5 minutes, or a fixed offset). Claude's discretion: default 08:05 local time.

### Pattern 5: Async router for next-best-task

**What:** New `routers/guidance.py` (async, like `routers/plan.py`). Single `GET /api/v1/guidance/next-best-task` endpoint. Returns a single TaskRead or null. Uses existing `AsyncSession` dependency.

The scoring formula from D-06 is pure Python arithmetic — no special library needed.

```python
# Score computation (pure Python, no library needed)
from datetime import date

PRIORITY_WEIGHT = {"high": 3, "medium": 2, "low": 1}

def _score_task(task, today: date) -> float:
    pw = PRIORITY_WEIGHT.get(task.priority.value, 1)
    if task.goal and task.goal.target_date:
        days_goal = max((task.goal.target_date - today).days, 1)
        gu = 1.0 / days_goal
    else:
        gu = 0.5
    if task.due_date:
        days_due = max((task.due_date.date() - today).days, 1)
        dp = 1.0 / days_due
    else:
        dp = 0.5
    return pw * gu * dp
```

### Pattern 6: Progress computation in SYNC context

**What:** `goal_service.compute_progress()` is async. For `brief.py` (SYNC), replicate the same two aggregate queries using `session.execute()` (sync). The logic is identical — just drop the `await`.

```python
# SYNC equivalent (for brief.py and guidance_service.py)
from sqlalchemy import select, func, case
from app.models import Task
from app.models.goal import Milestone

def _compute_progress_sync(goal_id: int, session) -> dict:
    task_row = session.execute(
        select(
            func.count(Task.id).label("total"),
            func.sum(case((Task.completed == True, 1), else_=0)).label("done"),
        ).where(Task.goal_id == goal_id)
    ).one()
    ms_row = session.execute(
        select(
            func.count(Milestone.id).label("total"),
            func.sum(case((Milestone.done == True, 1), else_=0)).label("done"),
        ).where(Milestone.goal_id == goal_id)
    ).one()
    total = (task_row.total or 0) + (ms_row.total or 0)
    done = (task_row.done or 0) + (ms_row.done or 0)
    return {"pct": round(done / total * 100) if total > 0 else 0}
```

### Pattern 7: PATCH /tasks/{id} — completed_at stamp

**What:** In `routers/tasks.py` update_task, detect when `completed` flips from False to True and set `completed_at`.

```python
# Source: backend/app/routers/tasks.py (extend existing PATCH handler)
was_completed = task.completed
for k, v in body.model_dump(exclude_unset=True).items():
    setattr(task, k, v)
if task.completed and not was_completed:
    task.completed_at = datetime.now(timezone.utc)
```

### Recommended Project Structure (new files)
```
backend/app/
├── routers/guidance.py          # GET /guidance/next-best-task
├── services/guidance_service.py # SYNC stall check + send_stall_nudge
├── schemas/guidance.py          # NextBestTaskRead (or reuse TaskRead)
migrations/versions/
└── 0010_guidance_columns.py     # completed_at + stall settings
frontend/src/
├── hooks/useNextBestTask.ts     # fetches /guidance/next-best-task
└── pages/Today.tsx              # add FocusBanner component above agenda
```

### Anti-Patterns to Avoid

- **Async stall service:** `guidance_service.py` MUST be sync. `async def send_stall_nudge()` will deadlock under APScheduler 3.x thread pool.
- **Missing `batch_alter_table`:** SQLite does not support ADD COLUMN with constraints via standard ALTER. Always use `op.batch_alter_table` for any existing table modification.
- **server_default on new nullable columns:** If the AppSettings row (id=1) already exists, adding a NOT NULL column without server_default causes Alembic upgrade failure. Always use `nullable=True`.
- **Direct `asyncio.run()` in APScheduler job:** The AsyncIOScheduler runs in the same event loop as FastAPI. Calling `asyncio.run()` from a thread pool job that tries to get the loop will error. SYNC services sidestep this entirely.
- **Double-counting completed_at:** Setting `completed_at` every time PATCH is called with `completed=True` would reset it on idempotent patches. Capture the pre-patch state first (`was_completed = task.completed`) and only stamp if transition from False → True.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cron scheduling | Custom timer loop | APScheduler CronTrigger | Already in scheduler.py; persistence via SQLAlchemyJobStore |
| Push notification | HTTP requests inline | PushoverClient (existing) | Already tested, handles retry, priority, auth |
| Progress computation | Re-implement | `_compute_progress_sync()` mirroring goal_service | Logic already verified; just needs sync wrapper |
| Date arithmetic | Custom day-diff | Python `datetime.date` arithmetic | stdlib, no library needed |

## Common Pitfalls

### Pitfall 1: Stall check fires when no goals have linked tasks

**What goes wrong:** D-10 says goals with zero linked tasks are NOT stalled. A naive query `WHERE completed_at IS NULL` would flag goals that have never had any tasks.

**How to avoid:** Filter to goals where `COUNT(linked tasks) > 0` before checking stall condition. Two-step: fetch goals with at least one linked task, then check `completed_at` recency.

### Pitfall 2: Rate-limit date comparison timezone mismatch

**What goes wrong:** `last_guidance_sent_date` is a `Date` (naive). If the stall job runs at 08:05 UTC and the user is in UTC+1, `date.today()` on the Pi (which uses system TZ from `os.environ["TZ"]`) may differ from UTC date. Phase 10 resolved this by using `os.environ.get("TZ", "UTC")` for local time. The stall check should use `datetime.now().date()` (local naive) to match how AppSettings date is set.

**How to avoid:** Use `datetime.now().date()` (naive local) consistently for both writing and comparing `last_guidance_sent_date`.

### Pitfall 3: brief.py goal snapshot orphan sessions

**What goes wrong:** The goal snapshot in `build_brief_body()` must be queried inside the SAME `with _Session() as s:` block as tasks/events, not in a second session context. Opening two sessions in sequence on SQLite WAL is fine, but holding two open simultaneously is unnecessary.

**How to avoid:** Query goals inside the existing `with _Session() as s:` block in `build_brief_body()` and `build_brief_speech()`.

### Pitfall 4: `lazy=selectin` on Task.goal in SYNC context

**What goes wrong:** The Task model has `goal: Mapped["Goal | None"] = relationship("Goal", back_populates="tasks", lazy="selectin")`. In the ASYNC session this is fine. In a SYNC session, `selectin` lazy loading is also supported by SQLAlchemy 2.0 — it will issue a SELECT IN query synchronously. No action needed, but verify that the SYNC session loads the goal relationship correctly when computing next-best-task scores.

**Warning signs:** `MissingGreenlet` error only happens in async context. In sync context, selectin works normally.

### Pitfall 5: Pushover message length for multiple stalled goals

**What goes wrong:** Pushover has a 1024-character message limit. If many goals are stalled and task titles are long, the message could be truncated or rejected.

**How to avoid:** For a personal secretary the list stays small (D-01 rationale), but truncate to 1024 chars with a `…` suffix as a defensive measure.

## Code Examples

### Stall detection query (SYNC)

```python
# Source: derived from brief.py pattern + D-10 logic
from datetime import datetime, timedelta, date

def _find_stalled_goals(session, threshold_days: int) -> list:
    from app.models.goal import Goal
    from app.models import Task

    cutoff = datetime.now() - timedelta(days=threshold_days)

    # Goals that are active and have at least one linked task
    goals = session.execute(
        select(Goal).where(Goal.status == "active")
    ).scalars().all()

    stalled = []
    for goal in goals:
        linked_tasks = [t for t in goal.tasks if not t.is_habit]
        if not linked_tasks:
            continue  # D-10: zero linked tasks = not stalled
        # Check if any task was completed within threshold
        recently_completed = any(
            t.completed_at is not None and t.completed_at >= cutoff
            for t in linked_tasks
        )
        if not recently_completed:
            stalled.append(goal)
    return stalled
```

### Next-best-task endpoint sketch

```python
# Source: derived from routers/plan.py pattern
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import date, datetime, timezone

from app.db import get_session
from app.models import Task
from app.config import settings

router = APIRouter(prefix=f"{settings.api_prefix}/guidance", tags=["guidance"])

@router.get("/next-best-task")
async def next_best_task(session: AsyncSession = Depends(get_session)):
    tasks = (
        await session.execute(
            select(Task).where(Task.completed == False, Task.is_habit == False)
        )
    ).scalars().all()

    if not tasks:
        return None

    today = datetime.now(timezone.utc).date()
    scored = sorted(tasks, key=lambda t: _score_task(t, today), reverse=True)
    return scored[0]  # return as TaskRead via response_model
```

### Brief body goal snapshot section

```python
# Append inside build_brief_body(), same session block
from app.models.goal import Goal

goals = s.execute(
    select(Goal).where(Goal.status == "active")
).scalars().all()

goal_lines = []
for g in goals:
    pct = _compute_progress_sync(g.id, s)["pct"]
    pending = [t for t in g.tasks if not t.completed]
    if pending:
        with_due = [t for t in pending if t.due_date]
        if with_due:
            next_task = min(with_due, key=lambda t: t.due_date)
        else:
            next_task = max(pending, key=lambda t: {"high": 3, "medium": 2, "low": 1}.get(t.priority.value, 1))
        goal_lines.append(f"• {g.title}: {pct}% — next: {next_task.title}")
    else:
        goal_lines.append(f"• {g.title}: {pct}%")

if goal_lines:
    lines.append("\nGoals:")
    lines.extend(goal_lines)
```

### React "Focus on:" banner (Today.tsx)

```tsx
// Source: Claude's discretion — minimal styled div above agenda
function FocusBanner({ task }: { task: TaskType | null }) {
  if (!task) return null;
  return (
    <div style={{
      background: "var(--accent, #4f46e5)",
      color: "#fff",
      borderRadius: 8,
      padding: "10px 14px",
      marginBottom: 16,
      fontSize: 14,
      fontWeight: 500,
    }}>
      Focus on: {task.title}
    </div>
  );
}
```

## Environment Availability

Step 2.6: SKIPPED — Phase 11 is purely additive code/config changes on the existing stack. No new external tools, services, or runtimes are required.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (existing) |
| Config file | `backend/pytest.ini` or `backend/pyproject.toml` |
| Quick run command | `cd backend && pytest tests/test_guidance.py -x` |
| Full suite command | `cd backend && pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| GUIDE-01 | `build_brief_body()` includes goal snapshot section with `{title}: {pct}%` | unit | `pytest tests/test_guidance.py::test_brief_body_includes_goal_snapshot -x` | Wave 0 |
| GUIDE-01 | `build_brief_speech()` reads only top 2–3 goals, not full list | unit | `pytest tests/test_guidance.py::test_brief_speech_goal_summary -x` | Wave 0 |
| GUIDE-02 | `GET /guidance/next-best-task` returns highest-scoring pending task | unit | `pytest tests/test_guidance.py::test_next_best_task_scoring -x` | Wave 0 |
| GUIDE-02 | Banner absent when no pending tasks | unit | `pytest tests/test_guidance.py::test_next_best_task_empty -x` | Wave 0 |
| GUIDE-03 | `completed_at` set on task when completed flips True | unit | `pytest tests/test_tasks.py::test_completed_at_stamped -x` | ❌ add to existing |
| GUIDE-03 | Goal with no recent completions is detected as stalled | unit | `pytest tests/test_guidance.py::test_stall_detection_basic -x` | Wave 0 |
| GUIDE-03 | Goal with zero linked tasks not flagged as stalled | unit | `pytest tests/test_guidance.py::test_stall_no_tasks_not_stalled -x` | Wave 0 |
| GUIDE-03 | Rate limit: stall nudge skipped if already sent today | unit | `pytest tests/test_guidance.py::test_stall_rate_limit -x` | Wave 0 |
| GUIDE-03 | `stall_threshold_days` readable/writable via settings API | unit | `pytest tests/test_settings.py::test_stall_threshold_roundtrip -x` | ❌ add to existing |

### Sampling Rate
- **Per task commit:** `cd backend && pytest tests/test_guidance.py -x`
- **Per wave merge:** `cd backend && pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_guidance.py` — all GUIDE-01/02/03 guidance tests (new file)
- [ ] `backend/tests/test_tasks.py` — add `test_completed_at_stamped` to existing file
- [ ] `backend/tests/test_settings.py` — add `test_stall_threshold_roundtrip` to existing file

## Open Questions

1. **Stall job timing** — Should the stall check fire at brief_hour + 5 minutes (requires reading AppSettings for brief time at startup) or a fixed default (08:05)?
   - What we know: daily brief defaults to 08:00; stall check should follow the brief.
   - Recommendation: Fixed default `hour=8, minute=5` in `startup.py`, same pattern as `schedule_daily_brief`. No need to couple them dynamically for v1.

2. **`useNextBestTask` hook — polling or one-shot?**
   - What we know: Today.tsx already has `useTasks`, `useCalendarEvents`, `usePlan` hooks that all fire once on mount.
   - Recommendation: Same pattern — one-shot fetch on mount, no polling. The banner reflects state at load time.

3. **Settings page UX for `stall_threshold_days`** — Inline with work-hours or separate card?
   - Recommendation: Add a "Guidance" settings card on the Settings page, below work-hours. Single number input labeled "Goal stall threshold (days)".

## Sources

### Primary (HIGH confidence)
- `backend/app/services/brief.py` — SYNC pattern; exact model for guidance_service.py
- `backend/app/scheduler.py` — APScheduler job registration pattern
- `backend/app/models/__init__.py` — Task model; AppSettings singleton
- `backend/app/models/goal.py` — Goal/Milestone models; lazy=selectin on relationships
- `backend/app/services/goal_service.py` — compute_progress() async; SYNC equivalent derived
- `backend/migrations/versions/0009_create_scheduled_blocks.py` — batch_alter_table pattern for SQLite
- `backend/app/routers/tasks.py` — PATCH handler to extend for completed_at
- `backend/app/routers/settings.py` — AppSettings CRUD pattern for new columns
- `.planning/phases/11-goal-guided-guidance/11-CONTEXT.md` — all locked decisions

### Secondary (MEDIUM confidence)
- `backend/tests/test_brief.py` — test patterns (patch `_Session`, deferred imports) applicable to test_guidance.py
- `backend/app/routers/plan.py` — async router pattern for guidance.py

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; all existing
- Architecture: HIGH — all patterns directly observed in codebase
- Pitfalls: HIGH — derived from established project decisions (STATE.md, Phase 08/10 precedents)

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable stack, no external dependencies)
