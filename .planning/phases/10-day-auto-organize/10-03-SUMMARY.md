---
phase: 10-day-auto-organize
plan: 03
subsystem: api
tags: [fastapi, sqlalchemy, scheduling, router, async]

# Dependency graph
requires:
  - phase: 10-day-auto-organize
    plan: 01
    provides: "ScheduledBlock model; ProposedDayPlan/ApproveRequest/ScheduledBlockRead schemas; AppSettings work-hours columns"
  - phase: 10-day-auto-organize
    plan: 02
    provides: "planner_service.propose_day_plan pure proposer"
provides:
  - "Plan router (5 endpoints): GET /plan/propose, POST /plan/approve, POST /plan/replan, GET /plan/blocks, DELETE /plan/blocks/{id}"
  - "Helpers: _fetch_events_for_date, _is_stale, _write_blocks"
  - "plan.router registered in main.py"
affects: [10-04-plan-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Read-only propose handler: no session.add/commit/delete; loads ORM data and delegates to the pure planner"
    - "409 idempotency on naked approve; replan does delete-then-insert by date_key (D-08)"
    - "Per-block staleness computed on read via overlap check against timed events (D-13)"
    - "Work window read from AppSettings(id=1) with coalesce-to-9/0/18/0 when columns are None"

key-files:
  created:
    - backend/app/routers/plan.py
  modified:
    - backend/app/main.py

key-decisions:
  - "local_tz sourced from os.environ TZ defaulting UTC (rely on Pi system tz per RESEARCH §10) rather than a DB user_timezone setting"
  - "GET /propose and GET /blocks use Query(alias='date') string params parsed via date.fromisoformat for explicit ISO date handling"

patterns-established:
  - "Router loads ORM rows and passes them to the pure planner; the planner never touches the session"

requirements-completed: [PLAN-01, PLAN-02]

# Metrics
duration: ~8min
completed: 2026-06-17
---

# Phase 10 Plan 03: Day Auto-Organize Plan Router Summary

**Five async plan endpoints — read-only propose (delegates to the pure planner), 409-idempotent approve, delete-then-insert replan, staleness-annotated blocks read, and delete-by-id — turning the 5 remaining integration tests green and completing the backend half of PLAN-01/PLAN-02.**

## Performance

- **Duration:** ~8 min
- **Completed:** 2026-06-17
- **Tasks:** 1
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments
- `GET /plan/propose`: loads incomplete tasks + events-for-date + work window (AppSettings coalesced to defaults), calls `planner_service.propose_day_plan`, writes nothing.
- `POST /plan/approve`: writes ScheduledBlock rows; a second naked approve for the same date_key returns 409.
- `POST /plan/replan`: deletes existing blocks for date_key, then inserts the new set.
- `GET /plan/blocks`: returns blocks ordered by start_dt, each annotated with `conflict_with` (overlap-on-read staleness against timed events).
- `DELETE /plan/blocks/{id}`: removes a block, 404 if missing, 204 on success.
- Helpers `_fetch_events_for_date` (mirrors events.py date query), `_is_stale`, `_write_blocks`.
- `plan.router` registered in main.py.
- All 12 test_plan.py tests pass (7 unit + 5 integration); 119/120 of the full suite green (the one failure is a pre-existing, unrelated OAuth test).

## Task Commits

1. **Task 1: Implement plan router + helpers, register in main.py** - `efea597` (feat)

## Files Created/Modified
- `backend/app/routers/plan.py` - 5 plan endpoints + 3 helpers (created)
- `backend/app/main.py` - import `plan` router + `app.include_router(plan.router)` (modified)

## Decisions Made
- `local_tz` is read from `os.environ["TZ"]` (default "UTC"), relying on the Pi system timezone per RESEARCH §10, rather than introducing a DB-level `user_timezone` setting. This resolves the Phase 10 open question on the conservative side.
- Date query params use `Query(alias="date")` as strings parsed with `date.fromisoformat`, matching the test contract's `?date=YYYY-MM-DD`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- The optional `propose` smoke test in the plan's `<verification>` block (`TestClient(...).get('/api/v1/plan/propose')`) hits the real dev SQLite DB, which is at alembic revision 0005 and lacks columns from migrations 0006-0009 (`no such column: tasks.goal_id`). This is the same pre-existing unmigrated-dev-DB environment state documented in 10-01-SUMMARY, not a code defect — the test suite uses `Base.metadata.create_all` and all 12 test_plan.py tests pass. See Deferred Items.

## Deferred Items
- **Pre-existing test failure (out of scope):** `tests/test_calendar.py::test_callback_stores_credentials` returns 404 (expected 200/302/307). Verified to fail on a clean tree at commit 54dfa95 before any 10-03 change — it is an unrelated OAuth callback test, not touched per the executor scope boundary. Logged in `deferred-items.md`.
- **Dev/Pi DB migration:** local dev DB at revision 0005; migrations 0006-0009 unapplied. Run `alembic upgrade head` before the live app can serve `/plan/propose`. Carried from 10-01.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 10-04 (plan UI) can build the propose -> review -> approve/replan -> delete flow against the live `/plan/*` endpoints. Response shapes are fixed: `ProposedDayPlan` from propose; `list[ScheduledBlockRead]` (with `conflict_with`) from approve/replan/blocks.

## Self-Check: PASSED

`backend/app/routers/plan.py` present; `app.include_router(plan.router)` present in main.py; commit `efea597` verified in git log.

---
*Phase: 10-day-auto-organize*
*Completed: 2026-06-17*
