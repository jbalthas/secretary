---
phase: 05-daily-brief-routines
plan: "03"
subsystem: backend
tags: [routines, scheduler, apscheduler, crud, cron]
dependency_graph:
  requires: ["05-02"]
  provides: ["routines-crud", "CAL-07"]
  affects: ["backend/app/models", "backend/app/scheduler", "backend/app/routers"]
tech_stack:
  added: []
  patterns: ["CronTrigger.from_crontab for cron validation at schema boundary", "routine_{id} job id convention", "remove_routine before session.delete (Pitfall 3)"]
key_files:
  created:
    - backend/app/schemas/routine.py
    - backend/app/routers/routines.py
  modified:
    - backend/app/models/__init__.py
    - backend/app/scheduler.py
    - backend/app/main.py
decisions:
  - "Cron validation done at Pydantic schema layer via field_validator so FastAPI auto-returns 422 without try/except in endpoint"
  - "schedule_routine binds send_daily_brief directly (Phase 6 will branch on routine.action)"
  - "remove_routine called before session.delete to avoid dangling scheduler jobs"
metrics:
  duration: "~20 minutes"
  completed: "2026-06-14"
  tasks_completed: 2
  files_modified: 5
---

# Phase 05 Plan 03: Recurring Routines CRUD Summary

**One-liner:** Routine model + APScheduler helpers + full async CRUD router with cron validation yielding 422 on bad expressions.

## Tasks Completed

| Task | Description | Commit |
|------|-------------|--------|
| 1 | Routine model (RoutineAction enum, Routine table), schedule_routine/remove_routine scheduler helpers | d73411e |
| 2 | RoutineCreate/Update/Read schemas with cron field_validator, CRUD router, mount in main.py | 1c496da |

## What Was Built

- `RoutineAction` enum (`send_daily_brief`) and `Routine` SQLAlchemy model in `models/__init__.py`
- `schedule_routine(routine)` — registers APScheduler job with id `routine_{id}` using `CronTrigger.from_crontab`
- `remove_routine(routine_id)` — removes job, swallows missing-job errors
- `RoutineCreate`, `RoutineUpdate`, `RoutineRead` Pydantic schemas; `field_validator` on `cron` field calls `CronTrigger.from_crontab` and raises `ValueError` on invalid input → FastAPI returns 422
- Full async CRUD router: `GET /api/v1/routines/`, `POST /` (201), `PATCH /{id}` (200), `DELETE /{id}` (204)
- Routines router mounted in `main.py`

## Verification

- `python -m pytest tests/test_routines.py -q` — 5/5 passed
- Full suite: 37/38 passed (1 pre-existing failure in `test_callback_stores_credentials` unrelated to this plan)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree missing AppSettings, schedule_daily_brief, settings router, brief service**
- **Found during:** Task 1 verification
- **Issue:** The worktree was branched before 05-02 landed; `models/__init__.py` lacked `AppSettings`, `scheduler.py` lacked `schedule_daily_brief`, `routers/` lacked `settings.py`, `services/` lacked `brief.py`
- **Fix:** Carried forward all 05-02 artifacts into the worktree alongside the new 05-03 work
- **Files modified:** backend/app/models/__init__.py, backend/app/scheduler.py, backend/app/main.py, backend/app/routers/settings.py, backend/app/services/brief.py
- **Commit:** 1c496da

**2. [Rule 3 - Blocking] Missing itsdangerous module in .venv**
- **Found during:** Task 2 test run
- **Issue:** `starlette.middleware.sessions` requires `itsdangerous` which wasn't installed
- **Fix:** `uv add itsdangerous`
- **Commit:** n/a (dependency change in pyproject.toml/uv.lock)

## Known Stubs

None — routines CRUD is fully wired to the DB and scheduler.

## Self-Check: PASSED

- backend/app/schemas/routine.py — FOUND
- backend/app/routers/routines.py — FOUND
- backend/app/models/__init__.py contains `class Routine` — FOUND
- backend/app/scheduler.py contains `schedule_routine` and `remove_routine` — FOUND
- Commits d73411e and 1c496da — FOUND
