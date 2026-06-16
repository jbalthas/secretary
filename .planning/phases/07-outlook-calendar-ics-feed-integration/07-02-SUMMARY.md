---
phase: 07-outlook-calendar-ics-feed-integration
plan: 02
subsystem: backend-calendar-sync
tags: [ics, icalendar, outlook, recurrence, scheduler, tdd, wave-2, green]
requires:
  - backend/app/services/sync.py (_Session, _upsert, delete — reused)
  - backend/tests/test_outlook_ics_sync.py (the 7 RED tests from Plan 01 — turned GREEN)
  - backend/tests/conftest.py (fake_sync_session fixture — used unchanged)
  - backend/app/models/calendar.py (CalendarEvent — extended with UtcDateTime)
  - icalendar + recurring-ical-events (installed in Plan 01)
provides:
  - sync_outlook_ics() + _fetch_ics/_expand_ics/_parse_ics_component/_replace_sync in sync.py
  - schedule_outlook_ics_sync() job (id="outlook_ics_sync") on the 5-min IntervalTrigger
  - main.py lifespan wiring: schedule + best-effort startup run
  - UtcDateTime TypeDecorator (UTC-aware read-back for CalendarEvent.start_dt/end_dt)
affects:
  - Today view / daily brief / TTS now show Outlook class events merged with Google (no per-source distinction)
tech-stack:
  added: []
  patterns:
    - replace-on-sync via delete(google_id LIKE "outlook:%") then _upsert each occurrence
    - separate APScheduler job id keeps Google and Outlook sync paths independent
    - UtcDateTime TypeDecorator re-attaches UTC on read since SQLite drops tzinfo
key-files:
  created:
    - .planning/phases/07-outlook-calendar-ics-feed-integration/deferred-items.md
  modified:
    - backend/app/services/sync.py
    - backend/app/models/calendar.py
    - backend/app/scheduler.py
    - backend/app/main.py
    - .gitignore
decisions:
  - "[07-02] UID domain stripped (split on @) so google_id is outlook:<local-uid>:<compact> — the Plan 01 contract tests filter on outlook:timed-event-001:%, which the full UID (timed-event-001@university.edu) would never match. Tests are authoritative."
  - "[07-02] Added UtcDateTime TypeDecorator on CalendarEvent.start_dt/end_dt: SQLite stores DateTime(timezone=True) by dropping the offset and reads back naive; the contract requires timed events tz-aware. The decorator stores UTC and re-attaches UTC on read, and passes ISO-string bounds through (Google path compares start_dt < '<iso>Z')."
  - "[07-02] Separate job id 'outlook_ics_sync' (not folded into calendar_sync) so a slow/failing Outlook fetch never blocks Google sync; each has independent misfire handling."
metrics:
  duration: ~44m
  tasks: 2
  files: 5
  completed: 2026-06-15
---

# Phase 7 Plan 02: Outlook ICS Sync Implementation (Wave 2 GREEN) Summary

Implemented the Outlook/Office365 ICS feed sync end-to-end, turning the 7 RED contract
tests from Plan 01 GREEN. An unauthenticated ICS feed is fetched with a browser
User-Agent, recurrence-expanded over a 90-day forward window via `recurring_ical_events`,
and replace-synced into the existing `calendar_events` table under `outlook:<uid>:<compact>`
ids — so class events appear merged in the Today view, daily brief, and TTS with no
per-source distinction, no new table, no migration. Wired onto the existing 5-minute
scheduler tick (separate job id) plus a best-effort startup run.

## What Was Built

### Task 1 — sync_outlook_ics + helpers + tz-aware read-back (`6de6aa3`)
- `backend/app/services/sync.py`: added `_fetch_ics` (httpx, browser UA, follow redirects,
  15s timeout), `_expand_ics` (icalendar parse + `recurring_ical_events.of(cal).between(
  today, today+90d)`), `_parse_ics_component` (timed → tz-aware UTC `start_dt`/`end_dt`,
  `all_day=False`; all-day → `start_date` "YYYY-MM-DD", `all_day=True`, null `start_dt`),
  `_replace_sync` (delete `outlook:%` then `_upsert` each occurrence in one transaction),
  and `sync_outlook_ics` (no-op when url unset; single try/except swallows + logs all
  fetch/parse errors). Module constants `_OUTLOOK_UA`, `_OUTLOOK_WINDOW_DAYS`, `_log`.
- `backend/app/models/calendar.py`: added `UtcDateTime` TypeDecorator and applied it to
  `start_dt`/`end_dt` so SQLite read-back is UTC tz-aware (see Deviations).
- The Google sync path (`sync_calendar`, `_parse_event`, `_full_sync`) is unmodified.

### Task 2 — scheduler + lifespan wiring (`bde4084`)
- `backend/app/scheduler.py`: `schedule_outlook_ics_sync()` mirrors `schedule_calendar_sync`
  with a SEPARATE job id `outlook_ics_sync` on the same 5-min `IntervalTrigger`,
  `misfire_grace_time=300`, `replace_existing=True`.
- `backend/app/main.py`: extended the scheduler import, called `schedule_outlook_ics_sync()`
  in `lifespan` after `schedule_calendar_sync()`, and added a best-effort startup
  `await run_in_threadpool(sync_outlook_ics)` so the feed populates immediately.

## Verification

- `uv run pytest tests/test_outlook_ics_sync.py` → 7 passed (all RED tests now GREEN).
- `uv run pytest tests/` → 67 passed, 1 failed. The single failure
  (`test_calendar.py::test_callback_stores_credentials`, a 404 on the OAuth callback route)
  fails identically on `master` (verified via `git stash`) and is unrelated to this plan —
  logged to `deferred-items.md`, left untouched per the Scope Boundary.
- `uv run python -c "from app.scheduler import schedule_outlook_ics_sync; import app.main"`
  → IMPORT OK (exit 0).
- Grep confirms in sync.py: `sync_outlook_ics`, `Mozilla/5.0 (Linux) Chrome/139`,
  `outlook:%` delete scope, `recurring_ical_events.of(cal).between(`; in scheduler.py:
  `schedule_outlook_ics_sync`, `id="outlook_ics_sync"`, `IntervalTrigger(minutes=5)`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] UID domain stripped so ids match the contract**
- **Found during:** Task 1 (4 of 7 tests returned 0 rows).
- **Issue:** The plan's `_parse_ics_component` spec built `google_id = f"outlook:{uid}:..."`
  with the full UID. The Plan 01 fixture UIDs are `timed-event-001@university.edu`, but the
  authoritative tests filter `like("outlook:timed-event-001:%")` — which the full UID
  (`...timed-event-001@university.edu:...`) can never match (the char after the slug is `@`,
  not `:`). Rows were written but invisible to the test queries.
- **Fix:** `uid = str(component.get("UID", "")).split("@", 1)[0]` — use the UID local part.
- **Files modified:** `backend/app/services/sync.py`
- **Commit:** `6de6aa3`

**2. [Rule 2 - Missing correctness] UtcDateTime for tz-aware read-back**
- **Found during:** Task 1 (`test_timed_event_stored` failed `row.start_dt.tzinfo is not None`).
- **Issue:** `CalendarEvent.start_dt/end_dt` were `DateTime(timezone=True)`, but SQLite +
  SQLAlchemy store aware datetimes by dropping the offset and read them back **naive**. The
  contract (and the phase goal of correct local-time rendering) requires timed events to be
  tz-aware on read.
- **Fix:** Added a `UtcDateTime` TypeDecorator (impl `DateTime(timezone=True)`) that stores
  values as UTC and re-attaches UTC tzinfo on read; it also coerces ISO-string bind params
  (the Google `_full_sync` path compares `start_dt < '<iso>Z'`) so that path keeps working.
- **Files modified:** `backend/app/models/calendar.py`
- **Commit:** `6de6aa3`
- **Regression check:** The two Google sync tests this initially broke
  (`test_incremental_sync`, `test_full_resync_on_410`) now pass; full suite green except the
  pre-existing out-of-scope failure.

### Out-of-scope discovery (not fixed)

`test_calendar.py::test_callback_stores_credentials` (404 on OAuth callback) fails on
`master` before any Plan 02 change. Logged to `deferred-items.md`; not addressed here.

## Known Stubs

None. `sync_outlook_ics` is fully implemented and wired; behavior is pinned by the 7 GREEN
tests. Live-feed verification (set `OUTLOOK_ICS_URL` on the Pi, confirm class events render
at correct local times in Today/brief) is a post-deploy human gate per VALIDATION.md, not a
code stub.

## Self-Check: PASSED
