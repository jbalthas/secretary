---
phase: 10-day-auto-organize
plan: 01
subsystem: api
tags: [fastapi, sqlalchemy, alembic, pydantic, tdd, scheduling]

# Dependency graph
requires:
  - phase: 07-outlook-ics
    provides: UtcDateTime TypeDecorator for tz-aware SQLite datetime columns
  - phase: 08-goals-ingest-backend
    provides: Task.estimated_minutes, Task.is_habit, migration chain through 0008
provides:
  - "ScheduledBlock ORM model (scheduled_blocks table)"
  - "Plan API Pydantic contracts: ProposedBlock, ProposedDayPlan, ApproveRequest, ScheduledBlockRead"
  - "AppSettings work-window columns + GET/PUT /settings/work-hours"
  - "Migration 0009 (scheduled_blocks + app_settings work columns)"
  - "Wave 0 red test scaffold (12 tests) encoding planner + plan-endpoint behavior"
affects: [10-02-planner-service, 10-03-plan-router, 10-04-plan-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Wave 0 TDD: deferred service import inside unit test bodies keeps suite collectable before service exists"
    - "UtcDateTime decorator reused for all new tz-aware datetime columns (start_dt/end_dt/approved_at)"
    - "Nullable work-hours columns in migration (no server_default) to avoid NOT NULL failure on existing app_settings row id=1"

key-files:
  created:
    - backend/app/models/plan.py
    - backend/app/schemas/plan.py
    - backend/migrations/versions/0009_create_scheduled_blocks.py
    - backend/tests/test_plan.py
  modified:
    - backend/app/models/__init__.py
    - backend/app/schemas/settings.py
    - backend/app/routers/settings.py

key-decisions:
  - "Work hours exposed as HH:MM strings in the API (WorkHoursRead/Update) while persisted as four integer columns"
  - "set_work_hours does NOT touch the scheduler (unlike set_brief_time) — work window has no scheduled job"

patterns-established:
  - "Plan API contracts defined before service/router so downstream waves build against fixed field shapes"

requirements-completed: [PLAN-01, PLAN-02]

# Metrics
duration: ~15min
completed: 2026-06-17
---

# Phase 10 Plan 01: Day Auto-Organize Contracts & Persistence Foundation Summary

**ScheduledBlock model, plan API Pydantic contracts, AppSettings work-window + /settings/work-hours endpoints, migration 0009, and a 12-test red Wave 0 scaffold that pins planner + plan-endpoint behavior.**

## Performance

- **Duration:** ~15 min (resumed from interrupted attempt)
- **Completed:** 2026-06-17
- **Tasks:** 3 (Task 1 pre-committed; Tasks 2-3 completed this session)
- **Files modified:** 7 (4 created, 3 modified)

## Accomplishments
- ScheduledBlock ORM model using UtcDateTime for all datetime columns, registered on app.models
- ProposedBlock / ProposedDayPlan / ApproveRequest / ScheduledBlockRead schemas (with conflict_with for staleness reporting)
- Migration 0009 chains off 0008: creates scheduled_blocks + index, adds four nullable work-hours columns to app_settings
- AppSettings work_start/end_hour/minute columns (defaults 9/0/18/0) + GET/PUT /settings/work-hours round-trip verified
- 12-test Wave 0 scaffold confirmed collectable and red (planner_service + plan router land in 10-02/10-03)

## Task Commits

1. **Task 1: Wave 0 test scaffold (test_plan.py, 12 red tests)** - `621e6f0` (test) — pre-committed before this session
2. **Task 2: ScheduledBlock model + plan schemas + migration 0009** - `77211a7` (feat)
3. **Task 3: AppSettings work-hours columns + /settings/work-hours endpoints** - `b8fd12b` (feat)

## Files Created/Modified
- `backend/app/models/plan.py` - ScheduledBlock ORM model (created)
- `backend/app/schemas/plan.py` - Plan API Pydantic contracts (created)
- `backend/migrations/versions/0009_create_scheduled_blocks.py` - scheduled_blocks table + app_settings work columns (created)
- `backend/tests/test_plan.py` - 12-test Wave 0 scaffold (created, pre-committed in Task 1)
- `backend/app/models/__init__.py` - ScheduledBlock import + AppSettings work columns (modified)
- `backend/app/schemas/settings.py` - WorkHoursRead/WorkHoursUpdate (modified)
- `backend/app/routers/settings.py` - GET/PUT /settings/work-hours (modified)

## Decisions Made
- Work hours exposed as HH:MM strings via WorkHoursRead/Update; persisted as four integer columns mirroring brief_hour/minute.
- set_work_hours intentionally does not call any scheduler function (work window has no APScheduler job, unlike brief time).
- Work-hours columns added as nullable in migration 0009 (no server_default) per RESEARCH Pitfall 2; router reads coalesce to 9/0/18/0 defaults when None.

## Deviations from Plan

None - plan executed exactly as written. The pre-existing uncommitted artifacts (plan.py, schemas/plan.py, migration 0009, models/__init__.py plan import) from the interrupted attempt were verified against the plan spec, found correct, and committed as Task 2.

## Issues Encountered
- The Task 3 verify command (`python -c "...TestClient..."`) connects to the real dev SQLite DB, which is at alembic revision 0005 and lacks the 0006-0009 schema changes. The verify failed with `no such column: app_settings.work_start_hour`. This is a pre-existing environment state (dev DB never upgraded past 0005; migrations 0006-0009 from Phases 8-10 are unapplied), NOT a code defect. Verified Task 3 against a fresh create_all DB instead — round-trip passed (`ok`). The test suite (test_settings.py) uses create_all and is green. See Deferred Items.

## Deferred Items
- **Dev/Pi DB migration:** local dev SQLite DB is at revision 0005; migrations 0006 (goals), 0007 (task FK + estimated_minutes), 0008 (routine FK), 0009 (scheduled_blocks) are unapplied. Running `alembic upgrade head` on the dev/Pi DB is required before the live app can read the new columns. Out of scope for this Wave 0 contracts plan (test DB uses Base.metadata.create_all, not alembic).
- **frontend/src/lib/agenda.ts:** carries an unrelated uncommitted change present at session start; left untouched (out of scope for this backend plan).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Plan 10-02 (pure planner service) can build `propose_day_plan` against the fixed ProposedDayPlan/ProposedBlock schemas; the 7 unit tests in test_plan.py pin its behavior.
- Plan 10-03 (plan router) can build /plan/propose, /approve, /replan, /blocks against ScheduledBlock + ApproveRequest/ScheduledBlockRead; the 5 integration tests pin endpoint behavior.
- Work window is persisted and editable; planner can read it via /settings/work-hours or directly from AppSettings.

## Self-Check: PASSED

All created/modified files present; all three task commits (621e6f0, 77211a7, b8fd12b) verified in git log.

---
*Phase: 10-day-auto-organize*
*Completed: 2026-06-17*
