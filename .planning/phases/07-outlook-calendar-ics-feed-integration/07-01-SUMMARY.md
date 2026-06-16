---
phase: 07-outlook-calendar-ics-feed-integration
plan: 01
subsystem: backend-calendar-sync
tags: [ics, icalendar, outlook, tdd, wave-0, contract]
requires:
  - backend/app/services/sync.py (_Session, _upsert pattern — reused, not modified this plan)
  - backend/tests/conftest.py (fake_credentials_json pattern — mirrored)
  - backend/app/models/calendar.py (CalendarEvent — reused as-is)
provides:
  - icalendar + recurring-ical-events dependencies (installed, importable)
  - Settings.outlook_ics_url config field (default "")
  - OUTLOOK_ICS_URL documented in .env.example
  - fake_sync_session conftest fixture (seeds Google row, patches sync._Session, yields sessionmaker)
  - 7 RED tests defining the full Outlook ICS sync contract
affects:
  - Plan 02 (implements sync_outlook_ics to turn these 7 tests GREEN)
tech-stack:
  added:
    - icalendar 7.1.3 (ICS parsing)
    - recurring-ical-events 3.8.x (RRULE/EXDATE expansion)
  patterns:
    - dynamic test fixture relative to date.today()+7d to stay inside today+90d window
    - replace-on-sync contract via outlook:% LIKE scope
key-files:
  created:
    - backend/tests/test_outlook_ics_sync.py
  modified:
    - backend/pyproject.toml
    - backend/uv.lock
    - backend/app/config.py
    - backend/.env.example
    - backend/tests/conftest.py
decisions:
  - "[07-01] Dynamic _make_fixture(base=date.today()+7d) instead of static Sep-2026 ICS — static dates fall outside the today+90d window on the 2026-06-15 run date, which would make test_recurring_event_expanded non-deterministic"
  - "[07-01] fake_sync_session yields the TestSyncSession sessionmaker (not just patches it) so tests can query the DB directly, distinct from fake_credentials_json which yields the creds string"
metrics:
  duration: 2m22s
  tasks: 3
  files: 6
  completed: 2026-06-15
---

# Phase 7 Plan 01: Outlook ICS Sync Contract (Wave 0 RED) Summary

Established the Wave 0 executable contract for the Outlook ICS feed sync: added the
`icalendar` + `recurring-ical-events` parse/expand dependencies, added the
`OUTLOOK_ICS_URL` config knob (default empty → no-op), and wrote all 7 failing (RED)
tests plus the `fake_sync_session` test-DB fixture they depend on. Every test fails by
design because `app.services.sync.sync_outlook_ics` does not exist yet — exactly the RED
state Plan 02 will turn GREEN.

## What Was Built

### Task 1 — Dependencies + config (`fec3bdd`)
- Added `icalendar>=7.1,<8.0` and `recurring-ical-events>=3.8,<4.0` to
  `[project].dependencies` (framework deps, not the dev group); installed via `uv sync`
  (resolved icalendar 7.1.3).
- Added `outlook_ics_url: str = ""` to the `Settings` class; pydantic-settings auto-maps
  the `OUTLOOK_ICS_URL` env var.
- Documented `OUTLOOK_ICS_URL=` in `.env.example`.

### Task 2 — `fake_sync_session` fixture (`3fbd28f`)
- Mirrors `fake_credentials_json`'s sync-engine-on-test-DB approach but purpose-built for
  the Outlook tests: builds a sync engine on the test DB, seeds exactly one pre-existing
  Google row (`google_event_keep_1`) so deletion-scope tests can assert it survives the
  Outlook replace-sync, patches `app.services.sync._Session`, and yields the
  `TestSyncSession` sessionmaker. Cleans up all `CalendarEvent` rows and disposes the
  engine after yield.

### Task 3 — 7 RED tests (`cfffeab`)
- `backend/tests/test_outlook_ics_sync.py` (185 lines) with a module-level
  `_make_fixture(base=None, include_timed=True)` helper that builds VCALENDAR bytes with
  dates relative to `date.today() + 7d`: a timed event, an all-day event, and a weekly
  `RRULE COUNT=4` recurring event with one `EXDATE` (→ 3 in-window occurrences).
- The 7 tests pin: timed event storage (tz-aware `start_dt`/`end_dt`, `all_day=False`),
  all-day storage (`start_date` YYYY-MM-DD, `all_day=True`, null `start_dt`), recurring
  expansion (exactly 3 rows), deletion propagation (re-sync without an event removes it),
  Google rows untouched, no-op when URL unset (no `_fetch_ics` call), and
  fetch-failure-swallowed (no raise).

## Verification

- `uv run python -c "import icalendar, recurring_ical_events; ..."` → `OK 7.1.3 ...` (exit 0)
- `settings.outlook_ics_url == ""` confirmed.
- `uv run pytest tests/ --collect-only -q` → 54 tests collected, exit 0 (conftest imports cleanly).
- `uv run pytest tests/test_outlook_ics_sync.py` → RED:
  `ImportError: cannot import name 'sync_outlook_ics' from 'app.services.sync'` (exit 2) —
  the intended Wave 0 state.
- Existing suite collects cleanly excluding the intentional new-file import error.

## Deviations from Plan

### Environment correction (not a code deviation)

The execution worktree was branched from a stale commit (`fcb844a`, 18 commits behind
master) that predated the phase 07 planning directory. The phase 07 planning artifacts
(`07-01-PLAN.md`, `07-CONTEXT.md`, `07-RESEARCH.md`, `07-VALIDATION.md`, etc.) existed
only on master, so they were copied from `master:` into the worktree so the plan and its
`@`-referenced context (and this SUMMARY's destination directory) exist. All `backend/`
prerequisites the plan depends on (`_Session` in sync.py, `fake_credentials_json` in
conftest, `webhook_secret` in config, `TEST_DB_URL`) were verified present in the worktree
before executing, and `sync_outlook_ics` was confirmed absent (correct RED start). No plan
task logic was changed.

### Code deviations

None — all three tasks executed exactly as written. The plan itself pre-empted the one
real risk (static Sep-2026 fixture dates falling outside the expansion window) by
mandating the dynamic `_make_fixture` helper, which was implemented as specified.

## Known Stubs

None. The RED test file is the intended Wave 0 deliverable; `sync_outlook_ics` is
deliberately unimplemented and is the explicit subject of Plan 02.

## Self-Check: PASSED

All 6 created/modified files present on disk; all 3 task commits (`fec3bdd`, `3fbd28f`,
`cfffeab`) found in git history.
