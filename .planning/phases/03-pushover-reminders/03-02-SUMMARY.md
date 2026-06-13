---
phase: 03-pushover-reminders
plan: "02"
subsystem: backend
tags: [pushover, apscheduler, scheduler, notifications, lifespan]
dependency_graph:
  requires: ["03-01 config/test scaffold"]
  provides: ["PushoverClient.send", "scheduler singleton", "upsert_reminder", "remove_reminder", "FastAPI lifespan"]
  affects: ["backend/app/main.py", "backend/app/services/pushover.py", "backend/app/scheduler.py"]
tech_stack:
  added: ["apscheduler==3.11.2", "httpx>=0.27 (runtime dep)"]
  patterns: ["AsyncIOScheduler + SQLAlchemyJobStore", "asynccontextmanager lifespan", "deferred import to avoid circular dependency", "sync httpx.Client in APScheduler job"]
key_files:
  created:
    - backend/app/services/__init__.py
    - backend/app/services/pushover.py
    - backend/app/scheduler.py
    - backend/tests/test_pushover.py
    - backend/tests/test_scheduler.py
    - backend/tests/conftest.py
  modified:
    - backend/app/main.py
    - backend/app/config.py
    - backend/.env.example
    - backend/pyproject.toml
decisions:
  - "Sync httpx.Client (not AsyncClient) in PushoverClient.send — APScheduler 3.x runs jobs in thread pool, not async context"
  - "Deferred PushoverClient import in _send_reminder to avoid circular import at module load"
  - "conftest.py fixture creates SQLite schema for test isolation (pre-existing gap in worktree)"
  - "APScheduler add_jobstore replace_existing is not a valid kwarg — must remove_jobstore first then re-add in tests"
metrics:
  duration: "~15 minutes"
  completed: "2026-06-12"
  tasks_completed: 3
  tasks_total: 3
  files_changed: 10
---

# Phase 03 Plan 02: Pushover + Scheduler Core Summary

**One-liner:** PushoverClient (sync httpx wrapper) + AsyncIOScheduler singleton with SQLAlchemyJobStore persistence, upsert/remove job helpers, and FastAPI asynccontextmanager lifespan — all Wave 0 tests GREEN.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | PushoverClient implementation | 705c5e4 | services/pushover.py, tests/test_pushover.py |
| 2 | Scheduler singleton + upsert/remove | 1f52fb8 | scheduler.py, tests/test_scheduler.py |
| 3 | FastAPI lifespan wiring | 526a09b | main.py, tests/conftest.py |

## Verification

- `uv run pytest tests/ -q` — 15 passed, 0 failed
- `python -c "from app.main import app; from app.scheduler import scheduler, upsert_reminder, remove_reminder; from app.services.pushover import PushoverClient"` — exits 0, no circular import

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] APScheduler and httpx missing from pyproject.toml**
- **Found during:** Task 1 — `ModuleNotFoundError: No module named 'apscheduler'`
- **Fix:** Added `apscheduler>=3.11,<4.0` and `httpx>=0.27` to `[project].dependencies` in pyproject.toml
- **Files modified:** backend/pyproject.toml
- **Commit:** 705c5e4

**2. [Rule 1 - Bug] APScheduler add_jobstore rejects replace_existing kwarg**
- **Found during:** Task 2 test fixture — `TypeError: BaseScheduler.add_jobstore() got an unexpected keyword argument 'replace_existing'`
- **Fix:** Changed fixture to `scheduler.remove_jobstore("default")` then `scheduler.add_jobstore(MemoryJobStore(), "default")`
- **Files modified:** backend/tests/test_scheduler.py
- **Commit:** 1f52fb8

**3. [Rule 1 - Bug] Pre-existing test_tasks failures — no DB schema in worktree**
- **Found during:** Task 3 full-suite run
- **Issue:** `sqlite3.OperationalError: no such table: tasks` — tests used file-based SQLite with no Alembic run
- **Fix:** Created conftest.py that creates SQLAlchemy schema via `Base.metadata.create_all` for the test session and patches app_db engine/SessionLocal
- **Files modified:** backend/tests/conftest.py (created)
- **Commit:** 526a09b

**4. [Rule 3 - Blocking] Test files from plan 03-01 not present in worktree**
- **Found during:** Task 1 — parallel agent worktree had no test_pushover.py or test_scheduler.py
- **Fix:** Created test files as part of this plan's TDD RED phase before implementing (plans ran in parallel)
- **Files modified:** backend/tests/test_pushover.py, backend/tests/test_scheduler.py (created)
- **Commit:** 705c5e4

## Known Stubs

None — all implementation is wired. PushoverClient.send makes real HTTP calls (mocked in tests).

## Self-Check: PASSED
