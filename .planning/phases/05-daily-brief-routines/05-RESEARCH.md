# Phase 5: Daily Brief & Routines - Research

**Researched:** 2026-06-13
**Domain:** APScheduler CronTrigger, SQLAlchemy single-row settings model, FastAPI CRUD routers, React drawer + form pattern
**Confidence:** HIGH

## Summary

Phase 5 extends established Phase 3 patterns — no new libraries required. The scheduler, Pushover client, and router structure are already in place. The two deliverables (daily brief + custom routines) follow the exact same job ID + `replace_existing=True` idiom used for task reminders. The main new surface is a `settings` table (single row, `id=1`) and a `routines` table, both backed by Alembic migrations, plus two new FastAPI routers and new Settings page sections in React.

The brief body builder is a Python port of the frontend `buildAgenda()` logic: query today's pending tasks (due_date date == today) and today's CalendarEvents, merge and sort timed items by time, prepend all-day/untimed items. The agenda builder runs synchronously inside the APScheduler thread-pool job, same as the existing `_send_reminder` function.

APScheduler already uses `SQLAlchemyJobStore`, so routine jobs survive reboots automatically. The brief job is registered on lifespan startup by loading the saved `brief_time` from the DB — defaulting to 08:00 if the row doesn't exist yet.

**Primary recommendation:** Follow the existing scheduler/router/model patterns exactly. No new libraries. Port `buildAgenda()` to Python as a module-level function in `backend/app/services/brief.py`.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Brief Pushover title = "Good morning"
- **D-02:** Brief body = bullet list of today's tasks (due today) + today's calendar events, merged and sorted by time — reuses `buildAgenda()` output
- **D-03:** Format: one bullet per item — timed items as `HH:MM Title`, all-day/tasks as `• Title`
- **D-04:** Brief Pushover priority = 0 (normal) — does not bypass quiet hours
- **D-05:** Brief time is stored in the database (a `settings` table or equivalent single-row config model), not in `.env` or APScheduler job args.
- **D-06:** APScheduler job ID = `daily_brief`; rescheduled with `replace_existing=True` whenever the user saves a new time from the UI.
- **D-07:** Timezone — store brief time as a local-time `HH:MM` string in the DB; convert to `CronTrigger(hour=H, minute=M, timezone=settings.timezone)`. Add `TIMEZONE` setting (default `"Europe/London"` or user-configured). APScheduler handles DST automatically when a named timezone is passed.
- **D-08:** Use `misfire_grace_time=None` (or 0) on the daily brief job — skip missed fires (reboot after 8am = wait until tomorrow).
- **D-09:** Phase 5 action type: `"send_daily_brief"` only — fires the same brief builder at time of fire (not cached).
- **D-10:** Action select shows one option: "Send daily brief". The `action` column is a string enum, extensible for Phase 6.
- **D-11:** Routine job ID convention: `routine_{routine_id}`.

### Claude's Discretion

- DB model name for settings row (e.g., `AppSettings` or `SystemConfig`)
- Whether brief time is stored as `HH:MM` string or as two int columns (hour, minute)
- Error handling when brief builder fails (log and skip vs send "No agenda data" message)
- Whether to validate cron expressions server-side before saving a routine
- API endpoint structure for routines (`/api/v1/routines`) and brief settings (`/api/v1/settings/brief-time`)

### Deferred Ideas (OUT OF SCOPE)

- Brief time timezone configurability from UI (Phase 5 uses single `TIMEZONE` config; UI timezone picker is v2)
- Routine action type "Send custom Pushover message"
- Google Home TTS as routine action (Phase 6)
- Pushover action buttons on brief
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| CAL-06 | Daily brief fires at a user-configurable time (default 8am); delivered as a Pushover notification with today's agenda summary | APScheduler `CronTrigger` + `replace_existing=True`; DB settings row; lifespan startup registration |
| CAL-07 | User can define custom recurring routines (name, cron schedule, action); routines persist across reboots via APScheduler SQLAlchemyJobStore | `SQLAlchemyJobStore` already wired; new `Routine` model + CRUD router; job registered on create/update, removed on delete |
| NOTIF-02 | Daily brief delivers a Pushover push notification with agenda content | `PushoverClient().send()` with priority=0, title="Good morning", body from brief builder |
</phase_requirements>

## Standard Stack

### Core (all already installed — no new dependencies)
| Library | Version | Purpose | Why |
|---------|---------|---------|--------------|
| APScheduler | 3.11.x | CronTrigger for brief + routine jobs | Already in use; `SQLAlchemyJobStore` provides reboot persistence |
| SQLAlchemy 2.0 async | 2.x | `AppSettings` + `Routine` models | Already in use |
| aiosqlite | 0.20.x | Async SQLite driver | Already in use |
| Alembic | 1.13.x | Migrations for new tables | Already wired; `env.py` strips `+aiosqlite` |
| FastAPI | 0.128.x | New `settings` + `routines` routers | Already in use |
| React 19 + Vite 8 | current | New Settings page sections | Already in use |

**Installation:** No new packages required.

## Architecture Patterns

### Recommended Project Structure (new files only)
```
backend/
├── app/
│   ├── models/
│   │   └── __init__.py          # add AppSettings + Routine models
│   ├── routers/
│   │   ├── settings.py          # new: GET/PUT /api/v1/settings/brief-time
│   │   └── routines.py          # new: CRUD /api/v1/routines
│   ├── schemas/
│   │   ├── settings.py          # new: BriefTimeRead, BriefTimeUpdate
│   │   └── routine.py           # new: RoutineCreate, RoutineUpdate, RoutineRead
│   ├── services/
│   │   └── brief.py             # new: build_brief_body() + send_daily_brief()
│   └── scheduler.py             # add schedule_daily_brief() + routine job helpers
frontend/
└── src/
    ├── hooks/
    │   ├── useBriefSettings.ts  # new
    │   └── useRoutines.ts       # new
    └── pages/
        └── Settings.tsx         # extend with Daily Brief + Routines sections
alembic/versions/
└── xxxx_add_settings_routines.py  # new migration
```

### Pattern 1: Single-row settings model (`AppSettings`)

**What:** One row with `id=1`, queried with `session.get(AppSettings, 1)`, upserted with `merge()` or explicit create-if-missing.
**When to use:** App-level config that changes via UI without a service restart.

```python
# backend/app/models/__init__.py
class AppSettings(Base):
    __tablename__ = "app_settings"
    id: Mapped[int] = mapped_column(primary_key=True, default=1)
    brief_hour: Mapped[int] = mapped_column(default=8)
    brief_minute: Mapped[int] = mapped_column(default=0)

# Recommendation: use two int columns (hour, minute) rather than HH:MM string
# — avoids string parsing in schedule_daily_brief(), less error surface.
```

### Pattern 2: Routine model

```python
import enum
class RoutineAction(str, enum.Enum):
    send_daily_brief = "send_daily_brief"

class Routine(Base):
    __tablename__ = "routines"
    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    cron: Mapped[str] = mapped_column(String(100), nullable=False)  # "0 8 * * *"
    action: Mapped[RoutineAction] = mapped_column(SAEnum(RoutineAction), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

### Pattern 3: `schedule_daily_brief()` in scheduler.py

```python
# backend/app/scheduler.py
from apscheduler.triggers.cron import CronTrigger

def schedule_daily_brief(hour: int, minute: int) -> None:
    from app.services.brief import send_daily_brief
    scheduler.add_job(
        send_daily_brief,
        CronTrigger(hour=hour, minute=minute, timezone=settings.timezone),
        id="daily_brief",
        replace_existing=True,
        misfire_grace_time=None,  # D-08: skip missed fires
    )

def schedule_routine(routine) -> None:
    from app.services.brief import send_daily_brief
    scheduler.add_job(
        send_daily_brief,
        CronTrigger.from_crontab(routine.cron, timezone=settings.timezone),
        id=f"routine_{routine.id}",   # D-11
        replace_existing=True,
        misfire_grace_time=None,
    )

def remove_routine(routine_id: int) -> None:
    try:
        scheduler.remove_job(f"routine_{routine_id}")
    except Exception:
        pass
```

### Pattern 4: Brief body builder (Python port of `buildAgenda()`)

The frontend `buildAgenda()` in `frontend/src/lib/agenda.ts` is the canonical logic. Port it to Python:

```python
# backend/app/services/brief.py
from datetime import date
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

def build_brief_body() -> str:
    """Runs synchronously — called from APScheduler thread pool."""
    from app.db import Base  # avoid circular at module level
    from app.config import settings as app_settings
    from app.models import Task
    from app.models.calendar import CalendarEvent

    sync_url = app_settings.database_url.replace("+aiosqlite", "")
    engine = create_engine(sync_url)
    Session = sessionmaker(engine)
    today = date.today().isoformat()

    with Session() as s:
        tasks = s.execute(
            select(Task).where(
                Task.completed == False,
                Task.due_date.isnot(None),
            )
        ).scalars().all()
        events = s.execute(
            select(CalendarEvent).where(CalendarEvent.date == today)
        ).scalars().all()

    today_tasks = [t for t in tasks if t.due_date and t.due_date.date().isoformat() == today]

    timed_lines = []
    untimed_lines = []

    for t in today_tasks:
        if t.due_date.hour == 0 and t.due_date.minute == 0:
            untimed_lines.append(f"• {t.title}")
        else:
            timed_lines.append((t.due_date.strftime("%H:%M"), t.title))

    for e in events:
        if e.all_day:
            untimed_lines.append(f"• {e.title}")
        else:
            time_str = e.start_dt[11:16] if e.start_dt else "??"
            timed_lines.append((time_str, e.title))

    timed_lines.sort(key=lambda x: x[0])
    lines = untimed_lines + [f"{t} {title}" for t, title in timed_lines]

    return "\n".join(lines) if lines else "Nothing scheduled today."


def send_daily_brief() -> None:
    """Sync function — safe for APScheduler thread pool."""
    from app.services.pushover import PushoverClient
    try:
        body = build_brief_body()
    except Exception:
        body = "Could not load agenda."
    PushoverClient().send(title="Good morning", message=body, priority=0)
```

**Key insight:** APScheduler 3.x jobs run in a thread pool (not async). `build_brief_body()` must use a **sync** SQLAlchemy engine, the same pattern already used in `app.services.sync` (which also does sync DB access in the scheduler). Create the sync engine from `settings.database_url.replace("+aiosqlite", "")` — identical to the pattern in `scheduler.py` itself.

### Pattern 5: Lifespan startup

```python
# backend/app/main.py (lifespan addition)
from app.scheduler import scheduler, schedule_calendar_sync, schedule_daily_brief

@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    schedule_calendar_sync()
    # Load brief time from DB (sync read at startup is acceptable)
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from app.config import settings as app_settings
    from app.models import AppSettings

    sync_url = app_settings.database_url.replace("+aiosqlite", "")
    engine = create_engine(sync_url)
    Session = sessionmaker(engine)
    with Session() as s:
        cfg = s.get(AppSettings, 1)
    hour = cfg.brief_hour if cfg else 8
    minute = cfg.brief_minute if cfg else 0
    schedule_daily_brief(hour, minute)
    engine.dispose()
    ...
```

### Pattern 6: Router structure

`routers/settings.py` — follows `routers/tasks.py` exactly:
```python
router = APIRouter(prefix=f"{settings.api_prefix}/settings", tags=["settings"])

@router.get("/brief-time", response_model=BriefTimeRead)
async def get_brief_time(session: AsyncSession = Depends(get_session)): ...

@router.put("/brief-time", response_model=BriefTimeRead)
async def set_brief_time(body: BriefTimeUpdate, session: AsyncSession = Depends(get_session)):
    # upsert AppSettings row id=1
    # call schedule_daily_brief(hour, minute)
    ...
```

`routers/routines.py` — full CRUD, same pattern:
- `POST /api/v1/routines/` → create, call `schedule_routine(routine)`
- `GET /api/v1/routines/` → list all
- `PATCH /api/v1/routines/{id}` → update, call `schedule_routine(routine)` with `replace_existing=True`
- `DELETE /api/v1/routines/{id}` → delete, call `remove_routine(routine.id)`

### Pattern 7: TIMEZONE config addition

```python
# backend/app/config.py
class Settings(BaseSettings):
    ...
    timezone: str = "Europe/London"
```

### Pattern 8: Frontend hooks (follow `useCalendarEvents.ts` pattern)

```typescript
// useBriefSettings.ts
export function useBriefSettings() {
  const [briefTime, setBriefTime] = useState<string | null>(null);  // "HH:MM"
  ...
}

// useRoutines.ts
export function useRoutines() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  ...
}
```

### Anti-Patterns to Avoid

- **Async brief builder:** APScheduler 3.x jobs are sync. Do NOT use `async def send_daily_brief()` — it will silently fail to execute correctly.
- **Using async SQLAlchemy in brief builder:** The brief builder runs in a thread pool. Use a sync `create_engine`, not `create_async_engine`. Same constraint as `app.services.sync`.
- **Scheduling brief job before scheduler.start():** The job must be added AFTER `scheduler.start()` in lifespan. Current code already does this for `schedule_calendar_sync()`.
- **No `id=` + `replace_existing=True` on routine jobs:** Every `add_job()` call must include both — this is a project-wide invariant.
- **Storing brief time in APScheduler job args:** D-05 forbids this. The source of truth is the DB; the scheduler is derived state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| DST-safe cron scheduling | Custom time math | `CronTrigger(timezone="Europe/London")` | APScheduler handles DST automatically with named timezone |
| Cron expression parsing (server-side) | Regex/manual split | `CronTrigger.from_crontab(expr)` — raises `ValueError` on invalid | APScheduler already validates 5-part cron syntax |
| Job persistence across reboots | Custom DB job table | `SQLAlchemyJobStore` | Already wired in `scheduler.py` — routine jobs persist automatically |
| Sync DB access in APScheduler job | Any async pattern | `create_engine()` + `sessionmaker()` (sync) | APScheduler thread-pool jobs cannot drive an asyncio event loop |

## Common Pitfalls

### Pitfall 1: Async in APScheduler job function
**What goes wrong:** `async def send_daily_brief()` is registered, scheduler wraps it in executor thread, coroutine never awaited — silent no-op.
**Why it happens:** Confusing AsyncIOScheduler (which runs in the event loop) with job function execution (which runs in a thread pool executor).
**How to avoid:** All job functions (`_send_reminder`, `sync_calendar`, `send_daily_brief`) are plain `def`, not `async def`. This is established project convention (see `scheduler.py`).
**Warning signs:** No Pushover notification, no exception logged.

### Pitfall 2: AppSettings row missing on first startup
**What goes wrong:** `session.get(AppSettings, 1)` returns `None`; `schedule_daily_brief(None.brief_hour, ...)` raises `AttributeError`.
**Why it happens:** Alembic creates the table but inserts no seed row.
**How to avoid:** In lifespan startup and in `get_brief_time` router, always default to `hour=8, minute=0` when the row is absent. Create the row on first `PUT /brief-time` request.

### Pitfall 3: Routine job not removed from APScheduler when DB row deleted
**What goes wrong:** Routine deleted from DB but APScheduler still has the persisted job (in `apscheduler_jobs` table) — routine keeps firing.
**Why it happens:** `SQLAlchemyJobStore` stores jobs independently from the application models.
**How to avoid:** Always call `remove_routine(routine.id)` BEFORE `session.delete(routine)` in the delete endpoint. Mirror the `remove_reminder(task_id)` call in `delete_task`.

### Pitfall 4: CronTrigger.from_crontab raises ValueError on invalid input
**What goes wrong:** User enters a malformed cron string (`"every day 8am"`); APScheduler raises `ValueError` inside the router; unhandled 500.
**Why it happens:** No validation before passing to APScheduler.
**How to avoid:** Wrap `CronTrigger.from_crontab(cron)` in a try/except in the router (or a Pydantic validator on the schema) and return HTTP 422 with a descriptive message.

### Pitfall 5: Brief fires with stale data if events/tasks were cached
**What goes wrong:** Brief body reflects yesterday's agenda.
**Why it happens:** Brief builder reads from a cached/stale object rather than querying DB at fire time.
**How to avoid:** D-09 says build agenda at time of fire. `build_brief_body()` always does a fresh DB query each time it's called — no caching.

### Pitfall 6: CalendarEvent table structure mismatch
**What goes wrong:** `build_brief_body()` queries `CalendarEvent` but uses wrong column name for date filtering.
**Why it happens:** The `CalendarEvent` model columns need to be checked before writing the brief builder.
**How to avoid:** Read `backend/app/models/calendar.py` before writing the brief service. Verify the column name for the event date and whether it's `start_dt` (datetime) or a separate `date` string column.

## Code Examples

### CronTrigger with named timezone (HIGH confidence — APScheduler 3.x docs)
```python
from apscheduler.triggers.cron import CronTrigger
trigger = CronTrigger(hour=8, minute=0, timezone="Europe/London")
# from_crontab for user-provided strings:
trigger = CronTrigger.from_crontab("0 8 * * *", timezone="Europe/London")
```

### Sync engine in APScheduler job (established pattern from scheduler.py)
```python
# scheduler.py already does this:
_sync_url = settings.database_url.replace("+aiosqlite", "")
# Same pattern in brief.py:
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
engine = create_engine(_sync_url)
```

### Upsert single-row settings (SQLAlchemy 2.0 sync)
```python
with Session() as s:
    cfg = s.get(AppSettings, 1)
    if cfg is None:
        cfg = AppSettings(id=1, brief_hour=hour, brief_minute=minute)
        s.add(cfg)
    else:
        cfg.brief_hour = hour
        cfg.brief_minute = minute
    s.commit()
```

## Environment Availability

Step 2.6: SKIPPED (no external dependencies beyond existing project stack — APScheduler, SQLAlchemy, Pushover, and React are all already installed and verified in prior phases).

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (backend), vitest (frontend) |
| Config file | `backend/pytest.ini` or `pyproject.toml` (existing) |
| Quick run command | `cd backend && python -m pytest tests/test_brief.py tests/test_routines.py tests/test_settings.py -x` |
| Full suite command | `cd backend && python -m pytest` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| CAL-06 | `GET /api/v1/settings/brief-time` returns default 08:00 | unit | `pytest tests/test_settings.py::test_get_brief_time_default -x` | Wave 0 |
| CAL-06 | `PUT /api/v1/settings/brief-time` updates DB + reschedules job | unit | `pytest tests/test_settings.py::test_set_brief_time -x` | Wave 0 |
| CAL-06 | `send_daily_brief()` calls `PushoverClient().send()` with title="Good morning" | unit | `pytest tests/test_brief.py::test_send_daily_brief -x` | Wave 0 |
| CAL-06 | `build_brief_body()` returns "Nothing scheduled today." when no tasks/events | unit | `pytest tests/test_brief.py::test_build_brief_body_empty -x` | Wave 0 |
| CAL-07 | `POST /api/v1/routines/` creates DB row + APScheduler job | unit | `pytest tests/test_routines.py::test_create_routine -x` | Wave 0 |
| CAL-07 | `DELETE /api/v1/routines/{id}` removes DB row + APScheduler job | unit | `pytest tests/test_routines.py::test_delete_routine -x` | Wave 0 |
| CAL-07 | Invalid cron string returns HTTP 422 | unit | `pytest tests/test_routines.py::test_create_routine_invalid_cron -x` | Wave 0 |
| NOTIF-02 | Brief body contains timed event formatted as "HH:MM Title" | unit | `pytest tests/test_brief.py::test_build_brief_body_timed_event -x` | Wave 0 |

### Sampling Rate
- **Per task commit:** `python -m pytest tests/test_brief.py tests/test_routines.py tests/test_settings.py -x`
- **Per wave merge:** `python -m pytest`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/tests/test_brief.py` — covers brief builder and send function
- [ ] `backend/tests/test_routines.py` — covers routines CRUD router
- [ ] `backend/tests/test_settings.py` — covers brief-time GET/PUT endpoints

## Sources

### Primary (HIGH confidence)
- Existing codebase: `backend/app/scheduler.py`, `backend/app/main.py`, `backend/app/models/__init__.py`, `backend/app/config.py`, `backend/app/routers/tasks.py` — established patterns
- Existing codebase: `frontend/src/lib/agenda.ts` — buildAgenda() logic to port
- `.planning/phases/05-daily-brief-routines/05-CONTEXT.md` — locked decisions D-01 through D-11
- `.planning/phases/05-daily-brief-routines/05-UI-SPEC.md` — UI design contract

### Secondary (MEDIUM confidence)
- APScheduler 3.x docs: `CronTrigger.from_crontab()` raises `ValueError` on invalid cron — consistent with library behavior, not independently verified this session but HIGH confidence from prior phase research
- `.planning/STATE.md`: APScheduler 3.x thread-pool behavior confirmed in Phase 3 accumulated decisions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries, all patterns from prior phases
- Architecture: HIGH — derived directly from existing codebase patterns
- Brief builder: HIGH — direct port of `buildAgenda()` with known sync-engine constraint
- Pitfalls: HIGH — pitfalls 1-3 are established from Phase 3 decisions; 4-6 are logical consequences of the architecture

**Research date:** 2026-06-13
**Valid until:** 2026-07-13 (stable stack, no fast-moving dependencies)
