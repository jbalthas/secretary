# Deferred Items — quick-260721-boy

## Pre-existing frontend test failures (out of scope)

`frontend/src/lib/agenda.test.ts` has 2 pre-existing failures, confirmed present on
the pre-change commit (`fbc4428`'s parent) via `git stash` before/after comparison:

- `buildAgenda > places a timed task (10:30) between standup (09:00) and lunch (12:00)`
- `buildAgenda > maps calendar event to AgendaItem with isEvent:true and no priority`

Both assert on local-time formatting of fixed UTC timestamps in the test fixtures and
appear to be timezone-dependent (fail on this dev machine's local timezone, likely pass
in whatever timezone the fixtures were authored in). `frontend/src/lib/agenda.ts` was
not modified by this plan. Not fixed — out of scope per plan boundary
("agenda.test.ts unaffected — agenda.ts is not modified").

## Backend

`backend/tests/test_calendar.py::test_callback_stores_credentials` — flagged as a
known pre-existing flake in prior deferred-items.md entries (Phase 16-01). Full backend
suite (`uv run python -m pytest -q`) passed 211/211 in this run, including that test, so
no action needed here.
