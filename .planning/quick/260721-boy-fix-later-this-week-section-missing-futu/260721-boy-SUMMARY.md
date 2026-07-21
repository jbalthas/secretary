---
phase: quick-260721-boy
plan: 01
subsystem: api, ui
tags: [fastapi, sqlalchemy, react, calendar, today-view]

# Dependency graph
requires: []
provides:
  - "GET /api/v1/events/range?start=YYYY-MM-DD&days=N backend endpoint, additive to the untouched /events/today"
  - "useCalendarEvents(days) hook — days<=1 keeps the /today fetch, days>1 opts into the ranged fetch"
  - "Today.tsx 'Later this week' column now receives real calendar events for offsets 1-6"
affects: [today-page, organize-page, calendar-sync]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Opt-in widening: hooks default to the narrowest/most-tested behavior (days=1) and only widen scope when a caller explicitly asks (days=7), so unrelated consumers (Organize.tsx) stay untouched by construction."
    - "Server-side window padding (+/-1 day) to absorb UTC-storage vs local-grouping mismatches, with client-side re-filtering by local date key doing the final trim."

key-files:
  created: []
  modified:
    - backend/app/routers/events.py
    - backend/tests/test_calendar.py
    - frontend/src/hooks/useCalendarEvents.ts
    - frontend/src/pages/Today.tsx

key-decisions:
  - "Left GET /events/today byte-identical rather than reimplementing it on top of /range, to guarantee Organize.tsx's busy-timeline behavior could not regress."
  - "Built the /range start param from local date parts (not toISOString) in the frontend hook so the query window boundary matches agenda.ts's local-timezone day grouping near midnight."

patterns-established:
  - "Range endpoints that back client-side local-date grouping should pad their UTC window by one day on each side and let the client do the authoritative local-date filter, rather than trying to replicate local-timezone logic in the DB query."

requirements-completed: [QUICK-260721-BOY]

# Metrics
duration: 24min
completed: 2026-07-21
---

# Quick Fix 260721-boy: Later This Week Missing Future Events Summary

**Added a padded `/api/v1/events/range` endpoint and an opt-in `useCalendarEvents(days)` hook so Today.tsx's "Later this week" column shows real calendar events on days 1-6 instead of just tasks.**

## Performance

- **Duration:** 24 min (08:28:28 to time of human-verify approval)
- **Tasks:** 3 (2 auto + 1 checkpoint:human-verify)
- **Files modified:** 4

## Accomplishments
- New `GET /api/v1/events/range?start=YYYY-MM-DD&days=N` backend endpoint returns non-cancelled all-day and timed events across a padded date window, with two new regression tests
- `useCalendarEvents(days)` widened to opt into the ranged fetch only when `days > 1`, leaving the default single-day path (and therefore Organize.tsx) byte-for-byte behaviorally unchanged
- Today.tsx now calls `useCalendarEvents(7)`, so `buildWeekAgenda`'s day-offset groups 1-6 can finally contain calendar events
- Verified end-to-end in the browser: a future event surfaced under the correct weekday in "Later this week", "Your day" stayed unchanged, and Organize's busy timeline stayed today-only

## Root Cause

`useCalendarEvents` fetched only `/api/v1/events/today`, which the backend filters strictly to today's date. `buildWeekAgenda` (in `frontend/src/lib/agenda.ts`) builds 7 day-groups (today + 6 future days) from that same single-day array, so only the offset-0 ("today") group could ever contain a matching event — offsets 1-6 ("Later this week") were structurally guaranteed to be empty of calendar events regardless of what was actually on the calendar.

## Task Commits

1. **Task 1: Add GET /events/range endpoint + tests** - `805bb67` (feat)
2. **Task 2: Widen useCalendarEvents to an opt-in multi-day window** - `fbc4428` (feat)
3. **Task 3: checkpoint:human-verify** - approved via manual browser verification (see below), no code commit

## Files Created/Modified
- `backend/app/routers/events.py` - Added `events_range` endpoint: parses `start` (defaults to today UTC), clamps `days` to 1-31, pads the query window by 1 day on each side, queries non-cancelled all-day (ISO string range) and timed (`start_dt` range) events; `events_today` left untouched
- `backend/tests/test_calendar.py` - Added `test_events_range_includes_future_events` and `test_events_range_excludes_out_of_window_and_cancelled`, using a seed/cleanup helper scoped to unique `google_id` prefixes so the shared test DB stays clean
- `frontend/src/hooks/useCalendarEvents.ts` - Added `days: number = 1` parameter; `days <= 1` keeps hitting `/api/v1/events/today` unchanged, `days > 1` fetches `/api/v1/events/range?start=<local-date-key>&days=<days>` built from local `Date` parts (not `toISOString`) to match `agenda.ts`'s local-timezone grouping; `days` added to the effect dependency array
- `frontend/src/pages/Today.tsx` - Changed the hook call from `useCalendarEvents()` to `useCalendarEvents(7)`

## Decisions Made
- Kept `/events/today` completely untouched instead of layering it on `/events/range`, so Organize.tsx's today-only busy timeline could not regress by construction — verified by leaving `Organize.tsx` unmodified per the plan's interface contract.
- Used local date parts (`${y}-${MM}-${dd}`) rather than `toISOString().slice(0,10)` for the `start` query param, because the latter is UTC and would compute the wrong calendar day near midnight in negative UTC-offset timezones.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None during implementation. During human verification, two pre-existing, unrelated issues were identified and logged to `deferred-items.md` (not fixed, out of scope per plan boundary):
- `frontend/src/lib/agenda.test.ts` has 2 pre-existing, timezone-dependent test failures confirmed present before this plan's changes (`agenda.ts` was not modified by this plan).
- `backend/tests/test_calendar.py::test_callback_stores_credentials` is a previously-flagged flake (Phase 16-01); it passed in the full-suite run performed during this plan (211/211).

## Human Verification (Task 3)

Verified live in the browser against the running dev servers:
- **Today page:** `[verify] Later this week test event` rendered under "FRI, JUL 24" in the "Later this week" column with a time shown (not under "All day"). "Your day" column was unchanged — 1 item, no future events leaked in.
- **Network:** the old `/today` request was replaced by `GET /api/v1/events/range?start=2026-07-21&days=7` → 200 OK, with `start` built from local date parts as required.
- **Organize page:** still calls `GET /api/v1/events/today` → 200; the busy timeline showed only today's blocks, and the 3-days-out verification event correctly did not appear.
- **Console:** no errors.

Post-verification cleanup performed:
- Deleted the synthetic verification row (`google_id=manual-verify-boy-1`) from `backend/secretary.db`; confirmed removed.
- Stopped the backend (127.0.0.1:8000) and frontend (127.0.0.1:5173) dev servers started for verification.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- "Later this week" is now functionally useful for planning ahead, not just a tasks-only view.
- Two pre-existing test issues remain logged in `deferred-items.md` for a future cleanup pass: the timezone-dependent `agenda.test.ts` failures and the `test_callback_stores_credentials` flake watch.

---
*Phase: quick-260721-boy*
*Completed: 2026-07-21*

## Self-Check: PASSED
- FOUND: .planning/quick/260721-boy-fix-later-this-week-section-missing-futu/260721-boy-SUMMARY.md
- FOUND: commit 805bb67
- FOUND: commit fbc4428
