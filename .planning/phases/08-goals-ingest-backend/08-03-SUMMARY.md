---
phase: 08-goals-ingest-backend
plan: 03
subsystem: api
tags: [fastapi, sqlalchemy, pydantic, goals, milestones, progress, celebrations, pushover, tts]

requires:
  - phase: 08-02
    provides: Goal/Milestone ORM models, FK columns on Task/Routine, PRAGMA foreign_keys=ON, migrations 0006-0008
  - phase: 08-01
    provides: Wave 0 failing tests for goal endpoints (test_goals.py)

provides:
  - GoalCreate/GoalUpdate/GoalRead Pydantic schemas with live progress_pct and milestones list
  - MilestoneCreate/MilestoneUpdate/MilestoneRead schemas
  - compute_progress(goal_id, session) service: unified ratio (tasks+milestones), 0% when empty (D-01/D-02/D-03)
  - fire_milestone_celebration and fire_goal_celebration helpers reusing PushoverClient+TTSClient (D-10/D-11/D-12)
  - Goals CRUD router: list/create/get/patch with live progress_pct
  - Milestone CRUD sub-router: add/update with done-transition celebration guard
  - goals.router registered in main.py; Plan 04 appends ingest.router after

affects: [08-04, 09-goals-ingest-ui, 10-day-auto-organize]

tech-stack:
  added: []
  patterns:
    - "_to_read() helper builds GoalRead from ORM row + compute_progress result (avoids storing progress)"
    - "run_in_threadpool wraps sync celebrate functions in async route handlers (established in webhooks.py)"
    - "old_done / old_status captured before setattr loop to detect False->True transition (no double-celebration)"
    - "module-ref import (import ... as _tts_settings) for monkeypatch stability in tests"

key-files:
  created:
    - backend/app/schemas/goal.py
    - backend/app/services/goal_service.py
    - backend/app/services/celebrate.py
    - backend/app/routers/goals.py
  modified:
    - backend/app/main.py
    - backend/tests/test_goals.py

key-decisions:
  - "celebrate functions are SYNC (not async) — PushoverClient and TTSClient are sync; call via run_in_threadpool from async route"
  - "progress_pct is never stored; computed fresh on every read via two aggregate SQL queries (D-02)"
  - "GoalRead includes milestones list (selectinload-based) so milestone detail is co-loaded with progress in one request"
  - "GET /goals/ returns ALL goals including archived — no status filter (D-13 no hard delete)"
  - "Celebration guard: capture old_done/old_status before PATCH, fire only on False->True or active->completed transition"
  - "test_goals.py tests that trigger celebration without testing it need monkeypatch of fire_milestone_celebration (Rule 1 fix)"

patterns-established:
  - "Pattern: _to_read() async helper for schema construction from ORM + service data"
  - "Pattern: run_in_threadpool(celebrate.fire_*, arg1, arg2) for sync notification side-effects in async handlers"

requirements-completed: [GOAL-01, GOAL-02, GOAL-03, GOAL-06]

duration: 4min
completed: 2026-06-16
---

# Phase 08 Plan 03: Goals Router, Schemas, Progress Service, and Celebration Helper Summary

**Goals + Milestones CRUD API with live progress ratio (tasks+milestones unified), transition-gated celebrations via existing PushoverClient+TTSClient, and router registered in main.py**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-06-16T02:12:07Z
- **Completed:** 2026-06-16T02:15:53Z
- **Tasks:** 2
- **Files modified:** 6

## Accomplishments

- Created `schemas/goal.py` with full Create/Update/Read trio for Goal and Milestone; GoalRead carries live `progress_pct` and embedded `milestones` list
- Created `services/goal_service.py` with `compute_progress`: two aggregate SQL queries (Tasks + Milestones by goal_id), returns `{total, done, pct}`, 0% when no linked items (D-01/D-02/D-03)
- Created `services/celebrate.py` with `fire_milestone_celebration` and `fire_goal_celebration` — SYNC wrappers around PushoverClient+TTSClient with warm+specific copy (D-10/D-11/D-12); module-ref import for `_tts_settings` keeps monkeypatch target stable
- Created `routers/goals.py`: full Goals CRUD (list/create/get/patch) and Milestone sub-router (add/update); milestone and goal celebration fired via `run_in_threadpool` only on done/status transition
- Registered `goals.router` in `main.py` after webhooks.router
- All 10 GOAL-* Wave 0 tests pass; full suite 92/93 (1 pre-existing `test_callback_stores_credentials` failure unrelated to this plan)

## Task Commits

1. **Task 1: Goal/Milestone schemas, compute_progress, celebrate helper** - `92f0580` (feat)
2. **Task 2: Goals router + main.py registration + test fixes** - `1fb3f06` (feat)

## Files Created/Modified

- `backend/app/schemas/goal.py` - GoalCreate, GoalUpdate, GoalRead, MilestoneCreate, MilestoneUpdate, MilestoneRead
- `backend/app/services/goal_service.py` - compute_progress: two-aggregate-query progress ratio
- `backend/app/services/celebrate.py` - fire_milestone_celebration, fire_goal_celebration (sync, PushoverClient+TTSClient)
- `backend/app/routers/goals.py` - Goals+Milestones CRUD router with celebration triggers
- `backend/app/main.py` - Added goals import and goals.router include_router
- `backend/tests/test_goals.py` - Added monkeypatch for fire_milestone_celebration in 2 tests that trigger it incidentally

## Decisions Made

- `celebrate.py` functions are SYNC, not async — PushoverClient and TTSClient use sync `httpx.Client` and pychromecast; `run_in_threadpool` is the established project pattern (from `webhooks.py`)
- `progress_pct` is never stored on the Goal model — computed via two aggregate SQL queries on every read (D-02); `_to_read()` helper merges ORM fields + service result into `GoalRead`
- GET `/goals/` has no status filter — archived goals are returned alongside active/completed (D-13 no hard delete); `test_no_hard_delete` verifies this
- Celebration transition guard: `old_done = ms.done` and `old_status = goal.status` captured before the `setattr` loop; fires only on False→True or active→completed; `test_no_double_celebration` verifies idempotency

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added monkeypatch for fire_milestone_celebration in non-celebration tests**
- **Found during:** Task 2 (running test_goals.py)
- **Issue:** `test_progress_milestones_count` and `test_milestone_crud` both PATCH a milestone to `done=True`, which triggers our celebration handler. Without monkeypatching, the sync `PushoverClient().send()` makes a real HTTP call to Pushover API which fails with HTTP 400 (invalid API token in test env), crashing the test. The tests were written in Plan 01 to test progress/CRUD behavior and don't monkeypatch celebration since that's not what they test.
- **Fix:** Added `monkeypatch` parameter and `monkeypatch.setattr("app.services.celebrate.fire_milestone_celebration", lambda *a: None)` to both functions — same pattern as existing celebration tests
- **Files modified:** `backend/tests/test_goals.py`
- **Verification:** All 10 test_goals.py tests pass after fix
- **Committed in:** 1fb3f06 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - test bug from Plan 01 wave 0 stub)
**Impact on plan:** Minimal — test was correct in intent (test progress, not celebration) but needed the isolation guard for external service calls. No scope creep.

## Issues Encountered

- Worktree branched before master had Plan 02's commits (goal.py, models changes). Merged master at Task 1 start (fast-forward, no conflicts) to bring Goal/Milestone models in. Same pattern as Plan 02's deviation.
- Pre-existing `test_callback_stores_credentials` failure in test_calendar.py (unrelated Google OAuth callback test). Out of scope per deviation scope boundary rule.

## Known Stubs

None — goals router returns real DB data; progress_pct is computed live; no hardcoded empty values.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Goals CRUD and milestone CRUD fully operational; 10/10 GOAL-* tests green
- `app.services.celebrate` module exported with stable monkeypatch targets (`app.services.celebrate.fire_milestone_celebration`, `app.services.celebrate.fire_goal_celebration`)
- Plan 04 (ingest): add `from app.routers import ..., ingest` and `app.include_router(ingest.router)` after the `goals.router` line in `main.py`
- No blocker for Plan 04; ingest service can import Goal model directly from `app.models.goal`

---
*Phase: 08-goals-ingest-backend*
*Completed: 2026-06-16*
