---
phase: 05-daily-brief-routines
plan: 02
subsystem: backend
tags: [brief, scheduler, pushover, settings, apscheduler]
dependency_graph:
  requires: [05-01]
  provides: [CAL-06, NOTIF-02]
  affects: [backend/app/services/brief.py, backend/app/routers/settings.py, backend/app/scheduler.py]
tech_stack:
  added: []
  patterns: [sync-SQLAlchemy-for-APScheduler-jobs, naive-datetime-for-SQLite-comparisons, module-level-import-for-patch-seam]
key_files:
  created:
    - backend/app/services/brief.py
    - backend/app/schemas/settings.py
    - backend/app/routers/settings.py
  modified:
    - backend/app/config.py
    - backend/app/models/__init__.py
    - backend/app/scheduler.py
    - backend/app/main.py
decisions:
  - Use local (naive) datetimes for SQLite datetime comparisons — SQLite strips timezone info on storage, tz-aware comparisons silently fail
  - Import PushoverClient at module level in brief.py so tests can patch app.services.brief.PushoverClient
  - Lifespan wraps brief startup scheduling in try/except with 08:00 fallback for first-boot safety
metrics:
  duration: 25m
  completed: 2026-06-13
  tasks_completed: 2
  files_changed: 7
---

# Phase 05 Plan 02: Daily Brief — Service, Scheduler, Settings Summary

Implemented daily brief end-to-end: Pushover notification with today's agenda at a configurable time, backed by a single-row AppSettings DB model, a GET/PUT settings API, and APScheduler cron job registered on startup.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Timezone config, AppSettings model, brief service, scheduler helper | 5494cbc | config.py, models/__init__.py, services/brief.py, scheduler.py |
| 2 | Brief-time schemas, settings router, lifespan startup wiring | 19c0338 | schemas/settings.py, routers/settings.py, main.py |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] SQLite naive datetime comparison fix**
- **Found during:** Task 1 TDD green phase
- **Issue:** SQLite stores datetimes without timezone info. Comparing stored naive datetimes against `datetime.now(timezone.utc)` (tz-aware) always returned no results.
- **Fix:** Changed `build_brief_body()` to use `datetime.now()` (local, naive) for today's date range, consistent with how the ORM stores values to SQLite.
- **Files modified:** backend/app/services/brief.py
- **Commit:** 5494cbc

**2. [Rule 1 - Bug] PushoverClient must be module-level import for patch seam**
- **Found during:** Task 1 first test run
- **Issue:** test_brief.py patches `app.services.brief.PushoverClient` but the original implementation imported it inside the function body, making it unpatchable at that path.
- **Fix:** Moved `from app.services.pushover import PushoverClient` to module level.
- **Files modified:** backend/app/services/brief.py
- **Commit:** 5494cbc

## Verification

Full test suite: 33 passed, 0 failed.

## Self-Check: PASSED

- backend/app/services/brief.py: exists, contains `build_brief_body`, `send_daily_brief`, `title="Good morning"`, `priority=0`, `"Nothing scheduled today."`, references `start_dt` not `CalendarEvent.date`
- backend/app/models/__init__.py: contains `class AppSettings`, `brief_hour`, `brief_minute`
- backend/app/scheduler.py: contains `def schedule_daily_brief(`, `id="daily_brief"`, `misfire_grace_time=None`
- backend/app/schemas/settings.py: contains `class BriefTimeRead`, `class BriefTimeUpdate`
- backend/app/routers/settings.py: contains `/brief-time` GET and PUT, calls `schedule_daily_brief(`
- backend/app/main.py: contains `include_router` for settings router, calls `schedule_daily_brief(` in lifespan
- Commits 5494cbc and 19c0338 verified in git log
