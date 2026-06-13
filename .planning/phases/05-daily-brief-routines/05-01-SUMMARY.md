---
phase: 05-daily-brief-routines
plan: 01
subsystem: testing
tags: [pytest, apscheduler, pushover, sqlalchemy, brief, routines]

requires:
  - phase: 03-pushover-reminders
    provides: PushoverClient.send, APScheduler scheduler singleton, upsert/remove_reminder patterns
  - phase: 02-tasks-agenda
    provides: Task and CalendarEvent models, conftest fixtures, TestClient pattern

provides:
  - Failing test contract for app.services.brief (build_brief_body, send_daily_brief)
  - Failing test contract for GET/PUT /api/v1/settings/brief-time
  - Failing test contract for /api/v1/routines/ CRUD + cron validation

affects: [05-02, 05-03]

tech-stack:
  added: []
  patterns:
    - "Patch seam: app.services.brief._Session for sync DB injection in brief service tests"
    - "MemoryJobStore autouse fixture for APScheduler test isolation (from test_scheduler.py)"

key-files:
  created:
    - backend/tests/test_brief.py
    - backend/tests/test_settings.py
    - backend/tests/test_routines.py
  modified: []

key-decisions:
  - "Brief patch seam is app.services.brief._Session (module-level sessionmaker factory) - Plan 02 must expose this name"
  - "Bullet character for untimed items: U+2022 (•) as used in CONTEXT specifics"

patterns-established:
  - "test_brief.py: imports deferred inside each test function to survive ModuleNotFoundError collection phase"

requirements-completed: [CAL-06, CAL-07, NOTIF-02]

duration: 15min
completed: 2026-06-13
---

# Phase 05 Plan 01: Daily Brief & Routines - Test Scaffold Summary

**Three RED pytest files pin the behavioral contract (D-01 through D-11) for daily brief, brief-time settings endpoint, and routines CRUD before any implementation exists.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-06-13T00:00:00Z
- **Completed:** 2026-06-13T00:15:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- 4 failing tests for `app.services.brief`: good morning title, empty placeholder, timed event format, task bullet
- 3 failing tests for `GET/PUT /api/v1/settings/brief-time` including job reschedule assertion
- 5 failing tests for `/api/v1/routines/` CRUD including 422 invalid cron case
- All 12 new tests are RED; existing 11 tests remain green

## Task Commits

1. **Task 1: Write failing tests for brief service** - `f9e65ac` (test)
2. **Task 2: Write failing tests for settings + routines routers** - `11d35a6` (test)

## Files Created/Modified
- `backend/tests/test_brief.py` - 4 tests for build_brief_body() + send_daily_brief(); patch seam documented
- `backend/tests/test_settings.py` - 3 tests for GET/PUT /api/v1/settings/brief-time
- `backend/tests/test_routines.py` - 5 tests for routines CRUD + cron validation

## Decisions Made
- Patch seam name chosen as `app.services.brief._Session` to mirror the `app.services.sync._Session` pattern already used in conftest.py
- Deferred imports inside each test function (not at module level) so pytest collection succeeds even before brief.py exists — test names are registered even though they fail

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 02 must create `app/services/brief.py` with `_Session` factory seam, `build_brief_body()`, and `send_daily_brief()`
- Plan 02 must mount `routers/settings.py` and `routers/routines.py` in `main.py`
- All 12 tests will turn GREEN once Plan 02/03 implementation is complete

---
*Phase: 05-daily-brief-routines*
*Completed: 2026-06-13*
