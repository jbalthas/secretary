---
phase: 17-task-subtask-hierarchy-drag-drop
plan: 01
subsystem: api
tags: [fastapi, sqlalchemy, alembic, sqlite, pydantic]

requires: []
provides:
  - "Task.parent_task_id and ScheduledBlock.parent_task_id nullable FK columns (migration 0020)"
  - "app.services.task_hierarchy module: get_valid_parent_task(), assert_task_has_no_children()"
  - "One-level task/subtask nesting validated at the router layer for both Task and ScheduledBlock"
  - "Delete-cascade for parent_task_id enforced explicitly in delete_task (not reliant on SQLite FK pragma)"
affects: [17-02, 17-04, 17-05]

tech-stack:
  added: []
  patterns:
    - "Shared hierarchy validation service (task_hierarchy.py) reused by both tasks.py and plan.py routers"
    - "exclude_unset=True PATCH pattern extended to ScheduledBlockUpdate to allow partial updates without requiring completed"

key-files:
  created:
    - backend/migrations/versions/0020_add_parent_task_id.py
    - backend/app/services/task_hierarchy.py
  modified:
    - backend/app/models/__init__.py
    - backend/app/models/plan.py
    - backend/app/schemas/task.py
    - backend/app/schemas/plan.py
    - backend/app/routers/tasks.py
    - backend/app/routers/plan.py
    - backend/tests/test_tasks.py
    - backend/tests/test_plan.py

key-decisions:
  - "No ORM relationship() added for parent_task_id on either Task or ScheduledBlock - matches existing flat-list client-side grouping pattern (goal_id, parent_list_name)"
  - "Delete-cascade for children's parent_task_id is explicit in delete_task() via sa_update, since the test DB engine does not have PRAGMA foreign_keys=ON active (separate Engine instance from app/db.py's connect-listener)"
  - "ScheduledBlock can never itself be a parent (D-05) - only get_valid_parent_task (parent-must-be-root-task) is applied in plan.py, no assert_task_has_no_children check"

patterns-established:
  - "task_hierarchy.py as the single source of truth for one-level nesting validation, imported by both tasks.py and plan.py routers"

requirements-completed: [HIER-01, HIER-03, HIER-05]

duration: 12min
completed: 2026-07-07
---

# Phase 17 Plan 01: Task/Subtask Hierarchy Backend Summary

**Self-referencing `parent_task_id` FK on Task and ScheduledBlock, with application-level one-level-nesting enforcement via a shared `task_hierarchy` validation service (SQLite CHECK constraints cannot express this rule).**

## Performance

- **Duration:** 12 min
- **Started:** 2026-07-07T20:23:00Z
- **Completed:** 2026-07-07T20:35:00Z
- **Tasks:** 3
- **Files modified:** 9 (2 created, 7 modified)

## Accomplishments
- Migration 0020 adds `parent_task_id` (nullable FK, `ondelete=SET NULL`) to both `tasks` and `scheduled_blocks`, verified to upgrade/downgrade/upgrade cleanly
- One-level nesting (D-01) enforced in `create_task`/`update_task` (tasks.py) and `update_block` (plan.py) via shared `app/services/task_hierarchy.py` helpers
- Completing a parent never completes its children and vice versa (no completion propagation across the hierarchy)
- Deleting a parent task explicitly clears `parent_task_id` on both `Task` and `ScheduledBlock` children (bypasses the inactive test-DB FK pragma)
- `ScheduledBlockUpdate` widened from a single mandatory `completed: bool` to optional `completed`/`parent_task_id` fields with `exclude_unset=True` semantics, so a parent-only PATCH no longer requires `completed`

## Task Commits

Each task was committed atomically:

1. **Task 1: Migration 0020 + Task/ScheduledBlock model columns** - `315e8e5` (feat)
2. **Task 2: Task-side nesting validation** - `60569b2` (test, RED) + `123304a` (feat, GREEN)
3. **Task 3: ScheduledBlock-side nesting** - `0ec3bdc` (test, RED) + `52725f8` (feat, GREEN)

_TDD tasks: test → feat, no refactor step needed._

## Files Created/Modified
- `backend/migrations/versions/0020_add_parent_task_id.py` - Alembic migration adding `parent_task_id` FK + index to `tasks`, FK to `scheduled_blocks`
- `backend/app/models/__init__.py` - `Task.parent_task_id` scalar FK column (no relationship)
- `backend/app/models/plan.py` - `ScheduledBlock.parent_task_id` scalar FK column (no relationship)
- `backend/app/services/task_hierarchy.py` - `get_valid_parent_task()`, `assert_task_has_no_children()` shared validation helpers
- `backend/app/schemas/task.py` - `parent_task_id` added to `TaskCreate` (inherited by `TaskUpdate`/`TaskRead`)
- `backend/app/schemas/plan.py` - `parent_task_id` added to `ScheduledBlockRead`; `ScheduledBlockUpdate` widened (both fields optional)
- `backend/app/routers/tasks.py` - `create_task`/`update_task` validate nesting; `delete_task` clears children's `parent_task_id` on both `Task` and `ScheduledBlock`
- `backend/app/routers/plan.py` - `update_block` rewritten with `exclude_unset=True`; validates `parent_task_id` via `get_valid_parent_task`
- `backend/tests/test_tasks.py` - 4 new tests (nest-under-child rejected, nest-with-children rejected, no completion propagation, delete clears children)
- `backend/tests/test_plan.py` - 2 new tests (PATCH set/clear parent_task_id + persistence, reject nesting under non-root task)

## Decisions Made
- No `relationship()` added for `parent_task_id` on either model — consistent with the codebase's established flat-list client-side grouping pattern and avoids self-referential eager-loading complexity
- Delete-cascade for children implemented explicitly at the router layer (not relying on the SQLite FK pragma, which is inactive in the test suite due to a separate test `Engine` instance)
- `ScheduledBlock` cannot itself be a parent (D-05) — only `get_valid_parent_task` (root-task check) applies in `plan.py`, no `assert_task_has_no_children` check needed there

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None specific to this plan's files. Full backend suite run confirmed 4 pre-existing failures + 1 pre-existing error (`test_brief.py` x2, `test_calendar.py::test_callback_stores_credentials`, `test_plan.py::test_staleness_detection`, `test_weekly_brief.py::test_webhook_range_invalid_value`) exist identically at the pre-plan baseline commit (`ce93d2a`) via a side-by-side worktree comparison — confirmed unrelated to this plan's changes, consistent with prior phases' documented pre-existing test-infra flakiness (see STATE.md Phase 16-01/16-03 notes).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Backend API contract for one-level task/subtask nesting is stable and tested; ready for Plans 17-02/17-04/17-05 to build the drag-and-drop nesting UI against it
- `parent_task_id` round-trips on `TaskRead` and `ScheduledBlockRead` for frontend consumption

---
*Phase: 17-task-subtask-hierarchy-drag-drop*
*Completed: 2026-07-07*

## Self-Check: PASSED

All 10 claimed files found on disk; all 5 task commit hashes (`315e8e5`, `60569b2`, `123304a`, `0ec3bdc`, `52725f8`) found in git history.
