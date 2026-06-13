---
phase: 04-calendar-sync
plan: "03"
subsystem: backend/calendar-sync
tags: [calendar, sync, google-api, apscheduler, fastapi]
dependency_graph:
  requires: [04-01, 04-02]
  provides: [sync_calendar, events_today_endpoint, calendar_sync_job]
  affects: [backend/app/services/sync.py, backend/app/routers/events.py, backend/app/scheduler.py, backend/app/main.py]
tech_stack:
  added: [google-api-python-client calendar-v3]
  patterns: [sync-sqlalchemy-in-thread-pool, apsscheduler-interval-job, 410-full-resync, invalid-grant-pushover-alert]
key_files:
  created:
    - backend/app/services/sync.py
    - backend/app/routers/events.py
  modified:
    - backend/app/scheduler.py
    - backend/app/main.py
    - backend/tests/conftest.py
decisions:
  - "Use datetime.fromisoformat with Z→+00:00 replacement instead of python-dateutil (not installed)"
  - "fake_credentials_json fixture patches app.services.sync._Session to use test DB and inserts CalendarSync row for sync_calendar test isolation"
metrics:
  duration_minutes: 25
  completed_date: "2026-06-13"
  tasks_completed: 3
  files_changed: 5
---

# Phase 04 Plan 03: Calendar Sync Engine Summary

One-liner: Synchronous Google Calendar sync engine with incremental/full-sync, 410 fallback, invalid_grant Pushover alert, 5-min APScheduler job, and GET /api/v1/events/today endpoint.

## What Was Built

- `backend/app/services/sync.py`: `sync_calendar()` function handling incremental sync (syncToken path), full sync (timeMin pagination), HTTP 410 fallback (clear token → re-sync), and RefreshError invalid_grant (Pushover alert + clear credentials). Uses synchronous SQLAlchemy session to avoid running blocking I/O on the async event loop.
- `backend/app/routers/events.py`: `GET /api/v1/events/today` returning today's non-cancelled CalendarEvents as `CalendarEventOut` list (all-day matched by start_date, timed matched by start_dt range).
- `backend/app/scheduler.py`: `schedule_calendar_sync()` registers a 5-minute IntervalTrigger job with `id="calendar_sync"` and `replace_existing=True`.
- `backend/app/main.py`: lifespan calls `schedule_calendar_sync()` then `await run_in_threadpool(sync_calendar)` for a startup sync, with silent exception handling so startup never fails if calendar is disconnected.

## Tests

All 6 `tests/test_calendar.py` tests pass. Full suite: 26 passed.

## Deviations from Plan

**1. [Rule 1 - Bug] dateutil not available — used stdlib datetime.fromisoformat**
- Found during: Task 1
- Issue: `from dateutil.parser import parse` raised ModuleNotFoundError; python-dateutil not in pyproject.toml
- Fix: Replaced with `datetime.fromisoformat(s.replace("Z", "+00:00"))` (Python 3.11+ handles ISO 8601 with timezone offset)
- Files modified: backend/app/services/sync.py

**2. [Rule 2 - Missing test infrastructure] conftest fake_credentials_json didn't insert CalendarSync row**
- Found during: Task 1 verification
- Issue: sync_calendar reads CalendarSync id=1 from DB; conftest fixture only returned a JSON string without DB setup, so tests using fake_credentials_json would early-return from sync_calendar and not call the mock service
- Fix: Updated `fake_credentials_json` fixture to upsert a CalendarSync row in the test DB using a sync SQLAlchemy session, and patch `app.services.sync._Session` with the test session factory
- Files modified: backend/tests/conftest.py

## Self-Check: PASSED

- `backend/app/services/sync.py` exists and contains `def sync_calendar`, `status_code == 410`, `invalid_grant`, `on_conflict_do_update`, `nextSyncToken`, `PushoverClient`
- `backend/app/routers/events.py` exists and contains `/today`, `cancelled == False`, `CalendarEventOut`
- `backend/app/main.py` contains `events.router`, `schedule_calendar_sync`, `run_in_threadpool`
- `backend/app/scheduler.py` contains `def schedule_calendar_sync`, `minutes=5`, `id="calendar_sync"`
- Commits: c96b134 (sync.py + conftest), 5690d51 (events router), ef51c15 (scheduler + lifespan)
