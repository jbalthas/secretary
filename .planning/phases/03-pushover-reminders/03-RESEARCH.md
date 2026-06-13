# Phase 3: Pushover Reminders - Research

**Researched:** 2026-06-12
**Domain:** APScheduler 3.x job persistence + Pushover REST API
**Confidence:** HIGH

## Summary

Phase 3 wires APScheduler's `AsyncIOScheduler` with `SQLAlchemyJobStore` into FastAPI's lifespan, then calls the Pushover REST API when a task's `reminder_at` fires. The scheduler must be a singleton accessible from the task router so create/update/delete can upsert or remove reminder jobs.

The two non-trivial subtleties: (1) APScheduler job functions must be regular `def` callables, not `async def`, because APScheduler 3.x runs them in a thread pool — an `async def` passed directly will return a coroutine object without awaiting it; (2) the `SQLAlchemyJobStore` needs a **sync** SQLite URL (no `+aiosqlite`), which the codebase already strips for Alembic — same pattern applies here.

Everything else is straightforward: one POST to `api.pushover.net/1/messages.json` via `httpx` (sync call inside a non-async job function), and `DateTrigger` (one-shot) jobs that APScheduler cleans up automatically after firing.

**Primary recommendation:** Create `backend/app/scheduler.py` as a module-level singleton that the lifespan starts/stops, and expose `upsert_reminder(task)` / `remove_reminder(task_id)` helpers that the task router calls directly.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Notification title = task title only (no "Reminder:" prefix)
- **D-02:** Notification body = task description if set, empty body if not
- **D-03:** Priority mapping: high task → Pushover priority 1; medium/low task → Pushover priority 0
- **D-04:** Reminder job upserted on every task save (create or update) — `replace_existing=True`
- **D-05:** If `reminder_at` is null, no job scheduled (or existing job removed)
- **D-06:** Task deleted OR marked complete → remove pending reminder job immediately
- **D-07:** Job ID convention: `reminder_task_{task_id}`
- **D-08:** DateTrigger (one-shot) — APScheduler removes automatically after execution; no `reminder_fired_at` column; no extra dedup guard needed
- **D-09:** Phase 3 builds reusable Pushover HTTP client; NOTIF-02 daily brief NOT implemented here — Phase 5 only

### Carried-forward locked decisions
- APScheduler 3.x (not 4.x), `AsyncIOScheduler` with `SQLAlchemyJobStore`
- Single uvicorn worker only
- `id=` + `replace_existing=True` on every APScheduler job
- WAL mode + busy_timeout already set at DB startup

### Claude's Discretion
- APScheduler module structure (e.g., `backend/app/scheduler.py` vs inline in `main.py`)
- Pushover client module location (e.g., `backend/app/services/pushover.py`)
- Error handling when Pushover API call fails (log and swallow vs retry)
- SQLAlchemyJobStore table name and URL derivation (sync URL from settings, same pattern as Alembic)

### Deferred Ideas (OUT OF SCOPE)
- Pushover action buttons ("Mark complete" from notification)
- Retry logic on Pushover API failure — log and continue for v1
- NOTIF-02 daily brief notification — Phase 5
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| NOTIF-01 | Task reminders deliver a Pushover push notification at the scheduled time | APScheduler DateTrigger + Pushover POST API; job persistence survives reboot via SQLAlchemyJobStore |
| NOTIF-02 | Daily brief delivers a Pushover push notification (plumbing only in Phase 3) | Reusable `PushoverClient` service built here; actual brief scheduling deferred to Phase 5 |
</phase_requirements>

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| APScheduler | 3.11.x | Job scheduling + persistence | Already decided; SQLAlchemyJobStore survives reboots |
| httpx | 0.27.x | Pushover API HTTP call | Already in stack; async-compatible; sync client available for non-async job functions |
| pydantic-settings | (bundled with FastAPI) | Load `PUSHOVER_API_TOKEN` / `PUSHOVER_USER_KEY` from `.env` | Already in use in `config.py` |

### No new dependencies required
All required libraries are already installed. No `pip install` needed for Phase 3.

## Architecture Patterns

### Recommended Project Structure
```
backend/app/
├── scheduler.py          # AsyncIOScheduler singleton + upsert_reminder / remove_reminder
├── services/
│   └── pushover.py       # Thin httpx POST wrapper — PushoverClient.send()
├── main.py               # lifespan wires scheduler start/stop
├── routers/
│   └── tasks.py          # calls scheduler.upsert_reminder / remove_reminder
└── config.py             # add pushover_api_token, pushover_user_key fields
```

### Pattern 1: APScheduler module-level singleton
**What:** `scheduler.py` creates the `AsyncIOScheduler` instance at module scope. FastAPI lifespan starts/stops it. Router imports the instance directly.
**When to use:** Single-worker FastAPI app — no need for dependency injection of the scheduler.

```python
# backend/app/scheduler.py
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from app.config import settings

_sync_url = settings.database_url.replace("+aiosqlite", "")

scheduler = AsyncIOScheduler(
    jobstores={"default": SQLAlchemyJobStore(url=_sync_url)},
    timezone="UTC",
)


def upsert_reminder(task) -> None:
    if task.reminder_at is None:
        remove_reminder(task.id)
        return
    scheduler.add_job(
        _send_reminder,
        "date",
        run_date=task.reminder_at,
        id=f"reminder_task_{task.id}",
        replace_existing=True,
        kwargs={"title": task.title, "body": task.description or "", "priority": _pushover_priority(task.priority)},
    )


def remove_reminder(task_id: int) -> None:
    try:
        scheduler.remove_job(f"reminder_task_{task_id}")
    except Exception:
        pass  # job may not exist


def _pushover_priority(priority) -> int:
    return 1 if priority and priority.value == "high" else 0
```

### Pattern 2: APScheduler job functions must be sync `def`
**What:** APScheduler 3.x executes jobs in a thread pool executor. The callable must be a regular `def`, not `async def`. Passing `async def` results in an unawaited coroutine — the notification silently never sends.
**When to use:** Always — for any APScheduler 3.x job function.

```python
# backend/app/scheduler.py (continued)
def _send_reminder(title: str, body: str, priority: int) -> None:
    from app.services.pushover import PushoverClient
    PushoverClient().send(title=title, message=body, priority=priority)
```

The import is deferred inside the function body to avoid circular imports at module load time.

### Pattern 3: Pushover thin client
**What:** Single `send()` method, sync `httpx.Client`, raises on HTTP error, caller catches and logs.

```python
# backend/app/services/pushover.py
import httpx
from app.config import settings

PUSHOVER_URL = "https://api.pushover.net/1/messages.json"


class PushoverClient:
    def send(self, title: str, message: str, priority: int = 0) -> None:
        with httpx.Client(timeout=10) as client:
            r = client.post(PUSHOVER_URL, data={
                "token": settings.pushover_api_token,
                "user": settings.pushover_user_key,
                "title": title,
                "message": message or " ",  # Pushover rejects empty message
                "priority": priority,
            })
            r.raise_for_status()
```

### Pattern 4: FastAPI lifespan wiring
**What:** Convert `main.py` from no-lifespan to `@asynccontextmanager` lifespan that starts/stops scheduler.

```python
# backend/app/main.py
from contextlib import asynccontextmanager
from fastapi import FastAPI
from app.config import settings
from app.routers import tasks
from app.scheduler import scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.start()
    yield
    scheduler.shutdown()


app = FastAPI(title="My Secretary", lifespan=lifespan)
app.include_router(tasks.router)

@app.get(f"{settings.api_prefix}/health")
async def health():
    return {"status": "ok"}
```

### Pattern 5: Router integration
**What:** After DB commit on create/update, call `upsert_reminder(task)`. On delete and complete, call `remove_reminder(task_id)`.

```python
# In tasks.py create_task:
await session.commit()
await session.refresh(task)
upsert_reminder(task)
return task

# In tasks.py update_task (after setattr loop + commit):
upsert_reminder(task)   # handles null reminder_at → removes job

# In tasks.py delete_task (after session.delete + commit):
remove_reminder(task_id)

# In tasks.py complete (PATCH sets completed=True):
# update_task already calls upsert_reminder, which checks completed state is NOT the trigger
# D-06 requires remove on complete — update_task must detect completed=True and call remove_reminder
```

Note: `update_task` currently does not distinguish "task was completed" vs "field updated". To satisfy D-06, after the PATCH commit, check `task.completed` and call `remove_reminder(task_id)` if true, else `upsert_reminder(task)`.

### Anti-Patterns to Avoid
- **Async job function:** Never `async def _send_reminder` — APScheduler 3.x won't await it; use sync `def`
- **Empty Pushover message:** Pushover rejects `message=""` with HTTP 400 — always send at least a space
- **Not handling JobLookupError on remove:** `scheduler.remove_job()` raises `JobLookupError` if the job doesn't exist (already fired or never scheduled) — always wrap in try/except
- **Multiple workers:** Running uvicorn with `--workers 2+` causes duplicate APScheduler fires — single worker only
- **Async SQLAlchemy URL in jobstore:** `SQLAlchemyJobStore` uses the sync SQLAlchemy engine; pass URL with `+aiosqlite` stripped

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Job persistence across reboots | Custom DB table polling | `SQLAlchemyJobStore` | APScheduler handles missed-fire policy, dedup, job serialization |
| One-shot job cleanup | `reminder_fired_at` column + guard | `DateTrigger` (APScheduler auto-removes) | Built-in behavior, no extra migration needed |
| Pushover retry | Custom retry loop | Log and continue (v1) | Pushover is reliable; retry adds complexity; deferred per D-09 |

## Common Pitfalls

### Pitfall 1: Async job function silently fails
**What goes wrong:** `_send_reminder` is declared `async def`. APScheduler calls it, gets back a coroutine object, never awaits it. No exception is raised. Notifications never arrive.
**Why it happens:** APScheduler 3.x uses `ThreadPoolExecutor` for jobs; it doesn't know to await coroutines.
**How to avoid:** Always use `def` (sync) for APScheduler job callables.
**Warning signs:** No exceptions in logs but notifications don't arrive.

### Pitfall 2: Empty message body rejected by Pushover
**What goes wrong:** Task has no description → `body=""` → Pushover returns HTTP 400 `message cannot be blank`.
**Why it happens:** Pushover API requires non-empty `message` field.
**How to avoid:** Send `message or " "` (single space fallback).
**Warning signs:** `httpx.HTTPStatusError: 400` in logs on tasks without descriptions.

### Pitfall 3: JobLookupError on remove
**What goes wrong:** `scheduler.remove_job("reminder_task_42")` raises `apscheduler.jobstores.base.JobLookupError` when the job already fired (DateTrigger auto-removed it) or was never scheduled.
**Why it happens:** `remove_job` does not silently ignore missing jobs.
**How to avoid:** Wrap all `remove_job` calls in `try/except Exception: pass`.

### Pitfall 4: Scheduler not started when lifespan isn't wired
**What goes wrong:** Jobs are added via `scheduler.add_job()` but never fire because `scheduler.start()` was never called.
**Why it happens:** `main.py` currently has no lifespan; scheduler object exists but is never started.
**How to avoid:** Phase 3 Wave 0 must convert `main.py` to use `@asynccontextmanager` lifespan before any scheduler calls.
**Warning signs:** Jobs visible in DB jobstore table but never execute.

### Pitfall 5: Past `run_date` raises MisfireError
**What goes wrong:** If the Pi was down when a reminder was due, APScheduler detects `misfire_grace_time` expired and may skip the job rather than fire it late.
**Why it happens:** Default `misfire_grace_time` is 1 second.
**How to avoid:** Set `misfire_grace_time=None` (fire immediately regardless of latency) or a generous value like `misfire_grace_time=3600` on the scheduler or per-job. Given the gate test requires reboot resilience, this matters.
**Warning signs:** Gate test (create reminder, reboot, check notification) fails when reboot takes > 1 second.

## Code Examples

### Full upsert_reminder with misfire handling
```python
# Source: APScheduler 3.x docs — https://apscheduler.readthedocs.io/en/3.x/userguide.html
scheduler.add_job(
    _send_reminder,
    "date",
    run_date=task.reminder_at,   # must be timezone-aware datetime
    id=f"reminder_task_{task.id}",
    replace_existing=True,
    misfire_grace_time=3600,     # fire up to 1h late after reboot
    kwargs={
        "title": task.title,
        "body": task.description or "",
        "priority": 1 if task.priority and task.priority.value == "high" else 0,
    },
)
```

### Pushover API call (verified against pushover.net/api)
```python
# POST https://api.pushover.net/1/messages.json
# Required: token, user, message
# Optional: title, priority (-2 to 2; 1 = high bypasses quiet hours)
r = client.post("https://api.pushover.net/1/messages.json", data={
    "token": settings.pushover_api_token,
    "user": settings.pushover_user_key,
    "title": task.title,
    "message": task.description or " ",
    "priority": 1,  # or 0
})
r.raise_for_status()
```

### Config extension
```python
# backend/app/config.py additions
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    database_url: str = "sqlite+aiosqlite:///./secretary.db"
    api_prefix: str = "/api/v1"
    pushover_api_token: str = ""
    pushover_user_key: str = ""
```

### .env additions
```
PUSHOVER_API_TOKEN=your_30_char_app_token
PUSHOVER_USER_KEY=your_30_char_user_key
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| FastAPI `@app.on_event("startup")` | `@asynccontextmanager` lifespan | FastAPI 0.93+ | `on_event` deprecated; lifespan is the correct hook |

## Open Questions

1. **`misfire_grace_time` value**
   - What we know: Default is 1 second; gate test requires post-reboot fire
   - What's unclear: How long does a Pi 5 reboot + systemd service start take (typical: 30-90s)
   - Recommendation: Set `misfire_grace_time=3600` (1 hour) to guarantee gate test passes

2. **`reminder_at` timezone assumption**
   - What we know: `Task.reminder_at` is `DateTime(timezone=True)`; APScheduler needs timezone-aware `run_date`
   - What's unclear: Frontend sends UTC ISO strings; backend stores as UTC; should be fine as long as `reminder_at` is always UTC-aware
   - Recommendation: Verify `datetime` coming from SQLAlchemy has `tzinfo` set (aiosqlite + SQLAlchemy 2 with `timezone=True` column should return UTC-aware); if not, attach UTC explicitly before passing to `add_job`

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| APScheduler 3.x | Job scheduling | Already in project venv | 3.11.x | — |
| httpx | Pushover API calls | Already in project venv | 0.27.x | — |
| Pushover account + keys | Sending notifications | Must be configured in .env | — | Gate test will fail without valid credentials |

**Missing dependencies with no fallback:**
- `PUSHOVER_API_TOKEN` and `PUSHOVER_USER_KEY` env vars — must be set before gate test can pass; plan should include a step to document `.env.example` additions

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest (existing) |
| Config file | none — tests run via `pytest backend/tests/` |
| Quick run command | `cd backend && uv run pytest tests/ -x -q` |
| Full suite command | `cd backend && uv run pytest tests/ -q` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| NOTIF-01 | Scheduler upserts a job when task has `reminder_at` | unit | `pytest tests/test_scheduler.py::test_upsert_creates_job -x` | ❌ Wave 0 |
| NOTIF-01 | Scheduler removes job when task completed | unit | `pytest tests/test_scheduler.py::test_complete_removes_job -x` | ❌ Wave 0 |
| NOTIF-01 | Scheduler removes job when task deleted | unit | `pytest tests/test_scheduler.py::test_delete_removes_job -x` | ❌ Wave 0 |
| NOTIF-01 | Scheduler upserts removes job when `reminder_at` set to null | unit | `pytest tests/test_scheduler.py::test_null_reminder_removes_job -x` | ❌ Wave 0 |
| NOTIF-01 | Pushover client sends correct payload | unit | `pytest tests/test_pushover.py::test_send_payload -x` | ❌ Wave 0 |
| NOTIF-01 | Pushover client sends space when description is empty | unit | `pytest tests/test_pushover.py::test_empty_description -x` | ❌ Wave 0 |
| NOTIF-01 | Priority mapping: high → 1, medium → 0, low → 0 | unit | `pytest tests/test_pushover.py::test_priority_mapping -x` | ❌ Wave 0 |
| NOTIF-01 | End-to-end gate test: reboot + notification | manual | N/A — requires real Pi + Pushover credentials | manual-only |

### Sampling Rate
- **Per task commit:** `cd backend && uv run pytest tests/ -x -q`
- **Per wave merge:** `cd backend && uv run pytest tests/ -q`
- **Phase gate:** Full suite green + manual gate test (create reminder 2min out, reboot Pi, verify notification arrives)

### Wave 0 Gaps
- [ ] `tests/test_scheduler.py` — scheduler unit tests (mock APScheduler, verify add_job/remove_job calls)
- [ ] `tests/test_pushover.py` — Pushover client unit tests (mock httpx, verify payload fields)
- [ ] No framework changes needed — pytest already installed and configured

## Project Constraints (from CLAUDE.md)

- APScheduler 3.x (not 4.x alpha) — enforced
- Single uvicorn worker — enforced
- `id=` + `replace_existing=True` on every job — enforced
- httpx for async-compatible HTTP calls
- Typed Python (type hints on all new functions)
- No defensive coding for impossible states
- Error handling only at system boundaries (Pushover API call = system boundary → log + swallow on failure)
- No comments unless WHY is non-obvious

## Sources

### Primary (HIGH confidence)
- [APScheduler 3.x user guide](https://apscheduler.readthedocs.io/en/3.x/userguide.html) — SQLAlchemyJobStore config, DateTrigger, replace_existing
- [APScheduler DateTrigger module docs](https://apscheduler.readthedocs.io/en/3.x/modules/triggers/date.html) — run_date, timezone parameters
- [Pushover API reference](https://pushover.net/api) — endpoint, required fields, priority values

### Secondary (MEDIUM confidence)
- WebSearch: APScheduler 3.x + FastAPI lifespan patterns — multiple consistent examples confirm `@asynccontextmanager` lifespan approach

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project; no new dependencies
- Architecture: HIGH — APScheduler and Pushover APIs are stable and well-documented
- Pitfalls: HIGH — async job function issue and empty message issue are well-known, confirmed in docs

**Research date:** 2026-06-12
**Valid until:** 2026-09-12 (APScheduler 3.x is stable; Pushover API is versioned and stable)
