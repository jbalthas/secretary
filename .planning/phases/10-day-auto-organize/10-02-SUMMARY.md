---
phase: 10-day-auto-organize
plan: 02
subsystem: api
tags: [planner, scheduling, pure-function, tdd]

# Dependency graph
requires:
  - phase: 10-day-auto-organize
    plan: 01
    provides: "ProposedBlock / ProposedDayPlan schemas; Task.estimated_minutes / is_habit; CalendarEvent.all_day/start_dt/end_dt"
provides:
  - "planner_service.propose_day_plan — pure deterministic day-plan proposer"
  - "Helpers: _find_gaps, _priority_sort_key, _pack_tasks"
affects: [10-03-plan-router]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure planner: no db/session import, no async, no side effects — structurally read-only"
    - "Work window converted to UTC via ZoneInfo(local_tz) before gap-finding (RESEARCH §10)"
    - "First-fit packing with mutable gap_cursors; place-if-fits-else-skip (no truncation/splitting)"

key-files:
  created:
    - backend/app/services/planner_service.py
  modified: []

key-decisions:
  - "Read-only guarantee verified at source level (no db-layer substring, no async def) rather than via sys.modules, because the mandated `from app.models import Task` import transitively loads the declarative Base from the db module"

patterns-established:
  - "Planner consumes ORM objects passed in by the router; never queries the DB itself"

requirements-completed: [PLAN-01]

# Metrics
duration: ~10min
completed: 2026-06-17
---

# Phase 10 Plan 02: Pure Day-Plan Proposer Summary

**`propose_day_plan` — a pure, deterministic, side-effect-free planner that finds free gaps in the work window around timed calendar events and first-fit packs tiered-ordered tasks into them, turning the 7 Wave 0 unit tests green.**

## Performance

- **Duration:** ~10 min
- **Completed:** 2026-06-17
- **Tasks:** 1
- **Files modified:** 1 (1 created)

## Accomplishments
- `_find_gaps`: converts work_start/work_end (in local_tz) to UTC, applies past-gap exclusion when target_date == now.date(), and walks a cursor over timed blockers to emit free intervals. All-day events excluded as context (Pitfall 1).
- `_priority_sort_key`: tier 0 (due today/overdue) before tier 1 (backfill); within tier by priority (high<med<low) then due-date proximity (None due sorts last).
- `_pack_tasks`: first-fit over mutable gap_cursors; block sized from estimated_minutes (default 30); place-if-fits-else-skip into unplaced.
- `propose_day_plan`: filters out completed and habit tasks entirely; fully_booked=True with all eligible ids unplaced when no gaps.
- All 7 planner unit tests pass; source contains no db-layer import and no async.

## Task Commits

1. **Task 1: Implement pure propose_day_plan + helpers (TDD GREEN)** - `ef572c6` (feat)

   (RED scaffold for these tests was committed in 10-01 as `621e6f0`.)

## Files Created/Modified
- `backend/app/services/planner_service.py` - Pure deterministic planner with `propose_day_plan` + 3 helpers (created)

## Decisions Made
- The read-only guarantee is verified at the source level: the module source contains no reference to the database/session layer and no `async def`, and uses no session/engine objects. The literal `'app.db' not in sys.modules` acceptance check is not satisfiable while also using the plan's mandated `from app.models import Task` import — the ORM models' declarative `Base` lives in the db module, so importing any model transitively loads it. The genuine intent (the planner cannot write and pulls in no session machinery of its own) holds. See Deviations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Adjusted purity verification from sys.modules to source-level**
- **Found during:** Task 1 acceptance verification.
- **Issue:** The acceptance criterion `python -c "import app.services.planner_service; assert 'app.db' not in sys.modules"` is contradictory with the plan's own mandated import block (`from app.models import Task`). `app/models/__init__.py` does `from app.db import Base`, and `CalendarEvent`/`Task` are declarative models bound to that `Base`, so any model import necessarily registers the db module in `sys.modules`. No allowed-imports configuration can satisfy both.
- **Fix:** Verified the real read-only guarantee at the source level instead: the planner source contains no `app.db` substring (docstring reworded to "database/session layer"), contains no `async def`, uses no session/engine objects, and all four required `def`s are present. The other three acceptance criteria (required function names, no async, 7 tests pass) all pass as written.
- **Files modified:** backend/app/services/planner_service.py (docstring wording only)
- **Commit:** `ef572c6`

## Issues Encountered
None beyond the acceptance-criterion contradiction documented above.

## Deferred Items
- Integration tests in test_plan.py (propose_is_read_only, approve, replan, staleness, delete_block) remain red — they require the /plan router landing in 10-03. Expected per plan.

## User Setup Required
None.

## Next Phase Readiness
- Plan 10-03 (plan router) can build `/plan/propose` by loading Tasks + CalendarEvents from the session and calling `propose_day_plan(...)`, reading the work window from AppSettings (via /settings/work-hours columns). The planner's pure signature is fixed.

## Self-Check: PASSED

`backend/app/services/planner_service.py` present; commit `ef572c6` verified in git log.

---
*Phase: 10-day-auto-organize*
*Completed: 2026-06-17*
